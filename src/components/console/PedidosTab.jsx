import React, { useEffect, useLayoutEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, IconBtn, Empty } from "./kx";
import { useConfirm } from "./ConfirmDialog";
import { stageFromSong, stageFromYouTube } from "@/lib/console/stage";
import { mediaFromYouTube } from "@/lib/mediaImport";
import { getYouTubeThumbnail } from "@/utils/youtube";
import { messagesInOrder, isPedido, isDone, sentTime, songOfPedido } from "@/lib/console/pedidos";

// The Pedidos tab of the panel beside the Prévia (Rodada Q, PR2; the
// owner's mockup "Q8 · Aba Pedidos no console", S6 = A, S8 = A): the
// Equipe's chat and song requests of the culto, oldest first and the newest
// at the bottom, as a chat. A chat is a line (who · hh:mm, the text); a
// pedido is a card "<singer> canta <song>" with its note and its actions
// always on screen: Pôr na prévia and Setlist when the song is in the
// library (its songId, else the title without accents), else Procurar a
// letra…; Atendido; Excluir…. A YouTube link shows its cover with Pôr na
// prévia and Adicionar à Mídia: nothing enters the Mídia by itself. Every
// text came from a phone and is rendered as plain text only.
export default function PedidosTab({ c, data, messages, onPrepare, onAddSong, onLyricsSearch }) {
    const confirm = useConfirm();
    const rows = messagesInOrder(messages || []);
    const listRef = useRef(null);
    // The newest stays in view as rows come in (unless the operator scrolled up).
    const atEnd = useRef(true);
    useLayoutEffect(() => {
        const el = listRef.current;
        if (el && atEnd.current) el.scrollTop = el.scrollHeight;
    }, [rows.length]);
    useEffect(() => {
        const el = listRef.current;
        if (!el) return undefined;
        const on = () => { atEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; };
        el.addEventListener("scroll", on, { passive: true });
        return () => el.removeEventListener("scroll", on);
    }, [rows.length > 0]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!rows.length) return (
        <Empty icon="user" title="Nenhum pedido">O que a equipe mandar pelo celular, com o código da Equipe, aparece aqui.</Empty>
    );

    const setDone = async (r, done) => {
        try {
            await keryx.entities.ServiceMessage.update(r.id, { status: done ? "done" : "open" });
            if (done) c.say("Pedido atendido.", { label: "Desfazer", run: () => setDone(r, false) });
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
    };
    const remove = async (r) => {
        const what = isPedido(r) ? "o pedido" : "a mensagem";
        if (!(await confirm({ title: `Excluir ${what}?`, text: `${isPedido(r) ? "O pedido" : "A mensagem"} de ${r.sender || "alguém da equipe"} sai desta lista e dos celulares da equipe.` }))) return;
        try { await keryx.entities.ServiceMessage.delete(r.id); } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
    };
    const saveLink = async (r) => {
        if ((data.media || []).some((m) => m.file_url === r.link)) { c.say("Esse vídeo já está na Mídia."); return; }
        try {
            const row = await mediaFromYouTube(r.link, { title: r.song?.trim() || "Vídeo do YouTube" });
            c.say(`Salvo na Mídia: "${row.title}".`);
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
    };

    const head = (r, badge = null) => (
        <span className="ped-h"><span className="ped-who">{isPedido(r) ? "Pedido de " : ""}<b>{r.sender || "Equipe"}</b></span> · {sentTime(r)}{badge}</span>
    );
    const trash = (r) => <IconBtn name="trash" small title="Excluir…" aria-label={`Excluir ${isPedido(r) ? "o pedido" : "a mensagem"} de ${r.sender || "alguém da equipe"}`} onClick={() => remove(r)} />;
    const link = (r) => r.link && (
        <span className="ped-link">
            <img className="ped-cover" src={getYouTubeThumbnail(r.link) || undefined} alt="" loading="lazy" />
            <span className="ped-acts">
                <Btn small onClick={() => onPrepare(stageFromYouTube(r.link))} title="Pôr o vídeo na prévia"><Icon name="youtube" />Pôr na prévia</Btn>
                <Btn small onClick={() => saveLink(r)} title="Guardar o vídeo na Mídia"><Icon name="media" />Adicionar à Mídia</Btn>
            </span>
        </span>
    );

    return (
        <div className="ped-list" ref={listRef} role="log" aria-label="Pedidos e mensagens da equipe">
            {rows.map((r) => {
                if (!isPedido(r)) return (
                    <div key={r.id} className={`ped-chat ${r.link ? "has-link" : ""}`}>
                        <span className="ped-row">{head(r)}{r.link && trash(r)}</span>
                        {r.text && <span className="ped-t">{r.text}</span>}
                        {link(r)}
                    </div>
                );
                const done = isDone(r);
                const song = songOfPedido(r, data.songs || []);
                const badge = done
                    ? <span className="ped-badge is-done"><Icon name="check" size={12} />atendido</span>
                    : !song && r.song ? <span className="ped-badge is-warn">não está na biblioteca</span> : null;
                return (
                    <div key={r.id} className={`ped-card ${done ? "is-done" : ""}`}>
                        {head(r, badge)}
                        <span className="ped-song">
                            {r.singer ? <><b>{r.singer}</b> canta </> : null}<b>{r.song || "um louvor"}</b>
                        </span>
                        {r.text && <span className="ped-note">“{r.text}”</span>}
                        {link(r)}
                        <span className="ped-acts">
                            {!done && song && <>
                                <Btn small onClick={() => onPrepare(stageFromSong(song, {}, data.themes))} title={`Pôr ${song.title} na prévia`}>Pôr na prévia</Btn>
                                <Btn small onClick={() => onAddSong(song)} title="Adicionar à setlist" aria-label={`Adicionar ${song.title} à setlist`}><Icon name="plus" />Setlist</Btn>
                            </>}
                            {!done && !song && r.song && <Btn small onClick={() => onLyricsSearch(r.song)} title="Procurar a letra na internet"><Icon name="search" />Procurar a letra…</Btn>}
                            {!done && <Btn small onClick={() => setDone(r, true)} title="Marcar como atendido"><Icon name="check" />Atendido</Btn>}
                            {trash(r)}
                        </span>
                    </div>
                );
            })}
        </div>
    );
}
