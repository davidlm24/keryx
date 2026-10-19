// Transições (owner 2026-10-16, Rodada F2; Configurações › Telas e saídas):
// the church's choices (User prefs, src/lib/prefs/schema.js) added to the
// operations that need them, so the live state (shared/live-state.mjs) never
// reads a preference and every output follows the same document.
//   - Entre áudios e vídeos: an op that starts a sound says how the sound
//     already playing gives way (`transition`: cut, fade or mix = Tocar junto).
//   - Ao tirar da tela: Esc and Limpar say how long what leaves fades out
//     (`fade`, ms; nothing = a cut); so does the player's eye, the picture of
//     a video leaving the screen or coming back while its sound plays on.
//   - Tela preta e Logo: screen.set takes the same fade while the switch is on.
// Pure: the console's liveOp and every output window's screen keys (src/lib/screenKeys.js) use it.

export const SOUND_OPS = ["video.show", "audio.show", "audio.playlist", "media.show", "media.playlist"];
// Esc (clear), Limpar (text.clear: the text layers in one change), the
// single-layer clears and the eye (Tirar / Mostrar o vídeo, Rodada G4).
export const EXIT_OPS = ["clear", "text.clear", "content.clear", "tool.clear", "communication.clear", "media.toAudio", "audio.toMedia"];

// The rows' choices, [value, label] as Seg takes them.
export const MEDIA_MODES = [["cut", "Corte"], ["fade", "Suave"], ["mix", "Tocar junto"]];
export const MEDIA_MS = [[500, "0,5 s"], [1000, "1 s"], [2000, "2 s"]];
export const CLEAR_MODES = [["cut", "Corte"], ["fade", "Suave"]];
export const CLEAR_MS = [[300, "0,3 s"], [600, "0,6 s"], [1000, "1 s"]];

// The exit fade in ms, or 0 for a cut.
export const clearFade = (prefs) => (prefs?.clear_transition === "fade" ? Number(prefs.clear_transition_ms) || 0 : 0);

// `args` with what `op` needs from the prefs (a new object; the sender's
// own choice, when it made one, wins).
export function withTransitions(op, args, prefs) {
    if (!prefs) return args;
    const a = args || {};
    if (SOUND_OPS.includes(op)) {
        if (a.transition !== undefined) return a;
        const mode = prefs.media_transition;
        return { ...a, transition: mode === "fade" ? { mode, ms: Number(prefs.media_transition_ms) || 500 } : { mode } };
    }
    const fade = EXIT_OPS.includes(op) || (op === "screen.set" && prefs.screen_transition) ? clearFade(prefs) : 0;
    return fade && a.fade === undefined ? { ...a, fade } : a;
}
