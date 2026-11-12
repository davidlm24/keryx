import React, { useEffect, useRef, useState } from "react";
import { transposeChords, transposeChord } from "@/utils/chordTranspose";
import ChordedLines, { chordedOf, Transpose } from "./ChordedLines";
import { stageLines } from "@/lib/activity";
import { useBoxFit } from "@/hooks/useBoxFit";
import "@/components/network/net.css";

const two = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const mmss = (s) => `${two(Math.floor(s / 60))}:${two(s % 60)}`;
const isImage = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:"));

// What the stage monitor draws from a live state's content: current and next
// slide, key, BPM, chords and musician notes. When the lyrics carry inline
// chords, stage.chordedSlides has the current slide's chorded twin and the
// chords ride ABOVE the words, transposable; the legacy chords block keeps
// its side panel. The page (StageView) feeds it the live state; the
// console's Prévia feeds it the prepared stage (`embed`: inside a monitor,
// no transpose buttons). This is the page's own screen ("Padrão da página");
// a layout the operator drew is LayoutRenderer instead.
export default function StageScreen({ content, nowMs, embed = false, opts = {}, scale = 1, children }) {
    const now = new Date(nowMs);
    // Which parts this screen shows (Configurações › Telas e saídas ›
    // Ajustes); a missing key means on, the screen as it always was.
    const show = { chords: opts.chords ?? true, labels: opts.labels ?? true, clock: opts.clock ?? true, notes: opts.notes ?? true, next: opts.next ?? true };
    const style = scale !== 1 ? { "--kp-text": scale } : undefined;
    const [transpose, setTranspose] = useState(0);

    // A new song starts untransposed.
    const songKey = content?.startedAt ?? null;
    useEffect(() => { setTranspose(0); }, [songKey]);

    // The lyrics always fit (owner 2026-11-12): measured again per slide.
    const curRef = useRef(null);
    const fitKey = content ? `${content.startedAt}:${content.index || 0}:${Boolean(content.intro)}:${transpose}:${scale}:${show.chords}:${content.slides?.[content.index || 0]?.text || ""}` : "";
    useBoxFit(curRef, fitKey, Boolean(content) && content.kind !== "presentation");

    const cls = `net net-stage ${embed ? "net-embed" : ""}`;
    if (!content) {
        return (
            <div className={cls} style={style}>
                <div className="ns-idle">
                    <span className="net-section">Palco</span>
                    <div className="ns-clock">{hhmm(now)}</div>
                    <p>Aguardando projeção</p>
                </div>
                {children}
            </div>
        );
    }

    if (content.kind === "presentation") return <PresentationStage content={content} now={now} nowMs={nowMs} show={show} cls={cls} style={style}>{children}</PresentationStage>;

    const song = { title: content.title, artist: content.artist, background_image: content.style?.background_image, ...content.stage };
    const slides = content.slides?.length ? content.slides : [{ text: "" }];
    const index = content.index || 0;
    // The introduction (before the first mark): no slide yet, the first next.
    const intro = Boolean(content.intro);
    const current = intro ? { text: "", label: "Introdução" } : slides[index] || {};
    const next = intro ? slides[index] : slides[index + 1];
    // Time since the operator put this song up (the same on every screen).
    const elapsed = Math.max(0, Math.floor((nowMs - content.startedAt) / 1000));
    // The current slide with its chords, when the lyrics carry them.
    const chorded = show.chords && !intro ? chordedOf(song, index, current.text) : null;
    // An Escola bíblica question: the teacher sees the answer here, and the
    // question's own note (content.stage.slide_notes).
    const answer = stageLines(current.activity);
    const slideNote = content.stage?.slide_notes?.[index] || "";

    return (
        <div className={cls} style={style}>
            {isImage(song.background_image) && <div className="ns-bg" style={{ backgroundImage: `url(${song.background_image})` }} />}
            <StageStrip title={song.title || "Música"} sub={song.artist}>
                {show.labels && current.label && <Kv k="Parte" v={current.label} />}
                {song.song_key && <Kv k="Tom" v={transposeChord(song.song_key, transpose)} />}
                {song.bpm && <Kv k="BPM" v={song.bpm} />}
                {show.clock && <Kv k="Na música" v={mmss(elapsed)} />}
                {show.clock && <Kv k="Hora" v={hhmm(now)} clock />}
            </StageStrip>
            {song.musician_notes && show.notes && <div className="ns-notes">{song.musician_notes}</div>}
            {slideNote && show.notes && <div className="ns-notes">{slideNote}</div>}
            <main className="ns-main">
                <div className="ns-cur" ref={curRef}><div className="ns-cur-in">{chorded ? <ChordedLines chorded={chorded} transpose={transpose} /> : (current.text || (current.label ? <span className="ns-part">{current.label}</span> : ""))}{answer.length > 0 && <span className="ns-answer">{answer.map((l) => <span key={l} className={l.startsWith("✓") || l.startsWith("Resposta") ? "is-right" : ""}>{l}</span>)}</span>}</div></div>
                {chorded && !embed && (
                    <aside className="ns-trans" aria-label="Transposição">
                        <Transpose value={transpose} onChange={setTranspose} />
                    </aside>
                )}
                {song.chords && !chorded && show.chords && (
                    <aside className="ns-chords" aria-label="Cifra">
                        <div className="ns-chords-h">
                            <span className="net-section">Cifra</span>
                            {!embed && <Transpose value={transpose} onChange={setTranspose} />}
                        </div>
                        <pre>{transposeChords(song.chords, transpose)}</pre>
                    </aside>
                )}
            </main>
            <StageBar label="Próximo" text={next && show.next ? oneLine(next.text || next.label || "") : ""} count={slides.length} index={index} of="Slide" />
            {children}
        </div>
    );
}

