// The live state: one document saying what every output shows right now.
// Operator pages change it only through applyOp (by way of src/lib/projection.js);
// outputs render it. The same module runs in the Electron main process
// (electron/live.cjs holds the document there), in the web build's tab
// (src/api/backends/localLive.js) and in node:test.
//
// Layers, top to bottom on the main projector (mainLayer):
//   screen black/logo > tool > communication > media > content
// with background under everything and overlays + alert over everything.
// Other outputs pick the layers they need (stage: content; video: video;
// Escola bíblica: school).
//
// Times are milliseconds on the clock of whoever holds the document (the
// main process on desktop). Snapshots carry serverNow so a screen with a
// different clock can correct for it.

export const LIVE_VERSION = 1;

export const SCREEN_MODES = ["show", "black", "logo"];
export const CONTENT_KINDS = ["lyrics", "bible", "text"];
export const MEDIA_KINDS = ["video", "image", "gif", "pdf", "powerpoint", "youtube", "audio"];
export const BACKGROUND_KINDS = ["image", "video", "color"];
export const TOOL_MODES = ["clock", "stopwatch", "timer", "freetext"];
export const SCHOOL_KINDS = ["slides", "text", "quiz", "video", "image", "blank"];
export const ALERT_TYPES = ["alert", "message"];
export const STYLE_KEYS = ["font_size", "font_family", "text_effect", "text_color", "text_color_2", "background_image", "background_color"];

const MAX_TEXT = 20000;
const MAX_URL = 4096;
const MAX_SLIDES = 2000;
const MAX_ITEMS = 500;
const MAX_LOOSE = 200000; // JSON size of a free-form field (chords, a communication item)

export class LiveError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = "LiveError";
        this.status = status;
    }
}

export function emptyState(now = Date.now()) {
    return {
        version: LIVE_VERSION,
        rev: 0,
        updatedAt: now,
        screen: "show",
        session: null,
        background: null,
        content: null,
        media: null,
        video: null,
        tool: null,
        communication: null,
        school: null,
        overlays: [],
        alert: null,
    };
}

// -- Checking what pages send -------------------------------------------------

const isPlainObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function text(value, label, { max = MAX_TEXT, required = false } = {}) {
    if (value === undefined || value === null || value === "") {
        if (required) throw new LiveError(`Falta ${label}.`);
        return "";
    }
    if (typeof value !== "string" && typeof value !== "number") throw new LiveError(`${label} inválido.`);
    const s = String(value);
    if (s.length > max) throw new LiveError(`${label} longo demais.`, 413);
    return s;
}

function oneOf(value, allowed, label) {
    if (!allowed.includes(value)) throw new LiveError(`${label} inválido: ${value}.`);
    return value;
}

function count(value, label, { min = 0 } = {}) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < min) throw new LiveError(`${label} inválido.`);
    return n;
}

// Free-form JSON (chords, quiz questions, a communication item): kept as is,
// but it must be plain data and not huge.
function loose(value, label) {
    if (value === undefined || value === null) return null;
    let json;
    try {
        json = JSON.stringify(value);
    } catch {
        throw new LiveError(`${label} inválido.`);
    }
    if (json === undefined) return null;
    if (json.length > MAX_LOOSE) throw new LiveError(`${label} grande demais.`, 413);
    return JSON.parse(json);
}

function list(value, label, max = MAX_ITEMS) {
    if (!Array.isArray(value)) throw new LiveError(`${label} precisa ser uma lista.`);
    if (value.length > max) throw new LiveError(`${label}: itens demais.`, 413);
    return value;
}

function style(value) {
    if (value === undefined || value === null) return {};
    if (!isPlainObject(value)) throw new LiveError("Estilo inválido.");
    const out = {};
    for (const key of STYLE_KEYS) {
        if (value[key] !== undefined && value[key] !== null && value[key] !== "") {
            out[key] = text(value[key], key, { max: key.startsWith("background") ? MAX_URL * 1024 : 200 });
        }
    }
    return out;
}

function slide(value) {
    if (typeof value === "string") return { text: text(value, "Texto do slide") };
    if (!isPlainObject(value)) throw new LiveError("Slide inválido.");
    const out = { text: text(value.text, "Texto do slide") };
    if (value.duration !== undefined && value.duration !== null) out.duration = count(value.duration, "Duração do slide");
    if (value.is_chorus) out.is_chorus = true;
    if (value.image_url) out.image_url = text(value.image_url, "Imagem do slide", { max: MAX_URL * 1024 });
    if (value.label) out.label = text(value.label, "Rótulo do slide", { max: 200 });
    return out;
}

