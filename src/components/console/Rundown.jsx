import React, { useMemo } from "react";
import { keryx } from "@/api/keryxClient";
import { getDragStage, getDragStages, clearDragStage } from "@/lib/console/dragStage";
import { Row, Btn, IconBtn, Empty, SelBar, RowMark } from "./kx";
import { useMultiSelect } from "./useMultiSelect";
import { pickedOf, selectionCount } from "@/lib/console/multiSelect";
import { takeOutManyQuestion } from "@/lib/console/bulkDelete";
import { keyHint } from "@/lib/console/keys";
import { useContextMenu } from "./ContextMenu";
import useKeepInView from "./useKeepInView";
import { useConfirm } from "./ConfirmDialog";
import { takeOut, takeOutQuestion, takeOutMany } from "./setlistActions";
import Icon from "./Icon";
import { plan, clockAt, span, total, isSection, typeIcon, typeLabel } from "@/lib/console/setlist";
import { moveTo, moveManyTo } from "@/lib/console/dropOrder";
import useSortable from "./useSortable";
import useRowStep from "./useRowStep";
import { menuItem } from "@/lib/console/menuLabels";
import { useLiveNow } from "@/hooks/useLiveState";
import { END_ACTIONS, END_LABEL, END_ICON, END_TIP, endChoice, NO_DURATION } from "@/lib/console/autoplay";

// Setlist automática (owner 2026-10-20, Rodada N2): "Avançar sozinho" in the
// Setlist's header, the culto's switch (Service.autoplay; it syncs with the
// culto). 24 px like every header control; its word goes first when the
// header is narrow (console.css, the setlist-h container), the switch stays.
// Rodada O3 (owner 2026-10-21): the small switch (kx-switch-sm) and the one
// word "Autoplay" — English by the owner's choice, the exception to the
// pt-BR rule; the whole sentence stays in the tooltip.
export function AutoplaySwitch({ on, onChange, disabled }) {
    const tip = disabled ? "Avançar sozinho: escolha ou comece um culto primeiro" : on ? "Avançar sozinho ligado: quando o item no ar termina, o próximo vai ao ar" : "Avançar sozinho: quando o item no ar terminar, o próximo vai ao ar sozinho";
    return (
        <button type="button" className="rund-auto" role="switch" aria-checked={Boolean(on)} aria-label="Autoplay: avançar sozinho" title={tip} disabled={disabled} onClick={() => onChange(!on)}>
            <span className={`sw2 kx-switch kx-switch-sm ${on ? "is-on" : ""}`} aria-hidden="true" /><span className="rund-auto-l">Autoplay</span>
        </button>
    );
}

// The Setlist's footer (Rodada Q, Q1; owner S1 = A): the culto's Autoplay
// switch and two icon-only buttons, Item anterior / Próximo item, the words
// in the tooltip and as screen-reader text. `prev`/`next` the neighbours of
// the item on air (neighbours() in setlist.js); a missing one disables its
// button and the tooltip says why.
export function SetlistFooter({ autoplay, prev, next, onStep }) {
    const name = (it) => it.title || typeLabel(it.type);
    const btn = (it, glyph, word, none) => (
        <button type="button" className="kx-btn kx-btn-icon rund-step" disabled={!it} title={it ? `${word} · ${name(it)}` : none} onClick={() => onStep(it)}>
            <Icon name={glyph} /><span className="kx-act-l">{it ? `${word} · ${name(it)}` : word}</span>
        </button>
    );
    return (
        <div className="rund-foot" role="group" aria-label="Setlist: avançar">
            <AutoplaySwitch {...autoplay} />
            <span className="rund-foot-steps">
                {btn(prev, "skip-back", "Item anterior", "Não há item anterior")}
                {btn(next, "skip-fwd", "Próximo item", "Não há próximo item")}
            </span>
        </div>
    );
}

