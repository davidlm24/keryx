// What a song or a Bible passage puts on screen: the arguments of
// content.show (shared/live-state.mjs), used by stage.js and the song editor.
// `inherit` says what the default theme may fill in when it is sent
// (withThemeDefaults, themes.js); it never reaches the live state.
import { songSlidesFor } from "../songImport.js";
import { followsTheme, isFactoryLook } from "./themes.js";

// A song's audio_url may be its video clip (sent to the video screen) or a
// playback track (played by the main projector).
export const isVideoUrl = (url) => Boolean(url) && (url.includes(".mp4") || url.includes("video") || url.startsWith("data:video"));

// What a Song row puts on screen (projection.showLyrics arguments). The
// slides are stripped of inline chords (songSlidesFor); when the lyrics
// carry them, their chorded twins ride in stage.chordedSlides for the Palco.
export function songContent(song, ref = {}) {
    const built = songSlidesFor(song);
    return {
        title: song.title || "",
        artist: song.artist || "",
        slides: built.slides,
        audio: isVideoUrl(song.audio_url) ? null : song.audio_url || null,
        style: {
            font_size: song.font_size || "large",
            font_family: song.font_family || "sans",
            text_effect: song.text_effect || "shadow",
            text_color: song.text_color || "#ffffff",
            text_color_2: song.text_color_2 || "",
            background_image: song.background_image || "",
        },
        stage: {
            song_key: song.song_key || "",
            bpm: song.bpm || null,
            chords: song.chords || "",
            musician_notes: song.musician_notes || "",
            ...(built.chordedSlides ? { chordedSlides: built.chordedSlides } : {}),
        },
        ref: { songId: song.id || null, ...ref },
        inherit: { look: followsTheme(song), background: !song.background_image },
    };
}

// What a Bible passage (a BiblePassage row or verses picked in the Bíblia)
// puts on screen; a passage with no look of its own follows the default theme.
export function passageContent(passage, ref = {}) {
    return {
        title: passage.reference || "",
        slides: passage.slides?.length ? passage.slides : [{ text: passage.text || "" }],
        style: {
            font_size: passage.font_size || "large",
            font_family: passage.font_family || "sans",
            text_effect: passage.text_effect || "shadow",
            text_color: passage.text_color || "#ffffff",
            text_color_2: passage.text_color_2 || "",
            background_image: passage.background_image || "",
        },
        ref: { reference: passage.reference || "", passageId: passage.id || null, ...ref },
        inherit: { look: isFactoryLook(passage), background: !passage.background_image },
    };
}
