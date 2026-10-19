import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import Icon from "./Icon";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { tabStep } from "@/lib/console/tablist";
export { tabStop } from "@/lib/console/tablist";

// The kx- components of docs/design-system/components/bundle.css as React
// pieces: a module, its header, buttons, a field, a row, a monitor, a
// splitter. Visual rules live in the stylesheet; these only lay out markup.

// `bare`: no card (kx-panel-bare), the module sits on the console's ground
// (the Programa, the Prévia); with nothing for it, the header is left out.
// `fold`: the dock's (Dock.jsx; dock.js fitDock, owner 2026-10-16, Rodada
// F4) — the chevron right of the header's +; folded down a column the panel
// is its header, across a row a strip with its name standing (FoldStrip).
// Folded, the body stays mounted, hidden, so it comes back as it was.
export function Panel({ title, count, lead, caption, actions, fold, bare = false, noHead = false, className = "", style, children, bodyStyle }) {
    // `noHead`: the card without its header line — a window page whose
    // title and tools ride the win-bar (Rodada C).
    const head = !noHead && (!bare || title || caption || actions || lead || fold);
    const strip = foldStrip(fold);
    // A screen reader's map of the console (C-28): each panel is a region
    // named by its title, and the title a heading to jump between panels.
    const headId = useId();
    const named = head && !strip && Boolean(caption || title);
    return (
        <div className={`kx-panel ${bare ? "kx-panel-bare" : ""} ${fold?.on ? "is-collapsed" : ""} ${strip ? "kx-strip" : ""} ${className}`} style={style}
            role={named || (strip && fold.name) ? "region" : undefined} aria-labelledby={named ? headId : undefined} aria-label={strip ? fold.name || undefined : undefined}>
            {strip ? <FoldStrip fold={fold} /> : head && <div className="kx-panel-h">
                {lead}
                {caption ? <span className="kx-panel-cap" id={headId} role="heading" aria-level={2}>{caption}</span> : <span className="kx-section" id={title ? headId : undefined} role={title ? "heading" : undefined} aria-level={title ? 2 : undefined}>{title}{count ? <span className="kx-count"> · {count}</span> : null}</span>}
                {actions}
                <FoldBtn fold={fold} />
            </div>}
            <div className="kx-panel-b" style={strip ? FOLDED_BODY : bodyStyle} inert={fold?.on ? "" : undefined}>{children}</div>
        </div>
    );
}
// A body folded across a row (the strip): hidden over any display a panel
// gives its body inline. Folded down a column it stays, inert and fading out
// (console.css), so the panel closes over its content instead of emptying first.
const FOLDED_BODY = { display: "none" };

// Folded across a row: the panel is a strip (Panel, TabsPanel).
export const foldStrip = (fold) => Boolean(fold?.on && fold.dir === "row");

// A panel's fold chevron (Rodada F4): up while open, turned while folded.
// The last open panel of a split keeps it, inert, with the reason (a
// disabled button would hide its tooltip).
const FOLD_LAST = { col: "Um painel da coluna fica sempre aberto", row: "Um painel da linha fica sempre aberto" };
export function FoldBtn({ fold }) {
    if (!fold) return null;
    const stuck = !fold.on && !fold.can;
    return (
        <IconBtn name="chevron-up" small className={`kx-fold ${fold.on ? "is-folded" : ""} ${stuck ? "is-stuck" : ""}`}
            title={stuck ? FOLD_LAST[fold.dir] || FOLD_LAST.col : fold.on ? "Abrir" : "Dobrar"} aria-expanded={!fold.on} aria-disabled={stuck || undefined}
            onClick={stuck ? undefined : fold.onFold} />
    );
}

// A panel folded across a row (.kx-strip, dock.js FOLD_STRIP px wide): in
// its header's place, the chevron over the module's name standing up; a
// click anywhere on it opens the panel.
export function FoldStrip({ fold }) {
    return (
        <button type="button" className="kx-strip-b kx-t" onClick={fold.onFold} title="Abrir" aria-label={`Abrir ${fold.name || "o painel"}`} aria-expanded="false">
            <span className="kx-fold is-folded"><Icon name="chevron-up" /></span>
            <span className="kx-strip-name kx-section">{fold.name}</span>
        </button>
    );
}

