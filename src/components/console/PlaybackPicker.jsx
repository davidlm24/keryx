import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Row, Seg } from "./kx";
import { usePlaced } from "./Menu";
import { pickRows, pedidoMediaKind } from "@/lib/console/pedidos";

// The song's video or playback, chosen from the Mídia (owner 2026-11-10,
// "Vídeo ou playback…" only opened the PC's files): Vídeos · Áudios with a
// search, the Mídia's rows (pickRows of the pedidos: no images, PDFs,
// backgrounds or fonts), and "Do computador…" at the end, which brings the
// file into the Mídia first (SongEditor). A YouTube link is listed but
// cannot be chosen: it does not play hidden under the lyrics.
const TABS = [["video", "Vídeos"], ["audio", "Áudios"]];

export default function PlaybackPicker({ anchorRef, media = [], current = "", onPick, onComputer, onClose }) {
    const now = media.find((m) => m.file_url === current);
    const [tab, setTab] = useState(now?.type === "audio" ? "audio" : "video");
    const [find, setFind] = useState("");
    const pop = useRef(null);
    usePlaced(pop, anchorRef, { open: true });
    // A press outside closes it (the button that opened it toggles it).
    useEffect(() => {
        const out = (e) => {
            if (!(e.target instanceof Node) || pop.current?.contains(e.target) || anchorRef.current?.contains(e.target)) return;
            onClose();
        };
        document.addEventListener("pointerdown", out, true);
        return () => document.removeEventListener("pointerdown", out, true);
    }, [onClose, anchorRef]);
    const rows = pickRows(tab, find, { media }, 60);
    const byId = new Map(media.map((m) => [m.id, m]));
    const none = tab === "video" ? "Nenhum vídeo" : "Nenhum áudio";
    return (
        <div className="kx-pop pl-pop is-placed ed-mpick" ref={pop} role="dialog" aria-label="Vídeo ou playback da Mídia"
            onKeyDown={(e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); anchorRef.current?.querySelector("button")?.focus(); } }}>
            <div className="ed-mpick-h">
                <Seg small value={tab} onChange={setTab} label="Da Mídia" options={TABS} />
                <input className="kx-input" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Buscar na Mídia…" aria-label="Buscar na Mídia" maxLength={60} autoComplete="off" spellCheck={false} autoFocus />
            </div>
            <div className="ed-mpick-list" role="group" aria-label={tab === "video" ? "Vídeos da Mídia" : "Áudios da Mídia"}>
                {rows.length ? rows.map((r) => {
                    const m = byId.get(r.id);
                    const yt = pedidoMediaKind(m) === "youtube";
                    return (
                        <Row key={r.id} single icon={r.icon} title={r.title || "Sem título"} time={r.sub || undefined}
                            meta={yt ? "YouTube: não toca escondido · baixe para a Mídia" : undefined}
                            className={yt ? "is-dim" : ""} current={!yt && m?.file_url === current ? "true" : undefined}
                            onClick={() => { if (!yt && m) onPick(m); }}>
                            {!yt && m?.file_url === current && <span className="ed-mpick-on"><Icon name="check" size={14} /></span>}
                        </Row>
                    );
                }) : <p className="ed-mpick-none">{none}{find.trim() ? ` com "${find.trim()}"` : " na Mídia"}.</p>}
            </div>
            <div className="ed-mpick-f">
                <Row single icon="folder" title="Do computador…" meta="entra na Mídia" onClick={onComputer} />
            </div>
        </div>
    );
}
