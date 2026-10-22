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
const { SYNC_ENTITIES, ON_EACH_COMPUTER, LOCAL_USER_FIELDS, syncRow } = require("./db/syncScope.cjs");

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

// -- The whole church (Rodada G7) -------------------------------------------
//
// "Uma igreja inteira": one row of every synced entity, with every field that
// can hold a file filled with one (`file(field, ext)` writes it into the
// first computer's media folder and notes the field). The drift test below
// holds the jsonc to this list: a new field that may hold a file is filled
// here, or said not to be one.

function churchInABox(mediaDir) {
    const used = new Set();
    const files = new Map(); // name -> bytes
    const file = (field, ext, tag = "") => {
        used.add(field);
        const name = `${field.replace(/[^A-Za-z0-9]+/g, "-").replace(/-+$/, "").toLowerCase()}${tag ? `-${tag}` : ""}${ext}`;
        const bytes = Buffer.from(`${field} ${tag}`.repeat(40));
        if (mediaDir) fs.writeFileSync(path.join(mediaDir, name), bytes);
        files.set(name, bytes);
        return `keryx-media://${name}`;
    };
    const ids = { service: crypto.randomUUID(), song: crypto.randomUUID(), cls: crypto.randomUUID() };
    const rows = {
        AlertPreset: [{ message: "Carro ABC-1234 com o farol aceso" }],
        BackgroundPref: [{ source: file("BackgroundPref.source", ".jpg"), category: "Páscoa", dim_pct: 30 }],
        BibleMaterial: [
            {
                title: "A criação", type: "slides", class_id: ids.cls, class_name: "Juniores",
                background_image: file("BibleMaterial.background_image", ".jpg"),
                slides: [{ text: "No princípio", image_url: file("BibleMaterial.slides[].image_url", ".png") }],
            },
            { title: "Vídeo da arca", type: "video", video_url: file("BibleMaterial.video_url", ".mp4") },
            { title: "O arco-íris", type: "image", image_url: file("BibleMaterial.image_url", ".jpg") },
            { title: "Quiz", type: "quiz", quiz_questions: [{ question: "Quantos dias?", options: ["6", "7"], correct: 1 }] },
        ],
        BibleNote: [{ reference: "João 3:16", book: "João", chapter: 3, verse: 16, note_type: "favorite", note_text: "Para o culto" }],
        BiblePassage: [{
            reference: "Salmos 23", book: "Salmos", chapter: 23, text: "O Senhor é o meu pastor",
            background_image: file("BiblePassage.background_image", ".jpg"),
            slides: [{ text: "O Senhor é o meu pastor", image_url: file("BiblePassage.slides[].image_url", ".png") }],
        }],
        BibleSchoolClass: [{ id: ids.cls, name: "Juniores", teacher_name: "Ana", students: ["Lia", "Davi"] }],
        CommunicationVideo: [{
            title: "Retiro", type: "announcement", text: "Retiro de jovens",
            background_image: file("CommunicationVideo.background_image", ".jpg"),
            background_video: file("CommunicationVideo.background_video", ".mp4"),
            background_audio: file("CommunicationVideo.background_audio", ".mp3"),
            files: [{ url: file("CommunicationVideo.files[].url", ".jpg"), duration: 5 }],
        }],
        Media: [
            { title: "Abertura", type: "video", file_url: file("Media.file_url", ".mp4"), thumbnail_url: file("Media.thumbnail_url", ".jpg"), duration: 30 },
            { title: "Avisos", type: "pdf", file_url: file("Media.file_url", ".pdf", "pdf"), pages: [{ url: file("Media.pages[].url", ".png"), w: 1920, h: 1080 }] },
            { title: "Hino", type: "audio", file_url: file("Media.file_url", ".mp3", "audio"), category: "other" },
            { title: "Fundo", type: "image", file_url: file("Media.file_url", ".jpg", "fundo"), category: "background" },
            // A church font's face (Rodada HF1): the file travels like any media.
            { title: "Montserrat", type: "font", category: "font", file_url: file("Media.file_url", ".ttf", "fonte"), font: { family: "Montserrat", weight: "700", style: "italic", face: "Bold Italic", origin: "pc" } },
        ],
        ProjectionTheme: [{
            name: "Natal",
            background: { kind: "video", value: file("ProjectionTheme.background", ".mp4"), dim: 0.4 },
            background_image: file("ProjectionTheme.background_image", ".jpg"),
            elements: [{ id: "e1", type: "image", props: { url: file("ProjectionTheme.elements[].props.url", ".png") } }],
            pinned: true,
        }],
        Service: [{
            id: ids.service, title: "Culto de domingo", date: "2026-10-25", time: "19:00",
            background: { kind: "image", value: file("Service.background", ".jpg") },
            standby_background: file("Service.standby_background", ".jpg"),
            // Setlist automática (Rodada N2): the switch and the pause travel with the culto.
            autoplay: true, autoplay_gap: 3,
        }],
        ServiceItem: [{ serviceId: ids.service, order: 1, type: "SONG", title: "Grande é o Senhor", contentId: ids.song, end_action: "loop" }],
        ServiceTemplate: [{ name: "Domingo à noite", background: { kind: "video", value: file("ServiceTemplate.background", ".mp4") }, items: [{ type: "SECTION", title: "Louvor" }] }],
        Song: [
            {
                id: ids.song, title: "Grande é o Senhor", lyrics: "Grande é o Senhor\n\nE mui digno de louvor",
                audio_url: file("Song.audio_url", ".mp3", "playback"),
                background: { kind: "video", value: file("Song.background", ".mp4") },
                background_image: file("Song.background_image", ".jpg"),
                slides: [{ text: "Grande é o Senhor", start: 3, image_url: file("Song.slides[].image_url", ".png") }],
            },
            { title: "Com clipe", lyrics: "Aleluia", audio_url: file("Song.audio_url", ".mp4", "clipe") },
        ],
        SongHistory: [{ song_id: ids.song, song_title: "Grande é o Senhor", service_id: ids.service, played_at: "2026-10-18T22:00:00.000Z" }],
        TimerPreset: [{ minutes: 7 }],
        WorshipTeam: [{ name: "Marcos", role: "Bateria", active: true }],
    };
    const profile = {
        church_name: "Igreja Gerar",
        idle_mode: "background",
        logo_url: file("User.logo_url", ".png"),
        background_url: file("User.background_url", ".jpg"),
        standby_background: file("User.standby_background", ".jpg"),
        default_background: { kind: "image", value: file("User.default_background", ".jpg") },
        weekday_backgrounds: { 0: { kind: "image", value: file("User.weekday_backgrounds", ".jpg") } },
    };
    return { rows, profile, files, used };
}

