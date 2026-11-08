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
        checkForUpdates: async () => { handlers["update-available"]({ version: "9.9.9", releaseNotes: "- Novidade" }); },
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
    assert.equal(f.updater.state().notes, "• Novidade", "the notes ride along to the console");
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

test("release notes become plain text, from the notes file's Markdown or GitHub's HTML", () => {
    const { notesText } = require("./updater.cjs");
    const md = "## Novidades\n\n- **Travar telas** no lugar de Ensaio\n- Relógio do `culto`\n\nOutra coisa.";
    const html = "<h2>Novidades</h2>\n<ul>\n<li><strong>Travar telas</strong> no lugar de Ensaio</li>\n<li>Relógio do <code>culto</code></li>\n</ul>\n<p>Outra coisa.</p>";
    const want = "Novidades\n• Travar telas no lugar de Ensaio\n• Relógio do culto\n\nOutra coisa.";
    assert.equal(notesText(md), want);
    assert.equal(notesText(html), want);
    assert.equal(notesText("No content."), "", "GitHub's empty body");
    assert.equal(notesText(null), "");
    assert.equal(notesText([{ version: "0.2.11", note: "<p>A</p>" }, { version: "0.2.10", note: "<p>B</p>" }]), "A\n\nB");
    assert.ok(notesText("x".repeat(5000)).length <= 1200, "kept short for the popup");
});

test("after an update the bell says what changed, once", () => {
    const { installedNote } = require("./updater.cjs");
    assert.equal(installedNote({ lastVersion: null, version: "0.2.11" }), null, "first launch: nothing to say");
    assert.equal(installedNote({ lastVersion: "0.2.11", version: "0.2.11" }), null);
    const withNotes = installedNote({ lastVersion: "0.2.10", version: "0.2.11", pending: { version: "0.2.11", notes: "• Travar telas" } });
    assert.equal(withNotes.title, "KERYX atualizado para a versão 0.2.11");
    assert.equal(withNotes.body, "O que mudou:\n• Travar telas");
    assert.equal(withNotes.action, "whatsnew", "the bell offers the Novidades popup");
    const stale = installedNote({ lastVersion: "0.2.10", version: "0.2.11", pending: { version: "0.2.9", notes: "velho" } });
    assert.equal(stale.body, "Antes: 0.2.10.", "notes of another version are not shown");
});
