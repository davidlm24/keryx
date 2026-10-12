import React, { useEffect } from "react";
import { useLiveState } from "@/hooks/useLiveState";
import { useOutputPref } from "@/hooks/useOutputPref";
import { streamCaption } from "@/lib/streamCaption";
import { streamOptions } from "@/lib/outputPrefs";
import { FONT_MAP } from "@/lib/deviceStyles";
import StreamBand from "@/components/network/StreamBand";

// Transmissão: the lower third for a live stream, an OBS Browser Source
// (1920 × 1080) laid over the camera. A transparent page with the slide's
// text in a band (StreamBand), and the reference for Bible passages; text
// only (streamCaption decides). A network screen like the others, so OBS
// can run on this computer or another one on the church network. Its band
// follows Configurações › Telas na rede › Transmissão › Ajustes (OutputPref).
export default function StreamView() {
    const caption = useLiveState(streamCaption);
    const { pref } = useOutputPref("/StreamView");

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
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", fontFamily: FONT_MAP.sans, containerType: "size" }} data-stream="">
            <StreamBand caption={caption} opts={streamOptions(pref)} scale={pref.scale} />
            <style>{"@keyframes kx-stream-in { from { opacity: 0 } to { opacity: 1 } }"}</style>
        </div>
    );
}
