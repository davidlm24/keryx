const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore } = require("./db/store.cjs");
const schema = require("./db/schema.json");
const { cachedSize, createSystem, loginItemArgs, syncQuestion } = require("./system.cjs");

// A system over a temp data folder, with settings in memory.
function sys(initial = {}, extra = {}) {
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-sys-"));
    const store = createStore({ file: path.join(dataDir, "keryx.db"), schema, log: () => {} });
    const saved = { ...initial };
    const settings = { get: (k, d) => (k in saved ? saved[k] : d), set: (k, v) => { saved[k] = v; } };
    const quiet = { info() {}, warn() {}, error() {} };
    const system = createSystem({ app: { getVersion: () => "0.0.0", isPackaged: false }, dialog: {}, shell: {}, BrowserWindow: {}, store, dataDir, mediaDir: path.join(dataDir, "media"), settings, outputs: null, updater: { state: () => ({ status: "disabled" }), enabled: () => false }, logger: quiet, screen: {}, ...extra });
    return { system, saved, store, dataDir };
}

test("restoring or importing on a computer that syncs: everyone first and by default, or only this one", () => {
    const r = syncQuestion("restore", { day: "12/10", others: 2 });
    assert.deepEqual(r.buttons, ["Voltar todos a 12/10", "Só este computador", "Cancelar"]);
    assert.equal(r.defaultId, 0);
    assert.equal(r.cancelId, 2);
    assert.deepEqual(r.modes, ["all", "leave", null]);
    assert.match(r.message, /mais 2 computadores/);
    assert.match(r.detail, /O que foi criado depois continua/);
    const i = syncQuestion("import", { others: 1 });
    assert.deepEqual(i.buttons, ["Usar em todos os computadores", "Só neste computador", "Cancelar"]);
    assert.match(i.message, /mais 1 computador:/);
    assert.match(syncQuestion("restore", { day: "1/1" }).message, /outros computadores/);
});

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

test("Console: the zoom is this computer's, through the console's zoom", async () => {
    const { createConsoleZoom } = require("./consoleZoom.cjs");
    const holder = {};
    const { system, saved, store } = sys({}, { consoleZoom: { get: () => holder.zoom.get(), set: (z) => holder.zoom.set(z), command: (cmd) => holder.zoom.command(cmd) } });
    holder.zoom = createConsoleZoom({ settings: { get: (k, d) => (k in saved ? saved[k] : d), set: (k, v) => { saved[k] = v; } }, getWindow: () => null });
    assert.equal((await system.ops.machineGet()).zoom, 1);
    assert.equal((await system.ops.machineSet(null, { zoom: 1.25 })).zoom, 1.25);
    assert.equal(saved.consoleZoom, 1.25);
    assert.equal((await system.ops.machineSet(null, { confirmClose: false })).zoom, 1.25, "the other choice leaves it");
    assert.deepEqual(await system.ops.zoomStep(null, { dir: 1 }), { zoom: 1.5 }, "Ctrl+wheel up: one step in");
    assert.deepEqual(await system.ops.zoomStep(null, { dir: -1 }), { zoom: 1.25 });
    store.close();
});

test("Novidades: pending after an update until seen", async () => {
    const { system, saved, store } = sys({ whatsNew: { from: "0.2.13", to: "0.2.14" } });
    assert.deepEqual(await system.ops.whatsNew(), { pending: { from: "0.2.13", to: "0.2.14" }, version: "0.0.0" });
    await system.ops.whatsNewSeen();
    assert.equal(saved.whatsNew, null);
    assert.deepEqual((await system.ops.whatsNew()).pending, null);
    store.close();
});

// Relatar um problema: the zip in Downloads (relato.txt inside, no dialog),
// the folder shown, the mailto opened by main; `opened` false when no
// e-mail program takes it.
function reportRig({ openFails = false } = {}) {
    const downloads = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-dl-"));
    const calls = { shown: [], opened: [] };
    const shell = {
        showItemInFolder: (f) => calls.shown.push(f),
        openExternal: async (href) => { if (openFails) throw new Error("no handler"); calls.opened.push(href); },
    };
    const logs = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-logs-"));
    fs.writeFileSync(path.join(logs, "keryx-2026-10-20.log"), "10:00:00 error [renderer:Console] boom\n");
    const logger = { info() {}, warn() {}, error() {}, recentFiles: () => [path.join(logs, "keryx-2026-10-20.log")] };
    const screen = { getAllDisplays: () => [], getPrimaryDisplay: () => ({ id: 0 }) };
    const r = sys({}, {
        app: { getVersion: () => "0.2.20", isPackaged: false, getName: () => "KERYX", getPath: (k) => (k === "downloads" ? downloads : os.tmpdir()) },
        shell, logger, screen, outputs: { list: () => ({ outputs: [] }) },
    });
    return { ...r, calls, downloads };
}

test("Relatar um problema saves the diagnostic in Downloads with the report inside and opens the e-mail", async () => {
    const { system, store, calls, downloads } = reportRig();
    const out = await system.ops.report(null, { text: "O vídeo travou", doing: "Apertei Esc", include: true, church: "Igreja X" });
    assert.match(path.basename(out.file), /^keryx-diagnostico-\d{4}-\d{2}-\d{2}-\d{4}\.zip$/);
    assert.equal(path.dirname(out.file), downloads);
    assert.ok(fs.statSync(out.file).size > 0);
    const raw = fs.readFileSync(out.file);
    for (const name of ["sistema.json", "relato.txt", "logs/keryx-2026-10-20.log"]) assert.ok(raw.includes(Buffer.from(name)), name);
    assert.deepEqual(calls.shown, [out.file]);
    assert.equal(out.opened, true);
    assert.equal(calls.opened.length, 1);
    assert.match(calls.opened[0], /^mailto:davigoncalves207@gmail\.com\?subject=KERYX%200\.2\.20/);
    assert.match(out.body, /Igreja X · KERYX 0\.2\.20/);
    assert.ok(out.body.includes(`Anexe o arquivo ${path.basename(out.file)}`));
    store.close();
});

test("Relatar um problema without the diagnostic, and with no e-mail program", async () => {
    const { system, store, calls, downloads } = reportRig({ openFails: true });
    const out = await system.ops.report(null, { text: "Travou", include: false });
    assert.equal(out.file, null);
    assert.equal(out.opened, false, "the console then shows the address and the text");
    assert.deepEqual(fs.readdirSync(downloads), []);
    assert.deepEqual(calls.shown, []);
    assert.doesNotMatch(out.body, /Anexe/);
    await assert.rejects(system.ops.report(null, { text: "  " }), /Escreva o que aconteceu/);
    store.close();
});
