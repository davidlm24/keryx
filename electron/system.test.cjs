const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("./db/store.cjs");
const schema = require("./db/schema.json");
const { cachedSize, createSystem, loginItemArgs } = require("./system.cjs");

// A system over a temp data folder, with settings in memory.
function sys(initial = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-sys-"));
    const store = createStore({ file: path.join(dataDir, "keryx.db"), schema, log: () => {} });
    const saved = { ...initial };
    const settings = { get: (k, d) => (k in saved ? saved[k] : d), set: (k, v) => { saved[k] = v; } };
    const quiet = { info() {}, warn() {}, error() {} };
    const system = createSystem({ app: { getVersion: () => "0.0.0", isPackaged: false }, dialog: {}, shell: {}, BrowserWindow: {}, store, dataDir, mediaDir: path.join(dataDir, "media"), settings, outputs: null, updater: { state: () => ({ status: "disabled" }), enabled: () => false }, logger: quiet, screen: {} });
    return { system, saved, store, dataDir };
}

test("the data folder is measured at most once a minute", () => {
    let walks = 0;
    const size = cachedSize(() => { walks += 1; return 100 * walks; }, 60000);
    assert.equal(size("/data", 0), 100);
    assert.equal(size("/data", 30000), 100, "within the minute: the last figure");
    assert.equal(walks, 1);
    assert.equal(size("/data", 61000), 200, "after it: measured again");
    assert.equal(size("/other", 61000), 300, "each folder on its own");
    assert.equal(walks, 3);
});

test("automatic backups can be turned off; the manual one still runs", async () => {
    const { system, store } = sys({ backup: { enabled: false } });
    assert.equal(system.backupNow("ao abrir"), null);
    assert.equal(system.backupNow("ao fechar"), null);
    assert.ok(system.backupNow("manual").file);
    store.close();
});

test("backup settings are merged, never wiped by another change", async () => {
    const { system, saved, store } = sys({ backup: { dir: "", enabled: true, keep: 14 } });
    await system.ops.backupSet(null, { keep: 30 });
    await system.ops.backupSet(null, { enabled: false });
    assert.deepEqual({ enabled: saved.backup.enabled, keep: saved.backup.keep }, { enabled: false, keep: 30 });
    const info = await system.ops.resetBackupDir();
    assert.equal(saved.backup.keep, 30, "Usar a padrão keeps the rest");
    assert.equal(saved.backup.enabled, false);
    assert.equal(info.backup.keep, 30);
    assert.equal(info.backup.enabled, false);
    store.close();
});

test("Console: confirm on close is on unless turned off; login only when installed", async () => {
    const { system, saved, store } = sys();
    assert.deepEqual(await system.ops.machineGet(), { confirmClose: true, login: { available: false, on: false, blocked: false } });
    await system.ops.machineSet(null, { confirmClose: false });
    assert.equal(saved.machine.confirmClose, false);
    await assert.rejects(() => system.ops.loginSet(null, { on: true }), /instalado/);
    assert.deepEqual(loginItemArgs(true, "C:/KERYX.exe"), { openAtLogin: true, path: "C:/KERYX.exe" });
    store.close();
});
