import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Split } from "./kx";
import { MODULES, moveModules, hideModule, setActive, resizeChild, defaultSize, canTray } from "@/lib/console/dock";

// Ver › Editar disposição for the culto environment (2026-10-13; the
// prototype "Disposição do console", model Livre): the console as a tree of
// splits and tab groups (src/lib/console/dock.js decides everything; these
// only draw it and report what the operator does).
//   - DockView draws a fitted frame (fitDock): splits with their splitters,
//     groups with their tabs; while editing, each group gets a bar with a
//     grip (the whole group) and one chip per module (drag it; a click opens
//     "Mover para…"; × puts it in the tray).
//   - useDockDrag moves modules by dragging, with pointer events (never
//     HTML5 drag and drop: the Setlist accepts any dragover, and a stage drag
//     must never start from a layout move). A drop on a group's middle makes
//     tabs, on a side splits; on the tray ([data-dock-tray]) hides.

const key = (path) => JSON.stringify(path);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nameOf = (id) => MODULES[id]?.name || id;
// The first module in a frame: a stable React key for its cell.
const firstOf = (f) => (f.kind === "group" ? f.tabs[0] : firstOf(f.children[0].frame));

export const ZONE_LABEL = { center: "Juntar como aba", left: "Pôr à esquerda", right: "Pôr à direita", top: "Pôr em cima", bottom: "Pôr embaixo" };

// The side of a box the pointer is near (a quarter of the way in), else its middle.
export function pickZone(r, x, y) {
    const d = { left: (x - r.left) / r.width, right: (r.right - x) / r.width, top: (y - r.top) / r.height, bottom: (r.bottom - y) / r.height };
    const best = ["left", "right", "top", "bottom"].reduce((a, z) => (d[z] < d[a] ? z : a), "left");
    return d[best] < 0.25 ? best : "center";
}

// Dragging modules to a new place. `onDock(next)`: a drop that changes the dock.
// -> { drag, start(e, { mods, label, fromTray }), justDragged() }
//    drag = { x, y, label, target: { el, zone, label, next } | null } while dragging.
export function useDockDrag({ dock, onDock }) {
    const [drag, setDrag] = useState(null);
    const pend = useRef(null);
    const last = useRef(null);
    const ended = useRef(0);
    const live = useRef({ dock, onDock });
    live.current = { dock, onDock };

    const findTarget = (x, y, p) => {
        const d = live.current.dock;
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        const tray = el.closest("[data-dock-tray]");
        if (tray) {
            if (p.fromTray) return null;
            const next = moveModules(d, p.mods, { kind: "tray" });
            if (same(next, d)) return null;
            return { el: tray, zone: "center", label: p.mods.includes("player") ? "Voltar para baixo do Programa" : "Tirar para a bandeja", next };
        }
        const ge = el.closest("[data-dock-group]");
        if (!ge) return null;
        const r = ge.getBoundingClientRect();
        const zone = ge.dataset.dockCollapsed ? "center" : pickZone(r, x, y);
        const px = Math.round((zone === "left" || zone === "right" ? r.width : r.height) / 2);
        const next = moveModules(d, p.mods, { kind: "group", path: JSON.parse(ge.dataset.dockGroup), zone }, { px });
        if (same(next, d)) return null;
        return { el: ge, zone, label: ZONE_LABEL[zone], next };
    };

    useEffect(() => {
        const move = (e) => {
            const p = pend.current;
            if (!p) return;
            if (!p.moved) {
                if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < 5) return;
                p.moved = true;
            }
            last.current = { x: e.clientX, y: e.clientY, label: p.label, target: findTarget(e.clientX, e.clientY, p) };
            setDrag(last.current);
        };
        const up = () => {
            const p = pend.current;
            pend.current = null;
            if (!p?.moved) return;
            ended.current = Date.now();
            const t = last.current?.target;
            last.current = null;
            setDrag(null);
            if (t) live.current.onDock(t.next);
        };
        // Esc while dragging: the drag ends, nothing else (not the edit mode).
        const esc = (e) => {
            if (e.key !== "Escape" || !pend.current?.moved) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            pend.current = null;
            last.current = null;
            ended.current = Date.now();
            setDrag(null);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", up);
        window.addEventListener("keydown", esc, true);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", up);
            window.removeEventListener("keydown", esc, true);
        };
    }, []);

    const start = (e, payload) => {
        if (e.button !== 0) return;
        pend.current = { ...payload, x: e.clientX, y: e.clientY, moved: false };
    };
    // A click right after a drag is the drag's end, not a click.
    const justDragged = () => Date.now() - ended.current < 300;
    return { drag, start, justDragged };
}

