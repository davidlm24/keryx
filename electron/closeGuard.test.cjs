const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { machinePrefs, shouldConfirmClose, setAsk, askClose, setAskLeave, askLeave, KEPT_OPEN, closeAll } = require("./closeGuard.cjs");

test("closing asks with the option on, unless a quit is already decided", () => {
    assert.equal(shouldConfirmClose({ enabled: true, quitting: false }), true);
    assert.equal(shouldConfirmClose({ enabled: false, quitting: false }), false, "turned off");
    assert.equal(shouldConfirmClose({ enabled: true, quitting: true }), false, "updater, import or restore");
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

// Windows order (audit C-74): the action, then the safe answer on the
// right, which is the default and what Esc answers (C-10).
test("closing KERYX: Fechar o KERYX first, the safe answer the default", async () => {
    let shown = null;
    const dialog = (response) => ({ showMessageBox: async (_win, opts) => { shown = opts; return { response }; } });
    assert.equal(await askClose(dialog(1), null), false, "the default keeps KERYX open");
    assert.deepEqual(shown.buttons, ["Fechar o KERYX", "Cancelar"]);
    assert.equal(shown.defaultId, 1);
    assert.equal(shown.cancelId, 1, "Esc keeps it too");
    assert.equal(await askClose(dialog(0), null, true), true);
    assert.deepEqual(shown.buttons, ["Fechar o KERYX", "Continuar projetando"]);
});

test("unsaved changes: the question, or its stand-in, says whether the window may go", () => {
    let shown = null;
    const dialog = { showMessageBoxSync: (_win, opts) => { shown = opts; return opts.defaultId; } };
    assert.equal(askLeave(dialog, null), false, "the default keeps the window");
    assert.deepEqual(shown.buttons, ["Descartar as mudanças", "Continuar editando"]);
    assert.equal(shown.cancelId, 1, "Esc keeps it too");
    assert.equal(askLeave({ showMessageBoxSync: () => 0 }, null), true);
    setAskLeave(() => true);
    assert.equal(askLeave(null, null), true);
    setAskLeave(null);
});

// A window as closeAll sees it: close() runs its page's unload, which either
// closes it, or (unsaved changes, "Continuar editando") keeps it.
function fakeWindow(onClose) {
    const w = new EventEmitter();
    let destroyed = false;
    w.isDestroyed = () => destroyed;
    w.destroy = () => { if (!destroyed) { destroyed = true; w.emit("closed"); } };
    w.close = () => onClose(w);
    return w;
}
const closes = (w) => setTimeout(() => w.destroy(), 5);
const keeps = (w) => setTimeout(() => w.emit(KEPT_OPEN), 5);
const hangs = () => {};

test("closing KERYX: the other windows close first, and one kept open stops the quit", async () => {
    assert.equal(await closeAll([]), true, "nothing else open");
    const a = fakeWindow(closes);
    const b = fakeWindow(closes);
    assert.equal(await closeAll([a, b]), true);
    assert.equal(a.isDestroyed() && b.isDestroyed(), true);
    const clean = fakeWindow(closes);
    const dirty = fakeWindow(keeps);
    assert.equal(await closeAll([clean, dirty]), false, "Continuar editando");
    assert.equal(dirty.isDestroyed(), false, "the kept window stays");
    assert.equal(dirty.listenerCount("closed") + dirty.listenerCount(KEPT_OPEN), 0, "and closing it later does not quit");
    const stuck = fakeWindow(hangs);
    assert.equal(await closeAll([stuck], { wait: 20 }), true, "a page that never answers is closed anyway");
    assert.equal(stuck.isDestroyed(), true);
});
