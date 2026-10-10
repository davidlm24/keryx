import React, { useState, useEffect } from "react";
import { transposeChords, semitoneLabel } from "@/utils/chordTranspose";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { keryx } from "@/api/keryxClient";
import "@/components/network/net.css";

const two = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${two(d.getHours())}:${two(d.getMinutes())}`;
const mmss = (s) => `${two(Math.floor(s / 60))}:${two(s % 60)}`;
const isImage = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:"));

// The stage monitor: current and next slide, key, BPM, chords and musician
// notes from the live state (shared/live-state.mjs), on the operator's PC or
// a screen on the network alike. It keeps showing while the main projector
// is black: the band still needs the lyrics. Sized in container units
// (net.css), so it reads the same on a 24" monitor and a 65" TV; upright, the
// chords go under the slide.
export default function StageView() {
    const content = useLiveState((s) => s?.content);
    const nowMs = useLiveNow(1000);
    const now = new Date(nowMs);
    const [transpose, setTranspose] = useState(0);

    // A new song starts untransposed.
    const songKey = content?.startedAt ?? null;
    useEffect(() => { setTranspose(0); }, [songKey]);

    useEffect(() => {
        if (keryx.isDesktop) return undefined; // the main process places desktop outputs
        const tryFullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };
        document.addEventListener("click", tryFullscreen, { once: true });
        return () => document.removeEventListener("click", tryFullscreen);
    }, []);

    if (!content) {
        return (
            <div className="net net-stage">
                <div className="ns-idle">
                    <span className="net-section">Palco</span>
                    <div className="ns-clock">{hhmm(now)}</div>
                    <p>Aguardando projeção</p>
                </div>
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
        <div className="net net-stage">
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
                            <button type="button" onClick={() => setTranspose((t) => t - 1)} aria-label="Baixar meio tom">−</button>
                            <output aria-label="Transposição">{semitoneLabel(transpose)}</output>
                            <button type="button" onClick={() => setTranspose((t) => t + 1)} aria-label="Subir meio tom">+</button>
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
            <AlertOverlayRenderer />
        </div>
    );
}
