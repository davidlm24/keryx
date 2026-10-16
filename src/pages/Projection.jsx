import React, { useEffect, useState } from "react";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";
import LiveVideo from "@/components/projection/LiveVideo";
import OutputScreen from "@/components/screen/OutputScreen";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { mainLayer } from "@shared/live-state.mjs";
import { useNoticeAdvance } from "@/hooks/useNoticeAdvance";
import { usePrefs } from "@/hooks/useUser";
import { withTransitions } from "@/lib/console/transitions";
import { leavingAudio } from "@/lib/exitFade";

// The main projector: the live state (shared/live-state.mjs) rendered full
// screen by ScreenRenderer, the same component the console's monitors use,
// with this output's settings (OutputScreen).
export default function Projection() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const logo = useChurchLogo();

    // A network screen (tablet, TV) fills itself. On the desktop the main
    // process decides: full screen on an external monitor, a window on a
    // single-monitor PC; asking here would cover the console.
    useEffect(() => {
        if (keryx.isDesktop) return;
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }, []);

    // Arrows, space and clicks move the live slide (every screen follows),
    // only while the slides are what the projector shows.
    const hasContent = mainLayer(live) === "content";
    useEffect(() => {
        if (!keryx.isDesktop || !hasContent) return undefined;
        const fail = (err) => console.error("[keryx] slide:", err);
        const handleKeyPress = (e) => {
            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                projection.next().catch(fail);
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                projection.prev().catch(fail);
            }
        };
        const handleClick = (e) => {
            if (e.clientX > window.innerWidth / 2) projection.next().catch(fail);
            else projection.prev().catch(fail);
        };
        window.addEventListener("keydown", handleKeyPress);
        window.addEventListener("click", handleClick);
        return () => {
            window.removeEventListener("keydown", handleKeyPress);
            window.removeEventListener("click", handleClick);
        };
    }, [hasContent]);

    // If the operator clicked the projector window, the screen keys still
    // work there, as on the console: Esc takes everything down, B and L
    // toggle Tela preta and the logo — with the church's Transições.
    const screenMode = live?.screen || "show";
    const prefs = usePrefs();
    useEffect(() => {
        if (!keryx.isDesktop) return undefined;
        const fail = (err) => console.error("[keryx] screen:", err);
        const onKey = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            const screen = (mode) => projection.setScreen(mode, withTransitions("screen.set", {}, prefs)).catch(fail);
            if (k === "Escape") { e.preventDefault(); projection.clear(withTransitions("clear", {}, prefs)).catch(fail); }
            else if (k === "b") screen(screenMode === "black" ? "show" : "black");
            else if (k === "l") screen(screenMode === "logo" ? "show" : "logo");
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [screenMode, prefs]);

    // Avisos in a sequence ("Tocar todos"): at the end of each piece the
    // projector moves the live state on (communication.advance ignores the
    // same report from another screen).
    useNoticeAdvance(live?.communication);

    // The audio channel plays here, on the KERYX computer only (a TV on the
    // network showing this page stays silent), in whatever the screen shows.
    const audio = live?.audio || null;
    const audioIndex = audio?.playlistIndex ?? 0;
    const playsAudio = keryx.isDesktop && !keryx.isNetworkScreen;
    const audioPlayer = audio && playsAudio ? (
        <div className="hidden" aria-hidden="true">
            <LiveVideo item={audio} meter="audio" onEnded={() => { if (audio.playlist) projection.advanceAudio(audioIndex).catch(() => {}); }} />
        </div>
    ) : null;
    // One sound at a time (Transições): what a new sound stopped on the audio
    // channel with a fade plays on here until it is silent, then goes.
    const fading = playsAudio ? leavingAudio(live, keryx.live.now()) : [];
    const [, setTick] = useState(0);
    const lastUntil = Math.max(0, ...fading.map((e) => e.until));
    useEffect(() => {
        if (!lastUntil) return undefined;
        const id = setTimeout(() => setTick((t) => t + 1), Math.max(0, lastUntil - keryx.live.now()) + 50);
        return () => clearTimeout(id);
    }, [lastUntil]);

    return (
        <>
            {audioPlayer}
            {fading.map((e) => (
                <div key={`${e.at}:${e.item.url}`} className="hidden" aria-hidden="true">
                    <LiveVideo item={e.item} fadeOut={{ at: e.at, until: e.until }} />
                </div>
            ))}
            <TabletVideoReceiver />
            <OutputScreen page="/Projection" live={live} now={now} logoUrl={logo} audio={!keryx.isNetworkScreen} />
        </>
    );
}
