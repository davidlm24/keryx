// invoke-llm — serves integrations.Core.InvokeLLM for the app.
//
// Request body (same contract the pages used on Base44):
//   { prompt: string,
//     add_context_from_internet?: boolean,   // lets the model search and fetch the web
//     response_json_schema?: object }        // when set, the reply is parsed JSON
// Response: { result: object | string }
//
// Requires the ANTHROPIC_API_KEY secret. ANTHROPIC_MODEL overrides the model.
// JWT verification is on, so only signed-in users can spend tokens.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Anthropic from "npm:@anthropic-ai/sdk";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-opus-5-5";

const SYSTEM = [
  "You help operate a church worship projection app (KERYX). Answer in the",
  "language of the prompt, which is normally European Portuguese. When asked",
  "for a Bible passage, reproduce the requested translation faithfully and do",
  "not paraphrase. When asked to extract song lyrics, keep the original stanza",
  "and chorus structure. Return only what was asked for.",
].join(" ");

// supabase.functions.invoke sends a preflight (custom auth headers); answer it,
// and echo the CORS headers on every response or the browser drops the body.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Connection": "keep-alive" },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return json({ error: "ANTHROPIC_API_KEY não está configurada no projeto Supabase." }, 500);
  }

  let body: { prompt?: string; add_context_from_internet?: boolean; response_json_schema?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Corpo do pedido inválido." }, 400);
  }
  if (!body.prompt || typeof body.prompt !== "string") {
    return json({ error: "`prompt` é obrigatório." }, 400);
  }

  const client = new Anthropic({ apiKey });

  const tools = body.add_context_from_internet
    ? [
        { type: "web_search_20260209" as const, name: "web_search" as const, max_uses: 5 },
        { type: "web_fetch_20260209" as const, name: "web_fetch" as const, max_uses: 3 },
      ]
    : undefined;

  const outputConfig = body.response_json_schema
    ? { effort: "medium" as const, format: { type: "json_schema" as const, schema: body.response_json_schema } }
    : { effort: "medium" as const };

  try {
    let response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      messages: [{ role: "user", content: body.prompt }],
      tools,
      output_config: outputConfig,
      // A policy decline is re-run on a fallback model inside the same call.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    });

    // Server tools can pause a long turn; resume a bounded number of times.
    for (let i = 0; i < 4 && response.stop_reason === "pause_turn"; i++) {
      response = await client.beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        messages: [
          { role: "user", content: body.prompt },
          { role: "assistant", content: response.content },
        ],
        tools,
        output_config: outputConfig,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      });
    }

    if (response.stop_reason === "refusal") {
      return json({ error: "O modelo recusou este pedido." }, 422);
    }

    const text = response.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("")
      .trim();

    if (!body.response_json_schema) return json({ result: text });

    try {
      return json({ result: JSON.parse(text) });
    } catch {
      return json({ error: "A resposta do modelo não era JSON válido.", raw: text }, 502);
    }
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "Limite de pedidos à IA atingido. Tenta novamente daqui a pouco." }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: "Chave da API Anthropic inválida." }, 500);
    }
    if (err instanceof Anthropic.APIError) {
      return json({ error: `Erro da API Anthropic (${err.status}): ${err.message}` }, 502);
    }
    console.error("invoke-llm:", err);
    return json({ error: "Falha inesperada ao contactar a IA." }, 500);
  }
});
