// node --test src/lib/console/syncView.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { ago, syncStep, syncState, computerRows, sinceLine, sameSyncStatus, biblesMissingHere, editionsList, syncSummary, SYNC_TRAVEL_SUMMARY } from "./syncView.js";

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

test("sameSyncStatus: a poll that says nothing new changes nothing", () => {
    // Every poll's answer is a new object from IPC, with the same content between passes.
    const again = JSON.parse(JSON.stringify(base));
    assert.notEqual(again, base);
    assert.equal(sameSyncStatus(base, again), true);
    assert.equal(sameSyncStatus(base, base), true);
    // A computer that does not sync: the same answer every 4 s.
    const off = { available: true, folder: null, paused: false, paired: false, since: { sent: 0 }, engine: { state: "idle" } };
    assert.equal(sameSyncStatus(off, JSON.parse(JSON.stringify(off))), true);
    // A pass ran, a counter moved, paused, the folder chosen: each is new.
    assert.equal(sameSyncStatus(base, { ...base, engine: { ...base.engine, lastPass: minus(1000) } }), false);
    assert.equal(sameSyncStatus(base, { ...base, since: { ...base.since, applied: 32 } }), false);
    assert.equal(sameSyncStatus(base, { ...base, paused: true }), false);
    assert.equal(sameSyncStatus(off, { ...off, folder: "G:\\Meu Drive\\KERYX" }), false);
    // The first answer is never the same as nothing.
    assert.equal(sameSyncStatus(null, base), false);
    assert.equal(sameSyncStatus(base, null), false);
});

test("the Bible editions the other computers have and this one lacks", () => {
    const pc = (id, bibles, extra = {}) => ({ pc: id, name: id, verified: true, bibles, ...extra });
    const st = (computers) => ({ ...base, engine: { ...base.engine, computers } });
    assert.equal(biblesMissingHere(st([]), ["NVI"]), null, "alone in the folder");
    assert.equal(biblesMissingHere(st([pc("b", ["NVI"])]), ["nvi"]), null, "nothing missing");
    assert.deepEqual(biblesMissingHere(st([pc("b", ["ACF", "NVI"])]), ["ACF"]), {
        elsewhere: ["ACF", "NVI"], missing: ["NVI"], own: [], line: "Instaladas no outro computador: ACF e NVI. Falta a NVI aqui.",
    });
    // An edition of the church's own: asked for by its file, never downloaded.
    const bkj = biblesMissingHere(st([pc("b", ["BKJ", "NVI"])]), ["NVI"]);
    assert.deepEqual(bkj.own, ["BKJ"]);
    assert.equal(bkj.line, "Instaladas no outro computador: BKJ e NVI. Falta a BKJ aqui. A BKJ é uma edição da igreja: instale-a com o mesmo arquivo, em Instalar uma edição própria…");
    const many = biblesMissingHere(st([pc("b", ["NVI"]), pc("c", ["AA", "NVI"]), pc("d", ["ACF"], { verified: false }), pc("e", ["ACF"], { removed: { at: "x" } })]), []);
    assert.deepEqual(many.missing, ["AA", "NVI"], "computers without the code or taken out do not count");
    assert.equal(many.line, "Instaladas nos outros computadores: AA e NVI. Faltam a AA e a NVI aqui.");
    assert.equal(editionsList(["NVI", "ACF", "AA"]), "NVI, ACF e AA");
});

test("Código da igreja's summary counts the computers that hold the code", () => {
    assert.equal(syncSummary(base), "1 computador com o código");
    const withOthers = { ...base, engine: { state: "ok", computers: [{ pc: "b", verified: true }, { pc: "c", verified: false }, { pc: "d", verified: true, removed: { at: minus(1000), by: "me" } }, { pc: "e" }] } };
    assert.equal(syncSummary(withOthers), "3 computadores com o código", "this one, a verified one and one nobody checked; not the one without the code, not the removed one");
    assert.ok(SYNC_TRAVEL_SUMMARY.includes("vão") && SYNC_TRAVEL_SUMMARY.includes("ficam"));
});
