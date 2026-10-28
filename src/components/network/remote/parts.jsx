import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { allowed } from "@/lib/network/remoteView";

// A button that sends one command. Only it is busy while its answer is on the
// way (a second tap is ignored); it is off while the screens are locked or
// the link is dead when the command would put something on air.
//   c: { busy, run, flags } from the page; k: its busy key (default: the action)
export function Cmd({ c, k, action, args = {}, className = "", disabled = false, quiet = false, then, label, title, pressed, children }) {
    const key = k || action;
    const busy = c.busy.has(key);
    const off = disabled || !allowed(action, args, c.flags);
    return (
        <button
            type="button"
            className={`rm-b ${className} ${busy ? "is-busy" : ""}`}
            disabled={off}
            aria-busy={busy || undefined}
            aria-label={label}
            aria-pressed={pressed}
            title={title}
            onClick={async () => {
                const r = await c.run(key, action, args, { quiet });
                if (r?.ok && then) then(r);
            }}
        >
            {children}
        </button>
    );
}

// A button that must be held (a touch by accident never does it): a fill
// runs across while it is held; letting go before stops it, and a tap that
// let go at once calls onShort (Encerrar says to hold it).
const SHORT_TAP_MS = 400;
export function HoldButton({ ms, label, holding: holdingLabel = "Continue segurando…", icon, onDone, onShort, disabled = false, className = "", aria }) {
    const [holding, setHolding] = useState(false);
    const timer = useRef(null);
    const since = useRef(0);
    const start = (e) => {
        if (disabled) return;
        e.preventDefault();
        setHolding(true);
        since.current = Date.now();
        clearTimeout(timer.current);
        timer.current = setTimeout(() => { since.current = 0; setHolding(false); onDone(); }, ms);
    };
    const stop = () => {
        clearTimeout(timer.current);
        setHolding(false);
        if (since.current && Date.now() - since.current < SHORT_TAP_MS) onShort?.();
        since.current = 0;
    };
    useEffect(() => () => clearTimeout(timer.current), []);
    return (
        <button
            type="button"
            className={`rm-b rm-hold ${holding ? "is-holding" : ""} ${className}`}
            disabled={disabled}
            style={{ "--rm-hold": `${ms}ms` }}
            onPointerDown={start}
            onPointerUp={stop}
            onPointerLeave={stop}
            onPointerCancel={stop}
            onContextMenu={(e) => e.preventDefault()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !e.repeat) start(e); }}
            onKeyUp={(e) => { if (e.key === "Enter" || e.key === " ") stop(); }}
            aria-label={aria || label}
        >
            <i className="rm-hold-fill" aria-hidden="true" />
            <span>{icon && <Icon name={icon} size={20} />}{holding ? holdingLabel : label}</span>
        </button>
    );
}

// A sheet from the bottom over the page: Esc, the scrim or Cancelar closes it.
export function Sheet({ title, onClose, children }) {
    const box = useRef(null);
    useEffect(() => {
        const key = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", key);
        box.current?.focus();
        return () => document.removeEventListener("keydown", key);
    }, [onClose]);
    return (
        <>
            <div className="rm-scrim" onClick={onClose} aria-hidden="true" />
            <div className="rm-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={box}>
                <span className="rm-grab" aria-hidden="true" />
                <h2 className="rm-sheet-h">{title}</h2>
                {children}
            </div>
        </>
    );
}

// A toggle row (Mais): a title, a line under it, the switch.
export function Toggle({ title, sub, on, onChange, disabled = false, busy = false }) {
    return (
        <div className="rm-row2">
            <span className="rm-row2-t"><b>{title}</b>{sub && <small>{sub}</small>}</span>
            <button type="button" className={`rm-tg ${busy ? "is-busy" : ""}`} role="switch" aria-checked={Boolean(on)} aria-label={title} disabled={disabled} onClick={onChange} />
        </div>
    );
}

// What the last command said, over the tab bar; after Encerrar tudo it
// holds Desfazer for 8 s.
export function Toast({ toast, onUndo, onClose, canUndo }) {
    if (!toast) return null;
    return (
        <div className={`rm-toast ${toast.bad ? "is-bad" : ""}`} role="status" aria-live="polite" key={toast.id}>
            <span>{toast.text}</span>
            {toast.undo && canUndo
                ? <button type="button" className="rm-toast-act" onClick={() => { onClose(); onUndo(); }}>Desfazer</button>
                : <button type="button" className="rm-toast-x" onClick={onClose} aria-label="Fechar"><Icon name="x" size={16} /></button>}
        </div>
    );
}
