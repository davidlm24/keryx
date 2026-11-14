// The end of a song (owner 2026-11-12, mockup "Fim da música com fade",
// F1–F9): Marcar os tempos marks where, on its video or playback, the song
// is over (Song.end_at, the fade Song.end_fade); songContent puts it on the
// content as `ends: { url, at, fade }`. When the media playing that url
// reaches `at`, the console ends the song as a soft Esc: its sound fades
// over `fade`, the text leaves, the papel de parede comes in, and the
// Setlist's Autoplay sees an end (clear with `ended`, live-state.mjs).
// Pure; the console watches (useConsole). Console only.
import { livePosition, fadeGain } from "../../../shared/live-state.mjs";

const LAYERS = ["audio", "video", "media"];

// The layer playing the song's media, or null.
export function endLayer(live) {
    const url = live?.content?.ends?.url;
    if (!url) return null;
    return LAYERS.find((k) => live[k]?.url === url && live[k]?.playback) || null;
}

// Whether the song on air has reached its end now: its media playing (not
// paused) at or past the mark.
export function endDue(live, now) {
    const ends = live?.content?.ends;
    const layer = endLayer(live);
    if (!ends || !layer) return false;
    const p = live[layer].playback;
    if (p.paused) return false;
    return livePosition(p, now) >= ends.at;
}

// Whether the song's media is still before its Fim now (paused or not):
// the watcher ends the song only when it CROSSES the mark, so a song put
// back at or past it (Desfazer of that very end, a seek past the Fim)
// plays on, and seeking back before it arms the end again.
export function endBefore(live, now) {
    const ends = live?.content?.ends;
    const layer = endLayer(live);
    if (!ends || !layer) return false;
    return livePosition(live[layer].playback, now) < ends.at;
}

// The song's length on the player's bar (owner 2026-11-12: "o player deve
// respeitar essa marcação como final da música"): the Fim's mark when
// `item` is the song's media, else null. The bar reaches its end where the
// watcher ends the song; the fade is the exit after it.
export function endLength(live, item) {
    const ends = live?.content?.ends;
    const at = Number(ends?.at);
    return ends?.url && item?.url === ends.url && at > 0 ? at : null;
}

// The level of the song's sound at `t` (seconds) for a Fim at `end` with a
// `fade`: 1 before the Fim, down to 0 over the fade, 0 after (Marcar os
// tempos plays its preview to the Fim this way; owner 2026-11-12).
export function endGain(t, end, fade = 3) {
    if (!(t >= end)) return 1;
    const f = Math.max(0, Number(fade) || 0);
    return f > 0 ? fadeGain(1 - (t - end) / f) : 0;
}

// The clear that ends it: the sound's own fade (ms).
export const endArgs = (live) => ({ ended: true, soundFade: Math.round((live?.content?.ends?.fade ?? 3) * 1000) });

export const END_SAY = "A música terminou no fim marcado.";
