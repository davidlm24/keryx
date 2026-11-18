// What goes back to the GERAR (owner 2026-11-18, wave 3; the brief's "fila
// de volta"): the operator's Atendido, Desfazer and Excluir on a request that
// came from the GERAR, and the operator's chat reply (D7 = A). Pure, tested;
// the queue is the main process's (electron/gerarOutbox.cjs).

const fromGerar = (r) => r?.source === "gerar" && Boolean(r.external_id);
const closedThere = (r) => r?.gerar_status === "cancelled" || r?.gerar_status === "declined";

// Atendido -> completed; Desfazer -> back to in_review. Nothing for a row
// not from the GERAR, nor one the GERAR already closed.
export function statusBack(r, done) {
    if (!fromGerar(r) || r.kind !== "pedido" || closedThere(r)) return null;
    return { type: "status", requestId: String(r.external_id), status: done ? "completed" : "in_review", note: null };
}

// Excluir… -> cancelled, with the note the GERAR shows.
export const REMOVED_NOTE = "Excluído na mesa";
export function removeBack(r) {
    if (!fromGerar(r) || r.kind !== "pedido" || closedThere(r) || r.gerar_status === "completed") return null;
    return { type: "status", requestId: String(r.external_id), status: "cancelled", note: REMOVED_NOTE };
}

// D7 = A: the operator's reply goes to the GERAR culto of the last message
// the GERAR's team sent in this conversation; none = to the phones only.
export function replyTarget(rows = []) {
    let target = null;
    for (const r of rows) if (r?.kind !== "pedido" && fromGerar(r) && r.side !== "operator" && r.gerar_event?.id) target = r.gerar_event;
    return target;
}

// The reply's entry in the queue: idempotent by its client id (the GERAR's
// send_event_live_message keeps the first one).
export function replyBack(row, target, clientMessageId) {
    if (!row?.id || !target?.id || !String(row.text || "").trim()) return null;
    return { type: "chat", eventId: String(target.id), clientMessageId: String(clientMessageId), text: String(row.text).trim().slice(0, 280), rowId: String(row.id) };
}

// The line under an operator's bubble that goes to the GERAR: sent (its
// GERAR id came back) or waiting.
export function replyLine(r) {
    if (r?.side !== "operator" || !r.gerar_event?.id) return null;
    return r.external_id ? { tone: "ok", words: "enviada ao GERAR" } : { tone: "wait", words: "esperando para ir ao GERAR" };
}
