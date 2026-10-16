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

import { GENERATOR_IDS, normalizeGenerator } from "./generators.mjs";
export const LIVE_VERSION = 1;
// The look layers the operator can stack (live.layerOrder), top first.
export const LAYER_ORDER = ["logo", "overlays", "content", "background"];
// Tela ociosa: the church logo, plain black, or a wallpaper the operator chose.
export const IDLE_MODES = ["logo", "black", "background"];
// The layers Camadas' eye can hide while they stay on air (live.hiddenLayers):
// the text keeps its place (the arrows still walk it) and the Fundo stays
// chosen; the logo and the overlays have their own switches.
export const HIDEABLE_LAYERS = ["content", "background"];
const hiddenOf = (value) => (Array.isArray(value) ? HIDEABLE_LAYERS.filter((k) => value.includes(k)) : []);
const without = (s, layer) => ((s.hiddenLayers || []).includes(layer) ? { hiddenLayers: s.hiddenLayers.filter((k) => k !== layer) } : {});
export const layerHidden = (state, layer) => Boolean(state?.hiddenLayers?.includes(layer));
// The layers Camadas' padlock can hold (live.lockedLayers): with the Fundo
// locked nothing changes it — no send, no pick, no clear, whoever sends —
// and an item's own picture is not drawn over it.
export const LOCKABLE_LAYERS = ["background"];
const lockedOf = (value) => (Array.isArray(value) ? LOCKABLE_LAYERS.filter((k) => value.includes(k)) : []);
export const layerLocked = (state, layer) => Boolean(state?.lockedLayers?.includes(layer));
const LAYER_OPS = { background: ["background.set", "background.clear"] };
const layerOrderOf = (value) => {
    if (!Array.isArray(value) || value.length !== LAYER_ORDER.length || !LAYER_ORDER.every((k) => value.includes(k))) return null;
    return [...value];
};

export const SCREEN_MODES = ["show", "black", "logo"];
// "presentation" (Rodada F3, owner 2026-10-16): a PDF's pages, one picture
// per slide (slide.image_url, label "Página n"), drawn full screen on black
// with no text, title or Fundo; walked like a song's slides.
export const CONTENT_KINDS = ["lyrics", "bible", "text", "presentation"];
export const MEDIA_KINDS = ["video", "image", "gif", "pdf", "powerpoint", "youtube", "audio"];
export const BACKGROUND_KINDS = ["image", "video", "color", "generator"];
export const TOOL_MODES = ["clock", "stopwatch", "timer", "freetext"];
export const ALERT_TYPES = ["alert", "message"];
// What a song's automatic lyrics follow (owner 2026-10-15, Rodada D4): its
// video, its playback on the audio channel, or a clock the operator starts
// when the musicians play (no media at all).
export const FOLLOW_SOURCES = ["video", "audio", "clock"];
export const FOLLOW_ACTIONS = ["start", "pause", "resume"];
// Escola bíblica activities (owner 2026-10-16, Rodada E4): a slide may carry
// one (slide.activity), drawn by the renderer instead of plain text, and
// content.reveal walks it without changing slide — a quiz's right card
// (choice), the V or F (truefalse), the next word of a phrase to complete
// (blanks), more words of a verse to memorize gone (memorize), a
// discussion's timer started (discussion).
export const ACTIVITY_KINDS = ["choice", "truefalse", "blanks", "memorize", "discussion"];
// One sound at a time (owner 2026-10-16, Rodada F2): an item that starts with
// sound (video.show, audio.show, audio.playlist, media.show, media.playlist)
// stops the other sound layers — at once ("cut") or fading out ("fade", the
// stopped item rides in live.leaving until it is silent) — unless the sender
// says "mix" (Tocar junto, the old behaviour; no transition at all means the
// same). The console adds the church's choice to the op (its User prefs; this
// module never reads them). The Fundo's video is muted and never counts.
export const SOUND_LAYERS = ["media", "video", "audio"];
export const SOUND_MODES = ["cut", "fade", "mix"];
const HEARD_KINDS = ["video", "audio", "youtube"];
export const SOUND_FADE_MS = [100, 5000];
// What leaves the screens with a fade (Esc, Limpar, Tela preta, Logo): the
// op's `fade` in ms, kept as live.fade so every output draws the same one.
export const EXIT_FADE_MS = [50, 3000];
export const MAX_OPTIONS = 8;
export const MEMORIZE_ROUNDS = [1, 12];
export const DISCUSSION_MINUTES = [0.5, 60];
// The text's look. The first ten are free text (as saved in songs and themes);
// the rest (Camadas, 2026-10-10) are typed: a number in a range or a choice.
export const STYLE_RANGES = { text_opacity: [0.2, 1], text_max_width: [40, 100], text_box_opacity: [0, 0.9], text_nudge: [-20, 20], transition_ms: [120, 600], background_dim: [0, 0.9], background_blur: [0, 20] };
// Something the congregation sees or hears right now: a restart (an update,
// closing the KERYX) would take it off every screen. Read by the console
// (src/lib/console/updates.js) and the main process (closing the console).
export function isOnAir(live) {
    if (!live) return false;
    return Boolean(live.content || live.media || live.video || live.tool || live.communication || (live.audio && !live.audio.playback?.paused));
}

