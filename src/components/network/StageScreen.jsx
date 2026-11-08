import React, { useEffect, useState } from "react";
import { transposeChords, transposeChord } from "@/utils/chordTranspose";
import ChordedLines, { chordedOf, Transpose } from "./ChordedLines";
import { stageLines } from "@/lib/activity";
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
    const current = slides[index] || {};
    const next = slides[index + 1];
    // Time since the operator put this song up (the same on every screen).
    const elapsed = Math.max(0, Math.floor((nowMs - content.startedAt) / 1000));
    // The current slide with its chords, when the lyrics carry them.
    const chorded = show.chords ? chordedOf(song, index, current.text) : null;
    // An Escola bíblica question: the teacher sees the answer here, and the
    // question's own note (content.stage.slide_notes).
    const answer = stageLines(current.activity);
    const slideNote = content.stage?.slide_notes?.[index] || "";

    return (
        <div className={cls} style={style}>
            {isImage(song.background_image) && <div className="ns-bg" style={{ backgroundImage: `url(${song.background_image})` }} />}
            <header className="ns-h">
                <div className="ns-title">
                    <b>{song.title || "Música"}</b>
                    {song.artist && <span>{song.artist}</span>}
                </div>
                <div className="ns-chips">
                    {show.labels && current.label && <div className="ns-chip"><small>Parte</small><b>{current.label}</b></div>}
                    {song.song_key && <div className="ns-chip"><small>Tom</small><b>{transposeChord(song.song_key, transpose)}</b></div>}
                    {song.bpm && <div className="ns-chip"><small>BPM</small><b>{song.bpm}</b></div>}
                    {show.clock && <div className="ns-chip"><small>Na música</small><b>{mmss(elapsed)}</b></div>}
                    {show.clock && <div className="ns-chip is-clock"><small>Hora</small><b>{hhmm(now)}</b></div>}
                </div>
            </header>
            {song.musician_notes && show.notes && <div className="ns-notes">{song.musician_notes}</div>}
            {slideNote && show.notes && <div className="ns-notes">{slideNote}</div>}
            <main className="ns-main">
                <div className="ns-cur">{chorded ? <ChordedLines chorded={chorded} transpose={transpose} /> : (current.text || "")}{answer.length > 0 && <span className="ns-answer">{answer.map((l) => <span key={l} className={l.startsWith("✓") || l.startsWith("Resposta") ? "is-right" : ""}>{l}</span>)}</span>}</div>
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
            {next && show.next && (
                <div className="ns-next">
                    <span className="net-section">Próximo</span>
                    <p>{next.text || ""}</p>
                </div>
            )}
            {slides.length > 1 && (
                <div className="ns-dots" aria-label={`Slide ${index + 1} de ${slides.length}`}>
                    {slides.map((_, i) => <i key={i} className={i === index ? "is-on" : i < index ? "is-done" : ""} />)}
                </div>
            )}
            {children}
        </div>
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
            <header className="ns-h">
                <div className="ns-title">
                    <b>{content.title || "Apresentação"}</b>
                    <span>Apresentação</span>
                </div>
                <div className="ns-chips">
                    <div className="ns-chip"><small>Página</small><b>{index + 1}/{slides.length}</b></div>
                    {show.clock && <div className="ns-chip"><small>No ar</small><b>{mmss(elapsed)}</b></div>}
                    {show.clock && <div className="ns-chip is-clock"><small>Hora</small><b>{hhmm(now)}</b></div>}
                </div>
            </header>
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
            {slides.length > 1 && (
                <div className="ns-dots" aria-label={`Página ${index + 1} de ${slides.length}`}>
                    {slides.map((_, i) => <i key={i} className={i === index ? "is-on" : i < index ? "is-done" : ""} />)}
                </div>
            )}
            {children}
        </div>
    );
}
