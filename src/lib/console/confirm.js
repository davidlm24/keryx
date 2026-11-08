// Which button a question (useConfirm, ConfirmDialog.jsx) focuses when it
// opens (audit C-10): Cancelar when its action cannot be taken back, so
// Enter, the operator's reflex for Enviar ao ar, never deletes or throws
// work away; Tab or a click reaches the action, and Esc answers no either
// way, as the native close guard does (closeGuard.cjs). Excluir (it
// deletes, copy rules) and Descartar (unsaved changes) say it by their verb;
// any other action says it with `danger: true` (Trocar o código, Juntar…),
// and `danger: false` overrides the verb. Without `ok` the action is Excluir.
const DESTROYS = /^(Excluir|Descartar)\b/;

export function focusesCancel(request = {}) {
    if (typeof request.danger === "boolean") return request.danger;
    return DESTROYS.test(request.ok || "Excluir");
}
