// node --test electron/sync.test.cjs   (npm test)
// Two or three computers (temp stores, each with its media folder) and one
// temp folder standing in for the one Drive keeps in step.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore, PROFILE_ID } = require("./db/store.cjs");
const { createSyncEngine, inspectFolder, syncDirOf, mediaRefs, coalesce, fileName, STATE_KEY } = require("./sync.cjs");
const { keysFor, createPairing, joinPairing, readPairing, updateRemoved, PAIRING_FILE } = require("./syncPairing.cjs");
const schema = require("./db/schema.json");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keryx-sync-"));

// The church's code, already typed on every test computer unless a test says
// otherwise (the key is what the code would make; the first pass writes the
// code's file into the folder).
const CHURCH = { id: "igreja-de-teste-0001", key: crypto.randomBytes(32) };
const signed = keysFor(CHURCH.key, CHURCH.id);

function computer(folder, opts = {}) {
    const dir = opts.dir || tmp();
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    const file = path.join(dir, "keryx.db");
    const store = createStore({ file, schema, log: () => {} });
    const getFolder = typeof folder === "function" ? folder : () => folder;
    let pairing = opts.pairing === undefined ? CHURCH : opts.pairing;
    const engine = createSyncEngine({ store, mediaDir, getFolder, getPairing: () => pairing, log: () => {}, ...opts.engine });
    return { dir, file, mediaDir, store, engine, pair: (p) => { pairing = p; }, close: () => store.close() };
}

const songs = (pc) => pc.store.call("Song", "list", [])
    .map((r) => ({ id: r.id, title: r.title, lyrics: r.lyrics ?? null }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));

const tick = () => new Promise((r) => setTimeout(r, 5));

async function rounds(pcs, n = 3) {
    for (let i = 0; i < n; i++) {
        // A different order each round.
        const order = [...pcs].sort(() => Math.random() - 0.5);
        for (const pc of order) {
            const status = await pc.engine.pass();
            assert.equal(status.state, "ok", status.error || "");
        }
    }
}

test("changes made on three computers converge, whatever order the passes run in", async () => {
    const folder = tmp();
    const a = computer(folder);
    const b = computer(folder);
    const c = computer(folder);
    const one = a.store.call("Song", "create", [{ title: "Grande é o Senhor" }]);
    const two = b.store.call("Song", "create", [{ title: "Santo" }]);
    const three = c.store.call("Song", "create", [{ title: "Aleluia" }]);
    await rounds([c, a, b]);
    for (const pc of [a, b, c]) assert.equal(songs(pc).length, 3);

    // Edits everywhere, two of them on the same song at almost the same time.
    await tick();
    a.store.call("Song", "update", [two.id, { lyrics: "Santo, santo" }]);
    b.store.call("Song", "delete", [three.id]);
    c.store.call("Song", "update", [one.id, { title: "Grande é o Senhor (C)" }]);
    await tick();
    a.store.call("Song", "update", [one.id, { title: "Grande é o Senhor (A)" }]);
    c.store.call("User", "update", [PROFILE_ID, { church_name: "Igreja Gerar", console_density: "compact" }]);
    await rounds([b, c, a]);

    const expected = songs(a);
    assert.deepEqual(expected.map((s) => s.title).sort(), ["Grande é o Senhor (A)", "Santo"], "the later edit wins, the delete travels");
    assert.equal(expected.find((s) => s.id === two.id).lyrics, "Santo, santo");
    for (const pc of [b, c]) assert.deepEqual(songs(pc), expected);
    for (const pc of [a, b]) {
        const profile = pc.store.call("User", "get", [PROFILE_ID]);
        assert.equal(profile.church_name, "Igreja Gerar");
        assert.notEqual(profile.console_density, "compact", "this computer's own fields stay");
    }
    // Everything written is forgotten from the outboxes; each wrote its own folder.
    for (const pc of [a, b, c]) {
        assert.equal(pc.store.outbox().length, 0);
        assert.ok(fs.existsSync(path.join(folder, "sync", pc.store.pcId, fileName(1))));
    }
    for (const pc of [a, b, c]) pc.close();
});

// A computer whose file we write by hand: its lines signed with the church's
// key (`keys`), or with whatever a test passes.
function fakeFolder(folder, keys = signed) {
    const id = crypto.randomUUID();
    const dir = path.join(folder, "sync", id);
    fs.mkdirSync(dir, { recursive: true });
    const entry = (title, extra = {}) => {
        const songId = extra.id || crypto.randomUUID();
        const at = extra.at || new Date().toISOString();
        return { seq: 1, entity: "Song", id: songId, op: "upsert", row: { id: songId, title, created_date: at }, at, pc: id };
    };
    const line = (e) => (keys ? keys.sign(JSON.stringify(e)) : JSON.stringify(e)) + "\n";
    return { id, dir, entry, line };
}

