import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Icon, { iconSvg } from "./Icon";
import { Split, onTabsKey, DockEditCtx } from "./kx";
import { MODULES, moveModules, hideModule, setActive, resizeChild, defaultSize, canTray, isPinned, rebaseDock, snapPct, dockMotion, easesBetween, PANEL_HEAD, dockLocked, resizeExact, evenExact } from "@/lib/console/dock";

// Ver › Editar disposição for the culto environment (2026-10-13; the
// prototype "Disposição do console", model Livre): the console as a tree of
// splits and tab groups (src/lib/console/dock.js decides everything; these
// only draw it and report what the operator does).
//   - DockView draws a fitted frame (fitDock): splits with their splitters,
//     groups with their tabs. While editing (Rodada R, owner 2026-10-29,
//     R5) the panel's own header is the handle — the grip before its name,
//     the name a click for "Mover para…", the × where the fold sits — given
//     to the panel through DockEditCtx (kx.jsx Panel); the Programa, the
//     Prévia and the Bíblia's No ar, which have no header, get a 28 px one
//     for the edit only (R5a = B); a group of tabs keeps its strip, each
//     tab a chip that drags alone with its ×, the strip's grip the group.
//     No bar above the panels any more: the console in the edit is the
//     console as it is (the 34 px gold bar per group squeezed the locked
//     heights and showed a layout that was not the real one).
//   - useDockDrag moves modules by dragging, with pointer events (never
//     HTML5 drag and drop: the Setlist accepts any dragover, and a stage drag
//     must never start from a layout move). A drop on a group's middle makes
//     tabs, on a side splits; on the tray ([data-dock-tray]) hides.

const key = (path) => JSON.stringify(path);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const nameOf = (id) => MODULES[id]?.name || id;
// The first module in a frame: a stable React key for its cell.
const firstOf = (f) => (f.kind === "group" ? f.tabs[0] : firstOf(f.children[0].frame));
// Every module under a frame, by name: what a splitter resizes (C-62).
const allNames = (f) => (f.kind === "group" ? f.tabs.map(nameOf) : f.children.flatMap((ch) => allNames(ch.frame)));
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export const ZONE_LABEL = { center: "Juntar como aba", left: "Pôr à esquerda", right: "Pôr à direita", top: "Pôr em cima", bottom: "Pôr embaixo" };

// The side of a box the pointer is near (a quarter of the way in), else its middle.
export function pickZone(r, x, y) {
    const d = { left: (x - r.left) / r.width, right: (r.right - x) / r.width, top: (y - r.top) / r.height, bottom: (r.bottom - y) / r.height };
    const best = ["left", "right", "top", "bottom"].reduce((a, z) => (d[z] < d[a] ? z : a), "left");
    return d[best] < 0.25 ? best : "center";
}

// Where a drop would land, drawn over the page (Rodada R, R5): the half of
// the target the new panel would take, filled in gold, for a side; a ring
// on the target's header for its middle (a tab); a ring on the tray. The
// label says what letting go does. Viewport px.
export function dropBox(t) {
    const r = t.el.getBoundingClientRect();
    if (t.kind === "tray") return { left: r.left, top: r.top, width: r.width, height: r.height, ring: true };
    if (t.zone === "center") {
        const h = t.el.querySelector(":scope > .dock-tabs, :scope > .kx-panel > .kx-panel-h");
        const hb = h ? h.getBoundingClientRect().bottom - r.top : PANEL_HEAD;
        return { left: r.left, top: r.top, width: r.width, height: clamp(hb, 24, r.height), ring: true };
    }
    const w = r.width / 2, h = r.height / 2;
    return {
        left: { left: r.left, top: r.top, width: w, height: r.height },
        right: { left: r.left + w, top: r.top, width: w, height: r.height },
        top: { left: r.left, top: r.top, width: r.width, height: h },
        bottom: { left: r.left, top: r.top + h, width: r.width, height: h },
    }[t.zone];
}

