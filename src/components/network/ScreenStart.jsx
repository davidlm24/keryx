import React, { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { letterbox, tapGate } from "@/lib/network/screenStage";
import { startAwake } from "@/lib/network/keepAwake";
import "./net.css";

// An output page on a screen of the church network (a tablet, a TV; owner
// 2026-11-01, after the first service with them; App.jsx mounts it there
// only, never on Transmissão). S2 = A: the page is the projector's 16:9
// stage centred on black (html.ks-net, --net-w/--net-h, net.css), sized
// from the visible viewport, so an iPad's 4:3 shows the whole picture and
// Safari's bars never push it. M4 = A: the first tap anywhere goes full
// screen, keeps the screen on and starts what the browser held; when a
// video was refused even muted, "Toque para começar" covers the screen
// until that tap — once per load (tapGate).
export default function ScreenStart() {
    useLayoutEffect(() => {
        const root = document.documentElement;
        root.classList.add("ks-net");
        const fit = () => {
            const box = letterbox(window.innerWidth, window.innerHeight);
            if (!box.width) return;
            root.style.setProperty("--net-w", `${box.width}px`);
            root.style.setProperty("--net-h", `${box.height}px`);
        };
        fit();
        const view = window.visualViewport;
        window.addEventListener("resize", fit);
        window.addEventListener("orientationchange", fit);
        view?.addEventListener("resize", fit);
        return () => {
            window.removeEventListener("resize", fit);
            window.removeEventListener("orientationchange", fit);
            view?.removeEventListener("resize", fit);
            root.classList.remove("ks-net");
            root.style.removeProperty("--net-w");
            root.style.removeProperty("--net-h");
        };
    }, []);

    // A click (a tap ends in one) and a key carry the gesture a browser asks for.
    useEffect(() => {
        const once = () => {
            document.removeEventListener("click", once, true);
            document.removeEventListener("keydown", once, true);
            begin();
        };
        document.addEventListener("click", once, true);
        document.addEventListener("keydown", once, true);
        return () => {
            document.removeEventListener("click", once, true);
            document.removeEventListener("keydown", once, true);
        };
    }, []);

    const needed = useSyncExternalStore(tapGate.subscribe, tapGate.needed);
    if (!needed) return null;
    return (
        <button type="button" className="net-tap" onClick={begin}>
            <b>Toque para começar</b>
        </button>
    );
}

// The overlay's own click reaches the page's listener first: once is enough.
let begun = false;
function begin() {
    if (begun) return;
    begun = true;
    for (const retry of tapGate.start()) retry();
    // Videos that start themselves (a Fundo, an aviso's) the browser held too.
    for (const v of document.querySelectorAll("video[autoplay]")) if (v.paused) v.play().catch(() => {});
    startAwake();
    const el = document.documentElement;
    const full = el.requestFullscreen || el.webkitRequestFullscreen;
    if (!full || document.fullscreenElement || document.webkitFullscreenElement) return;
    try { full.call(el)?.catch?.(() => {}); } catch { /* the browser has no full screen here (an iPhone) */ }
}
