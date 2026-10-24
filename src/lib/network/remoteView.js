// The controle remoto's page (/Remote, a phone on the church Wi-Fi): what it
// shows, worked out from the live state (over SSE) and the console's `state`
// (shared/remoteProtocol.json). Pure, so node --test checks it; the page
// (src/pages/RemoteView.jsx) only draws it.
import PROTOCOL from "../../../shared/remoteProtocol.json" with { type: "json" };
import { activitySteps, revealStep, livePosition, toolTime } from "../../../shared/live-state.mjs";
import { captionParts, airFor } from "../console/caption.js";
import { playerLayer, videoSwap, clock } from "../console/player.js";
import { followLabel, followAction } from "../console/followWords.js";
import { typeLabel, typeIcon } from "../console/setlist.js";
import { readQuickRef } from "../console/quickRef.js";
import { bibleBooks, BIBLE_VERSIONS, formatReference } from "../bibleBooks.js";

const { messages } = PROTOCOL;

// Nothing from the computer for this long (live frames and the hb every
// 10 s): the link is dead, whatever the socket says.
export const STALE_MS = 25000;
// How often the phone asks for `state` while it is on screen.
export const STATE_EVERY_MS = 20000;
// The Desfazer after Encerrar tudo, as on the console.
export const UNDO_MS = 8000;

// The sections this console runs. A version 1 console sends no caps: it
// runs only what the old page did (slides, Tela preta/Logo, the Setlist, a
// verse; tocar/pausar is its `play`, see isV1).
const V1_CAPS = ["live", "setlist", "bible"];
export const isV1 = (state) => Boolean(state) && !Array.isArray(state.caps);
export function capsOf(state) {
    if (!state) return new Set();
    return new Set(Array.isArray(state.caps) ? state.caps : V1_CAPS);
}
// An action the console runs (its cap there; `state` always).
export const canRun = (caps, action) => {
    const cap = PROTOCOL.actions[action]?.cap;
    return Boolean(PROTOCOL.actions[action]) && (!cap || caps.has(cap));
};

// R reads, S puts on air, T takes off (per value of one arg where the
// contract says so).
export function kindOf(action, args = {}) {
    const a = PROTOCOL.actions[action];
    if (!a) return null;
    return (a.kindBy && a.kindBy.cases[String(args?.[a.kindBy.arg])]) || a.kind;
}
// Whether a control may be pressed now. Locked screens refuse whatever puts
// something on air; a dead link too (the tap would go nowhere, or land late),
// while Tela preta, Logo, Limpar and Encerrar stay: an emergency is tried.
export function allowed(action, args, { stale = false, locked = false } = {}) {
    const kind = kindOf(action, args);
    if (kind !== "S") return true;
    return !stale && !locked;
}

// The sticky header: what the screens show, its colour, and one chip per
// layer on air with its Tirar.
//   tone: "air" (red) | "amber" (Tela preta, Logo, locked) | "grey" (nothing, or no link)
const CONTENT_LABEL = { lyrics: "Letra", bible: "Bíblia", text: "Texto", presentation: "Apresentação" };
const MEDIA_LABEL = { video: "Vídeo", image: "Imagem", gif: "Imagem", pdf: "PDF", powerpoint: "Apresentação", youtube: "YouTube", audio: "Áudio" };
const TOOL_LABEL = { clock: "Relógio", stopwatch: "Cronômetro", timer: "Timer", freetext: "Texto livre" };
export function airHeader(live, { stale = false, now = Date.now() } = {}) {
    const { title, pos } = captionParts(live);
    const screen = live?.screen || "show";
    const covered = screen === "black" || screen === "logo";
    const onAir = Boolean(title) && title !== "nada" && !covered;
    const locked = Boolean(live?.locked);
    const tone = stale ? "grey" : covered || locked ? "amber" : onAir ? "air" : "grey";
    const chips = [];
    const chip = (key, label, action, args = {}, amber = false) => chips.push({ key, label, action, args, amber });
    if (live) {
        if (screen === "black") chip("black", "Tela preta", "black", { on: false }, true);
        if (screen === "logo") chip("logo", "Logo", "logo", { on: false }, true);
        if (live.content) chip("content", CONTENT_LABEL[live.content.kind] || "Texto", "off", { layer: "content" });
        if (live.media) chip("media", MEDIA_LABEL[live.media.kind] || "Mídia", "off", { layer: "media" });
        if (live.video) chip("video", "Telas de vídeo", "off", { layer: "video" });
        if (live.audio) chip("audio", "Áudio", "off", { layer: "audio" });
        if (live.tool) chip("tool", TOOL_LABEL[live.tool.mode] || "Timer", "off", { layer: "tool" });
        if (live.communication) chip("communication", "Aviso", "off", { layer: "communication" });
        if (live.alert) chip("alert", "Aviso rápido", "alertClear");
    }
    return {
        tone,
        title: screen === "black" ? "Tela preta" : screen === "logo" ? "Logo na tela" : onAir ? title : "Nada no ar",
        pos: onAir ? pos : "",
        since: onAir && !stale ? airFor(live, now) : "",
        chips,
        locked,
    };
}