test("the background library's categories and each background's own travel", async () => {
    const folder = tmp();
    const a = computer(folder);
    const b = computer(folder);
    a.store.call("User", "update", [PROFILE_ID, { background_categories: ["Páscoa", "Natureza", "Outros"] }]);
    a.store.call("BackgroundPref", "create", [{ source: "bundled:1557672172-298e090bd0f1", category: "Páscoa", hidden: true }]);
    await rounds([a, b]);
    assert.deepEqual(b.store.call("User", "get", [PROFILE_ID]).background_categories, ["Páscoa", "Natureza", "Outros"]);
    const pref = b.store.call("BackgroundPref", "list", []).find((p) => p.source === "bundled:1557672172-298e090bd0f1");
    assert.equal(pref?.category, "Páscoa");
    assert.equal(pref?.hidden, true);

    // A rename on the other computer: the list and the pref, back to the first.
    await tick();
    b.store.call("User", "update", [PROFILE_ID, { background_categories: ["Semana Santa", "Natureza", "Outros"] }]);
    b.store.call("BackgroundPref", "update", [pref.id, { category: "Semana Santa" }]);
    await rounds([b, a]);
    assert.deepEqual(a.store.call("User", "get", [PROFILE_ID]).background_categories, ["Semana Santa", "Natureza", "Outros"]);
    assert.equal(a.store.call("BackgroundPref", "get", [pref.id]).category, "Semana Santa");
    for (const pc of [a, b]) pc.close();
});

test("a half-written last line waits for the next pass; conflict copies are read too", async () => {
    const folder = tmp();
    const b = computer(folder);
    const fake = fakeFolder(folder);
    const file = path.join(fake.dir, fileName(1));
    const x = fake.entry("X");
    const y = fake.line(fake.entry("Y"));
    fs.writeFileSync(file, fake.line(x) + y.slice(0, 25));

    let status = await b.engine.pass();
    assert.equal(status.state, "ok");
    assert.deepEqual(songs(b).map((s) => s.title), ["X"]);
    assert.equal(b.store.getMeta(STATE_KEY).cursors[`${fake.id}/${fileName(1)}`], Buffer.byteLength(fake.line(x)), "the cursor stops before the half line");

    // The rest arrives.
    fs.appendFileSync(file, y.slice(25));
    await b.engine.pass();
    assert.deepEqual(songs(b).map((s) => s.title).sort(), ["X", "Y"]);

    // Drive's conflict copy: an old entry again and a new one.
    fs.writeFileSync(path.join(fake.dir, "changes-000001 (1).jsonl"), fake.line(x) + fake.line(fake.entry("Z")));
    fs.writeFileSync(path.join(fake.dir, "changes-000001-PC-RECEPCAO.jsonl"), fake.line(fake.entry("W")));
    status = await b.engine.pass();
    assert.deepEqual(songs(b).map((s) => s.title).sort(), ["W", "X", "Y", "Z"]);
    assert.equal(status.received.skipped, 1, "the repeated entry changes nothing");
    assert.equal(status.computers.find((c) => c.pc === fake.id).files, 3);
    b.close();
});

test("an unreadable line is skipped once the file shows it went on; entries naming another computer are ignored", async () => {
    const folder = tmp();
    const b = computer(folder);
    const fake = fakeFolder(folder);
    const file = path.join(fake.dir, fileName(2));
    const forged = { ...fake.entry("Forjada"), pc: crypto.randomUUID() };
    fs.writeFileSync(file, fake.line(fake.entry("A")) + "{garbage\n" + fake.line(forged) + fake.line(fake.entry("B")));
    const status = await b.engine.pass();
    assert.deepEqual(songs(b).map((s) => s.title).sort(), ["A", "B"]);
    assert.equal(status.bad, 1);

    // As the last complete line, it waits one pass to see the file is not still arriving.
    const later = path.join(fake.dir, fileName(3));
    fs.writeFileSync(later, fake.line(fake.entry("C")) + "{still\n");
    assert.equal((await b.engine.pass()).bad, 0);
    assert.equal((await b.engine.pass()).bad, 1);
    assert.deepEqual(songs(b).map((s) => s.title).sort(), ["A", "B", "C"]);
    b.close();
});

test("files that arrive late or out of order, a file replaced by a shorter copy, a computer's folder deleted", async () => {
    const folder = tmp();
    const b = computer(folder);
    const fake = fakeFolder(folder);
    fs.writeFileSync(path.join(fake.dir, fileName(3)), fake.line(fake.entry("Três")));
    await b.engine.pass();
    fs.writeFileSync(path.join(fake.dir, fileName(1)), fake.line(fake.entry("Um")));
    await b.engine.pass();
    assert.deepEqual(songs(b).map((s) => s.title).sort(), ["Três", "Um"]);

    fs.writeFileSync(path.join(fake.dir, fileName(3)), fake.line(fake.entry("3")));
    await b.engine.pass();
    assert.ok(songs(b).some((s) => s.title === "3"), "read again from the start");

    fs.rmSync(fake.dir, { recursive: true });
    const status = await b.engine.pass();
    assert.equal(status.state, "ok");
    assert.equal(songs(b).length, 3, "nothing is undone by a folder going away");
    b.close();
});

