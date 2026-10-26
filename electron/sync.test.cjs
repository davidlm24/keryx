// node --test electron/sync.test.cjs   (npm test)
// Two or three computers (temp stores, each with its media folder) and one
// fake Google Drive (syncStore/fakeDrive.cjs: immutable objects, names that
// are not unique, a listing that can lag) standing in for the church's. The
// last tests run the folder adapter on a temp folder, as Drive para
// computador keeps one in step, with computers on an older KERYX in it.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore, PROFILE_ID } = require("./db/store.cjs");
const { createSyncEngine, inspectStore, inspectFolder, mediaRefs, coalesce, addRange, endLine, STATE_KEY } = require("./sync.cjs");
const { keysFor, createPairing, joinPairing, readPairing, updateRemoved, PAIRING_FILE } = require("./syncPairing.cjs");
const { createFakeDrive, createFolderStore, changesName } = require("./syncStore/index.cjs");
const schema = require("./db/schema.json");
const { SYNC_ENTITIES, ON_EACH_COMPUTER, LOCAL_USER_FIELDS, syncRow } = require("./db/syncScope.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keryx-sync-"));

// The church's code, already typed on every test computer unless a test says
// otherwise (the key is what the code would make; the first pass writes the
// code's file into the store).
const CHURCH = { id: "igreja-de-teste-0001", key: crypto.randomBytes(32) };
const signed = keysFor(CHURCH.key, CHURCH.id);

// A computer on a fake Drive (`where`), or on a folder (a path), or on
// whatever a function returns.
function computer(where, opts = {}) {
    const dir = opts.dir || tmp();
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir, { recursive: true });
    const file = path.join(dir, "keryx.db");
    const store = createStore({ file, schema, log: () => {} });
    const pick = typeof where === "function" ? where : () => where;
    const onFolder = typeof pick() === "string" || opts.folder;
    let pairing = opts.pairing === undefined ? CHURCH : opts.pairing;
    const engine = createSyncEngine({
        store,
        mediaDir,
        ...(onFolder ? { getFolder: pick } : { getStore: pick }),
        getPairing: () => pairing,
        log: () => {},
        // The outbox goes at every pass here; the wait for a burst has its own test.
        writeWaitMs: 0,
        ...opts.engine,
    });
    return { dir, file, mediaDir, store, engine, pair: (p) => { pairing = p; }, close: () => store.close() };
}

const songs = (pc) => pc.store.call("Song", "list", [])
    .map((r) => ({ id: r.id, title: r.title, lyrics: r.lyrics ?? null }))
    .sort((a, b) => (a.id < b.id ? -1 : 1));
const titles = (pc) => songs(pc).map((s) => s.title).sort();

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

// A computer whose objects we write by hand: its lines signed with the
// church's key (`keys`), or with whatever a test passes.
function fakePc(drive, keys = signed) {
    const id = crypto.randomUUID();
    const entry = (title, extra = {}) => {
        const songId = extra.id || crypto.randomUUID();
        const at = extra.at || new Date().toISOString();
        return { seq: 1, entity: "Song", id: songId, op: "upsert", row: { id: songId, title, created_date: at }, at, pc: id };
    };
    const line = (e) => (keys ? keys.sign(JSON.stringify(e)) : JSON.stringify(e)) + "\n";
    // A whole changes object: its lines and its end.
    const body = (...entries) => entries.map(line).join("") + endLine(entries.length);
    const put = (seq, text) => drive.put(changesName(id, seq), text);
    return { id, entry, line, body, put };
}

const meta = (pc) => pc.store.getMeta(STATE_KEY);
const objectsOf = (drive, pc) => drive.all(`changes/${pc.store.pcId}/`);

test("changes made on three computers converge, whatever order the passes run in", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    const c = computer(drive);
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
    // Everything written is forgotten from the outboxes; each wrote its own
    // objects, one a pass with changes, each ending in its end line.
    for (const pc of [a, b, c]) {
        assert.equal(pc.store.outbox().length, 0);
        const mine = objectsOf(drive, pc);
        assert.deepEqual(mine.map((o) => o.name), [changesName(pc.store.pcId, 1), changesName(pc.store.pcId, 2)]);
        for (const o of mine) assert.match(drive.bytesOf(o.id).toString(), /\{"keryx":"end","lines":\d+\}\n$/);
    }
    for (const pc of [a, b, c]) pc.close();
});

test("the background library's categories and each background's own travel", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
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

test("an object without its end is read as far as it goes; the whole one under the same name finishes it; every copy is read once", async () => {
    const drive = createFakeDrive();
    const b = computer(drive);
    const fake = fakePc(drive);
    const x = fake.entry("X");
    const y = fake.line(fake.entry("Y"));
    const half = fake.put(1, fake.line(x) + y.slice(0, 25));

    let status = await b.engine.pass();
    assert.equal(status.state, "ok");
    assert.deepEqual(titles(b), ["X"]);
    assert.equal(meta(b).part[half.id].at, Buffer.byteLength(fake.line(x)), "it stops before the half line");

    // The whole object arrives: another object of the same name.
    fake.put(1, fake.line(x) + y + endLine(2));
    await b.engine.pass();
    assert.deepEqual(titles(b), ["X", "Y"]);
    status = await b.engine.pass();
    assert.deepEqual(status.received, { applied: 0, skipped: 0, failed: 0 }, "an object read to its end is not read again");

    // Two more of number 2: a copy made twice with an old entry and a new one,
    // and another that is not a copy at all.
    fake.put(2, fake.body(x, fake.entry("Z")));
    fake.put(2, fake.body(fake.entry("W")));
    status = await b.engine.pass();
    assert.deepEqual(titles(b), ["W", "X", "Y", "Z"]);
    assert.ok(status.received.skipped >= 1, "the repeated entry changes nothing");
    assert.equal(status.computers.find((c) => c.pc === fake.id).files, 4);
    status = await b.engine.pass();
    assert.deepEqual(status.received, { applied: 0, skipped: 0, failed: 0 }, "each copy read once");
    b.close();
});

test("an unreadable line is skipped once the object shows it went on; entries naming another computer are ignored", async () => {
    const drive = createFakeDrive();
    const b = computer(drive);
    const fake = fakePc(drive);
    const forged = { ...fake.entry("Forjada"), pc: crypto.randomUUID() };
    fake.put(2, fake.line(fake.entry("A")) + "{garbage\n" + fake.line(forged) + fake.line(fake.entry("B")) + endLine(4));
    const status = await b.engine.pass();
    assert.deepEqual(titles(b), ["A", "B"]);
    assert.equal(status.bad, 1);

    // As the last complete line of an object still without its end, it
    // waits one pass to see the object is not still arriving.
    fake.put(3, fake.line(fake.entry("C")) + "{still\n");
    assert.equal((await b.engine.pass()).bad, 0);
    assert.equal((await b.engine.pass()).bad, 1);
    assert.deepEqual(titles(b), ["A", "B", "C"]);
    b.close();
});

test("objects that arrive late, out of order or after the listing lagged; a computer's objects all gone", async () => {
    const drive = createFakeDrive();
    const b = computer(drive);
    const fake = fakePc(drive);
    fake.put(3, fake.body(fake.entry("Três")));
    await b.engine.pass();
    fake.put(1, fake.body(fake.entry("Um")));
    await b.engine.pass();
    assert.deepEqual(titles(b), ["Três", "Um"]);

    // Made, but not listed yet.
    drive.hide(changesName(fake.id, 2));
    fake.put(2, fake.body(fake.entry("Dois")));
    await b.engine.pass();
    assert.deepEqual(titles(b), ["Três", "Um"]);
    drive.reveal();
    await b.engine.pass();
    assert.deepEqual(titles(b), ["Dois", "Três", "Um"]);
    assert.deepEqual(meta(b).seen[fake.id].done, [[1, 3]], "what was read, as one range");

    drive.drop(`changes/${fake.id}/`);
    const status = await b.engine.pass();
    assert.equal(status.state, "ok");
    assert.equal(songs(b).length, 3, "nothing is undone by the objects going away");
    b.close();
});

test("what was read survives a restart: nothing is read twice", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    a.store.call("Song", "create", [{ title: "Um" }]);
    a.store.call("Song", "create", [{ title: "Dois" }]);
    await a.engine.pass();
    assert.equal((await b.engine.pass()).received.applied, 2);
    b.close();

    const again = computer(drive, { dir: b.dir });
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

const inDrive = (drive, name) => drive.all(`media/${name}`).filter((o) => o.name === `media/${name}`);

test("media files travel with their rows, arrive late, and are never overwritten", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    fs.writeFileSync(path.join(a.mediaDir, "foto.jpg"), "picture");
    fs.writeFileSync(path.join(a.mediaDir, "clipe.mp4"), Buffer.alloc(5000, 3));
    a.store.call("Media", "create", [{ title: "Foto", type: "image", file_url: "keryx-media://foto.jpg" }]);
    a.store.call("Song", "create", [{ title: "Com fundo", background: { kind: "video", value: "keryx-media://clipe.mp4" }, background_image: "keryx-media://bundled/backgrounds/x.webp" }]);
    await a.engine.pass();
    assert.equal(drive.text("media/foto.jpg"), "picture");
    assert.equal(drive.all("media/bundled").length, 0, "the app's own files never travel");

    // The video has not reached the store whole yet: only a short object of
    // its name is listed (not the size its row says).
    const fullBytes = drive.bytesOf(inDrive(drive, "clipe.mp4")[0].id);
    drive.drop("media/clipe.mp4");
    drive.put("media/clipe.mp4", Buffer.alloc(100, 3));
    let status = await b.engine.pass();
    assert.equal(fs.readFileSync(path.join(b.mediaDir, "foto.jpg"), "utf8"), "picture");
    assert.equal(b.store.call("Media", "list", [])[0].file_url, "keryx-media://foto.jpg", "the database keeps keryx-media:// urls");
    assert.equal(songs(b).length, 1, "the row does not wait for its file");
    assert.ok(!fs.existsSync(path.join(b.mediaDir, "clipe.mp4")), "a file not the size its row says is not taken");
    assert.equal(status.missingMedia, 1);

    drive.put("media/clipe.mp4", fullBytes);
    status = await b.engine.pass();
    assert.equal(status.missingMedia, 0, "of two objects of the name, the one that is whole");
    assert.equal(fs.statSync(path.join(b.mediaDir, "clipe.mp4")).size, 5000);
    assert.ok(!fs.readdirSync(b.mediaDir).some((n) => n.endsWith(".partial")));

    // Never overwritten, on either side.
    fs.writeFileSync(path.join(a.mediaDir, "foto.jpg"), "changed here");
    a.store.call("Media", "create", [{ title: "Foto de novo", type: "image", file_url: "keryx-media://foto.jpg" }]);
    await a.engine.pass();
    await b.engine.pass();
    assert.equal(inDrive(drive, "foto.jpg").length, 1);
    assert.equal(drive.text("media/foto.jpg"), "picture");
    assert.equal(fs.readFileSync(path.join(b.mediaDir, "foto.jpg"), "utf8"), "picture");
    a.close();
    b.close();
});

test("media still missing is retried after a restart", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    let b = computer(drive);
    fs.writeFileSync(path.join(a.mediaDir, "tarde.png"), "late");
    a.store.call("Media", "create", [{ title: "Tarde", type: "image", file_url: "keryx-media://tarde.png" }]);
    await a.engine.pass();
    drive.hide("media/tarde.png");
    assert.equal((await b.engine.pass()).missingMedia, 1);
    b.close();
    drive.reveal();
    b = computer(drive, { dir: b.dir });
    assert.equal((await b.engine.pass()).missingMedia, 0);
    assert.equal(fs.readFileSync(path.join(b.mediaDir, "tarde.png"), "utf8"), "late");
    a.close();
    b.close();
});

