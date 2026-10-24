import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, IconBtn, Empty } from "./kx";
import { useConfirm } from "./ConfirmDialog";
import { stageFromSong, stageFromYouTube } from "@/lib/console/stage";
import { mediaFromYouTube } from "@/lib/mediaImport";
import { getYouTubeThumbnail } from "@/utils/youtube";
import { pedidosOf, isPedido, isDone, sentTime, songOfPedido, pedidoBy, operatorPedido, songMatches, pedidoItem, PEDIDO_MAX } from "@/lib/console/pedidos";

// The Pedidos tab of the panel beside the Prévia (Rodada Q, PR2; the
// owner's mockup "Q8 · Aba Pedidos no console", S6 = A, S8 = A; S12 = B
// and S14 = A, "Pedidos x chat"): the song requests of the culto, oldest
// first and the newest at the bottom — the chat is a tab of its own
// (ChatTab.jsx). A pedido is a card "<singer> canta <song>" with its note
// and its actions always on screen: Pôr na prévia and Setlist when the song
// is in the library (its songId, else the title without accents; the
// ServiceItem keeps who sings and the note, S13), else Procurar a letra…;
// Atendido; Excluir…. A YouTube link shows its cover with Pôr na prévia and
// Adicionar à Mídia: nothing enters the Mídia by itself. "Novo pedido" on
// top lets the operator note one (the phone's fields; the card says
// "Anotado por você" with an "operador" badge, and the Equipe sees it too).
// Every text came from a phone or a field and is rendered as plain text.
export default function PedidosTab({ c, data, messages, onPrepare, onAddSong, onLyricsSearch, onWrite }) {
    const rows = pedidosOf(messages || []);
    const [noting, setNoting] = useState(false);
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
            {!noting && (
                <div className="ped-band">
                    <Btn kind="brand" onClick={() => setNoting(true)} title="Anotar um pedido de louvor que chegou de outro jeito"><Icon name="plus" />Novo pedido</Btn>
                </div>
            )}
            {noting
                ? <NewPedido songs={data.songs || []} onWrite={onWrite} onDone={(ok) => { setNoting(false); if (ok) c.say("Pedido anotado."); }} />
                : !rows.length
                    ? <Empty icon="user" title="Nenhum pedido">O que a equipe pedir pelo celular, com o código da Equipe, ou você anotar em Novo pedido, aparece aqui.</Empty>
                    : (
                        <div className="ped-list" ref={listRef} role="log" aria-label="Pedidos de louvor">
                            {rows.map((r) => {
                                const done = isDone(r);
                                const song = songOfPedido(r, data.songs || []);
                                const by = pedidoBy(r);
                                return (
                                    <div key={r.id} className={`ped-card ${done ? "is-done" : ""} ${by.operator ? "is-op" : ""}`}>
                                        <span className="ped-h">
                                            <span className="ped-who">{by.lead}<b>{by.who}</b></span> · {sentTime(r)}
                                            {by.operator && <span className="ped-badge is-op">operador</span>}
                                            {done
                                                ? <span className="ped-badge is-done"><Icon name="check" size={12} />atendido</span>
                                                : !song && r.song ? <span className="ped-badge is-warn">não está na biblioteca</span> : null}
                                        </span>
                                        <span className="ped-song">
                                            {r.singer ? <><b>{r.singer}</b> canta </> : null}<b>{r.song || "um louvor"}</b>
                                        </span>
                                        {r.text && <span className="ped-note">“{r.text}”</span>}
                                        <YouTubeCard r={r} onPrepare={onPrepare} onSave={tools.saveLink} />
                                        <span className="ped-acts">
                                            {!done && song && <>
                                                <Btn small onClick={() => onPrepare(stageFromSong(song, {}, data.themes))} title={`Pôr ${song.title} na prévia`}>Pôr na prévia</Btn>
                                                <Btn small onClick={() => onAddSong(song, pedidoItem(r))} title={r.singer ? `Adicionar à setlist, com ${r.singer}` : "Adicionar à setlist"} aria-label={`Adicionar ${song.title} à setlist`}><Icon name="plus" />Setlist</Btn>
                                            </>}
                                            {!done && !song && r.song && <Btn small onClick={() => onLyricsSearch(r.song)} title="Procurar a letra na internet"><Icon name="search" />Procurar a letra…</Btn>}
                                            {!done && <Btn small onClick={() => setDone(r, true)} title="Marcar como atendido"><Icon name="check" />Atendido</Btn>}
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

// Novo pedido (S14 = A): the phone's fields — quem canta, o louvor (typed,
// or one of the library's songs picked under the field), a note. Anotar
// pedido writes a pedido row of the operator's (side "operator").
function NewPedido({ songs, onWrite, onDone }) {
    const [singer, setSinger] = useState("");
    const [song, setSong] = useState("");
    const [songId, setSongId] = useState("");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const first = useRef(null);
    useEffect(() => { first.current?.focus(); }, []);
    const picked = songId ? songs.find((s) => s.id === songId) : null;
    const matches = picked ? [] : songMatches(song, songs, 3).filter((s) => s.title !== song);
    const save = async () => {
        const v = operatorPedido({ singer, song, songId, note }, songs);
        if (v.error) { setError(v.message); return; }
        setBusy(true);
        try { await onWrite(v.fields); onDone(true); } catch (err) { setError(err?.message || "Não foi possível anotar."); setBusy(false); }
    };
    const enter = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } };
    return (
        <form className="ped-form" onSubmit={(e) => { e.preventDefault(); save(); }} aria-label="Novo pedido">
            <label className="ped-f">
                <span>Quem canta</span>
                <input ref={first} className="kx-input" value={singer} onChange={(e) => setSinger(e.target.value)} maxLength={PEDIDO_MAX.singer} onKeyDown={enter} autoComplete="off" spellCheck={false} />
            </label>
            <div className="ped-f">
                <label htmlFor="ped-song">O louvor</label>
                {picked
                    ? (
                        <span className="ped-picked">
                            <Icon name="music" /><b>{picked.title}</b><small>da biblioteca</small>
                            <IconBtn name="x" small title="Escrever outro" onClick={() => { setSongId(""); setSong(""); }} />
                        </span>
                    )
                    : <input id="ped-song" className={`kx-input ${error && !song.trim() ? "is-bad" : ""}`} value={song} onChange={(e) => { setSong(e.target.value); setError(""); }} maxLength={PEDIDO_MAX.song} onKeyDown={enter}
                        placeholder="Escreva ou escolha da biblioteca" autoComplete="off" spellCheck={false} aria-invalid={error && !song.trim() ? "true" : undefined} />}
                {matches.length > 0 && (
                    <span className="ped-matches" role="list" aria-label="Da biblioteca">
                        {matches.map((s) => (
                            <button type="button" role="listitem" key={s.id} className="ped-match kx-t" onClick={() => { setSong(s.title); setSongId(s.id); setError(""); }}>
                                <Icon name="music" /><span><b>{s.title}</b>{s.artist && <small> · {s.artist}</small>}</span>
                            </button>
                        ))}
                    </span>
                )}
            </div>
            <label className="ped-f">
                <span>Observação (opcional)</span>
                <textarea className="kx-input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={PEDIDO_MAX.note} spellCheck />
            </label>
            {error && <p className="ped-err" role="alert">{error}</p>}
            <span className="ped-form-acts">
                <Btn kind="brand" type="submit" disabled={busy}>Anotar pedido</Btn>
                <Btn kind="outline" onClick={() => onDone(false)}>Cancelar</Btn>
            </span>
        </form>
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
        if ((data.media || []).some((m) => m.file_url === r.link)) { c.say("Esse vídeo já está na Mídia."); return; }
        try {
            const row = await mediaFromYouTube(r.link, { title: r.song?.trim() || "Vídeo do YouTube" });
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
            <img className="ped-cover" src={getYouTubeThumbnail(r.link) || undefined} alt="" loading="lazy" />
            <span className="ped-acts">
                <Btn small onClick={() => onPrepare(stageFromYouTube(r.link))} title="Pôr o vídeo na prévia"><Icon name="youtube" />Pôr na prévia</Btn>
                <Btn small onClick={() => onSave(r)} title="Guardar o vídeo na Mídia"><Icon name="media" />Adicionar à Mídia</Btn>
            </span>
        </span>
    );
}
