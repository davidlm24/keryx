// The controle remoto (a phone on the church network, electron/lan.cjs):
// what the console tells it and says about it. The console runs each command
// as its own keys would (remoteRunner.js, useRemote.js); this is the pure
// part, read against the contract (shared/remoteProtocol.json). Tested.
import PROTOCOL from "../../../shared/remoteProtocol.json" with { type: "json" };
import { captionParts } from "./caption.js";
import { noticeLabel } from "./notice.js";
import { fold } from "../bibleSearch.js";
import { stripChords } from "../chords.js";
import { presentationBlock, pagesLabel } from "../presentation.js";
import { findBook } from "../bibleBooks.js";
import { referenceFrom } from "./quickRef.js";
import { songSlidesFor } from "../songImport.js";
import { partOf } from "./songTheme.js";
import { getYouTubeId } from "../../utils/youtube.js";

export { PROTOCOL };
const { limits } = PROTOCOL;
const SONG_ID = new RegExp(PROTOCOL.idPattern);

// What the console says when a phone did something ("Celular: Tela preta").
// The version 1 actions' words; the contract has the same (remoteProtocol.test).
export const REMOTE_LABEL = {
    next: "próximo slide",
    prev: "slide anterior",
    clear: "limpou o texto",
    play: "tocar / pausar",
    sendNext: "enviou o próximo",
    sendItem: "enviou um item da setlist",
    bibleSend: "enviou um versículo",
};
const labelOf = (action) => REMOTE_LABEL[action] || PROTOCOL.actions[action]?.label || action;
export const remoteSay = (action, detail = "") => `Celular: ${detail || labelOf(action)}.`;

// R reads, S puts something on air (refused while locked), T takes something
// off (works locked) — per value of one arg where the contract says so.
export function remoteKind(action, args = {}) {
    const a = PROTOCOL.actions[action];
    if (!a) return null;
    const by = a.kindBy;
    return (by && by.cases[String(args?.[by.arg])]) || a.kind;
}
// The ops the contract says an action runs (for these args).
export function remoteOps(action, args = {}) {
    const a = PROTOCOL.actions[action];
    if (!a) return [];
    if (a.opsBy) return a.opsBy.cases[String(args?.[a.opsBy.arg])] || [];
    return a.ops || [];
}
// What takes the emergency lane: never waits behind a send (useRemote's queue).
export const EMERGENCY = new Set(["black", "logo", "clear", "off", "end", "alertClear", "lock"]);
// The sections this console runs for each code (state.caps): the Controle
// every one but the Equipe's chat; the Equipe its own few (Rodada Q).
export const REMOTE_CAPS = PROTOCOL.caps.filter((cap) => cap !== "requests");
export const TEAM_CAPS = [...PROTOCOL.teamCaps];
// What a role may run, as electron/lan.cjs checks it (roleAllows there):
// the console checks again, so a sender that skipped the server is refused.
export function remoteRoleAllows(action, args = {}, role = "control") {
    const spec = Object.hasOwn(PROTOCOL.actions, action) ? PROTOCOL.actions[action] : null;
    if (!spec) return false;
    if (role !== "team") return spec.cap !== "requests";
    if (spec.team !== true) return false;
    return Object.entries(spec.teamArgs || {}).every(([key, values]) => args?.[key] === undefined || values.includes(args[key]));
}

// A Media row's state on the phone: ok | missing | syncing | blocked.
export function mediaStatus(m) {
    if (!m) return "missing";
    if (m.syncing) return "syncing";
    if (m.missing) return "missing";
    return presentationBlock(m) ? "blocked" : "ok";
}
const MEDIA_TYPES = new Set(["VIDEO", "IMAGE", "PDF", "POWERPOINT", "AUDIO"]);
// A Setlist item's state, from the Mídia row it points at (the rest is ok).
export function itemStatus(item, media = []) {
    if (!MEDIA_TYPES.has(String(item?.type || "").toUpperCase())) return "ok";
    return mediaStatus(media.find((m) => m.id === item.contentId));
}
// What a PDF's pages are doing, in the console's words ("Preparando páginas
// 3/12", or why they could not be made), for a row the phone lists (Rodada
// H, HB: the phone said only "Preparando páginas"). progressOf: the console's
// usePagesBackfill (id → { done, total } | { error }). -> { progress } or {}
// (the field rides only when there is something to say: additive).
const PROGRESS_MAX = 160;
export function pagesField(id, progressOf = null) {
    const say = id && progressOf ? pagesLabel(progressOf(id)) : "";
    return say ? { progress: say.slice(0, PROGRESS_MAX) } : {};
}

