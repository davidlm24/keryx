import { test } from "node:test";
import assert from "node:assert/strict";
import { initialConnection, nextConnection, connectionText } from "./connection.js";

test("connection: first tries stay 'connecting', counting; open resets", () => {
    let s = initialConnection;
    s = nextConnection(s, "error");
    s = nextConnection(s, "error");
    assert.deepEqual(s, { phase: "connecting", attempt: 2, everOpen: false });
    s = nextConnection(s, "open");
    assert.deepEqual(s, { phase: "open", attempt: 0, everOpen: true });
});

test("connection: a drop after being open is 'reconnecting', tries counted from 1", () => {
    let s = nextConnection(initialConnection, "open");
    s = nextConnection(s, "error");
    assert.deepEqual(s, { phase: "reconnecting", attempt: 1, everOpen: true });
    s = nextConnection(s, "error");
    assert.equal(s.attempt, 2);
    assert.equal(nextConnection(s, "open").phase, "open");
});

test("connection: unknown events change nothing", () => {
    const s = nextConnection(initialConnection, "open");
    assert.equal(nextConnection(s, "ping"), s);
});

test("connectionText: nothing when open; pt-BR wording with the try; hint after 3 failures", () => {
    assert.equal(connectionText({ phase: "open", attempt: 0, everOpen: true }), null);
    assert.deepEqual(connectionText(initialConnection), { title: "Conectando ao KERYX…", hint: "" });
    assert.equal(connectionText({ phase: "reconnecting", attempt: 2, everOpen: true }).title, "Reconectando… tentativa 2");
    assert.match(connectionText({ phase: "connecting", attempt: 3, everOpen: false }).hint, /mesma rede/);
});
