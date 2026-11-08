const test = require("node:test");
const assert = require("node:assert/strict");
const { createNotifications, consoleNote, KEEP } = require("./notifications.cjs");

test("the console adds only its own kinds and actions, the text short", () => {
    assert.deepEqual(consoleNote({ key: "pedido:r1", kind: "pedido", title: "  Pedido de Ana:\n Santo ", body: "Quem canta: Ana", action: "painel:pedidos" }),
        { key: "console:pedido:r1", kind: "pedido", title: "Pedido de Ana: Santo", body: "Quem canta: Ana", action: "painel:pedidos" });
    assert.equal(consoleNote({ kind: "update", title: "Atualize", action: "update" }), null, "main's kinds stay main's");
    assert.equal(consoleNote({ kind: "pedido", title: "  " }), null);
    assert.equal(consoleNote({ kind: "pedido", title: "x", action: "update" }).action, null);
    assert.equal(consoleNote({ kind: "pedido", title: "x".repeat(500) }).title.length, 120);
    assert.equal(consoleNote(null), null);
});

function memorySettings(initial = {}) {
    const store = { ...initial };
    return { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; }, store };
}

test("added notifications are unread, newest first, kept in settings, and pushed", () => {
    const settings = memorySettings();
    const pushed = [];
    let t = Date.UTC(2026, 9, 9, 12, 0);
    const n = createNotifications({ settings, now: () => new Date(t), onChange: (l) => pushed.push(l.length) });
    n.add({ key: "a", title: "Primeira" });
    t += 1000;
    n.add({ key: "b", kind: "update", title: "Segunda", action: "update" });
    assert.deepEqual(n.list().map((x) => x.title), ["Segunda", "Primeira"]);
    assert.equal(n.unread(), 2);
    assert.deepEqual(pushed, [1, 2]);
    assert.equal(settings.store.notifications.length, 2);
    // Survives a restart.
    assert.equal(createNotifications({ settings }).unread(), 2);
});

test("the same key refreshes instead of piling up; unread again only when the text changed", () => {
    const n = createNotifications({ settings: memorySettings() });
    n.add({ key: "update", title: "A versão 0.2.7 está disponível." });
    n.markAllRead();
    n.add({ key: "update", title: "A versão 0.2.7 está disponível." });
    assert.equal(n.list().length, 1);
    assert.equal(n.unread(), 0, "same text: stays read");
    n.add({ key: "update", title: "A versão 0.2.7 foi baixada." });
    assert.equal(n.list().length, 1);
    assert.equal(n.unread(), 1, "new text: unread again");
});

test("read, dismiss, remove, clear, and the list is capped", () => {
    const n = createNotifications({ settings: memorySettings() });
    for (let i = 0; i < KEEP + 5; i += 1) n.add({ title: `n${i}` });
    assert.equal(n.list().length, KEEP);
    assert.equal(n.list()[0].title, `n${KEEP + 4}`, "the oldest go first");
    n.markAllRead();
    assert.equal(n.unread(), 0);
    n.dismiss(n.list()[0].id);
    assert.equal(n.list().length, KEEP - 1);
    n.remove((x) => x.title === "n10");
    assert.ok(!n.list().some((x) => x.title === "n10"));
    n.clear();
    assert.equal(n.list().length, 0);
});

test("a broken settings value is ignored", () => {
    assert.deepEqual(createNotifications({ settings: memorySettings({ notifications: "x" }) }).list(), []);
    assert.deepEqual(createNotifications({ settings: memorySettings({ notifications: [null, { id: "1" }] }) }).list(), []);
});
