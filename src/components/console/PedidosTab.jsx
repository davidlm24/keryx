import React, { useEffect, useLayoutEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, IconBtn, Empty } from "./kx";
import { useConfirm } from "./ConfirmDialog";
import { stageFromSong, stageFromYouTube, stageFromMedia } from "@/lib/console/stage";
import { mediaIcon } from "@/lib/console/libraryRows";
import { mediaFromYouTube } from "@/lib/mediaImport";
import { youtubeRow, repeatQuestion } from "@/lib/mediaRepeats";
import { setDragStage, clearDragStage, STAGE_MIME } from "@/lib/console/dragStage";
import { setDragGhost, stageGhost } from "./dragGhost";
import { pedidosOf, isPedido, isDone, sentTime, songOfPedido, mediaOfPedido, pedidoMediaTag, pedidoMediaWarn, pedidoBy, pedidoItem, withPedido, pedidoYouTube } from "@/lib/console/pedidos";

// The Pedidos tab of the panel beside the Prévia (Rodada Q, PR2; the
// owner's mockup "Q8 · Aba Pedidos no console", S6 = A, S8 = A; S12 = B
// and S14 = A, "Pedidos x chat"): the song requests of the culto, oldest
// first and the newest at the bottom — the chat is a tab of its own
// (ChatTab.jsx). A pedido is a card "<singer> canta <song>" with its note
// and its actions always on screen: Pôr na prévia and Setlist when the song
// is in the library (its songId, else the title without accents; the
// ServiceItem keeps who sings and the note, S13), else Procurar a letra…;
// Atendido; Excluir…. The louvor may be a video or an audio of the Mídia
// (S15 = A): its glyph and a "vídeo" / "áudio" tag, and Pôr na prévia and
// Setlist take the file as the Biblioteca does. A YouTube link is no cover
// (vistoria 31/10, M1 = A): a link-only pedido wears the youtube glyph and
// has Pôr na prévia, Setlist (the link under the pedido's name, who sings
// kept) and Adicionar à Mídia — nothing enters the Mídia by itself; one with
// a song too adds the link's Pôr na prévia. A card that can go to the
// Setlist drags there too (M2 = ok), as a Biblioteca row, with who sings and
// the note (withPedido). Two lines a card
// (owner 2026-10-28, C1 = A): "X canta Y", its marks and the hour; then who
// noted it and the note, cut with "…" (whole in the tooltip), and the
// actions as glyphs, always on screen. The console notes no pedido of its
// own any more (owner 2026-11-10: "Novo pedido" left the Painel — whoever is
// at the console adds the song to the Setlist and says who sings with the
// row's "Quem canta…"); an old pedido the operator noted still shows as
// "Anotado por você".
// Every text came from a phone or a field and is rendered as plain text.
export default function PedidosTab({ c, data, messages, onPrepare, onAddSong, onAddMedia, onAddStage, onLyricsSearch }) {
    const rows = pedidosOf(messages || []);
    const listRef = usePinnedList(rows.length);
    const tools = useMessageTools(c, data);

    const setDone = async (r, done) => {
        try {
            await keryx.entities.ServiceMessage.update(r.id, { status: done ? "done" : "open" });
            if (done) c.say("Pedido atendido.", { label: "Desfazer", run: () => setDone(r, false) });
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
    };

    return (
        <div className="ped-view">
            {!rows.length
                    ? <Empty icon="user" title="Nenhum pedido">O que a equipe pedir pelo celular, com o código da Equipe, aparece aqui.</Empty>
                    : (
                        <div className="ped-list" ref={listRef} role="log" aria-label="Pedidos de louvor">
                            {rows.map((r) => {
                                const done = isDone(r);
                                const media = mediaOfPedido(r, data.media || []);
                                const song = media ? null : songOfPedido(r, data.songs || []);
                                const tag = pedidoMediaTag(media);
                                const warn = pedidoMediaWarn(media);
                                const by = pedidoBy(r);
                                const what = r.song || "um louvor";
                                const line = r.singer ? `${r.singer} canta ${what}` : what;
                                const sub = [`${by.lead}${by.who}`, r.text && `“${r.text}”`].filter(Boolean).join(" · ");
                                const ready = song || media;
                                const yt = pedidoYouTube(r);
                                const ytStage = yt ? stageFromYouTube(yt.url, yt.title) : null;
                                const stage = withPedido(song ? stageFromSong(song, {}, data.themes) : media ? stageFromMedia(media) : ytStage, r);
                                const drag = !done && stage ? {
                                    draggable: true,
                                    onDragStart: (e) => {
                                        setDragStage(stage);
                                        e.dataTransfer.setData(STAGE_MIME, stage.id || "1");
                                        e.dataTransfer.effectAllowed = "copyMove";
                                        setDragGhost(e, stageGhost(stage));
                                    },
                                    onDragEnd: () => clearDragStage(),
                                } : {};
                                return (
                                    <div key={r.id} className={`ped-card ${done ? "is-done" : ""} ${by.operator ? "is-op" : ""}`} {...drag}>
                                        <Icon name={media ? mediaIcon(media) : !ready && yt ? "youtube" : "music"} className="ped-c-i" />
                                        <span className="ped-c-l1" title={line}>{r.singer ? <><span className="ped-c-who">{r.singer} canta </span><b>{what}</b></> : <b>{what}</b>}</span>
                                        <span className="ped-c-meta">
                                            {tag && <span className="ped-badge is-kind">{tag}</span>}
                                            {by.operator && <span className="ped-badge is-op">operador</span>}
                                            {done
                                                ? <span className="ped-badge is-done"><Icon name="check" size={12} />atendido</span>
                                                : warn ? <span className="ped-badge is-warn">{warn}</span>
                                                    : !ready && yt ? <span className="ped-badge is-kind">YouTube</span>
                                                        : !ready && r.song ? <span className="ped-badge is-warn" title="Não está na biblioteca">fora da biblioteca</span> : null}
                                            <span className="ped-c-time">{sentTime(r)}</span>
                                        </span>
                                        <span className="ped-c-l2" title={sub}>{sub}</span>
                                        <span className="ped-c-acts">
                                            {!done && ready && <>
                                                <IconBtn name="prev" small title={`Pôr ${ready.title} na prévia`} onClick={() => onPrepare(song ? stageFromSong(song, {}, data.themes) : stageFromMedia(media))} />
                                                <IconBtn name="plus" small title={r.singer ? `Adicionar à setlist, com ${r.singer}` : "Adicionar à setlist"} aria-label={`Adicionar ${ready.title} à setlist`} onClick={() => (song ? onAddSong(song, pedidoItem(r)) : onAddMedia(media, pedidoItem(r)))} />
                                            </>}
                                            {!done && yt && ready && <IconBtn name="youtube" small title="Pôr o vídeo do link na prévia" aria-label={`Pôr o vídeo do link de ${what} na prévia`} onClick={() => onPrepare(ytStage)} />}
                                            {!done && !ready && yt && <>
                                                <IconBtn name="prev" small title="Pôr o vídeo na prévia" aria-label={`Pôr ${yt.title} na prévia`} onClick={() => onPrepare(ytStage)} />
                                                {onAddStage && <IconBtn name="plus" small title={r.singer ? `Adicionar à setlist, com ${r.singer}` : "Adicionar à setlist"} aria-label={`Adicionar ${yt.title} à setlist`} onClick={() => onAddStage(stage)} />}
                                                <IconBtn name="media" small title="Adicionar à Mídia" aria-label={`Guardar ${yt.title} na Mídia`} onClick={() => tools.saveLink(r)} />
                                            </>}
                                            {!done && !ready && !yt && r.song && <IconBtn name="search" small title="Procurar a letra na internet…" aria-label={`Procurar a letra de ${r.song} na internet`} onClick={() => onLyricsSearch(r.song)} />}
                                            {!done && <IconBtn name="check" small title="Marcar como atendido" aria-label={`Marcar o pedido de ${what} como atendido`} onClick={() => setDone(r, true)} />}
                                            <TrashBtn r={r} onRemove={tools.remove} />
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
        </div>
    );
}

// The list keeps its newest row in view as rows come in (unless the
// operator scrolled up). -> the list's ref.
export function usePinnedList(count) {
    const listRef = useRef(null);
    const atEnd = useRef(true);
    useLayoutEffect(() => {
        const el = listRef.current;
        if (el && atEnd.current) el.scrollTop = el.scrollHeight;
    }, [count]);
    useEffect(() => {
        const el = listRef.current;
        if (!el) return undefined;
        const on = () => { atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; };
        el.addEventListener("scroll", on, { passive: true });
        return () => el.removeEventListener("scroll", on);
    }, [count > 0]); // eslint-disable-line react-hooks/exhaustive-deps
    return listRef;
}

// Excluir… (asks first) and Adicionar à Mídia, for both tabs.
export function useMessageTools(c, data) {
    const confirm = useConfirm();
    const remove = async (r) => {
        const what = isPedido(r) ? "o pedido" : "a mensagem";
        const whose = r.side === "operator"
            ? (isPedido(r) ? "O pedido que você anotou" : "A sua mensagem")
            : `${isPedido(r) ? "O pedido" : "A mensagem"} de ${r.sender || "alguém da equipe"}`;
        if (!(await confirm({ title: `Excluir ${what}?`, text: `${whose} sai desta lista e dos celulares da equipe.` }))) return;
        try { await keryx.entities.ServiceMessage.delete(r.id); } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
    };
    const saveLink = async (r) => {
        // By the video's id, in any form of the link and once downloaded too
        // (mediaRepeats.js); asks before a second copy.
        const there = youtubeRow(r.link, data.media);
        if (there && !(await confirm(repeatQuestion([there.title], { link: true })))) { c.say(`Esse vídeo já está na Mídia: "${there.title}".`); return; }
        try {
            const row = await mediaFromYouTube(r.link, { title: r.song?.trim() || "Vídeo do YouTube", force: Boolean(there) });
            c.say(`Salvo na Mídia: "${row.title}".`);
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
    };
    return { remove, saveLink };
}

export function TrashBtn({ r, onRemove }) {
    const what = isPedido(r) ? "o pedido" : "a mensagem";
    return <IconBtn name="trash" small title="Excluir…" aria-label={`Excluir ${what}${r.side === "operator" ? "" : ` de ${r.sender || "alguém da equipe"}`}`} onClick={() => onRemove(r)} />;
}

export function YouTubeCard({ r, onPrepare, onSave }) {
    if (!r.link) return null;
    return (
        <span className="ped-link">
            <span className="ped-acts">
                <Btn small onClick={() => onPrepare(stageFromYouTube(r.link))} title="Pôr o vídeo na prévia"><Icon name="prev" />Pôr na prévia</Btn>
                <Btn small onClick={() => onSave(r)} title="Guardar o vídeo na Mídia"><Icon name="media" />Adicionar à Mídia</Btn>
            </span>
        </span>
    );
}