// The fields a written row came back with, for comparing two computers.
const sameFields = (row, fields) => Object.fromEntries(Object.keys(fields).map((k) => [k, row?.[k]]));

test("the whole church goes to the other computers: every row, every file, then the deletes", async () => {
    const folder = tmp();
    const a = computer(folder);
    const b = computer(folder);
    const c = computer(folder);
    const box = churchInABox(a.mediaDir);
    assert.deepEqual(Object.keys(box.rows).concat("User").sort(), [...SYNC_ENTITIES].sort(), "one row of every synced entity");

    const made = {};
    for (const [entity, list] of Object.entries(box.rows)) made[entity] = list.map((row) => a.store.call(entity, "create", [row]));
    a.store.call("User", "update", [PROFILE_ID, box.profile]);
    await a.engine.pass();
    for (const name of box.files.keys()) assert.ok(fs.existsSync(shared(folder, name)), `${name} is in the folder`);

    // Drive has not brought the theme's video down yet: "Baixando…" on the others.
    const late = "projectiontheme-background.mp4";
    const held = path.join(tmp(), late);
    fs.renameSync(shared(folder, late), held);
    for (const pc of [b, c]) {
        const status = await pc.engine.pass();
        assert.equal(status.missingMedia, 1);
        assert.deepEqual(pc.engine.missing(), [late]);
        assert.equal(pc.store.call("ProjectionTheme", "list", []).length, 1, "the row does not wait for its file");
    }
    fs.renameSync(held, shared(folder, late));
    await rounds([a, b, c]);

    for (const pc of [b, c]) {
        assert.deepEqual(pc.engine.missing(), [], "Baixando… clears");
        for (const [entity, list] of Object.entries(made)) {
            for (const [i, row] of list.entries()) {
                const there = pc.store.call(entity, "get", [row.id]);
                assert.deepEqual(sameFields(there, box.rows[entity][i]), sameFields(row, box.rows[entity][i]), `${entity} ${i}`);
            }
        }
        assert.deepEqual(sameFields(pc.store.call("User", "get", [PROFILE_ID]), box.profile), box.profile, "the church's profile");
        for (const [name, bytes] of box.files) {
            assert.deepEqual(fs.readFileSync(path.join(pc.mediaDir, name)), bytes, `${name} came down whole`);
        }
    }

    // Deleted on another computer than the one that made them: gone everywhere.
    await tick();
    for (const [entity, list] of Object.entries(made)) for (const row of list) c.store.call(entity, "delete", [row.id]);
    c.store.call("User", "update", [PROFILE_ID, { logo_url: null, default_background: null }]);
    await rounds([c, a, b]);
    for (const pc of [a, b]) {
        for (const entity of Object.keys(made)) assert.deepEqual(pc.store.call(entity, "list", []), [], `${entity} deleted`);
        const profile = pc.store.call("User", "get", [PROFILE_ID]);
        assert.equal(profile.logo_url, null);
        assert.equal(profile.default_background, null);
        assert.equal(profile.church_name, "Igreja Gerar");
    }
    for (const pc of [a, b, c]) pc.close();
});

