import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { fmtTime } from "@/lib/console/lyricSync";
import { fracOf, timeOf, ticks } from "@/lib/console/timelineView";
import { peaks, columns, BUCKETS } from "@/lib/console/waveform";

// Marcar os tempos' timeline (owner 2026-11-12, mockup "Fim da música com
// fade", T1–T4; the old one was one 30 px strip where moving the time
// caught a mark):
//   - the overview: the whole song, its marks, the Fim, the playhead and the
//     frame of the window on screen; a click centres the window there;
//   - the ruler: the minutes and seconds of the window; a click or a drag
//     only moves the time (the playhead's grip);
//   - the lane: only the marks (a flag per slide with its number, the Fim in
//     red with its fade band, past it hatched), over the sound's wave.
// The wheel slides the window, Ctrl + the wheel zooms (onWheel). The marks'
// drags are SyncView's (laneRef maps the pointer to a time).

// The decoded wave of a file, once per url for the page's life.
const WAVES = new Map();
function useWaveform(url) {
    const [wave, setWave] = useState(() => WAVES.get(url) || null);
    useEffect(() => {
        if (!url) { setWave(null); return undefined; }
        if (WAVES.has(url)) { setWave(WAVES.get(url)); return undefined; }
        let alive = true;
        setWave(null);
        (async () => {
            try {
                const buf = await (await fetch(url)).arrayBuffer();
                const Ctx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
                const audio = await new Ctx(1, 1, 44100).decodeAudioData(buf);
                const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i));
                const w = { peaks: peaks(channels, BUCKETS), duration: audio.duration };
                WAVES.set(url, w);
                if (alive) setWave(w);
            } catch {
                // A file the browser cannot decode (a codec it lacks): no wave.
                WAVES.set(url, null);
            }
        })();
        return () => { alive = false; };
    }, [url]);
    return wave;
}

function WaveCanvas({ wave, from, span, t }) {
    const ref = useRef(null);
    const [size, setSize] = useState({ w: 0, h: 0 });
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
        ro.observe(el);
        setSize({ w: el.clientWidth, h: el.clientHeight });
        return () => ro.disconnect();
    }, []);
    useEffect(() => {
        const el = ref.current;
        if (!el || !wave || !size.w) return;
        const dpr = window.devicePixelRatio || 1;
        el.width = Math.round(size.w * dpr);
        el.height = Math.round(size.h * dpr);
        const g = el.getContext("2d");
        g.clearRect(0, 0, el.width, el.height);
        const cols = columns(wave.peaks, wave.duration, from, span, Math.floor(size.w / 2));
        const css = getComputedStyle(el);
        const played = css.getPropertyValue("--wave-played").trim() || "#8a8679";
        const rest = css.getPropertyValue("--wave").trim() || "#4a4943";
        const playedTo = fracOf(t, from, span) * size.w;
        const mid = el.height / 2;
        for (let x = 0; x < cols.length; x++) {
            const h = Math.max(1, cols[x] * (el.height - 4 * dpr));
            g.fillStyle = x * 2 < playedTo ? played : rest;
            g.fillRect(x * 2 * dpr, mid - h / 2, Math.max(1, dpr * 1.4), h);
        }
    }, [wave, from, span, t, size]);
    return <canvas ref={ref} className="sync-wave" aria-hidden="true" />;
}