// What the drag draws: a card under the pointer and the drop region, both
// on <body>, moved by `transform` in requestAnimationFrame (dragGhost.js's
// way) — never React state per pointermove, which re-rendered the console.
function beginDrag(p) {
    const ghost = document.createElement("div");
    ghost.className = "dock-ghost";
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.width = `${p.w}px`;
    ghost.innerHTML = iconSvg("grip");
    const name = document.createElement("span");
    name.className = "dock-ghost-t";
    name.textContent = p.label;
    ghost.appendChild(name);
    if (p.mods.length > 1) { const n = document.createElement("span"); n.className = "dock-ghost-n"; n.textContent = String(p.mods.length); ghost.appendChild(n); }
    const region = document.createElement("div");
    region.className = "dock-drop";
    region.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "dock-drop-label";
    region.appendChild(label);
    document.body.append(region, ghost);
    document.documentElement.dataset.dockDragging = "";
    // The panels that go with the drag fade where they are (the source).
    const src = [...document.querySelectorAll(".console [data-dock-mods]")].filter((g) => g.dataset.dockMods.split(" ").every((m) => p.mods.includes(m)));
    for (const g of src) g.dataset.dockSrc = "";
    return { ghost, region, label, src, raf: 0, shown: false, tray: null };
}

function paintDrag(ui, p, t) {
    ui.ghost.style.transform = `translate(${Math.round(p.cx - p.dx)}px, ${Math.round(p.cy - p.dy)}px) rotate(-2deg)`;
    const tray = t?.kind === "tray" ? t.el : null;
    if (ui.tray !== tray) { ui.tray?.classList.remove("is-drop"); tray?.classList.add("is-drop"); ui.tray = tray; }
    if (!t) { ui.region.classList.remove("is-on"); ui.shown = false; return; }
    const b = dropBox(t);
    ui.label.textContent = t.label;
    // The first region of a drag lands at once; then it glides between targets.
    if (!ui.shown) ui.region.classList.add("is-snap");
    ui.region.classList.toggle("is-ring", Boolean(b.ring));
    ui.region.style.transform = `translate(${Math.round(b.left)}px, ${Math.round(b.top)}px)`;
    ui.region.style.width = `${Math.round(b.width)}px`;
    ui.region.style.height = `${Math.round(b.height)}px`;
    ui.region.classList.add("is-on");
    if (!ui.shown) { void ui.region.offsetWidth; ui.region.classList.remove("is-snap"); ui.shown = true; }
}

// The groups' boxes, by module (a group's active one first): FLIP's "first".
function groupRects() {
    const m = new Map();
    for (const g of document.querySelectorAll(".console [data-dock-mods]")) {
        const r = g.getBoundingClientRect();
        for (const id of g.dataset.dockMods.split(" ")) if (!m.has(id) || g.dataset.dockActive === id) m.set(id, r);
    }
    return m;
}

