import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { WHILE_LOCKED, OP_NAMES } from "./live-state.mjs";
import { REMOTE_LABEL } from "../src/lib/console/remote.js";

// The controle remoto's contract (Rodada G6): the server (electron/lan.cjs),
// the console's runner and the phone all code against shared/remoteProtocol.json
// (main with require(), pages with `import … with { type: "json" }`).
const require = createRequire(import.meta.url);
const PROTOCOL = require("./remoteProtocol.json");
const { REMOTE_ACTIONS } = require("../electron/lan.cjs");
const { actions } = PROTOCOL;
const ARG_TYPES = new Set(["enum", "int", "bool", "id", "str"]);

test("the contract is version 2", () => {
    assert.equal(PROTOCOL.version, 2);
});

test("every action lan.cjs takes today is in the contract", () => {
    for (const action of REMOTE_ACTIONS) assert.ok(actions[action], action);
});

test("every action has a kind, a label unless it only reads, and a known cap", () => {
    for (const [name, a] of Object.entries(actions)) {
        assert.ok(["R", "S", "T"].includes(a.kind), `${name}: kind`);
        if (a.kind !== "R") assert.ok(typeof a.label === "string" && a.label.trim(), `${name}: label`);
        if (a.cap !== undefined) assert.ok(PROTOCOL.caps.includes(a.cap), `${name}: cap ${a.cap}`);
        if (a.result !== undefined) assert.ok(PROTOCOL.results[a.result], `${name}: result ${a.result}`);
    }
    // The console's toasts say what version 1 pages did in the same words.
    for (const [name, label] of Object.entries(REMOTE_LABEL)) assert.equal(actions[name].label, label, name);
});

test("every args schema uses only the allowed types", () => {
    for (const [name, a] of Object.entries(actions)) {
        assert.ok(a.args && typeof a.args === "object" && !Array.isArray(a.args), `${name}: args`);
        for (const [key, s] of Object.entries(a.args)) {
            const at = `${name}.${key}`;
            assert.ok(ARG_TYPES.has(s.type), `${at}: type ${s.type}`);
            if (s.type === "enum") assert.ok(Array.isArray(s.values) && s.values.length && s.values.every((v) => ["string", "number"].includes(typeof v)), `${at}: values`);
            if (s.type === "int") assert.ok(Number.isInteger(s.min) && Number.isInteger(s.max) && s.min <= s.max, `${at}: min/max`);
            if (s.type === "str") assert.ok(Number.isInteger(s.max) && s.max > 0, `${at}: max`);
            if (s.required !== undefined) assert.equal(typeof s.required, "boolean", `${at}: required`);
        }
        // oneOf: groups of keys of its own args, no key in two groups.
        if (a.oneOf) {
            const seen = new Set();
            for (const group of a.oneOf) for (const key of group) {
                assert.ok(a.args[key], `${name}.oneOf: ${key}`);
                assert.ok(!seen.has(key), `${name}.oneOf: ${key} twice`);
                seen.add(key);
            }
        }
    }
    assert.ok(new RegExp(PROTOCOL.idPattern).test("a1_b-2") && !new RegExp(PROTOCOL.idPattern).test("../x"));
});

// putsOnAir = kind S = !WHILE_LOCKED.has(op), for every op the JSON says an
// action runs (per value of one arg where it says so).
test("the kinds agree with what the live state lets through while locked", () => {
    for (const [name, a] of Object.entries(actions)) {
        if (a.kind === "R") {
            assert.ok(!a.ops && !a.opsBy, `${name}: a read runs no op`);
            continue;
        }
        const kindOf = (value) => a.kindBy?.cases?.[value] ?? a.kind;
        const cases = a.opsBy ? Object.entries(a.opsBy.cases) : [[undefined, a.ops || []]];
        if (a.opsBy) {
            const arg = a.args[a.opsBy.arg];
            assert.ok(arg, `${name}: opsBy ${a.opsBy.arg}`);
            const values = arg.type === "bool" ? ["true", "false"] : arg.values.map(String);
            assert.deepEqual(Object.keys(a.opsBy.cases).sort(), [...values].sort(), `${name}: a case per value`);
        }
        if (a.kindBy) assert.equal(a.kindBy.arg, a.opsBy?.arg, `${name}: kindBy and opsBy read the same arg`);
        for (const [value, ops] of cases) {
            for (const op of ops) {
                assert.ok(OP_NAMES.includes(op), `${name}: ${op} is a live-state op`);
                assert.equal(WHILE_LOCKED.has(op), kindOf(value) === "T", `${name}${value === undefined ? "" : `(${value})`}: ${op}`);
            }
        }
    }
});