// verse_numbers and ref_line: how a Bible passage shows its verse numbers
// and its reference (Configurações › Bíblia e músicas, src/lib/bibleDisplay.js).
// title: the item's name over the slide, for this item (Camadas › Texto
// principal); unset, the church's choice (Aparência › Títulos nas telas).
export const STYLE_CHOICES = { line_height: ["tight", "normal", "loose"], text_case: ["none", "upper"], text_box: ["none", "band", "block"], verse_numbers: ["sup", "hide"], ref_line: ["full", "plain", "none"], title: ["show", "hide"] };
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
        // Layers hidden by Camadas' eye (HIDEABLE_LAYERS). Sending a new item
        // shows its text again; choosing a Fundo shows the Fundo again.
        hiddenLayers: [],
        // Layers held by Camadas' padlock (LOCKABLE_LAYERS).
        lockedLayers: [],
        // The Fundo padrão (background.default): what Esc puts on the Fundo.
        defaultBackground: null,
        // What was on the main projector before each change, newest first,
        // so the operator can bring it back (through the preview, never
        // straight to air).
        history: [],
        // "Travar telas" (Saídas): the screens keep what they show; nothing
        // new goes on until it is unlocked, though anything can come off
        // (WHILE_LOCKED). Rehearsal is the console with the screens locked.
        // Not kept across a restart (restoreState).
        locked: false,
        // Sound on its way out (SOUND_MODES "fade"): { layer, item, at, until }
        // per item a new sound stopped. Outputs keep playing it, bringing its
        // volume (and a video's opacity) down to 0 by `until`, then drop it;
        // the next change of the document leaves out the ones that are over.
        leaving: [],
        // How the last change that took something off the screens faded
        // (EXIT_FADE_MS): { ms, at }, `at` being that change's updatedAt, so
        // an output knows the fade is this change's. null: a cut.
        fade: null,
    };
}