// The item Voltar ao anterior goes back to: the newest one in the history
// that came from the Setlist and is not the one on air.
export function backItemOf(live, items = [], airItemId = null) {
    for (const h of live?.history || []) {
        const id = h?.data?.ref?.serviceItemId;
        if (id && id !== airItemId && items.some((i) => i.id === id)) return id;
    }
    return null;
}

// A relative /media/<file> (never a keryx-media:// or an absolute URL).
export function relativeMedia(url) {
    const s = String(url || "");
    const m = /^keryx-media:\/\/(.+)$/.exec(s) || /^(?:https?:\/\/[^/]+)?\/media\/(.+)$/.exec(s);
    return m ? `/media/${m[1]}` : null;
}

// A tiny hash for state.rev: changes whenever the state does.
function hash(text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
    return h;
}

// What the phone shows: the service, what is on air, the Setlist (sections
// as headers that are never sent) with the item on air, the next one and the
// one before; the Bíblia's edition, the timers and the avisos prontos.
// v: the request's protocol version (1 = an old page: service is its title).
export function remoteState({
    v = 1, app = "", caps = REMOTE_CAPS, service = null, items = [], rows = null, media = [], progressOf = null,
    airItemId = null, nextItemId = null, backItemId = null, live = null, bible = null, timers = [], alerts = [],
}) {
    const { title, pos } = captionParts(live);
    const at = new Map((rows || []).map((r) => [r.item?.id, r.at]));
    const list = items.slice(0, limits.items).map((it) => {
        const type = String(it.type || "").toUpperCase();
        const section = type === "SECTION";
        return {
            id: it.id,
            title: String(it.title || "").slice(0, limits.itemTitle),
            type,
            section,
            at: at.get(it.id) ?? null,
            dur: section ? null : Math.max(0, Number(it.duration) || 0),
            st: itemStatus(it, media),
            ...(MEDIA_TYPES.has(type) ? pagesField(it.contentId, progressOf) : {}),
        };
    });
    const body = {
        locked: Boolean(live?.locked),
        screen: live?.screen === "black" ? "black" : live?.screen === "logo" ? "logo" : "show",
        onAir: title && title !== "nada" ? { title, pos } : null,
        airItemId,
        nextItemId,
        backItemId,
        items: list,
        truncated: items.length > limits.items,
        bible: bible ? { version: String(bible.version || ""), installed: [...(bible.installed || [])] } : null,
        timers: timers.slice(0, limits.timers).map((t) => ({ id: String(t.id || `min-${t.minutes}`), minutes: t.minutes })),
        alerts: alerts.slice(0, limits.alerts).map((a) => ({ id: a.id, message: String(a.message || "").slice(0, limits.alertMessage) })),
        // The culto's Avançar sozinho (Setlist automática, Rodada N2).
        autoplay: Boolean(service?.autoplay),
    };
    const svc = service ? { id: service.id || null, title: service.title || "", date: service.date || null } : null;
    const make = () => ({
        v: PROTOCOL.version,
        app: String(app || ""),
        caps: [...caps],
        rev: hash(JSON.stringify([svc, body])),
        service: v >= 2 ? svc : service?.title || "",
        serviceId: service?.id || null,
        // The Controle's code signed this phone in (Rodada Q; additive).
        role: "control",
        ...body,
    });
    // Never past limits.stateBytes: a long Setlist loses its last items.
    let out = make();
    while (body.items.length && JSON.stringify(out).length > limits.stateBytes) {
        body.items = body.items.slice(0, Math.max(0, body.items.length - 10));
        body.truncated = true;
        out = make();
    }
    return out;
}

// A passage for the phone to check before sending: the start of its text,
// verse numbers in (a chapter alone: from verse 1).
export function passagePreview(reference, verses, nums, version = "") {
    const chosen = nums.length ? verses.filter((v) => nums.includes(v.number)) : verses;
    const text = chosen.map((v) => `${v.number} ${v.text}`).join(" ");
    const max = limits.passageText;
    return { reference, text: text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text, version };
}

// The phone's Bíblia args as a reference: { ref } typed by hand ("jo 3 16",
// "Jo 3:16", "jo 3"), or the picker's { book, chapter, verseStart?, verseEnd? }.
// -> { book, chapter, verseStart, verseEnd } (verses null: the whole chapter) | null.
export function refFromArgs(args = {}) {
    if (args.ref !== undefined) return referenceFrom(args.ref);
    const book = findBook(String(args.book || ""));
    const chapter = Number(args.chapter);
    if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters) return null;
    if (args.verseStart == null) return { book: book.name, chapter, verseStart: null, verseEnd: null };
    const max = book.verses[chapter - 1];
    const start = Number(args.verseStart);
    const end = args.verseEnd == null ? start : Number(args.verseEnd);
    if (start < 1 || start > max || end < start) return null;
    return { book: book.name, chapter, verseStart: start, verseEnd: Math.min(end, max) };
}

