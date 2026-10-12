// The live state: one document saying what every output shows right now.
// Operator pages change it only through applyOp (by way of src/lib/projection.js);
// outputs render it. The same module runs in the Electron main process
// (electron/live.cjs holds the document there), in the console (its previews
// apply operations to a local copy) and in node:test.
//
// Layers, top to bottom on the main projector (mainLayer):
//   screen black/logo > tool > communication > media > content
// with background under everything and overlays + alert over everything.
// Other outputs pick the layers they need (stage: content; video: video;
// avisos: communication).
//
// Times are milliseconds on the clock of whoever holds the document (the
// main process on desktop). Snapshots carry serverNow so a screen with a
// different clock can correct for it.

export const LIVE_VERSION = 1;
// The look layers the operator can stack (live.layerOrder), top first.
export const LAYER_ORDER = ["logo", "overlays", "content", "background"];
// Tela ociosa: the church logo, plain black, or a wallpaper the operator chose.
export const IDLE_MODES = ["logo", "black", "background"];
const layerOrderOf = (value) => {
    if (!Array.isArray(value) || value.length !== LAYER_ORDER.length || !LAYER_ORDER.every((k) => value.includes(k))) return null;
    return [...value];
};

export const SCREEN_MODES = ["show", "black", "logo"];
export const CONTENT_KINDS = ["lyrics", "bible", "text"];
export const MEDIA_KINDS = ["video", "image", "gif", "pdf", "powerpoint", "youtube", "audio"];
export const BACKGROUND_KINDS = ["image", "video", "color"];
export const TOOL_MODES = ["clock", "stopwatch", "timer", "freetext"];
export const ALERT_TYPES = ["alert", "message"];
// The text's look. The first ten are free text (as saved in songs and themes);
// the rest (Camadas, 2026-10-10) are typed: a number in a range or a choice.
export const STYLE_RANGES = { text_opacity: [0.2, 1], text_max_width: [40, 100], text_box_opacity: [0, 0.9], text_nudge: [-20, 20], transition_ms: [120, 600], background_dim: [0, 0.9], background_blur: [0, 20] };
export const STYLE_CHOICES = { line_height: ["tight", "normal", "loose"], text_case: ["none", "upper"], text_box: ["none", "band", "block"] };
export const STYLE_KEYS = ["font_size", "font_family", "text_effect", "text_color", "text_color_2", "background_image", "background_color", "text_align", "text_position", "transition",
    ...Object.keys(STYLE_RANGES), ...Object.keys(STYLE_CHOICES), "text_box_color"];
export const BACKGROUND_FITS = ["cover", "contain"];
export const BACKGROUND_POSITIONS = ["center", "top", "bottom"];
export const LOGO_CORNERS = ["top-left", "top-right", "bottom-left", "bottom-right"];
export const LOGO_SIZES = ["small", "medium", "large"];
// The main layers, top to bottom: what "Voltar ao anterior" remembers.
const MAIN_LAYERS = ["tool", "communication", "media", "content"];
const MAX_HISTORY = 8;

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
        // Music or a playback track on the KERYX computer (played by the main
        // projector window), under whatever the screens show. Not a main
        // layer: Encerrar leaves it playing; the player has its own stop.
        audio: null,
        tool: null,
        communication: null,
        overlays: [],
        alert: null,
        // The church logo as a corner mark over the content (the idle logo
        // and screen "logo" are separate). Off until a theme turns it on.
        logo: { visible: false, corner: "bottom-right", size: "medium" },
        // What an idle screen shows (nothing on air, screen "show"): the
        // church logo, plain black (Holyrics-style, nothing lingers), or a
        // wallpaper the operator chose (idleUrl, a media or bundled image).
        idle: "logo",
        idleUrl: null,
        // How dark (0-0.9) and blurred (px at 1920 wide) the wallpaper is;
        // null: as it is, untouched (Aparência › Fundos).
        idleDim: null,
        idleBlur: null,
        // The stacking of the look layers, top first (Camadas, drag to
        // reorder). The alert, a video-channel clip and the black/logo
        // screens always stay above all of them.
        layerOrder: [...LAYER_ORDER],
        // What was on the main projector before each change, newest first,
        // so the operator can bring it back (through the preview, never
        // straight to air).
        history: [],
        // "Travar telas" (Saídas): the screens keep what they show; nothing
        // new goes on until it is unlocked, though anything can come off
        // (WHILE_LOCKED). Rehearsal is the console with the screens locked.
        // Not kept across a restart (restoreState).
        locked: false,
    };
}

