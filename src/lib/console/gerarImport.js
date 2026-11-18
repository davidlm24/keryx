// A request or a chat message of the GERAR -> the ServiceMessage the Painel
// shows (owner 2026-11-18, the GERAR's wave 2; the brief's "Campos e
// limites": the GERAR cuts nothing, so neither does this). The console calls
// it for what the main process brings (electron/gerarInbox.cjs). Pure,
// tested.
import { youtubeLink } from "../youtubeLinks.js";

// The GERAR's categories that are music: the card says "Fulano canta …" and
// has Pôr na prévia and Setlist. Any other is "Fulano pede: …" with its
// category's glyph (D6 = A).
export const GERAR_MUSIC = new Set(["song", "playback", "video"]);
export const GERAR_CATEGORY = {
    song: { glyph: "music", words: "música" },
    playback: { glyph: "volume", words: "playback" },
    video: { glyph: "film", words: "vídeo" },
    microphone: { glyph: "mic", words: "microfone" },
    announcement: { glyph: "megaphone", words: "aviso" },
    stage: { glyph: "monitor", words: "palco" },
    lighting: { glyph: "lightbulb", words: "luz" },
    streaming: { glyph: "radio", words: "transmissão" },
    other: { glyph: "help", words: "outro" },
};
// The GERAR closed it without doing it: "cancelado no GERAR", dimmed (D3 = A).
export const GERAR_CLOSED = new Set(["cancelled", "declined"]);

// A row is found by its GERAR id (external_id): the store makes every id
// itself (it is a system field). The GERAR locks a request for one computer;
// a chat message two computers both brought is shown once (oneGerarCopy).

const clean = (v, max) => String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").replace(/\s+/g, " ").trim().slice(0, max);

// The culto of the GERAR, only to show (the request enters the culto the
// console shows, as the phones' do).
export function gerarEvent(ev) {
    if (!ev || !ev.id) return null;
    return { id: String(ev.id), title: clean(ev.title, 180), date: clean(ev.date, 10) };
}

// A link: the YouTube one becomes the row's link (the card plays it); any
// other stays readable at the end of the text, never a link.
function splitLink(url) {
    const raw = clean(url, 2048);
    if (!raw) return { link: "", rest: "" };
    const yt = youtubeLink(raw);
    return yt ? { link: yt, rest: "" } : { link: "", rest: raw };
}

const statusOf = (gerarStatus) => (gerarStatus === "completed" ? "done" : "open");

// event_live_requests (with its culto) -> the ServiceMessage's fields.
export function gerarRequestRow(req, ev = null) {
    const category = GERAR_CATEGORY[req.category] ? req.category : "other";
    const { link, rest } = splitLink(req.resource_kind === "file" ? "" : req.resource_url);
    const who = clean(req.requester_name, 120);
    const text = [clean(req.details, 2000), rest].filter(Boolean).join(" · ");
    return {
        kind: "pedido",
        side: "team",
        source: "gerar",
        external_id: String(req.id),
        sender: who,
        // Music: who asks is who sings ("Ana canta …"); the rest names no singer.
        singer: GERAR_MUSIC.has(category) ? who : "",
        song: clean(req.title, 180) || clean(req.keryx_media_title, 180),
        // Picked from the KERYX library in the GERAR (C8): the file itself.
        ...(req.keryx_media_id ? { mediaId: clean(req.keryx_media_id, 160) } : {}),
        text,
        ...(link ? { link } : {}),
        status: statusOf(req.status),
        gerar_status: String(req.status || "new"),
        gerar_category: category,
        gerar_event: gerarEvent(ev || req.events || null),
        sentAt: req.created_at || new Date().toISOString(),
    };
}

// event_live_messages (side team) -> a chat row.
export function gerarMessageRow(msg, ev = null) {
    const { link, rest } = splitLink(msg.link);
    return {
        kind: "chat",
        side: "team",
        source: "gerar",
        external_id: String(msg.id),
        sender: clean(msg.sender_name, 120),
        text: [clean(msg.text, 280), rest].filter(Boolean).join(" "),
        ...(link ? { link } : {}),
        status: "open",
        gerar_event: gerarEvent(ev || msg.events || null),
        sentAt: msg.created_at || new Date().toISOString(),
    };
}

// Two rows of the same GERAR message or request (two computers brought it
// before the sync joined them): the Painel shows the oldest one.
export function oneGerarCopy(rows = []) {
    const seen = new Set();
    return rows.filter((r) => {
        if (r?.source !== "gerar" || !r.external_id) return true;
        const key = `${r.kind}:${r.external_id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// The GERAR changed a request this computer already has: what the row takes.
// Completed there = atendido here; reopened there = open again; any state
// is kept as gerar_status (the card's "cancelado no GERAR"). Until the way
// back (the next wave), an "atendido" of the operator is never undone by a
// GERAR state that is not completed nor closed.
export function gerarStatusPatch(local, req) {
    if (!local || !req) return null;
    const gs = String(req.status || "");
    const patch = {};
    if (gs && gs !== local.gerar_status) patch.gerar_status = gs;
    if (gs === "completed" && local.status !== "done") patch.status = "done";
    if (local.gerar_status === "completed" && gs && gs !== "completed" && !GERAR_CLOSED.has(gs) && local.status === "done") patch.status = "open";
    return Object.keys(patch).length ? patch : null;
}

// The Media type of a file attached in the GERAR, by its name (the same list
// electron/gerarFiles.cjs downloads); null = the Mídia does not take it.
export function gerarMediaType(name) {
    const n = String(name || "").toLowerCase();
    if (/\.(mp4|mov|m4v|webm|mkv)$/.test(n)) return "video";
    if (/\.(mp3|m4a|wav|ogg|aac|flac)$/.test(n)) return "audio";
    if (/\.gif$/.test(n)) return "gif";
    if (/\.(jpe?g|png|webp)$/.test(n)) return "image";
    if (/\.pdf$/.test(n)) return "pdf";
    return null;
}

// The Media row of a file the GERAR attached to a request: its name as the
// title, where it came from in the description (the Mídia's search reads it).
export function gerarMediaRow(file, pedido = null) {
    const type = gerarMediaType(file?.name);
    if (!type || !file?.fileUrl) return null;
    const who = String(pedido?.sender || "").trim();
    const culto = String(pedido?.gerar_event?.title || "").trim();
    return {
        title: String(file.name).replace(/\.[^.]+$/, "").slice(0, 180) || "Arquivo do GERAR",
        type,
        file_url: file.fileUrl,
        duration: 0,
        description: ["Do GERAR", who && `pedido de ${who}`, culto].filter(Boolean).join(" · "),
    };
}