// The library, a page at a time (the phone's Mídia): songs by title, the
// Mídia newest first (backgrounds are not in it), avisos and materials.
// The search folds accents over the title, the artist and the lyrics (no
// chords). -> { tab, total, skip, ready, rows: [{ id, title, sub, dur, fav, st, thumb, progress? }] }
const MEDIA_LABEL = { image: "Imagem", video: "Vídeo", audio: "Áudio", pdf: "PDF", powerpoint: "PowerPoint", youtube: "YouTube" };
export function libraryPage({ tab, q = "", kind = null, fav = false, skip = 0, limit = limits.libraryPage, songs = [], media = [], pieces = [], materials = [], loaded = {}, progressOf = null }) {
    const n = Math.max(1, Math.min(limits.libraryPage, limit || limits.libraryPage));
    const needle = fold(String(q || "").trim());
    const has = (...fields) => !needle || fields.some((f) => fold(String(f || "")).includes(needle));
    let all;
    let ready = true;
    if (tab === "songs") {
        ready = loaded.songs !== false;
        all = songs.filter((s) => (!fav || s.is_favorite) && has(s.title, s.artist, stripChords(String(s.lyrics || ""))))
            .map((s) => ({ id: s.id, title: s.title || "", sub: s.artist || "", dur: s.duration || null, fav: Boolean(s.is_favorite), st: "ok", thumb: null }));
    } else if (tab === "media") {
        ready = loaded.media !== false;
        const isKind = (m) => !kind || (kind === "pdf" ? m.type === "pdf" || m.type === "powerpoint" : m.type === kind);
        all = media.filter((m) => isKind(m) && !fav && has(m.title))
            .map((m) => {
                const youtube = m.type === "video" && String(m.file_url || "").includes("youtu");
                return { id: m.id, title: m.title || "", sub: MEDIA_LABEL[youtube ? "youtube" : m.type] || m.type || "", dur: m.duration || null, fav: false, st: mediaStatus(m), thumb: m.type === "video" && !youtube ? relativeMedia(m.thumbnail_url) : null, ...pagesField(m.id, progressOf) };
            });
    } else if (tab === "pieces") {
        ready = loaded.pieces !== false;
        all = pieces.filter((p) => !fav && has(p.title, p.text))
            .map((p) => ({ id: p.id, title: p.title || p.text || "", sub: noticeLabel(p.type), dur: p.duration || null, fav: false, st: "ok", thumb: null }));
    } else {
        all = materials.filter((m) => !fav && has(m.title, m.class_name))
            .map((m) => ({ id: m.id, title: m.title || "", sub: m.class_name || "", dur: null, fav: false, st: "ok", thumb: null }));
    }
    const from = Math.max(0, skip || 0);
    return { tab, total: all.length, skip: from, ready, rows: all.slice(from, from + n) };
}

// -- The Equipe (Rodada Q): its reduced state, its messages, the lyrics -----

// What an Equipe phone sees (the role "team"): what is on air and the
// Setlist to read — no timers, avisos, lock, screen or the items' states,
// and caps only its own (TEAM_CAPS). Capped like remoteState.
export function teamState({ app = "", service = null, items = [], airItemId = null, live = null }) {
    const { title, pos } = captionParts(live);
    const body = {
        onAir: title && title !== "nada" ? { title, pos } : null,
        airItemId,
        items: items.slice(0, limits.items).map((it) => {
            const type = String(it.type || "").toUpperCase();
            // A song's own id (Rodada Q PR4): the Equipe opens its lyrics (songText).
            const songId = type === "SONG" && SONG_ID.test(String(it.contentId || "")) ? { songId: it.contentId } : {};
            return { id: it.id, title: String(it.title || "").slice(0, limits.itemTitle), type, section: type === "SECTION", ...songId };
        }),
        truncated: items.length > limits.items,
    };
    const svc = service ? { id: service.id || null, title: service.title || "", date: service.date || null } : null;
    const make = () => ({
        v: PROTOCOL.version,
        app: String(app || ""),
        caps: [...TEAM_CAPS],
        role: "team",
        rev: hash(JSON.stringify(["team", svc, body])),
        service: svc,
        serviceId: service?.id || null,
        ...body,
    });
    let out = make();
    while (body.items.length && JSON.stringify(out).length > limits.stateBytes) {
        body.items = body.items.slice(0, Math.max(0, body.items.length - 10));
        body.truncated = true;
        out = make();
    }
    return out;
}