export function Btn({ kind = "", small, on, className = "", children, ...rest }) {
    const cls = `kx-btn kx-t ${kind ? `kx-btn-${kind}` : ""} ${on ? "is-on" : ""} ${className}`;
    // Small buttons are still 24 px tall: the minimum pointer target (WCAG 2.2).
    // A button with on/off (on given) says so to screen readers.
    return <button type="button" className={cls} style={small ? { height: 24, padding: "0 6px" } : undefined} aria-pressed={typeof on === "boolean" ? on : undefined} {...rest}>{children}</button>;
}

// The window frame's bar (owner 2026-10-14, Rodada C: every floating page
// has the Configurações frame). The console provides the navigation through
// WinCtx — the Voltar chip (level 2 on: "← where it came from", as Esc),
// the (x) "Fechar · Esc" that closes the whole stack — and the page brings
// its own title, context (`sub`, muted), tools (the page's search, filters)
// and actions (Salvar, Cancelar). There is no "← Console" any more: the
// first level's Esc and (x) just close. A double click on the bar's empty
// area gives the window its default size back (onResetSize, Rodada D3).
// The ⧉ "Destacar em janela" (Rodada F5, every page): the host gives
// onDetach when the page can move to a window of its own (nav.js
// detachSpec); a detached window gives none (`detached` instead).
export const WinCtx = createContext(null);
export function WinBar({ title, sub, tools, actions, detach }) {
    const w = useContext(WinCtx) || {};
    const onDetach = detach || w.onDetach;
    return (
        <div className="win-bar" onDoubleClick={(e) => { if (e.target === e.currentTarget || e.target.classList?.contains("win-gap")) w.onResetSize?.(); }}>
            {w.back && (
                <button type="button" className="kx-btn kx-btn-outline kx-btn-back kx-t" onClick={w.onBack} title={`Voltar a ${w.back} · Esc`}>
                    <Icon name="arrow-left" />{w.back}
                </button>
            )}
            {/* Where the focus lands when the page opens with the mouse, or
                has no control (C-12): inside the window, holding no keys. */}
            <span className="kx-section win-title" title={sub ? `${title} · ${sub}` : title} tabIndex={-1} data-live-keys="">{title}{sub ? <span className="kx-count"> · {sub}</span> : null}</span>
            {tools && <span className="win-tools">{tools}</span>}
            <span className="win-gap" />
            {actions}
            {onDetach && <IconBtn name="external" title="Destacar em janela: esta página numa janela própria, para usar vendo outra tela" onClick={onDetach} />}
            {!w.systemFrame && <IconBtn name="x" title="Fechar · Esc" onClick={w.onCloseAll} />}
        </div>
    );
}

// A detached page (/Janela, Rodada F5) with unsaved changes holds its
// window: closing it asks first (beforeunload; on the desktop the main
// process asks, electron/closeGuard.cjs askLeave). In the console's window
// the page's own guard asks, so this does nothing there.
export function useUnloadGuard(dirty) {
    const w = useContext(WinCtx);
    const on = Boolean(dirty && w?.detached);
    useEffect(() => {
        if (!on) return undefined;
        const guard = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
    }, [on]);
}

export function IconBtn({ name, title, small, on, className = "", ...rest }) {
    const size = small ? { height: 24, width: 24 } : undefined;
    // A toggle says whether it is on (as Btn does); a button whose `on` only
    // means its menu or popover is open says that with aria-expanded instead.
    const opens = rest["aria-expanded"] !== undefined || Boolean(rest["aria-haspopup"]);
    return (
        <button type="button" className={`kx-btn kx-btn-icon kx-t ${on ? "is-on" : ""} ${className}`} style={size} aria-label={title} title={title} aria-pressed={typeof on === "boolean" && !opens ? on : undefined} {...rest}>
            <Icon name={name} />
        </button>
    );
}