test("cursors survive a restart: nothing is read twice", async () => {
    const folder = tmp();
    const a = computer(folder);
    const b = computer(folder);
    a.store.call("Song", "create", [{ title: "Um" }]);
    a.store.call("Song", "create", [{ title: "Dois" }]);
    await a.engine.pass();
    assert.equal((await b.engine.pass()).received.applied, 2);
    b.close();

    const again = computer(folder, { dir: b.dir });
    assert.equal(again.store.pcId, b.store.pcId);
    let status = await again.engine.pass();
    assert.deepEqual(status.received, { applied: 0, skipped: 0, failed: 0 });
    a.store.call("Song", "create", [{ title: "Três" }]);
    await a.engine.pass();
    status = await again.engine.pass();
    assert.deepEqual(status.received, { applied: 1, skipped: 0, failed: 0 });
    assert.equal(songs(again).length, 3);
    a.close();
    again.close();
});

test("media files travel with their rows, arrive late, and are never overwritten", async () => {
    const folder = tmp();
    const a = computer(folder);
    const b = computer(folder);
    fs.writeFileSync(path.join(a.mediaDir, "foto.jpg"), "picture");
    fs.writeFileSync(path.join(a.mediaDir, "clipe.mp4"), Buffer.alloc(5000, 3));
    a.store.call("Media", "create", [{ title: "Foto", type: "image", file_url: "keryx-media://foto.jpg" }]);
    a.store.call("Song", "create", [{ title: "Com fundo", background: { kind: "video", value: "keryx-media://clipe.mp4" }, background_image: "keryx-media://bundled/backgrounds/x.webp" }]);
    await a.engine.pass();
    assert.equal(fs.readFileSync(path.join(folder, "sync", "media", "foto.jpg"), "utf8"), "picture");
    assert.ok(!fs.existsSync(path.join(folder, "sync", "media", "bundled")), "the app's own files never travel");

    // The video has not come down yet on B's side.
    const shared = path.join(folder, "sync", "media", "clipe.mp4");
    const held = path.join(tmp(), "clipe.mp4");
    fs.renameSync(shared, held);
    fs.writeFileSync(shared, Buffer.alloc(100, 3)); // half of it, as a sync service may show
    let status = await b.engine.pass();
    assert.equal(fs.readFileSync(path.join(b.mediaDir, "foto.jpg"), "utf8"), "picture");
    assert.equal(b.store.call("Media", "list", [])[0].file_url, "keryx-media://foto.jpg", "the database keeps keryx-media:// urls");
    assert.equal(songs(b).length, 1, "the row does not wait for its file");
    assert.ok(!fs.existsSync(path.join(b.mediaDir, "clipe.mp4")), "a file not yet whole is not taken");
    assert.equal(status.missingMedia, 1);

    fs.rmSync(shared);
    fs.renameSync(held, shared);
    status = await b.engine.pass();
    assert.equal(status.missingMedia, 0);
    assert.equal(fs.statSync(path.join(b.mediaDir, "clipe.mp4")).size, 5000);
    assert.ok(!fs.readdirSync(b.mediaDir).some((n) => n.endsWith(".partial")));

    // Never overwritten, on either side.
    fs.writeFileSync(path.join(a.mediaDir, "foto.jpg"), "changed here");
    a.store.call("Media", "create", [{ title: "Foto de novo", type: "image", file_url: "keryx-media://foto.jpg" }]);
    await a.engine.pass();
    await b.engine.pass();
    assert.equal(fs.readFileSync(path.join(folder, "sync", "media", "foto.jpg"), "utf8"), "picture");
    assert.equal(fs.readFileSync(path.join(b.mediaDir, "foto.jpg"), "utf8"), "picture");
    a.close();
    b.close();
});

test("media still missing is retried after a restart", async () => {
    const folder = tmp();
    const a = computer(folder);
    let b = computer(folder);
    fs.writeFileSync(path.join(a.mediaDir, "tarde.png"), "late");
    a.store.call("Media", "create", [{ title: "Tarde", type: "image", file_url: "keryx-media://tarde.png" }]);
    await a.engine.pass();
    const shared = path.join(folder, "sync", "media", "tarde.png");
    const held = path.join(tmp(), "tarde.png");
    fs.renameSync(shared, held);
    assert.equal((await b.engine.pass()).missingMedia, 1);
    b.close();
    fs.renameSync(held, shared);
    b = computer(folder, { dir: b.dir });
    assert.equal((await b.engine.pass()).missingMedia, 0);
    assert.equal(fs.readFileSync(path.join(b.mediaDir, "tarde.png"), "utf8"), "late");
    a.close();
    b.close();
});