const slides = (value, label = "Slides") => list(value ?? [], label, MAX_SLIDES).map(slide);

function clampIndex(value, length) {
    const n = Math.trunc(Number(value) || 0);
    if (length <= 0) return 0;
    return Math.min(Math.max(n, 0), length - 1);
}

function mediaItem(value) {
    if (!isPlainObject(value)) throw new LiveError("Mídia inválida.");
    const out = {
        kind: oneOf(value.kind, MEDIA_KINDS, "Tipo de mídia"),
        url: text(value.url, "Endereço da mídia", { max: MAX_URL, required: true }),
        title: text(value.title, "Título", { max: 500 }),
    };
    if (value.duration !== undefined && value.duration !== null) out.duration = count(value.duration, "Duração");
    if (value.id !== undefined && value.id !== null) out.id = text(value.id, "Id", { max: 200 });
    return out;
}

const freshPlayback = (now, volume = 1) => ({ paused: false, position: 0, at: now, volume });

const need = (layer, label) => {
    if (!layer) throw new LiveError(`Nada ${label} no momento.`, 409);
    return layer;
};

// -- Operations ---------------------------------------------------------------
// Each returns the fields of the document it changes, or null for "no change"
// (no new rev, nothing broadcast).

// Putting something on the main projector reveals the screen and takes down
// the layers that would hide it.
const reveal = (above) => ({ screen: "show", ...Object.fromEntries(above.map((k) => [k, null])) });

