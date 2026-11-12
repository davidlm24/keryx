// The end of a song (owner 2026-11-12, mockup "Fim da música com fade",
// F1–F9): Marcar os tempos marks where, on its video or playback, the song
// is over (Song.end_at, the fade Song.end_fade); songContent puts it on the
// content as `ends: { url, at, fade }`. When the media playing that url
// reaches `at`, the console ends the song as a soft Esc: its sound fades
// over `fade`, the text leaves, the papel de parede comes in, and the
// Setlist's Autoplay sees an end (clear with `ended`, live-state.mjs).
// Pure; the console watches (useConsole). Console only.
import { livePosition } from "../../../shared/live-state.mjs";

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

// The clear that ends it: the sound's own fade (ms).
export const endArgs = (live) => ({ ended: true, soundFade: Math.round((live?.content?.ends?.fade ?? 3) * 1000) });

export const END_SAY = "A música terminou no fim marcado.";
