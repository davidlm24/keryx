import React from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import OutputScreen from "@/components/screen/OutputScreen";
import { useOutputPref } from "@/hooks/useOutputPref";
import LiveVideo from "@/components/projection/LiveVideo";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";
import "@/components/network/net.css";

// The video screen (a TV or tablet for clips and YouTube): the live state's
// video channel, in step with every other screen. A screen that opens late
// or reloads joins the video where it is. Waiting, it shows the live idle
// look like every other screen (never a page of its own). Set to show other
// content (Configurações › Telas e saídas), it draws that instead.
export default function VideoProjection() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const logo = useChurchLogo();
    const video = live?.video || null;
    const prefs = useOutputPref("/VideoProjection");
    const other = prefs.pref.content && prefs.pref.content !== "video";

    if (!video || other) return <OutputScreen page="/VideoProjection" live={live} prefs={prefs} now={now} logoUrl={logo} audio={false} />;

    return (
        <div style={{ position: "fixed", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {video.title && <div className="net-vtitle">{video.title}</div>}
            <LiveVideo item={video} meter="video" className="w-full h-screen" onEnded={() => { if (keryx.isDesktop) projection.clearVideo().catch(() => {}); }} />
            <AlertOverlayRenderer />
        </div>
    );
}