test("every refusal code has a status, and the messages the phone shows are there", () => {
    assert.deepEqual(Object.keys(PROTOCOL.codes).sort(), ["blocked", "busy", "forbidden", "locked", "missing", "not_found", "nothing", "rate", "syncing"]);
    for (const status of Object.values(PROTOCOL.codes)) assert.ok(Number.isInteger(status) && status >= 400 && status < 600);
    for (const message of Object.values(PROTOCOL.messages)) assert.ok(message.length > 0 && message.length <= PROTOCOL.limits.message);
    assert.equal(PROTOCOL.messages.locked, "Telas travadas: nada vai ao ar. Destrave em Saídas.");
    assert.equal(PROTOCOL.messages.updateApp, "Atualize o KERYX no computador");
    for (const action of PROTOCOL.limits.slowActions) assert.ok(actions[action], action);
});

// The Equipe (Rodada Q): what its code may run never changes the air or the
// plan — only reads and its own messages (cap requests), and its caps are
// its own few. lan.cjs and the console both read team / teamArgs.
test("the Equipe's actions only read or send its messages", () => {
    assert.ok(PROTOCOL.teamCaps.every((cap) => PROTOCOL.caps.includes(cap)), "teamCaps are caps");
    const team = Object.entries(actions).filter(([, a]) => a.team === true).map(([name]) => name).sort();
    assert.deepEqual(team, ["bibleFind", "chat.send", "library", "request.send", "requests", "songText", "state"]);
    for (const name of team) {
        const a = actions[name];
        assert.ok(a.kind === "R" || a.cap === "requests", `${name}: a read or a message`);
        assert.ok(!a.ops && !a.opsBy, `${name}: no live-state op`);
        if (a.cap) assert.ok(PROTOCOL.teamCaps.includes(a.cap), `${name}: cap ${a.cap} is the Equipe's`);
        for (const [key, values] of Object.entries(a.teamArgs || {})) {
            assert.ok(a.args[key]?.type === "enum" && values.every((v) => a.args[key].values.includes(v)), `${name}.teamArgs.${key}`);
        }
    }
    for (const [name, a] of Object.entries(actions)) {
        if (a.team !== undefined) assert.equal(a.team, true, `${name}: team is true or absent`);
        if (a.cap === "requests") assert.equal(a.team, true, `${name}: the chat is the Equipe's`);
    }
    // The Mídia only as videos and audios to pick for a pedido (S15).
    assert.deepEqual(actions["library"].teamArgs, { tab: ["songs", "media"], kind: ["video", "audio"] });
    assert.deepEqual(actions["library"].teamNeeds, [{ when: { tab: "media" }, give: ["kind"] }]);
    for (const [name, a] of Object.entries(actions)) {
        for (const need of a.teamNeeds || []) {
            for (const [key, value] of Object.entries(need.when)) assert.ok(a.teamArgs?.[key]?.includes(value), `${name}.teamNeeds when ${key}`);
            for (const key of need.give) assert.ok(a.teamArgs?.[key], `${name}.teamNeeds gives ${key} from teamArgs`);
        }
    }
    // setlist.add writes the plan, never the air: no op, so it works locked.
    assert.equal(actions["setlist.add"].kind, "T");
    assert.equal(actions["setlist.add"].cap, "plan");
});

// The console's runner (src/lib/console/remoteRunner.js) has a handler for
// every action, and its test runs each one at least once.
test("every action has a runner handler and a runner test case", async () => {
    const { REMOTE_HANDLERS } = await import("../src/lib/console/remoteRunner.js");
    assert.deepEqual(Object.keys(REMOTE_HANDLERS).sort(), Object.keys(actions).sort());
    const { readFileSync } = await import("node:fs");
    const source = readFileSync(new URL("../src/lib/console/remoteRunner.test.mjs", import.meta.url), "utf8");
    for (const name of Object.keys(actions)) {
        assert.ok(source.includes(`, "${name}"`) || source.includes(`action: "${name}"`), `remoteRunner.test.mjs runs ${name}`);
    }
});
