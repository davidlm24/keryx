import React from "react";
import { stillOf, subscribeFiles } from "@/lib/videoFiles";

// A video background that does not play (Rodada O, item 11): its still
// (Media.thumbnail_url, src/lib/videoFiles.js) when this window knows it,
// else the paused first frame — one decode, never a loop. The Prévia, the
// Temas thumbnails and the library draw this; outputs and the Programa
// monitor play the file.
export default function VideoStill({ src, style, className = "ks-bg-video" }) {
    const still = React.useSyncExternalStore(subscribeFiles, () => stillOf(src), () => null);
    if (still) return <img className={className} style={style} src={still} alt="" draggable={false} />;
    return <video className={className} style={style} src={src} preload="metadata" muted playsInline />;
}
