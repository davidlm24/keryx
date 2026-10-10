import React, { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { getDragStage, clearDragStage } from "@/lib/console/dragStage";
import { Row, Btn, IconBtn, Empty } from "./kx";
import { useContextMenu } from "./ContextMenu";
import Icon from "./Icon";
import { plan, clockAt, span, total, isSection, typeIcon, typeLabel } from "@/lib/console/setlist";

// The planned clock time of each item ("HH:MM"; "" for a section): the
// service's start plus the durations before it (src/lib/console/setlist.js).
export const plannedTimes = (service, items) => plan(service, items).rows.map((r) => (r.at === null ? "" : clockAt(r.at)));

// The service's items in order: click (or Enter on the row) prepares; the
// "Ir" button prepares and sends — the only send here. Drag reorders
// (ServiceItem.order), as Cultos does.
export default function Rundown({ service, items, airItemId, prevItemId, onPrepare, onGo, onAddStage, onPlan, canReorder = true }) {
    const menu = useContextMenu();
    const [drag, setDrag] = useState(null);
    const [over, setOver] = useState(null);
    // However a drag ends (dropped here, elsewhere or cancelled), no row
    // stays highlighted.
    useEffect(() => {
        const done = () => { setDrag(null); setOver(null); };
        window.addEventListener("dragend", done);
        window.addEventListener("drop", done);
        return () => { window.removeEventListener("dragend", done); window.removeEventListener("drop", done); };
    }, []);
    const dropHere = (e, i) => {
        e.preventDefault();
        const stage = getDragStage();
        if (stage) { clearDragStage(); onAddStage?.(stage, i); }
        else if (drag) reorder(drag, i);
        setDrag(null);
        setOver(null);
    };
    const p = plan(service, items);
    const airIdx = items.findIndex((i) => i.id === airItemId);

    const reorder = async (fromId, toIdx) => {
        const from = items.findIndex((i) => i.id === fromId);
        if (from < 0 || from === toIdx || from + 1 === toIdx) return;
        const next = items.slice();
        const [it] = next.splice(from, 1);
        next.splice(from < toIdx ? toIdx - 1 : toIdx, 0, it);
        await Promise.all(next.map((x, i) => (x.order !== i ? keryx.entities.ServiceItem.update(x.id, { order: i }) : null)));
    };


    return (
        <div className="rund kx-acts-list">
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
                        <div key={it.id} className={`listhead rund-sec ${over === i ? "is-dropbefore" : ""}`} draggable={canReorder} onDragStart={(e) => { setDrag(it.id); e.dataTransfer.effectAllowed = "move"; }} onDragOver={(e) => { e.preventDefault(); setOver(i); }} onDrop={(e) => dropHere(e, i)}>
                            <span className="kx-section">{it.title}</span><span className="kx-count"> · {sec.count} · {total(sec.seconds)}</span>
                        </div>
                    );
                }
                const state = it.id === airItemId ? "is-air" : it.id === prevItemId ? "is-prev" : airIdx >= 0 && i < airIdx ? "is-done" : "";
                const dragProps = canReorder ? {
                    draggable: true,
                    onDragStart: (e) => { setDrag(it.id); e.dataTransfer.effectAllowed = "move"; },
                    onDragEnd: () => { setDrag(null); setOver(null); },
                    onDragOver: (e) => { e.preventDefault(); setOver(i); },
                    onDrop: (e) => dropHere(e, i),
                } : {};
                return (
                    <Row
                        key={it.id}
                        icon={typeIcon(it.type)}
                        title={it.title || typeLabel(it.type)}
                        meta={[typeLabel(it.type), it.notes].filter(Boolean).join(" · ")}
                        time={<>{p.rows[i]?.at != null ? clockAt(p.rows[i].at) : ""}<br />{it.duration ? span(it.duration) : ""}</>}
                        state={`${state} ${drag === it.id ? "is-dragging" : ""} ${over === i ? "is-dropbefore" : ""}`}
                        onClick={() => onPrepare(it, i)}
                        onDoubleClick={() => onGo(it, i)}
                        onContextMenu={(e) => menu(e, { title: it.title || typeLabel(it.type), items: [
                            { label: "Preparar", icon: "eye", onSelect: () => onPrepare(it, i) },
                            onPlan && { label: "Editar no planejador", icon: "list", onSelect: () => onPlan(it) },
                            { label: "Ir para o item", icon: "play", air: true, onSelect: () => onGo(it, i) },
                        ] })}
                        dragProps={dragProps}
                        actions={<><Btn onClick={(e) => { e.stopPropagation(); onGo(it, i); }} title="Ir para o item · 2 cliques" aria-label="Ir"><span className="kx-act-i"><Icon name="play" /></span><span className="kx-act-l">Ir</span></Btn>{onPlan && <IconBtn name="more" title="Editar no planejador" onClick={(e) => { e.stopPropagation(); onPlan(it); }} />}</>}
                    />
                );
            })}
            {canReorder && (
                <div
                    className={`rund-tail ${over === items.length ? "is-dropend" : ""}`}
                    onDragOver={(e) => { e.preventDefault(); setOver(items.length); }}
                    onDrop={(e) => dropHere(e, items.length)}
                />
            )}
        </div>
    );
}