test("the windows hear which files have not come down; a row deleted is not waited for", async () => {
    const folder = tmp();
    const a = computer(folder);
    const b = computer(folder);
    fs.writeFileSync(path.join(a.mediaDir, "longe.mp4"), "far");
    const row = a.store.call("Media", "create", [{ title: "Longe", type: "video", file_url: "keryx-media://longe.mp4" }]);
    await a.engine.pass();
    fs.rmSync(path.join(folder, "sync", "media", "longe.mp4"));
    assert.equal((await b.engine.pass()).missingMedia, 1);
    assert.deepEqual(b.engine.missing(), ["longe.mp4"]);

    await tick();
    a.store.call("Media", "delete", [row.id]);
    await a.engine.pass();
    assert.equal((await b.engine.pass()).missingMedia, 0, "no row names it any more");
    assert.deepEqual(b.engine.missing(), []);
    a.close();
    b.close();

    let on = folder;
    const c = computer(() => on);
    c.store.setMeta(STATE_KEY, { folder, cursors: {}, out: null, missing: [{ name: "x.jpg", size: 1 }] });
    c.close();
    const again = computer(() => on, { dir: c.dir });
    on = null;
    assert.deepEqual(again.engine.missing(), [], "with sync off a file is simply not found");
    on = folder;
    assert.deepEqual(again.engine.missing(), ["x.jpg"], "known from the last run, before the first pass");
    again.close();
});

// The cleanup of sync/media runs at every pass and collects at once in
// these tests (no grace), unless a test says otherwise.
const GC_NOW = { engine: { gcGraceMs: 0, gcEveryMs: 0 } };
const shared = (folder, name) => path.join(folder, "sync", "media", name);
const manifestOf = (folder, pc) => JSON.parse(fs.readFileSync(path.join(folder, "sync", pc.store.pcId, "state.json"), "utf8"));

test("a file deleted everywhere leaves sync/media once every computer has read past the delete; the media folders keep it", async () => {
    const folder = tmp();
    const a = computer(folder, GC_NOW);
    const b = computer(folder, GC_NOW);
    const c = computer(folder, GC_NOW);
    fs.writeFileSync(path.join(a.mediaDir, "velho.mp4"), "video");
    fs.writeFileSync(path.join(a.mediaDir, "fica.jpg"), "picture");
    const old = a.store.call("Media", "create", [{ title: "Velho", type: "video", file_url: "keryx-media://velho.mp4" }]);
    a.store.call("Media", "create", [{ title: "Fica", type: "image", file_url: "keryx-media://fica.jpg" }]);
    await rounds([a, b, c]);
    for (const pc of [b, c]) assert.ok(fs.existsSync(path.join(pc.mediaDir, "velho.mp4")));
    const said = manifestOf(folder, b);
    assert.equal(said.pc, b.store.pcId);
    assert.deepEqual(said.refs, ["fica.jpg", "velho.mp4"], "each computer says the media its rows use");
    assert.ok(Object.keys(said.read).some((k) => k.startsWith(a.store.pcId)), "and how far it read");

    await tick();
    a.store.call("Media", "delete", [old.id]);
    await a.engine.pass();
    assert.ok(fs.existsSync(shared(folder, "velho.mp4")), "B and C still use it");
    await b.engine.pass();
    await a.engine.pass();
    assert.ok(fs.existsSync(shared(folder, "velho.mp4")), "C has not read the delete");
    const status = await c.engine.pass();
    assert.equal(status.collectedMedia, 1);
    assert.ok(!fs.existsSync(shared(folder, "velho.mp4")), "nobody uses it, everybody read past the delete");
    assert.ok(fs.existsSync(shared(folder, "fica.jpg")), "a file in use stays");
    for (const pc of [a, b, c]) assert.equal(fs.readFileSync(path.join(pc.mediaDir, "velho.mp4"), "utf8"), "video", "the media folder is never touched");
    assert.deepEqual(manifestOf(folder, c).collected.map((x) => x.name), ["velho.mp4"]);
    await rounds([a, b, c]);
    for (const pc of [a, b, c]) assert.equal(pc.engine.missing().length, 0);

    // A row that uses it again (here, the file still on B) brings it back.
    await tick();
    b.store.call("Song", "create", [{ title: "Com o vídeo", background: { kind: "video", value: "keryx-media://velho.mp4" } }]);
    await rounds([b, a, c]);
    assert.ok(fs.existsSync(shared(folder, "velho.mp4")));
    for (const pc of [a, b, c]) pc.close();
});

