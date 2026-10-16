// node --test src/lib/console/syncView.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { ago, syncStep, syncState, computerRows, sinceLine } from "./syncView.js";

const NOW = Date.parse("2026-10-16T20:00:00.000Z");
const minus = (ms) => new Date(NOW - ms).toISOString();
const base = { available: true, folder: "G:\\Meu Drive\\KERYX", paired: true, paused: false, keyLost: false, pc: "me", name: "IGREJA-SOM", version: "0.2.20", since: { sent: 1, applied: 31 }, engine: { state: "ok", lastPass: minus(12000), computers: [] } };

test("ago: seconds, minutes, hours, yesterday, days", () => {
    assert.equal(ago(minus(12000), NOW), "há 12 s");
    assert.equal(ago(minus(3 * 60000), NOW), "há 3 min");
    assert.equal(ago(minus(60 * 60000), NOW), "há 1 hora");
    assert.equal(ago(minus(5 * 3600000), NOW), "há 5 horas");
    assert.equal(ago(minus(30 * 3600000), NOW), "ontem");
    assert.equal(ago(minus(9 * 86400000), NOW), "há 9 dias");
    assert.equal(ago(null, NOW), "");
});

test("the step: the preview, the folder, the code, on", () => {
    assert.equal(syncStep({ available: false }), "unavailable");
    assert.equal(syncStep({ ...base, folder: null }), "folder");
    assert.equal(syncStep({ ...base, paired: false }), "code");
    assert.equal(syncStep({ ...base, keyLost: true }), "code");
    assert.equal(syncStep({ ...base, engine: { state: "mismatch" } }), "code");
    assert.equal(syncStep({ ...base, engine: { state: "removed" } }), "code");
    assert.equal(syncStep(base), "on");
    assert.equal(syncStep({ ...base, paused: true }), "on");
});

test("the Estado row", () => {
    assert.deepEqual(syncState(base, NOW), { tone: "ok", label: "Em dia", detail: "última passagem há 12 s" });
    assert.equal(syncState({ ...base, paused: true }, NOW).label, "Pausada");
    assert.equal(syncState({ ...base, engine: { state: "offline", error: "A pasta de sincronização não está disponível." } }, NOW).tone, "wait");
    assert.match(syncState({ ...base, engine: { state: "mismatch" } }, NOW).label, /código/);
    assert.equal(syncState({ ...base, engine: { state: "off" } }, NOW).label, "Começando…");
    assert.match(syncState({ ...base, keyLost: true }, NOW).label, /de novo/);
    assert.match(syncState({ ...base, engine: { state: "removed" } }, NOW).label, /tirado/);
});

test("the computers: this one first, the others with when they wrote, the ones without the code flagged", () => {
    const st = { ...base, engine: { state: "ok", computers: [
        { pc: "a", name: "NOTEBOOK-PASTOR", version: "0.2.20", lastChange: minus(3 * 60000), verified: true, rejected: 0 },
        { pc: "b", name: "RECEPCAO", version: "0.2.19", lastChange: minus(9 * 86400000), verified: true, rejected: 0 },
        { pc: "c7f0aa", name: null, lastChange: minus(60000), verified: false, rejected: 4 },
        { pc: "d", name: "NOVO", seen: minus(120000), verified: true, rejected: 0 },
        { pc: "e", name: "VELHO", lastChange: minus(86400000 * 40), verified: true, rejected: 0, removed: { at: minus(3600000), by: "me" } },
    ] } };
    const rows = computerRows(st, NOW);
    assert.deepEqual(rows.map((r) => [r.name, r.tone, r.detail, r.tag]), [
        ["IGREJA-SOM", "ok", "este computador · KERYX 0.2.20", "este"],
        ["NOTEBOOK-PASTOR", "ok", "escreveu há 3 min · 0.2.20", "verificado"],
        ["RECEPCAO", "off", "escreveu há 9 dias · 0.2.19", "verificado"],
        ["Computador C7F0", "wait", "4 mudanças ignoradas", "sem o código"],
        ["NOVO", "ok", "visto há 2 min", "verificado"],
        ["VELHO", "off", "tirado há 1 hora por este computador", "tirado"],
    ]);
    assert.equal(sinceLine(st), "1 mudança enviada · 31 recebidas");
});
