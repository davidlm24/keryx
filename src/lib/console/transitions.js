// Transições (owner 2026-10-16, Rodada F2; Configurações › Telas e saídas):
// the church's choices (User prefs, src/lib/prefs/schema.js) added to the
// operations that need them, so the live state (shared/live-state.mjs) never
// reads a preference and every output follows the same document.
//   - Entre áudios e vídeos: an op that starts a sound says how the sound
//     already playing gives way (`transition`: cut, fade or mix = Tocar junto);
//     Anterior / Próximo in the player too (the track that stops, Rodada G3).
//   - Ao pausar o som (Rodada G3): Pausar and Tocar in the player fade the
//     volume (`fade`, ms; nothing = a cut), and so does the music a Desfazer
//     brings back (`fadeIn: true` becomes those ms).
//   - Ao tirar do ar: Esc, Limpar and Parar say how long what leaves fades
//     out (`fade`, ms; nothing = a cut); the player's music leaves with it. So does
//     the player's eye: the picture of a video leaving the screen while its
//     sound plays on (Rodada G4); coming back (Mostrar o vídeo) it enters,
//     as a video (Rodada G5).
//   - Tela preta e Logo: screen.set takes the same fade while the switch is on.
//   - Ao entrar ou trocar (Rodada G5): what enters the screens or replaces
//     something else fades in over what was there (`fade`, ms; nothing = a
//     cut), each kind of content as Por tipo de conteúdo says (the timer:
//     Corte, the count does not wait). Moving the slide stays the theme's.
// Pure: the console's liveOp, every output window's screen keys
// (src/lib/screenKeys.js) and the outputs that move a list on (enterFade).
import { mediaType, TRANSITION_TYPE_IDS } from "../contentKinds.js";

export const SOUND_OPS = ["video.show", "audio.show", "audio.playlist", "media.show", "media.playlist"];
// Esc (clear), Limpar (text.clear: the text layers in one change) and the
// single-layer clears, Parar in the player (media, video, audio) included,
// and the eye's Tirar o vídeo (Rodada G4; Mostrar o vídeo enters, below).
export const EXIT_OPS = ["clear", "text.clear", "content.clear", "tool.clear", "communication.clear", "media.clear", "video.clear", "audio.clear", "media.toAudio"];
// What puts something new on the screens, or replaces what was there (an
// output moving a list of pictures on asks enterFade itself: media.advance).
export const ENTER_OPS = ["content.show", "media.show", "media.playlist", "video.show", "audio.toMedia", "tool.show", "communication.show", "communication.advance"];

// The rows' choices, [value, label] as Seg takes them.
export const MEDIA_MODES = [["cut", "Corte"], ["fade", "Suave"], ["mix", "Tocar junto"]];
export const MEDIA_MS = [[500, "0,5 s"], [1000, "1 s"], [2000, "2 s"]];
export const CLEAR_MODES = [["cut", "Corte"], ["fade", "Suave"]];
export const CLEAR_MS = [[300, "0,3 s"], [600, "0,6 s"], [1000, "1 s"]];
export const PAUSE_MS = [[0, "Corte"], [200, "0,2 s"], [400, "0,4 s"]];
export const ENTER_MODES = [["cut", "Corte"], ["fade", "Suave"]];
export const ENTER_MS = [[300, "0,3 s"], [500, "0,5 s"], [1000, "1 s"]];
// Por tipo de conteúdo: "" follows the row above (Padrão).
export const KIND_MODES = [["", "Padrão"], ["cut", "Corte"], ["fade", "Suave"]];
// How long a picture of a list stays up when it says nothing (LiveMediaView).
export const IMAGE_SECONDS = 5;

// The exit fade in ms, or 0 for a cut.
export const clearFade = (prefs) => (prefs?.clear_transition === "fade" ? Number(prefs.clear_transition_ms) || 0 : 0);
// The pause fade in ms, or 0 for a cut.
export const pauseFade = (prefs) => Number(prefs?.pause_fade_ms) || 0;

// How a kind of content (src/lib/contentKinds.js) enters: its own choice,
// else Corte for the timer (the count does not wait), else the row's.
export function kindMode(prefs, type) {
    const own = prefs?.enter_transition_kinds?.[type];
    if (own === "cut" || own === "fade") return own;
    return type === "tool" ? "cut" : prefs?.enter_transition === "cut" ? "cut" : "fade";
}
// Its fade in ms, or 0 for a cut. A picture of a list fades at most a
// quarter of the time it stays up (`item`, a media item with its duration).
export function enterFade(prefs, type, item = null) {
    if (!prefs || !TRANSITION_TYPE_IDS.includes(type) || kindMode(prefs, type) !== "fade") return 0;
    const ms = Number(prefs.enter_transition_ms) || 500;
    return type === "image" && item?.playlist ? Math.min(ms, Math.round((item.duration || IMAGE_SECONDS) * 250)) : ms;
}

// The kind of what `op` puts on the screens, and the item it starts with (for
// a list of pictures), else null.
function entering(op, a) {
    if (op === "content.show") return { type: a.kind ?? "lyrics" };
    if (op === "media.show") return { type: mediaType(a.kind) };
    if (op === "media.playlist") {
        const items = Array.isArray(a.items) ? a.items : [];
        const item = items[Math.max(0, Math.min(items.length - 1, Math.trunc(Number(a.index) || 0)))];
        return item ? { type: mediaType(item.kind), item: { ...item, playlist: items } } : null;
    }
    if (op === "video.show" || op === "audio.toMedia") return { type: "video" };
    if (op === "tool.show") return { type: "tool" };
    if (op === "communication.show" || op === "communication.advance") return { type: "notice" };
    return null;
}

const soundTransition = (prefs) => {
    const mode = prefs.media_transition;
    return mode === "fade" ? { mode, ms: Number(prefs.media_transition_ms) || 500 } : { mode };
};

// `args` with what `op` needs from the prefs (a new object; the sender's
// own choice, when it made one, wins).
export function withTransitions(op, args, prefs) {
    if (!prefs) return args;
    let a = args || {};
    // A Desfazer asks for "the pause fade" (fadeIn: true): its ms, or none.
    if (a.fadeIn === true) {
        const { fadeIn: _asked, ...rest } = a;
        const ms = pauseFade(prefs);
        a = ms ? { ...rest, fadeIn: ms } : rest;
    }
    if ((SOUND_OPS.includes(op) || op === "playlist.goTo") && a.transition === undefined) a = { ...a, transition: soundTransition(prefs) };
    if (op === "playlist.goTo") return a;
    if (op === "transport" && (a.action === "pause" || a.action === "play")) {
        const ms = pauseFade(prefs);
        return ms && a.fade === undefined ? { ...a, fade: ms } : a;
    }
    const enter = entering(op, a);
    const fade = enter ? enterFade(prefs, enter.type, enter.item)
        : EXIT_OPS.includes(op) || (op === "screen.set" && prefs.screen_transition) ? clearFade(prefs) : 0;
    return fade && a.fade === undefined ? { ...a, fade } : a;
}
