const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createUpdater } = require("./updater.cjs");

// A packaged app has resources/app-update.yml; a fake electron-updater stands in.
function fixture({ auto = false } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-updater-"));
    fs.writeFileSync(path.join(dir, "app-update.yml"), "provider: github\n");
    const before = process.resourcesPath;
    process.resourcesPath = dir;
    const handlers = {};
    const calls = [];
    const fake = {
        on: (event, fn) => { handlers[event] = fn; },
        checkForUpdates: async () => { handlers["update-available"]({ version: "9.9.9" }); },
        downloadUpdate: async () => {
            calls.push(["download"]);
            handlers["download-progress"]({ percent: 42.4, transferred: 59000000, total: 140000000, bytesPerSecond: 2000000 });
            handlers["update-downloaded"]({ version: "9.9.9" });
        },
        quitAndInstall: (...args) => calls.push(args),
    };
    const changes = [];
    const updater = createUpdater({ app: { isPackaged: true }, loadUpdater: () => fake, isAuto: () => auto, onChange: (st) => changes.push(st) });
    return { updater, calls, changes, handlers, restore: () => { process.resourcesPath = before; fs.rmSync(dir, { recursive: true, force: true }); } };
}

test("an update is found, downloaded on request and installed silently on restart", async (t) => {
    const f = fixture();
    t.after(f.restore);
    assert.equal(f.updater.state().status, "idle");
    f.updater.installAndRestart();
    assert.equal(f.calls.length, 0, "nothing to install before a download");
    assert.equal((await f.updater.check()).status, "available");
    f.updater.installAndRestart();
    assert.equal(f.calls.length, 0, "found is not downloaded");
    assert.equal((await f.updater.download()).status, "downloaded");
    f.updater.installAndRestart();
    // quitAndInstall(isSilent, forceRunAfter): no installer window, KERYX opens again.
    assert.deepEqual(f.calls, [["download"], [true, true]]);
    // Every step was pushed, the progress with its numbers.
    assert.deepEqual([...new Set(f.changes.map((c) => c.status))], ["idle", "available", "downloading", "downloaded"]);
    const progress = f.changes.find((c) => c.status === "downloading" && c.total);
    assert.deepEqual([progress.percent, progress.transferred, progress.total, progress.bytesPerSecond], [42, 59000000, 140000000, 2000000]);
});

test("without app-update.yml (an unpackaged or unconfigured build) updates stay off", () => {
    const updater = createUpdater({ app: { isPackaged: false }, loadUpdater: () => { throw new Error("must not load"); } });
    assert.equal(updater.state().status, "disabled");
    assert.equal(updater.enabled(), false);
});

test("with Atualizar automaticamente a version found is downloaded at once, never installed on its own", async (t) => {
    const f = fixture({ auto: true });
    t.after(f.restore);
    await f.updater.check();
    await new Promise((r) => setImmediate(r));
    assert.equal(f.updater.state().status, "downloaded");
    assert.deepEqual(f.calls, [["download"]], "downloaded, not installed: the console decides when");
});

test("a failed download can be tried again", async (t) => {
    const f = fixture();
    t.after(f.restore);
    await f.updater.check();
    f.handlers.error(new Error(["net::ERR_INTERNET_DISCONNECTED", "stack"].join(String.fromCharCode(10))));
    assert.equal(f.updater.state().status, "error");
    assert.match(f.updater.state().message, /ERR_INTERNET_DISCONNECTED$/);
    assert.equal((await f.updater.download()).status, "downloaded", "the version is still known: retried");
});
