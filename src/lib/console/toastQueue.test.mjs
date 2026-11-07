import { test } from "node:test";
import assert from "node:assert/strict";
import { pushToast, nextToast, dropToast, toastMs, emptyToasts, TOAST_QUEUE, waitsToBeSeen, replaysWave, WAVE_MS } from "./toastQueue.js";

const undo = { label: "Desfazer", run: () => {} };

test("toasts last 3 s, 6 s when long, 8 s with an action", () => {
    assert.equal(toastMs("Tema em uso."), 3000);
    assert.equal(toastMs("x".repeat(81)), 6000);
    assert.equal(toastMs("Projeção encerrada.", undo), 8000);
    assert.equal(pushToast(emptyToasts, { id: 1, text: "Oi" }).cur.ms, 3000);
});

test("a plain toast replaces a plain one, as before", () => {
    let s = pushToast(emptyToasts, { id: 1, text: "Um" });
    s = pushToast(s, { id: 2, text: "Dois" });
    assert.equal(s.cur.text, "Dois");
    assert.deepEqual(s.queue, []);
});

test("a plain toast never replaces Desfazer: it waits behind it", () => {
    let s = pushToast(emptyToasts, { id: 1, text: "Projeção encerrada.", action: undo });
    s = pushToast(s, { id: 2, text: "Tema em uso." });
    assert.equal(s.cur.id, 1, "Desfazer stays");
    assert.deepEqual(s.queue.map((t) => t.text), ["Tema em uso."]);
    s = nextToast(s);
    assert.equal(s.cur.text, "Tema em uso.", "it shows when Desfazer is done");
    assert.deepEqual(nextToast(s), emptyToasts);
});

test("the newest action takes the place; the queue keeps its last few", () => {
    let s = pushToast(emptyToasts, { id: 1, text: "Projeção encerrada.", action: undo });
    for (let i = 0; i < TOAST_QUEUE + 2; i++) s = pushToast(s, { id: 10 + i, text: `t${i}` });
    assert.equal(s.queue.length, TOAST_QUEUE);
    assert.equal(s.queue[0].text, "t2", "the oldest waiting ones drop");
    s = pushToast(s, { id: 2, text: "Celular: projeção encerrada.", action: undo });
    assert.equal(s.cur.id, 2);
    assert.equal(s.queue.length, TOAST_QUEUE);
});

test("replace and dropToast: the Setlist automática's countdown answered another way (Rodada N2)", () => {
    const count = pushToast(emptyToasts, { id: 1, text: "Próximo em 5 s: Abertura", action: { label: "Cancelar" }, ms: 5000 });
    assert.equal(count.cur.ms, 5000, "it lasts its pause");
    assert.equal(pushToast(count, { id: 2, text: "Cancelado" }).cur.id, 1, "a plain toast waits behind it");
    assert.equal(pushToast(count, { id: 2, text: "Cancelado", replace: true }).cur.id, 2, "unless it answers it");
    assert.equal(dropToast(count, "Próximo em 5 s: Abertura").cur, null);
    assert.equal(dropToast(count, "outro"), count);
    assert.equal(dropToast(emptyToasts, "x"), emptyToasts);
});

test("an important toast shows 6 s at least and is never swallowed by a plain one", () => {
    assert.equal(toastMs("Pedido de Ana", null, true), 6000);
    assert.equal(toastMs("x".repeat(81), null, true), 6000);
    assert.equal(toastMs("Pedido", undo, true), 8000, "an action keeps its longer time");
    const imp = pushToast(emptyToasts, { id: 1, text: "Pedido de Ana: Grande é o Senhor", important: true });
    assert.equal(imp.cur.ms, 6000);
    const after = pushToast(imp, { id: 2, text: "Tema em uso." });
    assert.equal(after.cur.id, 1, "the plain one waits");
    assert.equal(after.queue.length, 1);
    assert.equal(nextToast(after).cur.id, 2, "and shows after it");
    assert.equal(pushToast(imp, { id: 3, text: "Mensagem de Rui", important: true }).cur.id, 3, "a newer important one takes the place");
    assert.equal(pushToast(imp, { id: 4, text: "Cancelado", replace: true }).cur.id, 4);
});

test("an important toast waits to be seen, and its wave plays again if it ran out unseen", () => {
    assert.equal(waitsToBeSeen({ text: "Pedido de Ana", important: true }), true);
    assert.equal(waitsToBeSeen({ text: "Tema em uso." }), false, "a plain toast counts from the start");
    assert.equal(waitsToBeSeen(null), false);
    assert.equal(replaysWave(0, 1000), true, "it never played (the console was hidden): it plays when seen");
    assert.equal(replaysWave(1000, 1000 + 200), false, "the operator is right there: no second wave");
    assert.equal(replaysWave(1000, 1000 + WAVE_MS), true, "it played out unseen: once more");
    assert.ok(WAVE_MS > 4000 && WAVE_MS < 6000, "about five seconds, three rings");
});
