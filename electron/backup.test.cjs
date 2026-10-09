const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const yazl = require("yazl");
const { DatabaseSync } = require("node:sqlite");
const { createStore } = require("./db/store.cjs");
const schema = require("./db/schema.json");
const { runBackup, listBackups, dayStamp, mirrorMedia, mirrorStats } = require("./backup.cjs");
const { exportAll, stageImport, stageRestore, applyPendingImport, hasPendingImport, discardPendingImport } = require("./archive.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keryx-bk-"));
const openAt = (dir) => createStore({ file: path.join(dir, "keryx.db"), schema, log: () => {} });
const titles = (store) => store.call("Song", "list", ["title"]).map((s) => s.title).join(",");

function zipOf(file, entries) {
    return new Promise((resolve, reject) => {
        const zip = new yazl.ZipFile();
        for (const [name, content] of entries) zip.addBuffer(Buffer.from(content), name);
        zip.end();
        zip.outputStream.pipe(fs.createWriteStream(file)).on("close", resolve).on("error", reject);
    });
}

// yazl refuses "../" names, so write a same-length placeholder and patch the
// bytes (local header and central directory both carry the name).
async function hostileZip(file, entries) {
    await zipOf(file, entries.map(([name, content]) => [name.replace("../../", "aa/aa/"), content]));
    const bytes = fs.readFileSync(file);
    const from = Buffer.from("aa/aa/escape.txt");
    const to = Buffer.from("../../escape.txt");
    for (let i = bytes.indexOf(from); i !== -1; i = bytes.indexOf(from, i + 1)) to.copy(bytes, i);
    fs.writeFileSync(file, bytes);
}

test("a backup is a consistent, openable copy; one file per day", () => {
    const data = tmp();
    const store = openAt(data);
    store.call("Song", "create", [{ title: "A" }]);
    const dir = path.join(data, "backups");
    const day = new Date(2026, 9, 6, 10, 0);
    const first = runBackup({ store, dir, now: day });
    assert.equal(path.basename(first.file), "keryx-2026-10-06.db");

    store.call("Song", "create", [{ title: "B" }]);
    runBackup({ store, dir, now: new Date(2026, 9, 6, 22, 0) });
    assert.equal(listBackups(dir).length, 1, "same day: replaced, not duplicated");

    const copy = new DatabaseSync(path.join(dir, "keryx-2026-10-06.db"), { readOnly: true });
    assert.equal(copy.prepare("SELECT COUNT(*) AS n FROM song").get().n, 2);
    copy.close();
    store.close();
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith(".partial")), []);
});

test("only the newest 14 backups are kept, other files are never touched", () => {
    const data = tmp();
    const store = openAt(data);
    const dir = path.join(data, "backups");
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, "notes.txt"), "mine");
    for (let d = 1; d <= 20; d++) runBackup({ store, dir, now: new Date(2026, 8, d, 12) });
    const kept = listBackups(dir);
    assert.equal(kept.length, 14);
    assert.equal(kept[0].day, "2026-09-20");
    assert.equal(kept[13].day, "2026-09-07");
    assert.ok(fs.existsSync(path.join(dir, "notes.txt")));
    store.close();
});

test("a failed backup leaves the previous one intact", () => {
    const data = tmp();
    const store = openAt(data);
    const dir = path.join(data, "backups");
    const now = new Date(2026, 9, 6);
    runBackup({ store, dir, now });
    const before = fs.readFileSync(path.join(dir, "keryx-2026-10-06.db"));
    const broken = { backupTo() { throw new Error("disk full"); } };
    assert.throws(() => runBackup({ store: broken, dir, now }), /disk full/);
    assert.deepEqual(fs.readFileSync(path.join(dir, "keryx-2026-10-06.db")), before);
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith(".partial")), []);
    store.close();
});

