import React from "react";
import Icon from "./Icon";
import { Row, Empty } from "./kx";
import { TeacherNotes } from "./CenterPanel";
import { QuickAlert, ReadyTimers, OnAirTimer, ToolsPicker } from "./QuickTools";
import { restoreArgs } from "@/lib/projection";
import { stageFromHistory } from "@/lib/console/stage";

// A row of tabs the operator trims (the Biblioteca's, the panel beside the
// Prévia): the tabs that show, then the (+) that lists them all with check
// marks (TabsMenu in Popovers.jsx; src/lib/console/panelTabs.js). The (+)
// carries `data-tabs-plus` so its list opens under it.
export function TabRow({ row, tabs, active, onPick, onMenu, menuOpen = false }) {
    return (
        <div className="kx-tabs tabrow" role="tablist">
            {tabs.map((t) => <button type="button" role="tab" aria-selected={active === t.id} key={t.id} className={`kx-t ${active === t.id ? "is-on" : ""}`} onClick={() => onPick(t.id)}>{t.name}</button>)}
            {onMenu && (
                <button type="button" className={`kx-t tabs-plus ${menuOpen ? "is-on" : ""}`} data-tabs-plus={row} aria-expanded={menuOpen} aria-haspopup="menu"
                    title="Escolher as abas que aparecem aqui" aria-label="Escolher as abas" onClick={onMenu}><Icon name="plus" /></button>
            )}
        </div>
    );
}

// The operator's notes of the item in the Prévia and of the one on air
// (ServiceItem.notes, written in Planejar o culto; a Texto item's notes are
// its text, so they are not repeated here), and an Escola bíblica
// material's teacher notes. Only in the console, never on a projector.
function ItemNotes({ c, items, prevItemId, airItemId }) {
    const noteOf = (id) => {
        const it = id ? items.find((i) => i.id === id) : null;
        return it && it.notes?.trim() && String(it.type || "").toUpperCase() !== "TEXT" ? it : null;
    };
    const prevIt = noteOf(prevItemId);
    const airIt = airItemId !== prevItemId ? noteOf(airItemId) : null;
    const teacher = c.prev?.notes || c.cur?.content?.stage?.notes;
    if (!prevIt && !airIt && !teacher) {
        return <Empty icon="list" title="Sem notas">As notas de um item da setlist (Planejar o culto) aparecem aqui quando ele está na prévia ou no ar.</Empty>;
    }
    const block = (it, where) => (
        <div className="tnotes item-notes" key={`${where}-${it.id}`}>
            <span className="kx-section">{it.title} <span className="kx-count">· {where}</span></span>
            <p>{it.notes}</p>
        </div>
    );
    return (
        <div className="tabs-notes">
            {prevIt && block(prevIt, airItemId === prevItemId ? "na prévia e no ar" : "na prévia")}
            {airIt && block(airIt, "no ar")}
            <TeacherNotes prev={c.prev} cur={c.cur} />
        </div>
    );
}

// Esteve no ar: the live state's history (what "Voltar ao anterior" lists),
// always at hand. A click puts it back in the Prévia, a double click on air.
function AirHistory({ c, onPrepare, onGo }) {
    const history = c.live?.history || [];
    if (!history.length) return <Empty icon="history" title="Nada ainda">O que for ao ar aparece aqui, do mais recente ao mais antigo.</Empty>;
    return (
        <div className="kx-acts-list">
            {history.map((h) => {
                const stage = () => stageFromHistory(h, restoreArgs);
                return (
                    <Row key={h.at} icon="undo" title={`${h.title || h.layer}${h.layer === "content" && h.data.slides?.length > 1 ? ` · slide ${h.data.index + 1}` : ""}`}
                        meta={new Date(h.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        onClick={() => onPrepare(stage())} onDoubleClick={onGo && (() => onGo(stage()))} />
                );
            })}
        </div>
    );
}

// The panel beside the Prévia (owner's design 2026-10-13, the console
// audit): one tab at a time, the ones the operator checked in its (+).
export default function TabsPanel({ c, data, tabs, active, setActive, onMenu, menuOpen, items, prevItemId, airItemId, onPrepare, onGo }) {
    return (
        <div className="kx-panel bb-side tabs-panel" data-panel-tab={active}>
            <TabRow row="panel" tabs={tabs} active={active} onPick={setActive} onMenu={onMenu} menuOpen={menuOpen} />
            <div className="kx-panel-b">
                {active === "notas" && <ItemNotes c={c} items={items} prevItemId={prevItemId} airItemId={airItemId} />}
                {active === "aviso" && <div className="tabs-pad"><QuickAlert c={c} data={data} /></div>}
                {active === "timers" && <div className="tabs-pad"><OnAirTimer c={c} /><ReadyTimers c={c} data={data} onPrepare={onPrepare} onGo={onGo} /></div>}
                {active === "ferramentas" && <div className="tabs-pad"><ToolsPicker c={c} data={data} onPrepare={onPrepare} onGo={onGo} /></div>}
                {active === "historico" && <AirHistory c={c} onPrepare={onPrepare} onGo={onGo} />}
            </div>
        </div>
    );
}
