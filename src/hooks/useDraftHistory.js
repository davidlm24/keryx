import { useEffect, useMemo, useRef, useState } from "react";
import { emptyHistory, record, undo as undoStep, redo as redoStep, breakGroup, canUndo, canRedo } from "@/lib/editorHistory";

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// The typing in one field (or one slider's run) folds into one step while
// it keeps coming; a pause this long starts another.
const FIELD_WINDOW = 1500;
const FIELDS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Desfazer / Refazer over an editor's `draft` (the screen and theme
// editors; the stack is src/lib/editorHistory.js). It watches the draft, so
// every way the draft changes is a step, whoever made it; a drag is one
// step (begin / end), a run of nudges one step (mark), the typing in one
// field one step. Undo and redo put a draft back through setDraft and are
// never recorded. reset(value) empties the stack: on load, on Salvar, on
// Voltar à página padrão (switching theme or screen remounts the editor).
export default function useDraftHistory(draft, setDraft) {
    const hist = useRef(emptyHistory());
    const seen = useRef(draft); // the draft the stack last knew
    const latest = useRef(draft);
    latest.current = draft;
    const tag = useRef(null); // { group, window, sticky } for the next change(s)
    const [flags, setFlags] = useState({ undo: false, redo: false });
    const put = useRef(setDraft);
    put.current = setDraft;
    // Only refs inside: the actions below keep one identity for the
    // editor's life, so an effect may list them.
    const sync = useRef(() => {
        const next = { undo: canUndo(hist.current), redo: canRedo(hist.current) };
        setFlags((f) => (f.undo === next.undo && f.redo === next.redo ? f : next));
    }).current;

    useEffect(() => {
        const before = seen.current;
        if (draft === before) return;
        seen.current = draft;
        if (before == null || draft == null || sameJson(before, draft)) return;
        let t = tag.current;
        if (t && !t.sticky) tag.current = null;
        if (!t) {
            const a = typeof document !== "undefined" ? document.activeElement : null;
            if (a && FIELDS.has(a.tagName)) t = { group: a, window: FIELD_WINDOW };
        }
        hist.current = record(hist.current, before, { group: t?.group ?? null, window: t?.window ?? null, at: Date.now() });
        sync();
    }, [draft, sync]);

    // Leaving a field ends its step.
    useEffect(() => {
        const onOut = () => { if (!tag.current?.sticky) hist.current = breakGroup(hist.current); };
        window.addEventListener("focusout", onOut, true);
        return () => window.removeEventListener("focusout", onOut, true);
    }, []);

    const actions = useMemo(() => {
        const apply = (r) => {
            if (!r) return false;
            hist.current = r.history;
            seen.current = r.value;
            tag.current = null;
            put.current(r.value);
            sync();
            return true;
        };
        return {
            undo: () => apply(undoStep(hist.current, latest.current)),
            redo: () => apply(redoStep(hist.current, latest.current)),
            // A drag: every change until end() is one step.
            begin: (group) => { tag.current = { group, window: null, sticky: true }; },
            end: () => { if (tag.current?.sticky) tag.current = null; hist.current = breakGroup(hist.current); },
            // The next change only: folds with the last one of the same group
            // within `window` ms (a run of nudges).
            mark: (group, window = null) => { tag.current = { group, window, sticky: false }; },
            reset: (value) => {
                hist.current = emptyHistory();
                if (value !== undefined) seen.current = value;
                tag.current = null;
                sync();
            },
        };
    }, [sync]);
    return { ...actions, canUndo: flags.undo, canRedo: flags.redo };
}
