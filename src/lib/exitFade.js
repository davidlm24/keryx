// What leaves the screens fading out (Transições, owner 2026-10-16, Rodada
// F2): an output keeps drawing what it showed before a change on top of what
// it shows now, going transparent, for as long as the live state says
// (shared/live-state.mjs). Two things say so:
//   - live.fade, set by the change itself (Esc, Limpar, Tela preta, Logo):
//     { ms, at } with `at` the change's updatedAt;
//   - live.leaving, the sound a new sound stopped: { layer, item, at, until }.
// Pure (tested): ScreenRenderer, the video channel players.
import { mainLayer } from "../../shared/live-state.mjs";

// This change's own exit fade, in ms (0: none, or an older change's).
export const changeFade = (next) => (next?.fade && next.fade.at === next.updatedAt ? next.fade.ms || 0 : 0);

// How long `item`, stopped on `layer` by this change, fades out (0: it was not).
export function leavingMs(next, layer, item) {
    const e = (next?.leaving || []).find((x) => x.layer === layer && x.at === next.updatedAt && x.item?.url === item?.url);
    return e ? Math.max(0, e.until - e.at) : 0;
}

const bgOf = (s) => JSON.stringify(s?.background ?? null);

// The projector (ScreenRenderer): how long the screen drawn before (`prev`,
// a view of the live state) fades out over the one drawn now. The change's
// exit fade when what shows changed (the main layer, Tela preta, Logo, the
// Fundo that Esc puts back), else a video that a new sound took off.
export function screenExitMs(prev, next) {
    if (!prev || !next) return 0;
    const was = mainLayer(prev);
    const is = mainLayer(next);
    const fade = changeFade(next);
    if (fade) return was !== is || bgOf(prev) !== bgOf(next) ? fade : 0;
    if (was === "media" && (is !== "media" || next.media.shownAt !== prev.media.shownAt)) return leavingMs(next, "media", prev.media);
    return 0;
}

// The video channel (the clip over the projector, the Vídeo screen): how long
// the clip drawn before fades out — stopped by a new sound, or taken off by Esc.
export function videoExitMs(prev, next) {
    const old = prev?.video;
    if (!old || !next) return 0;
    if (next.video && next.video.shownAt === old.shownAt) return 0;
    return leavingMs(next, "video", old) || (next.video ? 0 : changeFade(next));
}

// The audio channel's sound on its way out, still to be heard at `now`.
export const leavingAudio = (live, now) => (live?.leaving || []).filter((e) => e.layer === "audio" && e.until > now);
