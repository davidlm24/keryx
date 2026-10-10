import React, { useEffect } from "react";
import { useLiveState } from "@/hooks/useLiveState";
import { streamCaption, captionSize } from "@/lib/streamCaption";
import { FONT_MAP } from "@/lib/deviceStyles";

// Transmissão: the lower third for a live stream, an OBS Browser Source
// (1920 × 1080) laid over the camera. A transparent page with the slide's
// text in a band at the bottom, and the reference for Bible passages; text
// only (streamCaption decides). A network screen like the others, so OBS
// can run on this computer or another one on the church network.
const SIZE = { l: "3.4vw", m: "2.7vw", s: "2.1vw" };

export default function StreamView() {
    const caption = useLiveState(streamCaption);

    // OBS composes the page over the camera: nothing behind the band. The
    // app's dark color-scheme would make Chromium paint a dark canvas under
    // a transparent page, so this page asks for none.
    useEffect(() => {
        const root = document.documentElement;
        const els = [root, document.body, document.getElementById("root")].filter(Boolean);
        const was = els.map((el) => el.style.background);
        const wasScheme = root.style.colorScheme;
        els.forEach((el) => { el.style.background = "transparent"; });
        root.style.colorScheme = "normal";
        return () => { els.forEach((el, i) => { el.style.background = was[i]; }); root.style.colorScheme = wasScheme; };
    }, []);

    return (
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", fontFamily: FONT_MAP.sans }} data-stream="">
            {caption && (
                <div key={caption.key} className="kx-stream-band" style={{
                    position: "absolute", left: "6vw", right: "6vw", bottom: "6vh",
                    padding: "1.4vw 2.2vw", borderRadius: "0.6vw",
                    background: "rgba(10, 10, 12, 0.78)", color: "#fff",
                    textAlign: "center", animation: "kx-stream-in 240ms ease-out",
                }}>
                    <div style={{ fontSize: SIZE[captionSize(caption.text)], lineHeight: 1.22, fontWeight: 500, whiteSpace: "pre-line", textWrap: "balance" }}>{caption.text}</div>
                    {caption.ref && <div style={{ marginTop: "0.6vw", fontSize: "1.5vw", letterSpacing: "0.04em", color: "rgba(255,255,255,0.72)" }}>{caption.ref}</div>}
                </div>
            )}
            <style>{"@keyframes kx-stream-in { from { opacity: 0 } to { opacity: 1 } }"}</style>
        </div>
    );
}
