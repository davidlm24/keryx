const test = require("node:test");
const assert = require("node:assert/strict");
const { createRendererLog, pageOf, PER_MINUTE, MAX_CHARS } = require("./rendererLog.cjs");

function rig() {
    const lines = [];
    let t = 0;
    const logger = { error: (m) => lines.push(["error", m]), warn: (m) => lines.push(["warn", m]), info: (m) => lines.push(["info", m]) };
    const log = createRendererLog({ logger, now: () => t });
    return { log, lines, at: (ms) => { t = ms; } };
}

test("the page is named from the window's address", () => {
    assert.equal(pageOf("http://127.0.0.1:7700/Console?config=telas"), "Console");
    assert.equal(pageOf("http://127.0.0.1:7700/"), "Console");
    assert.equal(pageOf("http://127.0.0.1:7700/Projection"), "Projection");
    assert.equal(pageOf("not a url"), "?");
});

test("an error is written with the page's prefix and its stack", () => {
    const { log, lines } = rig();
    assert.equal(log.write(1, "http://x/StageView", { level: "error", msg: "boom", stack: "Error: boom\n    at a.js:1" }), true);
    assert.deepEqual(lines, [["error", "[renderer:StageView] boom\nError: boom\n    at a.js:1"]]);
    log.write(1, "http://x/StageView", { level: "warn", msg: "hmm" });
    assert.equal(lines[1][0], "warn");
    log.write(1, "http://x/StageView", { level: "info", msg: "x" });
    assert.equal(lines[2][0], "error", "only error or warn");
});

test("each line is cut to 2 kB", () => {
    const { log, lines } = rig();
    log.write(1, "http://x/Console", { msg: "a".repeat(10000) });
    assert.equal(lines[0][1].length, MAX_CHARS);
    assert.ok(lines[0][1].endsWith("…"));
});

test("at most 20 a minute per window; what was left out is said once", () => {
    const { log, lines, at } = rig();
    for (let i = 0; i < 30; i++) log.write(1, "http://x/Console", { msg: `e${i}` });
    log.write(2, "http://x/Projection", { msg: "other window" });
    assert.equal(lines.length, PER_MINUTE + 1, "the other window has its own allowance");
    at(60000);
    log.write(1, "http://x/Console", { msg: "next minute" });
    assert.deepEqual(lines.slice(-2), [["warn", "[renderer:Console] mais 10 erros omitidos no último minuto"], ["error", "[renderer:Console] next minute"]]);
});

test("nonsense payloads are ignored", () => {
    const { log, lines } = rig();
    assert.equal(log.write(1, "http://x/Console", null), false);
    assert.equal(log.write(1, "http://x/Console", "str"), false);
    assert.equal(lines.length, 0);
});