// Where a dragged module would land, over the page.
export function DockHint({ drag }) {
    const t = drag?.target;
    const ghost = drag && <div className="dock-ghost" style={{ left: drag.x + 14, top: drag.y + 12 }} aria-hidden="true"><Icon name="grip" />{drag.label}</div>;
    if (!t) return ghost || null;
    const r = t.el.getBoundingClientRect();
    let { left, top, width, height } = r;
    if (t.zone === "left") width /= 2;
    if (t.zone === "right") { left += width / 2; width /= 2; }
    if (t.zone === "top") height /= 2;
    if (t.zone === "bottom") { top += height / 2; height /= 2; }
    return (
        <>
            <div className="dock-hint" style={{ left, top, width, height }} aria-hidden="true"><span>{t.label}</span></div>
            {ghost}
        </>
    );
}

// The modules in the tray, for the edit banner: drag one back, or click it
// for "Mover para…".
export function DockTray({ dock, dnd, onChipMenu }) {
    return (
        <div className="dock-tray" data-dock-tray="" title="Solte um módulo aqui para tirá-lo do console">
            <span className="kx-meta">Bandeja</span>
            {dock.hidden.length ? dock.hidden.map((id) => (
                <button key={id} type="button" className="dock-chip" onPointerDown={(e) => dnd.start(e, { mods: [id], label: nameOf(id), fromTray: true })}
                    onClick={(e) => { if (!dnd.justDragged()) onChipMenu(e, id); }} title={`Arraste para pôr ${nameOf(id)} no console · clique para escolher onde`}>
                    <Icon name="grip" />{nameOf(id)}
                </button>
            )) : <span className="kx-meta">vazia</span>}
        </div>
    );
}

// The named arrangement being edited, in the edit banner (dockPresets.js):
// its name (and whether it changed), Salvar over it, Salvar como… a new
// one, Excluir. Switching between them is in Ver.
export function DockPresetsBar({ preset, changed, onSave, onSaveAs, onDelete, problemOf }) {
    const [naming, setNaming] = useState(null);
    const problem = naming === null ? null : problemOf(naming);
    const done = () => { if (!problem) { onSaveAs(naming); setNaming(null); } };
    if (naming !== null) {
        return (
            <span className="dock-presets">
                <span className="kx-field dock-name"><input autoFocus value={naming} maxLength={40} placeholder="Nome da disposição" aria-label="Nome da disposição"
                    onChange={(e) => setNaming(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); done(); }
                        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setNaming(null); }
                    }} /></span>
                <button type="button" className="kx-btn kx-btn-outline kx-t" disabled={Boolean(problem)} title={problem || "Salvar a disposição como está"} onClick={done}>Salvar</button>
                <button type="button" className="kx-btn kx-t" onClick={() => setNaming(null)}>Cancelar</button>
                {problem && naming.trim() && <span className="kx-meta kx-warn">{problem}</span>}
            </span>
        );
    }
    return (
        <span className="dock-presets">
            <span className="kx-meta">Disposição: <b className="dock-preset-name">{preset ? preset.name : "Padrão"}</b>{changed ? " · alterada" : ""}</span>
            {preset && changed && <button type="button" className="kx-btn kx-t" onClick={onSave} title={`Gravar as mudanças em “${preset.name}”`}>Salvar</button>}
            <button type="button" className="kx-btn kx-t" onClick={() => setNaming("")} title="Salvar a disposição como está, com um nome, para trocar depois em Ver">Salvar como…</button>
            {preset && <button type="button" className="kx-btn kx-t" onClick={onDelete} title={`Excluir a disposição “${preset.name}”`}>Excluir…</button>}
        </span>
    );
}

