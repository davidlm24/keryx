import React, { useEffect, useRef } from "react";
import Icon from "./Icon";
import ScreenRenderer from "@/components/screen/ScreenRenderer";

// The kx- components of docs/design-system/components/bundle.css as React
// pieces: a module, its header, buttons, a field, a row, a monitor, a
// splitter. Visual rules live in the stylesheet; these only lay out markup.

// `bare`: no card (kx-panel-bare), the module sits on the console's ground
// (the Programa, the Prévia); with nothing for it, the header is left out.
export function Panel({ title, count, lead, caption, actions, collapsed, onToggle, bare = false, className = "", style, children, bodyStyle }) {
    const head = !bare || title || caption || actions || lead || onToggle;
    return (
        <div className={`kx-panel ${bare ? "kx-panel-bare" : ""} ${collapsed ? "is-collapsed" : ""} ${className}`} style={style}>
            {head && <div className="kx-panel-h">
                {lead}
                {caption ? <span className="kx-panel-cap">{caption}</span> : <span className="kx-section">{title}{count ? <span className="kx-count"> · {count}</span> : null}</span>}
                {actions}
                {onToggle && (
                    <IconBtn name={collapsed ? "chevron-right" : "chevron-down"} title={collapsed ? "Expandir" : "Recolher"} onClick={onToggle} small />
                )}
            </div>}
            <div className="kx-panel-b" style={bodyStyle}>{children}</div>
        </div>
    );
}

export function Btn({ kind = "", small, on, className = "", children, ...rest }) {
    const cls = `kx-btn kx-t ${kind ? `kx-btn-${kind}` : ""} ${on ? "is-on" : ""} ${className}`;
    // Small buttons are still 24 px tall: the minimum pointer target (WCAG 2.2).
    // A button with on/off (on given) says so to screen readers.
    return <button type="button" className={cls} style={small ? { height: 24, padding: "0 6px" } : undefined} aria-pressed={typeof on === "boolean" ? on : undefined} {...rest}>{children}</button>;
}

// The way back from a full-screen view (song editor, planner, media, ...):
// always the first thing in the view's first header, outlined so it does not
// blend into the header's ghost buttons. Esc does the same.
export function BackBtn({ onClick, label = "Console", title = "Voltar ao console · Esc" }) {
    return (
        <button type="button" className="kx-btn kx-btn-outline kx-btn-back kx-t" onClick={onClick} title={title}>
            <Icon name="arrow-left" />{label}
        </button>
    );
}

export function IconBtn({ name, title, small, on, className = "", ...rest }) {
    const size = small ? { height: 24, width: 24 } : undefined;
    return (
        <button type="button" className={`kx-btn kx-btn-icon kx-t ${on ? "is-on" : ""} ${className}`} style={size} aria-label={title} title={title} {...rest}>
            <Icon name={name} />
        </button>
    );
}

// A radio group: the arrows move the choice when it has the keyboard focus
// (the console leaves arrows to radio groups, keys.js); label names it.
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
    const hasValue = options.some(([v]) => v === value);
    return (
        <div className={`kx-seg ${mode ? "kx-seg-mode" : ""} ${className}`} style={small ? { height: 24, padding: 2 } : undefined} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
            {options.map(([v, label, extra], i) => (
                <button type="button" key={v} className={`kx-t ${value === v ? "is-on" : ""}`} data-mode={v} role="radio" aria-checked={value === v} tabIndex={value === v || (!hasValue && i === 0) ? 0 : -1} onClick={() => onChange(v)} style={small ? { height: 20, padding: "0 8px", fontSize: 11 } : undefined} {...(extra || {})}>
                    {label}
                </button>
            ))}
        </div>
    );
}

export function Field({ icon = "search", value, onChange, placeholder, onKeyDown, kbd, inputRef, inputProps, ...rest }) {
    return (
        <div className="kx-field kx-t" {...rest}>
            {icon && <Icon name={icon} />}
            <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} onKeyDown={onKeyDown} {...inputProps} />
            {kbd && <kbd>{kbd}</kbd>}
        </div>
    );
}

// A list row: a glyph, a title and one grey line, time on the right, actions
// on hover. Click, Enter and Space on the row all prepare (onClick); a
// double click sends to air (onDoubleClick), as in Holyrics.
export function Row({ icon, title, meta, metaClass = "", time, state = "", actions, onClick, onDoubleClick, onContextMenu, dragProps, single, className = "", current, children }) {
    return (
        <div className={`kx-row kx-t ${state} ${single ? "kx-row-1" : ""} ${className}`} onClick={onClick} onDoubleClick={onDoubleClick} onContextMenu={onContextMenu} role="button" tabIndex={0} aria-current={current || undefined} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && onClick) { e.preventDefault(); onClick(e); } }} {...dragProps}>
            {icon && <span className="kx-glyph"><Icon name={icon} /></span>}
            <div className="kx-row-main">
                <div className="kx-row-title">{title}</div>
                {meta != null && meta !== "" && <div className={`kx-row-meta ${metaClass}`}>{meta}</div>}
            </div>
            {children}
            {time != null && <span className="kx-row-time kx-hide-on-hover">{time}</span>}
            {actions && <span className="kx-row-acts">{actions}</span>}
        </div>
    );
}

// A monitor: caption line (state word first) and the screen, 16:9. `cap`
// ({ word, title, pos, size: "live" | "next" }) gives the caption its own
// hierarchy (the live column); `caption` is the plain one-line form.
// `noCap`: no caption row (the Programa's caption is its panel's header).
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
export function Split({ horizontal, size, onSize, onReset, sign = 1, clamp }) {
    const drag = useRef(null);
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
            aria-valuenow={Math.round(size)}
            aria-label="Redimensionar · setas ajustam, Enter restaura"
            tabIndex={0}
            title="Arraste para redimensionar · duplo clique restaura"
            onMouseDown={(e) => { e.preventDefault(); drag.current = { x: e.clientX, y: e.clientY, size }; document.body.style.cursor = horizontal ? "row-resize" : "col-resize"; }}
            onDoubleClick={onReset}
            onKeyDown={onKeyDown}
        />
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

export function MenuItem({ icon, checked, kbd, children, ...rest }) {
    return (
        <button type="button" className={`kx-menu-item kx-t ${checked ? "is-checked" : ""}`} {...rest}>
            <span className="kx-glyph">{icon ? <Icon name={icon} /> : checked ? <Icon name="check" /> : null}</span>
            {children}
            {kbd && <span className="kx-kbd">{kbd}</span>}
        </button>
    );
}