// Drift: a field the jsonc may fill with a file cannot be forgotten.
// FILE_NAME picks the candidates by name (nested ones too); each is either
// filled in churchInABox above, or listed here as not a file.
const FILE_NAME = /url|image|video|audio|background|logo|file|thumbnail|poster|pages|source|slides|elements|design|picture|photo|icon|media/i;
const NOT_A_FILE = {
    "BibleMaterial.background_color": "a colour",
    "CommunicationVideo.background_color": "a colour",
    "CommunicationVideo.logo_position": "a corner",
    "ProjectionTheme.background_fit": "cover or contain",
    "ProjectionTheme.background_generator": "a generated background's numbers (shared/generators.mjs)",
    "User.background_categories": "the categories' names",
    "User.media_categories": "the categories' names",
    "User.logo_corner": "a corner",
    "User.logo_size": "a size",
    "User.media_transition": "a transition's name",
    "OutputPref.icon": "a design-system icon's name",
    "BibleEdition.file_name": "the name of the file an own Bible came from, shown in its row; the file is never copied",
    "Media.video_codec": "the codec read from the video's bytes (src/lib/videoCodec.js)",
    "Media.video_chroma": "how the video's colour is sampled, read from its bytes (src/lib/videoCodec.js)",
};
// Fields of the entities kept on each computer that hold files: they stay
// there on purpose (syncScope.cjs ON_EACH_COMPUTER).
const STAYS_HERE = {
    "OutputPref.design": "the screens' designs; they move with Rodada G10, which replaces OutputPref's content fields first",
};

