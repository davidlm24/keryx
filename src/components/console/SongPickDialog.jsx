import React, { useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn, Field, Row } from "./kx";
import { useDialogFocus } from "./useDialogFocus";
import { useConfirm } from "./ConfirmDialog";
import { songPick, songMediaNote } from "@/lib/console/songPick";

// "Marcar os tempos com uma letra…" (owner 2026-11-10): a video or an audio
// of the Mídia → the song whose lyric times are marked with it. The songs
// already using the file first, then every song with a search; choosing one
// makes the file that song's video or playback (asking first when it had
// another) and opens the Editor de música with Marcar os tempos on top.
// useMarkTimes gives the menus their `open(mediaRow)` and the dialog to draw.
export function useMarkTimes({ songs = [], openSong, say }) {
    const [media, setMedia] = useState(null);
    const ask = useConfirm();
    const pick = async (song) => {
        const m = media;
        setMedia(null);
        if (!m || !song) return;
        try {
            if (song.audio_url !== m.file_url) {
                if (song.audio_url && !(await ask({ title: `Trocar o vídeo ou playback de "${song.title || "Música"}"?`, text: `Ela passa a usar "${m.title || "este arquivo"}". As marcas ficam, para você conferir.`, ok: "Trocar" }))) return;
                await keryx.entities.Song.update(song.id, { audio_url: m.file_url });
            }
            openSong(song.id);
        } catch (err) { say?.(err?.message || "Não foi possível."); }
    };
    const dialog = media ? <SongPickDialog media={media} songs={songs} onPick={pick} onClose={() => setMedia(null)} /> : null;
    return { open: setMedia, dialog };
}

export default function SongPickDialog({ media, songs, onPick, onClose }) {
    const [q, setQ] = useState("");
    const boxRef = useRef(null);
    const inputRef = useRef(null);
    useDialogFocus(boxRef, true);
    const { using, others } = songPick(media, songs, q);
    const first = using[0] || others[0] || null;
    const row = (s) => <Row key={s.id} single icon="music" title={s.title || "Sem título"} meta={songMediaNote(s, media) || s.artist || undefined} onClick={() => onPick(s)} />;
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={onClose} />
            <div ref={boxRef} className="dialog confirm-dialog songpick" role="dialog" aria-modal="true" aria-label="Marcar os tempos com uma letra"
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>Marcar os tempos com uma letra</div>
                <span className="kx-meta">{media.title || "Este arquivo"} · escolha a música; ela abre em Marcar os tempos, tocando este arquivo.</span>
                <Field icon="search" inputRef={inputRef} value={q} onChange={setQ} placeholder="Buscar música…" inputProps={{ autoFocus: true, "aria-label": "Buscar música" }}
                    onKeyDown={(e) => { if (e.key === "Enter" && first) { e.preventDefault(); onPick(first); } }} />
                <div className="songpick-list">
                    {using.length > 0 && <div className="listhead"><span className="kx-section">Usam este arquivo</span></div>}
                    {using.map(row)}
                    {others.length > 0 && <div className="listhead"><span className="kx-section">{using.length ? "Todas as músicas" : "Músicas"}</span></div>}
                    {others.map(row)}
                    {!using.length && !others.length && <p className="kx-meta songpick-none">{q.trim() ? `Nenhuma música com "${q.trim()}".` : "Nenhuma música nas Letras ainda."}</p>}
                </div>
                <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                    <Btn onClick={onClose}>Cancelar</Btn>
                </div>
            </div>
        </>
    );
}
