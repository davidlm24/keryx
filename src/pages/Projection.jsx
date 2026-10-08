import React, { useEffect } from "react";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";
import LiveVideo from "@/components/projection/LiveVideo";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { mainLayer } from "@shared/live-state.mjs";
import { useNoticeAdvance } from "@/hooks/useNoticeAdvance";

// The main projector: the live state (shared/live-state.mjs) rendered full
// screen by ScreenRenderer, the same component the console's monitors use.
export default function Projection() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const logo = useChurchLogo();

    const goFullscreen = () => {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    };
    useEffect(() => { goFullscreen(); }, []);

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
    // toggle Tela preta and the logo.
    const screenMode = live?.screen || "show";
    useEffect(() => {
        if (!keryx.isDesktop) return undefined;
        const fail = (err) => console.error("[keryx] screen:", err);
        const onKey = (e) => {
            if (e.ctrlKey || e.metaKey || e.altKey) return;
            const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
            if (k === "Escape") { e.preventDefault(); projection.clear().catch(fail); }
            else if (k === "b") projection.setScreen(screenMode === "black" ? "show" : "black").catch(fail);
            else if (k === "l") projection.setScreen(screenMode === "logo" ? "show" : "logo").catch(fail);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [screenMode]);

    // Avisos in a sequence ("Tocar todos"): at the end of each piece the
    // projector moves the live state on (communication.advance ignores the
    // same report from another screen).
    useNoticeAdvance(live?.communication);

    // The audio channel plays here, on the KERYX computer only (a TV on the
    // network showing this page stays silent), in whatever the screen shows.
    const audio = live?.audio || null;
    const audioIndex = audio?.playlistIndex ?? 0;
    const audioPlayer = audio && keryx.isDesktop && !keryx.isNetworkScreen ? (
        <div className="hidden" aria-hidden="true">
            <LiveVideo item={audio} meter="audio" onEnded={() => { if (audio.playlist) projection.advanceAudio(audioIndex).catch(() => {}); }} />
        </div>
    ) : null;

    return (
        <>
            {audioPlayer}
            <TabletVideoReceiver />
            <ScreenRenderer fill state={live} now={now} logoUrl={logo} audio={!keryx.isNetworkScreen} />
        </>
    );
}