// A number with − and + (Rodada HF2: the theme's size, line and letter
// spacing, outline): `− [4,8] + %`, 24 px tall (the mockup's order). The field takes a typed
// number (a comma counts as the decimal point) and commits it on Enter or
// when it loses the focus, clamped to [min, max] and rounded to `step`;
// ↑/↓ and the buttons step (Shift ×10). `value` "" or null shows `empty`
// (the value that draws when nothing is set) and onChange gets numbers only.
const decimals = (step) => (String(step).split(".")[1] || "").length;
export function NumBox({ value, onChange, min, max, step = 1, unit = "", label, empty = min, className = "", disabled = false }) {
    const shown = value === "" || value == null || !Number.isFinite(Number(value)) ? Number(empty) : Number(value);
    const fmt = (n) => n.toFixed(decimals(step)).replace(".", ",");
    const [text, setText] = useState(null); // what is typed, while typing
    const fit = (n) => Math.min(max, Math.max(min, Math.round(n / step) * step));
    const commit = (n) => { const v = Number(fit(n).toFixed(decimals(step))); if (v !== shown || value === "" || value == null) onChange(v); };
    const bump = (dir, e) => commit(shown + dir * step * (e?.shiftKey ? 10 : 1));
    const typed = () => {
        if (text === null) return;
        const n = Number(text.trim().replace(",", "."));
        setText(null);
        if (text.trim() !== "" && Number.isFinite(n)) commit(n);
    };
    const onKeyDown = (e) => {
        if (e.key === "ArrowUp" || e.key === "ArrowDown") { e.preventDefault(); setText(null); bump(e.key === "ArrowUp" ? 1 : -1, e); }
        else if (e.key === "Enter") { e.preventDefault(); typed(); }
        else if (e.key === "Escape" && text !== null) { e.preventDefault(); e.stopPropagation(); setText(null); }
    };
    return (
        <span className={`kx-num ${disabled ? "is-disabled" : ""} ${className}`}>
            <button type="button" className="kx-t" tabIndex={-1} aria-label={`Diminuir ${label}`} title="Diminuir · Shift: ×10" disabled={disabled || shown <= min} onClick={(e) => bump(-1, e)}><Icon name="minus" size={12} /></button>
            <input type="text" inputMode="decimal" role="spinbutton" aria-label={label} aria-valuemin={min} aria-valuemax={max} aria-valuenow={shown} aria-valuetext={`${fmt(shown)}${unit ? ` ${unit}` : ""}`}
                value={text ?? fmt(shown)} disabled={disabled} size={Math.max(3, fmt(max).length)}
                onChange={(e) => setText(e.target.value)} onBlur={typed} onKeyDown={onKeyDown} onFocus={(e) => e.target.select()} />
            <button type="button" className="kx-t" tabIndex={-1} aria-label={`Aumentar ${label}`} title="Aumentar · Shift: ×10" disabled={disabled || shown >= max} onClick={(e) => bump(1, e)}><Icon name="plus" size={12} /></button>
            {unit && <span className="kx-num-u" aria-hidden="true">{unit}</span>}
        </span>
    );
}

// The id of the visible label of the form row a control sits in
// (settings/parts.jsx FormRow): a Field or Seg with no name of its own is
// named by it (C-29).
export const RowLabel = createContext(null);

// A radio group: the arrows move the choice when it has the keyboard focus
// (the console leaves arrows to radio groups, keys.js); label names it.
// A tab list's keys (src/lib/console/tablist.js, the ARIA tabs pattern):
// put it on the role="tablist" element; ←/→ (Home/End) move the focus to
// the next tab and choose it — a keyboard click (detail 0), so the console
// leaves the focus there.
export function onTabsKey(e) {
    const list = e.currentTarget;
    const tabs = [...list.querySelectorAll("[role='tab']")].filter((t) => !t.disabled && t.closest("[role='tablist']") === list);
    const next = tabStep(tabs.indexOf(e.target.closest?.("[role='tab']")), tabs.length, e.key);
    if (next === null) return;
    e.preventDefault();
    tabs[next].focus();
    if (tabs[next].getAttribute("aria-selected") !== "true") tabs[next].click();
}

export function Seg({ value, options, onChange, mode, className = "", small, label }) {
    const onKeyDown = (e) => {
        const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
        if (!step) return;
        const enabled = options.filter(([, , extra]) => !extra?.disabled);
        const at = enabled.findIndex(([v]) => v === value);
        const next = enabled[(at + step + enabled.length) % enabled.length];
        if (!next) return;
        e.preventDefault();
        onChange(next[0]);
        const box = e.currentTarget;
        setTimeout(() => box.querySelector('[aria-checked="true"]')?.focus(), 50);
    };
    const rowLabel = useContext(RowLabel);
    const hasValue = options.some(([v]) => v === value);
    return (
        <div className={`kx-seg ${mode ? "kx-seg-mode" : ""} ${small ? "is-small" : ""} ${className}`} role="radiogroup" aria-label={label} aria-labelledby={label ? undefined : rowLabel || undefined} onKeyDown={onKeyDown}>
            {options.map(([v, label, extra], i) => (
                <button type="button" key={v} className={`kx-t ${value === v ? "is-on" : ""}`} data-mode={v} role="radio" aria-checked={value === v} tabIndex={value === v || (!hasValue && i === 0) ? 0 : -1} onClick={() => onChange(v)} {...(extra || {})}>
                    {label}
                </button>
            ))}
        </div>
    );
}

