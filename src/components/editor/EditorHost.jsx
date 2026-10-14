import React, { useRef, useState } from "react";
import ScreenEditor from "./ScreenEditor";
import ThemeEditor from "./ThemeEditor";
import { Seg } from "@/components/console/kx";

// One Editor, two hosts (owner 2026-10-14, "janelas flutuantes"): the
// console's floating Editor dialog and the detached /Editor window
// (src/pages/Editor.jsx) both mount this same body — the document switch
// (Temas | Telas), the editor itself, the footer. Never a second theme
// editor. `doc` is { kind: "theme" | "screen", id }.
//   onDoc     — the document changed (the window keeps its URL with it).
//   onDetach  — dialog only: move this document to its own window.
//   escRef    — dialog only: the console routes Esc here (ESC_ORDER
//               "editor"); without it the editors keep their window Esc.
// The footer's Fechar goes through the active editor's guarded leave, so
// unsaved changes ask first in both hosts.
export default function EditorHost({ initial, say, live, now, media, themes, onClose, onDetach = null, onDoc = () => {}, escRef = null, closeLabel = "Fechar janela" }) {
    const [doc, setDoc] = useState(initial);
    // Remounts the editor only on an explicit switch — never on save (the
    // old console view remounted on save and lost "Usar em…").
    const [docKey, setDocKey] = useState(0);
    const leaveRef = useRef(null);
    const change = (next, remount) => { setDoc(next); onDoc(next); if (remount) setDocKey((k) => k + 1); };
    // The first save of a new theme: keep the document (and the window's
    // URL) pointing at the row, so a reload reopens the same one. No remount.
    const onSaved = (row) => { if (doc.kind === "theme" && row?.id && doc.id !== row.id) change({ ...doc, id: row.id }, false); };
    const onSwitch = (id) => change({ ...doc, id: id || (doc.kind === "theme" ? "new" : "/Projection") }, true);
    const onKind = (kind) => { if (kind !== doc.kind) change({ kind, id: kind === "theme" ? "new" : "/Projection" }, true); };

    const editor = doc.kind === "theme"
        ? <ThemeEditor key={`${docKey}:theme:${doc.id}`} themeId={doc.id} say={say} now={now} onClose={onClose} onSaved={onSaved} onSwitch={onSwitch} escRef={escRef} leaveRef={leaveRef} />
        : <ScreenEditor key={`${docKey}:screen:${doc.id}`} screenPath={doc.id} media={media} themes={themes} say={say} live={live} now={now} onClose={onClose} onSwitch={onSwitch} escRef={escRef} leaveRef={leaveRef} />;

    return (
        <>
            <div className="main">{editor}</div>
            <div className="edw-foot">
                <Seg small label="O que editar" value={doc.kind} options={[["theme", "Temas"], ["screen", "Telas"]]} onChange={onKind} />
                <span style={{ flex: 1 }} />
                {onDetach && <button type="button" className="kx-btn kx-t" onClick={() => onDetach(doc)} title="Abrir o Editor em janela própria (para editar vendo outra tela)">Destacar em janela</button>}
                <button type="button" className="kx-btn kx-t" onClick={() => (leaveRef.current ? leaveRef.current() : onClose())}>{closeLabel}</button>
            </div>
        </>
    );
}
