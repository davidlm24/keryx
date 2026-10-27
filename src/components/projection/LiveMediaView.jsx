import React, { useEffect } from "react";
import { usePrefs } from "@/hooks/useUser";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import LiveVideo from "@/components/projection/LiveVideo";
import { clearFade, enterFade, IMAGE_SECONDS } from "@/lib/console/transitions";
import { mediaType } from "@/lib/contentKinds";

/**
 * The main projector's media layer (live.media): a video, image or GIF from
 * the Mídia library, alone or as a looping playlist.
 * A playlist moves on when an item ends; the projector on the KERYX computer
 * reports that (media.advance, which ignores duplicate reports).
 * fadeOut ({ at, until }): the media is leaving (ScreenRenderer's ghost,
 * Transições): it plays on, quieter and quieter, and moves nothing on.
 */
export default function LiveMediaView({ media, fadeOut = null }) {
    // An image's name over it only when the church wants titles (the legacy pref; the item title is the theme's since the Rodada B 2026-10-14).
    const prefs = usePrefs();
    const showTitle = prefs.show_item_title;
    const inPlaylist = Boolean(media.playlist);
    const index = media.playlistIndex;
    // A playlist moves on; a single video that ends leaves the screen (the
    // frozen-last-frame bug), fading out as Esc does ("Ao tirar do ar";
    // a YouTube player would come back cold in the ghost: it cuts). Loops
    // belong to the background layer. The next item of a list enters as its
    // kind does (Ao entrar ou trocar, Rodada G5; a picture at most a quarter
    // of its time).
    const advance = () => {
        if (!keryx.isDesktop || fadeOut) return;
        const next = inPlaylist ? media.playlist[(index + 1) % media.playlist.length] : null;
        const done = inPlaylist ? projection.advanceMedia(index, { fade: enterFade(prefs, mediaType(next?.kind), { ...next, playlist: media.playlist }) })
            : projection.clearMedia({ fade: media.kind === "youtube" ? 0 : clearFade(prefs), ended: true });
        done.catch((err) => console.error("[keryx] mídia:", err));
    };
    // A YouTube link the player refused (owner 2026-10-27, Y4 = A): it
    // leaves the screens at once, marked (`refused`), so the console says
    // why and offers to download it; a list skips it.
    const refuse = (code) => {
        if (!keryx.isDesktop || keryx.isNetworkScreen || fadeOut || media.kind !== "youtube") return;
        const mark = { refused: code, url: media.url };
        const done = inPlaylist ? projection.advanceMedia(index, mark) : projection.clearMedia(mark);
        done.catch((err) => console.error("[keryx] mídia:", err));
    };

    // Images in a playlist stay up for a few seconds, counted from when the
    // item went up (the same moment on every screen).
    useEffect(() => {
        if (fadeOut || !inPlaylist || (media.kind !== "image" && media.kind !== "gif")) return undefined;
        const seconds = media.duration || IMAGE_SECONDS;
        const left = Math.max(0, media.shownAt + seconds * 1000 - keryx.live.now());
        const id = setTimeout(advance, left);
        return () => clearTimeout(id);
    }, [media.shownAt, media.kind, inPlaylist]);

    const counter = inPlaylist && (
        <div className="absolute top-4 right-4 text-white bg-black/50 px-4 py-2 rounded z-10">
            {index + 1} / {media.playlist.length}
        </div>
    );

    if (media.kind === "video" || media.kind === "youtube") {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center relative">
                {counter}
                {/* Ends -> the playlist moves on, a single video leaves the screen. */}
                <LiveVideo item={media} onEnded={advance} onRefused={refuse} meter={fadeOut ? null : "media"} fadeOut={fadeOut} className="w-full h-screen" />
            </div>
        );
    }

    if (media.kind === "image" || media.kind === "gif") {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 relative">
                {counter}
                {showTitle && media.title && !inPlaylist && media.kind === "image" && (
                    <h2 className="text-3xl font-semibold text-white mb-4">{media.title}</h2>
                )}
                <img
                    key={media.url}
                    src={media.url}
                    alt={media.title}
                    className={`max-w-full object-contain ${inPlaylist || media.kind === "gif" ? "max-h-screen" : "max-h-[85vh]"}`}
                />
            </div>
        );
    }

    // A PDF or a PowerPoint sent as media before Rodada F3: black. A PDF goes
    // on air as a presentation now (its pages, the content layer), a
    // PowerPoint not at all (the operator saves it as PDF).
    return <div className="min-h-screen bg-black" />;
}