// A phone's text as the console keeps it: control characters out (a line
// break stays), trimmed, at most max characters.
export function cleanText(value, max) {
    // eslint-disable-next-line no-control-regex
    const t = String(value ?? "").replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, "").trim();
    return t.slice(0, max);
}

// A link from the phone: only YouTube (youtube.com, youtu.be), kept as the
// one URL rebuilt from its id, never what was typed. -> the URL | null.
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);
export function youtubeLink(value) {
    let url;
    try { url = new URL(String(value || "").trim()); } catch { return null; }
    if (!/^https?:$/.test(url.protocol) || url.username || url.password || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
    const id = getYouTubeId(url.href);
    return id ? `https://www.youtube.com/watch?v=${id}` : null;
}

// The ServiceMessage row a phone's chat.send / request.send makes (no id,
// no serviceId: the console adds them). at: ISO time. -> the fields, or
// { error: "link" } for a link that is not YouTube's.
export function messageRow(action, args = {}, at = new Date().toISOString()) {
    let link = "";
    if (args.link !== undefined) {
        link = youtubeLink(args.link);
        if (!link) return { error: "link" };
    }
    const base = { sender: cleanText(args.from, limits.requestFrom), status: "open", sentAt: at, ...(link ? { link } : {}) };
    if (action === "chat.send") return { ...base, kind: "chat", text: cleanText(args.text, limits.requestText) };
    return {
        ...base,
        kind: "pedido",
        text: cleanText(args.note, 200),
        singer: cleanText(args.singer, 60),
        song: cleanText(args.song, 80),
        ...(args.songId ? { songId: args.songId } : {}),
    };
}

// The same message again (a phone that sent twice, a retry): same kind,
// sender, text and song within limits.dedupeMs. -> the row | null.
export function sameMessage(rows = [], row, now = Date.now()) {
    const key = (r) => [r.kind, r.sender || "", r.text || "", r.song || ""].join("\u0001");
    const want = key(row);
    return rows.find((r) => key(r) === want && Math.abs(now - Date.parse(r.sentAt || "")) <= limits.dedupeMs) || null;
}

// The culto's messages a page at a time, for the phone: skip counts back
// from the newest (skip 0 = the newest page), the rows oldest first.
export function requestsPage({ messages = [], kind = null, skip = 0, limit = limits.requestPage }) {
    const n = Math.max(1, Math.min(limits.requestPage, limit || limits.requestPage));
    const all = messages
        .filter((m) => !kind || m.kind === kind)
        .slice()
        .sort((a, b) => String(a.sentAt || "").localeCompare(String(b.sentAt || "")));
    const back = Math.max(0, skip || 0);
    const end = Math.max(0, all.length - back);
    const rows = all.slice(Math.max(0, end - n), end).map((m) => ({
        id: m.id,
        at: m.sentAt || "",
        kind: m.kind === "pedido" ? "pedido" : "chat",
        from: String(m.sender || ""),
        text: String(m.text || ""),
        singer: String(m.singer || ""),
        song: String(m.song || ""),
        ...(m.songId ? { songId: m.songId } : {}),
        ...(m.link ? { link: m.link } : {}),
        status: m.status === "done" ? "done" : "open",
    }));
    return { total: all.length, skip: back, rows };
}

// A song to read on the phone: its parts in the order sung, each slide's
// lines with the chords inline as the Palco shows them (the slides'
// chorded twins). Cut at limits.stateBytes.
export function songTextOf(song) {
    const { slides, chordedSlides } = songSlidesFor(song);
    const parts = [];
    slides.forEach((slide, i) => {
        const name = partOf(slide);
        const lines = String(chordedSlides?.[i] ?? slide.text ?? "").split("\n").map((l) => l.trimEnd());
        const last = parts[parts.length - 1];
        if (last && last.name === name) last.lines.push(...lines);
        else parts.push({ name, lines });
    });
    const out = { id: song.id, title: String(song.title || ""), artist: String(song.artist || ""), key: String(song.song_key || ""), parts, truncated: false };
    while (out.parts.length && JSON.stringify(out).length > limits.stateBytes) {
        const last = out.parts[out.parts.length - 1];
        last.lines = last.lines.slice(0, Math.max(0, last.lines.length - 10));
        if (!last.lines.length) out.parts.pop();
        out.truncated = true;
    }
    return out;
}
