const test = require("node:test");
const assert = require("node:assert/strict");
const { focusVerdict, meterVerdict, OTHER_IN_FRONT, OTHER_PLAYING } = require("./smoke-verdicts.cjs");

const consoleWin = { name: "console" };
const projector = { name: "projector" };

test("focus: the console keeps it, another program in front is inconclusive, an output holding it fails", () => {
    assert.equal(focusVerdict(consoleWin, consoleWin), true);
    assert.equal(focusVerdict(null, consoleWin), OTHER_IN_FRONT);
    assert.ok(focusVerdict(null, consoleWin), "inconclusive still passes");
    assert.equal(focusVerdict(projector, consoleWin), false);
    assert.equal(focusVerdict(projector, projector), true, "the projector clicked on purpose");
    assert.equal(focusVerdict(null, null), true, "no window to compare with");
});

test("meters: a drop passes, another program playing is inconclusive, KERYX still audible fails", () => {
    assert.equal(meterVerdict(true, []), true);
    assert.equal(meterVerdict(false, []), OTHER_PLAYING);
    assert.ok(meterVerdict(false, []), "inconclusive still passes");
    assert.equal(meterVerdict(false, ["http://127.0.0.1:7700/Projection"]), false);
});
