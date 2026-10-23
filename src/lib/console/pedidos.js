// The Pedidos and Chat tabs (Rodada Q, PR2; S12 = B, S14 = A): the Equipe's
// chat and song requests of the culto (ServiceMessage rows, made by the
// controle remoto's runner or synced from another computer) and the
// operator's own (side "operator": a reply in the Chat, a pedido noted with
// Novo pedido, written by the console through the store). Pure: the tabs,
// the console's toast and the tabs' unread dots read it. Every text here
// came from a phone or a field: the tabs render it as plain text, never as
// HTML.
import PROTOCOL from "../../../shared/remoteProtocol.json" with { type: "json" };
import { fold } from "../bibleSearch.js";

const REQ = PROTOCOL.actions["request.send"].args;

// A row is fresh for the toast this long after it was sent (a row that
// arrives later, by the sync after a pause, is listed but says nothing).
export const FRESH_MS = 2 * 60 * 1000;

const at = (r) => String(r?.sentAt || "");
const ms = (r) => Date.parse(at(r)) || 0;

// In the order they came (oldest first, the newest at the bottom, as a chat).
export const messagesInOrder = (rows = []) => rows.slice().sort((a, b) => at(a).localeCompare(at(b)) || String(a.id).localeCompare(String(b.id)));

export const isPedido = (r) => r?.kind === "pedido";
export const isDone = (r) => r?.status === "done";
// Written on the console ("" or team = a phone of the Equipe, rows of before too).
export const isOperator = (r) => r?.side === "operator";
export const OPERATOR = "Operador";

// Each tab its own rows, in the order they came (S12 = B: the Pedidos tab
// only the pedidos, the Chat tab only the messages).
export const pedidosOf = (rows = []) => messagesInOrder(rows).filter(isPedido);
export const chatOf = (rows = []) => messagesInOrder(rows).filter((r) => !isPedido(r));
// The panel's tab a row belongs to.
export const tabOf = (r) => (isPedido(r) ? "pedidos" : "chat");

// "19:05", the time it was sent on this computer's clock.
export function sentTime(r) {
    const t = ms(r);
    return t ? new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "";
}

// What the toast says of a new row.
export function messageSay(r) {
    const who = String(r?.sender || "").trim() || "alguém da equipe";
    if (!isPedido(r)) return `Mensagem de ${who}`;
    const song = String(r.song || "").trim();
    return song ? `Pedido de ${who}: ${song}` : `Pedido de ${who}`;
}

// The rows to announce now: sent within FRESH_MS and not announced before
// (`told`: the ids already said, kept by the caller). Oldest first. What
// the operator wrote is never announced to the operator.
export function freshMessages(rows = [], told = new Set(), now = Date.now()) {
    return messagesInOrder(rows).filter((r) => r?.id && !isOperator(r) && !told.has(r.id) && Math.abs(now - ms(r)) <= FRESH_MS);
}

// A tab's dot: a row of the Equipe sent after the last one the operator
// saw (`seen`, an ISO time; none = everything is new).
export const hasUnread = (rows = [], seen = "") => rows.some((r) => !isOperator(r) && at(r) > String(seen || ""));

// The newest sentAt, what "seen" becomes while the tab is open.
export const newestAt = (rows = []) => rows.reduce((m, r) => (at(r) > m ? at(r) : m), "");

// The song a pedido names: its songId when the console has that song, else
// a song whose title is the same once accents, case and spaces are folded.
// -> the Song row | null.
const key = (s) => fold(String(s || "")).replace(/[^\p{L}\p{N}]+/gu, " ").trim();
export function songOfPedido(r, songs = []) {
    if (!isPedido(r)) return null;
    if (r.songId) {
        const byId = songs.find((s) => s.id === r.songId);
        if (byId) return byId;
    }
    const want = key(r.song);
    if (!want) return null;
    return songs.find((s) => key(s.title) === want) || null;
}

// A chat bubble's line over the text: "Marcos · 18:52", "Operador · 18:53".
export function chatHead(r) {
    const who = isOperator(r) ? OPERATOR : String(r?.sender || "").trim() || "Equipe";
    return [who, sentTime(r)].filter(Boolean).join(" · ");
}

// Who a pedido card names on top: "Pedido de Lucas", or "Anotado por você"
// for one the operator noted (S14 = A; with its "operador" badge).
export function pedidoBy(r) {
    if (isOperator(r)) return { lead: "Anotado por ", who: "você", operator: true };
    return { lead: "Pedido de ", who: String(r?.sender || "").trim() || "Equipe", operator: false };
}

const clip = (value, max) => String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);

// The operator's message in the Chat tab -> the ServiceMessage's fields
// (no serviceId: the console adds it), or null when there is nothing to send.
export function operatorChat(text, sentAt = new Date().toISOString()) {
    const t = String(text ?? "").trim().slice(0, PROTOCOL.limits.requestText);
    if (!t) return null;
    return { kind: "chat", side: "operator", sender: OPERATOR, text: t, status: "open", sentAt };
}

// A pedido the operator notes (Novo pedido; the phone's fields and limits:
// quem canta, o louvor — from the library or typed —, a note). songId only
// when that song is in the library. -> { fields } | { error, message }
export function operatorPedido({ singer, song, songId, note } = {}, songs = [], sentAt = new Date().toISOString()) {
    const title = clip(song, REQ.song.max);
    if (!title) return { error: "song", message: "Escreva o louvor ou escolha da biblioteca." };
    const fields = { kind: "pedido", side: "operator", sender: OPERATOR, song: title, status: "open", sentAt };
    const who = clip(singer, REQ.singer.max);
    if (who) fields.singer = who;
    const obs = String(note ?? "").trim().slice(0, REQ.note.max);
    if (obs) fields.text = obs;
    if (songId && songs.some((s) => s.id === songId)) fields.songId = songId;
    return { fields };
}
// The fields' maxLength in the Novo pedido form, the contract's.
export const PEDIDO_MAX = { singer: REQ.singer.max, song: REQ.song.max, note: REQ.note.max, chat: PROTOCOL.limits.requestText };

// The library's songs whose title (or artist) holds what was typed in O
// louvor, the first `n`, to pick one. Nothing typed = none.
export function songMatches(query, songs = [], n = 5) {
    const want = key(query);
    if (!want) return [];
    return songs.filter((s) => key(s.title).includes(want) || key(s.artist).includes(want)).slice(0, n);
}

// What a pedido gives the ServiceItem it becomes (its + Setlist, S13 = A):
// who sings, and its note as the item's notes.
export function pedidoItem(r) {
    if (!isPedido(r)) return {};
    const who = clip(r.singer, REQ.singer.max);
    const note = String(r.text || "").trim();
    return { ...(who ? { requested_by: who } : {}), ...(note ? { notes: note } : {}) };
}
// The Setlist's tag: the name the item keeps ("" = none).
export const singerOf = (item) => String(item?.requested_by || "").replace(/\s+/g, " ").trim();
