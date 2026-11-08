import React, { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { remoteCall } from "@/lib/console/remoteClient";
import { moveToIndex } from "@/lib/console/dropOrder";
import { addToSetlistArgs, allowed, canRun, chipOf, dragShift, dragTarget, emptyList, joinPage, libraryArgs, mediaRow, SEARCH_DEBOUNCE_MS, setlistRows, TAG_TEXT } from "@/lib/network/remoteView";
import { Cmd, SendBar, Sheet, Toggle } from "./parts";

// The Setlist (owner's pick "escolher"): a tap picks an item, then the sticky
// "Enviar ao ar · título" sends it — never a send by a stray tap. Sections
// are headers; the item on air, the next and the last sent are marked; a
// file missing, still downloading or a presentation still being prepared
// cannot be picked. The list opens on the item on air. On top, the culto's
// "Avançar sozinho" (the Setlist automática, Rodada N2), as on the console.
// The owner's vistoria of 2026-11-07 (S1, S2): each row drags by its grip,
// as the console's Setlist (setlist.move; ↑/↓ on a focused grip move it one
// place), and the + of the header adds a song, a video or an audio, or
// opens the Bíblia for a passage (setlist.add; a console with the `plan` cap).
const GAP = 3; // .rm-list's gap
const EDGE = 56; // the drag scrolls the list this close to its edges
export default function SetlistTab({ live, state, caps, c, onRefresh, onBible, active = true }) {
    const [pick, setPick] = useState(null);
    const [adding, setAdding] = useState(false);
    // The order the phone dropped, until the console's next state answers.
    const [order, setOrder] = useState(null);
    const [drag, setDrag] = useState(null);
    const list = useRef(null);
    const scroller = useRef(null);
    const base = setlistRows(state, live);
    const rows = order && order.length === base.length ? order.map((id) => base.find((r) => r.id === id)).filter(Boolean) : base;
    const picked = rows.find((r) => r.id === pick && !r.section) || null;
    const airId = state?.airItemId || null;
    useEffect(() => { setOrder(null); }, [state?.rev]);
    useEffect(() => {
        if (!airId) return;
        scroller.current?.querySelector(`[data-id="${CSS.escape(airId)}"]`)?.scrollIntoView({ block: "center" });
    }, [airId]);
    // What was picked and then left the Setlist is no longer picked.
    useEffect(() => { if (pick && !rows.some((r) => r.id === pick)) setPick(null); }, [pick, rows]);

    const canMove = canRun(caps, "setlist.move");
    const move = useCallback((from, to) => {
        const it = rows[from];
        if (!it || to === from) return;
        const next = moveToIndex(rows, from, to);
        setOrder(next.map((r) => r.id));
        c.run("move", "setlist.move", { itemId: it.id, to }).then((r) => { if (r?.ok) onRefresh?.(); else setOrder(null); });
    }, [rows, c, onRefresh]);

    // The drag: in the list's own coordinates, so a scroll under the finger
    // keeps the row there.
    const grab = (e, i) => {
        if (!canMove || e.button > 0) return;
        e.preventDefault();
        const box = scroller.current;
        const items = [...(list.current?.children || [])];
        const top = box.getBoundingClientRect().top - box.scrollTop;
        const mids = items.map((el) => { const r = el.getBoundingClientRect(); return r.top - top + r.height / 2; });
        const pitch = (items[i]?.getBoundingClientRect().height || 52) + GAP;
        e.currentTarget.setPointerCapture?.(e.pointerId);
        setDrag({ from: i, to: i, y0: e.clientY, s0: box.scrollTop, dy: 0, mids, pitch });
    };
    const follow = (e) => {
        if (!drag) return;
        const box = scroller.current;
        const r = box.getBoundingClientRect();
        if (e.clientY < r.top + EDGE) box.scrollTop -= 10;
        else if (e.clientY > r.bottom - EDGE) box.scrollTop += 10;
        const dy = e.clientY - drag.y0 + (box.scrollTop - drag.s0);
        setDrag((d) => (d ? { ...d, dy, to: dragTarget(d.mids, d.from, d.mids[d.from] + dy) } : d));
    };
    const drop = () => {
        if (!drag) return;
        const { from, to } = drag;
        setDrag(null);
        move(from, to);
    };
    const keyMove = (e, i) => {
        const dir = { ArrowUp: -1, ArrowDown: 1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        const to = i + dir;
        if (to >= 0 && to < rows.length) move(i, to);
    };

    const service = typeof state?.service === "string" ? state.service : state?.service?.title || "";
    if (!state) return <div className="rm-main"><p className="rm-empty">Lendo a setlist…</p></div>;
    const canPick = allowed("sendItem", { itemId: "x" }, c.flags);
    const canAdd = canRun(caps, "setlist.add");
    const count = rows.filter((r) => !r.section).length;
    const style = (j) => {
        if (!drag) return undefined;
        if (j === drag.from) return { transform: `translateY(${drag.dy}px)` };
        const s = dragShift(j, drag.from, drag.to, drag.pitch);
        return s ? { transform: `translateY(${s}px)` } : undefined;
    };
    const grip = (r, i) => canMove && (
        <button type="button" className="rm-grip" aria-label={`Mudar a ordem: ${r.title}. Arraste, ou use as setas`}
            onPointerDown={(e) => grab(e, i)} onPointerMove={follow} onPointerUp={drop} onPointerCancel={() => setDrag(null)} onKeyDown={(e) => keyMove(e, i)}>
            <Icon name="grip" size={18} />
        </button>
    );
    return (
        <div className="rm-main is-split">
            <div className={`rm-scroll ${drag ? "is-dragging" : ""}`} ref={scroller}>
                <div className="rm-slh">
                    <b>{service || "Setlist"}</b>
                    <small>{count === 1 ? "1 item" : `${count} itens`}</small>
                    {canAdd && <button type="button" className="rm-b rm-plus" onClick={() => setAdding(true)} aria-label="Adicionar à setlist" aria-haspopup="dialog"><Icon name="plus" size={20} /></button>}
                </div>
                <Toggle title="Avançar sozinho" sub="Quando o item no ar termina, o próximo vai ao ar." on={Boolean(state.autoplay)} busy={c.busy.has("autoplay")}
                    onChange={() => c.run("autoplay", "setlist.autoplay", { on: !state.autoplay }).then((r) => { if (r?.ok) onRefresh?.(); })} />
                {!rows.length && <p className="rm-empty">{service ? `${service}: nenhum item na setlist.` : "Nenhum culto escolhido no console."}</p>}
                <ul className="rm-list" role="list" ref={list}>
                    {rows.map((r, i) => (r.section
                        ? (
                            <li key={r.id} className={`rm-srow is-sec ${drag?.from === i ? "is-lifted" : ""}`} style={style(i)} data-id={r.id}>
                                <span className="rm-sec">{r.title}</span>
                                {grip(r, i)}
                            </li>
                        )
                        : (
                            <li key={r.id} className={`rm-srow ${r.id === pick ? "is-sel" : ""} ${r.tag === "air" ? "is-air" : ""} ${drag?.from === i ? "is-lifted" : ""}`} style={style(i)} data-id={r.id}>
                                <button
                                    type="button"
                                    className="rm-item"
                                    aria-pressed={r.id === pick}
                                    disabled={!canPick || Boolean(r.st)}
                                    onClick={() => setPick(r.id === pick ? null : r.id)}
                                >
                                    <Icon name={r.icon} size={18} />
                                    <span className="rm-item-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                                    {r.st ? <span className="rm-tag is-warn">{r.stText}</span> : r.tag && <span className={`rm-tag is-${r.tag}`}>{TAG_TEXT[r.tag]}</span>}
                                </button>
                                {grip(r, i)}
                            </li>
                        )))}
                </ul>
                {state.truncated && <p className="rm-hint">A setlist continua no computador.</p>}
            </div>
            {/* The send bar is the dock's first row (N3 = A). */}
            {picked && (
                <SendBar active={active}>
                    <div className="rm-sendrow">
                        <Cmd c={c} k="sendItem" action="sendItem" args={{ itemId: picked.id }} className="is-go" then={() => setPick(null)}>Enviar ao ar · {picked.title}</Cmd>
                        <button type="button" className="rm-b rm-unpick" onClick={() => setPick(null)} aria-label="Desfazer a escolha"><Icon name="x" size={18} /></button>
                    </div>
                </SendBar>
            )}
            {adding && <AddSheet c={c} onClose={() => setAdding(false)} onAdded={() => onRefresh?.()} onBible={() => { setAdding(false); onBible?.(); }} />}
        </div>
    );
}

// Adicionar à setlist (S2 = A): Buscar, Músicas · Vídeos · Áudios, a + on
// each row (it stays "adicionado" once in), and Passagem da Bíblia…, which
// opens the Bíblia (its + Setlist adds the verses marked). The list is the
// console's library a page at a time, as the Biblioteca's.
const ADD_CHIPS = ["songs", "video", "audio"];
function AddSheet({ c, onClose, onAdded, onBible }) {
    const [chip, setChip] = useState("songs");
    const [q, setQ] = useState("");
    const [query, setQuery] = useState("");
    const key = `${chip}|${query}`;
    const [page, setPage] = useState(() => emptyList(key));
    const [loading, setLoading] = useState(false);
    const [failed, setFailed] = useState("");
    const [added, setAdded] = useState(() => new Set());
    const keyRef = useRef(key);
    keyRef.current = key;
    useEffect(() => {
        const t = setTimeout(() => setQuery(q.trim()), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [q]);
    const more = useCallback(async (from) => {
        const asked = keyRef.current;
        setLoading(true);
        const r = await remoteCall("library", libraryArgs(chip, query, from.rows.length));
        if (keyRef.current !== asked) return;
        setLoading(false);
        if (!r.ok) return setFailed(r.message || "Não foi possível ler a biblioteca.");
        setFailed("");
        setPage((cur) => joinPage(cur, asked, r.result));
    }, [chip, query]);
    useEffect(() => {
        const fresh = emptyList(key);
        setPage(fresh);
        more(fresh);
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- key is the chip and the search
    const meta = chipOf(chip);
    const rows = page.rows.map(mediaRow);
    return (
        <Sheet title="Adicionar à setlist" onClose={onClose}>
            <label className="rm-field">
                <Icon name="search" size={20} />
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Buscar em ${meta.label}`} aria-label={`Buscar em ${meta.label}`} maxLength={40} autoCapitalize="none" autoCorrect="off" enterKeyHint="search" />
            </label>
            <div className="rm-chips" role="group" aria-label="Tipo">
                {ADD_CHIPS.map((k) => <button key={k} type="button" className="rm-chip is-sm" aria-pressed={chip === k} onClick={() => setChip(k)}>{chipOf(k).label}</button>)}
            </div>
            <ul className="rm-list" role="list" aria-busy={loading || undefined}>
                {rows.map((r) => {
                    const args = addToSetlistArgs(chip, r.id);
                    const done = added.has(`${chip}:${r.id}`);
                    return (
                        <li key={r.id} className="rm-item rm-addrow">
                            {r.thumb ? <img className="rm-thumb" src={r.thumb} alt="" loading="lazy" /> : <Icon name={meta.icon} size={18} />}
                            <span className="rm-item-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                            {r.st
                                ? <span className="rm-tag is-warn">{r.stText}</span>
                                : done
                                    ? <span className="rm-added"><Icon name="check" size={16} />adicionado</span>
                                    : <Cmd c={c} k={`add-${r.id}`} action="setlist.add" args={args} className="rm-addb" label={`Adicionar ${r.title} à setlist`} then={() => { setAdded((s) => new Set(s).add(`${chip}:${r.id}`)); onAdded?.(); }}><Icon name="plus" size={20} /></Cmd>}
                        </li>
                    );
                })}
            </ul>
            {failed && <p className="rm-hint is-left">{failed}</p>}
            {loading && <p className="rm-hint">Carregando…</p>}
            {!loading && !failed && page.done && !rows.length && <p className="rm-hint">{query ? `Nada com "${query}" em ${meta.label}.` : `Nada em ${meta.label}.`}</p>}
            {!loading && !page.done && !failed && <button type="button" className="rm-b is-sm" onClick={() => more(page)}>Mostrar mais</button>}
            <button type="button" className="rm-item rm-bible-row" onClick={onBible}>
                <Icon name="book" size={18} />
                <span className="rm-item-t"><b>Passagem da Bíblia…</b><small>Marque os versículos na Bíblia e toque em + Setlist</small></span>
                <Icon name="chevron-right" size={18} />
            </button>
        </Sheet>
    );
}