test("dayStamp uses the local date", () => {
    assert.equal(dayStamp(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
});

test("export then import round-trips the database and media", async () => {
    const source = tmp();
    const store = openAt(source);
    store.call("Song", "create", [{ title: "Grande é o Senhor", slides: [{ text: "x" }] }]);
    const mediaDir = path.join(source, "media");
    fs.mkdirSync(mediaDir);
    fs.writeFileSync(path.join(mediaDir, "a1b2.png"), Buffer.from([1, 2, 3, 4]));
    fs.writeFileSync(path.join(mediaDir, "clip.mp4"), Buffer.alloc(100000, 7));
    const zipFile = path.join(tmp(), "export.zip");

    const exported = await exportAll({ store, mediaDir, target: zipFile, appVersion: "9.9.9", now: new Date("2026-10-06T12:00:00Z") });
    assert.equal(exported.media, 2);
    store.close();

    // The destination computer has its own data.
    const dest = tmp();
    const old = openAt(dest);
    old.call("Song", "create", [{ title: "Antiga" }]);
    old.close();
    fs.mkdirSync(path.join(dest, "media"));
    fs.writeFileSync(path.join(dest, "media", "old.png"), "old");

    const staged = await stageImport({ zipFile, dataDir: dest });
    assert.equal(staged.media, 2);
    assert.equal(staged.manifest.app, "9.9.9");
    assert.ok(hasPendingImport(dest));
    const live = openAt(dest);
    assert.equal(titles(live), "Antiga", "staging must not touch the live database");
    live.close(); // Windows cannot replace an open database file

    const applied = applyPendingImport(dest, new Date("2026-10-07T08:30:15Z"));
    assert.match(path.basename(applied.archived), /^before-import-20261007-083015$/);
    assert.ok(!hasPendingImport(dest));

    const restored = openAt(dest);
    assert.equal(titles(restored), "Grande é o Senhor");
    assert.deepEqual(restored.call("Song", "list", [])[0].slides, [{ text: "x" }]);
    restored.close();
    assert.deepEqual([...fs.readFileSync(path.join(dest, "media", "a1b2.png"))], [1, 2, 3, 4]);
    assert.equal(fs.statSync(path.join(dest, "media", "clip.mp4")).size, 100000);
    assert.ok(!fs.existsSync(path.join(dest, "media", "old.png")));

    // What was replaced is kept.
    const kept = openAt(path.join(applied.archived));
    assert.equal(titles(kept), "Antiga");
    kept.close();
    assert.equal(fs.readFileSync(path.join(applied.archived, "media", "old.png"), "utf8"), "old");
});

test("applyPendingImport does nothing when nothing is pending", () => {
    assert.equal(applyPendingImport(tmp()), null);
});

test("a swap that fails halfway restores the live data and deletes nothing", async () => {
    const source = tmp();
    const s = openAt(source);
    s.call("Song", "create", [{ title: "Importada" }]);
    const zipFile = path.join(tmp(), "e.zip");
    await exportAll({ store: s, mediaDir: path.join(source, "media"), target: zipFile });
    s.close();

    const dest = tmp();
    const old = openAt(dest);
    old.call("Song", "create", [{ title: "Antiga" }]);
    old.close();
    fs.mkdirSync(path.join(dest, "media"));
    fs.writeFileSync(path.join(dest, "media", "old.png"), "old");
    await stageImport({ zipFile, dataDir: dest });

    // Make the second placement fail: the staged media folder is gone.
    fs.rmSync(path.join(dest, "pending-import", "media"), { recursive: true });
    assert.throws(() => applyPendingImport(dest, new Date("2026-10-07T08:30:15Z")), /ENOENT/);

    const back = openAt(dest);
    assert.equal(titles(back), "Antiga");
    back.close();
    assert.equal(fs.readFileSync(path.join(dest, "media", "old.png"), "utf8"), "old");
});

test("a hostile zip is refused and leaves nothing behind", async () => {
    const dest = tmp();
    const evil = path.join(tmp(), "evil.zip");
    await hostileZip(evil, [["manifest.json", '{"format":"keryx-export","version":1}'], ["../../escape.txt", "x"]]);
    await assert.rejects(stageImport({ zipFile: evil, dataDir: dest }), /item inesperado/);
    assert.ok(!fs.existsSync(path.join(dest, "pending-import")));
    assert.ok(!fs.existsSync(path.join(dest, "..", "escape.txt")));

    const nested = path.join(tmp(), "nested.zip");
    await zipOf(nested, [["media/sub/dir.png", "x"]]);
    await assert.rejects(stageImport({ zipFile: nested, dataDir: dest }), /item inesperado/);
});

test("zips that are not KERYX exports are refused with a reason", async () => {
    const dest = tmp();
    const notZip = path.join(tmp(), "x.zip");
    fs.writeFileSync(notZip, "this is not a zip");
    await assert.rejects(stageImport({ zipFile: notZip, dataDir: dest }), /não é um zip/);

    const wrong = path.join(tmp(), "wrong.zip");
    await zipOf(wrong, [["manifest.json", '{"format":"something-else","version":1}'], ["keryx.db", "x"]]);
    await assert.rejects(stageImport({ zipFile: wrong, dataDir: dest }), /não é uma exportação do KERYX/);

    const newer = path.join(tmp(), "newer.zip");
    await zipOf(newer, [["manifest.json", '{"format":"keryx-export","version":99}'], ["keryx.db", "x"]]);
    await assert.rejects(stageImport({ zipFile: newer, dataDir: dest }), /versão mais nova/);

    const noDb = path.join(tmp(), "nodb.zip");
    await zipOf(noDb, [["manifest.json", '{"format":"keryx-export","version":1}']]);
    await assert.rejects(stageImport({ zipFile: noDb, dataDir: dest }), /não contém o banco/);

    const badDb = path.join(tmp(), "baddb.zip");
    await zipOf(badDb, [["manifest.json", '{"format":"keryx-export","version":1}'], ["keryx.db", "not a database"]]);
    await assert.rejects(stageImport({ zipFile: badDb, dataDir: dest }), /corrompido ou não é do KERYX/);
    assert.ok(!hasPendingImport(dest));
});

test("a re-staged import replaces the earlier one; discard removes it", async () => {
    const source = tmp();
    const store = openAt(source);
    const zipFile = path.join(tmp(), "e.zip");
    await exportAll({ store, mediaDir: path.join(source, "media"), target: zipFile });
    store.close();
    const dest = tmp();
    await stageImport({ zipFile, dataDir: dest });
    await stageImport({ zipFile, dataDir: dest });
    assert.ok(hasPendingImport(dest));
    discardPendingImport(dest);
    assert.ok(!hasPendingImport(dest));
});

test("media is mirrored: new and changed files copied, deletions kept, odd names skipped", async () => {
    const data = tmp();
    const media = path.join(data, "media");
    fs.mkdirSync(media);
    fs.writeFileSync(path.join(media, "a.mp4"), "video a");
    fs.writeFileSync(path.join(media, "b.jpg"), "image b");
    fs.writeFileSync(path.join(media, ".hidden"), "not media");
    const dir = path.join(data, "usb");

    const first = await mirrorMedia({ mediaDir: media, dir });
    assert.deepEqual([first.files, first.copied, first.failed.length], [2, 2, 0]);
    assert.equal(fs.readFileSync(path.join(dir, "media", "a.mp4"), "utf8"), "video a");
    assert.ok(!fs.existsSync(path.join(dir, "media", ".hidden")));

    const again = await mirrorMedia({ mediaDir: media, dir });
    assert.equal(again.copied, 0, "unchanged files are not copied again");

    fs.writeFileSync(path.join(media, "b.jpg"), "image b, edited");
    fs.writeFileSync(path.join(media, "c.png"), "image c");
    fs.rmSync(path.join(media, "a.mp4"));
    const third = await mirrorMedia({ mediaDir: media, dir });
    assert.equal(third.copied, 2, "the changed one and the new one");
    assert.equal(fs.readFileSync(path.join(dir, "media", "b.jpg"), "utf8"), "image b, edited");
    assert.ok(fs.existsSync(path.join(dir, "media", "a.mp4")), "deleted in KERYX, kept in the backup");
    assert.deepEqual(mirrorStats(dir), { files: 3, bytes: "video a".length + "image b, edited".length + "image c".length });
    assert.deepEqual(fs.readdirSync(path.join(dir, "media")).filter((n) => n.endsWith(".partial")), []);

    // The daily database backups beside it are pruned as before; the mirror is not touched.
    const store = openAt(data);
    for (let d = 1; d <= 16; d += 1) runBackup({ store, dir, now: new Date(2026, 9, d, 10, 0) });
    store.close();
    assert.equal(listBackups(dir).length, 14);
    assert.equal(mirrorStats(dir).files, 3);
});

test("no media folder yet: an empty mirror, no error", async () => {
    const data = tmp();
    const r = await mirrorMedia({ mediaDir: path.join(data, "media"), dir: path.join(data, "usb") });
    assert.deepEqual([r.files, r.copied, r.failed.length], [0, 0, 0]);
    assert.deepEqual(mirrorStats(path.join(data, "usb")), { files: 0, bytes: 0 });
});

test("restoring a daily backup: the old data comes back, today's media stays, deleted media returns from the mirror", async () => {
    const data = tmp();
    const media = path.join(data, "media");
    fs.mkdirSync(media);
    const usb = path.join(data, "usb");
    let store = openAt(data);
    store.call("Song", "create", [{ title: "A" }]);
    fs.writeFileSync(path.join(media, "a.jpg"), "image a");
    runBackup({ store, dir: usb, now: new Date(2026, 9, 6, 10, 0) });
    await mirrorMedia({ mediaDir: media, dir: usb });

    // Later that week: a new song, a.jpg deleted, b.jpg added.
    store.call("Song", "create", [{ title: "B" }]);
    fs.rmSync(path.join(media, "a.jpg"));
    fs.writeFileSync(path.join(media, "b.jpg"), "image b");
    store.close();

    const staged = await stageRestore({ dataDir: data, dbFile: listBackups(usb)[0].file, mediaDir: media, mirrorDir: path.join(usb, "media") });
    assert.deepEqual(staged, { media: 2, fromBackup: 1 });
    assert.ok(hasPendingImport(data));
    const result = applyPendingImport(data);
    assert.ok(result && fs.existsSync(path.join(result.archived, "keryx.db")), "today's data kept aside");
    assert.deepEqual(fs.readdirSync(path.join(data, "media")).sort(), ["a.jpg", "b.jpg"]);
    store = openAt(data);
    assert.equal(titles(store), "A");
    store.close();
});

test("a broken backup file is refused and nothing stays staged", async () => {
    const data = tmp();
    const bad = path.join(data, "keryx-2026-10-06.db");
    fs.writeFileSync(bad, "not a database");
    await assert.rejects(stageRestore({ dataDir: data, dbFile: bad, mediaDir: path.join(data, "media") }), /corrompido/);
    assert.equal(hasPendingImport(data), false);
    assert.equal(fs.existsSync(path.join(data, "pending-import")), false);
});
