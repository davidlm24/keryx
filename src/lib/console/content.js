// What a song or a Bible passage puts on screen: the arguments of
// content.show (shared/live-state.mjs), used by stage.js and the song editor.
// `inherit` says what the default theme may fill in when it is sent
// (withThemeDefaults, themes.js); it never reaches the live state.
import { songSlidesFor } from "../songImport.js";
import { followsTheme, isFactoryLook } from "./themes.js";
import { withSongThemes, songTheme } from "./songTheme.js";
import { bgSpec, bgArgs } from "./backgroundSpec.js";

// A song's audio_url may be its video clip (sent to the video screen) or a
// playback track (played by the main projector).
export const isVideoUrl = (url) => Boolean(url) && (url.includes(".mp4") || url.includes("video") || url.startsWith("data:video"));

// What a Song row puts on screen (projection.showLyrics arguments). The
// slides are stripped of inline chords (songSlidesFor); when the lyrics
// carry them, their chorded twins ride in stage.chordedSlides for the Palco.
// `themes` (ProjectionTheme rows): the song's theme and its parts' themes
// apply (songTheme.js); without them the song shows its own look.
export function songContent(song, ref = {}, themes = []) {
    const built = songSlidesFor(song);
    // The song's own background (any kind) goes to the Fundo layer when it
    // is sent (args.fundo; backgroundSpec.js fundoOps).
    const fundo = bgArgs(bgSpec(song), song.title || "");
    return withSongThemes({
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
        },
        ...(fundo ? { fundo } : {}),
        stage: {
            song_key: song.song_key || "",
            bpm: song.bpm || null,
            chords: song.chords || "",
            musician_notes: song.musician_notes || "",
            ...(built.chordedSlides ? { chordedSlides: built.chordedSlides } : {}),
        },
        ref: { songId: song.id || null, ...ref },
        // A song following a theme of its own takes that theme whole: the
        // default theme dresses nothing (the church's transition still fills).
        inherit: songTheme(song, themes).theme ? { look: false, background: false } : { look: followsTheme(song), background: !fundo },
    }, song, themes);
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