// After a drop, each panel slides from where it was to its new place
// (FLIP: translate and scale back to none) in --dur-fold with --ease-fold;
// one that was not on screen (from the tray), or whose shape changed too
// much to scale, fades in. Reduced motion: the cut.
function flipFrom(before) {
    if (reduced()) return;
    const css = getComputedStyle(document.documentElement);
    const duration = parseFloat(css.getPropertyValue("--dur-fold")) || 180;
    const easing = css.getPropertyValue("--ease-fold").trim() || "cubic-bezier(0.32, 0.72, 0, 1)";
    for (const g of document.querySelectorAll(".console [data-dock-mods]")) {
        const old = before.get(g.dataset.dockActive);
        const now = g.getBoundingClientRect();
        if (!now.width || !now.height) continue;
        if (!old) { g.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing }); continue; }
        const dx = old.left - now.left, dy = old.top - now.top, sx = old.width / now.width, sy = old.height / now.height;
        if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
        if (Math.max(sx, sy, 1 / sx, 1 / sy) > 3) { g.animate([{ opacity: 0 }, { opacity: 1 }], { duration, easing }); continue; }
        g.animate([
            { transformOrigin: "0 0", transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})` },
            { transformOrigin: "0 0", transform: "none" },
        ], { duration, easing });
    }
}

// The drag ends: the card settles into the region (a drop) or fades (none,
// Esc), the region fades; `apply` changes the dock, then the panels slide.
function endDrag(ui, t, apply) {
    cancelAnimationFrame(ui.raf);
    ui.tray?.classList.remove("is-drop");
    delete document.documentElement.dataset.dockDragging;
    for (const g of ui.src) delete g.dataset.dockSrc;
    const box = t ? dropBox(t) : null;
    if (t) {
        const before = groupRects();
        flushSync(apply);
        flipFrom(before);
    }
    if (reduced()) { ui.ghost.remove(); ui.region.remove(); return; }
    ui.ghost.classList.add("is-gone");
    if (box) ui.ghost.style.transform = `translate(${Math.round(box.left + 8)}px, ${Math.round(box.top + 4)}px)`;
    ui.region.classList.remove("is-on");
    setTimeout(() => { ui.ghost.remove(); ui.region.remove(); }, 220);
}

// Dragging modules to a new place. `onDock(next)`: a drop that changes the dock.
// -> { start(e, { mods, label, fromTray }), justDragged() }
export function useDockDrag({ dock, onDock }) {
    const pend = useRef(null);
    const ended = useRef(0);
    const live = useRef({ dock, onDock });
    live.current = { dock, onDock };

    // The target under (x, y): { kind, el, zone, label, next } or null. The
    // dock does not change during a drag, so a target is worked out once
    // per group and zone (moveModules is not cheap at pointer rate).
    const findTarget = (x, y, p) => {
        const d = live.current.dock;
        const el = document.elementFromPoint(x, y);
        if (!el) return null;
        const tray = el.closest("[data-dock-tray]");
        const ge = tray ? null : el.closest("[data-dock-group]");
        const at = tray || ge;
        if (!at) return null;
        const zone = tray ? "tray" : ge.dataset.dockCollapsed ? "center" : pickZone(ge.getBoundingClientRect(), x, y);
        if (p.hit && p.hit.at === at && p.hit.zone === zone) return p.hit.target;
        let target = null;
        if (tray) {
            const next = p.fromTray ? d : moveModules(d, p.mods, { kind: "tray" });
            if (!same(next, d)) target = { kind: "tray", el: tray, zone: "center", label: p.mods.includes("player") ? "Voltar para baixo do Programa" : "Tirar para a bandeja", next };
        } else {
            const r = ge.getBoundingClientRect();
            const px = Math.round((zone === "left" || zone === "right" ? r.width : r.height) / 2);
            const next = moveModules(d, p.mods, { kind: "group", path: JSON.parse(ge.dataset.dockGroup), zone }, { px });
            if (!same(next, d)) target = { kind: "group", el: ge, zone, label: ZONE_LABEL[zone], next };
        }
        p.hit = { at, zone, target };
        return target;
    };

    useEffect(() => {
        const frame = () => {
            const p = pend.current;
            if (!p?.ui) return;
            p.ui.raf = 0;
            paintDrag(p.ui, p, findTarget(p.cx, p.cy, p));
        };
        const move = (e) => {
            const p = pend.current;
            if (!p) return;
            p.cx = e.clientX; p.cy = e.clientY;
            if (!p.moved) {
                if (Math.hypot(p.cx - p.x, p.cy - p.y) < 5) return;
                p.moved = true;
                p.ui = beginDrag(p);
            }
            if (!p.ui.raf) p.ui.raf = requestAnimationFrame(frame);
        };
        const finish = (drop) => {
            const p = pend.current;
            pend.current = null;
            if (!p?.moved) return;
            ended.current = Date.now();
            const t = drop ? findTarget(p.cx, p.cy, p) : null;
            endDrag(p.ui, t, () => live.current.onDock(t.next));
        };
        const up = (e) => {
            if (pend.current?.moved) { pend.current.cx = e.clientX; pend.current.cy = e.clientY; }
            finish(true);
        };
        const cancel = () => finish(false);
        // Esc while dragging: the drag ends, nothing else (not the edit mode).
        const esc = (e) => {
            if (e.key !== "Escape" || !pend.current?.moved) return;
            e.preventDefault();
            e.stopImmediatePropagation();
            finish(false);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
        window.addEventListener("pointercancel", cancel);
        window.addEventListener("keydown", esc, true);
        return () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            window.removeEventListener("pointercancel", cancel);
            window.removeEventListener("keydown", esc, true);
            if (pend.current?.ui) finish(false);
        };
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // The card is the size of what was grabbed (the panel's header, the tab
    // strip for its grip, else the chip), held where the pointer took it.
    const start = (e, payload) => {
        if (e.button !== 0) return;
        const el = e.currentTarget;
        const box = el.closest?.(".kx-panel-h") || (el.classList?.contains("dock-grip") && el.closest?.(".dock-tabs")) || el;
        const r = box.getBoundingClientRect();
        const w = clamp(r.width, 120, 280);
        pend.current = { ...payload, x: e.clientX, y: e.clientY, cx: e.clientX, cy: e.clientY, moved: false, w, dx: clamp(e.clientX - r.left, 12, w - 12), dy: 15 };
    };
    // A click right after a drag is the drag's end, not a click.
    const justDragged = () => Date.now() - ended.current < 300;
    return { start, justDragged };
}

// The modules in the tray, for the edit banner: drag one back, or click it
// for "Mover para…". A drop on it while dragging lights it.
export function DockTray({ dock, dnd, onChipMenu }) {
    return (
        <div className="dock-tray" data-dock-tray="" title="Solte um módulo aqui para tirá-lo do console">
            <span className="kx-meta">Bandeja</span>
            {dock.hidden.length ? dock.hidden.map((id) => (
                <button key={id} type="button" className="dock-chip" onPointerDown={isPinned(id) ? undefined : (e) => dnd.start(e, { mods: [id], label: nameOf(id), fromTray: true })}
                    onClick={(e) => { if (!dnd.justDragged()) onChipMenu(e, id); }} title={isPinned(id) ? `Clique para voltar ${nameOf(id)} à faixa embaixo` : `Arraste para pôr ${nameOf(id)} no console · clique para escolher onde`}>
                    {!isPinned(id) && <Icon name="grip" />}{nameOf(id)}
                </button>
            )) : <span className="kx-meta">vazia</span>}
        </div>
    );
}

// Travar fora da edição (owner 2026-10-22, Rodada P4-1 = A), in the edit
// banner: the environment on screen's switch (dock.js setDockLock). On,
// the splitters only move in Editar disposição. The small switch, as the
// Setlist's Autoplay; "Travar" on screen, the whole name for the reader.
export function DockLockSwitch({ on, onChange }) {
    return (
        <button type="button" className="dock-lock" role="switch" aria-checked={Boolean(on)} aria-label="Travar fora da edição"
            title={on ? "Travada: fora de Editar disposição os divisores não se movem" : "Travar fora da edição: fora de Editar disposição os divisores não se movem (nem com as setas, nem com o duplo clique)"} onClick={() => onChange(!on)}>
            <span className={`sw2 kx-switch kx-switch-sm ${on ? "is-on" : ""}`} aria-hidden="true" /><span>Travar</span>
        </button>
    );
}

// The named arrangement being edited, in the edit banner (dockPresets.js):
// one button with its name (and whether it changed) whose menu (`openMenu`,
// the console's) has Salvar over it, Salvar como… a new one, Excluir…;
// naming one takes the field in its place. Switching between them is in Ver.
export function DockPresetsBar({ preset, changed, onSave, onSaveAs, onDelete, problemOf, openMenu }) {
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
    const name = preset ? preset.name : "Padrão";
    const menu = (e) => openMenu(e, { title: `Disposição: ${name}${changed ? " · alterada" : ""}`, items: [
        preset && changed && { label: `Salvar em “${preset.name}”`, icon: "save", onSelect: onSave },
        { label: "Salvar como…", icon: "plus", onSelect: () => setNaming(""), title: "Salvar a disposição como está, com um nome, para trocar depois em Ver" },
        preset && { label: "Excluir…", icon: "trash", onSelect: onDelete },
    ].filter(Boolean) });
    return (
        <button type="button" className="kx-btn kx-t dock-preset-btn" aria-haspopup="menu" onClick={menu} title="A disposição em edição: salvar, salvar com outro nome, excluir">
            <span className="kx-meta">Disposição:</span> <b className="dock-preset-name">{name}</b>{changed ? <span className="kx-meta"> · alterada</span> : null}<Icon name="chevron-down" />
        </button>
    );
}

// The console's modules where the dock puts them. `render(id, fold)`: the
// module's panel, with its fold chevron (`fold`: the frame's, with the
// module's name and `onFold`, null while editing; Panel); `onFold(id)`: a
// chevron or strip clicked (layout.folded, Rodada F4); `playerDocked`: the
// player rides the Programa (a chip of its own on the Programa's header
// while editing); `onPickSplit(path)`: a splitter touched while editing
// (the split the banner's 50 · 50, 33 · 33 · 34, 25 · 50 · 25 act on,
// Rodada P4-2).
export default function DockView({ frame, dock, onDock, render, editing, dnd, onChipMenu, playerDocked, onFold, onPickSplit }) {
    // The tab in front of a group made of a split that does not fit (it is
    // not in the dock: a bigger screen splits it again).
    const [shown, setShown] = useState({});
    const box = useRef(null);
    useDockEase(box, frame, editing);
    useKeyingFlag();
    if (!frame) return null;

    // Editing: what takes a module out — the tray, or the player home.
    const outOf = (id) => {
        const home = id === "player" && playerDocked;
        if (!(canTray(id) || (id === "player" && !home))) return null;
        return id === "player"
            ? { title: "Voltar o player para baixo do Programa", run: () => onDock(moveModules(dock, ["player"], { kind: "home" })) }
            : { title: `Tirar ${nameOf(id)} para a bandeja`, run: () => onDock(hideModule(dock, id)) };
    };
    const drag = (id) => (isPinned(id) ? null : (e) => dnd.start(e, { mods: [id], label: nameOf(id) }));
    const menu = (id) => (e) => { if (!dnd.justDragged()) onChipMenu(e, id); };
    // The player docked under the Programa: a chip on the Programa's header.
    const playerChip = (
        <button type="button" className="dock-chip" onPointerDown={drag("player")} onClick={menu("player")} title="O player fica sob o Programa · arraste para pô-lo em outro lugar">
            <Icon name="grip" />Player<span className="kx-meta"> · sob o Programa</span>
        </button>
    );
    // The edit header a module's panel draws (kx.jsx DockEditHead). In a
    // group of tabs the × rides each tab's chip instead.
    const editOf = (id, inTabs) => {
        const out = inTabs ? null : outOf(id);
        return {
            name: nameOf(id), grip: drag(id), onMenu: menu(id),
            onX: out?.run || null, xTitle: out?.title,
            extra: id === "programa" && playerDocked ? playerChip : null,
        };
    };

    const group = (f) => {
        const k = key(f.path);
        const active = f.collapsed ? (f.tabs.includes(shown[k]) ? shown[k] : f.active) : f.active;
        const pick = (id) => (f.collapsed ? setShown((s) => ({ ...s, [k]: id })) : onDock(setActive(dock, f.path, id)));
        const live = f.tabs.includes("previa") || f.tabs.includes("abas");
        const tabs = f.tabs.length > 1;
        let head = null;
        if (tabs && editing) {
            // The strip stays: its grip drags the group, each tab drags alone
            // (a click still shows it), its × takes it out.
            head = (
                <div className="dock-tabs is-edit" role="group" aria-label={`Grupo: ${f.tabs.map(nameOf).join(", ")}`}>
                    {!f.tabs.some(isPinned) && <span className="dock-grip" title="Arraste para mover o grupo inteiro" onPointerDown={(e) => dnd.start(e, { mods: f.tabs, label: f.tabs.map(nameOf).join(" + ") })}><Icon name="grip" /></span>}
                    {f.tabs.map((id) => {
                        const out = outOf(id);
                        return (
                            <span key={id} className={`dock-tabchip ${id === active ? "is-on" : ""}`}>
                                <button type="button" className={`dock-tab is-chip ${id === active ? "is-on" : ""}`} aria-pressed={id === active} onPointerDown={drag(id) || undefined}
                                    onClick={() => { if (!dnd.justDragged()) pick(id); }} title={`Arraste ${nameOf(id)} para outro lugar · clique para mostrar`}>
                                    {MODULES[id]?.icon && <Icon name={MODULES[id].icon} className="dock-tab-i" />}{nameOf(id)}
                                </button>
                                {out && <button type="button" className="dock-x" title={out.title} aria-label={out.title} onClick={out.run}><Icon name="x" /></button>}
                            </span>
                        );
                    })}
                </div>
            );
        } else if (tabs) {
            head = (
                <div className="dock-tabs" role="tablist" onKeyDown={onTabsKey}>
                    {f.tabs.map((id) => (
                        <button key={id} type="button" role="tab" aria-selected={id === active} tabIndex={id === active ? 0 : -1} className={`dock-tab ${id === active ? "is-on" : ""}`} onClick={() => pick(id)}>{MODULES[id]?.icon && <Icon name={MODULES[id].icon} className="dock-tab-i" />}{nameOf(id)}</button>
                    ))}
                </div>
            );
        }
        const fold = !editing && f.fold && onFold ? { ...f.fold, name: nameOf(active), onFold: () => onFold(active) } : null;
        return (
            <div className={`dock-group ${f.collapsed ? "is-tabs" : ""}`} data-dock-group={key(f.collapsed ? f.target : f.path)} data-dock-collapsed={f.collapsed ? "1" : undefined}
                data-dock-mods={f.tabs.join(" ")} data-dock-active={active} data-dock-folded={fold?.on ? fold.dir : undefined} {...(live ? { "data-live-keys": "", tabIndex: -1 } : {})}>
                {head}
                {/* Always a provider, so entering the edit never remounts the panel. */}
                <DockEditCtx.Provider value={editing ? editOf(active, tabs) : null}>
                    {render(active, fold)}
                </DockEditCtx.Provider>
            </div>
        );
    };

    // Por % (Editar disposição, owner 2026-10-15): a splitter works on the
    // sizes as drawn in this box (rebaseDock) and snaps to PCT_STEP %.
    const pct = dock?.mode === "pct";
    const base = () => (pct ? rebaseDock(dock, frame.w, frame.h) : dock);
    // Travar fora da edição (Rodada P4-1): outside the edit, plain gaps.
    const still = dockLocked(dock) && !editing;
    const gap = (k, dir) => <div key={k} className={`dock-gap is-${dir}`} aria-hidden="true" />;
    const pick = editing && onPickSplit ? (f) => () => onPickSplit(f.path) : () => undefined;
    // Exato (Rodada P4-2): the gap between two open children trades weight
    // between them (resizeExact); a locked or folded neighbour is skipped,
    // so the gap moves the open ones on either side of it (the gap past it
    // trades the same pair: only the first one carries the % badge).
    const open = (ch) => ch && !ch.gone && !ch.locked && !ch.folded;
    const exactSplit = (f, i, next) => {
        let a = i;
        while (a >= 0 && !open(f.children[a])) a--;
        let b = next;
        while (b < f.children.length && !open(f.children[b])) b++;
        if (a < 0 || b >= f.children.length) return gap(`g${i}`, f.dir);
        const ca = f.children[a];
        const share = f.wsum > 0 ? Math.round((ca.weight / f.wsum) * 100) : null;
        return (
            <Split key={`s${i}`} horizontal={f.dir === "col"} size={ca.size} sign={1} onPick={pick(f)}
                name={`${f.dir === "row" ? "Largura" : "Altura"} · ${allNames(ca.frame).join(", ")} e ${allNames(f.children[b].frame).join(", ")}`}
                value={share ?? undefined} min={0} max={100} valueText={share !== null ? `${share}%` : undefined}
                onSize={(v) => onDock(resizeExact(dock, f, a, b, v))}
                onReset={() => onDock(evenExact(dock, f, a, b))}
                clamp={(v) => Math.round(v)}
                label={editing && share !== null && a === i ? `${share}%` : null}
                onPercent={(n) => { if (Number.isFinite(n)) onDock(resizeExact(dock, f, a, b, (Math.max(1, Math.min(99, n)) / 100) * f.room, 0)); }} />
        );
    };

    const node = (f) => {
        if (f.kind === "group") return group(f);
        const fi = f.children.findIndex((ch) => !ch.fixed);
        const out = [];
        f.children.forEach((ch, i) => {
            // A folding module (the No ar strip) eases in and out of its
            // place; gone, it takes no room and has no splitter beside it.
            const cls = `${ch.fold ? ` dock-fold${ch.gone ? " is-gone" : ""}` : ""}${ch.locked ? " dock-locked" : ""}${ch.folded ? " dock-folded" : ""}`;
            out.push(
                <div key={firstOf(ch.frame)} className={`dock-cell${cls}`} aria-hidden={ch.gone || undefined} inert={ch.gone ? "" : undefined} data-ease={`${JSON.stringify(f.path)}/${ch.at.join(",")}`}
                    style={ch.fixed ? { flex: `0 0 ${Math.round(ch.size)}px` } : { flex: "1 1 0" }}>
                    {node(ch.frame)}
                </div>,
            );
            const next = f.children.findIndex((c, j) => j > i && !c.gone);
            if (ch.gone || next < 0) return;
            if (still) { out.push(gap(`g${i}`, f.dir)); return; }
            if (f.exact) { out.push(exactSplit(f, i, next)); return; }
            // One splitter per gap, owned by the fixed child on the side away
            // from the flexible one (dragging toward the flexible one grows it).
            const owner = i < fi ? i : next;
            // A locked height (the No ar strip, Camadas, a folded panel) is
            // the console's: the gap it owns stays, without a handle (owner
            // 2026-10-14); a neighbour's splitter still moves it, whole.
            if (f.children[owner].locked) {
                out.push(gap(`g${i}`, f.dir));
                return;
            }
            const sign = i < fi ? 1 : -1;
            const size = f.children[owner].size;
            // A group of tabs made of several children: they all take the size.
            const { index, at = [index] } = f.children[owner];
            // While editing, the splitter says the owner's size in % of the
            // split, and a click lets one type it (owner 2026-10-14).
            const total = f.dir === "row" ? f.w : f.h;
            const resizeAll = (v) => { const px = pct ? snapPct(v, total) : v; return at.reduce((d, j) => resizeChild(d, f.path, j, px), base()); };
            const share = total > 0 ? Math.round((size / total) * 100) : null;
            out.push(
                <Split key={`s${i}`} horizontal={f.dir === "col"} size={size} sign={sign} onPick={pick(f)}
                    name={`${f.dir === "row" ? "Largura" : "Altura"} · ${allNames(f.children[owner].frame).join(", ")}`}
                    value={share ?? undefined} min={share !== null ? 0 : undefined} max={share !== null ? 100 : undefined} valueText={share !== null ? `${share}%` : undefined}
                    onSize={(v) => onDock(resizeAll(v))}
                    onReset={() => { const d = defaultSize(dock, f.path, index); if (d !== null) onDock(resizeAll(d)); }}
                    clamp={(v) => Math.round(v)}
                    label={editing && share !== null ? `${share}%` : null}
                    onPercent={(n) => { if (Number.isFinite(n) && total > 0) onDock(resizeAll(Math.round((Math.max(1, Math.min(99, n)) / 100) * total))); }} />,
            );
        });
        return <div className={`dock-split is-${f.dir}`}>{out}</div>;
    };

    return <div className="dock" ref={box}>{node(frame)}</div>;
}

// Easing the dock (POL-01): a panel folded or opened, the No ar strip
// coming or going, a measured height changing (dockMotion) — every cell
// whose size changed goes from the size it had to the new one together,
// along its split, with one Web Animation each (its flex pinned to pixels,
// then back to its own flex), so a neighbour that turns flexible or fixed
// never collapses to 0 and opening eases like folding. Interrupted, a cell
// starts again from where it is drawn. Nothing eases for a moment after
// the dock appears (the first measured heights land at once, POL-07),
// while editing the arrangement, or with reduced motion.
const SETTLE_MS = 1000;

// The keys walking a list (arrows, a clicker's PageUp/PageDown, outside a
// text field) mark the page until the pointer moves: console.css then
// shows no hover on the slide that scrolls under a resting pointer (POL-09).
const WALK_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown"]);
function useKeyingFlag() {
    useEffect(() => {
        const html = document.documentElement;
        const typing = (t) => t?.closest?.("input, textarea, select, [contenteditable=''], [contenteditable='true']");
        const down = (e) => { if (WALK_KEYS.has(e.key) && !typing(e.target)) html.dataset.keying = ""; };
        const move = () => { if ("keying" in html.dataset) delete html.dataset.keying; };
        window.addEventListener("keydown", down, true);
        window.addEventListener("pointermove", move, true);
        return () => { window.removeEventListener("keydown", down, true); window.removeEventListener("pointermove", move, true); move(); };
    }, []);
}
const running = new WeakMap(); // cell -> its running Animation

function useDockEase(box, frame, editing) {
    const prev = useRef(null);
    const born = useRef(0);
    useEffect(() => { born.current = performance.now(); }, []);
    useLayoutEffect(() => {
        const was = prev.current;
        const now = frame ? dockMotion(frame) : null;
        prev.current = now;
        const root = box.current;
        if (!root || !now) return;
        // Any other render (the clock, the live state) leaves an ease alone.
        if (was && was.w === now.w && was.h === now.h && was.motion === now.motion) return;
        const cells = [...root.querySelectorAll("[data-ease]")];
        // Where each cell still easing is drawn right now (all read before
        // any stops, so one stopping does not move the others), then stop them.
        const at = new Map();
        const busy = cells.filter((el) => running.has(el));
        for (const el of busy) {
            const r = el.getBoundingClientRect();
            at.set(el, el.parentElement?.classList.contains("is-row") ? r.width : r.height);
        }
        for (const el of busy) {
            running.get(el).cancel();
            running.delete(el);
            delete el.dataset.easing;
        }
        // A splitter held by the hand: the cells follow it frame by frame.
        if ("resizing" in document.documentElement.dataset) return;
        if (!easesBetween(was, now) || editing || reduced() || performance.now() - born.current < SETTLE_MS) return;
        const css = getComputedStyle(root);
        const ms = parseFloat(css.getPropertyValue("--dur-fold")) || 180;
        const curve = css.getPropertyValue("--ease-fold").trim() || "cubic-bezier(0.32, 0.72, 0, 1)";
        for (const el of cells) {
            const k = el.dataset.ease;
            const from = at.has(el) ? at.get(el) : was.sizes[k];
            const to = now.sizes[k];
            if (!Number.isFinite(from) || !Number.isFinite(to) || Math.abs(from - to) < 1) continue;
            const px = (v) => ({ flexGrow: 0, flexShrink: 0, flexBasis: `${Math.max(0, Math.round(v))}px` });
            const a = el.animate([px(from), px(to)], { duration: ms, easing: curve });
            running.set(el, a);
            el.dataset.easing = "";
            a.onfinish = () => { if (running.get(el) === a) { running.delete(el); delete el.dataset.easing; } };
        }
    }, [box, frame, editing]);
}

