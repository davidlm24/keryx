import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Row, Btn, IconBtn, Empty } from "./kx";

const TYPE_ICON = { SONG: "music", BIBLE: "book", VIDEO: "film", IMAGE: "image", PDF: "film", POWERPOINT: "film", ANNOUNCEMENT: "megaphone", TEXT: "text", TIMER: "clock", BANNER: "image" };
const TYPE_LABEL = { SONG: "Música", BIBLE: "Leitura", VIDEO: "Vídeo", IMAGE: "Imagem", PDF: "Apresentação", POWERPOINT: "Apresentação", ANNOUNCEMENT: "Aviso", TEXT: "Texto", TIMER: "Timer", BANNER: "Banner", POLL: "Enquete", QUIZ: "Quiz", FREE_CONTENT: "Conteúdo" };

const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// The planned clock time of each item: the service's start plus the
// durations before it.
export function plannedTimes(service, items) {
    const [h, m] = String(service?.startTime || service?.time || "19:00").split(":").map(Number);
    let t = (h || 19) * 60 + (m || 0);
    return items.map((it) => { const at = t; t += Math.round((it.duration || 0) / 60); return `${String(Math.floor(at / 60) % 24).padStart(2, "0")}:${String(at % 60).padStart(2, "0")}`; });
}

// The service's items in order: click (or Enter on the row) prepares; the
// "Ir" button prepares and sends — the only send here. Drag reorders
// (ServiceItem.order), as Cultos does.
export default function Rundown({ service, items, airItemId, prevItemId, onPrepare, onGo, canReorder = true }) {
    const [drag, setDrag] = useState(null);
    const [over, setOver] = useState(null);
    const times = plannedTimes(service, items);
    const airIdx = items.findIndex((i) => i.id === airItemId);

    const reorder = async (fromId, toIdx) => {
        const from = items.findIndex((i) => i.id === fromId);
        if (from < 0 || from === toIdx || from + 1 === toIdx) return;
        const next = items.slice();
        const [it] = next.splice(from, 1);
        next.splice(from < toIdx ? toIdx - 1 : toIdx, 0, it);
        await Promise.all(next.map((x, i) => (x.order !== i ? keryx.entities.ServiceItem.update(x.id, { order: i }) : null)));
    };

    if (!service) return <Empty icon="list" title="Nenhum culto escolhido">Escolha um culto no menu KERYX ou crie um em Cultos.</Empty>;
    if (!items.length) return <Empty icon="list" title="Roteiro vazio">Adicione itens pela busca (/) ou na página Cultos.</Empty>;

    return (
        <>
            {items.map((it, i) => {
                const state = it.id === airItemId ? "is-air" : it.id === prevItemId ? "is-prev" : airIdx >= 0 && i < airIdx ? "is-done" : "";
                const dragProps = canReorder ? {
                    draggable: true,
                    onDragStart: (e) => { setDrag(it.id); e.dataTransfer.effectAllowed = "move"; },
                    onDragEnd: () => { setDrag(null); setOver(null); },
                    onDragOver: (e) => { e.preventDefault(); setOver(i); },
                    onDrop: (e) => { e.preventDefault(); if (drag) reorder(drag, i); setDrag(null); setOver(null); },
                } : {};
                return (
                    <Row
                        key={it.id}
                        icon={TYPE_ICON[it.type] || "list"}
                        title={it.title || TYPE_LABEL[it.type] || it.type}
                        meta={[TYPE_LABEL[it.type], it.notes].filter(Boolean).join(" · ")}
                        time={<>{times[i]}<br />{it.duration ? mmss(it.duration) : ""}</>}
                        state={`${state} ${drag === it.id ? "is-dragging" : ""} ${over === i && drag ? "is-dropbefore" : ""}`}
                        onClick={() => onPrepare(it, i)}
                        dragProps={dragProps}
                        actions={<><Btn onClick={(e) => { e.stopPropagation(); onGo(it, i); }} title="Ir para o item · Enter">Ir</Btn><IconBtn name="more" title="Mais" onClick={(e) => e.stopPropagation()} /></>}
                    />
                );
            })}
        </>
    );
}
