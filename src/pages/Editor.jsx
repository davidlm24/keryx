// The Editor de temas e layouts: its own window (opened by
// src/lib/editorWindow.js; /Editor in App.jsx), so the console never swaps
// views for an edit — the operator edits here, closes the window and is back
// where they were. It talks to the same store and live state as every other
// window (IPC on the desktop, SSE in the browser preview), so Salvar reaches
// the console, the outputs and the network screens at once.
//
// Deep links: ?layout=<id | new | factory:…> picks the document, and
// &for=<output path> binds a new layout to that output on the first save.
// The window is named (keryx-editor): opening the editor again navigates
// this one instead of stacking a second.
import React, { useCallback, useEffect, useRef, useState } from "react";
import LayoutEditor from "@/components/editor/LayoutEditor";
import { Btn } from "@/components/console/kx";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useLibrary } from "@/components/console/useConsoleData";
import "@/components/console/console.css";

const readUrl = () => {
    try {
        const p = new URLSearchParams(window.location.search);
        return { layout: p.get("layout") || "new", for: p.get("for") || "" };
    } catch { return { layout: "new", for: "" }; }
};

export default function Editor() {
    const [doc, setDoc] = useState(readUrl);
    // Remounts the editor only on an explicit switch — never on save (the
    // old console view remounted on save and lost "Usar em…").
    const [docKey, setDocKey] = useState(0);
    const live = useLiveState();
    const now = useLiveNow();
    const { media } = useLibrary();

    // The console's one-line toast, local to this window.
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    const say = useCallback((text) => {
        setToast(text);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    }, []);
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    const setUrl = (next) => {
        const p = new URLSearchParams();
        if (next.layout) p.set("layout", next.layout);
        if (next.for) p.set("for", next.for);
        try { window.history.replaceState(null, "", `/Editor?${p}`); } catch { /* the URL is cosmetic */ }
    };
    // The first save of a new document: keep the URL pointing at the row, so
    // a reload (F5) reopens the same layout. No remount.
    const onSaved = (row) => { if (row?.id && doc.layout !== row.id) { const next = { ...doc, layout: row.id, for: "" }; setDoc(next); setUrl(next); } };
    const onSwitch = (id) => { const next = { layout: id || "new", for: "" }; setDoc(next); setUrl(next); setDocKey((k) => k + 1); };
    // window.close works here: this window is always script-opened (the
    // console's openEditor, or window.open in the preview). Opened by a typed
    // URL it may be refused — then the toast says what to do.
    const close = () => { window.close(); setTimeout(() => say("Feche esta janela quando terminar."), 150); };

    return (
        <div className="console edw">
            <div className="main">
                <LayoutEditor key={`${docKey}:${doc.layout}`} layoutId={doc.layout} forPath={doc.for} media={media} say={say} live={live} now={now} onClose={close} onSaved={onSaved} onSwitch={onSwitch} />
            </div>
            <div className="edw-foot"><span className="kx-meta">Editor de temas e layouts · as mudanças salvas valem na hora no console e nas telas</span><span style={{ flex: 1 }} /><Btn small onClick={close}>Fechar janela</Btn></div>
            {toast && <div className="toast" role="status"><span className="toast-t">{toast}</span></div>}
        </div>
    );
}