// The banner under the header, at most one: no link, an outcome unknown,
// the screens locked.
export function bannerOf({ stale = false, unknown = false, locked = false, canUnlock = true } = {}) {
    if (stale) return { tone: "grey", text: "Sem sinal do computador. Os envios ficam desligados até voltar; Tela preta, Logo e Limpar continuam.", refresh: true };
    if (unknown) return { tone: "amber", text: messages.unknownOutcome, refresh: true };
    if (locked) return { tone: "amber", text: `Telas travadas: nada novo vai ao ar. Tela preta, Logo e Limpar continuam. ${canUnlock ? "Destrave em Mais (segure)." : "Destrave em Saídas, no computador."}`, refresh: false };
    return null;
}

// What a slide says on the phone: its text, else its label (a PDF's
// "Página 3"), else that it is a picture.
export const slideText = (slide) => String(slide?.text || "").trim() || slide?.label || (slide?.image_url ? "Imagem" : "");

// Ao vivo's cards and arrows from the content on air.
//   -> { has, index, count, now, next, reveal }
export function slideInfo(content) {
    const slides = content?.slides || [];
    if (!slides.length) return { has: false, index: 0, count: 0, now: "", next: "", reveal: false };
    const index = content.index || 0;
    const cur = slides[index];
    // An activity not fully revealed: → reveals it before changing slide.
    const reveal = activitySteps(cur) > revealStep(content, index);
    return { has: true, index, count: slides.length, now: slideText(cur), next: slides[index + 1] ? slideText(slides[index + 1]) : "", reveal };
}
// The No ar bar under every tab but Ao vivo (Rodada Q, S5 = A): ⏮ · the
// slide on air and its place, the next under it · ⏭; null with nothing on
// air. The arrows only while slides are on air; with none the line is what
// the header says (a video, a picture, Tela preta).
//   -> null | { tone, now, pos, next, arrows, reveal }
const oneLine = (text) => String(text || "").split("\n").map((l) => l.trim()).filter(Boolean).join(" / ");
export function nowBarInfo(live) {
    if (!live) return null;
    const h = airHeader(live);
    if (!h.chips.length) return null;
    const s = slideInfo(live.content);
    const covered = live.screen === "black" || live.screen === "logo";
    if (!s.has || covered) return { tone: h.tone, now: h.title, pos: h.pos, next: "", arrows: s.has, reveal: false };
    const title = live.content.title || "Texto";
    return {
        tone: h.tone,
        now: oneLine(s.now) || title,
        pos: s.count > 1 ? `${s.index + 1}/${s.count}` : "",
        next: s.reveal ? "Próximo: revelar a resposta" : s.next ? `Próximo: ${oneLine(s.next)}` : title,
        arrows: true,
        reveal: s.reveal,
    };
}
// The slides sheet: one row per slide, the first line as its title.
export function slideRows(content) {
    return (content?.slides || []).map((s, i) => {
        const lines = slideText(s).split("\n").map((l) => l.trim()).filter(Boolean);
        return { i, title: lines[0] || `Slide ${i + 1}`, sub: lines.slice(1).join(" · "), air: i === (content.index || 0) };
    });
}

