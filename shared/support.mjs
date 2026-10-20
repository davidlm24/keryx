// Relatar um problema (Rodada N3, owner 2026-10-20): where a report goes and
// what the e-mail says. The main process builds the mailto from this (it is
// the one that opens it, electron/system.cjs `report`); the console uses it
// too, to show the address and the text when no e-mail program opens and in
// the browser preview. One address, one place to change it.

export const SUPPORT_EMAIL = "davigoncalves207@gmail.com";

// A mailto longer than this is cut by some mail programs (Outlook, the
// Windows handler): the whole href stays under it.
export const MAIL_MAX = 1800;

const cut = (s, n) => {
    const chars = Array.from(s);
    return chars.length <= n ? s : `${chars.slice(0, Math.max(0, n)).join("").trimEnd()}…`;
};

function bodyOf({ text, doing, church, version, os, file }) {
    const parts = [`O que aconteceu:\n${text}`];
    if (doing) parts.push(`O que eu estava fazendo:\n${doing}`);
    const who = [church, version ? `KERYX ${version}` : "KERYX", os].filter(Boolean).join(" · ");
    parts.push(file ? `${who}\nAnexe o arquivo ${file} (já salvo em Downloads).` : who);
    return parts.join("\n\n");
}

const hrefOf = (subject, body) => `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

// { subject, body, href } for the report. `file` is the diagnostic's name
// (no folder), or empty when it was not included. What the operator wrote is
// cut with "…" (what they were doing first, then what happened) until the
// encoded link fits MAIL_MAX; the line about the file always stays.
export function reportMail({ text = "", doing = "", church = "", version = "", os = "", file = "" } = {}) {
    const subject = `${version ? `KERYX ${version}` : "KERYX"} · problema`;
    let t = String(text || "").trim();
    let d = String(doing || "").trim();
    const fields = { church: String(church || "").trim(), version, os, file: file ? String(file).split(/[\\/]/).pop() : "" };
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
