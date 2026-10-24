import test from "node:test";
import assert from "node:assert/strict";
import {
    messagesInOrder, messageSay, freshMessages, hasUnread, newestAt, songOfPedido, FRESH_MS,
    isOperator, pedidosOf, chatOf, tabOf, chatHead, pedidoBy, operatorChat, operatorPedido, songMatches, pedidoItem, singerOf, PEDIDO_MAX,
} from "./pedidos.js";

const row = (id, sentAt, extra = {}) => ({ id, sentAt, kind: "chat", sender: "Ana", text: "oi", status: "open", ...extra });

test("the rows in the order they came, the newest last", () => {
    const rows = [row("b", "2026-10-23T19:05:00.000Z"), row("a", "2026-10-23T18:52:00.000Z"), row("c", "2026-10-23T19:07:00.000Z")];
    assert.deepEqual(messagesInOrder(rows).map((r) => r.id), ["a", "b", "c"]);
    assert.deepEqual(rows.map((r) => r.id), ["b", "a", "c"], "the list given is not changed");
});

test("what the toast says of a chat and of a pedido", () => {
    assert.equal(messageSay(row("a", "x", { sender: "Marcos" })), "Mensagem de Marcos");
    assert.equal(messageSay(row("a", "x", { kind: "pedido", sender: "Lucas", song: "Bondade de Deus" })), "Pedido de Lucas: Bondade de Deus");
    assert.equal(messageSay(row("a", "x", { kind: "pedido", sender: "Lucas", song: "" })), "Pedido de Lucas");
    assert.equal(messageSay(row("a", "x", { sender: " " })), "Mensagem de alguém da equipe");
});

test("only a row sent in the last 2 minutes and never said is announced", () => {
    const now = Date.parse("2026-10-23T19:10:00.000Z");
    const rows = [
        row("old", new Date(now - FRESH_MS - 1000).toISOString()),
        row("new", new Date(now - 30_000).toISOString()),
        row("told", new Date(now - 10_000).toISOString()),
    ];
    assert.deepEqual(freshMessages(rows, new Set(["told"]), now).map((r) => r.id), ["new"]);
    assert.deepEqual(freshMessages(rows, new Set(["told", "new"]), now), [], "never twice");
});

test("the tab's dot: a row newer than the last one seen", () => {
    const rows = [row("a", "2026-10-23T18:52:00.000Z"), row("b", "2026-10-23T19:05:00.000Z")];
    assert.equal(hasUnread(rows, ""), true, "nothing seen yet");
    assert.equal(hasUnread(rows, "2026-10-23T19:00:00.000Z"), true);
    assert.equal(hasUnread(rows, newestAt(rows)), false);
    assert.equal(hasUnread([], ""), false);
    assert.equal(newestAt(rows), "2026-10-23T19:05:00.000Z");
});

test("a pedido's song: its songId, else the title without accents", () => {
    const songs = [{ id: "s1", title: "Bondade de Deus" }, { id: "s2", title: "Tua Graça Me Basta" }];
    const p = (extra) => row("p", "x", { kind: "pedido", ...extra });
    assert.equal(songOfPedido(p({ songId: "s2", song: "outra" }), songs)?.id, "s2");
    assert.equal(songOfPedido(p({ songId: "gone", song: "bondade  de deus" }), songs)?.id, "s1", "a songId not here falls back to the title");
    assert.equal(songOfPedido(p({ song: "tua graca me basta!" }), songs)?.id, "s2");
    assert.equal(songOfPedido(p({ song: "Raridade" }), songs), null);
    assert.equal(songOfPedido(p({ song: "" }), songs), null);
    assert.equal(songOfPedido(row("c", "x", { song: "Bondade de Deus" }), songs), null, "a chat names no song");
});

test("each tab its own rows (S12 = B): Pedidos the pedidos, Chat the messages", () => {
    const rows = [row("c2", "2026-10-23T19:03:00.000Z"), row("p1", "2026-10-23T19:01:00.000Z", { kind: "pedido" }), row("c1", "2026-10-23T18:52:00.000Z", { side: "operator" })];
    assert.deepEqual(pedidosOf(rows).map((r) => r.id), ["p1"]);
    assert.deepEqual(chatOf(rows).map((r) => r.id), ["c1", "c2"], "oldest first, the operator's too");
    assert.equal(tabOf(rows[1]), "pedidos");
    assert.equal(tabOf(rows[0]), "chat");
});