// The next slide's lines as one line ("…" when longer than the bar).
const oneLine = (t) => String(t || "").split("\n").map((l) => l.trim()).filter(Boolean).join(" / ");

// The strip fixed to the top, edge to edge (owner 2026-11-12, mockup "Palco
// compacto", P1 = A): the title and its subtitle on the left, the values as
// "RÓTULO valor" on the right, the clock last and a little bigger.
function StageStrip({ title, sub, children }) {
    return (
        <header className="ns-h">
            <div className="ns-title"><b>{title}</b>{sub && <span>{sub}</span>}</div>
            <div className="ns-chips">{children}</div>
        </header>
    );
}
const Kv = ({ k, v, clock = false }) => <div className={`ns-chip ${clock ? "is-clock" : ""}`}><small>{k}</small><b>{v}</b></div>;

// The bar fixed to the bottom, edge to edge (P2 = A: one line, big enough to
// read from the stage; P3 = A: the slides' dots on its right). Drawn while it
// has something to say, so the lyrics keep their room on a one-slide item.
function StageBar({ label, text, count, index, of }) {
    if (!text && count < 2) return null;
    return (
        <footer className="ns-next">
            {text && <span className="net-section">{label}</span>}
            <p>{text}</p>
            {count > 1 && (
                <div className="ns-dots" aria-label={`${of} ${index + 1} de ${count}`}>
                    {Array.from({ length: count }, (_, i) => <i key={i} className={i === index ? "is-on" : i < index ? "is-done" : ""} />)}
                </div>
            )}
        </footer>
    );
}

// A presentation (a PDF's pages, Rodada F3): the page on air and the next
// one, so whoever speaks knows what comes; the page count and the clock in
// the header, as for a song.
function PresentationStage({ content, now, nowMs, show, cls, style, children }) {
    const slides = content.slides || [];
    const index = content.index || 0;
    const current = slides[index] || {};
    const next = slides[index + 1];
    const elapsed = Math.max(0, Math.floor((nowMs - content.startedAt) / 1000));
    return (
        <div className={cls} style={style}>
            <StageStrip title={content.title || "Apresentação"} sub="Apresentação">
                <Kv k="Página" v={`${index + 1}/${slides.length}`} />
                {show.clock && <Kv k="No ar" v={mmss(elapsed)} />}
                {show.clock && <Kv k="Hora" v={hhmm(now)} clock />}
            </StageStrip>
            <main className={`ns-pres ${next && show.next ? "" : "is-alone"}`}>
                <figure className="ns-page is-cur">
                    {isImage(current.image_url) && <img src={current.image_url} alt={current.label || ""} />}
                </figure>
                {next && show.next && (
                    <figure className="ns-page is-next">
                        <span className="net-section">Próxima</span>
                        {isImage(next.image_url) && <img src={next.image_url} alt={next.label || ""} />}
                    </figure>
                )}
            </main>
            <StageBar text="" count={slides.length} index={index} of="Página" />
            {children}
        </div>
    );
}
