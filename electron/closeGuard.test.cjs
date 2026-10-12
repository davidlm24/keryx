const test = require("node:test");
const assert = require("node:assert/strict");
const { machinePrefs, shouldConfirmClose, setAsk, askClose } = require("./closeGuard.cjs");

test("closing asks only with something on air, the option on, and no quit decided", () => {
    assert.equal(shouldConfirmClose({ enabled: true, onAir: true, quitting: false }), true);
    assert.equal(shouldConfirmClose({ enabled: true, onAir: false, quitting: false }), false, "nothing on air");
    assert.equal(shouldConfirmClose({ enabled: false, onAir: true, quitting: false }), false, "turned off");
    assert.equal(shouldConfirmClose({ enabled: true, onAir: true, quitting: true }), false, "updater, import or restore");
});

test("the option is on unless turned off", () => {
    assert.deepEqual(machinePrefs(undefined), { confirmClose: true });
    assert.deepEqual(machinePrefs({ confirmClose: false }), { confirmClose: false });
});

test("the question can be answered by a test", async () => {
    setAsk(async () => false);
    assert.equal(await askClose(null, null), false);
    setAsk(async () => true);
    assert.equal(await askClose(null, null), true);
    setAsk(null);
});
