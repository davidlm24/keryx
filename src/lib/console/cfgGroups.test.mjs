import { test } from "node:test";
import assert from "node:assert/strict";
import { GROUPS_KEY, loadGroups, saveGroups, isOpen, setOpen, toggle } from "./cfgGroups.js";

// A localStorage stand-in.
const memory = (init = {}) => {
    const m = new Map(Object.entries(init));
    return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), map: m };
};

test("cfgGroups: a group follows its default until the operator chooses", () => {
    assert.equal(isOpen({}, "telas.transicoes", false), false);
    assert.equal(isOpen({}, "telas.transicoes", true), true);
    assert.equal(isOpen({}, "telas.transicoes"), true, "open by default");
    assert.equal(isOpen({ "telas.transicoes": true }, "telas.transicoes", false), true);
    assert.equal(isOpen({ "telas.transicoes": false }, "telas.transicoes", true), false);
    assert.equal(isOpen(null, "x", false), false);
});

test("cfgGroups: only deviations from the default are kept", () => {
    const closedByDefault = (g, open) => setOpen(g, "telas.transicoes", open, false);
    assert.deepEqual(closedByDefault({}, true), { "telas.transicoes": true });
    assert.deepEqual(closedByDefault({ "telas.transicoes": true }, false), {}, "back to the default: gone from the store");
    assert.deepEqual(setOpen({ other: false }, "a", false, true), { other: false, a: false }, "other groups untouched");
    const g0 = { other: false };
    setOpen(g0, "a", false, true);
    assert.deepEqual(g0, { other: false }, "a new object, never a mutation");
    // toggle flips from whatever the group shows now.
    assert.deepEqual(toggle({}, "t", false), { t: true });
    assert.deepEqual(toggle({ t: true }, "t", false), {});
    assert.deepEqual(toggle({}, "t", true), { t: false });
    assert.deepEqual(toggle({ t: false }, "t", true), {});
});

test("cfgGroups: the store round-trips, drops junk and clears when empty", () => {
    const s = memory();
    saveGroups({ a: true, b: false }, s);
    assert.deepEqual(loadGroups(s), { a: true, b: false });
    assert.equal(s.getItem(GROUPS_KEY), JSON.stringify({ a: true, b: false }));
    saveGroups({}, s);
    assert.equal(s.getItem(GROUPS_KEY), null, "no deviations: no key");
    assert.deepEqual(loadGroups(memory({ [GROUPS_KEY]: "not json" })), {});
    assert.deepEqual(loadGroups(memory({ [GROUPS_KEY]: "[1,2]" })), {});
    assert.deepEqual(loadGroups(memory({ [GROUPS_KEY]: JSON.stringify({ a: true, b: "yes", c: 1 }) })), { a: true }, "only booleans count");
    assert.deepEqual(loadGroups(null), {}, "no storage at all (a test, SSR)");
    assert.deepEqual(loadGroups({ getItem() { throw new Error("blocked"); } }), {}, "a storage that refuses");
    assert.doesNotThrow(() => saveGroups({ a: true }, { setItem() { throw new Error("full"); }, removeItem() {} }));
});