// `label`: the field's name when a visible label sits beside it (C-29);
// `id`: for a <label htmlFor> that names it instead. Neither: the
// placeholder names it (a search box, whose hint is its name).
export function Field({ icon = "search", value, onChange, placeholder, label, id, onKeyDown, kbd, inputRef, inputProps, ...rest }) {
    const rowLabel = useContext(RowLabel);
    const byRow = !id && !label && rowLabel;
    return (
        <div className="kx-field kx-t" {...rest}>
            {icon && <Icon name={icon} />}
            <input ref={inputRef} id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={id || byRow ? undefined : label || placeholder} aria-labelledby={byRow || undefined} onKeyDown={onKeyDown} spellCheck={false} {...inputProps} />
            {kbd && <kbd>{kbd}</kbd>}
        </div>
    );
}

// A list row: a glyph, a title and one grey line, time on the right, actions
// on hover. Click, Enter and Space on the row all prepare (onClick); a
// double click sends to air (onDoubleClick), as in Holyrics. `onKey` sees
// the row's other keys first (Alt+↑/↓ moves a Setlist row, C-16); `lead`
// goes before the glyph (the planner's grip); `expanded`: the row opens
// details under it (aria-expanded); `tip`: the title's tooltip when it
// should say more than the title (a song's artist).
// A row with actions of its own (`actions`, or `item` in a list where only
// some rows have them) is a list item, never a button that holds buttons
// (C-27): named by its title, its meta, time and state as its description,
// its actions sibling buttons named by what they act on; its list is
// role="list". Without actions it stays one button. Either way it takes
// the focus, and Enter or Space prepare it.
export const rowKeyDown = (onClick, onKey) => (e) => {
    onKey?.(e);
    if (e.defaultPrevented) return;
    if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && onClick) { e.preventDefault(); onClick(e); }
};
export function Row({ icon, lead, title, tip, meta, metaClass = "", time, state = "", actions, item, onClick, onDoubleClick, onContextMenu, onMouseEnter, onMouseLeave, onKey, expanded, dragProps, single, className = "", current, children }) {
    const id = useId();
    const listItem = Boolean(item || actions);
    const cls = `${state} ${className}`;
    const words = stateWords(cls);
    const hasMeta = meta != null && meta !== "";
    const described = listItem ? [hasMeta && `${id}m`, time != null && `${id}t`, words && `${id}s`].filter(Boolean).join(" ") : "";
    return (
        <div className={`kx-row kx-t ${state} ${single ? "kx-row-1" : ""} ${className}`} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} onMouseEnter={onMouseEnter} onMouseLeave={onMouseLeave}
            role={listItem ? "listitem" : "button"} tabIndex={0} aria-labelledby={listItem ? `${id}n` : undefined} aria-describedby={described || undefined}
            aria-current={current || (isAir(cls) ? "true" : undefined)} aria-expanded={expanded}
            onKeyDown={rowKeyDown(onClick, onKey)} {...dragProps}>
            {lead}
            {icon && <span className="kx-glyph"><Icon name={icon} /></span>}
            <div className="kx-row-main">
                <div className="kx-row-title" id={`${id}n`} title={tip || (typeof title === "string" ? title : undefined)}>{title}</div>
                {hasMeta && <div className={`kx-row-meta ${metaClass}`} id={`${id}m`}>{meta}</div>}
            </div>
            {children}
            {time != null && <span className="kx-row-time kx-hide-on-hover" id={`${id}t`}>{time}</span>}
            {words && <span className="kx-sr" id={`${id}s`}>, {words}</span>}
            {actions && <span className="kx-row-acts">{actions}</span>}
        </div>
    );
}