test("a computer that has not said what it read, or not read past the delete, or that uses the file, holds it", async () => {
    const folder = tmp();
    const a = computer(folder, GC_NOW);
    const b = computer(folder, GC_NOW);
    fs.writeFileSync(path.join(a.mediaDir, "x.jpg"), "x");
    const row = a.store.call("Media", "create", [{ title: "X", type: "image", file_url: "keryx-media://x.jpg" }]);
    await rounds([a, b]);
    // A computer with a folder and no state.json (an older KERYX).
    const fake = fakeFolder(folder);
    fs.writeFileSync(path.join(fake.dir, fileName(1)), fake.line(fake.entry("Do outro")));
    await tick();
    a.store.call("Media", "delete", [row.id]);
    await rounds([a, b]);
    assert.ok(fs.existsSync(shared(folder, "x.jpg")), "no state.json: it holds every file");

    const say = (read, refs, keys = signed) => fs.writeFileSync(path.join(fake.dir, "state.json"), keys.sign(JSON.stringify({ pc: fake.id, at: new Date().toISOString(), read, refs, collected: [] })));
    say({}, []);
    await rounds([a, b]);
    assert.ok(fs.existsSync(shared(folder, "x.jpg")), "it has not read past the delete");

    // Everything the others wrote, read.
    const everything = {};
    for (const pc of [a, b]) {
        const dir = path.join(folder, "sync", pc.store.pcId);
        for (const n of fs.readdirSync(dir).filter((x) => x.startsWith("changes-"))) everything[`${pc.store.pcId}/${n}`] = fs.statSync(path.join(dir, n)).size;
    }
    say(everything, ["x.jpg"]);
    await rounds([a, b]);
    assert.ok(fs.existsSync(shared(folder, "x.jpg")), "it still uses the file");
    // A state.json without the church's signature says nothing: the
    // computer still holds the file, as with none.
    say(everything, [], keysFor(crypto.randomBytes(32), CHURCH.id));
    await a.engine.pass();
    assert.ok(fs.existsSync(shared(folder, "x.jpg")), "an unsigned state.json does not count");
    // A computer that never had the code holds nothing back.
    const stranger = fakeFolder(folder, null);
    fs.writeFileSync(path.join(stranger.dir, fileName(1)), stranger.line(stranger.entry("Sem código")));
    say(everything, []);
    await a.engine.pass();
    assert.ok(!fs.existsSync(shared(folder, "x.jpg")));
    assert.ok(fs.existsSync(path.join(b.mediaDir, "x.jpg")));
    a.close();
    b.close();
});

test("a file must stay unused for the grace period before it goes", async () => {
    const folder = tmp();
    let clock = Date.parse("2026-10-16T12:00:00.000Z");
    const now = () => new Date(clock);
    const a = computer(folder, { engine: { now } });
    const b = computer(folder, { engine: { now } });
    fs.writeFileSync(path.join(a.mediaDir, "z.png"), "z");
    const row = a.store.call("Media", "create", [{ title: "Z", type: "image", file_url: "keryx-media://z.png" }]);
    await rounds([a, b]);
    clock += 60 * 60 * 1000;
    a.store.call("Media", "delete", [row.id]);
    await a.engine.pass();
    await b.engine.pass();
    // The cleanup looks every 10 minutes.
    clock += 15 * 60 * 1000;
    await a.engine.pass();
    assert.ok(fs.existsSync(shared(folder, "z.png")));
    assert.ok(a.store.getMeta(STATE_KEY).gc.candidates["z.png"], "marked as unused");

    clock += 3 * 24 * 60 * 60 * 1000;
    await rounds([a, b]);
    assert.ok(fs.existsSync(shared(folder, "z.png")), "3 days are not enough");
    clock += 5 * 24 * 60 * 60 * 1000;
    await a.engine.pass();
    assert.ok(!fs.existsSync(shared(folder, "z.png")), "after a week it goes");
    assert.deepEqual(a.store.getMeta(STATE_KEY).gc.marks, {}, "nothing left to remember");
    a.close();
    b.close();
});

test("a computer that still uses a file someone collected puts it back from its media folder", async () => {
    const folder = tmp();
    const a = computer(folder, GC_NOW);
    fs.writeFileSync(path.join(a.mediaDir, "volta.jpg"), "back");
    a.store.call("Media", "create", [{ title: "Volta", type: "image", file_url: "keryx-media://volta.jpg" }]);
    await a.engine.pass();
    fs.rmSync(shared(folder, "volta.jpg"));
    await a.engine.pass();
    assert.ok(!fs.existsSync(shared(folder, "volta.jpg")), "a file only missing from the folder is not copied blindly (Drive may still be bringing it)");

    const fake = fakeFolder(folder);
    fs.writeFileSync(path.join(fake.dir, "state.json"), signed.sign(JSON.stringify({ pc: fake.id, at: new Date().toISOString(), read: {}, refs: [], collected: [{ name: "volta.jpg", at: new Date().toISOString() }] })));
    await a.engine.pass();
    assert.equal(fs.readFileSync(shared(folder, "volta.jpg"), "utf8"), "back");
    a.close();
});

test("no folder, or a folder that is not there: no crash, a status, nothing made", async () => {
    const base = tmp();
    let folder = null;
    const a = computer(() => folder);
    a.store.call("Song", "create", [{ title: "Guardada" }]);
    assert.equal((await a.engine.pass()).state, "off");
    folder = path.join(base, "G-drive", "KERYX");
    const status = await a.engine.pass();
    assert.equal(status.state, "offline");
    assert.match(status.error, /não está disponível/);
    assert.ok(!fs.existsSync(folder));
    assert.equal(a.store.outbox().length, 1, "kept for when the folder is back");

    fs.mkdirSync(folder, { recursive: true });
    assert.equal((await a.engine.pass()).sent, 1);
    assert.equal(a.store.outbox().length, 0);
    a.close();
});

