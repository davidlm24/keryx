// What a song or a Bible passage puts on screen: the arguments of
// content.show (shared/live-state.mjs), used by stage.js and the song editor.
// `inherit` says what the default theme may fill in when it is sent
// (withThemeDefaults, themes.js); it never reaches the live state.
import { songSlidesFor } from "../songImport.js";
import { followsTheme, isFactoryLook } from "./themes.js";
import { withSongThemes, songTheme } from "./songTheme.js";
import { bgSpec, bgArgs } from "./backgroundSpec.js";
import { songStep, steppedSize } from "./songSize.js";
import { followModeOf, slideSeconds, timedLength, withFollowStarts } from "./lyricSync.js";

// A song's audio_url may be its video clip (sent to the video screen) or a
// playback track (sent to the audio channel, Rodada D4: with the player's
// transport, and the lyrics can follow it).
export const isVideoUrl = (url) => Boolean(url) && (url.includes(".mp4") || url.includes("video") || url.startsWith("data:video"));

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
// `themes` (ProjectionTheme rows): the song's theme and its parts' themes
// apply (songTheme.js); without them the song shows its own look.
export function songContent(song, ref = {}, themes = []) {
    const built = songSlidesFor(song);
    // The song's own background (any kind) goes to the Fundo layer when it
    // is sent (args.fundo; backgroundSpec.js fundoOps).
    const fundo = bgArgs(bgSpec(song), song.title || "");
    const follow = songFollow(song, built.slides);
    return withSongThemes({
        title: song.title || "",
        artist: song.artist || "",
        // Every slide with the start the follow goes by (lyricSync.js).
        slides: withFollowStarts(built.slides, follow),
        // The playback goes to the audio channel (stage.playback), never
        // content.audio any more (it played on every output, untransported).
        audio: null,
        ...(follow ? { follow } : {}),
        // The size is a step from the theme's (songSize.js, Rodada P): over
        // the factory look here; withThemeDefaults moves the theme's, and
        // withSongThemes the song's own theme's.
        style: {
            font_size: steppedSize("large", songStep(song)),
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
        // Otherwise the theme fills what the song leaves empty, its own look
        // or not, and its size moves by the song's step.
        inherit: songTheme(song, themes).theme ? { look: false, background: false, extras: false } : { look: followsTheme(song), background: !fundo, step: songStep(song) },
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