// The live states in words (C-26): a slide, verse or row shows the eye
// what it is by its background (on air gold, the Prévia green: colour
// only, owner 2026-10-16) and tells a screen reader by these words and
// aria-current. `cls`: the element's classes.
export const isAir = (cls = "") => /(^|\s)is-air(\s|$)/.test(cls);
export function stateWords(cls = "") {
    const words = [];
    if (isAir(cls)) words.push("no ar");
    if (/(^|\s)is-prev(\s|$)/.test(cls)) words.push("na prévia");
    return words.join(", ");
}
// Inside a button named by its content: the state words after its own
// text, said but not shown.
export function SrState({ cls }) {
    const words = stateWords(cls);
    return words ? <span className="kx-sr">, {words}. </span> : null;
}

// One polite live region, always mounted and empty until something is said
// (C-25): a region that appears with its text already in it is often
// skipped by NVDA and Narrator. `say(text)` writes into it; what is said
// in the same moment is said together, and the same words twice are said
// twice (the region empties first).
export function useLiveRegion() {
    const [text, setText] = useState("");
    const queue = useRef([]);
    const timer = useRef(null);
    const say = useCallback((msg) => {
        if (!msg) return;
        if (!queue.current.includes(msg)) queue.current.push(msg);
        clearTimeout(timer.current);
        setText("");
        timer.current = setTimeout(() => { setText(queue.current.join(". ")); queue.current = []; }, 150);
    }, []);
    useEffect(() => () => clearTimeout(timer.current), []);
    const region = <div className="kx-sr" role="status" aria-live="polite" aria-atomic="true">{text}</div>;
    return [region, say];
}

// A monitor: caption line (state word first) and the screen, 16:9. `cap`
// ({ word, title, pos, size: "live" | "next" }) gives the caption its own
// hierarchy (the live column); `caption` is the plain one-line form.
// `noCap`: no caption row (the Programa's caption is its panel's header).
// `now` freezes the screen at that time (a still frame); without one it
// keeps its own clock (ScreenRenderer).
export function Monitor({ state, caption, cap, noCap = false, live, now, logoUrl, right, motion = false, className = "", style, dropProps, children }) {
    return (
        <div className={`kx-mon ${state ? `is-${state}` : ""} ${className}`} style={style} {...dropProps}>
            {noCap ? null : cap ? (
                <div className={`kx-mon-cap is-cap is-${cap.size}`}>
                    <span className="kx-live-cap">{cap.word}</span>
                    <span className={`kx-mon-t ${cap.size === "live" ? "kx-live-title" : "kx-next-title"}`} title={cap.title || undefined}>{cap.title}</span>
                    {cap.pos && <span className="kx-meta">{cap.pos}</span>}
                    {right}
                </div>
            ) : (
                <div className="kx-mon-cap"><span className="kx-section">{caption}</span>{right}</div>
            )}
            <div className="kx-mon-screen">
                {live && <ScreenRenderer state={live} now={now} logoUrl={logoUrl} preview motion={motion} />}
                {children}
            </div>
        </div>
    );
}