test("new files past the limit; a file number is never reused after the folder is deleted", async () => {
    const folder = tmp();
    const a = computer(folder, { engine: { fileLimit: 600 } });
    const b = computer(folder);
    const mine = path.join(folder, "sync", a.store.pcId);
    for (let i = 0; i < 6; i++) {
        a.store.call("Song", "create", [{ title: `Música ${i}` }]);
        await a.engine.pass();
    }
    const changes = (dir) => fs.readdirSync(dir).filter((n) => n.startsWith("changes-")).sort();
    const files = changes(mine);
    assert.ok(files.length >= 2, `several files: ${files}`);
    await b.engine.pass();
    assert.equal(songs(b).length, 6);

    const last = Math.max(...files.map((f) => Number(/\d+/.exec(f)[0])));
    fs.rmSync(mine, { recursive: true });
    a.store.call("Song", "create", [{ title: "Depois" }]);
    await a.engine.pass();
    assert.deepEqual(changes(mine), [fileName(last + 1)]);
    await b.engine.pass();
    assert.equal(songs(b).length, 7, "B's cursor on the old number does not hide the new file");
    a.close();
    b.close();
});

test("a pass runs at a time; local changes ask for one; remote ones do not echo", async () => {
    const folder = tmp();
    const a = computer(folder);
    const b = computer(folder);
    a.store.call("Song", "create", [{ title: "Uma" }]);
    const [first, second] = [a.engine.pass(), a.engine.pass()];
    assert.equal(first, second);
    await first;

    // A pass's disk work can outlast any fixed wait (Windows, an antivirus
    // scanning the temp folder), so the test waits for the passes it expects
    // to finish and counts the ones that START (each reads the folder first,
    // synchronously when the debounce fires) to see that no other was asked.
    let started = 0;
    let passes = 0;
    const counted = createSyncEngine({
        store: b.store,
        mediaDir: b.mediaDir,
        getFolder: () => { started += 1; return folder; },
        getPairing: () => CHURCH,
        log: () => {},
        onStatus: () => { passes += 1; },
    });
    const finished = async (n) => {
        const until = Date.now() + 10000;
        while (passes < n && Date.now() < until) await tick();
        assert.equal(passes, n, `pass ${n} finished`);
    };
    counted.start({ intervalMs: 60000, debounce: 10 });
    await finished(1);
    assert.equal(started, 1, "the first pass after start");
    assert.equal(songs(b).length, 1);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(started, 1, "what the pass applied does not ask for another");
    b.store.call("Song", "create", [{ title: "Outra" }]);
    b.store.call("OutputPref", "create", [{ page: "/Projection" }]);
    await finished(2);
    assert.equal(started, 2, "both changes ask for one pass");
    assert.equal(b.store.outbox().length, 0);
    counted.stop();
    a.close();
    b.close();
});

// -- PCs verificados ------------------------------------------------------------

test("lines without the church's signature are counted for their computer, never applied", async () => {
    const folder = tmp();
    const a = computer(folder);
    await a.engine.pass(); // writes the code's file
    const stranger = fakeFolder(folder, null); // never had the code
    const forger = fakeFolder(folder, keysFor(crypto.randomBytes(32), CHURCH.id)); // the id, not the key
    const friend = fakeFolder(folder);
    fs.writeFileSync(path.join(stranger.dir, fileName(1)), stranger.line(stranger.entry("Sem código")));
    fs.writeFileSync(path.join(forger.dir, fileName(1)), forger.line(forger.entry("Forjada")));
    // A signed line altered afterwards: the signature covers every byte.
    const altered = friend.line(friend.entry("Original")).replace("Original", "Alterada");
    fs.writeFileSync(path.join(friend.dir, fileName(1)), altered + friend.line(friend.entry("Verdadeira")));

    const status = await a.engine.pass();
    assert.deepEqual(songs(a).map((s) => s.title), ["Verdadeira"]);
    assert.equal(status.rejected, 3);
    const seen = Object.fromEntries(status.computers.map((c) => [c.pc, c]));
    assert.equal(seen[stranger.id].verified, false);
    assert.equal(seen[stranger.id].rejected, 1);
    assert.equal(seen[forger.id].verified, false);
    assert.equal(seen[friend.id].verified, true, "its last line verified");
    assert.equal(seen[friend.id].rejected, 1);

    // Read once: the next pass does not count them again, and remembers who is who.
    const again = await a.engine.pass();
    assert.equal(again.rejected, 0);
    assert.equal(again.computers.find((c) => c.pc === stranger.id).verified, false);
    a.close();
});

