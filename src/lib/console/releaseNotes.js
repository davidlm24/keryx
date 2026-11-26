// The "Novidades" popup: the release notes (docs/release-notes/<versão>.md,
// shipped inside the app) of every version since the one this computer had
// before the update. Pure: the notes come in as { version: markdown }.

// -1, 0 or 1, by the numbers of "0.2.14" (missing parts count as 0).
export function compareVersions(a, b) {
    const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0);
    const pb = String(b).split(".").map((n) => parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] || 0) - (pb[i] || 0);
        if (d) return d > 0 ? 1 : -1;
    }
    return 0;
}

const VERSION = /^\d+(\.\d+)*$/;

// -> [{ version, md }], newest first: the versions after `from` up to `to`
// (from: null = only `to`; all: every version up to `to`).
export function versionsBetween(notes, { from = null, to, all = false } = {}) {
    return Object.entries(notes || {})
        .filter(([v]) => VERSION.test(v) && compareVersions(v, to) <= 0 && (all || (from ? compareVersions(v, from) > 0 : compareVersions(v, to) === 0)))
        .sort(([a], [b]) => compareVersions(b, a))
        .map(([version, md]) => ({ version, md }));
}

// A line's **bold** parts -> [{ text, bold }].
export function inlineParts(text) {
    const out = [];
    const re = /\*\*(.+?)\*\*/g;
    let at = 0;
    for (let m = re.exec(text); m; m = re.exec(text)) {
        if (m.index > at) out.push({ text: text.slice(at, m.index), bold: false });
        out.push({ text: m[1], bold: true });
        at = m.index + m[0].length;
    }
    if (at < text.length) out.push({ text: text.slice(at), bold: false });
    return out;
}

// A picture of what changed (owner 2026-11-26: a visual change ships with
// its mockup): "![texto](img/anotacoes.png)" alone on a line, the file in
// docs/release-notes/img/. -> { alt, src: its file name } or null.
export function noteImage(line) {
    const m = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(String(line || "").trim());
    return m ? { alt: m[1].trim(), src: m[2].split("/").pop() } : null;
}

// The note's markdown, as the notes are written (## titles, - items, plain
// paragraphs, **bold**, a picture alone on its line)
// -> [{ type: "h" | "li" | "p", parts } | { type: "img", alt, src }].
export function parseNotes(md) {
    const blocks = [];
    for (const raw of String(md || "").replace(/\r\n/g, "\n").split("\n")) {
        const line = raw.trim();
        if (!line) continue;
        const img = noteImage(line);
        if (img) { blocks.push({ type: "img", ...img }); continue; }
        const h = line.match(/^#{1,6}\s+(.*)$/);
        const li = line.match(/^[-*•]\s+(.*)$/);
        if (h) blocks.push({ type: "h", parts: inlineParts(h[1]) });
        else if (li) blocks.push({ type: "li", parts: inlineParts(li[1]) });
        else blocks.push({ type: "p", parts: inlineParts(line) });
    }
    return blocks;
}

// The notes' pictures keyed by file name, from the paths Vite gives.
export function imagesByName(files) {
    const out = {};
    for (const [path, url] of Object.entries(files || {})) out[path.split("/").pop()] = url;
    return out;
}

// The notes keyed by version, from the file paths Vite gives
// ("…/docs/release-notes/0.2.14.md"); README and the like are left out.
export function notesByVersion(files) {
    const out = {};
    for (const [path, md] of Object.entries(files || {})) {
        const v = path.split("/").pop().replace(/\.md$/, "");
        if (VERSION.test(v)) out[v] = md;
    }
    return out;
}