test("the windows hear which files have not come down; a row deleted is not waited for", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    fs.writeFileSync(path.join(a.mediaDir, "longe.mp4"), "far");
    const row = a.store.call("Media", "create", [{ title: "Longe", type: "video", file_url: "keryx-media://longe.mp4" }]);
    await a.engine.pass();
    drive.drop("media/longe.mp4");
    assert.equal((await b.engine.pass()).missingMedia, 1);
    assert.deepEqual(b.engine.missing(), ["longe.mp4"]);

    await tick();
    a.store.call("Media", "delete", [row.id]);
    await a.engine.pass();
    assert.equal((await b.engine.pass()).missingMedia, 0, "no row names it any more");
    assert.deepEqual(b.engine.missing(), []);
    a.close();
    b.close();

    let on = drive;
    const c = computer(() => on);
    c.store.setMeta(STATE_KEY, { store: drive.key, seen: {}, part: {}, out: null, missing: [{ name: "x.jpg", size: 1 }] });
    c.close();
    const again = computer(() => on, { dir: c.dir });
    on = null;
    assert.deepEqual(again.engine.missing(), [], "with sync off a file is simply not found");
    on = drive;
    assert.deepEqual(again.engine.missing(), ["x.jpg"], "known from the last run, before the first pass");
    again.close();
});

// The cleanup of media/ runs at every pass and collects at once in these
// tests (no grace), unless a test says otherwise.
const GC_NOW = { engine: { gcGraceMs: 0, gcEveryMs: 0 } };
const shared = (drive, name) => inDrive(drive, name).length > 0;
const manifestOf = (drive, pc) => JSON.parse(drive.text(`state/${pc.store.pcId}.json`));

test("a file deleted everywhere leaves media/ once every computer has read past the delete; the media folders keep it", async () => {
    const drive = createFakeDrive();
    const a = computer(drive, GC_NOW);
    const b = computer(drive, GC_NOW);
    const c = computer(drive, GC_NOW);
    fs.writeFileSync(path.join(a.mediaDir, "velho.mp4"), "video");
    fs.writeFileSync(path.join(a.mediaDir, "fica.jpg"), "picture");
    const old = a.store.call("Media", "create", [{ title: "Velho", type: "video", file_url: "keryx-media://velho.mp4" }]);
    a.store.call("Media", "create", [{ title: "Fica", type: "image", file_url: "keryx-media://fica.jpg" }]);
    await rounds([a, b, c]);
    for (const pc of [b, c]) assert.ok(fs.existsSync(path.join(pc.mediaDir, "velho.mp4")));
    const said = manifestOf(drive, b);
    assert.equal(said.pc, b.store.pcId);
    assert.equal(said.v, 2);
    assert.deepEqual(said.refs, ["fica.jpg", "velho.mp4"], "each computer says the media its rows use");
    assert.deepEqual(said.read.seen[a.store.pcId].done, [[1, 1]], "and what it read");

    await tick();
    a.store.call("Media", "delete", [old.id]);
    await a.engine.pass();
    assert.ok(shared(drive, "velho.mp4"), "B and C still use it");
    await b.engine.pass();
    await a.engine.pass();
    assert.ok(shared(drive, "velho.mp4"), "C has not read the delete");
    const status = await c.engine.pass();
    assert.equal(status.collectedMedia, 1);
    assert.ok(!shared(drive, "velho.mp4"), "nobody uses it, everybody read past the delete");
    assert.ok(shared(drive, "fica.jpg"), "a file in use stays");
    for (const pc of [a, b, c]) assert.equal(fs.readFileSync(path.join(pc.mediaDir, "velho.mp4"), "utf8"), "video", "the media folder is never touched");
    assert.deepEqual(manifestOf(drive, c).collected.map((x) => x.name), ["velho.mp4"]);
    await rounds([a, b, c]);
    for (const pc of [a, b, c]) assert.equal(pc.engine.missing().length, 0);

    // A row that uses it again (here, the file still on B) brings it back.
    await tick();
    b.store.call("Song", "create", [{ title: "Com o vídeo", background: { kind: "video", value: "keryx-media://velho.mp4" } }]);
    await rounds([b, a, c]);
    assert.ok(shared(drive, "velho.mp4"));
    for (const pc of [a, b, c]) pc.close();
});

