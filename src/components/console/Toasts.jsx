import React from "react";

// The console's toasts (useToast), bottom centre: a plain message above, the
// one with a button (Desfazer after Esc) under it, so neither takes the
// other's place; the pointer or the focus on the one with a button holds it
// (POL-11). Used by the console and a detached page (/Janela).
export default function Toasts({ c }) {
    if (!c.toasts?.length) return null;
    return (
        <div className="toasts">
            {c.toasts.map((t) => (
                <div key={t.key} className="toast" role="status"
                    {...(t.action ? {
                        onPointerEnter: () => c.holdToast(true), onPointerLeave: () => c.holdToast(false),
                        onFocus: () => c.holdToast(true), onBlur: () => c.holdToast(false),
                    } : {})}>
                    <span className="toast-t">{t.text}</span>
                    {t.action && <button type="button" className="kx-btn kx-t toast-act" onClick={() => t.action.run()}>{t.action.label}</button>}
                </div>
            ))}
        </div>
    );
}