// What still works while the screens are locked: taking things off the air,
// Tela preta / Logo, the idle screen, unlocking, ending the session, and the
// outputs carrying on with what was already playing (the next video of a
// list, the next aviso of a "Tocar todos").
export const WHILE_LOCKED = new Set([
    "screens.lock", "screen.set", "idle.set", "session.end",
    "clear", "content.clear", "media.clear", "video.clear", "audio.clear", "tool.clear", "communication.clear", "alert.clear", "background.clear",
    "media.advance", "audio.advance", "communication.advance",
]);

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

// A number for a slider: not a number is an error, out of range is clamped
// (a control may send its last step; the screens never get a wild value).
function ranged(value, [min, max], label) {
    const n = Number(value);
    if (value === "" || value === null || typeof value === "boolean" || !Number.isFinite(n)) throw new LiveError(`${label} inválido.`);
    return Math.round(Math.min(max, Math.max(min, n)) * 100) / 100;
}

const HEX = /^#[0-9a-f]{6}$/i;

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
        const v = value[key];
        if (v === undefined || v === null || v === "") continue;
        if (STYLE_RANGES[key]) out[key] = ranged(v, STYLE_RANGES[key], key);
        else if (STYLE_CHOICES[key]) out[key] = oneOf(v, STYLE_CHOICES[key], key);
        else if (key === "text_box_color") { if (!HEX.test(String(v))) throw new LiveError("Cor da caixa inválida."); out[key] = String(v).toLowerCase(); }
        else out[key] = text(v, key, { max: key.startsWith("background") ? MAX_URL * 1024 : 200 });
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
    // A Bible chapter sent whole carries each verse's own reference.
    if (value.ref) out.ref = text(value.ref, "Referência do slide", { max: 200 });
    // A song part with a theme of its own (src/lib/console/songTheme.js):
    // its look, laid over the content's style by the renderer.
    if (value.style !== undefined && value.style !== null) {
        const own = style(value.style);
        if (Object.keys(own).length) out.style = own;
    }
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

