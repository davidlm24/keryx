// Lyrics over a video's sound (owner 2026-11-01, the vistoria of 31/10,
// mark M3 = B): a church's worship videos with no lyrics in them, the
// lyrics on the screens and only the video's sound under them. Two doors:
//   1. the song's own switch, "Só o som do vídeo" (`Song.playback_mode`
//      "sound"): its video is sent as its playback, the audio channel
//      playing a video file for its sound (`songMedia`, stageFromSong);
//   2. the gesture: with a video with sound playing on the projector, a
//      text sent over it (a song with no media of its own, a passage, a
//      text) does what the player's eye does first — `media.toAudio`, the
//      same element, no gap, the picture fading as "Ao tirar do ar" — so
//      the text never hides the video and silences it (`soundStays`).
//      Desfazer brings the video back at the second it is (`audio.toMedia`)
//      and takes the text off (`undoSoundStays`).
// Pure; the console runs it (useConsole's send), never the live state.
// Console only: not in the outputs' path.
import { heard } from "../../../shared/live-state.mjs";
import { isVideoUrl } from "./content.js";
import { isYouTubeUrl } from "../../utils/youtube.js";

// What the song editor offers for its media: "switch" (a video file: the
// switch "Só o som do vídeo"), "youtube" (a YouTube link never plays
// hidden: Baixar para a Mídia first) or null (a playback, or nothing).
export function soundModeFor(url) {
    if (!url) return null;
    if (isYouTubeUrl(url)) return "youtube";
    return isVideoUrl(url) ? "switch" : null;
}

// Where a song's media goes when it is sent: `video` (the video channel,
// with the lyrics) or `playback` (the audio channel), and `playbackKind`
// "video" when the playback is a video played for its sound.
export function songMedia(song) {
    const url = song?.audio_url || "";
    const video = isVideoUrl(url) && !isYouTubeUrl(url);
    const sound = video && song.playback_mode === "sound";
    return {
        video: isVideoUrl(url) && !sound ? url : null,
        playback: url && (!isVideoUrl(url) || sound) ? url : null,
        ...(sound ? { playbackKind: "video" } : {}),
    };
}

// Whether sending `stage` (as `op`) over `live` must first turn the video on
// the projector into sound only: a text (content.show) with no sound of its
// own — a stage with a playback or a video of its own silences the one
// playing, as always (live-state's hush) — over a video file (not YouTube,
// which cannot play hidden) that is playing and can be heard. The video
// channel is never touched: a text on the projector does not hide it.
export function soundStays(op, stage, live) {
    if (op !== "content.show" || !stage || stage.playback || stage.video) return false;
    const media = live?.media;
    return Boolean(media && media.kind === "video" && heard(media) && !media.playback?.paused);
}

// Desfazer of the gesture, on the live state now: the video back on the
// screens if the audio channel still plays it (`url`), and the text sent
// with it off if it is still the one on air (`startedAt`, its content's).
// Video first, so the screen never shows what is under both.
export function undoSoundStays(live, { url, startedAt }) {
    const ops = [];
    if (live?.audio?.kind === "video" && live.audio.url === url) ops.push(["audio.toMedia", {}]);
    if (live?.content && live.content.startedAt === startedAt) ops.push(["content.clear", {}]);
    return ops;
}
