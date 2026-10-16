import React, { createContext, useContext, useEffect, useId, useRef } from "react";
import { Btn } from "./kx";
import { useDialogFocus } from "./useDialogFocus";

// "Excluir…" from a right-click menu (songs, images, videos, avisos, themes)
// asks first (owner's request 2026-10-13): one dialog the console holds,
// awaited like the background library.
//   confirm({ title, text, ok = "Excluir" }) -> Promise<boolean>
// Esc or Cancelar answer no; Enter on the focused button answers it.
export const ConfirmContext = createContext(null);
const never = async () => false;
export const useConfirm = () => useContext(ConfirmContext) || never;

export default function ConfirmDialog({ request, onAnswer }) {
    const okRef = useRef(null);
    useEffect(() => { setTimeout(() => okRef.current?.focus(), 0); }, []);
    // Tab stays here; the focus goes back to the opener after a keyboard open (C-12).
    const boxRef = useRef(null);
    const textId = useId();
    useDialogFocus(boxRef);
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => onAnswer(false)} />
            <div ref={boxRef} className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-label={request.title} aria-describedby={request.text ? textId : undefined}>
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>{request.title}</div>
                {request.text && <div id={textId}>{request.text}</div>}
                <div className="acts">
                    <Btn onClick={() => onAnswer(false)}>Cancelar</Btn>
                    <button ref={okRef} type="button" className="kx-btn kx-btn-air kx-t" onClick={() => onAnswer(true)}>{request.ok || "Excluir"}</button>
                </div>
            </div>
        </>
    );
}

// The usual question before deleting something by name.
export const deleteQuestion = (what, name, more = "") => ({
    title: `Excluir ${what}?`,
    text: `"${name}" sai do KERYX de vez.${more ? ` ${more}` : ""}`,
});
