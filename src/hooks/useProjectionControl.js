import { useEffect } from "react";
import { projection } from "@/lib/projection";
import { openProjectionWindow, postToProjection } from "@/lib/projectionWindow";
import { generateSlides } from "@/utils/songSections";
import { getBibleProjectionStyle } from "@/utils/bibleProjectionStyle";
import { useLiveState } from "@/hooks/useLiveState";
import { useToast } from "@/components/ui/use-toast";

// A song's audio_url may be its video clip (sent to the video screen) or a
// playback track (played by the main projector).
export const isVideoUrl = (url) => Boolean(url) && (url.includes(".mp4") || url.includes("video") || url.startsWith("data:video"));

const songSlides = (song) => (song.slides?.length ? song.slides : generateSlides(song.lyrics || ""));

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

// What a Bible passage (BiblePassage row or a verse picked in the Bible page)
// puts on screen; the style saved in the Bible page fills the gaps.
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

// The projection controls Home (Músicas) and Services (Cultos) share: going
// live with a song or passage, Parar, Esc, and the warning when the window is
// closed mid-service. Screens follow the live state; this only changes it.
// onEscape: the page's own Parar (it may stop more than the live state).
export function useProjectionControl({ serviceId = null, onEscape = null } = {}) {
    const live = useLiveState();
    const { toast } = useToast();
    const isLive = Boolean(live?.session);

    const report = (err) => {
        console.error("[keryx] projeção:", err);
        toast({ title: "Não foi possível projetar", description: err?.message, variant: "destructive" });
    };

    // Opens the main projector if it isn't open, starts the session if there
    // is none, then puts the content up.
    const goLive = async (show) => {
        openProjectionWindow();
        try {
            if (!live?.session) await projection.startSession(serviceId);
            return await show();
        } catch (err) {
            report(err);
            return null;
        }
    };

    const playSong = (song, ref) => goLive(() => projection.showLyrics(songContent(song, ref)));
    const playPassage = (passage, ref) => goLive(() => projection.showBible(passageContent(passage, ref)));

    const stop = async () => {
        // Media, tools and communication still reach the projector window by
        // postMessage until they move to the live state.
        postToProjection({ type: "STOP_PROJECTION" });
        postToProjection({ type: "PROJECTION_TOOL", mode: "stop" });
        try {
            await projection.clear();
            await projection.endSession();
        } catch (err) {
            report(err);
        }
    };

    // Avisar ao fechar com projeção ativa
    useEffect(() => {
        if (!isLive) return undefined;
        const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [isLive]);

    // Esc para parar a projeção
    useEffect(() => {
        if (!isLive) return undefined;
        const onKey = (e) => {
            if (e.key === "Escape") { e.preventDefault(); (onEscape || stop)(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    });

    return { live, isLive, content: live?.content || null, playSong, playPassage, stop, report };
}
