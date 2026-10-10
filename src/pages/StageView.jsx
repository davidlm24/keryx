import React, { useEffect } from "react";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";
import StageScreen from "@/components/network/StageScreen";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { keryx } from "@/api/keryxClient";

// The stage monitor: StageScreen on the live state (shared/live-state.mjs),
// on the operator's PC or a screen on the network alike. It keeps showing
// while the main projector is black: the band still needs the lyrics. Sized
// in container units (net.css), so it reads the same on a 24" monitor and a
// 65" TV; upright, the chords go under the slide.
export default function StageView() {
    const content = useLiveState((s) => s?.content);
    const nowMs = useLiveNow(1000);

    useEffect(() => {
        if (keryx.isDesktop) return undefined; // the main process places desktop outputs
        const tryFullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };
        document.addEventListener("click", tryFullscreen, { once: true });
        return () => document.removeEventListener("click", tryFullscreen);
    }, []);

    return (
        <StageScreen content={content} nowMs={nowMs}>
            {content && <AlertOverlayRenderer />}
        </StageScreen>
    );
}