const OPS = {
    "screen.set": (_s, { mode }) => ({ screen: oneOf(mode, SCREEN_MODES, "Modo da tela") }),

    "session.start": (_s, { id, serviceId }, now) => ({
        session: {
            id: text(id, "Id da sessão", { max: 200 }) || globalThis.crypto.randomUUID(),
            serviceId: text(serviceId, "Culto", { max: 200 }) || null,
            startedAt: now,
        },
    }),
    "session.end": (s) => (s.session ? { session: null } : null),

    "background.set": (_s, a) => ({
        background: {
            kind: oneOf(a.kind, BACKGROUND_KINDS, "Tipo de fundo"),
            value: text(a.value, "Fundo", { max: MAX_URL * 1024, required: true }),
            title: text(a.title, "Título", { max: 500 }),
        },
    }),
    "background.clear": (s) => (s.background ? { background: null } : null),

    "content.show": (_s, a, now) => {
        const items = slides(a.slides);
        return {
            ...reveal(["tool", "communication", "media"]),
            content: {
                kind: oneOf(a.kind ?? "lyrics", CONTENT_KINDS, "Tipo de conteúdo"),
                ref: loose(a.ref, "Referência") || {},
                title: text(a.title, "Título", { max: 500 }),
                artist: text(a.artist, "Artista", { max: 500 }),
                slides: items,
                index: clampIndex(a.index, items.length),
                style: style(a.style),
                stage: loose(a.stage, "Dados do palco") || {},
                // A song's playback track, played by the main projector.
                audio: text(a.audio, "Áudio", { max: MAX_URL }) || null,
                startedAt: now,
            },
        };
    },
    // Live edit of what is on screen; the slide position is kept where possible.
    "content.update": (s, a) => {
        const current = need(s.content, "projetado");
        const next = { ...current };
        if (a.slides !== undefined) next.slides = slides(a.slides);
        if (a.title !== undefined) next.title = text(a.title, "Título", { max: 500 });
        if (a.artist !== undefined) next.artist = text(a.artist, "Artista", { max: 500 });
        if (a.style !== undefined) next.style = style(a.style);
        if (a.stage !== undefined) next.stage = loose(a.stage, "Dados do palco") || {};
        if (a.audio !== undefined) next.audio = text(a.audio, "Áudio", { max: MAX_URL }) || null;
        next.index = clampIndex(a.index ?? current.index, next.slides.length);
        return { content: next };
    },
    "content.goTo": (s, { index }) => {
        const current = need(s.content, "projetado");
        const i = clampIndex(index, current.slides.length);
        return i === current.index ? null : { content: { ...current, index: i } };
    },
    "content.next": (s) => OPS["content.goTo"](s, { index: need(s.content, "projetado").index + 1 }),
    "content.prev": (s) => OPS["content.goTo"](s, { index: need(s.content, "projetado").index - 1 }),
    "content.clear": (s) => (s.content ? { content: null } : null),

    "media.show": (_s, a, now) => ({
        ...reveal(["tool", "communication"]),
        media: { ...mediaItem(a), playlist: null, playlistIndex: 0, playback: freshPlayback(now) },
    }),
    "media.playlist": (_s, a, now) => {
        const items = list(a.items, "Lista de mídias").map(mediaItem);
        if (items.length === 0) throw new LiveError("A lista de mídias está vazia.");
        const i = clampIndex(a.index, items.length);
        return {
            ...reveal(["tool", "communication"]),
            media: { ...items[i], playlist: items, playlistIndex: i, playback: freshPlayback(now) },
        };
    },
    // Reported by the output when an item ends. Several outputs may report
    // the same end: only the first one (fromIndex still current) advances.
    "media.advance": (s, { fromIndex }, now) => {
        const media = need(s.media, "em reprodução");
        if (!media.playlist || Number(fromIndex) !== media.playlistIndex) return null;
        const i = (media.playlistIndex + 1) % media.playlist.length;
        return { media: { ...media, ...media.playlist[i], playlistIndex: i, playback: freshPlayback(now, media.playback.volume) } };
    },
    "media.clear": (s) => (s.media ? { media: null } : null),

    // The video channel: video screens and tablets (VideoProjection). It does
    // not cover the main projector.
    "video.show": (_s, a, now) => ({ video: { ...mediaItem(a), playback: freshPlayback(now) } }),
    "video.clear": (s) => (s.video ? { video: null } : null),

    "transport": (s, { layer = "video", action, time, volume }, now) => {
        oneOf(layer, ["media", "video"], "Camada");
        const current = need(s[layer], "em reprodução");
        const pb = current.playback;
        const position = livePosition(pb, now);
        let playback;
        if (action === "play") playback = pb.paused ? { ...pb, paused: false, position, at: now } : null;
        else if (action === "pause") playback = pb.paused ? null : { ...pb, paused: true, position, at: now };
        else if (action === "seek") playback = { ...pb, position: count(time, "Posição"), at: now };
        else if (action === "volume") playback = { ...pb, volume: Math.min(1, count(volume, "Volume")) };
        else throw new LiveError(`Comando de vídeo inválido: ${action}.`);
        return playback ? { [layer]: { ...current, playback } } : null;
    },

    "tool.show": (_s, a, now) => {
        const mode = oneOf(a.mode, TOOL_MODES, "Ferramenta");
        let endsAt = null;
        if (mode === "timer") endsAt = a.endsAt != null ? count(a.endsAt, "Fim do timer") : now + count(a.durationMs, "Duração do timer", { min: 1 });
        return {
            ...reveal(["communication"]),
            tool: {
                mode,
                text: text(a.text, "Texto"),
                style: style(a.style),
                startedAt: a.startedAt != null ? count(a.startedAt, "Início") : now,
                endsAt,
            },
        };
    },
    "tool.clear": (s) => (s.tool ? { tool: null } : null),

    // Communication pieces (countdowns, announcements, image + text) are
    // free-form rows from CommunicationVideo; outputs render them.
    "communication.show": (_s, a, now) => {
        const playlist = a.playlist ? list(a.playlist, "Lista").map((x) => loose(x, "Item")) : null;
        if (playlist && playlist.length === 0) throw new LiveError("A lista está vazia.");
        const i = playlist ? clampIndex(a.index, playlist.length) : 0;
        const item = playlist ? playlist[i] : loose(a.item, "Item");
        if (!isPlainObject(item)) throw new LiveError("Item de comunicação inválido.");
        return { ...reveal(["tool"]), communication: { item, playlist, playlistIndex: i, startedAt: now } };
    },
    "communication.advance": (s, { fromIndex }, now) => {
        const c = need(s.communication, "em exibição");
        if (!c.playlist || Number(fromIndex) !== c.playlistIndex) return null;
        const i = (c.playlistIndex + 1) % c.playlist.length;
        return { communication: { ...c, item: c.playlist[i], playlistIndex: i, startedAt: now } };
    },
    "communication.clear": (s) => (s.communication ? { communication: null } : null),

    // Escola bíblica (BibleMaterialProjection): its own output.
    "school.show": (_s, a, now) => {
        const items = slides(a.slides);
        const questions = a.quiz_questions ? list(a.quiz_questions, "Perguntas").map((q) => loose(q, "Pergunta")) : [];
        return {
            school: {
                content_type: oneOf(a.content_type ?? "slides", SCHOOL_KINDS, "Tipo de material"),
                title: text(a.title, "Título", { max: 500 }),
                slides: items,
                index: clampIndex(a.index, items.length),
                quiz_questions: questions,
                quiz_index: clampIndex(a.quiz_index, questions.length),
                quiz_reveal: Boolean(a.quiz_reveal),
                media_url: text(a.media_url, "Endereço da mídia", { max: MAX_URL }),
                style: style(a.style),
                startedAt: now,
            },
        };
    },
    "school.update": (s, a) => {
        const current = need(s.school, "em exibição na Escola bíblica");
        const next = { ...current };
        if (a.index !== undefined) next.index = clampIndex(a.index, current.slides.length);
        if (a.quiz_index !== undefined) {
            next.quiz_index = clampIndex(a.quiz_index, current.quiz_questions.length);
            next.quiz_reveal = false;
        }
        if (a.quiz_reveal !== undefined) next.quiz_reveal = Boolean(a.quiz_reveal);
        return { school: next };
    },
    "school.clear": (s) => (s.school ? { school: null } : null),

    "overlays.set": (_s, { overlays }) => ({
        overlays: list(overlays ?? [], "Sobreposições", 50).map((o) => loose(o, "Sobreposição")).filter(isPlainObject),
    }),

    "alert.show": (_s, a, now) => ({
        alert: {
            message: text(a.message, "Mensagem", { max: 2000, required: true }),
            type: oneOf(a.type ?? "alert", ALERT_TYPES, "Tipo de aviso"),
            since: now,
        },
    }),
    "alert.clear": (s) => (s.alert ? { alert: null } : null),

    // Stop: what Esc / "Parar" means today. Background, Escola bíblica,
    // overlays and alerts stay; they have their own controls.
    "clear": () => ({ screen: "show", content: null, media: null, video: null, tool: null, communication: null }),
};

