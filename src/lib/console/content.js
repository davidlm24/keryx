// What a song or a Bible passage puts on screen: the arguments of
// content.show (shared/live-state.mjs), used by stage.js and the song editor.
// `inherit` says what the default theme may fill in when it is sent
// (withThemeDefaults, themes.js); it never reaches the live state.
import { songSlidesFor } from "../songImport.js";
import { isFactoryLook } from "./themes.js";
import { bgSpec, bgArgs } from "./backgroundSpec.js";
import { songStep, steppedSize } from "./songSize.js";
import { followModeOf, slideSeconds, timedLength, withFollowStarts } from "./lyricSync.js";

// A song's audio_url may be its video clip (sent to the video screen) or a
// playback track (sent to the audio channel, Rodada D4: with the player's
// transport, and the lyrics can follow it).
// A Mídia's video may be any of the containers it imports (owner
// 2026-11-10: a .webm chosen from the Mídia went to the audio channel).
export const isVideoUrl = (url) => Boolean(url) && (/\.(mp4|m4v|webm|mov|mkv)(?=$|[?#])/i.test(url) || url.includes("video") || url.startsWith("data:video"));

// What a song's automatic lyrics follow (content.follow, owner 2026-10-15,
// Rodada D4): its video, its playback, or — no media, the musicians play —
// the live clock the operator starts; "Por tempo" (Rodada P7) that clock
// with a time for every slide. null when it does not advance (Avançar
// sozinha: Não, or no slide has a start).
export function songFollow(song, slides) {
    const mode = followModeOf(song, slides);
    if (mode === "time" && slides?.length) {
        const each = slideSeconds(song);
        return { source: "time", each, length: timedLength(slides, each) };
    }
    if (mode === "off" || !(slides || []).some((it) => Number.isFinite(it?.start))) return null;
    const url = song.audio_url || "";
    const length = Number.isFinite(song.duration) && song.duration > 0 ? song.duration : null;
    return { source: !url ? "clock" : isVideoUrl(url) ? "video" : "audio", ...(url ? { url } : {}), ...(length ? { length } : {}) };
}

// What a Song row puts on screen (projection.showLyrics arguments). The
// slides are stripped of inline chords (songSlidesFor); when the lyrics
// carry them, their chorded twins ride in stage.chordedSlides for the Palco.
// A song has no theme or look of its own any more (owner 2026-11-09,
// mockup "Identificar, Mídia e tema da música", board 3): it always goes
// out with the theme in use, else the standard one (stamp, themeForKind),
// moved only by its size step (songSize.js). Song.theme_id, part_themes,
// style_mode, its font, colours and background stay stored (user data,
// synced, carried by the .keryx package) and are not read here. `themes`
// is kept in the signature for the callers.
export function songContent(song, ref = {}, _themes = []) {
    const built = songSlidesFor(song);
    const follow = songFollow(song, built.slides);
    return {
        title: song.title || "",
        artist: song.artist || "",
        // Every slide with the start the follow goes by (lyricSync.js).
        slides: withFollowStarts(built.slides, follow),
        // The playback goes to the audio channel (stage.playback), never
        // content.audio any more (it played on every output, untransported).
        audio: null,
        ...(follow ? { follow } : {}),
        // The size is a step from the theme's (songSize.js, Rodada P): over
        // the factory look here; withThemeDefaults moves the theme's.
        style: {
            font_size: steppedSize("large", songStep(song)),
            font_family: "sans",
            text_effect: "shadow",
            text_color: "#ffffff",
            text_color_2: "",
        },
        stage: {
            song_key: song.song_key || "",
            bpm: song.bpm || null,
            chords: song.chords || "",
            musician_notes: song.musician_notes || "",
            ...(built.chordedSlides ? { chordedSlides: built.chordedSlides } : {}),
        },
        ref: { songId: song.id || null, ...ref },
        // The theme in use dresses it whole (look, extras, background) and
        // its size moves by the song's step.
        inherit: { look: true, background: true, step: songStep(song) },
    };
}

// What a Bible passage (a BiblePassage row or verses picked in the Bíblia)
// puts on screen; a passage with no look of its own follows the default theme.
export function passageContent(passage, ref = {}) {
    const fundo = bgArgs(bgSpec(passage), passage.reference || "");
    return {
        title: passage.reference || "",
        slides: passage.slides?.length ? passage.slides : [{ text: passage.text || "" }],
        style: {
            font_size: passage.font_size || "large",
            font_family: passage.font_family || "sans",
            text_effect: passage.text_effect || "shadow",
            text_color: passage.text_color || "#ffffff",
            text_color_2: passage.text_color_2 || "",
        },
        ...(fundo ? { fundo } : {}),
        ref: { reference: passage.reference || "", passageId: passage.id || null, ...ref },
        inherit: { look: isFactoryLook(passage), background: !fundo },
    };
}
