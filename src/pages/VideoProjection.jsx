import React from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useScreenKeys } from "@/hooks/useScreenKeys";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import OutputScreen from "@/components/screen/OutputScreen";
import { useOutputPref } from "@/hooks/useOutputPref";
import LiveVideo from "@/components/projection/LiveVideo";
import { AlertLayer } from "@/components/screen/AlertBar";
import { alertOf, ruleOf } from "@/lib/outputPrefs";
import { ruleKindOf } from "@/lib/contentKinds";
import { useExitGhost } from "@/hooks/useExitGhost";
import { videoExitMs } from "@/lib/exitFade";
import "@/components/screen/screen.css";
import "@/components/network/net.css";

// The video screen (a TV or tablet for clips and YouTube): the live state's
// video channel, in step with every other screen. A screen that opens late
// or reloads joins the video where it is. Waiting, it shows the live idle
// look like every other screen (never a page of its own). Set to show other
// content (Ajustes › O que esta tela recebe), it draws that instead. The Aviso
// rápido goes over the clip in this screen's look (Rodada E3). A clip that a
// new sound stopped, or that Esc took off, fades out (Transições, exitFade.js).
export default function VideoProjection() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const logo = useChurchLogo();
    useScreenKeys(live);
    const video = live?.video || null;
    const prefs = useOutputPref("/VideoProjection");
    // The clip plays full screen while its kind (a video of the computer or
    // YouTube) is in what this screen receives; otherwise the renderer draws
    // what the rule lets through (a video on the main projector's media layer
    // included).
    const rule = ruleOf(prefs.pref, "/VideoProjection");
    const clipKept = Boolean(video) && rule.kinds.includes(ruleKindOf("video", video));
    const other = !clipKept;
    const ghost = useExitGhost(live, live?.rev, videoExitMs, !other);
    const leaving = ghost?.from?.video || null;
    const box = { position: "fixed", inset: 0, background: "#000", display: "flex", alignItems: "center", justifyContent: "center" };
    const fading = leaving && (
        <div key={ghost.key} className="ks-fade-out" style={{ ...box, animationDuration: `${ghost.ms}ms` }} aria-hidden="true">
            {leaving.title && <div className="net-vtitle">{leaving.title}</div>}
            <LiveVideo item={leaving} fadeOut={{ at: ghost.at, until: ghost.until }} className="w-full h-screen" />
        </div>
    );

    if (other) return <><OutputScreen page="/VideoProjection" live={live} prefs={prefs} now={now} logoUrl={logo} audio={false} />{fading}</>;

    return (
        <>
            <div style={box}>
                {video.title && <div className="net-vtitle">{video.title}</div>}
                <LiveVideo item={video} meter="video" className="w-full h-screen" onEnded={() => { if (keryx.isDesktop) projection.clearVideo({ ended: true }).catch(() => {}); }} />
                <AlertLayer alert={alertOf(live, prefs.pref, "/VideoProjection")} />
            </div>
            {fading}
        </>
    );
}
