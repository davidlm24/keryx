// What a song or a Bible passage puts on screen: the arguments of
// content.show (shared/live-state.mjs), used by stage.js and the song editor.
import { generateSlides } from "@/utils/songSections";
import { slidesFromLyrics } from "@/lib/songImport";
import { getBibleProjectionStyle } from "@/utils/bibleProjectionStyle";

// A song's audio_url may be its video clip (sent to the video screen) or a
// playback track (played by the main projector).
export const isVideoUrl = (url) => Boolean(url) && (url.includes(".mp4") || url.includes("video") || url.startsWith("data:video"));

// Its saved slides; else the lyrics split as the song asks (lines_per_slide,
// set in the editor or at import), else one stanza per slide.
const songSlides = (song) => (song.slides?.length ? song.slides
    : [2, 4].includes(Number(song.lines_per_slide)) ? slidesFromLyrics(song.lyrics || "", { lines: Number(song.lines_per_slide) })
        : generateSlides(song.lyrics || ""));

// What a Song row puts on screen (projection.showLyrics arguments).
export function songContent(song, ref = {}) {
    return {
        title: song.title || "",
        artist: song.artist || "",
        slides: songSlides(song),
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
        },
        ref: { songId: song.id || null, ...ref },
    };
}

// What a Bible passage (a BiblePassage row or verses picked in the Bíblia)
// puts on screen; the saved Bible style fills the gaps.
export function passageContent(passage, ref = {}) {
    const saved = getBibleProjectionStyle();
    return {
        title: passage.reference || "",
        slides: passage.slides?.length ? passage.slides : [{ text: passage.text || "" }],
        style: {
            font_size: passage.font_size || saved.font_size || "large",
            font_family: passage.font_family || saved.font_family || "sans",
            text_effect: passage.text_effect || "shadow",
            text_color: passage.text_color || saved.text_color || "#ffffff",
            text_color_2: passage.text_color_2 || "",
            background_image: passage.background_image || saved.background_image || "",
        },
        ref: { reference: passage.reference || "", passageId: passage.id || null, ...ref },
    };
}
