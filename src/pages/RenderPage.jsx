import React, { useEffect, useState } from "react";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { frameState } from "@/lib/console/lyricVideo";

/**
 * "Exportar vídeo com a letra…" (owner 2026-11-11): the hidden, offscreen
 * 1920×1080 page main opens for one job (electron/lyricVideo.cjs). It asks
 * for the document to draw (the song as the console would send it, with the
 * theme chosen), draws the background alone and then each slide as a still
 * — the screens' own renderer, so the video looks like the projector —
 * and after each one, once its fonts and pictures are in and the text has
 * fitted, asks main to keep the frame; "drawn" ends it. Never an output,
 * never a network screen, never in the Saídas list.
 */
const bridge = () => (typeof window !== "undefined" ? window.keryxDesktop?.lyricVideo : null);
const frames = (n) => new Promise((done) => { const step = (k) => (k <= 0 ? done() : requestAnimationFrame(() => step(k - 1))); step(n); });
const wait = (ms) => new Promise((done) => setTimeout(done, ms));

// Everything on the page drawn: the fonts, every picture, a few frames for
// the fit (useFit measures, then re-renders) and a breath for the last one.
async function settled() {
    try { await document.fonts.ready; } catch { /* no fonts API */ }
    await Promise.all([...document.images].map((img) => (img.complete ? null : img.decode().catch(() => null))));
    await frames(4);
    await wait(250);
    await frames(2);
}

export default function RenderPage() {
    const [doc, setDoc] = useState(null);
    const [at, setAt] = useState("bg");
    useEffect(() => {
        const b = bridge();
        const id = new URLSearchParams(window.location.search).get("job");
        if (!b || !id) return undefined;
        let alive = true;
        (async () => {
            const r = await b.call("doc", { id });
            if (!alive || !r?.data) return;
            setDoc(r.data.doc);
            const count = r.data.count;
            for (const frame of ["bg", ...Array.from({ length: count }, (_, i) => i)]) {
                if (!alive) return;
                setAt(frame);
                await settled();
                await b.call("frame", { id, frame });
            }
            if (alive) await b.call("drawn", { id });
        })();
        return () => { alive = false; };
    }, []);
    if (!doc) return <div style={{ position: "fixed", inset: 0, background: "#000" }} />;
    // The introduction (the Fundo, or the title when the song begins "Com
    // título"), else the slide, its intro flag dropped (frameState).
    const state = frameState(doc, at);
    return (
        <div style={{ position: "fixed", inset: 0, background: "#000" }}>
            <ScreenRenderer state={state} preview fill />
        </div>
    );
}
