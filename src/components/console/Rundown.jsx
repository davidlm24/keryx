import React from "react";
import { keryx } from "@/api/keryxClient";
import { getDragStage, clearDragStage } from "@/lib/console/dragStage";
import { Row, Btn, IconBtn, Empty } from "./kx";
import { useContextMenu } from "./ContextMenu";
import useKeepInView from "./useKeepInView";
import { useConfirm } from "./ConfirmDialog";
import { takeOut, takeOutQuestion } from "./setlistActions";
import Icon from "./Icon";
import { plan, clockAt, span, total, isSection, typeIcon, typeLabel } from "@/lib/console/setlist";
import { moveTo } from "@/lib/console/dropOrder";
import useSortable from "./useSortable";
import useRowStep from "./useRowStep";
import { menuItem } from "@/lib/console/menuLabels";
import { useLiveNow } from "@/hooks/useLiveState";
import { END_ACTIONS, END_LABEL, END_ICON, END_TIP, endChoice, NO_DURATION } from "@/lib/console/autoplay";

// Setlist automática (owner 2026-10-20, Rodada N2): "Avançar sozinho" in the
// Setlist's header, the culto's switch (Service.autoplay; it syncs with the
// culto). 24 px like every header control; its word goes first when the
// header is narrow (console.css, the setlist-h container), the switch stays.
export function AutoplaySwitch({ on, onChange, disabled }) {
    const tip = disabled ? "Avançar sozinho: escolha ou comece um culto primeiro" : on ? "Avançar sozinho ligado: quando o item no ar termina, o próximo vai ao ar" : "Avançar sozinho: quando o item no ar terminar, o próximo vai ao ar sozinho";
    return (
        <button type="button" className="rund-auto" role="switch" aria-checked={Boolean(on)} aria-label="Avançar sozinho" title={tip} disabled={disabled} onClick={() => onChange(!on)}>
            <span className={`sw2 ${on ? "is-on" : ""}`} aria-hidden="true" /><span className="rund-auto-l">Avançar sozinho</span>
        </button>
    );
}

// "Próximo em 5 s · Cancelar" on the next row while the pause counts down;
// amber when the Setlist stopped instead (the projector window closed).
function NextChip({ pending, onCancel }) {
    const now = useLiveNow(250, pending.kind === "count");
    if (pending.kind !== "count") return <span className="rund-cd is-warn" title="A janela do projetor está fechada: abra a Projeção em Saídas e envie este item">Parou: projetor fechado</span>;
    const left = Math.max(1, Math.ceil((pending.until - (now || keryx.live.now())) / 1000));
    return (
        <span className="rund-cd" role="timer" aria-live="off">
            Próximo em {left} s
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
export default function Rundown({ service, items, loaded = true, airItemId, airNow = true, prevItemId, onPrepare, onGo, onAddStage, onPlan, onSay, canReorder = true, autoplay = null }) {
    const menu = useContextMenu();
    const ask = useConfirm();
    // "Tirar da setlist…" (owner 2026-10-16, 0.2.18): asks, then the item
    // leaves this culto's setlist; the song stays in the KERYX.
    const askTakeOut = async (it) => {
        if (!(await ask(takeOutQuestion(it)))) return;
        try { await takeOut(it); onSay?.(isSection(it) ? "Seção tirada da setlist." : "Item tirado da setlist."); } catch (err) { onSay?.(err?.message || "Não foi possível tirar o item."); }
    };
    const p = plan(service, items);
    const airIdx = items.findIndex((i) => i.id === airItemId);
    // Dragging (owner 2026-10-15, Rodada D; lit slot, Rodada E2): a gold
    // slot shows where the item lands and the rows around it make room — a
    // Setlist row moved, or a song from the Biblioteca (a stage, taken at
    // the drop) added there (useSortable; dropOrder.js, tested).
    const reorder = async (from, over) => {
        const next = moveTo(items, from, over);
        await Promise.all(next.map((x, i) => (x.order !== i ? keryx.entities.ServiceItem.update(x.id, { order: i }) : null)));
    };
    const sort = useSortable({
        disabled: !canReorder,
        keys: items.map((it) => it.id),
        accepts: () => Boolean(getDragStage()),
        carry: () => { const stage = getDragStage(); clearDragStage(); return stage; },
        onDrop: (from, over, stage) => {
            if (from >= 0) { reorder(from, over); return; }
            if (stage) onAddStage?.(stage, over);
        },
    });
    // The list follows the service: when the item on air (or in the Prévia)
    // changes, it is scrolled into view, so the next rows stay in sight.
    const listRef = sort.listProps.ref;
    useKeepInView(listRef, airItemId ? ".is-air, .is-last" : ".is-prev", [airItemId, prevItemId]);
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
            ...END_ACTIONS.map((a) => ({ label: END_LABEL[a], icon: END_ICON[a], checked: choice === a, role: "menuitemradio", onSelect: () => setEnd(it, a) })),
            ...(alone ? [] : [
                { node: <div className="rund-menu-note" role="note">{NO_DURATION}: fica no ar até você mandar o próximo</div> },
                { label: "Definir duração…", icon: "clock", onSelect: () => onPlan?.(it), disabled: !onPlan },
            ]),
        ];
    };


    return (
        <div className={`rund kx-acts-list ${sort.sorting ? "is-sorting" : ""}`} role="list" aria-label="Setlist" {...sort.listProps}>
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
                        icon={typeIcon(it.type)}
                        title={it.title || typeLabel(it.type)}
                        meta={[last && "último", typeLabel(it.type), it.notes].filter(Boolean).join(" · ")}
                        state={state}
                        onClick={() => onPrepare(it, i)}
                        onDoubleClick={() => onGo(it, i)}
                        onContextMenu={(e) => menu(e, { title: it.title || typeLabel(it.type), items: [
                            menuItem("porNaPrevia", { onSelect: () => onPrepare(it, i) }),
                            onPlan && menuItem("editarNoPlanejador", { onSelect: () => onPlan(it) }),
                            menuItem("enviarAoAr", { air: true, onSelect: () => onGo(it, i) }),
                            ...endItems(it),
                            "sep",
                            menuItem("tirar", { label: "Tirar da setlist…", onSelect: () => askTakeOut(it) }),
                            ...step.menuItems(i),
                        ] })}
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
    );
}
