const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createUpdater } = require("./updater.cjs");

// A packaged app has resources/app-update.yml; a fake electron-updater stands in.
function fixture() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-updater-"));
    fs.writeFileSync(path.join(dir, "app-update.yml"), "provider: github\n");
    const before = process.resourcesPath;
    process.resourcesPath = dir;
    const handlers = {};
    const calls = [];
    const fake = {
        on: (event, fn) => { handlers[event] = fn; },
        checkForUpdates: async () => { handlers["update-available"]({ version: "9.9.9" }); },
        downloadUpdate: async () => { handlers["update-downloaded"]({ version: "9.9.9" }); },
        quitAndInstall: (...args) => calls.push(args),
    };
    const updater = createUpdater({ app: { isPackaged: true }, loadUpdater: () => fake });
    return { updater, calls, restore: () => { process.resourcesPath = before; fs.rmSync(dir, { recursive: true, force: true }); } };
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
    assert.deepEqual(f.calls, [[true, true]]);
});

test("without app-update.yml (an unpackaged or unconfigured build) updates stay off", () => {
    const updater = createUpdater({ app: { isPackaged: false }, loadUpdater: () => { throw new Error("must not load"); } });
    assert.equal(updater.state().status, "disabled");
    assert.equal(updater.enabled(), false);
});
