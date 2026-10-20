import React from "react";

// The console's toast (useToast in useConsole.js), in the console and in a
// detached page (/Janela). Its time stands still while the pointer or the
// focus is on it (design audit C-13), so Desfazer can be reached; Ctrl+Z
// runs an undo action too (keys.js "undo"). Its words are said by the
// page's live region (useLiveRegion, C-25), so it has no role="status".
export default function Toast({ c }) {
    if (!c.toast) return null;
    const hold = c.holdToast || (() => {});
    const act = c.toastAction;
    return (
        <div className="toast kx-toast" onMouseEnter={() => hold(true)} onMouseLeave={() => hold(false)}
            onFocus={() => hold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hold(false); }}>
            <span className="toast-t kx-toast-t">{c.toast}</span>
            {act && <button type="button" className="kx-btn kx-t toast-act kx-toast-act" title={act.undo ? `${act.label} · Ctrl+Z` : undefined} onClick={() => act.run()}>{act.label}</button>}
        </div>
    );
}