test("a computer that has not said what it read, or not read past the delete, or that uses the file, holds it", async () => {
    const drive = createFakeDrive();
    const a = computer(drive, GC_NOW);
    const b = computer(drive, GC_NOW);
    fs.writeFileSync(path.join(a.mediaDir, "x.jpg"), "x");
    const row = a.store.call("Media", "create", [{ title: "X", type: "image", file_url: "keryx-media://x.jpg" }]);
    await rounds([a, b]);
    // A computer with changes and no state object (one not yet run).
    const fake = fakePc(drive);
    fake.put(1, fake.body(fake.entry("Do outro")));
    await tick();
    a.store.call("Media", "delete", [row.id]);
    await rounds([a, b]);
    assert.ok(shared(drive, "x.jpg"), "no state object: it holds every file");

    const say = (body, keys = signed) => {
        drive.drop(`state/${fake.id}.json`);
        drive.put(`state/${fake.id}.json`, keys.sign(JSON.stringify({ v: 2, pc: fake.id, at: new Date().toISOString(), collected: [], ...body })));
    };
    say({ read: { seen: {}, part: {} }, refs: [] });
    await rounds([a, b]);
    assert.ok(shared(drive, "x.jpg"), "it has not read past the delete");

    // Everything the others wrote, read.
    const everything = { seen: {}, part: {} };
    for (const pc of [a, b]) {
        let done = [];
        for (const o of objectsOf(drive, pc)) done = addRange(done, Number(/(\d+)\.jsonl$/.exec(o.name)[1]));
        everything.seen[pc.store.pcId] = { done, dup: {} };
    }
    say({ read: everything, refs: ["x.jpg"] });
    await rounds([a, b]);
    assert.ok(shared(drive, "x.jpg"), "it still uses the file");
    // A state object without the church's signature says nothing: the
    // computer still holds the file, as with none.
    say({ read: everything, refs: [] }, keysFor(crypto.randomBytes(32), CHURCH.id));
    await a.engine.pass();
    assert.ok(shared(drive, "x.jpg"), "an unsigned state object does not count");
    // An older KERYX's (byte cursors by file name) holds every file too.
    say({ v: undefined, read: { [`${a.store.pcId}/changes-000001.jsonl`]: 99999 }, refs: [] });
    await a.engine.pass();
    assert.ok(shared(drive, "x.jpg"), "an older state object holds the file");
    // A computer that never had the code holds nothing back.
    const stranger = fakePc(drive, null);
    stranger.put(1, stranger.body(stranger.entry("Sem código")));
    say({ read: everything, refs: [] });
    await a.engine.pass();
    assert.ok(!shared(drive, "x.jpg"));
    assert.ok(fs.existsSync(path.join(b.mediaDir, "x.jpg")));
    a.close();
    b.close();
});

test("a file must stay unused for the grace period before it goes", async () => {
    const drive = createFakeDrive();
    let clock = Date.parse("2026-10-16T12:00:00.000Z");
    const now = () => new Date(clock);
    const a = computer(drive, { engine: { now } });
    const b = computer(drive, { engine: { now } });
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
    assert.ok(shared(drive, "z.png"));
    assert.ok(meta(a).gc.candidates["z.png"], "marked as unused");

    clock += 3 * 24 * 60 * 60 * 1000;
    await rounds([a, b]);
    assert.ok(shared(drive, "z.png"), "3 days are not enough");
    clock += 5 * 24 * 60 * 60 * 1000;
    await a.engine.pass();
    assert.ok(!shared(drive, "z.png"), "after a week it goes");
    assert.deepEqual(meta(a).gc.marks, {}, "nothing left to remember");
    a.close();
    b.close();
});

test("a computer that still uses a file someone collected puts it back from its media folder", async () => {
    const drive = createFakeDrive();
    const a = computer(drive, GC_NOW);
    fs.writeFileSync(path.join(a.mediaDir, "volta.jpg"), "back");
    a.store.call("Media", "create", [{ title: "Volta", type: "image", file_url: "keryx-media://volta.jpg" }]);
    await a.engine.pass();
    drive.drop("media/volta.jpg");
    await a.engine.pass();
    assert.ok(!shared(drive, "volta.jpg"), "a file only missing from the store is not copied blindly (the listing may still be bringing it)");

    const fake = fakePc(drive);
    drive.put(`state/${fake.id}.json`, signed.sign(JSON.stringify({ v: 2, pc: fake.id, at: new Date().toISOString(), read: { seen: {}, part: {} }, refs: [], collected: [{ name: "volta.jpg", at: new Date().toISOString() }] })));
    await a.engine.pass();
    assert.equal(drive.text("media/volta.jpg"), "back");
    a.close();
});

test("no store, or a store that does not answer: no crash, a status, the outbox kept", async () => {
    const drive = createFakeDrive();
    let on = null;
    const a = computer(() => on);
    a.store.call("Song", "create", [{ title: "Guardada" }]);
    assert.equal((await a.engine.pass()).state, "off");
    on = drive;
    drive.offline = true;
    const status = await a.engine.pass();
    assert.equal(status.state, "offline");
    assert.match(status.error, /não respondeu/);
    assert.equal(a.store.outbox().length, 1, "kept for when it is back");

    drive.offline = false;
    assert.equal((await a.engine.pass()).sent, 1);
    assert.equal(a.store.outbox().length, 0);
    a.close();
});

test("a new object per batch; a number is never used twice, even with the computer's objects gone or its database from a backup", async () => {
    const drive = createFakeDrive();
    const a = computer(drive, { engine: { batch: 2 } });
    const b = computer(drive);
    for (let i = 0; i < 5; i++) a.store.call("Song", "create", [{ title: `Música ${i}` }]);
    assert.equal((await a.engine.pass()).sent, 5);
    const names = (pc) => objectsOf(drive, pc).map((o) => o.name);
    assert.deepEqual(names(a), [1, 2, 3].map((n) => changesName(a.store.pcId, n)));
    await b.engine.pass();
    assert.equal(songs(b).length, 5);

    drive.drop(`changes/${a.store.pcId}/`);
    a.store.call("Song", "create", [{ title: "Depois" }]);
    await a.engine.pass();
    assert.deepEqual(names(a), [changesName(a.store.pcId, 4)]);
    await b.engine.pass();
    assert.equal(songs(b).length, 6, "B having read 1 to 3 does not hide number 4");

    // This computer's database brought back from before: the store's numbers count.
    a.store.setMeta(STATE_KEY, null);
    a.store.call("Song", "create", [{ title: "Do backup" }]);
    await a.engine.pass();
    assert.deepEqual(names(a), [4, 5].map((n) => changesName(a.store.pcId, n)));
    await b.engine.pass();
    assert.equal(songs(b).length, 7);
    a.close();
    b.close();
});

