import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, IconBtn, Empty, Seg } from "./kx";
import { useConfirm } from "./ConfirmDialog";
import { stageFromSong, stageFromYouTube, stageFromMedia } from "@/lib/console/stage";
import { mediaIcon } from "@/lib/console/libraryRows";
import { mediaFromYouTube } from "@/lib/mediaImport";
import { getYouTubeThumbnail } from "@/utils/youtube";
import { pedidosOf, isPedido, isDone, sentTime, songOfPedido, mediaOfPedido, pedidoMediaTag, pedidoMediaWarn, pedidoBy, operatorPedido, pickRows, PICK_TABS, pedidoItem, PEDIDO_MAX } from "@/lib/console/pedidos";

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
// Setlist take the file as the Biblioteca does. A YouTube link shows its cover with Pôr na prévia and
// Adicionar à Mídia: nothing enters the Mídia by itself. "Novo pedido" on
// top lets the operator note one (the phone's fields; the card says
// "Anotado por você" with an "operador" badge, and the Equipe sees it too).
// Every text came from a phone or a field and is rendered as plain text.
export default function PedidosTab({ c, data, messages, onPrepare, onAddSong, onAddMedia, onLyricsSearch, onWrite }) {
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
                ? <NewPedido songs={data.songs || []} media={data.media || []} onWrite={onWrite} onDone={(ok) => { setNoting(false); if (ok) c.say("Pedido anotado."); }} />
                : !rows.length
                    ? <Empty icon="user" title="Nenhum pedido">O que a equipe pedir pelo celular, com o código da Equipe, ou você anotar em Novo pedido, aparece aqui.</Empty>
                    : (
                        <div className="ped-list" ref={listRef} role="log" aria-label="Pedidos de louvor">
                            {rows.map((r) => {
                                const done = isDone(r);
                                const media = mediaOfPedido(r, data.media || []);
                                const song = media ? null : songOfPedido(r, data.songs || []);
                                const tag = pedidoMediaTag(media);
                                const warn = pedidoMediaWarn(media);
                                const by = pedidoBy(r);
                                return (
                                    <div key={r.id} className={`ped-card ${done ? "is-done" : ""} ${by.operator ? "is-op" : ""}`}>
                                        <span className="ped-h">
                                            <span className="ped-who">{by.lead}<b>{by.who}</b></span> · {sentTime(r)}
                                            {tag && <span className="ped-badge is-kind">{tag}</span>}
                                            {by.operator && <span className="ped-badge is-op">operador</span>}
                                            {done
                                                ? <span className="ped-badge is-done"><Icon name="check" size={12} />atendido</span>
                                                : warn ? <span className="ped-badge is-warn">{warn}</span>
                                                    : !song && !media && r.song ? <span className="ped-badge is-warn">não está na biblioteca</span> : null}
                                        </span>
                                        <span className="ped-song">
                                            <Icon name={media ? mediaIcon(media) : "music"} />
                                            <span>{r.singer ? <><b>{r.singer}</b> canta </> : null}<b>{r.song || "um louvor"}</b></span>
                                        </span>
                                        {r.text && <span className="ped-note">“{r.text}”</span>}
                                        <YouTubeCard r={r} onPrepare={onPrepare} onSave={tools.saveLink} />
                                        <span className="ped-acts">
                                            {!done && song && <>
                                                <Btn small onClick={() => onPrepare(stageFromSong(song, {}, data.themes))} title={`Pôr ${song.title} na prévia`}>Pôr na prévia</Btn>
                                                <Btn small onClick={() => onAddSong(song, pedidoItem(r))} title={r.singer ? `Adicionar à setlist, com ${r.singer}` : "Adicionar à setlist"} aria-label={`Adicionar ${song.title} à setlist`}><Icon name="plus" />Setlist</Btn>
                                            </>}
                                            {!done && media && <>
                                                <Btn small onClick={() => onPrepare(stageFromMedia(media))} title={`Pôr ${media.title} na prévia`}>Pôr na prévia</Btn>
                                                <Btn small onClick={() => onAddMedia(media, pedidoItem(r))} title={r.singer ? `Adicionar à setlist, com ${r.singer}` : "Adicionar à setlist"} aria-label={`Adicionar ${media.title} à setlist`}><Icon name="plus" />Setlist</Btn>
                                            </>}
                                            {!done && !song && !media && r.song && <Btn small onClick={() => onLyricsSearch(r.song)} title="Procurar a letra na internet"><Icon name="search" />Procurar a letra…</Btn>}
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
// or picked from the library), a note. Anotar pedido writes a pedido row of
// the operator's (side "operator"). O louvor is one field with a picker
// under it while it has the focus (S15 = A): Letras · Vídeos · Áudios and
// Buscar (empty, what O louvor says); images, PDFs, fonts and backgrounds
// never show. Typing by hand still works: free text, no id.
function NewPedido({ songs, media, onWrite, onDone }) {
    const [singer, setSinger] = useState("");
    const [song, setSong] = useState("");
    const [pick, setPick] = useState(null); // { kind: song | media, id, icon }
    const [open, setOpen] = useState(false);
    const [tab, setTab] = useState("songs");
    const [find, setFind] = useState("");
    const [note, setNote] = useState("");
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const first = useRef(null);
    const songRef = useRef(null);
    const fieldRef = useRef(null);
    useEffect(() => { first.current?.focus(); }, []);
    // The picker closes on a click or the focus anywhere outside the field and
    // its list (not on blur: the console gives a clicked button's focus back),
    // or on Esc.
    useEffect(() => {
        if (!open) return undefined;
        const out = (e) => { if (e.target instanceof Node && !fieldRef.current?.contains(e.target)) setOpen(false); };
        document.addEventListener("pointerdown", out, true);
        document.addEventListener("focusin", out, true);
        return () => { document.removeEventListener("pointerdown", out, true); document.removeEventListener("focusin", out, true); };
    }, [open]);
    const rows = open && !pick ? pickRows(tab, find.trim() || song, { songs, media }) : [];
    const choose = (r) => {
        setSong(r.title.slice(0, PEDIDO_MAX.song));
        setPick({ kind: r.kind, id: r.id, icon: r.icon });
        setOpen(false);
        setFind("");
        setError("");
    };
    const save = async () => {
        const v = operatorPedido({ singer, song, note, songId: pick?.kind === "song" ? pick.id : "", mediaId: pick?.kind === "media" ? pick.id : "" }, songs, undefined, media);
        if (v.error) { setError(v.message); return; }
        setBusy(true);
        try { await onWrite(v.fields); onDone(true); } catch (err) { setError(err?.message || "Não foi possível anotar."); setBusy(false); }
    };
    const enter = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); save(); } };
    const esc = (e) => { if (e.key === "Escape" && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); songRef.current?.focus(); } };
    const fromLib = pick && (pick.kind === "song" ? "da biblioteca" : pick.icon === "volume" ? "áudio da Mídia" : "vídeo da Mídia");
    return (
        <form className="ped-form" onSubmit={(e) => { e.preventDefault(); save(); }} aria-label="Novo pedido">
            <label className="ped-f">
                <span>Quem canta</span>
                <input ref={first} className="kx-input" value={singer} onChange={(e) => setSinger(e.target.value)} maxLength={PEDIDO_MAX.singer} onKeyDown={enter} autoComplete="off" spellCheck={false} />
            </label>
            <div className="ped-f" ref={fieldRef} onKeyDown={esc}>
                <label htmlFor="ped-song">O louvor</label>
                {pick
                    ? (
                        <span className="ped-picked">
                            <Icon name={pick.icon} /><b>{song}</b><small>{fromLib}</small>
                            <IconBtn name="x" small title="Escrever outro" onClick={() => { setPick(null); setSong(""); setOpen(true); setTimeout(() => songRef.current?.focus(), 0); }} />
                        </span>
                    )
                    : <input id="ped-song" ref={songRef} className={`kx-input ${error && !song.trim() ? "is-bad" : ""}`} value={song} onChange={(e) => { setSong(e.target.value); setError(""); setOpen(true); }} onFocus={() => setOpen(true)} maxLength={PEDIDO_MAX.song} onKeyDown={enter}
                        placeholder="Escreva ou escolha da biblioteca" autoComplete="off" spellCheck={false} aria-invalid={error && !song.trim() ? "true" : undefined} aria-expanded={open} aria-controls="ped-pick" />}
                {open && !pick && (
                    <div className="ped-pick" id="ped-pick">
                        <Seg small value={tab} onChange={setTab} label="Da biblioteca" options={PICK_TABS.map((t) => [t.id, t.label])} />
                        <input className="kx-input ped-find" type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder="Buscar…" aria-label="Buscar na biblioteca" maxLength={40} autoComplete="off" spellCheck={false} />
                        {rows.length
                            ? (
                                <span className="ped-matches" role="list" aria-label={PICK_TABS.find((t) => t.id === tab)?.label}>
                                    {rows.map((r) => (
                                        <button type="button" role="listitem" key={r.id} className="ped-match kx-t" onClick={() => choose(r)}>
                                            <Icon name={r.icon} /><span><b>{r.title}</b>{r.sub && <small> · {r.sub}</small>}</span>
                                        </button>
                                    ))}
                                </span>
                            )
                            : <p className="ped-none">{tab === "songs" ? "Nenhuma música" : tab === "video" ? "Nenhum vídeo" : "Nenhum áudio"}{(find.trim() || song.trim()) ? ` com "${(find.trim() || song.trim())}"` : " na biblioteca"}.</p>}
                    </div>
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