// The player card: the layer the console's player shows, where it is, its
// volume, and the eye (a video on the projector can leave it and keep its
// sound). null when nothing plays.
export function playerInfo(live, now = Date.now()) {
    const layer = playerLayer(live);
    const item = layer ? live[layer] : null;
    if (!item) return null;
    const pb = item.playback || {};
    const list = item.playlist;
    const swap = videoSwap(live, layer);
    return {
        layer,
        kind: item.kind,
        title: item.title || MEDIA_LABEL[item.kind] || "Mídia",
        at: clock(livePosition(pb, now)),
        length: item.duration ? clock(item.duration) : "",
        pct: item.duration ? Math.min(100, Math.max(0, (livePosition(pb, now) / item.duration) * 100)) : 0,
        paused: Boolean(pb.paused),
        volume: Math.round((pb.volume ?? 1) * 100),
        list: list && list.length > 1 ? `${(item.playlistIndex ?? 0) + 1}/${list.length}` : "",
        swap: swap ? { disabled: Boolean(swap.disabled), title: swap.title, sound: swap.action === "showVideo" } : null,
    };
}
// Volume in steps of 10 % (owner's pick: no slider on the phone).
export function volumeStep(volume, delta) {
    const v = Math.round((Number(volume) || 0) / 10) * 10 + delta;
    return Math.max(0, Math.min(100, v));
}

// Letra automática, when the song on air has one.
export function followInfo(content) {
    const f = content?.follow;
    if (!f) return null;
    return { label: followLabel(f), action: followAction(f), paused: Boolean(f.paused) };
}

// A timer on air (the one − / + adjust); a stopwatch shows its time only.
export function timerInfo(live, now = Date.now()) {
    const t = live?.tool;
    if (!t || (t.mode !== "timer" && t.mode !== "stopwatch")) return null;
    return { mode: t.mode, text: clock(toolTime(t, now) / 1000), adjust: t.mode === "timer" };
}

