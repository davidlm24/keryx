import React from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState } from "@/hooks/useLiveState";
import { useExitGhost } from "@/hooks/useExitGhost";
import { videoExitMs } from "@/lib/exitFade";
import LiveVideo from "@/components/projection/LiveVideo";
import "@/components/screen/screen.css";

/**
 * Video sent to the screens (a song's clip, YouTube) over the lyrics and
 * projector pages: the live state's video channel, full screen while there
 * is one; nothing otherwise, so the lyrics show normally. A clip that a new
 * sound stopped, or that Esc took off, fades out (Transições, exitFade.js).
 */
export default function TabletVideoReceiver() {
    const live = useLiveState();
    const video = live?.video || null;
    const ghost = useExitGhost(live, live?.rev, videoExitMs);
    const leaving = ghost?.from?.video || null;
    if (!video && !leaving) return null;

    return (
        <>
            {video && (
                <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
                    <ClipTitle title={video.title} />
                    <LiveVideo item={video} meter="video" className="w-full h-full" onEnded={() => { if (keryx.isDesktop) projection.clearVideo().catch(() => {}); }} />
                </div>
            )}
            {leaving && (
                <div key={ghost.key} className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center ks-fade-out" style={{ animationDuration: `${ghost.ms}ms` }} aria-hidden="true">
                    <ClipTitle title={leaving.title} />
                    <LiveVideo item={leaving} fadeOut={{ at: ghost.at, until: ghost.until }} className="w-full h-full" />
                </div>
            )}
        </>
    );
}

function ClipTitle({ title }) {
    if (!title) return null;
    return (
        <div className="absolute top-6 left-0 right-0 text-center z-10 pointer-events-none">
            <h2 className="text-xl md:text-2xl font-semibold text-white bg-black/50 inline-block px-6 py-2 rounded-lg">
                {title}
            </h2>
        </div>
    );
}
