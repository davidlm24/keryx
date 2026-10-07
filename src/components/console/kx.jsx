import React, { useEffect, useRef } from "react";
import Icon from "./Icon";
import ScreenRenderer from "@/components/screen/ScreenRenderer";

// The kx- components of docs/design-system/components/bundle.css as React
// pieces: a module, its header, buttons, a field, a row, a monitor, a
// splitter. Visual rules live in the stylesheet; these only lay out markup.

export function Panel({ title, count, actions, collapsed, onToggle, className = "", style, children, bodyStyle }) {
    return (
        <div className={`kx-panel ${collapsed ? "is-collapsed" : ""} ${className}`} style={style}>
            <div className="kx-panel-h">
                <span className="kx-section">{title}{count ? <span className="kx-count"> · {count}</span> : null}</span>
                {actions}
                {onToggle && (
                    <IconBtn name={collapsed ? "chevron-right" : "chevron-down"} title={collapsed ? "Expandir" : "Recolher"} onClick={onToggle} small />
                )}
            </div>
            <div className="kx-panel-b" style={bodyStyle}>{children}</div>
        </div>
    );
}

export function Btn({ kind = "", small, on, className = "", children, ...rest }) {
    const cls = `kx-btn kx-t ${kind ? `kx-btn-${kind}` : ""} ${on ? "is-on" : ""} ${className}`;
    return <button type="button" className={cls} style={small ? { height: 22, padding: "0 6px" } : undefined} {...rest}>{children}</button>;
}

export function IconBtn({ name, title, small, on, className = "", ...rest }) {
    const size = small ? { height: 20, width: 20 } : undefined;
    return (
        <button type="button" className={`kx-btn kx-btn-icon kx-t ${on ? "is-on" : ""} ${className}`} style={size} aria-label={title} title={title} {...rest}>
            <Icon name={name} />
        </button>
    );
}

export function Seg({ value, options, onChange, mode, className = "", small }) {
    return (
        <div className={`kx-seg ${mode ? "kx-seg-mode" : ""} ${className}`} style={small ? { height: 24, padding: 2 } : undefined} role="radiogroup">
            {options.map(([v, label, extra]) => (
                <button type="button" key={v} className={`kx-t ${value === v ? "is-on" : ""}`} data-mode={v} role="radio" aria-checked={value === v} onClick={() => onChange(v)} style={small ? { height: 20, padding: "0 8px", fontSize: 11 } : undefined} {...(extra || {})}>
                    {label}
                </button>
            ))}
        </div>
    );
}

export function Field({ icon = "search", value, onChange, placeholder, onKeyDown, kbd, inputRef, ...rest }) {
    return (
        <div className="kx-field kx-t" {...rest}>
            {icon && <Icon name={icon} />}
            <input ref={inputRef} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder} onKeyDown={onKeyDown} />
            {kbd && <kbd>{kbd}</kbd>}
        </div>
    );
}

// A list row: a glyph, a title and one grey line, time on the right, actions
// on hover. Click, Enter and Space all do the same: prepare (onClick). A row
// never sends to air by itself.
export function Row({ icon, title, meta, metaClass = "", time, state = "", actions, onClick, dragProps, single, className = "", children }) {
    return (
        <div className={`kx-row kx-t ${state} ${single ? "kx-row-1" : ""} ${className}`} onClick={onClick} role="button" tabIndex={0} onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && e.target === e.currentTarget && onClick) { e.preventDefault(); onClick(e); } }} {...dragProps}>
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

// A monitor: caption line (state word first) and the screen, 16:9.
export function Monitor({ state, caption, live, now, logoUrl, right, motion = false, className = "", style, children }) {
    return (
        <div className={`kx-mon ${state ? `is-${state}` : ""} ${className}`} style={style}>
            <div className="kx-mon-cap"><span className="kx-section">{caption}</span>{right}</div>
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
    return (
        <div
            className={`kx-split ${horizontal ? "kx-split-h" : ""} ${drag.current ? "is-dragging" : ""}`}
            title="Arraste para redimensionar · duplo clique restaura"
            onMouseDown={(e) => { e.preventDefault(); drag.current = { x: e.clientX, y: e.clientY, size }; document.body.style.cursor = horizontal ? "row-resize" : "col-resize"; }}
            onDoubleClick={onReset}
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