test("a computer joins with the church's code; a wrong code or a typo is told apart", async () => {
    const folder = tmp();
    const syncDir = syncDirOf(folder);
    const { makeCode } = await import("../shared/syncCode.mjs");
    const valid = makeCode();
    const typo = valid.slice(0, -1) + (valid.endsWith("0") ? "1" : "0");
    assert.deepEqual(await joinPairing(syncDir, typo), { error: "check" });
    assert.equal((await joinPairing(syncDir, "K7QM-2H")).error, "short");

    const a = computer(folder, { pairing: null });
    assert.equal((await a.engine.pass()).state, "unpaired", "a folder and no code: nothing happens");
    assert.equal((await inspectFolder(folder)).code, "missing");
    const nothingYet = await joinPairing(syncDir, valid);
    assert.equal(nothingYet.error, "nocode");

    const made = await createPairing(syncDir, { pc: a.store.pcId });
    assert.match(made.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const file = JSON.parse(fs.readFileSync(path.join(syncDir, PAIRING_FILE), "utf8"));
    assert.equal(file.id, made.id);
    assert.ok(!JSON.stringify(file).includes(made.code.replace(/-/g, "")), "the code is never in the folder");
    assert.deepEqual(await createPairing(syncDir, { pc: a.store.pcId }), { error: "exists" }, "a second code needs asking");

    a.pair({ id: made.id, key: made.key });
    a.store.call("Song", "create", [{ title: "Da primeira" }]);
    assert.equal((await a.engine.pass()).state, "ok");

    // Another church's code, valid but not this folder's.
    const elsewhere = tmp();
    const theirs = await createPairing(syncDirOf(elsewhere), { pc: crypto.randomUUID() });
    assert.deepEqual(await joinPairing(syncDir, theirs.code), { error: "wrong" });

    // Typed the way people type it.
    const typed = ` ${made.code.toLowerCase().replace(/-/g, " ")} `;
    const joined = await joinPairing(syncDir, typed);
    assert.equal(joined.id, made.id);
    assert.ok(joined.key.equals(made.key));
    const b = computer(folder, { pairing: { id: joined.id, key: joined.key } });
    b.store.call("Song", "create", [{ title: "Da segunda" }]);
    const c = computer(folder, { pairing: { id: joined.id, key: joined.key } });
    await rounds([a, b, c], 2);
    for (const pc of [a, b, c]) assert.deepEqual(songs(pc).map((s) => s.title).sort(), ["Da primeira", "Da segunda"]);
    const seen = await inspectFolder(folder);
    assert.equal(seen.code, "ok");
    assert.equal(seen.computers.length, 3, "each says what it read (state.json)");
    assert.equal(seen.computers.filter((x) => x.files > 0).length, 2, "two wrote changes; the third only read");
    for (const pc of [a, b, c]) pc.close();
});

test("the code changes: a computer with the old one stops, keeps its changes, and catches up with the new one", async () => {
    const folder = tmp();
    const syncDir = syncDirOf(folder);
    const first = await createPairing(syncDir, { pc: "x" });
    const old = { id: first.id, key: first.key };
    const a = computer(folder, { pairing: old });
    const b = computer(folder, { pairing: old });
    a.store.call("Song", "create", [{ title: "Antes" }]);
    b.store.call("Song", "create", [{ title: "Antes, de B" }]);
    await rounds([a, b], 2);
    assert.equal(songs(b).length, 2);
    const filesFromB = fs.readdirSync(path.join(syncDir, b.store.pcId));

    // A makes a new code (to leave out a computer that should not sync any more).
    const next = await createPairing(syncDir, { pc: a.store.pcId, replace: true });
    a.pair({ id: next.id, key: next.key });
    b.store.call("Song", "create", [{ title: "Enquanto isso" }]);
    let status = await b.engine.pass();
    assert.equal(status.state, "mismatch");
    assert.match(status.error, /código/);
    assert.equal(b.store.outbox().length, 1, "nothing written with the old code: the change waits");
    assert.deepEqual(fs.readdirSync(path.join(syncDir, b.store.pcId)), filesFromB, "no new line from B");
    status = await a.engine.pass();
    assert.equal(status.state, "ok");
    assert.equal(songs(a).length, 2);

    // B types the new code.
    const joined = await joinPairing(syncDir, next.code);
    b.pair({ id: joined.id, key: joined.key });
    await rounds([b, a], 2);
    assert.deepEqual(songs(a).map((s) => s.title).sort(), ["Antes", "Antes, de B", "Enquanto isso"]);
    assert.equal(b.store.outbox().length, 0);
    // A read B's folder again from the start under the new code: B's lines
    // from before the change no longer verify (A had them already), its new
    // ones do.
    const fromB = (await a.engine.pass()).computers.find((c) => c.pc === b.store.pcId);
    assert.equal(fromB.verified, true);
    assert.ok(fromB.rejected >= 1);
    a.close();
    b.close();
});

test("Tirar: a computer taken out stops, the others skip it, and typing the code brings it back", async () => {
    const folder = tmp();
    const syncDir = syncDirOf(folder);
    const a = computer(folder);
    const b = computer(folder);
    const c = computer(folder);
    a.store.call("Song", "create", [{ title: "Antes" }]);
    b.store.call("Song", "create", [{ title: "De B, antes" }]);
    await rounds([a, b, c], 2);

    // A takes B out.
    const list = await updateRemoved(syncDir, CHURCH, (now) => [...now, { pc: b.store.pcId, at: new Date().toISOString(), by: a.store.pcId }], { pc: a.store.pcId });
    assert.deepEqual(list.map((r) => r.pc), [b.store.pcId]);
    b.store.call("Song", "create", [{ title: "De B, tirado" }]);
    const out = await b.engine.pass();
    assert.equal(out.state, "removed");
    assert.equal(out.removed.by, a.store.pcId);
    assert.equal(b.store.outbox().length, 1, "its change waits");
    // A line B wrote anyway (it had not seen the list yet) is skipped too.
    const lateDir = path.join(syncDir, b.store.pcId);
    fs.appendFileSync(path.join(lateDir, fileName(1)), signed.sign(JSON.stringify({ seq: 9, entity: "Song", id: crypto.randomUUID(), op: "upsert", row: { title: "Atrasada" }, at: new Date().toISOString(), pc: b.store.pcId })) + "\n");
    const seen = await c.engine.pass();
    assert.ok(!songs(c).some((x) => x.title === "Atrasada"), "a computer taken out is not read");
    assert.equal(seen.computers.find((x) => x.pc === b.store.pcId).removed.by, a.store.pcId);

    // A list edited without the key takes nobody out.
    const file = path.join(syncDir, PAIRING_FILE);
    const forged = JSON.parse(fs.readFileSync(file, "utf8"));
    forged.removed.push({ pc: c.store.pcId, at: "x", by: "y" });
    fs.writeFileSync(file, JSON.stringify(forged));
    assert.equal((await c.engine.pass()).state, "ok", "the forged entry has no valid mac");
    assert.equal((await b.engine.pass()).state, "ok", "and the whole list stops counting while it does not verify");
    await updateRemoved(syncDir, CHURCH, (now) => now.filter((r) => r.pc !== c.store.pcId), { pc: a.store.pcId });

    // B is back once the list no longer names it (B typing the code takes
    // itself off: syncControl's join).
    await updateRemoved(syncDir, CHURCH, (now) => [...now, { pc: b.store.pcId, at: new Date().toISOString(), by: a.store.pcId }], { pc: a.store.pcId });
    assert.equal((await b.engine.pass()).state, "removed");
    await updateRemoved(syncDir, CHURCH, (now) => now.filter((r) => r.pc !== b.store.pcId), { pc: b.store.pcId });
    await rounds([b, a, c], 2);
    for (const pc of [a, c]) assert.ok(songs(pc).some((x) => x.title === "De B, tirado"));
    for (const pc of [a, b, c]) pc.close();
});

test("the code's file: written back when it goes missing, waited for while it arrives", async () => {
    const folder = tmp();
    const a = computer(folder);
    await a.engine.pass();
    const file = path.join(syncDirOf(folder), PAIRING_FILE);
    assert.equal((await readPairing(syncDirOf(folder))).file.id, CHURCH.id);

    fs.rmSync(file);
    assert.equal((await a.engine.pass()).state, "ok");
    assert.ok(fs.existsSync(file), "any computer with the code writes it back");

    fs.writeFileSync(file, '{"v":1,"id":"igreja');
    a.store.call("Song", "create", [{ title: "Espera" }]);
    const status = await a.engine.pass();
    assert.equal(status.state, "offline");
    assert.match(status.error, /chegando/);
    assert.equal(a.store.outbox().length, 1);
    assert.equal(fs.readFileSync(file, "utf8"), '{"v":1,"id":"igreja', "never written over");
    a.close();
});

test("coalesce: one line per row and moment, the later write winning", () => {
    const at = "2026-10-16T10:00:00.000Z";
    const lines = coalesce([
        { seq: 1, entity: "Song", id: "s", op: "upsert", row: { id: "s", title: "a" }, at, pc: "old" },
        { seq: 2, entity: "Song", id: "t", op: "upsert", row: { id: "t" }, at, pc: "old" },
        { seq: 3, entity: "Song", id: "s", op: "upsert", row: { id: "s", title: "b" }, at, pc: "old" },
        { seq: 4, entity: "User", id: "local", op: "upsert", row: { id: "local", logo_url: "x" }, at, pc: "old" },
        { seq: 5, entity: "User", id: "local", op: "upsert", row: { id: "local", church_name: "y" }, at, pc: "old" },
        { seq: 6, entity: "Song", id: "t", op: "delete", row: null, at, pc: "old" },
    ], "me");
    assert.deepEqual(lines.map((l) => [l.seq, l.op, l.row?.title]), [[3, "upsert", "b"], [6, "delete", undefined], [5, "upsert", undefined]]);
    assert.deepEqual(lines[2].row, { id: "local", logo_url: "x", church_name: "y" });
    assert.ok(lines.every((l) => l.pc === "me"), "written as this computer's");
});

test("mediaRefs: uploaded files only", () => {
    assert.deepEqual(mediaRefs({ a: "keryx-media://a1.jpg", b: { value: "keryx-media://b-2.mp4" }, c: "keryx-media://bundled/backgrounds/x.webp", d: "http://x/keryx-media://y" }).sort(), ["a1.jpg", "b-2.mp4", "y"]);
    assert.deepEqual(mediaRefs(null), []);
});