test("what the operator wrote is never announced nor a dot", () => {
    const now = Date.parse("2026-10-23T19:10:00.000Z");
    const mine = row("me", new Date(now - 5000).toISOString(), { side: "operator", sender: "Operador" });
    const team = row("team", new Date(now - 4000).toISOString(), { side: "team" });
    const old = row("old", new Date(now - 3000).toISOString());
    assert.equal(isOperator(mine), true);
    assert.equal(isOperator(team), false);
    assert.equal(isOperator(old), false, "a row of before (no side) is the Equipe's");
    assert.deepEqual(freshMessages([mine, team, old], new Set(), now).map((r) => r.id), ["team", "old"]);
    assert.equal(hasUnread([mine], ""), false);
    assert.equal(hasUnread([mine, team], mine.sentAt), true);
});

test("a bubble's head and a pedido card's", () => {
    const at = new Date(2026, 9, 23, 18, 52).toISOString();
    assert.equal(chatHead(row("a", at, { sender: "Marcos" })), "Marcos · 18:52");
    assert.equal(chatHead(row("a", at, { side: "operator", sender: "Operador" })), "Operador · 18:52");
    assert.equal(chatHead(row("a", at, { sender: " " })), "Equipe · 18:52");
    assert.deepEqual(pedidoBy(row("p", at, { kind: "pedido", sender: "Lucas" })), { lead: "Pedido de ", who: "Lucas", operator: false });
    assert.deepEqual(pedidoBy(row("p", at, { kind: "pedido", side: "operator" })), { lead: "Anotado por ", who: "você", operator: true });
});

test("the operator's chat message: trimmed, at most the contract's length, nothing when empty", () => {
    const at = "2026-10-23T19:02:00.000Z";
    assert.deepEqual(operatorChat("  Já mudei para Sol. ", at), { kind: "chat", side: "operator", sender: "Operador", text: "Já mudei para Sol.", status: "open", sentAt: at });
    assert.equal(operatorChat("   ", at), null);
    assert.equal(operatorChat("x".repeat(400), at).text.length, PEDIDO_MAX.chat);
});

test("a pedido the operator notes (S14 = A)", () => {
    const at = "2026-10-23T19:09:00.000Z";
    const songs = [{ id: "s1", title: "Great Is Thy Faithfulness" }];
    assert.deepEqual(operatorPedido({ singer: " Diác.  Marcos ", song: "Great Is Thy Faithfulness", songId: "s1", note: " Pediu no corredor. " }, songs, at).fields, {
        kind: "pedido", side: "operator", sender: "Operador", song: "Great Is Thy Faithfulness", status: "open", sentAt: at,
        singer: "Diác. Marcos", text: "Pediu no corredor.", songId: "s1",
    });
    assert.equal(operatorPedido({ song: "Raridade", songId: "gone" }, songs, at).fields.songId, undefined, "a song no longer here is only its title");
    assert.deepEqual(Object.keys(operatorPedido({ song: "Raridade" }, songs, at).fields).sort(), ["kind", "sender", "sentAt", "side", "song", "status"]);
    assert.equal(operatorPedido({ singer: "Ana", song: " " }, songs, at).error, "song");
    assert.equal(operatorPedido({ song: "y".repeat(200) }, songs, at).fields.song.length, PEDIDO_MAX.song);
});

test("the library's songs that match what was typed", () => {
    const songs = [{ id: "a", title: "Bondade de Deus", artist: "Isaias Saad" }, { id: "b", title: "Tua Graça Me Basta" }, { id: "c", title: "Raridade", artist: "Anderson Freire" }];
    assert.deepEqual(songMatches("graca", songs).map((s) => s.id), ["b"]);
    assert.deepEqual(songMatches("anderson", songs).map((s) => s.id), ["c"], "the artist counts");
    assert.deepEqual(songMatches("", songs), []);
    assert.equal(songMatches("a", songs, 2).length, 2);
});

test("a pedido on the Setlist keeps who sings and its note (S13 = A)", () => {
    const p = row("p", "x", { kind: "pedido", singer: " Ana  Souza ", text: "Depois da oferta" });
    assert.deepEqual(pedidoItem(p), { requested_by: "Ana Souza", notes: "Depois da oferta" });
    assert.deepEqual(pedidoItem(row("p", "x", { kind: "pedido", text: "" })), {});
    assert.deepEqual(pedidoItem(row("c", "x")), {}, "a chat gives nothing");
    assert.equal(singerOf({ requested_by: " Ana " }), "Ana");
    assert.equal(singerOf({}), "");
});
