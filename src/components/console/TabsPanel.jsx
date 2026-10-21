import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Row, Empty, FoldBtn, FoldStrip, foldStrip, onTabsKey, tabStop } from "./kx";
import { TeacherNotes } from "./CenterPanel";
import { QuickAlert, ReadyTimers, OnAirTimer, ToolsPicker } from "./QuickTools";
import { restoreArgs } from "@/lib/projection";
import { stageFromHistory } from "@/lib/console/stage";
import { TABS_MENU_TITLE } from "@/lib/console/panelTabs";

// A row of tabs the operator trims (the Biblioteca's, the panel beside the
// Prévia): only the tabs that show. Which ones is the chooser (the eye) in
// the panel's header (TabsPlus).
//
// With `onClose`, tabs that close as in a browser (Planejar o culto's
// cultos, Rodada O, O9): each tab's × (out of the Tab order: Delete on the
// focused tab closes it), an optional dot before its name (`dot`: what it
// means, said to screen readers too) and its right click (`onMenu(e, tab)`).
export function TabRow({ tabs, active, onPick, onClose = null, onMenu = null, label }) {
    const anyOn = tabs.some((t) => t.id === active);
    if (onClose) return (
        <div className="kx-tabs tabrow tabrow-close" role="tablist" aria-label={label} onKeyDown={onTabsKey}>
            {tabs.map((t, i) => {
                const on = active === t.id;
                return (
                    <span key={t.id} className={`kx-tc ${on ? "is-on" : ""}`} onContextMenu={onMenu ? (e) => { e.preventDefault(); onMenu(e, t); } : undefined}>
                        <button type="button" role="tab" aria-selected={on} tabIndex={tabStop(i, on, anyOn)} className="kx-t kx-tc-t" title={t.title || t.name}
                            aria-label={t.dot ? `${t.name} · ${t.dot}` : undefined} onClick={() => onPick(t.id)}
                            onKeyDown={(e) => {
                                if (e.key !== "Delete") return;
                                e.preventDefault();
                                e.stopPropagation();
                                // The focus goes on to the tab now in front.
                                const list = e.currentTarget.closest("[role='tablist']");
                                onClose(t.id);
                                requestAnimationFrame(() => list?.querySelector("[role='tab'][aria-selected='true']")?.focus());
                            }}>
                            {t.dot && <span className="kx-tc-dot" aria-hidden="true" />}
                            <span className="kx-tc-l">{t.name}</span>
                        </button>
                        <button type="button" className="kx-t kx-tc-x" tabIndex={-1} title="Fechar a aba · Delete" aria-label={`Fechar a aba ${t.name}`} onClick={() => onClose(t.id)}><Icon name="x" /></button>
                    </span>
                );
            })}
        </div>
    );
    return (
        <div className="kx-tabs tabrow" role="tablist" onKeyDown={onTabsKey}>
            {tabs.map((t, i) => <button type="button" role="tab" aria-selected={active === t.id} tabIndex={tabStop(i, active === t.id, anyOn)} key={t.id} className={`kx-t ${active === t.id ? "is-on" : ""}`} onClick={() => onPick(t.id)}>{t.name}</button>)}
        </div>
    );
}

// The chooser of a trimmable tab row, in its panel's header at the level of
// the title (Rodada E1): it lists every tab with check marks (TabsMenu in
// Popovers.jsx; src/lib/console/panelTabs.js) and carries `data-tabs-plus`
// so that list opens under it. Its glyph is the eye, the sign of Ver in the
// top bar (owner's pick, Rodada H, H1): it says "what shows here", never
// "add" — the + of a panel adds content.
export function TabsPlus({ row, onMenu, menuOpen = false }) {
    const label = `${TABS_MENU_TITLE[row] || "Mostrar aqui"}…`;
    return (
        <button type="button" className={`kx-btn kx-btn-icon kx-t tabs-plus ${menuOpen ? "is-on" : ""}`} data-tabs-plus={row} aria-expanded={menuOpen} aria-haspopup="menu"
            title={label} aria-label={label} onClick={onMenu}><Icon name="eye" /></button>
    );
}

