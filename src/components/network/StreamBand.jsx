import React from "react";
import { captionSize } from "@/lib/streamCaption";
import { bandBackground } from "@/lib/outputPrefs";

// The Transmissão band: the caption (streamCaption) as OBS lays it over the
// camera, styled by the page's options (streamOptions: the band's colour and
// opacity, the text size, the position, the reference). The page and the
// preview in Configurações draw this same piece. Sizes are in container
// units of its box (cqw), so the preview is the output.
const SIZE = { l: "3.4cqw", m: "2.7cqw", s: "2.1cqw" };
const PLACE = { bottom: { bottom: "6cqh" }, middle: { top: "50%", transform: "translateY(-50%)" }, top: { top: "6cqh" } };

export default function StreamBand({ caption, opts, scale = 1 }) {
    if (!caption) return null;
    const step = opts.size === "auto" ? captionSize(caption.text) : opts.size;
    return (
        <div key={caption.key} className="kx-stream-band" style={{
            position: "absolute", left: "6cqw", right: "6cqw", ...PLACE[opts.position],
            padding: "1.4cqw 2.2cqw", borderRadius: "0.6cqw",
            background: bandBackground(opts), color: "#fff",
            textAlign: "center", animation: "kx-stream-in 240ms ease-out",
        }}>
            <div style={{ fontSize: `calc(${SIZE[step]} * ${scale})`, lineHeight: 1.22, fontWeight: 500, whiteSpace: "pre-line", textWrap: "balance" }}>{caption.text}</div>
            {opts.show_ref && caption.ref && <div style={{ marginTop: "0.6cqw", fontSize: `calc(1.5cqw * ${scale})`, letterSpacing: "0.04em", color: "rgba(255,255,255,0.72)" }}>{caption.ref}</div>}
        </div>
    );
}