export const OP_NAMES = Object.keys(OPS);

// The next document, or the same object when nothing changed.
export function applyOp(state, op, args = {}, now = Date.now()) {
    if (!Object.prototype.hasOwnProperty.call(OPS, op)) throw new LiveError(`Operação desconhecida: ${op}.`);
    if (args === null || args === undefined) args = {};
    if (!isPlainObject(args)) throw new LiveError("Argumentos inválidos.");
    const patch = OPS[op](state, args, now);
    if (patch === null) return state;
    return { ...state, ...patch, rev: state.rev + 1, updatedAt: now };
}

// A document read back from disk after a restart: same content, screen
// black (nothing reappears on the projector by itself), playback paused
// where the last command left it (how far it played after that is unknown).
export function restoreState(saved, now = Date.now()) {
    const base = emptyState(now);
    if (!isPlainObject(saved) || saved.version !== LIVE_VERSION || !Number.isInteger(saved.rev)) return base;
    const layer = (v) => (isPlainObject(v) ? v : null);
    const paused = (l) => (l && isPlainObject(l.playback) ? { ...l, playback: { ...l.playback, paused: true, at: now } } : l);
    return {
        ...base,
        rev: saved.rev,
        screen: "black",
        session: layer(saved.session),
        background: layer(saved.background),
        content: layer(saved.content),
        media: paused(layer(saved.media)),
        video: paused(layer(saved.video)),
        tool: layer(saved.tool),
        communication: layer(saved.communication),
        school: layer(saved.school),
        overlays: Array.isArray(saved.overlays) ? saved.overlays.filter(isPlainObject) : [],
        alert: layer(saved.alert),
    };
}

// -- Reading the document (outputs and operator previews) ---------------------

// What the main projector shows, by priority.
export function mainLayer(state) {
    if (!state) return "none";
    if (state.screen === "black") return "black";
    if (state.screen === "logo") return "logo";
    for (const key of ["tool", "communication", "media", "content"]) if (state[key]) return key;
    return "none";
}

// Seconds into the media at time `now`.
export function livePosition(playback, now) {
    if (!playback) return 0;
    if (playback.paused) return playback.position;
    return playback.position + Math.max(0, now - playback.at) / 1000;
}

export const currentSlide = (content) => (content && content.slides[content.index]) || null;
export const nextSlide = (content) => (content && content.slides[content.index + 1]) || null;

// Milliseconds left on a timer (never negative), or elapsed on a stopwatch.
export function toolTime(tool, now) {
    if (!tool) return 0;
    if (tool.mode === "timer") return Math.max(0, tool.endsAt - now);
    if (tool.mode === "stopwatch") return Math.max(0, now - tool.startedAt);
    return 0;
}