// The Setlist as the phone lists it: sections as headers, each item with
// its kind, time and length, and which one is on air, next, or was the last
// sent (on air no more: after Esc, or something else went on).
export const STATUS_TEXT = { missing: "Arquivo não encontrado", syncing: "Baixando…", blocked: "Preparando páginas" };
// A presentation's state in the console's words when it sends them
// ("Preparando páginas 3/12", or why the pages failed; Rodada H, HB).
const statusText = (st, progress) => (st === "blocked" && typeof progress === "string" && progress ? progress : STATUS_TEXT[st] || "");
const two = (n) => String(n).padStart(2, "0");
const clockAt = (seconds) => {
    const s = Math.round(seconds) % 86400;
    return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}`;
};
export function setlistRows(state, live = null) {
    const air = state?.airItemId || null;
    const next = state?.nextItemId || null;
    const sent = live?.session?.itemId || null;
    return (state?.items || []).map((it) => {
        if (it.section || String(it.type).toUpperCase() === "SECTION") return { id: it.id, section: true, title: it.title || "Seção" };
        const sub = [typeLabel(it.type), Number.isFinite(it.at) ? clockAt(it.at) : "", it.dur ? clock(it.dur) : ""].filter(Boolean).join(" · ");
        const st = it.st && it.st !== "ok" ? it.st : null;
        return {
            id: it.id,
            section: false,
            title: it.title || "Sem título",
            icon: typeIcon(it.type),
            sub,
            tag: it.id === air ? "air" : it.id === next ? "next" : !air && it.id === sent ? "last" : null,
            st,
            stText: st ? statusText(st, it.progress) : "",
        };
    });
}
export const TAG_TEXT = { air: "no ar", next: "próximo", last: "último" };

// What a command's answer says on the phone ("Celular: Tela preta" without
// its "Celular: ", which the console's log needs).
export function sayOf(r) {
    if (!r) return "";
    if (!r.ok) return r.message || "Não foi possível.";
    const text = String(r.message || "").replace(/^Celular: /, "").replace(/\.$/, "");
    return text ? `${text[0].toUpperCase()}${text.slice(1)}.` : "Feito.";
}

// ---- Mídia (PR3b) ----------------------------------------------------------

// Mídia's chips: which `library` page each lists, and how its rows are sent
// (sendMedia's kind).
export const MEDIA_CHIPS = [
    { key: "songs", label: "Músicas", tab: "songs", send: "song", icon: "music" },
    { key: "video", label: "Vídeos", tab: "media", kind: "video", send: "media", icon: "film" },
    { key: "image", label: "Imagens", tab: "media", kind: "image", send: "media", icon: "image" },
    { key: "audio", label: "Áudios", tab: "media", kind: "audio", send: "media", icon: "volume" },
    { key: "pdf", label: "Slides", tab: "media", kind: "pdf", send: "media", icon: "presentation" },
    { key: "pieces", label: "Avisos", tab: "pieces", send: "piece", icon: "megaphone" },
    { key: "materials", label: "Escola", tab: "materials", send: "material", icon: "book" },
];
export const chipOf = (key) => MEDIA_CHIPS.find((c) => c.key === key) || MEDIA_CHIPS[0];
// Pages of 30 (the contract allows 50): a phone's screen and a half.
export const PAGE_SIZE = 30;
// The search waits for the typing to stop.
export const SEARCH_DEBOUNCE_MS = 250;

// The `library` args for a chip, a search and where the list is.
export function libraryArgs(key, q = "", skip = 0) {
    const c = chipOf(key);
    const args = { tab: c.tab, skip, limit: PAGE_SIZE };
    if (c.kind) args.kind = c.kind;
    const text = String(q || "").trim().slice(0, PROTOCOL.actions.library.args.q.max);
    if (text) args.q = text;
    return args;
}
// The list as it grows: `key` is what it lists (chip and search). A page for
// another key (an answer late after the search changed) or not continuing it
// (skip ≠ what is listed) is dropped.
export const emptyList = (key) => ({ key, rows: [], total: 0, ready: true, done: false });
export function joinPage(list, key, page) {
    if (!page || list.key !== key) return list;
    const skip = Number(page.skip) || 0;
    if (skip !== list.rows.length) return list;
    const rows = [...list.rows, ...(page.rows || [])];
    const total = Number(page.total) || 0;
    return { key, rows, total, ready: page.ready !== false, done: rows.length >= total || !(page.rows || []).length };
}
// A row as the phone lists it; a file missing, still downloading or a
// presentation still being prepared cannot be picked.
export function mediaRow(row) {
    const st = row.st && row.st !== "ok" ? row.st : null;
    return {
        id: row.id,
        title: row.title || "Sem título",
        sub: [row.sub, row.dur ? clock(row.dur) : ""].filter(Boolean).join(" · "),
        thumb: typeof row.thumb === "string" && row.thumb.startsWith("/media/") ? row.thumb : null,
        st,
        stText: st ? statusText(st, row.progress) : "",
    };
}
// What sendMedia gets for a row of a chip (a video: on the projector or the
// video screens).
export function sendMediaArgs(key, id, toVideo = false) {
    const c = chipOf(key);
    return { kind: c.send, id, ...(c.key === "video" && toVideo ? { toVideo: true } : {}) };
}

// + Setlist (Rodada Q, `setlist.add`): what a chip's row adds at the end of
// the culto's Setlist; null for the avisos (the Setlist takes none).
const SETLIST_KIND = { song: "song", media: "media", material: "material" };
export function addToSetlistArgs(key, id) {
    const kind = SETLIST_KIND[chipOf(key).send];
    return kind && id ? { kind, id } : null;
}

// ---- Bíblia (PR3b) ---------------------------------------------------------

// The field: "jo 3 16", "Jo 3:16-18", "jo 3" (the console's quick jump
// rules, quickRef.js). -> { book, chapter, verseStart, verseEnd } | null
export function fieldRef(text) {
    const r = readQuickRef(text);
    if (!r.book || !r.valid || !r.chapter) return null;
    const start = r.verseStart ?? null;
    return { book: r.book.name, chapter: r.chapter, verseStart: start, verseEnd: start == null ? null : r.verseEnd ?? start };
}
// The book typed so far, before its chapter ("joã" → João), else null.
export const fieldBook = (text) => readQuickRef(text).book?.name || null;
// The picker's verses: a tap picks one, a tap on another makes the range,
// the next tap starts again; the same verse again lets it go (the chapter).
export function tapVerse(ref, verse) {
    const { verseStart: s, verseEnd: e } = ref;
    if (s == null) return { ...ref, verseStart: verse, verseEnd: verse };
    if (s === e && verse === s) return { ...ref, verseStart: null, verseEnd: null };
    if (s === e) return { ...ref, verseStart: Math.min(s, verse), verseEnd: Math.max(s, verse) };
    return { ...ref, verseStart: verse, verseEnd: verse };
}
// What the field says for a picked reference ("João 3:16-18", "João 3").
export const refLabel = (ref) => (!ref ? "" : ref.chapter ? formatReference(ref) : ref.book);
// bibleFind / bibleSend args (the structured group of the contract's oneOf).
export function bibleArgs(ref, version = "") {
    const args = { book: ref.book, chapter: ref.chapter };
    if (ref.verseStart != null) { args.verseStart = ref.verseStart; args.verseEnd = ref.verseEnd ?? ref.verseStart; }
    if (version) args.version = version;
    return args;
}
// + Setlist for a passage: only with its verses (a chapter alone is 400:
// it would be the whole chapter).
export function biblePlanArgs(ref, version = "") {
    if (!ref?.chapter || ref.verseStart == null) return null;
    return bibleArgs(ref, version);
}
// The book grid: the Old and the New Testament, by their short names.
export const BIBLE_SECTIONS = [["Antigo Testamento", bibleBooks.slice(0, 39)], ["Novo Testamento", bibleBooks.slice(39)]];
export const bookOf = (name) => bibleBooks.find((b) => b.name === name) || null;
// The editions on offer: the one chosen on the computer first, then those
// installed there, then the ones read online.
export function bibleVersions(bible) {
    const installed = new Set(bible?.installed || []);
    // The church's own editions (installed from its file) after the list's.
    const ids = [...BIBLE_VERSIONS.filter((v) => installed.has(v.id) || v.online).map((v) => v.id), ...[...installed].filter((id) => !BIBLE_VERSIONS.some((v) => v.id === id))];
    const first = bible?.version && ids.includes(bible.version) ? [bible.version] : [];
    return [...first, ...ids.filter((id) => id !== bible?.version)].map((id) => ({ id, installed: installed.has(id) }));
}

// ---- The Equipe (Rodada Q PR4) ---------------------------------------------

// Which environment the page is: the role the console's `state` answers
// (the code that signed the phone in). Before the first answer the page
// waits a moment for it (RemoteView), then draws the Controle.
export const roleOf = (state) => (!state ? null : state.role === "team" ? "team" : "control");

// The tabs of each environment: [key, label, icon, cap]. The Controle keeps
// its five (Rodada Q PR3); the Equipe has four (the owner's mockup:
// Pedidos, Músicas, Bíblia, Setlist) and never a projection.
export const CONTROL_TABS = [
    ["live", "Ao vivo", "monitor", "live"],
    ["setlist", "Setlist", "list", "setlist"],
    ["media", "Mídia", "media", "library"],
    ["bible", "Bíblia", "book", "bible"],
    ["more", "Mais", "more", null],
];
export const TEAM_TABS = [
    ["pedidos", "Pedidos", "chat", "requests"],
    ["songs", "Músicas", "music", "library"],
    ["bible", "Bíblia", "book", "bible"],
    ["setlist", "Setlist", "list", null],
];
// The tabs a phone shows: its role's, those whose cap the console runs
// (all of them while no state came yet).
export function tabsFor(state) {
    const tabs = roleOf(state) === "team" ? TEAM_TABS : CONTROL_TABS;
    if (!state) return tabs;
    const caps = capsOf(state);
    return tabs.filter(([, , , cap]) => !cap || caps.has(cap));
}

// The Equipe's strip on top (no buttons, no Tirar): what is on air, its
// place, and that this phone only reads.
//   -> { tone, text, pos }
export function teamStrip(live, { stale = false } = {}) {
    if (!live || stale) return { tone: "grey", text: "Sem sinal do computador", pos: "só leitura" };
    const h = airHeader(live);
    const on = h.title !== "Nada no ar";
    return { tone: h.tone, text: on ? `No ar · ${h.title}` : "Nada no ar", pos: [on ? h.pos : "", "só leitura"].filter(Boolean).join(" · ") };
}

// The sender's name, asked once and kept on the phone (≤ limits.requestFrom).
export const NAME_KEY = "keryx.remote.name";
const REQ = PROTOCOL.actions["request.send"].args;
const CHAT = PROTOCOL.actions["chat.send"].args;
const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
export const cleanName = (value) => clip(value, PROTOCOL.limits.requestFrom);

// A YouTube link as typed ("youtu.be/abc…", "https://www.youtube.com/watch?v=…",
// a Shorts link) -> its id, or null when it is not YouTube's. What goes is
// the URL rebuilt from the id; the console rebuilds it again (and refuses
// anything else, 400).
const YT_ID = /^[\w-]{11}$/;
export function youtubeId(value) {
    const raw = String(value || "").trim();
    if (!raw || raw.length > PROTOCOL.limits.link) return null;
    let url;
    try { url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return null; }
    if (url.username || url.password) return null;
    const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
    let id = null;
    if (host === "youtu.be") id = url.pathname.slice(1).split("/")[0];
    else if (host === "youtube.com") id = url.searchParams.get("v") || (url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]+)/) || [])[1];
    return id && YT_ID.test(id) ? id : null;
}
export const youtubeUrl = (value) => {
    const id = youtubeId(value);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
};
// The cover of a YouTube link (the console's Pedidos shows YouTube's too).
export const youtubeCover = (link) => {
    const id = youtubeId(link);
    return id ? `https://i.ytimg.com/vi/${id}/mqdefault.jpg` : null;
};

