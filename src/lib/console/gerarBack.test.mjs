// node --test src/lib/console/gerarBack.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { statusBack, removeBack, replyTarget, replyBack, replyLine, REMOVED_NOTE } from "./gerarBack.js";

const ped = { id: "row-1", kind: "pedido", source: "gerar", external_id: "req-1", gerar_status: "in_review" };

test("Atendido and Desfazer go back to the GERAR; a phone's pedido or one closed there does not", () => {
    assert.deepEqual(statusBack(ped, true), { type: "status", requestId: "req-1", status: "completed", note: null });
    assert.deepEqual(statusBack(ped, false), { type: "status", requestId: "req-1", status: "in_review", note: null });
    assert.equal(statusBack({ ...ped, source: "" }, true), null);
    assert.equal(statusBack({ ...ped, gerar_status: "cancelled" }, true), null);
    assert.equal(statusBack({ ...ped, kind: "chat" }, true), null);
});

test("Excluir… cancels it in the GERAR with a note; never one already closed or completed", () => {
    assert.deepEqual(removeBack(ped), { type: "status", requestId: "req-1", status: "cancelled", note: REMOVED_NOTE });
    assert.equal(removeBack({ ...ped, gerar_status: "declined" }), null);
    assert.equal(removeBack({ ...ped, gerar_status: "completed" }), null);
    assert.equal(removeBack({ ...ped, source: "" }), null);
});

test("D7 = A: the reply goes to the culto of the GERAR's last message here; none = the phones only", () => {
    const evA = { id: "ev-a", title: "Culto A" };
    const evB = { id: "ev-b", title: "Culto B" };
    const rows = [
        { kind: "chat", source: "gerar", external_id: "m1", side: "team", gerar_event: evA },
        { kind: "chat", source: "", side: "team" },
        { kind: "pedido", source: "gerar", external_id: "r1", side: "team", gerar_event: evB },
        { kind: "chat", source: "gerar", external_id: "m2", side: "team", gerar_event: evB },
        { kind: "chat", side: "operator", gerar_event: evA, external_id: "x" },
    ];
    assert.deepEqual(replyTarget(rows), evB);
    assert.equal(replyTarget([{ kind: "chat", source: "", side: "team" }]), null);
    assert.equal(replyTarget(rows.slice(0, 3)).id, "ev-a", "a pedido is not a message to answer");
});

test("the reply's queue entry, and its line under the bubble", () => {
    const row = { id: "row-9", side: "operator", text: " Subindo agora " };
    assert.deepEqual(replyBack(row, { id: "ev-b" }, "c-1"), { type: "chat", eventId: "ev-b", clientMessageId: "c-1", text: "Subindo agora", rowId: "row-9" });
    assert.equal(replyBack(row, null, "c-1"), null);
    assert.deepEqual(replyLine({ side: "operator", gerar_event: { id: "ev-b" } }), { tone: "wait", words: "esperando para ir ao GERAR" });
    assert.deepEqual(replyLine({ side: "operator", gerar_event: { id: "ev-b" }, external_id: "m-77" }), { tone: "ok", words: "enviada ao GERAR" });
    assert.equal(replyLine({ side: "operator" }), null);
    assert.equal(replyLine({ side: "team", gerar_event: { id: "ev-b" } }), null);
});
