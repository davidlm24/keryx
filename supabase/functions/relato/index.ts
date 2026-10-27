// relato — Relatar um problema (owner 2026-10-20): the desktop app's reports
// arrive here, with no e-mail and no sign-in.
//
// Deploy with verify_jwt = false: the app has no account and ships no key.
// POST multipart/form-data:
//   report  JSON { id (uuid, the app's), writtenAt, church, version, os,
//                  install, text, doing, contact }
//   diag    the diagnostic zip (optional, at most 5 MB)
// Answers (electron/reportQueue.cjs reads them):
//   200 { id, code }           saved (also when that id was saved before)
//   400 { code: "invalid" }    413 { code: "too_big" }    429 { code: "rate" }
//   anything else: try again later (the app keeps it in its queue).
// It never answers with a report: the table and the bucket have no policies.
//
// Optional notice to the owner (mark 4): with the secrets RESEND_API_KEY and
// REPORT_NOTIFY_TO set, each new report also goes by e-mail (Resend). Without
// them, or when Resend fails, the report is still saved.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const MAX_TEXT = 4000;
const MAX_ZIP = 5 * 1024 * 1024;
const PER_DAY = 10;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Crockford's base32, no I L O U: the same as shared/support.mjs reportCode.
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

function reportCode(id: string) {
  const n = parseInt(id.replace(/-/g, "").slice(0, 5), 16);
  let out = "";
  for (let i = 3; i >= 0; i--) out += ALPHABET[(n >> (i * 5)) & 31];
  return `R-${out}`;
}

async function notify(row: Record<string, unknown>) {
  const key = Deno.env.get("RESEND_API_KEY");
  const to = Deno.env.get("REPORT_NOTIFY_TO");
  if (!key || !to) return;
  const lines = [
    `Relato ${row.code}`,
    [row.church, row.version ? `KERYX ${row.version}` : "", row.os].filter(Boolean).join(" · "),
    "",
    "O que aconteceu:",
    String(row.text),
    ...(row.doing ? ["", "O que estava fazendo:", String(row.doing)] : []),
    ...(row.contact ? ["", `Contato: ${row.contact}`] : []),
    "",
    row.diag_path ? `Diagnóstico: bucket relatos/${row.diag_path}` : "Sem diagnóstico.",
  ];
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: Deno.env.get("REPORT_NOTIFY_FROM") || "KERYX <onboarding@resend.dev>",
        to: [to],
        subject: `KERYX ${row.version || ""} · relato ${row.code}`.replace(/\s+/g, " "),
        text: lines.join("\n"),
      }),
    });
    if (!res.ok) console.error("relato: aviso por e-mail", res.status, await res.text());
  } catch (err) {
    console.error("relato: aviso por e-mail", err);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ code: "invalid" }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) return json({ error: "Função mal configurada." }, 500);
  if (Number(req.headers.get("content-length") || 0) > MAX_ZIP + 64 * 1024) return json({ code: "too_big" }, 413);

  let form: FormData;
  try { form = await req.formData(); } catch { return json({ code: "invalid" }, 400); }
  let report: Record<string, unknown>;
  try { report = JSON.parse(String(form.get("report") || "")); } catch { return json({ code: "invalid" }, 400); }
  const id = str(report.id, 36).toLowerCase();
  const text = str(report.text, MAX_TEXT);
  if (!UUID.test(id) || !text) return json({ code: "invalid" }, 400);
  const diag = form.get("diag");
  const zip = diag instanceof File && diag.size > 0 ? diag : null;
  if (zip && zip.size > MAX_ZIP) return json({ code: "too_big" }, 413);

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const code = reportCode(id);

  // A resend of a report already saved (the app lost the answer): the same answer.
  const { data: known } = await admin.from("problem_reports").select("id").eq("id", id).maybeSingle();
  if (known) return json({ id, code });

  const install = str(report.install, 64);
  if (install) {
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await admin.from("problem_reports").select("id", { count: "exact", head: true })
      .eq("install_id", install).gte("received_at", since);
    if ((count ?? 0) >= PER_DAY) return json({ code: "rate" }, 429);
  }

  let diagPath: string | null = null;
  if (zip) {
    const bytes = new Uint8Array(await zip.arrayBuffer());
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) return json({ code: "invalid" }, 400);
    diagPath = `${id}.zip`;
    const { error } = await admin.storage.from("relatos").upload(diagPath, bytes, { contentType: "application/zip", upsert: true });
    if (error) { console.error("relato: zip", error); return json({ error: "Não deu para guardar o diagnóstico." }, 500); }
  }

  const written = str(report.writtenAt, 40);
  const row = {
    id, code,
    written_at: written && !Number.isNaN(Date.parse(written)) ? written : null,
    church: str(report.church, 120) || null,
    version: str(report.version, 40) || null,
    os: str(report.os, 120) || null,
    install_id: install || null,
    text,
    doing: str(report.doing, MAX_TEXT) || null,
    contact: str(report.contact, 200) || null,
    diag_path: diagPath,
  };
  const { error } = await admin.from("problem_reports").insert(row);
  if (error && error.code !== "23505") { console.error("relato:", error); return json({ error: "Não deu para guardar o relato." }, 500); }
  if (!error) await notify(row);
  return json({ id, code });
});