// The pedido sheet's fields -> request.send's args, checked against the
// contract's limits. mediaId (S15): a video or an audio picked in the
// sheet's Vídeos or Áudios; never beside a songId. -> { args } | { error, message }
export function pedidoArgs({ from, singer, song, songId, mediaId, note, link } = {}) {
    const name = cleanName(from);
    if (!name) return { error: "from", message: "Escreva o seu nome." };
    const title = clip(song, REQ.song.max);
    if (!title) return { error: "song", message: "Escreva o louvor ou escolha da biblioteca." };
    const args = { from: name, song: title };
    const who = clip(singer, REQ.singer.max);
    if (who) args.singer = who;
    if (songId && new RegExp(PROTOCOL.idPattern).test(songId)) args.songId = songId;
    else if (mediaId && new RegExp(PROTOCOL.idPattern).test(mediaId)) args.mediaId = mediaId;
    const obs = String(note ?? "").trim().slice(0, REQ.note.max);
    if (obs) args.note = obs;
    if (String(link || "").trim()) {
        const url = youtubeUrl(link);
        if (!url) return { error: "link", message: messages.notYouTube };
        args.link = url;
    }
    return { args };
}
// The composer -> chat.send's args. A link alone goes with a text of its
// own (the contract asks for one).
export function chatArgs({ from, text, link } = {}) {
    const name = cleanName(from);
    if (!name) return { error: "from", message: "Escreva o seu nome." };
    const args = { from: name, text: String(text ?? "").trim().slice(0, CHAT.text.max) };
    if (String(link || "").trim()) {
        const url = youtubeUrl(link);
        if (!url) return { error: "link", message: messages.notYouTube };
        args.link = url;
        if (!args.text) args.text = "Vídeo do YouTube";
    }
    if (!args.text) return { error: "text", message: "Escreva a mensagem." };
    return { args };
}
// The fields' maxLength, from the contract.
export const PEDIDO_LIMITS = { from: PROTOCOL.limits.requestFrom, singer: REQ.singer.max, song: REQ.song.max, note: REQ.note.max, link: PROTOCOL.limits.link, text: CHAT.text.max };

