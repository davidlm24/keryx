// What the sound engine plays (owner 2026-11-08, after the service of 07/11:
// a video's sound came out twice or three times, once per output window).
// KERYX plays every sound in ONE hidden window, the sound engine
// (src/pages/SoundEngine.jsx, electron/soundEngine.cjs), as ProPresenter
// does; every output window is muted. This is the list of what it plays
// from the live state, the same moments the outputs used to play them:
//   - media: the projector's media layer when it is a video or a YouTube
//     link and the main layer (Tela preta and Logo silence it, as they
//     always did by taking the picture off);
//   - video: the video channel, always (it played over everything);
//   - audio: the audio channel, always (and its `leaving`, exitFade.js);
//   - track: a song's playback sent with the text (content.audio);
//   - notice: an aviso's background audio, and chime its sound alert;
//   - bell: an Escola activity's discussion time running out (the chime
//     once, within 4 s of the end: a window opened later stays quiet).
// Pure, so node --test checks it. The engine never applies an output's rule
// (outputPrefs.js): the sound plays whatever each screen shows.
import { mainLayer, currentSlide, revealOf } from "../../shared/live-state.mjs";
import { discussionTime } from "./activity.js";

const AV = new Set(["video", "youtube"]);
const isUrl = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:") || v.startsWith("blob:") || v.startsWith("/"));
export const BELL_MS = 4000;

export function soundPlan(live, now = 0) {
    const layer = mainLayer(live);
    const content = layer === "content" ? live.content : null;
    const comm = layer === "communication" ? live.communication : null;
    const item = comm?.item || {};
    let bell = null;
    const activity = content ? currentSlide(content)?.activity : null;
    if (activity && activity.kind !== "choice" && activity.kind !== "truefalse" && activity.kind !== "blanks" && activity.kind !== "memorize") {
        const t = discussionTime(activity, revealOf(content), now);
        if (t.done && now - t.endsAt < BELL_MS) bell = t.endsAt;
    }
    return {
        media: layer === "media" && AV.has(live.media?.kind) ? live.media : null,
        video: live?.video || null,
        audio: live?.audio || null,
        track: content?.audio ? { src: content.audio, key: content.startedAt } : null,
        notice: comm && isUrl(item.background_audio) ? { src: item.background_audio, key: comm.startedAt } : null,
        chime: comm && item.sound_alert ? comm.startedAt : null,
        bell,
    };
}

// The media layer's sound in a view the engine drew before (a ghost fading
// out, useExitGhost): the same rule as now.
export const mediaSoundOf = (view) => (mainLayer(view) === "media" && AV.has(view.media?.kind) ? view.media : null);
