import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Split, onTabsKey } from "./kx";
import { MODULES, moveModules, hideModule, setActive, resizeChild, defaultSize, canTray, isPinned, rebaseDock, snapPct, dockMotion, easesBetween, PANEL_HEAD, dockLocked, resizeExact, evenExact } from "@/lib/console/dock";

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
// Every module under a frame, by name: what a splitter resizes (C-62).
const allNames = (f) => (f.kind === "group" ? f.tabs.map(nameOf) : f.children.flatMap((ch) => allNames(ch.frame)));

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

// Where a dragged module would land, over the page (owner 2026-10-15, Rodada
// D: never a filled box or a border round the target): a thick gold line
// on the edge it will dock against — a side of the panel, or under its
// header to join as a tab — with what letting go does beside it.
const LINE = 4;
export function DockHint({ drag }) {
    const t = drag?.target;
    const ghost = drag && <div className="dock-ghost" style={{ left: drag.x + 14, top: drag.y + 12 }} aria-hidden="true"><Icon name="grip" />{drag.label}</div>;
    if (!t) return ghost || null;
    const r = t.el.getBoundingClientRect();
    const inset = 6;
    const head = Math.min(PANEL_HEAD, r.height / 3);
    const line = {
        left: { left: r.left, top: r.top + inset, width: LINE, height: r.height - inset * 2 },
        right: { left: r.right - LINE, top: r.top + inset, width: LINE, height: r.height - inset * 2 },
        top: { left: r.left + inset, top: r.top, width: r.width - inset * 2, height: LINE },
        bottom: { left: r.left + inset, top: r.bottom - LINE, width: r.width - inset * 2, height: LINE },
        center: { left: r.left + inset, top: r.top + head, width: r.width - inset * 2, height: LINE },
    }[t.zone] || null;
    if (!line) return ghost || null;
    const vertical = t.zone === "left" || t.zone === "right";
    const label = vertical
        ? { left: t.zone === "left" ? line.left + LINE + 8 : undefined, right: t.zone === "right" ? window.innerWidth - line.left + 8 : undefined, top: line.top + line.height / 2 - 10 }
        : { left: line.left + line.width / 2, top: t.zone === "bottom" ? line.top - 26 : line.top + LINE + 6, transform: "translateX(-50%)" };
    return (
        <>
            <div className="dock-hint" style={line} aria-hidden="true" />
            <span className="dock-hint-label" style={label} aria-hidden="true">{t.label}</span>
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
// Setlist's Autoplay.
export function DockLockSwitch({ on, onChange }) {
    return (
        <button type="button" className="dock-lock" role="switch" aria-checked={Boolean(on)} aria-label="Travar fora da edição"
            title={on ? "Travada: fora de Editar disposição os divisores não se movem" : "Travar: fora de Editar disposição os divisores não se movem (nem com as setas, nem com o duplo clique)"} onClick={() => onChange(!on)}>
            <span className={`sw2 kx-switch kx-switch-sm ${on ? "is-on" : ""}`} aria-hidden="true" /><span>Travar fora da edição</span>
        </button>
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

// The console's modules where the dock puts them. `render(id, fold)`: the
// module's panel, with its fold chevron (`fold`: the frame's, with the
// module's name and `onFold`, null while editing; Panel); `onFold(id)`: a
// chevron or strip clicked (layout.folded, Rodada F4); `playerDocked`: the
// player rides the Programa (a chip of its own while editing);
// `onPickSplit(path)`: a splitter touched while editing (the split the
// banner's 50 · 50, 33 · 33 · 34, 25 · 50 · 25 act on, Rodada P4-2).
export default function DockView({ frame, dock, onDock, render, editing, dnd, onChipMenu, playerDocked, onFold, onPickSplit }) {
    // The tab in front of a group made of a split that does not fit (it is
    // not in the dock: a bigger screen splits it again).
    const [shown, setShown] = useState({});
    const box = useRef(null);
    useDockEase(box, frame, editing);
    useKeyingFlag();
    if (!frame) return null;

    const chip = (id) => {
        const home = id === "player" && playerDocked;
        const out = canTray(id) || (id === "player" && !home);
        // The No ar strip stays across the bottom (owner 2026-10-14): no drag, only ×.
        const pinned = isPinned(id);
        return (
            <span key={id} className="dock-chipwrap">
                <button type="button" className={`dock-chip ${pinned ? "is-pinned" : ""}`} onPointerDown={pinned ? undefined : (e) => dnd.start(e, { mods: [id], label: nameOf(id) })}
                    onClick={(e) => { if (!dnd.justDragged()) onChipMenu(e, id); }}
                    title={pinned ? `${nameOf(id)} fica sempre embaixo · × tira para a bandeja` : home ? "O player fica sob o Programa · arraste para pô-lo em outro lugar" : `Arraste ${nameOf(id)} para outro lugar · clique para Mover para…`}>
                    {nameOf(id)}{home ? <span className="kx-meta"> · sob o Programa</span> : pinned ? <span className="kx-meta"> · fixo embaixo</span> : null}
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
                    {!f.tabs.some(isPinned) && <span className="arr-grip" title="Arraste para mover o grupo inteiro" onPointerDown={(e) => dnd.start(e, { mods: f.tabs, label: f.tabs.map(nameOf).join(" + ") })}><Icon name="grip" /></span>}
                    {chips}
                </div>
            );
        } else if (f.tabs.length > 1) {
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
                data-dock-mods={f.tabs.join(" ")} data-dock-folded={fold?.on ? fold.dir : undefined} {...(live ? { "data-live-keys": "", tabIndex: -1 } : {})}>
                {head}
                {render(active, fold)}
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
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
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