// The console's modules where the dock puts them. `render(id)`: the module's
// panel; `playerDocked`: the player rides the Programa (a chip of its own
// while editing).
export default function DockView({ frame, dock, onDock, render, editing, dnd, onChipMenu, playerDocked }) {
    // The tab in front of a group made of a split that does not fit (it is
    // not in the dock: a bigger screen splits it again).
    const [shown, setShown] = useState({});
    if (!frame) return null;

    const chip = (id) => {
        const home = id === "player" && playerDocked;
        const out = canTray(id) || (id === "player" && !home);
        return (
            <span key={id} className="dock-chipwrap">
                <button type="button" className="dock-chip" onPointerDown={(e) => dnd.start(e, { mods: [id], label: nameOf(id) })}
                    onClick={(e) => { if (!dnd.justDragged()) onChipMenu(e, id); }}
                    title={home ? "O player fica sob o Programa · arraste para pô-lo em outro lugar" : `Arraste ${nameOf(id)} para outro lugar · clique para Mover para…`}>
                    {nameOf(id)}{home ? <span className="kx-meta"> · sob o Programa</span> : null}
                </button>
                {out && (
                    <button type="button" className="dock-x" title={id === "player" ? "Voltar para baixo do Programa" : `Tirar ${nameOf(id)} para a bandeja`} aria-label={id === "player" ? "Voltar o player para baixo do Programa" : `Tirar ${nameOf(id)} para a bandeja`}
                        onClick={() => onDock(id === "player" ? moveModules(dock, ["player"], { kind: "home" }) : hideModule(dock, id))}>
                        <Icon name="x" />
                    </button>
                )}
            </span>
        );
    };

    const group = (f) => {
        const k = key(f.path);
        const active = f.collapsed ? (f.tabs.includes(shown[k]) ? shown[k] : f.active) : f.active;
        const pick = (id) => (f.collapsed ? setShown((s) => ({ ...s, [k]: id })) : onDock(setActive(dock, f.path, id)));
        const live = f.tabs.includes("previa") || f.tabs.includes("abas");
        let head = null;
        if (editing) {
            const chips = f.tabs.map(chip);
            if (playerDocked && f.tabs.includes("programa")) chips.push(chip("player"));
            head = (
                <div className="dock-bar" role="group" aria-label={`Grupo: ${f.tabs.map(nameOf).join(", ")}`}>
                    <span className="arr-grip" title="Arraste para mover o grupo inteiro" onPointerDown={(e) => dnd.start(e, { mods: f.tabs, label: f.tabs.map(nameOf).join(" + ") })}><Icon name="grip" /></span>
                    {chips}
                </div>
            );
        } else if (f.tabs.length > 1) {
            head = (
                <div className="dock-tabs" role="tablist">
                    {f.tabs.map((id) => (
                        <button key={id} type="button" role="tab" aria-selected={id === active} className={`dock-tab ${id === active ? "is-on" : ""}`} onClick={() => pick(id)}>{nameOf(id)}</button>
                    ))}
                </div>
            );
        }
        return (
            <div className={`dock-group ${f.collapsed ? "is-tabs" : ""}`} data-dock-group={key(f.collapsed ? f.target : f.path)} data-dock-collapsed={f.collapsed ? "1" : undefined}
                data-dock-mods={f.tabs.join(" ")} {...(live ? { "data-live-keys": "", tabIndex: -1 } : {})}>
                {head}
                {render(active)}
            </div>
        );
    };

    const node = (f) => {
        if (f.kind === "group") return group(f);
        const fi = f.children.findIndex((ch) => !ch.fixed);
        const out = [];
        f.children.forEach((ch, i) => {
            // A folding module (the No ar strip) eases in and out of its
            // place; gone, it takes no room and has no splitter beside it.
            const cls = ch.fold ? ` dock-fold${ch.gone ? " is-gone" : ""}` : "";
            out.push(
                <div key={firstOf(ch.frame)} className={`dock-cell${cls}`} aria-hidden={ch.gone || undefined} inert={ch.gone ? "" : undefined}
                    style={ch.fixed ? { flex: `0 0 ${Math.round(ch.size)}px` } : { flex: "1 1 0" }}>
                    {node(ch.frame)}
                </div>,
            );
            const next = f.children.findIndex((c, j) => j > i && !c.gone);
            if (ch.gone || next < 0) return;
            // A locked height (the No ar strip, Camadas) is the console's: no splitter beside it.
            if (ch.locked || f.children[next].locked) return;
            // One splitter per gap, owned by the fixed child on the side away
            // from the flexible one (dragging toward the flexible one grows it).
            const owner = i < fi ? i : next;
            const sign = i < fi ? 1 : -1;
            const size = f.children[owner].size;
            // A group of tabs made of several children: they all take the size.
            const { index, at = [index] } = f.children[owner];
            const resizeAll = (v) => at.reduce((d, j) => resizeChild(d, f.path, j, v), dock);
            out.push(
                <Split key={`s${i}`} horizontal={f.dir === "col"} size={size} sign={sign}
                    onSize={(v) => onDock(resizeAll(v))}
                    onReset={() => { const d = defaultSize(dock, f.path, index); if (d !== null) onDock(resizeAll(d)); }}
                    clamp={(v) => Math.round(v)} />,
            );
        });
        return <div className={`dock-split is-${f.dir}`}>{out}</div>;
    };

    return <div className="dock">{node(frame)}</div>;
}

