import React from "react";
import { useLiveState } from "@/hooks/useLiveState";
import LiveVideo from "@/components/projection/LiveVideo";

/**
 * Video sent to the screens (a song's clip, YouTube) over the lyrics and
 * projector pages: the live state's video channel, full screen while there
 * is one; nothing otherwise, so the lyrics show normally.
 */
export default function TabletVideoReceiver() {
    const video = useLiveState((s) => s?.video);
    if (!video) return null;

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
            {video.title && (
                <div className="absolute top-6 left-0 right-0 text-center z-10 pointer-events-none">
                    <h2 className="text-xl md:text-2xl font-semibold text-white bg-black/50 inline-block px-6 py-2 rounded-lg">
                        {video.title}
                    </h2>
                </div>
            )}
            <LiveVideo item={video} meter="video" className="w-full h-full" />
        </div>
    );
}
