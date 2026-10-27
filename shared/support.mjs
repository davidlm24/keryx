// Relatar um problema (Rodada N3, owner 2026-10-20): where a report goes and
// what the e-mail says. A report goes over the internet to REPORT_URL (the
// Supabase Edge Function supabase/functions/relato; electron/reportQueue.cjs
// sends it and keeps it while the computer is offline); the e-mail is the
// reserve. The main process builds the mailto from this (it is the one that
// opens it, electron/system.cjs `reportMail`); the console uses it too, to
// show the address and the text when no e-mail program opens and in the
// browser preview. One address, one place to change it.

export const SUPPORT_EMAIL = "davigoncalves207@gmail.com";

// The function takes no key (deployed with verify_jwt off): nothing secret
// ships in the app.
export const REPORT_URL = "https://rgldwchaozsjkrfycdtr.supabase.co/functions/v1/relato";

// How long the dialog waits for the first try before the report goes to the
// queue, and how often the queue tries again.
export const REPORT_WAIT_MS = 8000;
export const REPORT_RETRY_MS = 10 * 60 * 1000;
// A report still unsent after this many days leaves the queue (the log keeps it).
export const REPORT_KEEP_DAYS = 30;

// Crockford's base32 (no I L O U): the same in supabase/functions/relato.
const CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

// "R-7K2Q": the short name of a report, from its uuid (the first 20 bits),
// for the church and support to speak of the same one.
export function reportCode(id) {
    const n = parseInt(String(id || "").replace(/-/g, "").slice(0, 5), 16);
    if (!Number.isFinite(n)) return "";
    let out = "";
    for (let i = 3; i >= 0; i--) out += CODE_ALPHABET[(n >> (i * 5)) & 31];
    return `R-${out}`;
}

// What an answer of the function means for the report: "sent" (2xx),
// "refused" (it will never take this one: invalid, too big, the day's limit
// — the dialog offers the e-mail) or "queued" (anything else, and no answer:
// try again later). `reason` is the function's code.
export function reportOutcome(status, body) {
    if (status >= 200 && status < 300) return { status: "sent", code: body?.code || "" };
    if (status === 400 || status === 413 || status === 429) return { status: "refused", reason: body?.code || (status === 413 ? "too_big" : status === 429 ? "rate" : "invalid") };
    return { status: "queued" };
}

// A mailto longer than this is cut by some mail programs (Outlook, the
// Windows handler): the whole href stays under it.
export const MAIL_MAX = 1800;

const cut = (s, n) => {
    const chars = Array.from(s);
    return chars.length <= n ? s : `${chars.slice(0, Math.max(0, n)).join("").trimEnd()}…`;
};

// Configurações › Dados › Suporte's "Relatos na fila" (the queue's list):
// "1 esperando internet", "2 esperando internet · 1 recusado"; "" = none.
export function queueSummary(list = []) {
    const refused = list.filter((r) => r.refused).length;
    const waiting = list.length - refused;
    return [waiting ? `${waiting} esperando internet` : "", refused ? `${refused} ${refused === 1 ? "recusado" : "recusados"}: mande por e-mail` : ""].filter(Boolean).join(" · ");
}

function bodyOf({ text, doing, contact, church, version, os, file }) {
    const parts = [`O que aconteceu:\n${text}`];
    if (doing) parts.push(`O que eu estava fazendo:\n${doing}`);
    if (contact) parts.push(`Contato: ${contact}`);
    const who = [church, version ? `KERYX ${version}` : "KERYX", os].filter(Boolean).join(" · ");
    parts.push(file ? `${who}\nAnexe o arquivo ${file} (já salvo em Downloads).` : who);
    return parts.join("\n\n");
}

const hrefOf = (subject, body) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// { subject, body, href } for the report. `file` is the diagnostic's name
// (no folder), or empty when it was not included. What the operator wrote is
// cut with "…" (what they were doing first, then what happened) until the
// encoded link fits MAIL_MAX; the line about the file always stays.
export function reportMail({ text = "", doing = "", contact = "", church = "", version = "", os = "", file = "", code = "" } = {}) {
    const subject = `${version ? `KERYX ${version}` : "KERYX"} · problema${code ? ` ${code}` : ""}`;
    let t = String(text || "").trim();
    let d = String(doing || "").trim();
    const fields = { contact: String(contact || "").trim().slice(0, 200), church: String(church || "").trim(), version, os, file: file ? String(file).split(/[\\/]/).pop() : "" };
    const fits = (tt, dd) => hrefOf(subject, bodyOf({ ...fields, text: tt, doing: dd })).length <= MAIL_MAX;
    // The longest prefix of `s` (in characters) that still fits.
    const longest = (s, test) => {
        let lo = 0;
        let hi = Array.from(s).length;
        while (lo < hi) {
            const mid = Math.ceil((lo + hi) / 2);
            if (test(cut(s, mid))) lo = mid;
            else hi = mid - 1;
        }
        return cut(s, lo);
    };
    if (!fits(t, d)) {
        d = longest(d, (dd) => fits(t, dd) || !dd || dd === "…");
        if (d === "…") d = "";
        if (!fits(t, d)) t = longest(t, (tt) => fits(tt, d));
    }
    const body = bodyOf({ ...fields, text: t, doing: d });
    return { subject, body, href: hrefOf(subject, body) };
}
