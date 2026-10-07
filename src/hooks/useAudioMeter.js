import { useEffect } from "react";

const REPORT_MS = 80;
const FLOOR_DB = -60;
const FFT = 1024;

// A peak (0..1 linear) as a meter position: -60 dBFS is empty, 0 dBFS full.
export const meterLevel = (peak) => (peak <= 0.001 ? 0 : Math.max(0, Math.min(1, (20 * Math.log10(peak) - FLOOR_DB) / -FLOOR_DB)));

// One audio graph per element, for as long as the element lives: once an
// element feeds an AudioContext its sound only comes out through it, so the
// graph must never be torn down under a playing element.
const graphs = new WeakMap();

// The element's sound through Web Audio: element -> speakers, and element ->
// L/R analysers. The element's volume is applied before the graph (Chromium),
// so the meters read what goes out, as on a mixer. Built only when the
// context runs (an output window may autoplay) and the file may be read
// (same origin, or loaded in CORS mode): otherwise the element keeps its own
// output and there are simply no meters — never silence.
function graphFor(el) {
    const known = graphs.get(el);
    if (known) return known;
    const g = { ready: false, analysers: null, ctx: null };
    graphs.set(el, g);
    let readable = false;
    try {
        const src = new URL(el.currentSrc || el.src, window.location.href);
        readable = src.origin === window.location.origin || el.crossOrigin === "anonymous";
    } catch {
        readable = false;
    }
    if (!readable || typeof AudioContext === "undefined") return g;
    const ctx = new AudioContext();
    g.ctx = ctx;
    const wire = () => {
        if (ctx.state !== "running") { ctx.close().catch(() => {}); g.ctx = null; return; }
        try {
            const source = ctx.createMediaElementSource(el);
            source.connect(ctx.destination);
            const split = ctx.createChannelSplitter(2);
            source.connect(split);
            g.analysers = [0, 1].map((channel) => {
                const a = ctx.createAnalyser();
                a.fftSize = FFT;
                split.connect(a, channel);
                return a;
            });
            g.ready = true;
        } catch {
            ctx.close().catch(() => {});
            g.ctx = null;
        }
    };
    if (ctx.state === "running") wire();
    else ctx.resume().then(wire, wire);
    return g;
}

// When the element is gone (another item, the output closed), its graph goes.
function releaseLater(el) {
    setTimeout(() => {
        if (el.isConnected) return;
        const g = graphs.get(el);
        g?.ctx?.close().catch(() => {});
        graphs.delete(el);
    }, 0);
}

// Measures the sound of a media element where it plays (an output window)
// and reports it to the console's player meters a dozen times a second
// (window.keryxDesktop.meters, relayed by the main process), with the
// duration the element knows.
//
// elRef: the <video>; layer: "media" | "video" | "audio"; url: the item, so
// the console can ignore a report about the previous one.
export function useAudioMeter(elRef, { layer, url, enabled }) {
    useEffect(() => {
        const bridge = window.keryxDesktop;
        const el = elRef.current;
        if (!enabled || !layer || !el || !bridge?.meters) return undefined;
        const meters = bridge.meters;
        const buf = new Float32Array(FFT);
        const peak = (a) => {
            a.getFloatTimeDomainData(buf);
            let m = 0;
            for (let i = 0; i < buf.length; i++) {
                const v = Math.abs(buf[i]);
                if (v > m) m = v;
            }
            return m;
        };

        // Wired before it plays: switching a playing element's sound into
        // Web Audio mid-play can stall it while it seeks.
        graphFor(el);
        const tick = () => {
            const playing = !el.paused && !el.ended;
            const g = graphs.get(el);
            let l = 0;
            let r = 0;
            if (g?.ready && playing) {
                l = meterLevel(peak(g.analysers[0]));
                r = meterLevel(peak(g.analysers[1]));
                // A mono file: the splitter leaves the right channel silent.
                if (r === 0 && l > 0) r = l;
            }
            meters.report({ layer, l, r, duration: Number.isFinite(el.duration) ? el.duration : null, url });
        };
        const id = setInterval(tick, REPORT_MS);
        return () => {
            clearInterval(id);
            meters.report({ layer, l: 0, r: 0, duration: null, url });
            releaseLater(el);
        };
    }, [elRef, layer, url, enabled]);
}
