// The Editor de temas e telas, DETACHED: its own window (/Editor in
// App.jsx), opened by "Destacar em janela" in the console's floating Editor
// dialog — openEditor({ ..., detached: true }) in src/lib/editorWindow.js —
// for whoever edits watching another monitor. The dialog in the console
// (owner 2026-10-14, "janelas flutuantes") is the usual host; both mount
// the same EditorHost, never a second editor. This window talks to the same
// store and live state as every other window (IPC on the desktop, SSE in
// the browser preview), so Salvar reaches the console, the outputs and the
// network screens at once.
//
// Deep links: ?theme=<id | new> or ?screen=<path>. The window is named
// (keryx-editor): opening the editor again navigates this one instead of
// stacking a second.
import React, { useCallback, useEffect, useRef, useState } from "react";
import EditorHost from "@/components/editor/EditorHost";
import BackgroundLibrary from "@/components/console/library/BackgroundLibrary";
import { LibraryContext } from "@/components/console/library/libraryContext";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useLibrary } from "@/components/console/useConsoleData";
import "@/components/console/console.css";

const readUrl = () => {
    try {
        const p = new URLSearchParams(window.location.search);
        if (p.get("theme")) return { kind: "theme", id: p.get("theme") };
        return { kind: "screen", id: p.get("screen") || "/Projection" };
    } catch { return { kind: "screen", id: "/Projection" }; }
};

export default function Editor() {
    const [initial] = useState(readUrl);
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

    // The URL follows the document, so a reload (F5) reopens the same one.
    const setUrl = (next) => {
        const p = new URLSearchParams();
        p.set(next.kind === "theme" ? "theme" : "screen", next.id);
        try { window.history.replaceState(null, "", `/Editor?${p}`); } catch { /* the URL is cosmetic */ }
    };
    // window.close works here: this window is always script-opened (the
    // console's openEditor, or window.open in the preview). Opened by a typed
    // URL it may be refused — then the toast says what to do.
    const close = () => { window.close(); setTimeout(() => say("Feche esta janela quando terminar."), 150); };

    return (
        <LibraryContext.Provider value={pickFromLibrary}>
        <div className="console edw">
            <EditorHost initial={initial} say={say} live={live} now={now} media={media} themes={themes} onClose={close} onDoc={setUrl} />
            {libReq && <BackgroundLibrary c={libC} request={libReq} onDone={closeLibrary} />}
            {toast && <div className="toast" role="status"><span className="toast-t">{toast}</span></div>}
        </div>
        </LibraryContext.Provider>
    );
}