// "Próximo em 5 s · Cancelar" on the next row while the pause counts down;
// amber when the Setlist stopped instead (the projector window closed).
function NextChip({ pending, onCancel }) {
    const now = useLiveNow(250, pending.kind === "count");
    if (pending.kind !== "count") return <span className="rund-cd is-warn" title="A Setlist parou: a janela do projetor está fechada. Abra a Projeção em Saídas e envie este item">Parou<span className="rund-cd-w">: projetor fechado</span></span>;
    const left = Math.max(1, Math.ceil((pending.until - (now || keryx.live.now())) / 1000));
    return (
        <span className="rund-cd" role="timer" aria-live="off" title={`Próximo em ${left} s`}>
            <span><span className="rund-cd-w">Próximo em </span>{left} s</span>
            <button type="button" onClick={(e) => { e.stopPropagation(); onCancel(); }} onDoubleClick={(e) => e.stopPropagation()} title="Cancelar · Esc">Cancelar</button>
        </span>
    );
}

// The planned clock time of each item ("HH:MM"; "" for a section): the
// service's start plus the durations before it (src/lib/console/setlist.js).
export const plannedTimes = (service, items) => plan(service, items).rows.map((r) => (r.at === null ? "" : clockAt(r.at)));

// The service's items in order: click (or Enter on the row) prepares; the
// "Ir" button prepares and sends — the only send here. Drag reorders
// (ServiceItem.order), as Cultos does; so do the row's menu (Subir,
// Descer) and Alt+↑ / Alt+↓ on a focused row (C-16, useRowStep).
// autoplay (the Setlist automática, Rodada N2): { on, pending, cancel,
// endsAlone(item) } — the mark on the row on air, the countdown on the next
// one, and each item's "Ao terminar" in its menu.
export default function Rundown({ service, items, loaded = true, airItemId, airNow = true, prevItemId, onPrepare, onGo, onAddStage, onPlan, onSay, canReorder = true, autoplay = null, picking, setPicking }) {
    const menu = useContextMenu();
    const ask = useConfirm();
    // "Tirar da setlist…" (owner 2026-10-16, 0.2.18): asks, then the item
    // leaves this culto's setlist; the song stays in the KERYX.
    const askTakeOut = async (it) => {
        if (!(await ask(takeOutQuestion(it)))) return;
        try { await takeOut(it); onSay?.(isSection(it) ? "Seção tirada da setlist." : "Item tirado da setlist."); } catch (err) { onSay?.(err?.message || "Não foi possível tirar o item."); }
    };
    // Selecting several items (multiSelect.js, owner 2026-10-21): Ctrl/Shift +
    // click and "Selecionar vários" (the panel header's button, Console.jsx)
    // mark; a plain click still prepares (M1 = A). Sections are headers: not
    // marked. "Tirar n da setlist…" takes them out at once, the culto
    // numbered again once (takeOutMany).
    const order = useMemo(() => items.filter((it) => !isSection(it)).map((it) => it.id), [items]);
    const allIds = useMemo(() => items.map((it) => it.id), [items]);
    const ms = useMultiSelect({ order, existing: allIds, mode: "air", picking, onPicking: setPicking });
    const picked = pickedOf(ms.sel, items);
    const takeOutPicked = async () => {
        const rows = picked;
        if (!rows.length) return;
        if (rows.length === 1) { await askTakeOut(rows[0]); return; }
        if (!(await ask(takeOutManyQuestion(rows.map((it) => it.title || typeLabel(it.type)))))) return;
        try {
            const failed = await takeOutMany(rows);
            ms.clear();
            onSay?.(`${rows.length - failed} ${rows.length - failed === 1 ? "item tirado" : "itens tirados"} da setlist.`);
        } catch (err) { onSay?.(err?.message || "Não foi possível tirar os itens."); }
    };
    const p = plan(service, items);
    const airIdx = items.findIndex((i) => i.id === airItemId);
    // Dragging (owner 2026-10-15, Rodada D; lit slot, Rodada E2): a gold
    // slot shows where the item lands and the rows around it make room — a
    // Setlist row moved, or a song from the Biblioteca (a stage, taken at
    // the drop) added there (useSortable; dropOrder.js, tested).
    const renumber = (next) => Promise.all(next.map((x, i) => (x.order !== i ? keryx.entities.ServiceItem.update(x.id, { order: i }) : null)));
    const reorder = (from, over) => renumber(moveTo(items, from, over));
    // Rodada O2: a marked row grabbed with others marked takes them all, in
    // the list's order (a section never goes with them: it is not marked).
    const markedIdxs = (k) => (picked.length > 1 && !isSection(items[k]) && ms.has(items[k]?.id) ? items.flatMap((it, i) => (ms.has(it.id) && !isSection(it) ? [i] : [])) : null);
    const sort = useSortable({
        disabled: !canReorder,
        keys: items.map((it) => it.id),
        group: markedIdxs,
        accepts: () => Boolean(getDragStage()),
        carry: () => { const stages = getDragStages(); clearDragStage(); return stages; },
        onDrop: (from, over, stages, group) => {
            if (group) { renumber(moveManyTo(items, group, over)); return; }
            if (from >= 0) { reorder(from, over); return; }
            if (stages?.length) onAddStage?.(stages, over);
        },
    });
    // The list follows the service: when the item on air (or in the Prévia)
    // changes, it is scrolled into view, so the next rows stay in sight.
    const listRef = sort.listProps.ref;
    // The row counting down (the Setlist automática) stays in sight with it.
    useKeepInView(listRef, airItemId ? ".is-air, .is-last, .has-cd" : ".is-prev", [airItemId, prevItemId, autoplay?.pending?.nextId]);
    const step = useRowStep({ ids: items.map((it) => it.id), listRef, onMove: reorder, disabled: !canReorder });
    // Ao terminar (the item's end_action): Ir para o próximo · Repetir · Parar.
    const setEnd = async (it, action) => {
        try {
            await keryx.entities.ServiceItem.update(it.id, { end_action: action });
            onSay?.(`${it.title || typeLabel(it.type)} · ao terminar: ${END_LABEL[action].toLowerCase()}.`);
        } catch (err) { onSay?.(err?.message || "Não foi possível salvar."); }
    };
    const endItems = (it) => {
        const choice = endChoice(it);
        const alone = autoplay?.endsAlone ? autoplay.endsAlone(it) : true;
        return [
            "sep",
            { head: "Ao terminar", minor: true },
            // A choice: the check in the glyph's place, as the culto of the day in Culto.
            ...END_ACTIONS.map((a) => ({ label: END_LABEL[a], checked: choice === a, onSelect: () => setEnd(it, a) })),
            ...(alone ? [] : [
                { node: <div className="rund-menu-note" role="note">{NO_DURATION}: fica no ar até você mandar o próximo</div> },
                { label: "Definir duração…", icon: "clock", onSelect: () => onPlan?.(it), disabled: !onPlan },
            ]),
        ];
    };


    return (
        <div className="rund-scroll">
        <div className={`rund kx-acts-list ${sort.sorting ? "is-sorting" : ""}`} role="list" aria-label="Setlist" {...sort.listProps} onKeyDown={(e) => ms.keyDown(e, { onDelete: takeOutPicked })}>
            {!items.length && loaded && (
                <Empty icon="list" title={service ? "Setlist vazia" : "Setlist de hoje"}>
                    {service ? "Arraste da Biblioteca, busque (/) ou use +." : "Arraste da Biblioteca ou use + para começar a setlist de hoje. Ou escolha um culto no menu KERYX."}
                </Empty>
            )}
            {onPlan && !items.length && loaded && <div className="rund-plan"><Btn small onClick={() => onPlan(null)}><Icon name="list" />Planejar o culto</Btn></div>}
            {items.map((it, i) => {
                if (isSection(it)) {
                    const sec = p.sections[i] || { count: 0, seconds: 0 };
                    return (
                        <div key={it.id} className="listhead rund-sec" role="listitem" {...sort.rowProps(i, { label: it.title, icon: "list", time: sec.seconds ? total(sec.seconds) : "" })} {...step.rowAttrs(i)} style={sort.rowStyle(i)}
                            tabIndex={canReorder ? 0 : undefined} aria-label={canReorder ? `Seção ${it.title} · Alt+↑ ou Alt+↓ muda de lugar` : undefined} onKeyDown={step.onKey(i)}
                            onContextMenu={(e) => menu(e, { title: it.title, items: [
                                onPlan && menuItem("editarNoPlanejador", { onSelect: () => onPlan(it) }),
                                menuItem("tirar", { label: "Tirar a seção…", onSelect: () => askTakeOut(it) }),
                                ...step.menuItems(i),
                            ] })}>
                            <span className="kx-section">{it.title}</span><span className="kx-count"> · {sec.count} · {total(sec.seconds)}</span>
                        </div>
                    );
                }
                // Red only while it is on air (dimmed when covered); after Esc the
                // session's item is the "último", a quiet mark (C-08).
                const last = it.id === airItemId && !airNow;
                const state = it.id === airItemId && airNow ? "is-air" : [it.id === prevItemId && "is-prev", last && "is-last"].filter(Boolean).join(" ") || (airIdx >= 0 && i < airIdx ? "is-done" : "");
                const dragProps = { ...sort.rowProps(i, { label: it.title || typeLabel(it.type), icon: typeIcon(it.type), time: it.duration ? span(it.duration) : "" }), ...step.rowAttrs(i), style: sort.rowStyle(i) };
                const timeCell = <>{p.rows[i]?.at != null ? clockAt(p.rows[i].at) : ""}<br />{it.duration ? span(it.duration) : ""}</>;
                // The item on air says what it does at its end; the next one counts down.
                const end = autoplay?.on && it.id === airItemId && airNow ? endChoice(it) : null;
                const chip = autoplay?.pending?.nextId === it.id ? <NextChip pending={autoplay.pending} onCancel={autoplay.cancel} /> : null;
                return (
                    <Row
                        key={it.id}
                        className={chip ? "has-cd" : ""}
                        icon={typeIcon(it.type)}
                        title={it.title || typeLabel(it.type)}
                        meta={[last && "último", typeLabel(it.type), it.notes].filter(Boolean).join(" · ")}
                        state={`${state} ${ms.has(it.id) ? "is-marked" : ""}`}
                        lead={ms.picking ? <RowMark /> : null}
                        onClick={(e) => { if (!ms.click(it.id, e)) onPrepare(it, i); }}
                        onDoubleClick={() => { if (!ms.picking) onGo(it, i); }}
                        onContextMenu={(e) => (picked.length > 1 && ms.has(it.id) ? menu(e, { title: selectionCount(picked.length), items: [
                            menuItem("tirar", { label: `Tirar ${picked.length} da setlist…`, kbd: keyHint("delete"), onSelect: takeOutPicked }),
                            { label: "Limpar a seleção", icon: "x", onSelect: ms.clear },
                        ] }) : menu(e, { title: it.title || typeLabel(it.type), items: [
                            menuItem("porNaPrevia", { onSelect: () => onPrepare(it, i) }),
                            onPlan && menuItem("editarNoPlanejador", { onSelect: () => onPlan(it) }),
                            menuItem("enviarAoAr", { air: true, onSelect: () => onGo(it, i) }),
                            ...endItems(it),
                            "sep",
                            menuItem("tirar", { label: "Tirar da setlist…", onSelect: () => askTakeOut(it) }),
                            ...step.menuItems(i),
                        ] }))}
                        onKey={step.onKey(i)}
                        dragProps={dragProps}
                        time={chip ? null : timeCell}
                        actions={<><Btn onClick={(e) => { e.stopPropagation(); onGo(it, i); }} title="Enviar ao ar · 2 cliques" aria-label={`Ir para ${it.title || typeLabel(it.type)}`}><span className="kx-act-i"><Icon name="play" /></span><span className="kx-act-l">Ir</span></Btn>{onPlan && <IconBtn name="edit" title="Editar no planejador" aria-label={`Editar ${it.title || typeLabel(it.type)} no planejador`} onClick={(e) => { e.stopPropagation(); onPlan(it); }} />}</>}
                    >
                        {end && <span className="rund-end" title={END_TIP[end]} aria-label={END_TIP[end]}><Icon name={END_ICON[end]} /></span>}
                        {chip}
                    </Row>
                );
            })}
            {sort.slot}
            {canReorder && <div className="rund-tail" data-sort-tail="" aria-hidden="true" />}
        </div>
        <SelBar count={picked.length} total={order.length} onAll={ms.all} onClear={ms.clear}>
            <Btn small onClick={takeOutPicked} title={`Tirar da setlist · ${keyHint("delete")}`}>Tirar da setlist…</Btn>
        </SelBar>
        </div>
    );
}