export default function SyncTimeline({ duration, t, from, span, laneRef, markers = [], end = null, endFade = 3, onEndDown, onEndMove, onEndUp, tip = null, media = "", overviewMarks = [], onSeekStart, onSeekMove, onSeekEnd, onLaneClick, onCenter, onWheel }) {
    const wave = useWaveform(media || "");
    const pct = (x) => `${fracOf(x, from, span) * 100}%`;
    const whole = (x) => `${duration ? Math.min(100, Math.max(0, (x / duration) * 100)) : 0}%`;
    const boxRef = useRef(null);
    // The wheel needs a listener that may prevent the page's scroll.
    const wheelRef = useRef(onWheel);
    wheelRef.current = onWheel;
    useEffect(() => {
        const el = boxRef.current;
        if (!el) return undefined;
        const on = (e) => {
            const r = laneRef.current?.getBoundingClientRect();
            const frac = r ? Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) : 0.5;
            e.preventDefault();
            wheelRef.current?.({ zoom: e.ctrlKey || e.metaKey, delta: Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY, at: timeOf(frac, from, span) });
        };
        el.addEventListener("wheel", on, { passive: false });
        return () => el.removeEventListener("wheel", on);
    }, [laneRef, from, span]);
    const overviewAt = (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        return Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (duration || 0);
    };
    const endTo = Number.isFinite(end) ? end + (endFade || 0) : null;
    return (
        <div className="sync-tl" ref={boxRef}>
            {duration > 0 && span < duration && (
                <div className="sync-ov" role="presentation" title="A música inteira · clique para ver aquele trecho" onPointerDown={(e) => onCenter?.(overviewAt(e))}>
                    {overviewMarks.map((v, k) => <i key={k} className="sync-ov-mk" style={{ left: whole(v) }} />)}
                    {Number.isFinite(end) && <i className="sync-ov-end" style={{ left: whole(end) }} />}
                    <i className="sync-ov-frame" style={{ left: whole(from), width: `${(span / duration) * 100}%` }} />
                    <i className="sync-ov-head" style={{ left: whole(t) }} />
                </div>
            )}
            <div className="sync-frame">
                <div className="sync-ruler" title="Clique ou arraste para ir a um ponto da música"
                    onPointerDown={(e) => { if (e.button !== 0) return; e.currentTarget.setPointerCapture?.(e.pointerId); onSeekStart?.(e.clientX); }}
                    onPointerMove={(e) => { if (e.buttons & 1) onSeekMove?.(e.clientX); }}
                    onPointerUp={() => onSeekEnd?.()} onPointerCancel={() => onSeekEnd?.()}>
                    {ticks(from, span).map((k) => (
                        <React.Fragment key={k.t}>
                            <i className={`sync-tick ${k.major ? "is-major" : ""}`} style={{ left: pct(k.t) }} />
                            {k.label && <span className="sync-tlab" style={{ left: pct(k.t) }}>{k.label}</span>}
                        </React.Fragment>
                    ))}
                    <i className="sync-grip" style={{ left: pct(t) }} />
                </div>
                <div className="sync-lane" ref={laneRef} onPointerDown={(e) => { if (e.button === 0 && e.target === e.currentTarget) onLaneClick?.(e.clientX); }}>
                    <i className="sync-played" style={{ width: `${Math.max(0, Math.min(1, fracOf(t, from, span))) * 100}%` }} />
                    {wave && <WaveCanvas wave={wave} from={from} span={span} t={t} />}
                    {Number.isFinite(end) && <i className="sync-fade" style={{ left: pct(end), width: `${((endFade || 0) / span) * 100}%` }} />}
                    {endTo !== null && duration > endTo && <i className="sync-after" style={{ left: pct(endTo) }} />}
                    {markers.map((m) => (
                        <span key={m.key} className={`sync-mk ${m.cls || ""}`} style={{ left: pct(m.v) }} title={m.title}
                            onPointerDown={m.onPointerDown} onPointerMove={m.onPointerMove} onPointerUp={m.onPointerUp} onPointerCancel={m.onPointerUp}>{m.label !== "" && m.label != null && <span className="sync-mk-n">{m.label}</span>}</span>
                    ))}
                    {Number.isFinite(end) && (
                        <span className="sync-mk is-end" style={{ left: pct(end) }} title={`Fim da música · ${fmtTime(end)} · o som desce em ${String(endFade).replace(".", ",")} s · arraste para ajustar`}
                            onPointerDown={onEndDown} onPointerMove={onEndMove} onPointerUp={onEndUp} onPointerCancel={onEndUp}><span className="sync-mk-n">Fim · {fmtTime(end).slice(0, -3)}</span></span>
                    )}
                    {tip && <span className="sync-tip" style={{ left: tip.left }} role="status">{tip.text}</span>}
                </div>
                <b className="sync-head" style={{ left: pct(t) }} />
            </div>
        </div>
    );
}