function fileCandidates(entitiesDir, entities) {
    const out = [];
    for (const f of fs.readdirSync(entitiesDir).filter((n) => n.endsWith(".jsonc"))) {
        const doc = JSON.parse(fs.readFileSync(path.join(entitiesDir, f), "utf8"));
        if (!entities.has(doc.name)) continue;
        const walk = (props, prefix) => {
            for (const [key, def] of Object.entries(props || {})) {
                if (["number", "integer", "boolean"].includes(def.type)) continue;
                const at = prefix + key;
                if (FILE_NAME.test(key)) out.push(`${doc.name}.${at}`);
                if (def.type === "array" && def.items?.properties) walk(def.items.properties, `${at}[].`);
                if (def.type === "object" && def.properties) walk(def.properties, `${at}.`);
            }
        };
        walk(doc.properties, "");
    }
    return out;
}

test("drift: every field that may hold a file travels in the whole-church test, or is said not to", () => {
    const dir = path.join(__dirname, "..", "base44", "entities");
    const { used } = churchInABox(null);
    const covered = (field) => [...used].some((u) => u === field || u.startsWith(`${field}.`) || u.startsWith(`${field}[]`));

    for (const field of fileCandidates(dir, SYNC_ENTITIES)) {
        assert.ok(covered(field) || NOT_A_FILE[field], `${field} may hold a file: fill it in churchInABox (sync.test.cjs) or list it in NOT_A_FILE`);
    }
    for (const field of fileCandidates(dir, ON_EACH_COMPUTER)) {
        assert.ok(STAYS_HERE[field] || NOT_A_FILE[field], `${field} holds a file that stays on each computer: list it in STAYS_HERE, or move the entity to SYNC_ENTITIES`);
    }
    // The lists name real fields (a renamed one is not left behind here).
    const known = new Set([...fileCandidates(dir, SYNC_ENTITIES), ...fileCandidates(dir, ON_EACH_COMPUTER)]);
    for (const field of [...Object.keys(NOT_A_FILE), ...Object.keys(STAYS_HERE)]) assert.ok(known.has(field), `${field} is no longer in the jsonc`);

    // syncRow keeps every column of a synced row but this computer's own
    // profile fields, and none of those may hold a file.
    for (const entity of SYNC_ENTITIES) {
        const cols = Object.keys(schema.entities[entity].columns);
        const row = Object.fromEntries(cols.map((k) => [k, "x"]));
        const kept = Object.keys(syncRow(entity, row));
        const dropped = cols.filter((k) => !kept.includes(k));
        assert.deepEqual(dropped, entity === "User" ? cols.filter((k) => LOCAL_USER_FIELDS.has(k)) : [], `${entity}: what syncRow drops`);
    }
    for (const field of LOCAL_USER_FIELDS) assert.ok(!FILE_NAME.test(field), `User.${field} stays on each computer and may hold a file`);
});

test("each computer says which Bible editions it has (names only, never the text); a change is told at the next pass", async () => {
    const folder = tmp();
    let editions = ["NVI", "acf", "../x", 7];
    const a = computer(folder, { engine: { describe: () => ({ name: "PC-SOM", version: "0.2.20", bibles: editions }) } });
    const b = computer(folder, { engine: { describe: () => ({ name: "PC-PROJETOR", version: "0.2.20", bibles: [] }) } });
    await rounds([a, b], 1);
    const said = JSON.parse(fs.readFileSync(path.join(folder, "sync", a.store.pcId, "computer.json"), "utf8"));
    assert.deepEqual(said.bibles, ["ACF", "NVI"], "short names only");
    let status = await b.engine.pass();
    assert.deepEqual(status.computers.find((x) => x.pc === a.store.pcId).bibles, ["ACF", "NVI"]);

    editions = ["NVI", "ACF", "AA"];
    await a.engine.pass();
    status = await b.engine.pass();
    assert.deepEqual(status.computers.find((x) => x.pc === a.store.pcId).bibles, ["AA", "ACF", "NVI"]);
    assert.equal(b.store.call("BibleVerse", "list", []).length, 0, "no verse ever travels");
    for (const pc of [a, b]) pc.close();
});
