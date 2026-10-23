import React, { useEffect, useState } from "react";

// The console's toast (useToast in useConsole.js), in the console and in a
// detached page (/Janela). It sits just below the top bar and drops in; when
// it goes it stays mounted for the exit (`is-leaving`: fades and rises), so
// the entrance and the exit are both seen. Each new toast is a new element
// (key = its id) and replays the entrance. An important one (a new pedido or chat message)
// wears two gold waves that leave its border (CSS draws them).
// Its time stands still while the pointer or the focus is on it (design audit
// C-13), so Desfazer can be reached; Ctrl+Z runs an undo action too (keys.js
// "undo"). Its words are said by the page's live region (useLiveRegion,
// C-25), so it has no role="status".
const EXIT_MS = 180;

export default function Toast({ c }) {
    const hold = c.holdToast || (() => {});
    const act = c.toastAction;
    // The last toast shown, kept for the exit after c.toast turns null.
    const [last, setLast] = useState(null);
    const [leaving, setLeaving] = useState(false);
    useEffect(() => {
        if (c.toast) { setLast({ id: c.toastId, text: c.toast, important: c.toastImportant, act }); setLeaving(false); return undefined; }
        setLeaving(true);
        const t = setTimeout(() => setLast(null), EXIT_MS);
        return () => clearTimeout(t);
    }, [c.toast, c.toastId]); // eslint-disable-line react-hooks/exhaustive-deps
    const shown = c.toast ? { id: c.toastId, text: c.toast, important: c.toastImportant, act } : last;
    if (!shown) return null;
    const a = shown.act;
    const gone = !c.toast && leaving;
    return (
        <div key={shown.id} className={`toast kx-toast${shown.important ? " is-important" : ""}${gone ? " is-leaving" : ""}`}
            onMouseEnter={() => hold(true)} onMouseLeave={() => hold(false)}
            onFocus={() => hold(true)} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) hold(false); }}>
            {shown.important && <><span className="kx-toast-wave" aria-hidden="true" /><span className="kx-toast-wave is-2" aria-hidden="true" /></>}
            <span className="toast-t kx-toast-t">{shown.text}</span>
            {a && !gone && <button type="button" className="kx-btn kx-t toast-act kx-toast-act" title={a.undo ? `${a.label} · Ctrl+Z` : undefined} onClick={() => a.run()}>{a.label}</button>}
        </div>
    );
}
