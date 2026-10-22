// Setlist automática (owner 2026-10-20, Rodada N2, the mockup's marks: the
// switch in the Setlist header; with it on every item goes to the next
// unless the operator changes it; a countdown on the next row and a toast
// with Cancelar). Plain JS, so node --test can check it; the console's
// watcher is useSetlistAutoplay.js, the switch Service.autoplay, each item's
// choice ServiceItem.end_action, the pause Service.autoplay_gap (else the
// church's User.autoplay_gap).
import { livePosition } from "../../../shared/live-state.mjs";
import { isSection, itemOnAir } from "./setlist.js";
import { clockLength, clockFollow } from "./player.js";

// What an item does when it ends, with the switch on. "" (and the old
// autoAdvance: true) = "next".
export const END_ACTIONS = ["next", "loop", "stop"];
export const END_LABEL = { next: "Ir para o próximo", loop: "Repetir", stop: "Parar" };
export const END_ICON = { next: "arrow-right", loop: "refresh", stop: "stop" };
export const END_TIP = { next: "Ao terminar: vai para o próximo", loop: "Ao terminar: repete", stop: "Ao terminar: para" };
export const endChoice = (item) => (END_ACTIONS.includes(item?.end_action) ? item.end_action : "next");
// What the item does now: its choice while the culto's switch is on, else
// nothing ("stop": the Setlist waits for the operator, as always).
export const endActionOf = (item, service) => (service?.autoplay ? endChoice(item) : "stop");

// The pause before the next one goes on air (seconds): the culto's, else the church's.
export const GAPS = [0, 3, 5, 10];
export const gapLabel = (s) => (s ? `${s} s` : "Sem pausa");
export const gapOf = (service, prefs) => {
    const own = service?.autoplay_gap;
    if (own !== null && own !== undefined && own !== "" && GAPS.includes(Number(own))) return Number(own);
    const church = Number(prefs?.autoplay_gap);
    return GAPS.includes(church) && prefs?.autoplay_gap !== null && prefs?.autoplay_gap !== "" ? church : 5;
};

const TYPE = (item) => String(item?.type || "").toUpperCase();
const ON_PROJECTOR = new Set(["VIDEO", "IMAGE", "PDF", "POWERPOINT"]);
const hasMarks = (song) => (song?.slides || []).some((s) => Number.isFinite(s?.start));

// Whether an item is heard: a video, an audio file, a song with its
// playback or clip. The projector window plays the sound (Projection.jsx),
// so with it closed the Setlist never moves on to (or from) one.
export function hasSound(item, song = null) {
    const t = TYPE(item);
    return t === "VIDEO" || t === "AUDIO" || (t === "SONG" && Boolean(song?.audio_url));
}

// Whether an item can end by itself: its file ends, or it has a duration.
// A song with marks and no media ends with its live clock (letra automática).
// false: "Sem duração: não avança sozinho" in its menu.
export function endsByItself(item, song = null) {
    const t = TYPE(item);
    if (t === "VIDEO" || t === "AUDIO") return true;
    if (t === "SONG" && (song?.audio_url || hasMarks(song))) return true;
    return Number(item?.duration) > 0;
}

// The layer playing the item's own file: [layer, item] or null. A media
// item by its Media id; a song by its playback or clip (the follow's url).
function itemMedia(live, item, song) {
    const t = TYPE(item);
    const own = item.contentId || null;
    if (t === "AUDIO") return own && live.audio?.id === own ? ["audio", live.audio] : null;
    if (ON_PROJECTOR.has(t)) {
        if (own && live.media?.id === own) return ["media", live.media];
        if (own && live.video?.id === own) return ["video", live.video];
        return null;
    }
    if (t === "SONG") {
        const url = songUrl(live, song);
        if (!url) return null;
        for (const k of ["video", "audio", "media"]) if (live[k]?.url === url) return [k, live[k]];
    }
    return null;
}
const songUrl = (live, song) => song?.audio_url || live?.content?.follow?.url || null;

// How close to the end counts as the end (a report can come a frame late).
export const END_SLACK = 0.25;