test("a pass runs at a time; local changes ask for one; remote ones do not echo", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    a.store.call("Song", "create", [{ title: "Uma" }]);
    const [first, second] = [a.engine.pass(), a.engine.pass()];
    assert.equal(first, second);
    await first;

    // A pass's work can outlast any fixed wait (Windows, an antivirus), so
    // the test waits for the passes it expects to finish and counts the ones
    // that START (each asks for the store first, synchronously when the
    // debounce fires) to see that no other was asked.
    let started = 0;
    let passes = 0;
    const counted = createSyncEngine({
        store: b.store,
        mediaDir: b.mediaDir,
        getStore: () => { started += 1; return drive; },
        getPairing: () => CHURCH,
        log: () => {},
        writeWaitMs: 0,
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
    const drive = createFakeDrive();
    const a = computer(drive);
    await a.engine.pass(); // writes the code's file
    const stranger = fakePc(drive, null); // never had the code
    const forger = fakePc(drive, keysFor(crypto.randomBytes(32), CHURCH.id)); // the id, not the key
    const friend = fakePc(drive);
    stranger.put(1, stranger.body(stranger.entry("Sem código")));
    forger.put(1, forger.body(forger.entry("Forjada")));
    // A signed line altered afterwards: the signature covers every byte.
    const altered = friend.line(friend.entry("Original")).replace("Original", "Alterada");
    friend.put(1, altered + friend.line(friend.entry("Verdadeira")) + endLine(2));

    const status = await a.engine.pass();
    assert.deepEqual(titles(a), ["Verdadeira"]);
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
    const drive = createFakeDrive();
    const { makeCode } = await import("../shared/syncCode.mjs");
    const valid = makeCode();
    const typo = valid.slice(0, -1) + (valid.endsWith("0") ? "1" : "0");
    assert.deepEqual(await joinPairing(drive, typo), { error: "check" });
    assert.equal((await joinPairing(drive, "K7QM-2H")).error, "short");

    const a = computer(drive, { pairing: null });
    assert.equal((await a.engine.pass()).state, "unpaired", "a store and no code: nothing happens");
    assert.equal((await inspectStore(drive)).code, "missing");
    const nothingYet = await joinPairing(drive, valid);
    assert.equal(nothingYet.error, "nocode");

    const made = await createPairing(drive, { pc: a.store.pcId });
    assert.match(made.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    const file = JSON.parse(drive.text(PAIRING_FILE));
    assert.equal(file.id, made.id);
    assert.ok(!JSON.stringify(file).includes(made.code.replace(/-/g, "")), "the code is never in the store");
    assert.deepEqual(await createPairing(drive, { pc: a.store.pcId }), { error: "exists" }, "a second code needs asking");
    assert.equal(drive.all(PAIRING_FILE).length, 1, "and leaves nothing behind");

    a.pair({ id: made.id, key: made.key });
    a.store.call("Song", "create", [{ title: "Da primeira" }]);
    assert.equal((await a.engine.pass()).state, "ok");

    // Another church's code, valid but not this store's.
    const elsewhere = createFakeDrive();
    const theirs = await createPairing(elsewhere, { pc: crypto.randomUUID() });
    assert.deepEqual(await joinPairing(drive, theirs.code), { error: "wrong" });

    // Typed the way people type it.
    const typed = ` ${made.code.toLowerCase().replace(/-/g, " ")} `;
    const joined = await joinPairing(drive, typed);
    assert.equal(joined.id, made.id);
    assert.ok(joined.key.equals(made.key));
    const b = computer(drive, { pairing: { id: joined.id, key: joined.key } });
    b.store.call("Song", "create", [{ title: "Da segunda" }]);
    const c = computer(drive, { pairing: { id: joined.id, key: joined.key } });
    await rounds([a, b, c], 2);
    for (const pc of [a, b, c]) assert.deepEqual(titles(pc), ["Da primeira", "Da segunda"]);
    const seen = await inspectStore(drive);
    assert.equal(seen.code, "ok");
    assert.equal(seen.computers.length, 3, "each says what it read (its state object)");
    assert.equal(seen.computers.filter((x) => x.files > 0).length, 2, "two wrote changes; the third only read");
    for (const pc of [a, b, c]) pc.close();
});

test("two computers make a code at the same moment: the first made counts, the other is told", async () => {
    const drive = createFakeDrive({ lag: 0 });
    const first = await createPairing(drive, { pc: "a" });
    assert.ok(first.code);
    assert.deepEqual(await createPairing(drive, { pc: "b" }), { error: "exists" }, "the listing shows the first one: the second goes");
    assert.equal(drive.all(PAIRING_FILE).length, 1);

    // Neither listing shows the other's yet: both think they made it.
    const later = createFakeDrive({ lag: 5 });
    const one = await createPairing(later, { pc: "a" });
    const two = await createPairing(later, { pc: "b" });
    assert.ok(one.code && two.code);
    later.lag = 0;
    later.reveal();
    assert.equal(later.all(PAIRING_FILE).length, 2, "two objects of one name");
    const a = computer(later, { pairing: { id: one.id, key: one.key } });
    const b = computer(later, { pairing: { id: two.id, key: two.key } });
    // The listing still lags those two by a few calls.
    for (let i = 0; i < 6; i++) await later.list("");
    assert.equal((await a.engine.pass()).state, "ok", "the first made is the code");
    const lost = await b.engine.pass();
    assert.equal(lost.state, "mismatch", "the other types the code that stayed");
    assert.equal((await readPairing(later)).file.id, one.id);
    a.close();
    b.close();
});

test("the code changes: a computer with the old one stops, keeps its changes, and catches up with the new one", async () => {
    const drive = createFakeDrive();
    const first = await createPairing(drive, { pc: "x" });
    const old = { id: first.id, key: first.key };
    const a = computer(drive, { pairing: old });
    const b = computer(drive, { pairing: old });
    a.store.call("Song", "create", [{ title: "Antes" }]);
    b.store.call("Song", "create", [{ title: "Antes, de B" }]);
    await rounds([a, b], 2);
    assert.equal(songs(b).length, 2);
    const fromBBefore = objectsOf(drive, b).length;

    // A makes a new code (to leave out a computer that should not sync any more).
    const next = await createPairing(drive, { pc: a.store.pcId, replace: true });
    a.pair({ id: next.id, key: next.key });
    assert.equal(drive.all(PAIRING_FILE).length, 1, "replaced whole, not beside");
    b.store.call("Song", "create", [{ title: "Enquanto isso" }]);
    let status = await b.engine.pass();
    assert.equal(status.state, "mismatch");
    assert.match(status.error, /código/);
    assert.equal(b.store.outbox().length, 1, "nothing written with the old code: the change waits");
    assert.equal(objectsOf(drive, b).length, fromBBefore, "no new object from B");
    status = await a.engine.pass();
    assert.equal(status.state, "ok");
    assert.equal(songs(a).length, 2);

    // B types the new code.
    const joined = await joinPairing(drive, next.code);
    b.pair({ id: joined.id, key: joined.key });
    await rounds([b, a], 2);
    assert.deepEqual(titles(a), ["Antes", "Antes, de B", "Enquanto isso"]);
    assert.equal(b.store.outbox().length, 0);
    // A read B's objects again from the start under the new code: B's lines
    // from before the change no longer verify (A had them already), its new
    // ones do.
    const fromB = (await a.engine.pass()).computers.find((c) => c.pc === b.store.pcId);
    assert.equal(fromB.verified, true);
    assert.ok(fromB.rejected >= 1);
    a.close();
    b.close();
});

test("Tirar: a computer taken out stops, the others skip it, and typing the code brings it back", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    const c = computer(drive);
    a.store.call("Song", "create", [{ title: "Antes" }]);
    b.store.call("Song", "create", [{ title: "De B, antes" }]);
    await rounds([a, b, c], 2);

    // A takes B out.
    const list = await updateRemoved(drive, CHURCH, (now) => [...now, { pc: b.store.pcId, at: new Date().toISOString(), by: a.store.pcId }], { pc: a.store.pcId });
    assert.deepEqual(list.map((r) => r.pc), [b.store.pcId]);
    b.store.call("Song", "create", [{ title: "De B, tirado" }]);
    const out = await b.engine.pass();
    assert.equal(out.state, "removed");
    assert.equal(out.removed.by, a.store.pcId);
    assert.equal(b.store.outbox().length, 1, "its change waits");
    // An object B wrote anyway (it had not seen the list yet) is skipped too.
    const late = { seq: 9, entity: "Song", id: crypto.randomUUID(), op: "upsert", row: { title: "Atrasada" }, at: new Date().toISOString(), pc: b.store.pcId };
    drive.put(changesName(b.store.pcId, 50), signed.sign(JSON.stringify(late)) + "\n" + endLine(1));
    const seen = await c.engine.pass();
    assert.ok(!titles(c).includes("Atrasada"), "a computer taken out is not read");
    assert.equal(seen.computers.find((x) => x.pc === b.store.pcId).removed.by, a.store.pcId);

    // A list edited without the key takes nobody out.
    const code = drive.all(PAIRING_FILE)[0];
    const forged = JSON.parse(drive.bytesOf(code.id).toString());
    forged.removed.push({ pc: c.store.pcId, at: "x", by: "y" });
    drive.rewrite(code.id, JSON.stringify(forged));
    assert.equal((await c.engine.pass()).state, "ok", "the forged entry has no valid mac");
    assert.equal((await b.engine.pass()).state, "ok", "and the whole list stops counting while it does not verify");
    await updateRemoved(drive, CHURCH, (now) => now.filter((r) => r.pc !== c.store.pcId), { pc: a.store.pcId });

    // B is back once the list no longer names it (B typing the code takes
    // itself off: syncControl's join).
    await updateRemoved(drive, CHURCH, (now) => [...now, { pc: b.store.pcId, at: new Date().toISOString(), by: a.store.pcId }], { pc: a.store.pcId });
    assert.equal((await b.engine.pass()).state, "removed");
    await updateRemoved(drive, CHURCH, (now) => now.filter((r) => r.pc !== b.store.pcId), { pc: b.store.pcId });
    await rounds([b, a, c], 2);
    for (const pc of [a, c]) assert.ok(titles(pc).includes("De B, tirado"));
    for (const pc of [a, b, c]) pc.close();
});

test("the code's file: written back when it goes missing, waited for while it arrives", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    await a.engine.pass();
    assert.equal((await readPairing(drive)).file.id, CHURCH.id);

    drive.drop(PAIRING_FILE);
    assert.equal((await a.engine.pass()).state, "ok");
    assert.equal(drive.all(PAIRING_FILE).length, 1, "any computer with the code writes it back");

    const code = drive.all(PAIRING_FILE)[0];
    drive.rewrite(code.id, '{"v":1,"id":"igreja');
    a.store.call("Song", "create", [{ title: "Espera" }]);
    const status = await a.engine.pass();
    assert.equal(status.state, "offline");
    assert.match(status.error, /chegando/);
    assert.equal(a.store.outbox().length, 1);
    assert.equal(drive.text(PAIRING_FILE), '{"v":1,"id":"igreja', "never written over");
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

test("ranges: numbers read, joined where they touch", () => {
    let r = [];
    for (const n of [3, 1, 2, 7, 5]) r = addRange(r, n);
    assert.deepEqual(r, [[1, 3], [5, 5], [7, 7]]);
    assert.deepEqual(addRange(r, 6), [[1, 3], [5, 7]]);
    assert.deepEqual(addRange(r, 2), r, "twice is once");
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
    const ids = { service: crypto.randomUUID(), song: crypto.randomUUID(), cls: crypto.randomUUID(), video: crypto.randomUUID() };
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
            { id: ids.video, title: "Abertura", type: "video", file_url: file("Media.file_url", ".mp4"), thumbnail_url: file("Media.thumbnail_url", ".jpg"), duration: 30 },
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
        // requested_by: who sings, when the item came from a pedido (Rodada Q, S13).
        ServiceItem: [{ serviceId: ids.service, order: 1, type: "SONG", title: "Grande é o Senhor", contentId: ids.song, end_action: "loop", requested_by: "Ana" }],
        // The Equipe's chat and a song request (Rodada Q): only text, no file;
        // the operator's answer and the pedido it noted carry side (S12/S14).
        ServiceMessage: [
            { serviceId: ids.service, kind: "chat", sender: "Marcos", text: "O baixo vai atrasar uns 5 minutos.", status: "open", sentAt: "2026-10-25T21:52:00.000Z" },
            { serviceId: ids.service, kind: "pedido", sender: "Lucas", singer: "Ana", song: "Grande é o Senhor", songId: ids.song, text: "Depois da oferta", link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", status: "done", sentAt: "2026-10-25T22:05:00.000Z" },
            { serviceId: ids.service, kind: "chat", side: "operator", sender: "Operador", text: "Beleza, começo pela música 2.", status: "open", sentAt: "2026-10-25T21:53:00.000Z" },
            { serviceId: ids.service, kind: "pedido", side: "operator", sender: "Operador", singer: "Marcos", song: "Grande é o Senhor", songId: ids.song, status: "open", sentAt: "2026-10-25T22:09:00.000Z" },
            // A pedido of a video of the Mídia (S15): its Media row's id, no file of its own.
            { serviceId: ids.service, kind: "pedido", sender: "Júlia", singer: "Grupo de jovens", song: "Abertura", mediaId: ids.video, status: "open", sentAt: "2026-10-25T22:11:00.000Z" },
        ],
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
        idle_look: { bg: "media", media: { kind: "video", value: file("User.idle_look", ".mp4"), name: "Ondas" }, dim: 0.3 },
    };
    return { rows, profile, files, used };
}

// The fields a written row came back with, for comparing two computers.
const sameFields = (row, fields) => Object.fromEntries(Object.keys(fields).map((k) => [k, row?.[k]]));

test("the whole church goes to the other computers: every row, every file, then the deletes", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    const c = computer(drive);
    const box = churchInABox(a.mediaDir);
    assert.deepEqual(Object.keys(box.rows).concat("User").sort(), [...SYNC_ENTITIES].sort(), "one row of every synced entity");

    const made = {};
    for (const [entity, list] of Object.entries(box.rows)) made[entity] = list.map((row) => a.store.call(entity, "create", [row]));
    a.store.call("User", "update", [PROFILE_ID, box.profile]);
    await a.engine.pass();
    for (const name of box.files.keys()) assert.ok(shared(drive, name), `${name} is in the store`);

    // The theme's video is not listed yet: "Baixando…" on the others.
    const late = "projectiontheme-background.mp4";
    drive.hide(`media/${late}`);
    for (const pc of [b, c]) {
        const status = await pc.engine.pass();
        assert.equal(status.missingMedia, 1);
        assert.deepEqual(pc.engine.missing(), [late]);
        assert.equal(pc.store.call("ProjectionTheme", "list", []).length, 1, "the row does not wait for its file");
    }
    drive.reveal();
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
    "ServiceMessage.mediaId": "a Media row's id (a pedido of a video or an audio, Rodada Q S15); the Media row carries the file",
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
    const drive = createFakeDrive();
    let editions = ["NVI", "acf", "../x", 7];
    const a = computer(drive, { engine: { describe: () => ({ name: "PC-SOM", version: "0.2.20", bibles: editions }) } });
    const b = computer(drive, { engine: { describe: () => ({ name: "PC-PROJETOR", version: "0.2.20", bibles: [] }) } });
    await rounds([a, b], 1);
    const said = JSON.parse(drive.text(`computers/${a.store.pcId}.json`));
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

// -- Drive's rules ----------------------------------------------------------------

test("the fake Drive: objects are never appended or renamed, names repeat, the listing lags", async () => {
    const drive = createFakeDrive({ lag: 1 });
    assert.equal(drive.append, undefined);
    assert.equal(drive.rename, undefined);
    const one = await drive.putNew("x.json", Buffer.from("1"));
    const two = await drive.putNew("x.json", Buffer.from("2"));
    assert.notEqual(one.id, two.id, "a second object, not the first changed");
    assert.equal((await drive.list("x.json")).length, 0, "made a moment ago: not listed yet");
    assert.equal((await drive.list("x.json")).length, 2, "both, under one name");
    assert.equal((await drive.read(one.id)).toString(), "1", "read by id at once");
    await drive.remove(one.id);
    assert.equal(await drive.read(one.id), null);
    assert.equal((await drive.list("x.json")).length, 2, "the listing still shows it");
    assert.equal((await drive.list("x.json")).length, 1);
    drive.failNext("read");
    await assert.rejects(drive.read(two.id), /falha simulada/);
    assert.equal((await drive.read(two.id)).toString(), "2");
});

test("a lagging listing: what a computer wrote reaches the others later, and its own numbers are never used twice", async () => {
    const drive = createFakeDrive({ lag: 3 });
    const a = computer(drive);
    const b = computer(drive);
    a.store.call("Song", "create", [{ title: "Primeira" }]);
    await a.engine.pass();
    a.store.call("Song", "create", [{ title: "Segunda" }]);
    await a.engine.pass(); // its first object is not listed to it yet
    assert.deepEqual(objectsOf(drive, a).map((o) => o.name), [1, 2].map((n) => changesName(a.store.pcId, n)));
    drive.hide((name) => name.startsWith(`changes/${a.store.pcId}/`));
    await b.engine.pass();
    assert.deepEqual(titles(b), [], "not listed yet");
    drive.reveal();
    await rounds([a, b], 2);
    assert.deepEqual(titles(b), ["Primeira", "Segunda"]);
    a.close();
    b.close();
});

test("an object replaced while the listing lags leaves two of one name: readers take the newest", async () => {
    const drive = createFakeDrive();
    let name = "PC-SOM";
    const a = computer(drive, { engine: { describe: () => ({ name, version: "0.2.22", bibles: [] }) } });
    const b = computer(drive);
    await rounds([a, b], 1);
    // The listing does not show A's computer object: replacing it makes another.
    drive.hide(`computers/${a.store.pcId}.json`);
    name = "PC-SOM-NOVO";
    await a.engine.pass();
    drive.reveal();
    assert.equal(drive.all(`computers/${a.store.pcId}.json`).length, 2);
    const status = await b.engine.pass();
    assert.equal(status.computers.find((x) => x.pc === a.store.pcId).name, "PC-SOM-NOVO");
    // The next replace drops the extra one.
    name = "PC-SOM-3";
    a.store.setMeta(STATE_KEY, { ...meta(a), me: null });
    await a.engine.pass();
    assert.equal(drive.all(`computers/${a.store.pcId}.json`).length, 1);
    a.close();
    b.close();
});

test("failures: a write that fails keeps the outbox, a read that fails is tried again", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    await rounds([a, b], 1);
    a.store.call("Song", "create", [{ title: "Teimosa" }]);
    drive.failNext("putNew");
    let status = await a.engine.pass();
    assert.equal(status.state, "error");
    assert.match(status.error, /falha simulada/);
    assert.equal(a.store.outbox().length, 1);
    assert.equal((await a.engine.pass()).sent, 1);
    assert.equal(a.store.outbox().length, 0);
    assert.equal(objectsOf(drive, a).length, 1, "the number kept for the failed write is skipped, never reused");

    drive.failNext("read", 1, (name) => name.startsWith("changes/"));
    status = await b.engine.pass();
    assert.deepEqual(titles(b), []);
    assert.equal((await b.engine.pass()).state, "ok");
    assert.deepEqual(titles(b), ["Teimosa"]);
    a.close();
    b.close();
});

test("media transfers that are cut go on from where they stopped", async () => {
    const drive = createFakeDrive();
    const a = computer(drive);
    const b = computer(drive);
    const video = crypto.randomBytes(50000);
    fs.writeFileSync(path.join(a.mediaDir, "grande.mp4"), video);
    a.store.call("Media", "create", [{ title: "Grande", type: "video", file_url: "keryx-media://grande.mp4" }]);

    drive.cutNext("upload", 20000);
    assert.equal((await a.engine.pass()).state, "error", "the upload was cut: the pass stops, the outbox waits");
    assert.equal(a.store.outbox().length, 1);
    assert.equal((await a.engine.pass()).state, "ok");
    assert.equal(drive.stats.uploaded, 50000, "the rest only, not the whole file again");

    // Cut, then tried again in the same pass (the files still missing are),
    // from the 10 000 bytes that came.
    drive.cutNext("download", 10000);
    const status = await b.engine.pass();
    assert.equal(status.missingMedia, 0);
    assert.deepEqual(fs.readFileSync(path.join(b.mediaDir, "grande.mp4")), video);
    assert.equal(drive.stats.downloaded, 50000);
    assert.ok(!fs.existsSync(path.join(b.mediaDir, ".grande.mp4.sync.partial")));
    a.close();
    b.close();
});

test("an object this computer never finished writing never holds the cleanup back; it goes again under a new number", async () => {
    const drive = createFakeDrive();
    const a = computer(drive, GC_NOW);
    const b = computer(drive, GC_NOW);
    fs.writeFileSync(path.join(a.mediaDir, "x.jpg"), "x");
    const row = a.store.call("Media", "create", [{ title: "X", type: "image", file_url: "keryx-media://x.jpg" }]);
    await rounds([a, b]);
    await tick();
    a.store.call("Media", "delete", [row.id]);
    // KERYX closed while it wrote the delete: the number kept, half an object there.
    const st = meta(a);
    const n = st.out.n + 1;
    a.store.setMeta(STATE_KEY, { ...st, out: { ...st.out, n } });
    const half = drive.put(changesName(a.store.pcId, n), '{"seq":7,"entity":"Media","id":"');
    await b.engine.pass();
    // Even while it cannot be removed (locked), it is not counted as whole.
    drive.failNext("remove", 1, (name) => name === half.name);
    assert.equal((await a.engine.pass()).sent, 1, "the delete goes again");
    assert.ok(drive.bytesOf(half.id), "still there (locked)");
    await rounds([b, a]);
    assert.ok(!shared(drive, "x.jpg"), "collected all the same");
    assert.equal(drive.bytesOf(half.id), null, "removed at the next pass");
    assert.deepEqual(objectsOf(drive, a).map((o) => o.name).slice(-1), [changesName(a.store.pcId, n + 1)]);
    assert.ok(!titles(b).length && !b.store.call("Media", "list", []).length, "the delete reached B");
    a.close();
    b.close();
});

test("an end line that does not match the lines before it: what is there is taken, the object is not done", async () => {
    const drive = createFakeDrive();
    const b = computer(drive);
    const fake = fakePc(drive);
    const short = fake.put(1, fake.line(fake.entry("A")) + fake.line(fake.entry("B")) + endLine(3));
    await b.engine.pass();
    assert.deepEqual(titles(b), ["A", "B"]);
    assert.deepEqual(meta(b).seen[fake.id]?.done || [], [], "not read to its end");
    assert.ok(meta(b).part[short.id], "read again at the next pass");
    await b.engine.pass();
    assert.deepEqual(meta(b).seen[fake.id]?.done || [], []);
    b.close();
});

test("a copy read part of the way is still read when the whole one it sat beside goes", async () => {
    const drive = createFakeDrive();
    const b = computer(drive);
    const fake = fakePc(drive);
    const x = fake.line(fake.entry("X"));
    const open = fake.put(1, x);
    const whole = fake.put(1, x + endLine(1));
    await b.engine.pass();
    assert.deepEqual(titles(b), ["X"]);
    await drive.remove(whole.id);
    // The copy still grows (a folder's file): what it gets is read.
    drive.rewrite(open.id, x + fake.line(fake.entry("Z")));
    await b.engine.pass();
    assert.deepEqual(titles(b), ["X", "Z"]);
    b.close();
});

test("a burst of edits is one object: the outbox waits for the rest, unless a batch is full or the pass is asked to flush", async () => {
    const drive = createFakeDrive();
    let clock = Date.parse("2026-10-26T19:00:00.000Z");
    const now = () => new Date(clock);
    const a = computer(drive, { engine: { now, writeWaitMs: 20000, batch: 3 } });
    a.store.call("Song", "create", [{ title: "Um" }]);
    assert.equal((await a.engine.pass()).sent, 0);
    clock += 5000;
    a.store.call("Song", "create", [{ title: "Dois" }]);
    assert.equal((await a.engine.pass()).sent, 0, "the first change has waited 5 s");
    assert.equal(objectsOf(drive, a).length, 0);
    clock += 16000;
    assert.equal((await a.engine.pass()).sent, 2);
    assert.equal(objectsOf(drive, a).length, 1, "both in one object");

    for (const t of ["Três", "Quatro", "Cinco"]) a.store.call("Song", "create", [{ title: t }]);
    assert.equal((await a.engine.pass()).sent, 3, "a full batch goes at once");
    a.store.call("Song", "create", [{ title: "Agora" }]);
    assert.equal((await a.engine.pass({ flush: true })).sent, 1, "Sincronizar agora sends at once");
    a.close();
});

// -- The shared folder (the `folder` adapter, until Drive is spoken to) -------

const folderPc = (folder, keys = signed) => {
    const id = crypto.randomUUID();
    const dir = path.join(folder, "sync", id);
    fs.mkdirSync(dir, { recursive: true });
    const fake = fakePc(null, keys);
    // Its own id, written into each entry.
    const entry = (title, extra) => ({ ...fake.entry(title, extra), pc: id });
    return { id, dir, entry, line: fake.line, file: (n) => path.join(dir, `changes-${String(n).padStart(6, "0")}.jsonl`) };
};

test("folder: an older KERYX's file that keeps growing is read by a cursor; a half line waits; conflict copies are read; a shorter copy is read again", async () => {
    const folder = tmp();
    const b = computer(folder);
    const old = folderPc(folder);
    const file = old.file(1);
    const x = old.entry("X");
    const y = old.line(old.entry("Y"));
    fs.writeFileSync(file, old.line(x) + y.slice(0, 25));

    let status = await b.engine.pass();
    assert.equal(status.state, "ok");
    assert.deepEqual(titles(b), ["X"]);
    assert.equal(meta(b).part[`${old.id}/changes-000001.jsonl`].at, Buffer.byteLength(old.line(x)), "the cursor stops before the half line");

    // The rest arrives, and the older KERYX appends more (no end line ever).
    fs.appendFileSync(file, y.slice(25));
    await b.engine.pass();
    fs.appendFileSync(file, old.line(old.entry("V")));
    await b.engine.pass();
    assert.deepEqual(titles(b), ["V", "X", "Y"]);

    // Drive's conflict copies: an old entry again and a new one.
    fs.writeFileSync(path.join(old.dir, "changes-000001 (1).jsonl"), old.line(x) + old.line(old.entry("Z")));
    fs.writeFileSync(path.join(old.dir, "changes-000001-PC-RECEPCAO.jsonl"), old.line(old.entry("W")));
    status = await b.engine.pass();
    assert.deepEqual(titles(b), ["V", "W", "X", "Y", "Z"]);
    assert.equal(status.computers.find((c) => c.pc === old.id).files, 3);

    // Replaced by a shorter copy: read again from the start.
    fs.writeFileSync(path.join(old.dir, "changes-000003.jsonl"), old.line(old.entry("Três")));
    await b.engine.pass();
    fs.writeFileSync(path.join(old.dir, "changes-000003.jsonl"), old.line(old.entry("3")));
    await b.engine.pass();
    assert.ok(titles(b).includes("3"));
    b.close();
});

test("folder: a church with computers on an older KERYX keeps syncing through it", async () => {
    const folder = tmp();
    const a = computer(folder);
    const old = folderPc(folder);
    fs.writeFileSync(old.file(1), old.line(old.entry("Do antigo")));
    a.store.call("Song", "create", [{ title: "Do novo" }]);
    a.store.call("Song", "create", [{ title: "Do novo, 2" }]);
    await a.engine.pass();
    assert.deepEqual(titles(a), ["Do antigo", "Do novo", "Do novo, 2"]);

    // What this one wrote is where an older KERYX reads: <pc>/changes-000001.jsonl,
    // every line signed and of this computer, the end line no entry of anyone's.
    const mine = path.join(folder, "sync", a.store.pcId);
    assert.deepEqual(fs.readdirSync(mine).filter((n) => n.startsWith("changes-")), ["changes-000001.jsonl"]);
    const lines = fs.readFileSync(path.join(mine, "changes-000001.jsonl"), "utf8").split("\n").filter(Boolean);
    assert.equal(lines.length, 3);
    for (const text of lines.slice(0, -1)) {
        assert.ok(signed.verify(text));
        const e = JSON.parse(text);
        assert.equal(e.entity, "Song");
        assert.equal(e.pc, a.store.pcId);
    }
    assert.deepEqual(JSON.parse(lines[2]), { keryx: "end", lines: 2 });
    assert.ok(fs.existsSync(path.join(mine, "state.json")) && fs.existsSync(path.join(folder, "sync", "keryx-sync.json")));
    // The state.json an older KERYX reads: its read cannot be taken for cursors (it holds files, never frees one).
    assert.equal(typeof JSON.parse(fs.readFileSync(path.join(mine, "state.json"), "utf8")).read[`${old.id}/changes-000001.jsonl`], "undefined");
    a.close();
});

test("folder: a database an older KERYX left goes on where it was", async () => {
    const folder = tmp();
    const a = computer(folder);
    const old = folderPc(folder);
    const first = old.line(old.entry("Lida antes"));
    fs.writeFileSync(old.file(1), first);
    // What 0.2.21 kept: a byte cursor per file, its own file number.
    a.store.setMeta(STATE_KEY, { folder: path.resolve(folder), pairing: CHURCH.id, cursors: { [`${old.id}/changes-000001.jsonl`]: Buffer.byteLength(first) }, peers: {}, out: { pc: a.store.pcId, n: 3, used: true }, missing: [], removed: [], gc: { at: null, candidates: {}, marks: {}, collected: [] } });
    fs.appendFileSync(old.file(1), old.line(old.entry("Nova")));
    a.store.call("Song", "create", [{ title: "Daqui" }]);
    const status = await a.engine.pass();
    assert.deepEqual(status.received, { applied: 1, skipped: 0, failed: 0 }, "only the line after the cursor");
    assert.deepEqual(titles(a), ["Daqui", "Nova"]);
    assert.ok(fs.existsSync(path.join(folder, "sync", a.store.pcId, "changes-000004.jsonl")), "the next number after the old file's");
    a.close();
});

test("folder: a pass does not stat what it has read to its end, nor the media", async () => {
    const folder = tmp();
    const a = computer(folder);
    const b = computer(folder);
    for (let i = 0; i < 30; i++) {
        fs.writeFileSync(path.join(a.mediaDir, `f${i}.jpg`), `f${i}`);
        a.store.call("Media", "create", [{ title: `F${i}`, type: "image", file_url: `keryx-media://f${i}.jpg` }]);
        await a.engine.pass();
    }
    assert.equal(fs.readdirSync(path.join(folder, "sync", a.store.pcId)).filter((n) => n.startsWith("changes-")).length, 30);
    await b.engine.pass();
    assert.equal(b.store.call("Media", "list", []).length, 30);
    const real = fs.promises.stat;
    let stats = 0;
    fs.promises.stat = (file, ...rest) => {
        if (String(file).startsWith(path.resolve(folder))) stats += 1;
        return real(file, ...rest);
    };
    try {
        assert.equal((await b.engine.pass()).state, "ok");
    } finally {
        fs.promises.stat = real;
    }
    assert.ok(stats < 10, `${stats} stats for 30 objects and 30 files`);
    a.close();
    b.close();
});

test("folder: not there, nothing made; media, the code's file and what it holds are where they always were", async () => {
    const base = tmp();
    let folder = null;
    const a = computer(() => folder, { folder: true });
    a.store.call("Song", "create", [{ title: "Guardada" }]);
    assert.equal((await a.engine.pass()).state, "off");
    folder = path.join(base, "G-drive", "KERYX");
    const status = await a.engine.pass();
    assert.equal(status.state, "offline");
    assert.match(status.error, /não está disponível/);
    assert.ok(!fs.existsSync(folder));
    assert.equal(a.store.outbox().length, 1, "kept for when the folder is back");

    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(a.mediaDir, "foto.jpg"), "picture");
    a.store.call("Media", "create", [{ title: "Foto", type: "image", file_url: "keryx-media://foto.jpg" }]);
    assert.equal((await a.engine.pass()).sent, 2);
    assert.equal(fs.readFileSync(path.join(folder, "sync", "media", "foto.jpg"), "utf8"), "picture");
    assert.equal(JSON.parse(fs.readFileSync(path.join(folder, "sync", PAIRING_FILE), "utf8")).id, CHURCH.id);
    const b = computer(folder);
    await b.engine.pass();
    assert.equal(fs.readFileSync(path.join(b.mediaDir, "foto.jpg"), "utf8"), "picture");
    const seen = await inspectFolder(folder);
    assert.equal(seen.code, "ok");
    assert.equal(seen.computers.length, 2);
    assert.deepEqual(await inspectFolder(path.join(base, "nada")), { exists: false, code: "missing", computers: [] });
    // The store's names map onto the old layout, and nothing else.
    const store = createFolderStore(folder);
    assert.deepEqual((await store.list("changes/")).map((o) => o.id).sort(), [`${a.store.pcId}/changes-000001.jsonl`]);
    await assert.rejects(store.putNew("outra/coisa.txt", Buffer.from("x")), /fora da sincronização/);
    await assert.rejects(store.putNew(changesName(a.store.pcId, 1), Buffer.from("x")), /EEXIST/, "never over an object");
    a.close();
    b.close();
});

// -- Compaction --------------------------------------------------------------

const DAY = 24 * 60 * 60 * 1000;
// A clock the test moves: the computers' own; the objects keep the time
// they were really made, so 15 days on they are old.
function clock() {
    const c = { ahead: 0, now: () => new Date(Date.now() + c.ahead) };
    return c;
}
const onClock = (c, extra = {}) => ({ engine: { now: c.now, ...extra } });
const namesOf = (drive, pc) => objectsOf(drive, pc).map((o) => o.name).sort();
const endOf = (text) => JSON.parse(text.trim().split("\n").pop());

// A's history: five passes, a song edited three times, another made and
// deleted, the profile changed twice.
async function history(a, b) {
    const one = a.store.call("Song", "create", [{ title: "Primeira" }]);
    await rounds([a, b], 1);
    for (const t of ["Segunda", "Terceira"]) {
        await tick();
        a.store.call("Song", "update", [one.id, { title: t }]);
        await rounds([a, b], 1);
    }
    await tick();
    a.store.call("User", "update", [PROFILE_ID, { church_name: "Igreja Gerar" }]);
    const gone = a.store.call("Song", "create", [{ title: "Sai" }]);
    await rounds([a, b], 1);
    await tick();
    a.store.call("Song", "delete", [gone.id]);
    a.store.call("User", "update", [PROFILE_ID, { church_name: "Igreja Gerar Vida" }]);
    await rounds([a, b], 2);
    return one;
}

test("compaction: old objects every computer has read become one, the last line per row and every profile line; a newcomer gets the same", async () => {
    const drive = createFakeDrive();
    const time = clock();
    const a = computer(drive, onClock(time));
    const b = computer(drive, onClock(time));
    await history(a, b);
    const before = objectsOf(drive, a);
    assert.equal(before.length, 5);
    const lines = before.reduce((n, o) => n + endOf(drive.bytesOf(o.id).toString()).lines, 0);

    // Not yet two weeks old: nothing moves.
    time.ahead = 13 * DAY;
    await rounds([b, a], 1);
    assert.equal(objectsOf(drive, a).length, 5);

    time.ahead = 15 * DAY;
    await b.engine.pass();
    const st = await a.engine.pass();
    assert.equal(st.compactedObjects, 5);
    const after = objectsOf(drive, a);
    assert.deepEqual(after.map((o) => o.name), [changesName(a.store.pcId, 1, 5)]);
    const text = drive.bytesOf(after[0].id).toString();
    const end = endOf(text);
    assert.deepEqual(end.range, [1, 5]);
    assert.ok(end.lines < lines, `${end.lines} lines, from ${lines}`);
    const body = text.trim().split("\n").slice(0, -1);
    const entries = body.map((l) => JSON.parse(l));
    assert.equal(end.lines, body.length);
    assert.equal(entries.filter((e) => e.entity === "User").length, 2, "every profile line stays");
    const songLines = entries.filter((e) => e.entity === "Song");
    assert.equal(songLines.length, 2, "one line per song");
    assert.ok(songLines.some((e) => e.op === "delete"), "a delete stays a delete");
    assert.equal(songLines.find((e) => e.op === "upsert").row.title, "Terceira", "the last edit");
    for (const l of body) assert.ok(signed.verify(l), "as they were signed");

    // B had read them all: it reads nothing again.
    const again = await b.engine.pass();
    assert.equal(again.received.applied + again.received.skipped, 0);
    // A newcomer gets what B has; A's next number is past the range.
    const c = computer(drive, onClock(time));
    await rounds([c], 1);
    assert.deepEqual(songs(c), songs(b));
    assert.equal(c.store.call("User", "get", [PROFILE_ID]).church_name, "Igreja Gerar Vida");
    await tick();
    a.store.call("Song", "create", [{ title: "Depois" }]);
    await a.engine.pass();
    assert.deepEqual(namesOf(drive, a), [changesName(a.store.pcId, 1, 5), changesName(a.store.pcId, 6)].sort());
    await rounds([b, c], 1);
    assert.deepEqual(titles(c), ["Depois", "Terceira"]);

    // Two weeks later only the newly old ones join, in an object of their own.
    for (let i = 0; i < 2; i++) {
        await tick();
        a.store.call("Song", "create", [{ title: `Mais ${i}` }]);
        await rounds([a, b, c], 1);
    }
    time.ahead = 30 * DAY;
    await rounds([b, c], 1);
    await a.engine.pass();
    assert.deepEqual(namesOf(drive, a), [changesName(a.store.pcId, 1, 5), changesName(a.store.pcId, 6, 8)].sort());
    for (const pc of [a, b, c]) pc.close();
});

test("compaction waits for every computer that counts: one with no state, or one that has not read them all", async () => {
    const drive = createFakeDrive();
    const time = clock();
    const a = computer(drive, onClock(time));
    const b = computer(drive, onClock(time));
    await history(a, b);
    // A computer whose lines verify and that never said what it read.
    const quiet = fakePc(drive);
    quiet.put(1, quiet.body(quiet.entry("Dela")));
    await rounds([a, b], 1);
    time.ahead = 15 * DAY;
    await rounds([b, a], 1);
    assert.equal(objectsOf(drive, a).length, 5, "the quiet computer holds them");

    // Y has read X's objects 1 and 2, not 3: X joins those only.
    const d = createFakeDrive();
    const t2 = clock();
    const x = computer(d, onClock(t2));
    const y = computer(d, onClock(t2));
    x.store.call("Song", "create", [{ title: "Um" }]);
    await rounds([x, y], 1);
    await tick();
    x.store.call("Song", "create", [{ title: "Dois" }]);
    await rounds([x, y], 1);
    await tick();
    x.store.call("Song", "create", [{ title: "Três" }]);
    await x.engine.pass();
    t2.ahead = 15 * DAY;
    await x.engine.pass();
    assert.deepEqual(namesOf(d, x), [changesName(x.store.pcId, 1, 2), changesName(x.store.pcId, 3)].sort());
    await y.engine.pass();
    assert.deepEqual(titles(y), ["Dois", "Três", "Um"]);
    for (const pc of [a, b, x, y]) pc.close();
});

test("compaction stops before a number the listing does not show, and one cut short is finished by the next", async () => {
    const drive = createFakeDrive();
    const time = clock();
    const a = computer(drive, onClock(time, { gcEveryMs: 0 }));
    const b = computer(drive, onClock(time, { gcEveryMs: 0 }));
    await history(a, b);
    time.ahead = 15 * DAY;
    await b.engine.pass();
    // Object 3 not listed yet (a lagging listing): the run is 1 and 2.
    drive.hide(changesName(a.store.pcId, 3));
    await a.engine.pass();
    drive.reveal();
    assert.deepEqual(namesOf(drive, a), [changesName(a.store.pcId, 1, 2), ...[3, 4, 5].map((n) => changesName(a.store.pcId, n))].sort());

    // Two weeks on, the removal fails after the new object is whole.
    time.ahead = 30 * DAY;
    await b.engine.pass();
    drive.failNext("remove", 3, (name) => /\/00000[345]\.jsonl$/.test(name));
    await a.engine.pass();
    const names = objectsOf(drive, a).map((o) => o.name);
    assert.ok(names.includes(changesName(a.store.pcId, 3, 5)) && names.includes(changesName(a.store.pcId, 3)), names.join(" "));
    const c = computer(drive, onClock(time));
    await rounds([c], 1);
    assert.deepEqual(songs(c), songs(b), "both there: read twice, the same rows");
    await a.engine.pass();
    assert.deepEqual(namesOf(drive, a), [changesName(a.store.pcId, 1, 2), changesName(a.store.pcId, 3, 5)].sort());
    for (const pc of [a, b, c]) pc.close();
});

test("folder: a compacted object is changes-<lo>-<hi>.jsonl beside the others, read back under its name", async () => {
    const folder = tmp();
    const time = clock();
    const a = computer(folder, onClock(time));
    const b = computer(folder, onClock(time));
    await history(a, b);
    time.ahead = 15 * DAY;
    await b.engine.pass();
    await a.engine.pass();
    const dir = path.join(folder, "sync", a.store.pcId);
    assert.deepEqual(fs.readdirSync(dir).filter((n) => n.startsWith("changes-")), ["changes-000001-000005.jsonl"]);
    const listed = await createFolderStore(folder).list(`changes/${a.store.pcId}/`);
    assert.deepEqual(listed.map((o) => o.name), [changesName(a.store.pcId, 1, 5)]);
    const c = computer(folder, onClock(time));
    await rounds([c], 1);
    assert.deepEqual(songs(c), songs(b));
    for (const pc of [a, b, c]) pc.close();
});

test("compaction over a number never written (a failed write) still lets the media cleanup go on", async () => {
    const drive = createFakeDrive();
    const time = clock();
    const opts = onClock(time, { gcGraceMs: 0, gcEveryMs: 0 });
    const a = computer(drive, opts);
    const b = computer(drive, opts);
    fs.writeFileSync(path.join(a.mediaDir, "velho.mp4"), "video");
    const media = a.store.call("Media", "create", [{ title: "Velho", type: "video", file_url: "keryx-media://velho.mp4" }]);
    await rounds([a, b], 1);
    await tick();
    a.store.call("Song", "create", [{ title: "Um" }]);
    drive.failNext("putNew", 1, (name) => name.startsWith("changes/"));
    assert.equal((await a.engine.pass()).state, "error");
    await rounds([a, b], 1);
    await tick();
    a.store.call("Song", "create", [{ title: "Dois" }]);
    await rounds([a, b], 2);
    assert.deepEqual(namesOf(drive, a), [1, 3, 4].map((n) => changesName(a.store.pcId, n)).sort(), "number 2 was never written");
    time.ahead = 15 * DAY;
    await rounds([b, a], 1);
    assert.deepEqual(namesOf(drive, a), [changesName(a.store.pcId, 1, 4)]);
    await tick();
    a.store.call("Media", "delete", [media.id]);
    await rounds([a, b, a, b], 2);
    assert.equal(inDrive(drive, "velho.mp4").length, 0, "B read the joined object once and the file went");
    assert.deepEqual(titles(b), ["Dois", "Um"]);
    a.close();
    b.close();
});