// The Equipe asks `requests` for each kind (its Pedidos and its Chat, S12)
// every 15 s, every 5 s for the chat while the Chat is open (the operator
// answers there), and right after a send; the newest page only.
export const REQUESTS_EVERY_MS = 15000;
export const REQUESTS_CHAT_MS = 5000;
export const requestsEvery = (kind, chatOpen) => (kind === "chat" && chatOpen ? REQUESTS_CHAT_MS : REQUESTS_EVERY_MS);
const hhmm = (iso) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? "" : `${two(d.getHours())}:${two(d.getMinutes())}`;
};
// The culto's messages as the phone lists them, oldest first: this phone's
// own (by its name) on the right as "Você"; the operator's (side
// "operator", S12/S14: a reply in the console's Chat, a pedido it noted) as
// "Operador" and "Anotado pelo operador"; a pedido says whether the operator
// saw to it. Everything is drawn as plain text (it came from phones).
const isMine = (r, mine) => Boolean(mine) && r.side !== "operator" && cleanName(r.from).toLowerCase() === mine;
// The Escolher da biblioteca sheet's tabs (S15 = A): Letras · Vídeos ·
// Áudios, each a chip of the Mídia's list (its library args and glyph).
export const PICK_CHIPS = ["songs", "video", "audio"].map((key) => ({ ...chipOf(key), label: { songs: "Letras", video: "Vídeos", audio: "Áudios" }[key] }));
// A pedido's glyph: the kind of its video or audio (requests' media), else a song.
const PEDIDO_GLYPH = { video: "film", youtube: "youtube", audio: "volume" };
export const pedidoGlyph = (r) => PEDIDO_GLYPH[r?.media] || "music";

