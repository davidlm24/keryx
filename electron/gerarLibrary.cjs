// The KERYX library in the GERAR (owner 2026-11-18, contract C8: the GERAR's
// docs/agent-tasks/codex-keryx-biblioteca.md): a text-only index of the
// Mídia's videos, audios and YouTube links — id, title, kind, duration,
// category — so whoever makes a request in the GERAR can pick one, and the
// request comes back tied to the file (ServiceMessage.mediaId).
//
// Never a file, a file name, a description, a path, a still, a background,
// a font or a picture. Only the computer connected with "Receber os pedidos"
// on publishes (the one that imports), so the index has one writer.
//
// When: when that becomes true (connecting, Receber turned on), and 30 s
// after the Mídia stops changing. How: upsert_keryx_library in pages of 500,
// then prune_keryx_library with the whole list of ids that stay (nothing
// leaves the index half-way). An index the same as the last one published
// is not sent again. 42501 = precisa de você (gerarLink.refused); no
// internet = the next change or connection tries again.

const crypto = require("node:crypto");

const KEY = "gerar";
const PAGE = 500;
const WAIT_MS = 30 * 1000;
// The Mídia's old category keys, read as the church's names (mediaCategories.js).
const OLD_KEYS = { sermon: "Pregação", worship: "Louvor", announcement: "Avisos", testimony: "Testemunho", other: "Outros" };
const NOT_MEDIA = new Set(["background", "font"]);

// Control characters become spaces (by code, not a regex: no-control-regex).
const clean = (v, max) => Array.from(String(v ?? ""), (ch) => { const c = ch.charCodeAt(0); return c < 32 || c === 127 ? " " : ch; }).join("").replace(/\s+/g, " ").trim().slice(0, max);

// One Media row -> its index item, or null when it does not go.
function libraryItem(m) {
    if (!m || !m.id || NOT_MEDIA.has(m.category) || m.type === "font") return null;
    const url = String(m.file_url || "");
    const kind = m.type === "audio" ? "audio" : m.type === "video" ? (/youtu\.?be/i.test(url) ? "youtube" : "video") : null;
    if (!kind) return null;
    const title = clean(m.title, 180);
    if (!title) return null;
    const d = Number(m.duration);
    const category = clean(OLD_KEYS[m.category] || m.category, 60);
    return {
        media_id: String(m.id).slice(0, 160),
        title,
        kind,
        duration_seconds: Number.isFinite(d) && d > 0 ? Math.min(86400, Math.round(d)) : null,
        category: category || null,
        updated_at: m.updated_date || m.created_date || new Date(0).toISOString(),
    };
}

// The index of a whole Mídia, in a stable order (by id).
function libraryIndex(rows = []) {
    return rows.map(libraryItem).filter(Boolean).sort((a, b) => a.media_id.localeCompare(b.media_id));
}

const signature = (items) => crypto.createHash("sha256").update(JSON.stringify(items)).digest("hex");

function createGerarLibrary({ link, store, settings, log = console.warn, timers = { setTimeout, clearTimeout }, now = () => Date.now() }) {
    let timer = null;
    let running = null;
    let waitingSaid = false;

    const cfg = () => {
        const c = settings.get(KEY, null);
        return c && typeof c === "object" ? c : {};
    };
    const wanted = () => {
        const s = link.status();
        return s.configured && s.state === "on" && Boolean(s.device) && s.receive;
    };

    async function send() {
        const rows = store.call("Media", "list", []);
        const items = libraryIndex(Array.isArray(rows) ? rows : []);
        const sig = signature(items);
        const last = cfg().library;
        if (last && last.sig === sig) return false; // the same as published
        for (let i = 0; i < items.length; i += PAGE) {
            await link.rpc("upsert_keryx_library", { _items: items.slice(i, i + PAGE) });
        }
        await link.rpc("prune_keryx_library", { _keep: items.map((x) => x.media_id) });
        const c = cfg();
        if (c.device) settings.set(KEY, { ...c, library: { count: items.length, at: new Date(now()).toISOString(), sig } });
        if (link.changed) link.changed();
        return true;
    }

    // One publication at a time; a call while one runs waits for it.
    function publish() {
        if (!wanted()) return Promise.resolve(false);
        if (running) return running;
        running = send()
            .catch((err) => {
                if (err && err.pg === "42501") link.refused("revoked");
                // The GERAR without C8 yet (no such function): said once.
                else if (err && err.pg === "PGRST202") { if (!waitingSaid) log("[gerar] biblioteca: o GERAR ainda não tem o C8 (upsert_keryx_library)"); waitingSaid = true; }
                else if (!(err && (err.code === "offline" || err.code === "needs"))) log(`[gerar] biblioteca: ${err && err.status ? err.status : ""} ${err && err.pg ? err.pg : ""} ${err && err.message}`);
                return false;
            })
            .finally(() => { running = null; });
        return running;
    }

    return {
        publish,
        // The Mídia changed: publish once it stops changing for WAIT_MS.
        schedule() {
            if (timer) timers.clearTimeout(timer);
            timer = timers.setTimeout(() => { timer = null; publish(); }, WAIT_MS);
        },
        // Forget what was published (a new device starts its index over).
        reset() {
            const c = cfg();
            if (c.library) { const { library, ...rest } = c; void library; settings.set(KEY, rest); }
        },
        stop() { if (timer) timers.clearTimeout(timer); timer = null; },
    };
}

module.exports = { createGerarLibrary, libraryItem, libraryIndex, PAGE };