// What the audio channel plays: an audio file, or a video file for its sound.
function audioItem(value) {
    const kind = isPlainObject(value) && value.kind !== undefined ? value.kind : "audio";
    oneOf(kind, ["audio", "video"], "Tipo de áudio");
    return mediaItem({ ...value, kind });
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

// The topmost main layer regardless of the screen mode.
const topLayer = (s) => MAIN_LAYERS.find((k) => s[k]) || null;

const layerTitle = (layer, data) => {
    if (layer === "content" || layer === "media") return data.title || "";
    if (layer === "communication") return String(data.item?.title || data.item?.text || data.item?.type || "");
    return data.mode || "";
};

// History patch: the main layer that is about to be replaced or taken down.
// A layer that is already the newest entry is not recorded twice.
function remember(s, now, only = null) {
    const layer = topLayer(s);
    if (!layer || (only && layer !== only)) return {};
    const data = s[layer];
    const history = s.history || [];
    if (history[0] && history[0].data === data) return {};
    const entry = { at: now, layer, title: layerTitle(layer, data), data };
    return { history: [entry, ...history].slice(0, MAX_HISTORY) };
}

const OPS = {
    "screen.set": (_s, { mode }) => ({ screen: oneOf(mode, SCREEN_MODES, "Modo da tela") }),

    // "Travar telas" on or off (see WHILE_LOCKED).
    "screens.lock": (s, { locked }) => {
        if (typeof locked !== "boolean") throw new LiveError("Travar telas: diga sim ou não.");
        return Boolean(s.locked) === locked ? null : { locked };
    },

    "session.start": (_s, { id, serviceId }, now) => ({
        session: {
            id: text(id, "Id da sessão", { max: 200 }) || globalThis.crypto.randomUUID(),
            serviceId: text(serviceId, "Culto", { max: 200 }) || null,
            startedAt: now,
        },
    }),
    "session.end": (s) => (s.session ? { session: null } : null),
    // Where the service is in its rundown (ServiceItem id and position);
    // starts a session when none is running.
    "session.item": (s, { itemId, index }, now) => ({
        session: {
            ...(s.session || { id: globalThis.crypto.randomUUID(), serviceId: null, startedAt: now }),
            itemId: text(itemId, "Item do culto", { max: 200 }) || null,
            itemIndex: index === undefined || index === null ? null : Math.trunc(count(index, "Posição no roteiro")),
            itemAt: now,
        },
    }),

    "logo.set": (s, a) => {
        const next = { ...s.logo };
        if (a.visible !== undefined) next.visible = Boolean(a.visible);
        if (a.corner !== undefined) next.corner = oneOf(a.corner, LOGO_CORNERS, "Canto do logo");
        if (a.size !== undefined) next.size = oneOf(a.size, LOGO_SIZES, "Tamanho do logo");
        // Camadas: how see-through, how far from the corner (% of the width),
        // and a free width (% of the width) that overrides the size; null resets.
        if (a.opacity !== undefined) next.opacity = a.opacity === null ? undefined : ranged(a.opacity, [0.2, 1], "Opacidade do logo");
        if (a.margin !== undefined) next.margin = a.margin === null ? undefined : ranged(a.margin, [1, 10], "Margem do logo");
        if (a.width !== undefined) next.width = a.width === null ? undefined : ranged(a.width, [4, 30], "Largura do logo");
        for (const k of ["opacity", "margin", "width"]) if (next[k] === undefined) delete next[k];
        return JSON.stringify(next) === JSON.stringify(s.logo) ? null : { logo: next };
    },

    "background.set": (_s, a) => {
        const background = {
            kind: oneOf(a.kind, BACKGROUND_KINDS, "Tipo de fundo"),
            value: text(a.value, "Fundo", { max: MAX_URL * 1024, required: true }),
            title: text(a.title, "Título", { max: 500 }),
        };
        // Camadas: how the picture fills the screen, how dark, how blurred
        // (px at 1920 wide) and which part shows; only when set.
        if (a.fit !== undefined && a.fit !== null) background.fit = oneOf(a.fit, BACKGROUND_FITS, "Ajuste do fundo");
        if (a.dim !== undefined && a.dim !== null) background.dim = ranged(a.dim, [0, 0.9], "Escurecer");
        if (a.blur !== undefined && a.blur !== null) background.blur = ranged(a.blur, [0, 20], "Desfoque");
        if (a.position !== undefined && a.position !== null) background.position = oneOf(a.position, BACKGROUND_POSITIONS, "Posição do fundo");
        return { background };
    },
    "background.clear": (s) => (s.background ? { background: null } : null),

    "content.show": (s, a, now) => {
        const items = slides(a.slides);
        return {
            ...remember(s, now),
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
    "content.clear": (s, _a, now) => (s.content ? { ...remember(s, now, "content"), content: null } : null),

    "media.show": (s, a, now) => ({
        ...remember(s, now),
        ...reveal(["tool", "communication"]),
        media: { ...mediaItem(a), playlist: null, playlistIndex: 0, shownAt: now, playback: freshPlayback(now) },
    }),
    "media.playlist": (s, a, now) => {
        const items = list(a.items, "Lista de mídias").map(mediaItem);
        if (items.length === 0) throw new LiveError("A lista de mídias está vazia.");
        const i = clampIndex(a.index, items.length);
        return {
            ...remember(s, now),
            ...reveal(["tool", "communication"]),
            media: { ...items[i], playlist: items, playlistIndex: i, shownAt: now, playback: freshPlayback(now) },
        };
    },
    // Reported by the output when an item ends. Several outputs may report
    // the same end: only the first one (fromIndex still current) advances.
    "media.advance": (s, { fromIndex }, now) => {
        const media = need(s.media, "em reprodução");
        if (!media.playlist || Number(fromIndex) !== media.playlistIndex) return null;
        const i = (media.playlistIndex + 1) % media.playlist.length;
        return { media: { ...media, ...media.playlist[i], playlistIndex: i, shownAt: now, playback: freshPlayback(now, media.playback.volume) } };
    },
    "media.clear": (s, _a, now) => (s.media ? { ...remember(s, now, "media"), media: null } : null),

    // The video channel: video screens and tablets (VideoProjection). It does
    // not cover the main projector.
    "video.show": (_s, a, now) => ({ video: { ...mediaItem(a), shownAt: now, playback: freshPlayback(now) } }),
    "video.clear": (s) => (s.video ? { video: null } : null),

    // The audio channel (see emptyState): one file or a list, a video file
    // used for its sound included.
    "audio.show": (_s, a, now) => ({ audio: { ...audioItem(a), playlist: null, playlistIndex: 0, shownAt: now, playback: freshPlayback(now) } }),
    "audio.playlist": (_s, a, now) => {
        const items = list(a.items, "Lista de áudios").map(audioItem);
        if (items.length === 0) throw new LiveError("A lista de áudios está vazia.");
        const i = clampIndex(a.index, items.length);
        return { audio: { ...items[i], playlist: items, playlistIndex: i, shownAt: now, playback: freshPlayback(now) } };
    },
    "audio.advance": (s, { fromIndex }, now) => {
        const audio = need(s.audio, "tocando");
        if (!audio.playlist || Number(fromIndex) !== audio.playlistIndex) return null;
        const i = audio.playlistIndex + 1;
        // The end of the list: it stops there (music does not wrap by itself).
        if (i >= audio.playlist.length) return { audio: { ...audio, playback: { ...audio.playback, paused: true, position: livePosition(audio.playback, now), at: now } } };
        return { audio: { ...audio, ...audio.playlist[i], playlistIndex: i, shownAt: now, playback: freshPlayback(now, audio.playback.volume) } };
    },
    "audio.clear": (s) => (s.audio ? { audio: null } : null),

    // The operator jumps to an item of a media or audio list (Anterior /
    // Próximo in the player): it starts from the top, at the same volume.
    "playlist.goTo": (s, { layer = "media", index }, now) => {
        oneOf(layer, ["media", "audio"], "Camada");
        const current = need(s[layer], "em reprodução");
        if (!current.playlist) throw new LiveError("Não é uma lista.");
        const i = clampIndex(index, current.playlist.length);
        if (i === current.playlistIndex) return null;
        return { [layer]: { ...current, ...current.playlist[i], playlistIndex: i, shownAt: now, playback: freshPlayback(now, current.playback.volume) } };
    },

    "transport": (s, { layer = "video", action, time, volume }, now) => {
        oneOf(layer, ["media", "video", "audio"], "Camada");
        const current = need(s[layer], "em reprodução");
        const pb = current.playback;
        const position = livePosition(pb, now);
        let playback;
        if (action === "play") playback = pb.paused ? { ...pb, paused: false, position, at: now } : null;
        else if (action === "pause") playback = pb.paused ? null : { ...pb, paused: true, position, at: now };
        else if (action === "seek") playback = { ...pb, position: count(time, "Posição"), at: now };
        else if (action === "volume") playback = { ...pb, volume: Math.min(1, count(volume, "Volume")) };
        // Screens try to go fullscreen (tablets need a tap; they show a button).
        else if (action === "fullscreen") return { [layer]: { ...current, fullscreenAt: now } };
        else throw new LiveError(`Comando de vídeo inválido: ${action}.`);
        return playback ? { [layer]: { ...current, playback } } : null;
    },

    "tool.show": (s, a, now) => {
        const mode = oneOf(a.mode, TOOL_MODES, "Ferramenta");
        let endsAt = null;
        if (mode === "timer") endsAt = a.endsAt != null ? count(a.endsAt, "Fim do timer") : now + count(a.durationMs, "Duração do timer", { min: 1 });
        return {
            ...remember(s, now),
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
    "tool.clear": (s, _a, now) => (s.tool ? { ...remember(s, now, "tool"), tool: null } : null),

    // Communication pieces (countdowns, announcements, image + text) are
    // free-form rows from CommunicationVideo; outputs render them.
    "communication.show": (s, a, now) => {
        const playlist = a.playlist ? list(a.playlist, "Lista").map((x) => loose(x, "Item")) : null;
        if (playlist && playlist.length === 0) throw new LiveError("A lista está vazia.");
        const i = playlist ? clampIndex(a.index, playlist.length) : 0;
        const item = playlist ? playlist[i] : loose(a.item, "Item");
        if (!isPlainObject(item)) throw new LiveError("Item de comunicação inválido.");
        return { ...remember(s, now), ...reveal(["tool"]), communication: { item, playlist, playlistIndex: i, startedAt: now } };
    },
    "communication.advance": (s, { fromIndex }, now) => {
        const c = need(s.communication, "em exibição");
        if (!c.playlist || Number(fromIndex) !== c.playlistIndex) return null;
        const i = (c.playlistIndex + 1) % c.playlist.length;
        return { communication: { ...c, item: c.playlist[i], playlistIndex: i, startedAt: now } };
    },
    "communication.clear": (s, _a, now) => (s.communication ? { ...remember(s, now, "communication"), communication: null } : null),

    "overlays.set": (_s, { overlays }) => ({
        overlays: list(overlays ?? [], "Sobreposições", 50).map((o) => loose(o, "Sobreposição")).filter(isPlainObject),
    }),

    // The idle look of the screens: part of the document, so every output
    // (local windows and network screens) renders the same emptiness.
    "layers.order": (s, { order }) => {
        const next = layerOrderOf(order);
        if (!next) throw new LiveError("Ordem de camadas inválida.");
        return next.join() === (s.layerOrder || LAYER_ORDER).join() ? null : { layerOrder: next };
    },

    // Fundo needs its image; Logo or Preto keep the last one, so choosing
    // Fundo again brings it back. A url alone (no mode) never changes the mode.
    // A new wallpaper comes with its own dim and blur (or none); the same one
    // keeps them unless new ones are given (null clears).
    "idle.set": (s, { mode, url, dim, blur }) => {
        const m = oneOf(mode, IDLE_MODES, "Tela ociosa");
        const u = url === undefined ? (s.idleUrl ?? null) : url === null || url === "" ? null : text(url, "Fundo de espera", { max: MAX_URL, required: true });
        if (m === "background" && !u) throw new LiveError("Escolha a imagem do fundo de espera.");
        const same = u === (s.idleUrl ?? null);
        const look = (given, kept, range, label) => (given !== undefined ? (given === null ? null : ranged(given, range, label)) : same ? (kept ?? null) : null);
        const d = look(dim, s.idleDim, [0, 0.9], "Escurecer");
        const b = look(blur, s.idleBlur, [0, 20], "Desfoque");
        return s.idle === m && same && (s.idleDim ?? null) === d && (s.idleBlur ?? null) === b ? null : { idle: m, idleUrl: u, idleDim: d, idleBlur: b };
    },

    "alert.show": (_s, a, now) => ({
        alert: {
            message: text(a.message, "Mensagem", { max: 2000, required: true }),
            type: oneOf(a.type ?? "alert", ALERT_TYPES, "Tipo de aviso"),
            since: now,
        },
    }),
    "alert.clear": (s) => (s.alert ? { alert: null } : null),

    // Stop: what Esc / "Encerrar" means. Background, logo, Escola bíblica,
    // overlays and alerts stay; they have their own controls.
    "clear": (s, _a, now) => ({ ...remember(s, now), screen: "show", content: null, media: null, video: null, tool: null, communication: null }),
};

export const OP_NAMES = Object.keys(OPS);

// The next document, or the same object when nothing changed.
export function applyOp(state, op, args = {}, now = Date.now()) {
    if (!Object.prototype.hasOwnProperty.call(OPS, op)) throw new LiveError(`Operação desconhecida: ${op}.`);
    // The one place the lock holds, whoever sends: the console, an output, a test.
    if (state.locked && !WHILE_LOCKED.has(op)) throw new LiveError("Telas travadas: destrave em Saídas para enviar.", 423);
    if (args === null || args === undefined) args = {};
    if (!isPlainObject(args)) throw new LiveError("Argumentos inválidos.");
    const patch = OPS[op](state, args, now);
    if (patch === null) return state;
    return { ...state, ...patch, rev: state.rev + 1, updatedAt: now };
}

// A document read back from disk after a restart: same content, screen
// black (nothing reappears on the projector by itself), playback paused
// where the last command left it (how far it played after that is unknown),
// and the screens unlocked (a lock is for the session it was set in).
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
        audio: paused(layer(saved.audio)),
        tool: layer(saved.tool),
        communication: layer(saved.communication),
        overlays: Array.isArray(saved.overlays) ? saved.overlays.filter(isPlainObject) : [],
        alert: layer(saved.alert),
        logo: { ...base.logo, ...(layer(saved.logo) || {}) },
        ...restoreIdle(saved),
        layerOrder: layerOrderOf(saved.layerOrder) || [...LAYER_ORDER],
        history: Array.isArray(saved.history) ? saved.history.filter((h) => isPlainObject(h) && isPlainObject(h.data)).slice(0, MAX_HISTORY) : [],
    };
}

// Saves from before the wallpaper (a bare "logo" / "black") still load; a
// wallpaper without its image falls back to the logo.
function restoreIdle(saved) {
    const url = typeof saved.idleUrl === "string" && saved.idleUrl ? saved.idleUrl : null;
    const mode = IDLE_MODES.includes(saved.idle) ? saved.idle : "logo";
    const num = (v, [lo, hi]) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : null);
    return { idle: mode === "background" && !url ? "logo" : mode, idleUrl: url, idleDim: num(saved.idleDim, [0, 0.9]), idleBlur: num(saved.idleBlur, [0, 20]) };
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

// What a <video> (or YouTube player) should do to follow the shared
// playback: el = { currentTime, paused, ended, duration } of the element.
// Returns { seek?: seconds, play?: true, pause?: true, volume }.
// Small drift is left alone (seeking stutters); a looping item wraps.
export function playbackPlan(el, playback, now, { loop = false, tolerance = 1.5 } = {}) {
    const plan = { volume: playback.volume ?? 1 };
    const duration = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : null;
    let target = livePosition(playback, now);
    if (duration) target = loop ? target % duration : Math.min(target, duration);
    const finished = !loop && duration && target >= duration;
    // Finished (no loop): rest on the last frame rather than replay.
    if (Math.abs((el.currentTime || 0) - target) > tolerance) plan.seek = target;
    if (playback.paused) {
        if (!el.paused) plan.pause = true;
    } else if (el.paused && !finished && !(el.ended && !loop)) {
        plan.play = true;
    }
    return plan;
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
