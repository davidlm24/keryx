import React, { useEffect } from "react";
import { keryx } from "@/api/keryxClient";
import { getDragStage, clearDragStage } from "@/lib/console/dragStage";
import { Row, Btn, IconBtn, Empty } from "./kx";
import { useContextMenu } from "./ContextMenu";
import Icon from "./Icon";
import { plan, clockAt, span, total, isSection, typeIcon, typeLabel } from "@/lib/console/setlist";
import { moveTo } from "@/lib/console/dropOrder";
import useSortable from "./useSortable";

// The planned clock time of each item ("HH:MM"; "" for a section): the
// service's start plus the durations before it (src/lib/console/setlist.js).
export const plannedTimes = (service, items) => plan(service, items).rows.map((r) => (r.at === null ? "" : clockAt(r.at)));

// The service's items in order: click (or Enter on the row) prepares; the
// "Ir" button prepares and sends — the only send here. Drag reorders
// (ServiceItem.order), as Cultos does.
export default function Rundown({ service, items, airItemId, prevItemId, onPrepare, onGo, onAddStage, onPlan, canReorder = true }) {
    const menu = useContextMenu();
    const p = plan(service, items);
    const airIdx = items.findIndex((i) => i.id === airItemId);
    // Dragging (owner 2026-10-15, Rodada D): the rows below slide to open
    // room where the item lands — a Setlist row moved, or a song from the
    // Biblioteca (a stage) added there (useSortable; dropOrder.js, tested).
    const reorder = async (from, over) => {
        const next = moveTo(items, from, over);
        await Promise.all(next.map((x, i) => (x.order !== i ? keryx.entities.ServiceItem.update(x.id, { order: i }) : null)));
    };
    const sort = useSortable({
        disabled: !canReorder,
        accepts: () => Boolean(getDragStage()),
        onDrop: (from, over) => {
            if (from >= 0) { reorder(from, over); return; }
            const stage = getDragStage();
            if (stage) { clearDragStage(); onAddStage?.(stage, over); }
        },
    });
    // The list follows the service: when the item on air (or in the Prévia)
    // changes, it is scrolled into view, so the next rows stay in sight.
    const listRef = sort.listProps.ref;
    useEffect(() => {
        const row = listRef.current?.querySelector(".is-air") || listRef.current?.querySelector(".is-prev");
        row?.scrollIntoView({ block: "nearest" });
    }, [airItemId, prevItemId]); // eslint-disable-line react-hooks/exhaustive-deps


    return (
        <div className={`rund kx-acts-list ${sort.sorting ? "is-sorting" : ""}`} {...sort.listProps}>
            {!items.length && (
                <Empty icon="list" title={service ? "Setlist vazia" : "Setlist de hoje"}>
                    {service ? "Arraste da Biblioteca, busque (/) ou use +." : "Arraste da Biblioteca ou use + para começar a setlist de hoje. Ou escolha um culto no menu KERYX."}
                </Empty>
            )}
            {onPlan && !items.length && <div className="rund-plan"><Btn small onClick={() => onPlan(null)}><Icon name="list" />Planejar o culto</Btn></div>}
            {items.map((it, i) => {
                if (isSection(it)) {
                    const sec = p.sections[i] || { count: 0, seconds: 0 };
                    return (
                        <div key={it.id} className="listhead rund-sec" {...sort.rowProps(i, { label: it.title, icon: "list" })} style={sort.rowStyle(i)}>
                            <span className="kx-section">{it.title}</span><span className="kx-count"> · {sec.count} · {total(sec.seconds)}</span>
                        </div>
                    );
                }
                const state = it.id === airItemId ? "is-air" : it.id === prevItemId ? "is-prev" : airIdx >= 0 && i < airIdx ? "is-done" : "";
                const dragProps = { ...sort.rowProps(i, { label: it.title || typeLabel(it.type), icon: typeIcon(it.type) }), style: sort.rowStyle(i) };
                return (
                    <Row
                        key={it.id}
                        icon={typeIcon(it.type)}
                        title={it.title || typeLabel(it.type)}
                        meta={[typeLabel(it.type), it.notes].filter(Boolean).join(" · ")}
                        time={<>{p.rows[i]?.at != null ? clockAt(p.rows[i].at) : ""}<br />{it.duration ? span(it.duration) : ""}</>}
                        state={state}
                        onClick={() => onPrepare(it, i)}
                        onDoubleClick={() => onGo(it, i)}
                        onContextMenu={(e) => menu(e, { title: it.title || typeLabel(it.type), items: [
                            { label: "Pôr na prévia", icon: "eye", onSelect: () => onPrepare(it, i) },
                            onPlan && { label: "Editar no planejador", icon: "list", onSelect: () => onPlan(it) },
                            { label: "Enviar ao ar", icon: "play", air: true, onSelect: () => onGo(it, i) },
                        ] })}
                        dragProps={dragProps}
                        actions={<><Btn onClick={(e) => { e.stopPropagation(); onGo(it, i); }} title="Enviar ao ar · 2 cliques" aria-label="Ir"><span className="kx-act-i"><Icon name="play" /></span><span className="kx-act-l">Ir</span></Btn>{onPlan && <IconBtn name="more" title="Editar no planejador" onClick={(e) => { e.stopPropagation(); onPlan(it); }} />}</>}
                    />
                );
            })}
            {canReorder && <div className="rund-tail" data-sort-tail="" />}
        </div>
    );
}
