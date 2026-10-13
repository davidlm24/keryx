// The Editor de temas e layouts: its own window (opened by
// src/lib/editorWindow.js; /Editor in App.jsx), so the console never swaps
// views for an edit — the operator edits here, closes the window and is back
// where they were. It talks to the same store and live state as every other
// window (IPC on the desktop, SSE in the browser preview), so Salvar reaches
// the console, the outputs and the network screens at once.
//
// Two kinds of document, one window: a TEMA (how the projection dresses the
// text: look, placement, background — ThemeEditor) or a LAYOUT (the drawing
// of a screen: elements on a canvas — LayoutEditor). Deep links:
// ?theme=<id | new> or ?layout=<id | new | factory:…>; &for=<output path>
// binds a new layout to that output on the first save. The window is named
// (keryx-editor): opening the editor again navigates this one instead of
// stacking a second.
import React, { useCallback, useEffect, useRef, useState } from "react";
import LayoutEditor from "@/components/editor/LayoutEditor";
import ThemeEditor from "@/components/editor/ThemeEditor";
import BackgroundLibrary from "@/components/console/library/BackgroundLibrary";
import { LibraryContext } from "@/components/console/library/libraryContext";
import { Seg } from "@/components/console/kx";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useLibrary } from "@/components/console/useConsoleData";
import "@/components/console/console.css";

const readUrl = () => {
    try {
        const p = new URLSearchParams(window.location.search);
        if (p.get("theme")) return { kind: "theme", id: p.get("theme"), for: "" };
        return { kind: "layout", id: p.get("layout") || "new", for: p.get("for") || "" };
    } catch { return { kind: "layout", id: "new", for: "" }; }
};

export default function Editor() {
    const [doc, setDoc] = useState(readUrl);
    // Remounts the editor only on an explicit switch — never on save (the
    // old console view remounted on save and lost "Usar em…").
    const [docKey, setDocKey] = useState(0);
    const live = useLiveState();
    const now = useLiveNow();
    const { media, themes } = useLibrary();

    // The console's one-line toast, local to this window.
    const [toast, setToast] = useState(null);
    const toastTimer = useRef(null);
    const say = useCallback((text) => {
        setToast(text);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 3000);
    }, []);
    useEffect(() => () => clearTimeout(toastTimer.current), []);

    // The background library, awaited by BgChip (as the console mounts it).
    const [libReq, setLibReq] = useState(null);
    const pickFromLibrary = useCallback((opts = {}) => new Promise((resolve) => {
        setLibReq((prev) => { prev?.resolve(null); return { ...opts, resolve }; });
    }), []);
    const closeLibrary = useCallback((result = null) => setLibReq((prev) => { prev?.resolve(result); return null; }), []);
    // What the library needs of a console (`c`): the toast, the clock and —
    // only for its Ao vivo mode, never used from here — the live state.
    const libC = { say, now, cur: live || undefined, callOp: async () => {} };

    const setUrl = (next) => {
        const p = new URLSearchParams();
        p.set(next.kind === "theme" ? "theme" : "layout", next.id);
        if (next.for) p.set("for", next.for);
        try { window.history.replaceState(null, "", `/Editor?${p}`); } catch { /* the URL is cosmetic */ }
    };
    // The first save of a new document: keep the URL pointing at the row, so
    // a reload (F5) reopens the same document. No remount.
    const onSaved = (row) => { if (row?.id && doc.id !== row.id) { const next = { ...doc, id: row.id, for: "" }; setDoc(next); setUrl(next); } };
    const onSwitch = (id) => { const next = { ...doc, id: id || "new", for: "" }; setDoc(next); setUrl(next); setDocKey((k) => k + 1); };
    const onKind = (kind) => { if (kind === doc.kind) return; const next = { kind, id: "new", for: "" }; setDoc(next); setUrl(next); setDocKey((k) => k + 1); };
    // window.close works here: this window is always script-opened (the
    // console's openEditor, or window.open in the preview). Opened by a typed
    // URL it may be refused — then the toast says what to do.
    const close = () => { window.close(); setTimeout(() => say("Feche esta janela quando terminar."), 150); };

    const editor = doc.kind === "theme"
        ? <ThemeEditor key={`${docKey}:theme:${doc.id}`} themeId={doc.id} say={say} now={now} onClose={close} onSaved={onSaved} onSwitch={onSwitch} />
        : <LayoutEditor key={`${docKey}:layout:${doc.id}`} layoutId={doc.id} forPath={doc.for} media={media} themes={themes} say={say} live={live} now={now} onClose={close} onSaved={onSaved} onSwitch={onSwitch} />;

    return (
        <LibraryContext.Provider value={pickFromLibrary}>
        <div className="console edw">
            <div className="main">{editor}</div>
            <div className="edw-foot">
                <Seg small label="O que editar" value={doc.kind} options={[["theme", "Temas"], ["layout", "Layouts"]]} onChange={onKind} />
                <span style={{ flex: 1 }} />
                <button type="button" className="kx-btn kx-t" onClick={close}>Fechar janela</button>
            </div>
            {libReq && <BackgroundLibrary c={libC} request={libReq} onDone={closeLibrary} />}
            {toast && <div className="toast" role="status"><span className="toast-t">{toast}</span></div>}
        </div>
        </LibraryContext.Provider>
    );
}
