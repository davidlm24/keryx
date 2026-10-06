import React, { useEffect } from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import LiveVideo from "@/components/projection/LiveVideo";

const IMAGE_SECONDS = 5;

/**
 * The main projector's media layer (live.media): a video, image, GIF, PDF or
 * PowerPoint from the Mídia library, alone or as a looping playlist.
 * A playlist moves on when an item ends; the projector on the KERYX computer
 * reports that (media.advance, which ignores duplicate reports).
 */
export default function LiveMediaView({ media }) {
    const inPlaylist = Boolean(media.playlist);
    const index = media.playlistIndex;
    const advance = () => {
        if (!inPlaylist || !keryx.isDesktop) return;
        projection.advanceMedia(index).catch((err) => console.error("[keryx] mídia:", err));
    };

    // Images in a playlist stay up for a few seconds, counted from when the
    // item went up (the same moment on every screen).
    useEffect(() => {
        if (!inPlaylist || (media.kind !== "image" && media.kind !== "gif")) return undefined;
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
                {/* A single video loops; in a playlist it moves on when it ends. */}
                <LiveVideo item={media} loop={!inPlaylist} onEnded={advance} className="w-full h-screen" />
            </div>
        );
    }

    if (media.kind === "image" || media.kind === "gif") {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 relative">
                {counter}
                {media.title && !inPlaylist && media.kind === "image" && (
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

    if (media.kind === "pdf") {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center relative">
                {counter}
                <iframe key={media.url} src={media.url} title={media.title} className="w-full h-screen border-0" />
            </div>
        );
    }

    if (media.kind === "powerpoint") {
        return (
            <div className="min-h-screen bg-gradient-to-br from-background via-primary/20 to-accent/20 flex flex-col items-center justify-center p-8">
                <h2 className="text-3xl font-semibold text-white mb-4">{media.title}</h2>
                <div className="bg-white/10 p-8 rounded-lg backdrop-blur-sm">
                    <p className="text-2xl text-blue-300 mb-4">
                        PowerPoint carregado
                    </p>
                    <a href={media.url} download className="text-blue-400 hover:text-blue-300 underline">
                        Baixar apresentação
                    </a>
                </div>
            </div>
        );
    }

    return <div className="min-h-screen bg-black" />;
}