// What still works while the screens are locked: taking things off the air,
// Tela preta / Logo, the idle screen, unlocking, ending the session, and the
// outputs carrying on with what was already playing (the next video of a
// list, the next aviso of a "Tocar todos").
export const WHILE_LOCKED = new Set([
    "screens.lock", "screen.set", "idle.set", "session.end", "layers.hide", "layers.lock", "background.default",
    "clear", "content.clear", "media.clear", "video.clear", "audio.clear", "tool.clear", "communication.clear", "text.clear", "alert.clear", "background.clear",
    "media.advance", "audio.advance", "communication.advance", "media.toAudio",
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

// Word positions (src/lib/activity.js counts the words of the slide's text):
// whole numbers, each once, in the order given.
const MAX_WORDS = 2000;
const wordList = (value, label) => [...new Set(list(value ?? [], label, MAX_WORDS).map((n) => Math.trunc(count(n, label))))];

// A slide's activity (ACTIVITY_KINDS), checked. `explain`: a reference or a
// line of explanation under it (a quiz shows it once revealed).
function activityOf(value) {
    if (!isPlainObject(value)) throw new LiveError("Atividade inválida.");
    const kind = oneOf(value.kind, ACTIVITY_KINDS, "Atividade");
    const out = { kind };
    const explain = text(value.explain, "Explicação", { max: 500 });
    if (explain) out.explain = explain;
    if (kind === "choice") {
        out.options = list(value.options ?? [], "Opções", MAX_OPTIONS).map((o) => text(o, "Opção", { max: 500 }));
        if (out.options.length < 2) throw new LiveError("O quiz precisa de pelo menos duas opções.");
        out.correct = clampIndex(value.correct, out.options.length);
    } else if (kind === "truefalse") {
        out.correct = oneOf(Number(value.correct ?? 0), [0, 1], "Resposta");
    } else if (kind === "blanks") {
        out.blanks = wordList(value.blanks, "Lacunas").sort((a, b) => a - b);
        if (!out.blanks.length) throw new LiveError("Escolha ao menos uma palavra para completar.");
    } else if (kind === "memorize") {
        out.order = wordList(value.order, "Ordem das palavras");
        out.rounds = Math.round(ranged(value.rounds ?? 4, MEMORIZE_ROUNDS, "Rodadas"));
    } else {
        out.minutes = ranged(value.minutes ?? 5, DISCUSSION_MINUTES, "Minutos");
    }
    return out;
}

// How many reveals a slide's activity has (0: none): one for a quiz, a V or
// F and a discussion's timer, a word at a time for blanks, the rounds of a
// verse to memorize.
export function activitySteps(slide) {
    const a = slide?.activity;
    if (!a) return 0;
    if (a.kind === "blanks") return a.blanks?.length || 0;
    if (a.kind === "memorize") return a.rounds || 0;
    return 1;
}
// How far the slide `index` (the one on air by default) was revealed, and
// since when (content.revealed: each slide keeps it, so going back to a
// question finds it as it was left).
export const revealOf = (content, index = content?.index) => content?.revealed?.[index] || null;
export const revealStep = (content, index) => revealOf(content, index)?.step || 0;
function revealedWith(revealed, index, step, now) {
    const next = { ...(revealed || {}) };
    if (step > 0) next[index] = { step, at: now };
    else delete next[index];
    return next;
}
// After a live edit: only what still fits the slides now.
function revealedFor(revealed, items) {
    const out = {};
    for (const [k, r] of Object.entries(revealed || {})) {
        const max = activitySteps(items[Number(k)]);
        if (max && r?.step > 0) out[k] = { ...r, step: Math.min(r.step, max) };
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
    // Where the slide comes in, in seconds of the song (Sincronizar): what
    // the automatic lyrics follow (content.follow).
    if (value.start !== undefined && value.start !== null) out.start = count(value.start, "Início do slide");
    // A Bible chapter sent whole carries each verse's own reference.
    if (value.ref) out.ref = text(value.ref, "Referência do slide", { max: 200 });
    // A song part with a theme of its own (src/lib/console/songTheme.js):
    // its look, laid over the content's style by the renderer.
    if (value.style !== undefined && value.style !== null) {
        const own = style(value.style);
        if (Object.keys(own).length) out.style = own;
    }
    if (value.activity !== undefined && value.activity !== null) out.activity = activityOf(value.activity);
    return out;
}

const slides = (value, label = "Slides") => list(value ?? [], label, MAX_SLIDES).map(slide);

// A song's automatic lyrics (content.follow): the slide on air follows the
// source's position plus `offset` (the arrows re-sync it, never turn it
// off: owner 2026-10-15). `clock`: the live clock's own playback, null until
// the operator starts it. Only with slides that have a start.
function followOf(value, items) {
    if (value === undefined || value === null) return null;
    if (!isPlainObject(value)) throw new LiveError("Letra automática inválida.");
    const source = oneOf(value.source, FOLLOW_SOURCES, "Fonte da letra automática");
    if (!items.some((it) => Number.isFinite(it.start))) return null;
    const out = { source, paused: source === "clock", offset: 0, clock: null, pausedIndex: null };
    if (source !== "clock") out.url = text(value.url, "Endereço da mídia", { max: MAX_URL, required: true });
    if (value.length !== undefined && value.length !== null) out.length = count(value.length, "Duração");
    return out;
}

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
    // A still of a video (Media.thumbnail_url), for previews that do not play it.
    if (value.poster) out.poster = text(value.poster, "Miniatura", { max: MAX_URL });
    return out;
}

// What the audio channel plays: an audio file, or a video file for its sound.
function audioItem(value) {
    const kind = isPlainObject(value) && value.kind !== undefined ? value.kind : "audio";
    oneOf(kind, ["audio", "video"], "Tipo de áudio");
    return mediaItem({ ...value, kind });
}

const freshPlayback = (now, volume = 1) => ({ paused: false, position: 0, at: now, volume });

// What can move between the projector and the audio channel (media.toAudio).
const SOUND_KINDS = ["video", "audio"];
// An item moved to another layer: the same file, at the same second and
// volume, paused or not; shownAt is now, so the player follows it.
function carried(item, now) {
    const out = { kind: item.kind, url: item.url, title: item.title || "" };
    if (item.duration != null) out.duration = item.duration;
    if (item.id != null) out.id = item.id;
    if (item.poster) out.poster = item.poster;
    const pb = item.playback;
    out.playback = { paused: Boolean(pb?.paused), position: livePosition(pb, now), at: now, volume: pb?.volume ?? 1 };
    out.shownAt = now;
    return out;
}

const need = (layer, label) => {
    if (!layer) throw new LiveError(`Nada ${label} no momento.`, 409);
    return layer;
};

// The volume a new item starts at: 1, or the sender's (`muted`: 0).
const startVolume = (a) => (a.muted === true ? 0 : a.volume === undefined || a.volume === null ? 1 : ranged(a.volume, [0, 1], "Volume"));

// Something that can be heard right now: a video, an audio file or YouTube,
// not at volume 0 (a picture, a PDF, a muted video are not).
export const heard = (item) => Boolean(item && HEARD_KINDS.includes(item.kind) && (item.playback?.volume ?? 1) > 0);

// A sound op's `transition` ({ mode, ms }), checked: null for "mix" or none.
function soundTransition(value) {
    if (value === undefined || value === null) return null;
    if (!isPlainObject(value)) throw new LiveError("Transição inválida.");
    const mode = oneOf(value.mode, SOUND_MODES, "Transição");
    if (mode === "mix") return null;
    return { mode, ms: mode === "fade" ? Math.round(ranged(value.ms ?? 500, SOUND_FADE_MS, "Duração da transição")) : 0 };
}

// An exit op's `fade` (ms) as live.fade; none, 0 or false: a cut (null).
const exitFade = (value, now) => (value === undefined || value === null || value === false || value === 0 ? null : { ms: Math.round(ranged(value, EXIT_FADE_MS, "Transição")), at: now });

// One sound at a time (SOUND_MODES): `item` starts on `layer`, so every
// layer that can be heard gives way — another layer goes (the media layer
// into the history, like any change of the projector), the same layer is
// being replaced anyway — and with "fade" each one rides in live.leaving
// (without its list) until it is silent. Nothing when `item` is silent.
function hush(s, layer, item, value, now) {
    const t = soundTransition(value);
    if (!t || !heard(item)) return {};
    const out = {};
    const leaving = [];
    for (const k of SOUND_LAYERS) {
        const cur = s[k];
        if (!heard(cur)) continue;
        if (k !== layer) out[k] = null;
        if (t.mode === "fade") {
            const gone = { ...cur };
            delete gone.playlist;
            delete gone.playlistIndex;
            leaving.push({ layer: k, item: gone, at: now, until: now + t.ms });
        }
    }
    if (out.media === null) Object.assign(out, remember(s, now, "media"));
    if (leaving.length) out.leaving = [...(s.leaving || []), ...leaving];
    return out;
}

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

// A background as background.set takes it (and the Fundo padrão), checked.
function backgroundOf(a) {
    const background = {
        kind: oneOf(a.kind, BACKGROUND_KINDS, "Tipo de fundo"),
        value: text(a.value, "Fundo", { max: MAX_URL * 1024, required: true }),
        title: text(a.title, "Título", { max: 500 }),
    };
    // A generated background (generators.mjs): the generator is the
    // value, its numbers and colours ride in `gen`, always complete.
    if (background.kind === "generator") {
        oneOf(background.value, GENERATOR_IDS, "Gerador");
        background.gen = normalizeGenerator({ ...(isPlainObject(a.gen) ? a.gen : {}), id: background.value });
    }
    // Camadas: how the picture fills the screen, how dark, how blurred
    // (px at 1920 wide) and which part shows; only when set.
    if (a.fit !== undefined && a.fit !== null) background.fit = oneOf(a.fit, BACKGROUND_FITS, "Ajuste do fundo");
    if (a.dim !== undefined && a.dim !== null) background.dim = ranged(a.dim, [0, 0.9], "Escurecer");
    if (a.blur !== undefined && a.blur !== null) background.blur = ranged(a.blur, [0, 20], "Desfoque");
    if (a.position !== undefined && a.position !== null) background.position = oneOf(a.position, BACKGROUND_POSITIONS, "Posição do fundo");
    return background;
}

// The follow re-synced so the slide `at` is where the source is now.
function resynced(s, f, at, now) {
    const pos = followPosition({ ...s, content: { ...s.content, follow: f } }, now);
    if (pos === null || !Number.isFinite(at?.start)) return f;
    return { ...f, offset: Math.round((at.start - pos) * 100) / 100 };
}

const OPS = {
    // `fade`: Tela preta and Logo come in and go out with the exit fade.
    "screen.set": (_s, { mode, fade }, now) => ({ screen: oneOf(mode, SCREEN_MODES, "Modo da tela"), fade: exitFade(fade, now) }),

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

    "background.set": (s, a) => ({ background: backgroundOf(a), ...without(s, "background") }),
    // The Fundo padrão (the service's, else the day's, else the church's;
    // src/lib/console/defaultFundo.js): what Esc puts on the Fundo (clear,
    // below). It changes nothing on screen by itself, so it is accepted with
    // the screens locked. null: none (Esc leaves the Fundo as it is).
    "background.default": (s, a) => {
        const next = a.background === null || a.background === undefined ? null : backgroundOf(isPlainObject(a.background) ? a.background : {});
        return JSON.stringify(next) === JSON.stringify(s.defaultBackground ?? null) ? null : { defaultBackground: next };
    },
    "background.clear": (s) => (s.background ? { background: null } : null),

    "content.show": (s, a, now) => {
        const items = slides(a.slides);
        return {
            ...remember(s, now),
            ...reveal(["tool", "communication", "media"]),
            ...without(s, "content"),
            content: {
                kind: oneOf(a.kind ?? "lyrics", CONTENT_KINDS, "Tipo de conteúdo"),
                ref: loose(a.ref, "Referência") || {},
                title: text(a.title, "Título", { max: 500 }),
                artist: text(a.artist, "Artista", { max: 500 }),
                slides: items,
                index: clampIndex(a.index, items.length),
                style: style(a.style),
                stage: loose(a.stage, "Dados do palco") || {},
                // A song's playback track, played by the main projector (rows
                // sent before Rodada D4; a playback now goes to the audio channel).
                audio: text(a.audio, "Áudio", { max: MAX_URL }) || null,
                follow: followOf(a.follow, items),
                // How far each slide's activity was revealed (content.reveal).
                revealed: {},
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
        if (a.slides !== undefined && current.revealed) next.revealed = revealedFor(current.revealed, next.slides);
        // New marks (the song saved while on air): a follow still running keeps
        // its clock and offset; one the song no longer has goes.
        if (a.follow !== undefined) {
            const f = followOf(a.follow, next.slides);
            const keep = f && current.follow && current.follow.source === f.source && current.follow.url === f.url;
            next.follow = keep ? { ...current.follow, ...(f.length !== undefined ? { length: f.length } : {}) } : f;
        } else if (current.follow && !next.slides.some((it) => Number.isFinite(it.start))) next.follow = null;
        return { content: next };
    },
    // `auto`: the automatic lyrics moving on (useLyricFollow). Anyone else
    // moving the slide of a song that follows re-syncs it there: from then
    // on it follows from the new place (owner 2026-10-15, "continua seguindo").
    "content.goTo": (s, { index, auto }, now) => {
        const current = need(s.content, "projetado");
        const i = clampIndex(index, current.slides.length);
        if (i === current.index) return null;
        const f = current.follow;
        if (auto || !f || f.paused) return { content: { ...current, index: i } };
        return { content: { ...current, index: i, follow: resynced(s, f, current.slides[i], now) } };
    },
    // Letra automática: start the live clock, pause following (the band
    // repeated a chorus, a prayer in the middle) and resume it.
    "content.follow": (s, { action }, now) => {
        const current = need(s.content, "projetado");
        const f = current.follow;
        if (!f) throw new LiveError("Esta música não tem letra automática.", 409);
        oneOf(action, FOLLOW_ACTIONS, "Comando da letra automática");
        const at = current.slides[current.index];
        let next;
        if (action === "start" || (action === "resume" && f.source === "clock" && !f.clock)) {
            // The live clock starts where the slide on air comes in (the
            // first one: from 0, the introduction).
            const position = current.index > 0 && Number.isFinite(at?.start) ? at.start : 0;
            next = { ...f, paused: false, offset: 0, pausedIndex: null, clock: f.source === "clock" ? { paused: false, position, at: now } : f.clock };
        } else if (action === "pause") {
            if (f.paused) return null;
            const clock = f.clock && !f.clock.paused ? { paused: true, position: livePosition(f.clock, now), at: now } : f.clock;
            next = { ...f, paused: true, pausedIndex: current.index, clock };
        } else {
            if (!f.paused) return null;
            const clock = f.clock && f.clock.paused ? { paused: false, position: f.clock.position, at: now } : f.clock;
            const running = { ...f, paused: false, pausedIndex: null, clock };
            // Moved while paused: it goes on from the slide on air.
            next = f.pausedIndex !== null && f.pausedIndex !== current.index ? resynced(s, running, at, now) : running;
        }
        return { content: { ...current, follow: next } };
    },
    // Revelar (Escola bíblica): the activity of slide `index` (the one on air
    // by default) one step on (`by` 1, the default), back (-1) or to `step`;
    // the slide stays. Like moving the slide, refused while locked.
    "content.reveal": (s, { index, step, by }, now) => {
        const current = need(s.content, "projetado");
        const i = index === undefined || index === null ? current.index : clampIndex(index, current.slides.length);
        const max = activitySteps(current.slides[i]);
        if (!max) throw new LiveError("Este slide não tem nada para revelar.", 409);
        const at = revealStep(current, i);
        const to = step !== undefined && step !== null ? Math.trunc(count(step, "Passo")) : at + Math.trunc(Number(by ?? 1) || 0);
        const next = Math.max(0, Math.min(max, to));
        return next === at ? null : { content: { ...current, revealed: revealedWith(current.revealed, i, next, now) } };
    },
    // → and ← (keys, the outputs, the controle remoto): a slide with an
    // activity is walked a step at a time before moving on (→ reveals the
    // answer, then goes to the next question; ← hides it again first).
    "content.next": (s, _a, now) => {
        const current = need(s.content, "projetado");
        if (revealStep(current) < activitySteps(currentSlide(current))) return OPS["content.reveal"](s, { by: 1 }, now);
        return OPS["content.goTo"](s, { index: current.index + 1 }, now);
    },
    "content.prev": (s, _a, now) => {
        const current = need(s.content, "projetado");
        if (revealStep(current) > 0) return OPS["content.reveal"](s, { by: -1 }, now);
        return OPS["content.goTo"](s, { index: current.index - 1 }, now);
    },
    "content.clear": (s, a, now) => (s.content ? { ...remember(s, now, "content"), content: null, fade: exitFade(a.fade, now) } : null),

    // `transition` ({ mode, ms }, SOUND_MODES): how the sound already
    // playing gives way to this one; `volume` / `muted`: how it starts.
    "media.show": (s, a, now) => {
        const media = { ...mediaItem(a), playlist: null, playlistIndex: 0, shownAt: now, playback: freshPlayback(now, startVolume(a)) };
        return { ...remember(s, now), ...reveal(["tool", "communication"]), ...hush(s, "media", media, a.transition, now), media };
    },
    "media.playlist": (s, a, now) => {
        const items = list(a.items, "Lista de mídias").map(mediaItem);
        if (items.length === 0) throw new LiveError("A lista de mídias está vazia.");
        const i = clampIndex(a.index, items.length);
        const media = { ...items[i], playlist: items, playlistIndex: i, shownAt: now, playback: freshPlayback(now, startVolume(a)) };
        return { ...remember(s, now), ...reveal(["tool", "communication"]), ...hush(s, "media", media, a.transition, now), media };
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
    "video.show": (s, a, now) => {
        const video = { ...mediaItem(a), shownAt: now, playback: freshPlayback(now, startVolume(a)) };
        return { ...hush(s, "video", video, a.transition, now), video };
    },
    "video.clear": (s) => (s.video ? { video: null } : null),

    // The audio channel (see emptyState): one file or a list, a video file
    // used for its sound included.
    "audio.show": (s, a, now) => {
        const audio = { ...audioItem(a), playlist: null, playlistIndex: 0, shownAt: now, playback: freshPlayback(now, startVolume(a)) };
        return { ...hush(s, "audio", audio, a.transition, now), audio };
    },
    "audio.playlist": (s, a, now) => {
        const items = list(a.items, "Lista de áudios").map(audioItem);
        if (items.length === 0) throw new LiveError("A lista de áudios está vazia.");
        const i = clampIndex(a.index, items.length);
        const audio = { ...items[i], playlist: items, playlistIndex: i, shownAt: now, playback: freshPlayback(now, startVolume(a)) };
        return { ...hush(s, "audio", audio, a.transition, now), audio };
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

    // "Tirar o vídeo · o som continua" (the player, as in Holyrics): the
    // video on the projector leaves the screen and its sound carries on in
    // the audio channel, from the same second at the same volume, so it
    // survives Esc and whatever is sent next. A list goes along (only what
    // can be heard) and, as music, stops at its end. Taking something off
    // the screen, so it works locked.
    "media.toAudio": (s, _a, now) => {
        const media = need(s.media, "em reprodução");
        if (media.kind === "youtube") throw new LiveError("Um vídeo do YouTube não toca só o som.");
        if (!SOUND_KINDS.includes(media.kind)) throw new LiveError("Esta mídia não tem som.");
        const list = media.playlist || [];
        const items = list.filter((it) => SOUND_KINDS.includes(it.kind));
        const index = list.slice(0, media.playlistIndex).filter((it) => SOUND_KINDS.includes(it.kind)).length;
        const playlist = items.length > 1 ? items : null;
        return {
            ...remember(s, now, "media"),
            media: null,
            audio: { ...carried(media, now), playlist, playlistIndex: playlist ? index : 0 },
        };
    },
    // "Mostrar o vídeo": the way back, a video file the audio channel plays
    // goes on the projector again, from the same second.
    "audio.toMedia": (s, _a, now) => {
        const audio = need(s.audio, "tocando");
        if (audio.kind !== "video") throw new LiveError("Só um vídeo volta para a tela.");
        return {
            ...remember(s, now),
            ...reveal(["tool", "communication"]),
            audio: null,
            media: { ...carried(audio, now), playlist: audio.playlist || null, playlistIndex: audio.playlist ? audio.playlistIndex : 0 },
        };
    },

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
    // Time given or taken on a timer already on air (−1 min, +1 min, +5 min).
    // A timer that ran out starts again from now; taking more than is left
    // leaves it at zero. Refused while the screens are locked (it changes them).
    "tool.adjust": (s, a, now) => {
        const tool = need(s.tool, "projetado");
        if (tool.mode !== "timer") throw new LiveError("Só o timer aceita mais ou menos tempo.");
        const d = Number(a.deltaMs);
        if (a.deltaMs === "" || a.deltaMs == null || !Number.isFinite(d) || d === 0 || Math.abs(d) > 3 * 3600000) throw new LiveError("Tempo inválido para o timer.");
        return { tool: { ...tool, endsAt: Math.max(now, Math.max(tool.endsAt, now) + d) } };
    },
    "tool.clear": (s, a, now) => (s.tool ? { ...remember(s, now, "tool"), tool: null, fade: exitFade(a.fade, now) } : null),

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
    "communication.clear": (s, a, now) => (s.communication ? { ...remember(s, now, "communication"), communication: null, fade: exitFade(a.fade, now) } : null),
    // Limpar texto (C): the timer, the aviso and the text go in ONE change, so
    // an output fades once from what the audience saw. Three clears in a row
    // drew the song hidden under an aviso fading out (the exit ghost is the
    // screen before each change). The history keeps what the three would.
    "text.clear": (s, a, now) => {
        let cur = s;
        for (const layer of ["tool", "communication", "content"]) {
            if (cur[layer]) cur = { ...cur, ...remember(cur, now, layer), [layer]: null };
        }
        if (cur === s) return null;
        return { ...(cur.history !== s.history ? { history: cur.history } : {}), tool: null, communication: null, content: null, fade: exitFade(a.fade, now) };
    },

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
    // Camadas' eye: hide a layer and keep it (hiding works locked, like
    // anything that comes off the air; showing it again does not).
    "layers.hide": (s, { layer }) => {
        oneOf(layer, HIDEABLE_LAYERS, "Camada");
        return layerHidden(s, layer) ? null : { hiddenLayers: [...(s.hiddenLayers || []), layer] };
    },
    // Camadas' padlock: hold a layer as it is, or let it go (works locked:
    // it never puts anything on air).
    "layers.lock": (s, { layer, locked }) => {
        oneOf(layer, LOCKABLE_LAYERS, "Camada");
        if (typeof locked !== "boolean") throw new LiveError("Travar a camada: diga sim ou não.");
        if (layerLocked(s, layer) === locked) return null;
        return { lockedLayers: locked ? [...(s.lockedLayers || []), layer] : s.lockedLayers.filter((k) => k !== layer) };
    },
    "layers.show": (s, { layer }) => {
        oneOf(layer, HIDEABLE_LAYERS, "Camada");
        return layerHidden(s, layer) ? without(s, layer) : null;
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

    // Stop: what Esc / "Encerrar" means. Logo, Escola bíblica, overlays and
    // alerts stay; they have their own controls. The Fundo goes back to the
    // Fundo padrão (owner's decision 2026-10-12: with nothing on air the
    // screen shows the service's, else the day's background) — unless the
    // padlock holds it; with no Fundo padrão it stays as it is. The audio
    // channel plays on, hushed by nothing. `fade`: what goes fades out.
    "clear": (s, a, now) => {
        const fundo = s.defaultBackground && !layerLocked(s, "background") ? { background: { ...s.defaultBackground }, ...without(s, "background") } : {};
        return { ...remember(s, now), ...without(s, "content"), ...fundo, screen: "show", content: null, media: null, video: null, tool: null, communication: null, fade: exitFade(a.fade, now) };
    },
};

export const OP_NAMES = Object.keys(OPS);

// The next document, or the same object when nothing changed.
export function applyOp(state, op, args = {}, now = Date.now()) {
    if (!Object.prototype.hasOwnProperty.call(OPS, op)) throw new LiveError(`Operação desconhecida: ${op}.`);
    // The one place the lock holds, whoever sends: the console, an output, a test.
    if (state.locked && !WHILE_LOCKED.has(op)) throw new LiveError("Telas travadas: destrave em Saídas para enviar.", 423);
    for (const layer of state.lockedLayers || []) {
        if (LAYER_OPS[layer]?.includes(op)) throw new LiveError("O Fundo está travado: destrave o cadeado em Camadas.", 423);
    }
    if (args === null || args === undefined) args = {};
    if (!isPlainObject(args)) throw new LiveError("Argumentos inválidos.");
    const patch = OPS[op](state, args, now);
    if (patch === null) return state;
    const next = { ...state, ...patch, rev: state.rev + 1, updatedAt: now };
    // Sound that has finished leaving goes with the next change.
    if (next.leaving?.some((e) => !(e.until > now))) next.leaving = next.leaving.filter((e) => e.until > now);
    return next;
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
        content: restoredContent(layer(saved.content), now),
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
        hiddenLayers: hiddenOf(saved.hiddenLayers),
        lockedLayers: lockedOf(saved.lockedLayers),
        defaultBackground: savedBackground(saved.defaultBackground),
        history: Array.isArray(saved.history) ? saved.history.filter((h) => isPlainObject(h) && isPlainObject(h.data)).slice(0, MAX_HISTORY) : [],
    };
}

// Content read back after a restart: automatic lyrics wait (a live clock
// does not run on through the restart).
function restoredContent(c, now) {
    if (!c || !isPlainObject(c.follow)) return c;
    const f = c.follow;
    const clock = isPlainObject(f.clock) ? { ...f.clock, paused: true, position: Number(f.clock.position) || 0, at: now } : null;
    return { ...c, follow: { ...f, paused: true, pausedIndex: Number.isInteger(c.index) ? c.index : null, clock } };
}

// A saved background, checked again (null when it no longer passes).
function savedBackground(v) {
    if (!isPlainObject(v)) return null;
    try { return backgroundOf(v); } catch { return null; }
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

// Seconds into what a song's automatic lyrics follow (content.follow): the
// live clock, or the layer playing its file (the video channel, the audio
// channel, or the projector — the player's eye moves it between them).
// null when it is not there or the clock has not started.
export function followPosition(state, now) {
    const f = state?.content?.follow;
    if (!f) return null;
    if (f.source === "clock") return f.clock ? livePosition(f.clock, now) : null;
    for (const k of ["video", "audio", "media"]) {
        const l = state[k];
        if (l && l.url === f.url && l.playback) return livePosition(l.playback, now);
    }
    return null;
}

// The last slide with a start at or before `t` seconds (-1: none yet).
export function slideAtTime(slides, t) {
    let at = -1;
    (slides || []).forEach((it, i) => { if (Number.isFinite(it?.start) && it.start <= t + 1e-6) at = i; });
    return at;
}

// The slide the automatic lyrics want on air now, or null to leave it.
export function followIndex(state, now) {
    const c = state?.content;
    const f = c?.follow;
    if (!f || f.paused) return null;
    const pos = followPosition(state, now);
    if (pos === null) return null;
    const i = slideAtTime(c.slides, pos + (f.offset || 0));
    return i < 0 ? null : i;
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
