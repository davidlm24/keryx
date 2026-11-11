import React, { useEffect, useMemo, useRef, useState } from "react";
import { Btn, Seg } from "./kx";
import { useDialogFocus } from "./useDialogFocus";
import { useThemes, useLibrary } from "./useConsoleData";
import { useStamp } from "./useConsole";
import { songContent } from "@/lib/console/content";
import { applyWithFundo } from "@/lib/console/backgroundSpec";
import { emptyState } from "@shared/live-state.mjs";
import { exportBlock, videoLength, jobLine } from "@/lib/console/lyricVideo";
import { themeName } from "@/lib/console/themes";

// "Exportar vídeo com a letra…" (owner 2026-11-11, mockup approved): the
// song's slides with the theme chosen (the one in use by default), timed by
// its marks, with its playback's sound, into an MP4 saved where the church
// says (electron/lyricVideo.cjs does it). useExportVideo gives the menus
// their `open(song)` and the dialog to draw; `block(song)` says why the
// command is off (exportBlock).
const bridgeOf = () => (typeof window !== "undefined" ? window.keryxDesktop?.lyricVideo : null);

export function useExportVideo({ themeInUse = null, say } = {}) {
    const [song, setSong] = useState(null);
    const [ffmpeg, setFfmpeg] = useState(null);
    const { media } = useLibrary();
    const bridge = useRef(bridgeOf()).current;
    useEffect(() => {
        if (!bridge) return;
        bridge.call("status").then((r) => setFfmpeg(r?.data ? Boolean(r.data.ffmpeg) : null)).catch(() => {});
    }, [bridge]);
    const block = (s) => exportBlock(s, { desktop: Boolean(bridge), ffmpeg, media });
    const open = (s) => {
        const why = block(s);
        if (why) { say?.(why); return; }
        setSong(s);
    };
    const dialog = song ? <ExportVideoDialog song={song} themeInUse={themeInUse} media={media} say={say} onClose={() => setSong(null)} /> : null;
    return { open, dialog, block };
}

export default function ExportVideoDialog({ song, themeInUse, media, say, onClose }) {
    const themes = useThemes() || [];
    const [themeId, setThemeId] = useState(themeInUse || "");
    const [fade, setFade] = useState("soft");
    const [job, setJob] = useState(null);
    const { stamp } = useStamp(themeId || null);
    const boxRef = useRef(null);
    useDialogFocus(boxRef, true);
    const bridge = useRef(bridgeOf()).current;
    // Its progress (keryx:lyricVideo), this dialog's job only.
    useEffect(() => {
        if (!bridge || !job?.id) return undefined;
        return bridge.onJob((j) => { if (j.id === job.id) setJob(j); });
    }, [bridge, job?.id]);
    const busy = job && (job.phase === "frames" || job.phase === "encode");
    const total = videoLength(song, media);
    const slides = useMemo(() => (song.slides || []).length, [song]);
    const marked = (song.slides || []).filter((s) => Number.isFinite(s?.start)).length;
    const save = async () => {
        const t = Date.now();
        const args = { ...songContent(song, {}, themes), kind: "lyrics" };
        const doc = applyWithFundo(emptyState(t), "content.show", stamp("content.show", args), t);
        try {
            const r = await bridge.call("start", { title: song.title, doc, total, fade: fade === "soft" ? 0.4 : 0, audioUrl: song.audio_url });
            if (r?.error) { say?.(r.error.message); return; }
            if (r?.data?.canceled) return;
            setJob({ id: r.data.id, phase: "frames", pct: 0 });
        } catch (err) { say?.(err?.message || "Não foi possível fazer o vídeo."); }
    };
    const cancel = () => (busy ? bridge.call("cancel", { id: job.id }) : onClose());
    const done = job?.phase === "done";
    useEffect(() => { if (done) say?.(`Vídeo com a letra salvo: ${job.out}`); }, [done]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => { if (!busy) onClose(); }} />
            <div ref={boxRef} className="dialog confirm-dialog vidx" role="dialog" aria-modal="true" aria-label="Exportar vídeo com a letra"
                onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); if (!busy) onClose(); } }}>
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>Exportar vídeo com a letra</div>
                <span className="kx-meta">{song.title || "Música"} · {marked}/{slides} slides marcados · 1080p com o som do playback</span>
                <label className="vidx-row">
                    <span>Tema</span>
                    <select className="pl-pick" value={themeId} disabled={busy} onChange={(e) => setThemeId(e.target.value)} aria-label="Tema do vídeo">
                        <option value="">O padrão</option>
                        {themes.map((t) => <option key={t.id} value={t.id}>{themeName(t) || "Tema sem nome"}{t.id === themeInUse ? " (em uso)" : ""}</option>)}
                    </select>
                </label>
                <div className="vidx-row">
                    <span>Transição</span>
                    <Seg small label="Transição entre slides" value={fade} onChange={setFade} options={[["soft", "Suave"], ["cut", "Corte"]]} />
                </div>
                <p className="vidx-warn">O vídeo já tem a letra: use-o como vídeo, não como o vídeo desta música.</p>
                {job && (
                    <div className="vidx-job" role="status">
                        <div className="vidx-bar"><i style={{ width: `${done ? 100 : job.pct || 0}%` }} /></div>
                        <span className={`kx-meta ${job.phase === "failed" ? "kx-warn" : ""}`}>{jobLine(job)}</span>
                    </div>
                )}
                <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                    {!done && <Btn kind="brand" disabled={busy || !bridge} onClick={save}>Salvar…</Btn>}
                    <Btn onClick={done ? onClose : cancel}>{done ? "Fechar" : "Cancelar"}</Btn>
                </div>
            </div>
        </>
    );
}