// The operator's notes of the item in the Prévia and of the one on air
// (ServiceItem.notes, written in Planejar o culto; a Texto item's notes are
// its text, so they are not repeated here), an Escola bíblica material's
// teacher notes, and the operator's own free notes. Only in the console,
// never on a projector.
function ItemNotes({ c, items, prevItemId, airItemId, service, onSaveNotes }) {
    const noteOf = (id) => {
        const it = id ? items.find((i) => i.id === id) : null;
        return it && it.notes?.trim() && String(it.type || "").toUpperCase() !== "TEXT" ? it : null;
    };
    const prevIt = noteOf(prevItemId);
    const airIt = airItemId !== prevItemId ? noteOf(airItemId) : null;
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
            {onSaveNotes && <OperatorNotes service={service} onSave={onSaveNotes} />}
        </div>
    );
}

// The operator's free notes (Service.operator_notes, owner 2026-10-14):
// they ride the service and the backup, never the PDF or a screen. Saved a
// moment after typing stops and on leaving the field (Esc leaves it); with
// no service the first save starts the day's draft (onSave does).
function OperatorNotes({ service, onSave }) {
    const saved = service?.operator_notes || "";
    const [text, setText] = useState(saved);
    const focused = useRef(false);
    const last = useRef(saved);
    const timer = useRef(null);
    // Another service, or the row changed elsewhere: follow it unless the
    // operator is typing here.
    useEffect(() => { if (!focused.current) { setText(saved); last.current = saved; } }, [service?.id, saved]);
    const save = (v) => {
        clearTimeout(timer.current);
        if (v === last.current) return;
        last.current = v;
        Promise.resolve(onSave(v)).catch(() => { last.current = null; });
    };
    useEffect(() => () => clearTimeout(timer.current), []);
    return (
        <label className="op-notes">
            <textarea className="op-notes-f" value={text} placeholder="Anotações deste culto (só aparecem aqui no console)…" aria-label="Anotações do operador"
                onFocus={() => { focused.current = true; }}
                onChange={(e) => { const v = e.target.value; setText(v); clearTimeout(timer.current); timer.current = setTimeout(() => save(v), 800); }}
                onBlur={(e) => { focused.current = false; save(e.target.value); }} />
        </label>
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
// audit): one tab at a time, the ones the operator checked in its chooser. Its
// thin header (title "Painel", the chooser at its right) is Rodada E1's;
// the fold chevron (`fold`, the dock's: Panel) right of it, Rodada F4.
export default function TabsPanel({ c, data, tabs, active, setActive, onMenu, menuOpen, items, prevItemId, airItemId, service, onSaveNotes, onPrepare, onGo, fold }) {
    const strip = foldStrip(fold);
    return (
        <div className={`kx-panel bb-side tabs-panel ${fold?.on ? "is-collapsed" : ""} ${strip ? "kx-strip" : ""}`} data-panel-tab={active}>
            {strip ? <FoldStrip fold={fold} /> : (
                <div className="kx-panel-h tabs-panel-h">
                    <span className="kx-section">Painel</span>
                    {onMenu && <TabsPlus row="panel" onMenu={onMenu} menuOpen={menuOpen} />}
                    <FoldBtn fold={fold} />
                </div>
            )}
            {!fold?.on && <TabRow tabs={tabs} active={active} onPick={setActive} />}
            <div className="kx-panel-b" inert={fold?.on ? "" : undefined} style={strip ? { display: "none" } : undefined}>
                {active === "notas" && <ItemNotes c={c} items={items} prevItemId={prevItemId} airItemId={airItemId} service={service} onSaveNotes={onSaveNotes} />}
                {active === "aviso" && <div className="tabs-pad"><QuickAlert c={c} data={data} /></div>}
                {active === "timers" && <div className="tabs-pad"><OnAirTimer c={c} /><ReadyTimers c={c} data={data} onPrepare={onPrepare} onGo={onGo} /></div>}
                {active === "ferramentas" && <div className="tabs-pad"><ToolsPicker c={c} data={data} onPrepare={onPrepare} onGo={onGo} /></div>}
                {active === "historico" && <AirHistory c={c} onPrepare={onPrepare} onGo={onGo} />}
            </div>
        </div>
    );
}
