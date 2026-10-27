import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { DEFAULT_BIBLES, MAX_TRIES, emptySetup, normalizeSetup, chooseSetup, dismissSetup, pendingSetup, afterInstall, setupStatus } from "./bibleSetup.mjs";

const require = createRequire(import.meta.url);
const { SOURCES } = require("../electron/bible.cjs");
const KNOWN = Object.keys(SOURCES);
const AT = "2026-10-27T12:00:00.000Z";

test("the default set installs from the sources bible.cjs knows, publishers' editions all", () => {
    for (const v of DEFAULT_BIBLES) assert.ok(SOURCES[v], `${v} has no source`);
    assert.deepEqual(DEFAULT_BIBLES, ["NVI", "ARA", "ARC", "NTLH"]);
});

test("normalizeSetup takes anything settings.json may hold", () => {
    assert.deepEqual(normalizeSetup(null), emptySetup());
    assert.deepEqual(normalizeSetup([1]), emptySetup());
    assert.deepEqual(normalizeSetup({ asked: "", wanted: ["NVI", 3, "NVI", ""], done: "x", failed: { ARA: 2, ARC: "why" }, tries: { NVI: 0, ARA: 2, ARC: "1" } }),
        { asked: null, wanted: ["NVI"], done: [], failed: { ARC: "why" }, tries: { ARA: 2 } });
});

test("choose keeps the known siglas in the dialog's order and tries a failed one again", () => {
    const before = { ...emptySetup(), failed: { ARA: "ruim" }, tries: { ARC: 2 } };
    const s = chooseSetup(before, ["ARA", "XYZ", "NVI", "ARA"], KNOWN, AT);
    assert.deepEqual(s, { asked: AT, wanted: ["ARA", "NVI"], done: [], failed: {}, tries: { ARC: 2 } });
    assert.deepEqual(dismissSetup(s, "later"), { ...s, asked: "later", wanted: [] });
});

test("pending leaves out what is done, given up or already here", () => {
    const s = { ...chooseSetup(emptySetup(), DEFAULT_BIBLES, KNOWN, AT), done: ["NVI"], failed: { ARC: "x" } };
    assert.deepEqual(pendingSetup(s, { ARA: 31000 }), ["NTLH"]);
    assert.deepEqual(pendingSetup(s), ["ARA", "NTLH"]);
});

test("afterInstall: ok is done, no internet stops the pass, a bad file gives up, the source's errors give up at MAX_TRIES", () => {
    const base = chooseSetup(emptySetup(), ["NVI", "ARA"], KNOWN, AT);
    let r = afterInstall(base, "NVI", { ok: true });
    assert.deepEqual(r, { state: { ...base, done: ["NVI"] }, stop: false });
    r = afterInstall(r.state, "ARA", { error: { status: 503, message: "Sem conexão" } });
    assert.equal(r.stop, true);
    assert.deepEqual(r.state.tries, {});
    r = afterInstall(r.state, "ARA", { error: { status: 504, message: "demorou" } });
    assert.equal(r.stop, true);
    r = afterInstall(r.state, "ARA", { error: { status: 400, message: "não é uma Bíblia inteira" } });
    assert.deepEqual(r, { state: { ...base, done: ["NVI"], failed: { ARA: "não é uma Bíblia inteira" } }, stop: false });
    // The source answering wrong: counted, given up at MAX_TRIES.
    let s = base;
    for (let i = 1; i < MAX_TRIES; i++) {
        s = afterInstall(s, "NVI", { error: { status: 502, message: "HTTP 500" } }).state;
        assert.equal(s.tries.NVI, i);
        assert.equal(s.failed.NVI, undefined);
    }
    s = afterInstall(s, "NVI", { error: { status: 502, message: "HTTP 500" } }).state;
    assert.deepEqual(s.tries, {});
    assert.equal(s.failed.NVI, "HTTP 500");
    // Chosen again: from zero.
    assert.deepEqual(chooseSetup(s, ["NVI"], KNOWN, AT).failed, {});
    // An outcome with no message still says something.
    assert.equal(afterInstall(base, "ARA", { error: { status: 400 } }).state.failed.ARA, "Não foi possível baixar.");
});

test("setupStatus: what came, what waits, what was given up; finished once nothing waits", () => {
    assert.deepEqual(setupStatus(emptySetup()), { asked: null, wanted: [], done: [], pending: [], failed: {}, finished: false });
    const s = { ...chooseSetup(emptySetup(), DEFAULT_BIBLES, KNOWN, AT), done: ["NVI"], failed: { ARC: "x", KJA: "old" } };
    assert.deepEqual(setupStatus(s, { ARA: 31000 }), { asked: AT, wanted: DEFAULT_BIBLES, done: ["NVI", "ARA"], pending: ["NTLH"], failed: { ARC: "x" }, finished: false });
    assert.equal(setupStatus({ ...s, done: ["NVI", "NTLH"] }, { ARA: 1 }).finished, true);
});
