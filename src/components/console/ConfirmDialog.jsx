import React, { createContext, useContext, useEffect, useId, useRef } from "react";
import Icon from "./Icon";
import { focusesCancel } from "@/lib/console/confirm";
import { useDialogFocus } from "./useDialogFocus";

// "Excluir…" from a right-click menu (songs, images, videos, avisos, themes)
// asks first (owner's request 2026-10-13): one dialog the console holds,
// awaited like the background library.
//   confirm({ title, text, ok = "Excluir", danger, list, warn }) -> Promise<boolean>
// `list`: names of what goes (several at once, src/lib/console/bulkDelete.js);
// `warn`: lines on what is in use (a Setlist, the default theme), in amber.
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
    // Tab stays here; the focus goes back to the opener after a keyboard open (C-12).
    const boxRef = useRef(null);
    const textId = useId();
    useDialogFocus(boxRef);
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => onAnswer(false)} />
            <div ref={boxRef} className="dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-label={request.title} aria-describedby={request.text || request.list?.length || request.warn?.length ? textId : undefined}>
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>{request.title}</div>
                <div id={textId} className="confirm-body">
                    {request.list?.length > 0 && <ul className="confirm-list">{request.list.map((n, i) => <li key={`${i}${n}`}>{n}</li>)}</ul>}
                    {request.warn?.map((w, i) => <div key={i} className="confirm-warn"><Icon name="warn" />{w}</div>)}
                    {request.text && <div>{request.text}</div>}
                </div>
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
