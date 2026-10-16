import React, { useCallback, useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Seg, WinBar, useUnloadGuard, Empty } from "./kx";
import { useConfirm } from "./ConfirmDialog";
import { useWinCol } from "./winLayout";
import { isVideoUrl } from "@/lib/console/content";
import { fmtTime, parseTime, indexAt, nextUnmarked, setMark, nudge, recordMark, distribute, markedCount, sameMarks, SPEEDS, SEEK_SECONDS, STEP } from "@/lib/console/lyricSync";

const isMark = (v) => Number.isFinite(v);
const firstLine = (text) => String(text || "").split("\n").find((l) => l.trim()) || "";

// A time typed in the slide's row (m:ss.cc); Enter or leaving the field
// keeps it, Esc puts back what was there, empty clears the mark.
function TimeField({ value, onCommit }) {
    const [text, setText] = useState(null);
    const shown = text ?? (isMark(value) ? fmtTime(value) : "");
    const commit = () => {
        if (text === null) return;
        const v = parseTime(text);
        setText(null);
        if (v !== undefined) onCommit(v);
    };
    return (
        <input className={`sync-time ${text !== null && parseTime(text) === undefined ? "is-bad" : ""}`} value={shown} placeholder="—" aria-label="Início do slide (m:ss.cc)" spellCheck={false}
            onClick={(e) => e.stopPropagation()} onChange={(e) => setText(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commit(); e.currentTarget.blur(); } else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setText(null); e.currentTarget.blur(); } }} />
    );
}

