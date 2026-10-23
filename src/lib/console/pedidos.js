// The Pedidos tab (Rodada Q, PR2): the Equipe's chat and song requests of
// the culto (ServiceMessage rows, made by the controle remoto's runner or
// synced from another computer). Pure: the tab, the console's toast and the
// tab's unread dot read it. Every text here came from a phone: the tab
// renders it as plain text, never as HTML.
import { fold } from "../bibleSearch.js";

// A row is fresh for the toast this long after it was sent (a row that
// arrives later, by the sync after a pause, is listed but says nothing).
export const FRESH_MS = 2 * 60 * 1000;

const at = (r) => String(r?.sentAt || "");
const ms = (r) => Date.parse(at(r)) || 0;

// In the order they came (oldest first, the newest at the bottom, as a chat).
export const messagesInOrder = (rows = []) => rows.slice().sort((a, b) => at(a).localeCompare(at(b)) || String(a.id).localeCompare(String(b.id)));

export const isPedido = (r) => r?.kind === "pedido";
export const isDone = (r) => r?.status === "done";

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
// (`told`: the ids already said, kept by the caller). Oldest first.
export function freshMessages(rows = [], told = new Set(), now = Date.now()) {
    return messagesInOrder(rows).filter((r) => r?.id && !told.has(r.id) && Math.abs(now - ms(r)) <= FRESH_MS);
}

// The tab's dot: a row sent after the last one the operator saw (`seen`,
// an ISO time; none = everything is new).
export const hasUnread = (rows = [], seen = "") => rows.some((r) => at(r) > String(seen || ""));

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
