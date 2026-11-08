// What leaves the screens fading out (Transições, owner 2026-10-16, Rodada
// F2): an output keeps drawing what it showed before a change on top of what
// it shows now, going transparent, for as long as the live state says
// (shared/live-state.mjs). Two things say so:
//   - live.fade, set by the change itself (Esc, Limpar, Tela preta, Logo,
//     and since Rodada G5 whatever enters or replaces something else:
//     content.show, media.show, tool.show, communication.show, the lists
//     moving on): { ms, at } with `at` the change's updatedAt;
//   - live.leaving, the sound a new sound stopped: { layer, item, at, until }.
// Moving the slide never fades here (content.goTo keeps the item): that is
// the theme's transition. A YouTube player leaving always cuts: drawn again
// in the ghost it would come back cold (a black iframe, loading).
// Pure (tested): ScreenRenderer, the video channel players (ghostTrack).
import { mainLayer } from "../../shared/live-state.mjs";

// This change's own exit fade, in ms (0: none, or an older change's).
export const changeFade = (next) => (next?.fade && next.fade.at === next.updatedAt ? next.fade.ms || 0 : 0);

// How long `item`, stopped on `layer` by this change, fades out (0: it was not).
export function leavingMs(next, layer, item) {
    const e = (next?.leaving || []).find((x) => x.layer === layer && x.at === next.updatedAt && x.item?.url === item?.url);
    return e ? Math.max(0, e.until - e.at) : 0;
}

const bgOf = (s) => JSON.stringify(s?.background ?? null);

// Which item a main layer holds: a new one replaces it (Rodada G5), moving
// its slide or its volume does not.
function itemKey(s, layer) {
    if (layer === "content") return s.content.startedAt;
    if (layer === "media") return s.media.shownAt;
    if (layer === "tool" || layer === "communication") return s[layer].startedAt;
    return layer;
}

// The projector (ScreenRenderer): how long the screen drawn before (`prev`,
// a view of the live state) fades out over the one drawn now. The change's
// fade when what shows changed (the main layer or its item, Tela preta,
// Logo, the Fundo), and a video that a new sound took off as long as its
// sound leaves: the longer of the two. A YouTube player leaving cuts.
export function screenExitMs(prev, next) {
    if (!prev || !next) return 0;
    const was = mainLayer(prev);
    const is = mainLayer(next);
    const gone = was === "media" && (is !== "media" || next.media.shownAt !== prev.media.shownAt);
    if (gone && prev.media.kind === "youtube") return 0;
    const fade = changeFade(next);
    const changed = was !== is || itemKey(prev, was) !== itemKey(next, is) || bgOf(prev) !== bgOf(next);
    return Math.max(fade && changed ? fade : 0, gone ? leavingMs(next, "media", prev.media) : 0);
}

// The video channel (the clip over the projector, the Vídeo screen): how long
// the clip drawn before fades out — stopped or replaced by a new one, or
// taken off by Esc. A YouTube clip cuts.
export function videoExitMs(prev, next) {
    const old = prev?.video;
    if (!old || !next) return 0;
    if (next.video && next.video.shownAt === old.shownAt) return 0;
    if (old.kind === "youtube") return 0;
    return Math.max(leavingMs(next, "video", old), changeFade(next));
}

// Changes that reach a window this close together are one change for its
// ghost: the console sends an item as two or three (the Fundo, then the
// text, then the Setlist's place), and the screen the audience saw before
// the first one is what fades out (a ghost from the second would cut the
// Fundo before fading the text).
export const GHOST_BURST_MS = 150;

// An output's ghost, kept from change to change (useExitGhost). `prev` is
// the view drawn now, `base` the one drawn before the burst of changes in
// progress, `since` when that burst began, `ghost` what fades out:
// { from, ms, at, until, key } on the live clock, or null.
export const ghostStart = (view, rev) => ({ rev, prev: view, base: view, since: -Infinity, ghost: null });

// The track after the view `view` (live rev `rev`) reached the window at
// `now`. `msOf(before, after)` says how long `before` fades out over
// `after` (screenExitMs, videoExitMs). A change that fades nothing leaves a
// ghost running; inside a burst the ghost is from the screen before the
// burst, its start kept so it never jumps.
export function ghostTrack(track, view, rev, msOf, now, enabled = true) {
    if (rev === track.rev) return track;
    const burst = now - track.since < GHOST_BURST_MS;
    const base = burst ? track.base : track.prev;
    const ms = enabled ? msOf(base, view) : 0;
    let ghost = track.ghost;
    if (ms > 0) {
        const same = burst && ghost && ghost.from === base;
        const at = same ? ghost.at : now;
        ghost = { from: base, ms, at, until: at + ms, key: same ? ghost.key : `${track.rev}>${rev}` };
    }
    return { rev, prev: view, base, since: burst ? track.since : now, ghost };
}

// The audio channel's sound on its way out, still to be heard at `now`.
export const leavingAudio = (live, now) => (live?.leaving || []).filter((e) => e.layer === "audio" && e.until > now);