export function messageRows(rows = [], me = "") {
    const mine = cleanName(me).toLowerCase();
    return rows.map((r) => {
        const own = isMine(r, mine);
        const op = r.side === "operator";
        const at = hhmm(r.at);
        const done = r.status === "done";
        const who = op ? "Operador" : own ? "Você" : r.from || "Equipe";
        return {
            id: r.id,
            kind: r.kind === "pedido" ? "pedido" : "chat",
            mine: own,
            operator: op,
            head: [who, at].filter(Boolean).join(" · "),
            // A pedido card's line on top.
            by: op ? "Anotado pelo operador" : own ? "Você pediu" : `Pedido de ${r.from || "Equipe"}`,
            at,
            text: String(r.text || ""),
            singer: String(r.singer || ""),
            song: String(r.song || ""),
            icon: pedidoGlyph(r),
            link: r.link || null,
            cover: r.link ? youtubeCover(r.link) : null,
            done,
            status: done ? "✓ Atendido" : op ? "" : own ? "Enviado · aguardando o operador" : "Aguardando o operador",
        };
    });
}

// What this phone has not seen yet (the gold dots of Pedidos | Chat and of
// the Pedidos tab, S12): a row it did not send, newer than the last one it
// saw there (`seen`, an ISO time kept per kind in SEEN_KEY).
export const SEEN_KEY = "keryx.remote.seen";
export function newestAt(rows = []) {
    return rows.reduce((m, r) => (String(r.at || "") > m ? String(r.at || "") : m), "");
}
export function hasUnseen(rows = [], seen = "", me = "") {
    const mine = cleanName(me).toLowerCase();
    return rows.some((r) => !isMine(r, mine) && String(r.at || "") > String(seen || ""));
}

// The Equipe's Setlist to read: the item on air marked and the next
// playable one after it. A song opens its lyrics.
const isSection = (it) => Boolean(it.section) || String(it.type).toUpperCase() === "SECTION";
export function teamSetlistRows(state) {
    const items = state?.items || [];
    const air = state?.airItemId || null;
    const at = air ? items.findIndex((it) => it.id === air) : -1;
    const next = at >= 0 ? items.slice(at + 1).find((it) => !isSection(it))?.id || null : null;
    return items.map((it) => {
        if (isSection(it)) return { id: it.id, section: true, title: it.title || "Seção" };
        return {
            id: it.id,
            section: false,
            title: it.title || "Sem título",
            icon: typeIcon(it.type),
            sub: typeLabel(it.type),
            // A song opens its lyrics when the console says which song it is.
            songId: String(it.type || "").toUpperCase() === "SONG" && it.songId ? it.songId : null,
            // Who sings, when the item came from a pedido (S13).
            singer: String(it.singer || "").trim(),
            tag: it.id === air ? "air" : it.id === next ? "next" : null,
        };
    });
}

// A song's lyrics on the phone (songText): the chords cut out of each line
// and shown above it (Cifra), or left out. -> [{ name, lines: [{ chords, text }] }]
const CHORD = /\[([^\]\n]{1,12})\]/g;
export function lyricParts(song, { chords = false } = {}) {
    return (song?.parts || []).map((p) => ({
        name: String(p.name || "").trim(),
        lines: (p.lines || []).map((line) => {
            const found = [...String(line).matchAll(CHORD)].map((m) => m[1]);
            const text = String(line).replace(CHORD, "").replace(/\s{2,}/g, " ").trim();
            return { chords: chords ? found.join("  ") : "", text };
        }).filter((l) => l.text || l.chords),
    })).filter((p) => p.lines.length);
}
export const hasChords = (song) => (song?.parts || []).some((p) => (p.lines || []).some((l) => /\[[^\]\n]{1,12}\]/.test(l)));
// "Pedras Vivas · Tom G"
export const songSub = (song) => [song?.artist, song?.key ? `Tom ${song.key}` : ""].filter(Boolean).join(" · ");
