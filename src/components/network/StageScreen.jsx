import React, { useEffect, useState } from "react";
import { transposeChords, semitoneLabel } from "@/utils/chordTranspose";
import "@/components/network/net.css";

const two = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const mmss = (s) => `${two(Math.floor(s / 60))}:${two(s % 60)}`;
const isImage = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:"));

// What the stage monitor draws from a live state's content: current and next
// slide, key, BPM, chords and musician notes. The page (StageView) feeds it
// the live state; the console's Prévia feeds it the prepared stage
// (`embed`: inside a monitor, no transpose buttons).
export default function StageScreen({ content, nowMs, embed = false, children }) {
    const now = new Date(nowMs);
    const [transpose, setTranspose] = useState(0);

    // A new song starts untransposed.
    const songKey = content?.startedAt ?? null;
    useEffect(() => { setTranspose(0); }, [songKey]);

    const cls = `net net-stage ${embed ? "net-embed" : ""}`;
    if (!content) {
        return (
            <div className={cls}>
                <div className="ns-idle">
                    <span className="net-section">Palco</span>
                    <div className="ns-clock">{hhmm(now)}</div>
                    <p>Aguardando projeção</p>
                </div>
                {children}
            </div>
        );
    }

    const song = { title: content.title, artist: content.artist, background_image: content.style?.background_image, ...content.stage };
    const slides = content.slides?.length ? content.slides : [{ text: "" }];
    const index = content.index || 0;
    const current = slides[index] || {};
    const next = slides[index + 1];
    // Time since the operator put this song up (the same on every screen).
    const elapsed = Math.max(0, Math.floor((nowMs - content.startedAt) / 1000));

    return (
        <div className={cls}>
            {isImage(song.background_image) && <div className="ns-bg" style={{ backgroundImage: `url(${song.background_image})` }} />}
            <header className="ns-h">
                <div className="ns-title">
                    <b>{song.title || "Música"}</b>
                    {song.artist && <span>{song.artist}</span>}
                </div>
                <div className="ns-chips">
                    {song.song_key && <div className="ns-chip"><small>Tom</small><b>{song.song_key}</b></div>}
                    {song.bpm && <div className="ns-chip"><small>BPM</small><b>{song.bpm}</b></div>}
                    <div className="ns-chip"><small>Na música</small><b>{mmss(elapsed)}</b></div>
                    <div className="ns-chip is-clock"><small>Hora</small><b>{hhmm(now)}</b></div>
                </div>
            </header>
            {song.musician_notes && <div className="ns-notes">{song.musician_notes}</div>}
            <main className="ns-main">
                <div className="ns-cur">{current.text || ""}</div>
                {song.chords && (
                    <aside className="ns-chords" aria-label="Cifra">
                        <div className="ns-chords-h">
                            <span className="net-section">Cifra</span>
                            {!embed && <>
                                <button type="button" onClick={() => setTranspose((t) => t - 1)} aria-label="Baixar meio tom">−</button>
                                <output aria-label="Transposição">{semitoneLabel(transpose)}</output>
                                <button type="button" onClick={() => setTranspose((t) => t + 1)} aria-label="Subir meio tom">+</button>
                            </>}
                        </div>
                        <pre>{transposeChords(song.chords, transpose)}</pre>
                    </aside>
                )}
            </main>
            {next && (
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
