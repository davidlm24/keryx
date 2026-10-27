// delete-account — serves entities.User.delete() from the Settings page.
//
// Removing an auth user needs the service role, which must never reach the
// browser, so it happens here. The caller's JWT (verified by the gateway)
// identifies the account; a user can only delete themselves. The profile row
// goes with it via ON DELETE CASCADE.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!url || !serviceKey) return json({ error: "Função mal configurada." }, 500);
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado." }, 401);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

  const { data: { user }, error: userError } = await admin.auth.getUser(authHeader.slice("Bearer ".length));
  if (userError || !user) return json({ error: "Sessão inválida." }, 401);

  const { error } = await admin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("delete-account:", error);
    return json({ error: "Não foi possível eliminar a conta." }, 500);
  }
  return json({ success: true });
});
