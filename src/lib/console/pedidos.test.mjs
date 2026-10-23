import test from "node:test";
import assert from "node:assert/strict";
import { messagesInOrder, messageSay, freshMessages, hasUnread, newestAt, songOfPedido, FRESH_MS } from "./pedidos.js";

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