// Whether the item of this Setlist on air (live.session) has ended:
//  - a video or audio file: its output said so (live.ended, a single video
//    cleared at its end, a list past its last item, a file played out), or
//    it played to its length (the item's, else what the output reported);
//    gone without `ended` = Esc, Limpar or Parar: never ended;
//  - a song with a playback, a clip or marks: its media's (or live clock's) end;
//  - anything else (text, Bíblia, a picture, a timer, a song without media):
//    `duration` seconds after it went on air, while it is still on air; no
//    duration, never.
// reported(layer, url) → seconds an output measured, or null.
export function itemEnded({ live, item, now, reported = null, song = null }) {
    const s = live?.session;
    if (!s || !item || s.itemId !== item.id) return false;
    const since = Number(s.itemAt) || 0;
    const t = TYPE(item);
    const url = t === "SONG" ? songUrl(live, song) : null;
    const e = live.ended;
    if (e && e.at >= since) {
        if ((t === "VIDEO" || t === "AUDIO" || t === "IMAGE") && item.contentId && e.id === item.contentId) return true;
        if (url && e.url === url) return true;
    }
    const m = itemMedia(live, item, song);
    if (m && m[1].playback && m[1].kind !== "image" && m[1].kind !== "gif") {
        const [layer, l] = m;
        if (l.playlist && l.playlistIndex < l.playlist.length - 1) return false;
        const length = l.duration || reported?.(layer, l.url) || (t === "SONG" ? live.content?.follow?.length : null) || null;
        return length > 0 && livePosition(l.playback, now) >= length - END_SLACK;
    }
    // Its file is what ends it: still loading, or taken off (no `ended`).
    if (t === "VIDEO" || t === "AUDIO" || url) return false;
    const f = live.content?.follow;
    if (t === "SONG" && clockFollow(f)) {
        if (!f.clock || !itemOnAir(live, [item])) return false;
        const length = clockLength(live.content.slides, f);
        return length > 0 && livePosition(f.clock, now) >= length;
    }
    const d = Number(item.duration) || 0;
    if (d <= 0 || !itemOnAir(live, [item])) return false;
    return now >= since + d * 1000;
}

// The next item that can go on air after `currentId`: sections are headers,
// disabled items are skipped. null after the last.
export function nextPlayable(items, currentId) {
    const list = items || [];
    const i = list.findIndex((x) => x.id === currentId);
    if (i < 0) return null;
    return list.slice(i + 1).find((x) => !isSection(x) && x.enabled !== false) || null;
}

// Whether the Setlist may move on now. Locked: nothing new goes on air
// (Travar telas). The projector window closed with something to hear: it
// would "play" with nobody hearing it, so it stops and says so (amber).
export function shouldAdvance({ locked = false, projectorOpen = true, hasSound: sound = false } = {}) {
    if (locked) return { ok: false, why: "locked" };
    if (!projectorOpen && sound) return { ok: false, why: "projector" };
    return { ok: true, why: null };
}

// Whether something new went on air after `since` (the live clock): a send
// by hand, from the phone or another window — a wait for the next item gives
// way to it. What leaves (the ended video's layer cleared) is not new.
export function newOnAir(live, since) {
    const starts = [live?.session?.itemAt, live?.content?.startedAt, live?.media?.shownAt, live?.video?.shownAt, live?.audio?.shownAt, live?.tool?.startedAt, live?.communication?.startedAt];
    return starts.some((t) => Number(t) > since);
}

// What the console says (pt-BR, the mockup's words).
export const AUTOPLAY_SAY = {
    locked: "Telas travadas: a Setlist não avançou.",
    projector: "A janela do projetor está fechada: a Setlist parou. Abra a Projeção em Saídas.",
    last: "Era o último item: a Setlist parou.",
    cancel: "Cancelado: o próximo não entra sozinho.",
    on: "Avançar sozinho ligado: quando o item no ar terminar, o próximo vai ao ar.",
    off: "Avançar sozinho desligado: a Setlist espera você.",
};
export const countdownSay = (title, seconds) => `Próximo em ${seconds} s: ${title}`;
export const NO_DURATION = "Sem duração: não avança sozinho";