// A splitter between two modules. Drag changes `size` by the mouse delta
// (sign: +1 when dragging right/down grows the module, -1 otherwise).
// `label`: shown on the splitter (the size in %, while editing the
// arrangement); a click makes it a field and Enter gives `onPercent` the number.
// `name`: what it resizes ("Largura · Biblioteca", C-62); `value` with
// `min`/`max` and `valueText`: what a screen reader says (the dock, the %
// of its split; a window column, its pixels between its limits).
export function Split({ horizontal, size, onSize, onReset, sign = 1, clamp, label = null, onPercent, name, value, min, max, valueText }) {
    const drag = useRef(null);
    const [typing, setTyping] = useState(null);
    useEffect(() => {
        const move = (e) => {
            if (!drag.current) return;
            const delta = horizontal ? e.clientY - drag.current.y : e.clientX - drag.current.x;
            onSize(clamp(drag.current.size + sign * delta));
        };
        const up = () => { if (drag.current) { drag.current = null; document.body.style.cursor = ""; } };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
        return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
    }, [horizontal, onSize, sign, clamp]);
    // From the keyboard (Tab to it): the arrows resize in 16 px steps, Enter
    // or Home restores. The arrows stop here (keys.js leaves a focused
    // separator alone), so nothing moves on air while resizing.
    const onKeyDown = (e) => {
        const grow = horizontal ? { ArrowDown: 1, ArrowUp: -1 } : { ArrowRight: 1, ArrowLeft: -1 };
        if (grow[e.key]) { e.preventDefault(); e.stopPropagation(); onSize(clamp(size + sign * grow[e.key] * 16)); }
        else if (e.key === "Enter" || e.key === "Home") { e.preventDefault(); e.stopPropagation(); onReset?.(); }
    };
    return (
        <div
            className={`kx-split ${horizontal ? "kx-split-h" : ""} ${drag.current ? "is-dragging" : ""}`}
            role="separator"
            aria-orientation={horizontal ? "horizontal" : "vertical"}
            aria-valuenow={Math.round(value ?? size)}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuetext={valueText}
            aria-label={name || (horizontal ? "Altura do painel" : "Largura do painel")}
            aria-description="Setas ajustam, Enter restaura"
            tabIndex={0}
            title="Arraste para redimensionar · duplo clique restaura"
            onMouseDown={(e) => { if (e.target.closest?.(".kx-split-pct")) return; e.preventDefault(); drag.current = { x: e.clientX, y: e.clientY, size }; document.body.style.cursor = horizontal ? "row-resize" : "col-resize"; }}
            onDoubleClick={(e) => { if (!e.target.closest?.(".kx-split-pct")) onReset?.(); }}
            onKeyDown={onKeyDown}
        >
            {label !== null && typing === null && (
                <button type="button" className="kx-split-pct kx-t" title="O tamanho em % do espaço · clique para digitar" tabIndex={-1}
                    onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); setTyping(String(parseInt(label, 10) || "")); }}>{label}</button>
            )}
            {label !== null && typing !== null && (
                <input className="kx-split-pct kx-split-pct-in" type="number" min={1} max={99} value={typing} autoFocus aria-label="Tamanho em %"
                    onMouseDown={(e) => e.stopPropagation()} onChange={(e) => setTyping(e.target.value)} onBlur={() => setTyping(null)}
                    onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); onPercent?.(Number(typing)); setTyping(null); } else if (e.key === "Escape") { e.preventDefault(); setTyping(null); } }} />
            )}
        </div>
    );
}

export function Empty({ icon, title, children }) {
    return (
        <div className="kx-empty">
            {icon && <span className="kx-glyph"><Icon name={icon} /></span>}
            {title && <span className="kx-empty-t">{title}</span>}
            {children && <span>{children}</span>}
        </div>
    );
}

// One item of a menu (Menu.jsx MenuList draws them; a few popovers that
// are not menus still use it as a row button). `checked` (on/off, given
// as a boolean) says its state (C-26): inside a role="menu" (the item given
// a menu role) as a menuitemcheckbox with aria-checked, in a plain popover
// list as a pressed button.
export function MenuItem({ icon, checked, kbd, className = "", children, ...rest }) {
    const toggle = typeof checked === "boolean";
    const inMenu = /^menuitem/.test(rest.role || "");
    const state = !toggle ? {} : inMenu ? { role: "menuitemcheckbox", "aria-checked": checked } : { "aria-pressed": checked };
    return (
        <button type="button" className={`kx-menu-item kx-t ${checked ? "is-checked" : ""} ${className}`} {...rest} {...state}>
            <span className="kx-glyph">{icon ? <Icon name={icon} /> : checked ? <Icon name="check" /> : null}</span>
            {children}
            {kbd && <span className="kx-kbd">{kbd}</span>}
        </button>
    );
}

// Reports its content's natural height (a ResizeObserver), for a module the
// console sizes to what it holds (Camadas: its list, or its list and the
// settings a pencil opened; dock.js `locked`). The content's own height,
// never the box it sits in, so the size it causes does not feed back.
export function Measure({ onHeight, children }) {
    const ref = useRef(null);
    const cb = useRef(onHeight);
    cb.current = onHeight;
    useEffect(() => {
        const el = ref.current;
        if (!el || typeof ResizeObserver === "undefined") return undefined;
        const report = () => cb.current?.(Math.ceil(el.offsetHeight));
        report();
        const ro = new ResizeObserver(report);
        ro.observe(el);
        return () => { ro.disconnect(); };
    }, []);
    return <div ref={ref} className="kx-measure">{children}</div>;
}