// Sincronizar (owner 2026-10-15, Rodada D4): a page of the window in the
// Editor size, pushed from the Editor de música ("← Editor de música"). The
// song's media big on the left with the slide that plays now over it, a
// time line with one marker per slide (drag to adjust, click to go there);
// the slides on the right with their times (typed, − / +, Marcar aqui).
// Recording marks from the chosen slide on and never wipes the others.
// With no media the page runs a clock (Ao vivo: the musicians, a rehearsal).
// Aplicar takes the marks back to the editor's draft; its Salvar keeps them.
// Keys: Espaço marks the next slide (recording) or plays / pauses,
// Backspace undoes the last mark, ← / → go back / ahead 2 s, [ / ] speed.
export default function SyncView({ title = "", slides = [], media = "", duration: songDuration = null, starts: initial = [], onApply, onClose, escRef, active = true }) {
    const col = useWinCol("sync.slides", { def: 440, min: 340, max: 760, sign: -1 });
    const ask = useConfirm();
    const n = slides.length;
    const [starts, setStarts] = useState(() => Array.from({ length: n }, (_, i) => (isMark(initial[i]) ? initial[i] : null)));
    const [undo, setUndo] = useState([]);
    const [sel, setSel] = useState(() => Math.max(0, nextUnmarked(initial)));
    const [rec, setRec] = useState(null); // the slide Espaço marks next while recording
    const [speed, setSpeed] = useState(1);
    const [t, setT] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [mediaDur, setMediaDur] = useState(null);
    const mediaRef = useRef(null);
    const video = isVideoUrl(media);
    const live = !media;
    // The live clock (no media): seconds at `at` (performance.now), running when at is set.
    const clk = useRef({ base: 0, at: null });
    const lastMark = Math.max(0, ...starts.filter(isMark));
    const duration = mediaDur || songDuration || (live ? Math.max(180, Math.ceil(lastMark + 30)) : null);
    const marked = markedCount(starts);
    const dirty = !sameMarks(starts, Array.from({ length: n }, (_, i) => initial[i] ?? null));
    // Detached (/Janela), unsaved changes hold the window: closing it asks.
    useUnloadGuard(dirty);
    const playingIdx = indexAt(starts, t);

    const now = useCallback(() => {
        if (live) { const c = clk.current; return c.at === null ? c.base : c.base + ((performance.now() - c.at) / 1000) * speed; }
        return mediaRef.current?.currentTime ?? 0;
    }, [live, speed]);
    const play = () => {
        if (live) { if (clk.current.at === null) clk.current = { base: clk.current.base, at: performance.now() }; setPlaying(true); }
        else mediaRef.current?.play().catch(() => {});
    };
    const pause = () => {
        if (live) { clk.current = { base: now(), at: null }; setPlaying(false); }
        else mediaRef.current?.pause();
    };
    const seek = (x) => {
        const v = Math.max(0, duration ? Math.min(duration, x) : x);
        if (live) clk.current = { base: v, at: clk.current.at === null ? null : performance.now() };
        else if (mediaRef.current) mediaRef.current.currentTime = v;
        setT(v);
    };
    const toSpeed = (v) => {
        if (live) clk.current = { base: now(), at: clk.current.at === null ? null : performance.now() };
        setSpeed(v);
    };
    useEffect(() => { if (mediaRef.current) mediaRef.current.playbackRate = speed; }, [speed]);
    // The time on screen follows the media (or the clock) while it plays.
    useEffect(() => {
        if (!playing) { setT(now()); return undefined; }
        let raf = 0;
        const step = () => { setT(now()); raf = requestAnimationFrame(step); };
        raf = requestAnimationFrame(step);
        return () => cancelAnimationFrame(raf);
    }, [playing, now]);
    // Leaving the page stops the sound.
    useEffect(() => () => mediaRef.current?.pause(), []);

    // Every change of the marks can be undone (Backspace, Desfazer).
    const change = (next) => { setUndo((u) => [...u.slice(-49), starts]); setStarts(next); };
    const undoLast = () => {
        if (!undo.length) return;
        setStarts(undo[undo.length - 1]);
        setUndo((u) => u.slice(0, -1));
        if (rec !== null) setRec((r) => Math.max(0, r - 1));
    };
    const startRecording = () => { setRec(sel); if (!playing) play(); };
    const stopRecording = () => setRec(null);
    const markNext = () => {
        if (rec === null || rec >= n) return;
        change(recordMark(starts, rec, now()));
        setSel(rec);
        if (rec + 1 >= n) setRec(null); else setRec(rec + 1);
    };
    const spread = async () => {
        if (!duration) return;
        if (marked && !(await ask({ title: "Distribuir os slides?", text: `As ${marked} marcas de agora dão lugar a ${n} marcas espalhadas por ${fmtTime(duration).slice(0, -3)}. Desfazer volta atrás.`, ok: "Distribuir" }))) return;
        change(distribute(n, duration));
    };

    const leave = async (all = false) => {
        if (dirty && !(await ask({ title: "Descartar as marcas?", text: `As marcas de "${title}" mudaram e não foram aplicadas.`, ok: "Descartar" }))) return;
        onClose(all);
    };
    const apply = () => { onApply?.(starts); onClose(false); };
    if (escRef) escRef.current = (mode) => { if (mode === "esc" && rec !== null) stopRecording(); else leave(mode === "all"); };

    // The page's keys, before the console's (← → move what is on air there).
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (!active || e.ctrlKey || e.metaKey || e.altKey) return;
        if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName) || e.target?.isContentEditable) return;
        if (document.querySelector(".console .scrim:not(.win-scrim)")) return;
        const k = e.key;
        let done = true;
        if (k === " ") { if (rec !== null) markNext(); else if (playing) pause(); else play(); }
        else if (k === "Backspace") undoLast();
        else if (k === "ArrowLeft") seek(now() - SEEK_SECONDS);
        else if (k === "ArrowRight") seek(now() + SEEK_SECONDS);
        else if (k === "[") toSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)]);
        else if (k === "]") toSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)]);
        else done = false;
        if (done) { e.preventDefault(); e.stopPropagation(); }
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    // The time line: a click goes there; a marker dragged moves its slide's
    // mark (in order, to a tenth of a second).
    const lineRef = useRef(null);
    const timeAtX = (clientX) => {
        const r = lineRef.current?.getBoundingClientRect();
        if (!r || !duration) return 0;
        return Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * duration;
    };
    const drag = useRef(null);
    const dragMarker = (i) => (e) => {
        e.stopPropagation();
        e.preventDefault();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { i, base: starts };
        setUndo((u) => [...u.slice(-49), starts]);
        setSel(i);
    };
    const moveMarker = (e) => { const d = drag.current; if (d) setStarts(setMark(d.base, d.i, timeAtX(e.clientX))); };
    const dropMarker = () => { drag.current = null; };
    const pct = (x) => (duration ? `${Math.min(100, Math.max(0, (x / duration) * 100))}%` : "0%");
    const minutes = duration ? Array.from({ length: Math.floor(duration / 60) + 1 }, (_, m) => m * 60) : [];

    const lyric = playingIdx >= 0 ? slides[playingIdx]?.text : "";
    const sourceWord = live ? "Ao vivo · relógio, sem mídia" : video ? "Vídeo · com a letra como sai na tela" : "Playback";

    return (
        <>
            <WinBar title="Sincronizar" sub={`${title || "Música"} · ${marked}/${n} marcados${dirty ? " · não aplicado" : ""}`}
                tools={<Seg small label="Velocidade" value={String(speed)} onChange={(v) => toSpeed(Number(v))} options={SPEEDS.map((v) => [String(v), `${String(v).replace(".", ",")}×`, { title: `Tocar a ${String(v).replace(".", ",")}× · [ e ]` }])} />}
                actions={<>
                    <Btn small onClick={() => leave()}>Cancelar</Btn>
                    <Btn small kind="brand" disabled={!dirty} onClick={apply} title="Leva as marcas para o Editor de música; o Salvar de lá grava">Aplicar</Btn>
                </>} />
            <div className="win-body sync">
                <div className="col center">
                    <Panel title={sourceWord} actions={<>
                        {rec === null
                            ? <Btn small kind="outline" disabled={!n} onClick={startRecording} title="Toca e, a cada Espaço, marca o próximo slide a partir do escolhido · as outras marcas ficam">Gravar a partir do slide {Math.min(sel + 1, n)}</Btn>
                            : <Btn small kind="rh" onClick={stopRecording} title="Parar de gravar · Esc">Gravando · Espaço marca o slide {rec + 1}</Btn>}
                        <Btn small disabled={!duration || !n} onClick={spread} title={duration ? "Espalha os slides igualmente pela duração da música · depois ajuste os que destoarem" : "Preencha a duração da música no editor"}>Distribuir pelo tempo…</Btn>
                    </>} bodyStyle={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", padding: "var(--space-2)" }}>
                        <div className={`sync-stage ${video ? "is-video" : ""}`}>
                            {video && <video ref={mediaRef} src={media} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onLoadedMetadata={(e) => setMediaDur(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)} />}
                            {!video && !live && <audio ref={mediaRef} src={media} preload="auto" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onLoadedMetadata={(e) => setMediaDur(Number.isFinite(e.currentTarget.duration) ? e.currentTarget.duration : null)} />}
                            {!video && <span className="sync-src"><Icon name={live ? "clock" : "music"} />{live ? "Relógio ao vivo" : "Playback"}</span>}
                            <div className="sync-lyric">{lyric ? lyric.split("\n").map((l, k) => <span key={k}>{l}</span>) : <span className="kx-meta">{marked ? "Antes do primeiro slide marcado" : "Toque e marque com Espaço"}</span>}</div>
                            {playingIdx >= 0 && <span className="sync-now">Slide {playingIdx + 1}{slides[playingIdx]?.label ? ` · ${slides[playingIdx].label}` : ""}</span>}
                        </div>
                        <div className="sync-ctl">
                            <IconBtn name="skip-back" title="Voltar ao início" onClick={() => seek(0)} />
                            <button type="button" className="kx-btn kx-t sync-skip" onClick={() => seek(now() - SEEK_SECONDS)} title="Voltar 2 segundos · ←">−2</button>
                            <IconBtn name={playing ? "pause" : "play"} className="sync-play" title={playing ? "Pausar · Espaço" : "Tocar · Espaço"} onClick={() => (playing ? pause() : play())} />
                            <button type="button" className="kx-btn kx-t sync-skip" onClick={() => seek(now() + SEEK_SECONDS)} title="Avançar 2 segundos · →">+2</button>
                            <span className="kx-time sync-clock">{fmtTime(t)}<small> / {duration ? fmtTime(duration).slice(0, -3) : "--:--"}</small></span>
                            <span className="kx-spacer" />
                            <IconBtn name="undo" title="Desfazer a última mudança · Backspace" disabled={!undo.length} onClick={undoLast} />
                        </div>
                        <div className="sync-line" ref={lineRef} onPointerMove={moveMarker} onPointerUp={dropMarker} onPointerCancel={dropMarker}
                            onPointerDown={(e) => { if (e.button === 0 && duration) seek(timeAtX(e.clientX)); }}>
                            <i className="sync-played" style={{ width: pct(t) }} />
                            {starts.map((v, i) => (isMark(v) ? (
                                <span key={i} className={`sync-mk ${i === playingIdx ? "is-air" : ""} ${i === sel ? "is-sel" : ""}`} style={{ left: pct(v) }} title={`Slide ${i + 1} · ${fmtTime(v)} · arraste para ajustar`}
                                    onPointerDown={dragMarker(i)} onPointerMove={moveMarker} onPointerUp={dropMarker}>{i + 1}</span>
                            ) : null))}
                            <b className="sync-head" style={{ left: pct(t) }} />
                        </div>
                        <div className="sync-scale">{minutes.map((m) => <span key={m} style={{ left: pct(m) }}>{fmtTime(m).slice(0, -3)}</span>)}</div>
                        <span className="kx-meta">Arraste uma marca para ajustar (encaixa em {String(STEP).replace(".", ",")} s) · clique na linha do tempo para ir até ali. Espaço marca (gravando) ou toca · Backspace desfaz · ← → 2 s · [ ] velocidade.</span>
                    </Panel>
                </div>
                {col.split}
                <div className="col" style={col.style}>
                    <Panel title={<>Slides <span className="kx-count">· {n}</span></>} bodyStyle={{ overflow: "auto" }}>
                        {!n && <Empty icon="list" title="Nenhum slide">Escreva a letra no editor primeiro.</Empty>}
                        <div className="sync-list">
                            {slides.map((s, i) => (
                                <div key={i} role="button" tabIndex={-1} className={`sync-row ${i === playingIdx ? "is-air" : ""} ${rec === i ? "is-prev" : ""} ${i === sel ? "is-sel" : ""}`}
                                    onClick={() => { setSel(i); if (isMark(starts[i])) seek(starts[i]); }} title={s.text}>
                                    <span className="n">{i + 1}</span>
                                    <span className="sync-txt">{s.label && <b>[{s.label}] </b>}{firstLine(s.text)}</span>
                                    <TimeField value={starts[i]} onCommit={(v) => change(setMark(starts, i, v))} />
                                    <span className="sync-acts">
                                        <IconBtn small name="minus" title={`−${String(STEP).replace(".", ",")} s`} disabled={!isMark(starts[i])} onClick={(e) => { e.stopPropagation(); change(nudge(starts, i, -STEP)); }} />
                                        <IconBtn small name="plus" title={`+${String(STEP).replace(".", ",")} s`} disabled={!isMark(starts[i])} onClick={(e) => { e.stopPropagation(); change(nudge(starts, i, STEP)); }} />
                                        <Btn small onClick={(e) => { e.stopPropagation(); setSel(i); change(setMark(starts, i, now())); }} title="Marcar este slide no tempo de agora">Aqui</Btn>
                                        <IconBtn small name="x" title="Tirar a marca" disabled={!isMark(starts[i])} onClick={(e) => { e.stopPropagation(); change(setMark(starts, i, null)); }} />
                                    </span>
                                </div>
                            ))}
                        </div>
                        <div className="listhead"><span className="kx-meta">Dourado: o slide tocando agora · verde: o próximo que Espaço marca · clique numa linha para ir ao tempo dela.</span></div>
                    </Panel>
                </div>
            </div>
        </>
    );
}
