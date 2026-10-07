import React, { useState, useEffect } from "react";
import CommunicationProjectionView from "@/components/projection/CommunicationProjectionView";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { mainLayer } from "@shared/live-state.mjs";

// The main projector: the live state (shared/live-state.mjs) rendered full
// screen by ScreenRenderer, the same component the console's monitors use.
// The old Ferramentas and Comunicação pages still send their tools and pieces
// by postMessage; those show until the live state shows something new.
export default function Projection() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const logo = useChurchLogo();
    const content = live?.content || null;
    const media = live?.media || null;

    // Legacy postMessage payloads (tools: clock, stopwatch, timer, black, freetext; communication pieces).
    const [toolMode, setToolMode] = useState(null);
    const [toolData, setToolData] = useState({});
    const [commPayload, setCommPayload] = useState(null);
    const [commKey, setCommKey] = useState(0);

    const goFullscreen = () => {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    };
    useEffect(() => { goFullscreen(); }, []);

    useEffect(() => {
        if (window.opener) window.opener.postMessage({ type: "PROJECTION_READY" }, "*");
        const handleMessage = (event) => {
            if (!event.data || !event.data.type) return;
            if (event.data.type === "STOP_PROJECTION") {
                setCommPayload(null);
            } else if (event.data.type === "COMMUNICATION_DATA") {
                setToolMode(null);
                setCommPayload({ video: event.data.video });
                setCommKey((k) => k + 1);
            } else if (event.data.type === "COMMUNICATION_SEQUENCE") {
                setToolMode(null);
                setCommPayload({ playlist: event.data.playlist, isSequence: true });
                setCommKey((k) => k + 1);
            } else if (event.data.type === "PROJECTION_TOOL") {
                setCommPayload(null);
                if (event.data.mode === "stop") {
                    setToolMode(null);
                    setToolData({});
                } else {
                    setToolMode(event.data.mode);
                    setToolData(event.data.payload || {});
                }
            }
        };
        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    // Anything new from the live state takes down what postMessage put up.
    const shownKey = [content?.startedAt, media?.shownAt, live?.tool?.startedAt, live?.communication?.startedAt].join("|");
    useEffect(() => {
        if (shownKey === "|||") return;
        setToolMode(null);
        setToolData({});
        setCommPayload(null);
    }, [shownKey]);

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

    // Legacy paths, shown as the live state's own layers would be.
    if (toolMode === "black") return <div className="min-h-screen bg-black" />;
    if (toolMode) {
        const tool = {
            mode: toolMode,
            text: toolData.text || "",
            style: { text_color: toolData.text_color, font_size: toolData.font_size, background_image: toolData.background_image },
            startedAt: toolData.startTime || now,
            endsAt: toolData.endTime || null,
        };
        return <ScreenRenderer fill state={{ ...live, screen: "show", tool }} now={now} logoUrl={logo} />;
    }
    if (commPayload) return <CommunicationProjectionView key={commKey} {...commPayload} />;

    return (
        <>
            <TabletVideoReceiver />
            <ScreenRenderer fill state={live} now={now} logoUrl={logo} />
        </>
    );
}
