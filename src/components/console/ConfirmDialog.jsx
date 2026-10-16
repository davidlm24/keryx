import React, { createContext, useContext, useEffect, useRef } from "react";
import { focusesCancel } from "@/lib/console/confirm";

// "Excluir…" from a right-click menu (songs, images, videos, avisos, themes)
// asks first (owner's request 2026-10-13): one dialog the console holds,
// awaited like the background library.
//   confirm({ title, text, ok = "Excluir", danger }) -> Promise<boolean>
// Esc or Cancelar answer no; Enter on the focused button answers it. A
// question whose action cannot be taken back (Excluir, Descartar, or
// `danger: true`) opens on Cancelar, so a reflex Enter answers no (audit
// C-10, src/lib/console/confirm.js); the others open on the action. The
// buttons go in Windows order, the action then Cancelar (C-74), as in
// every question of the console and the native ones (closeGuard.cjs).
export const ConfirmContext = createContext(null);
const never = async () => false;
export const useConfirm = () => useContext(ConfirmContext) || never;

export default function ConfirmDialog({ request, onAnswer }) {
    const okRef = useRef(null);
    const noRef = useRef(null);
    const safe = focusesCancel(request);
    useEffect(() => { setTimeout(() => (safe ? noRef : okRef).current?.focus(), 0); }, [request, safe]);
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => onAnswer(false)} />
            <div className="dialog confirm-dialog" role="alertdialog" aria-label={request.title}>
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>{request.title}</div>
                {request.text && <div>{request.text}</div>}
                <div className="acts">
                    <button ref={okRef} type="button" className="kx-btn kx-btn-air kx-t" onClick={() => onAnswer(true)}>{request.ok || "Excluir"}</button>
                    <button ref={noRef} type="button" className="kx-btn kx-t" onClick={() => onAnswer(false)}>Cancelar</button>
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
