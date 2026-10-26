// node --test electron/syncStore/drive.test.cjs   (npm test)
// The Drive adapter against a fake Google Drive on 127.0.0.1
// (electron/fixtures/fakeDriveServer.cjs), then the sync engine itself, two
// computers on it. Nothing here reaches Google.
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createDriveStore } = require("./drive.cjs");
const { fakeDriveServer: fakeDrive } = require("../fixtures/fakeDriveServer.cjs");
const { createStore } = require("../db/store.cjs");
const { createSyncEngine } = require("../sync.cjs");
const schema = require("../db/schema.json");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keryx-drive-"));

// googleAuth's two calls, against the fake's token.
function fakeAuth(srv) {
    const a = { calls: 0, invalidated: 0, accessToken: async () => { a.calls += 1; return srv.token; }, invalidate: () => { a.invalidated += 1; } };
    return a;
}

function adapter(srv, opts = {}) {
    const waits = [];
    let clock = 0;
    const store = createDriveStore({
        auth: opts.auth || fakeAuth(srv),
        api: srv.api,
        upload: srv.upload,
        key: "drive:igreja@example.com",
        sleep: async (ms) => { waits.push(ms); },
        now: () => clock,
        chunk: opts.chunk || 256 * 1024,
        ...opts.store,
    });
    return { store, waits, advance: (ms) => { clock += ms; } };
}

test("putNew is one multipart create in appDataFolder, the bytes and props intact; read and stat answer", async (t) => {
    const srv = await fakeDrive();
    t.after(() => srv.close());
    const { store } = adapter(srv);
    const bytes = Buffer.concat([Buffer.from("linha 1\r\n--keryx-fake\r\n"), crypto.randomBytes(300)]);
    const made = await store.putNew("changes/9f3c0e0a-0000-4000-8000-000000000001/000001.jsonl", bytes, { pc: "9f3c", seq: 1 });
    assert.equal(made.name, "changes/9f3c0e0a-0000-4000-8000-000000000001/000001.jsonl");
    assert.equal(made.size, bytes.length);
    assert.deepEqual(made.props, { pc: "9f3c", seq: "1" });
    const f = srv.files.get(made.id);
    assert.ok(f.bytes.equals(bytes));
    assert.ok((await store.read(made.id)).equals(bytes));
    assert.equal((await store.stat(made.id)).size, bytes.length);
    assert.equal(await store.read("nao-existe"), null);
    assert.equal(await store.stat("nao-existe"), null);
});

test("putWhole updates the oldest of a name and removes the others; putIfAbsent: the first made wins", async (t) => {
    const srv = await fakeDrive();
    t.after(() => srv.close());
    const old = srv.add("state/x.json", "velho");
    srv.add("state/x.json", "copia");
    const { store } = adapter(srv);
    const made = await store.putWhole("state/x.json", Buffer.from("novo"));
    assert.equal(made.id, old.id);
    assert.deepEqual(srv.named("state/x.json").map((f) => f.bytes.toString()), ["novo"]);
    const fresh = await store.putWhole("computers/y.json", Buffer.from("um"));
    assert.equal(srv.files.get(fresh.id).bytes.toString(), "um");

    assert.equal(await store.putIfAbsent("keryx-sync.json", Buffer.from("A")), true);
    const other = adapter(srv).store;
    assert.equal(await other.putIfAbsent("keryx-sync.json", Buffer.from("B")), false);
    assert.deepEqual(srv.named("keryx-sync.json").map((f) => f.bytes.toString()), ["A"]);
});

test("one full listing, paged; after it, Drive's changes feed (paged too), at most once per freshMs", async (t) => {
    const srv = await fakeDrive({ page: 2 });
    t.after(() => srv.close());
    for (let i = 1; i <= 5; i++) srv.add(`media/f${i}.jpg`, `foto ${i}`);
    const { store, advance } = adapter(srv);
    assert.equal((await store.list("media/")).length, 5);
    assert.equal(srv.count("GET", "/drive/v3/files"), 3, "five files, two a page");
    // Another computer adds three and removes one.
    for (let i = 6; i <= 8; i++) srv.add(`media/f${i}.jpg`, `foto ${i}`);
    srv.drop([...srv.files.values()].find((f) => f.name === "media/f1.jpg").id);
    assert.equal((await store.list("media/")).length, 5, "within freshMs: the index as it was (a listing may lag)");
    advance(5000);
    const names = (await store.list("")).map((o) => o.name).sort();
    assert.deepEqual(names, ["media/f2.jpg", "media/f3.jpg", "media/f4.jpg", "media/f5.jpg", "media/f6.jpg", "media/f7.jpg", "media/f8.jpg"]);
    assert.equal(srv.count("GET", "/drive/v3/files"), 3, "no second listing of everything");
    assert.equal(srv.count("GET", "/drive/v3/changes"), 2, "four changes, two a page");
    // What this computer writes is in the index at once.
    await store.putNew("media/f9.jpg", Buffer.from("x"));
    assert.ok((await store.list("media/f9")).length === 1);
    // A page token Drive no longer takes: a new full listing.
    advance(5000);
    srv.fault((m, p) => m === "GET" && p === "/drive/v3/changes", 410);
    assert.equal((await store.list("media/")).length, 8);
    assert.equal(srv.count("GET", "/drive/v3/files"), 7, "three pages, then four");
});

test("429 and 5xx are tried again, Retry-After honoured; rate-limit 403s too; a 401 renews the token once", async (t) => {
    const srv = await fakeDrive();
    t.after(() => srv.close());
    const f = srv.add("state/a.json", "estado");
    const { store, waits } = adapter(srv);
    srv.fault((m, p) => p.startsWith("/drive/v3/files/"), 429, { headers: { "Retry-After": "3" } });
    srv.fault((m, p) => p.startsWith("/drive/v3/files/"), 503, { times: 2 });
    srv.fault((m, p) => p.startsWith("/drive/v3/files/"), 403, { body: { error: { errors: [{ reason: "userRateLimitExceeded" }] } } });
    assert.equal((await store.read(f.id)).toString(), "estado");
    assert.equal(waits[0], 3000, "Retry-After");
    assert.ok(waits[1] >= 2000 && waits[1] < 2300 && waits[2] >= 4000 && waits[2] < 4300 && waits[3] >= 8000, `backoff ${waits}`);
    assert.equal(waits.length, 4);

    // Always busy: it gives up after its tries, with Drive's status.
    srv.fault((m, p) => p.startsWith("/drive/v3/files/"), 500, { times: 5 });
    await assert.rejects(store.read(f.id), { code: "drive", status: 500 });

    // A full account is said in words.
    srv.fault((m, p) => p === "/upload/drive/v3/files", 403, { body: { error: { errors: [{ reason: "storageQuotaExceeded" }] } } });
    await assert.rejects(store.putNew("changes/x/000001.jsonl", Buffer.from("a")), { code: "quota" });

    const auth = fakeAuth(srv);
    const renewing = adapter(srv, { auth }).store;
    const real = srv.token;
    srv.token = "acesso-2";
    auth.accessToken = async () => { auth.calls += 1; return auth.invalidated ? "acesso-2" : real; };
    assert.equal((await renewing.read(f.id)).toString(), "estado");
    assert.equal(auth.invalidated, 1);
});

test("a resumable upload cut half-way goes on from what Drive has; an expired session starts over", async (t) => {
    const srv = await fakeDrive();
    t.after(() => srv.close());
    const dir = tmp();
    const file = path.join(dir, "video.mp4");
    const bytes = crypto.randomBytes(1024 * 1024 + 123);
    fs.writeFileSync(file, bytes);
    const { store } = adapter(srv, { chunk: 256 * 1024 });
    srv.cutUpload = 100 * 1024; // the first chunk drops after 100 KB
    await assert.rejects(store.upload("media/video.mp4", file));
    srv.cutUpload = null;
    const made = await store.upload("media/video.mp4", file);
    assert.ok(srv.files.get(made.id).bytes.equals(bytes));
    assert.equal(srv.requests.filter((r) => r.path === "/upload/drive/v3/files" && r.query.uploadType === "resumable").length, 1, "one session");
    const status = srv.requests.find((r) => r.path.startsWith("/upload/session/") && r.headers["content-range"] === `bytes */${bytes.length}`);
    assert.ok(status, "asked Drive what it had");
    const resumed = srv.requests.filter((r) => r.path.startsWith("/upload/session/") && /^bytes [1-9]\d*-/.test(r.headers["content-range"] || ""));
    assert.ok(resumed.length && !srv.requests.some((r, i) => i > srv.requests.indexOf(status) && r.headers["content-range"] === `bytes 0-${256 * 1024 - 1}/${bytes.length}`), "did not send the start again");
    assert.equal((await store.list("media/")).length, 1);

    // A session Drive has forgotten (a week, or a restart of the fake):
    const second = path.join(dir, "outro.mp4");
    fs.writeFileSync(second, bytes.subarray(0, 600 * 1024));
    srv.cutUpload = 10;
    await assert.rejects(store.upload("media/outro.mp4", second));
    srv.fault((m, p) => m === "PUT" && p.startsWith("/upload/session/"), 404);
    const again = await store.upload("media/outro.mp4", second);
    assert.equal(srv.files.get(again.id).bytes.length, 600 * 1024);
});

test("a download cut half-way goes on by Range into the same .partial; another file's .partial starts over", async (t) => {
    const srv = await fakeDrive();
    t.after(() => srv.close());
    const dir = tmp();
    const bytes = crypto.randomBytes(400 * 1024);
    const f = srv.add("media/clip.mp4", bytes);
    const g = srv.add("media/clip.mp4", bytes);
    const { store } = adapter(srv);
    const to = path.join(dir, ".clip.mp4.sync.partial");
    srv.cutDownload = 150 * 1024;
    await assert.rejects(store.download(f.id, to));
    const have = fs.statSync(to).size;
    assert.ok(have > 0 && have < bytes.length);
    await store.download(f.id, to);
    assert.ok(fs.readFileSync(to).equals(bytes));
    const ranged = srv.requests.filter((r) => r.headers.range);
    assert.equal(ranged.length, 1);
    assert.equal(ranged[0].headers.range, `bytes=${have}-`);
    assert.equal(fs.existsSync(`${to}.id`), false, "the tie goes when it is whole");

    // A partial of another object of the name is not continued.
    fs.writeFileSync(to, bytes.subarray(0, 1000));
    fs.writeFileSync(`${to}.id`, f.id);
    await store.download(g.id, to);
    assert.ok(fs.readFileSync(to).equals(bytes));
    assert.equal(srv.requests.filter((r) => r.headers.range).length, 1);
    await assert.rejects(store.download("sumiu", to), { code: "gone" });
});

test("offline is offline; a sign-in Google refuses is said, not taken for offline; about gives the space", async (t) => {
    const srv = await fakeDrive();
    t.after(() => srv.close());
    const { store } = adapter(srv);
    assert.equal(await store.available(), true);
    assert.deepEqual(await store.about(), { email: "igreja@example.com", used: 524288, total: 16106127360 });
    await srv.close();
    const gone = adapter(srv, { store: { freshMs: 0 } }).store;
    assert.equal(await gone.available(), false);
    await assert.rejects(gone.read("x"), { code: "offline" });
    const refused = adapter(srv, { auth: { accessToken: async () => { throw Object.assign(new Error("Entre de novo com a conta da igreja."), { code: "auth" }); }, invalidate() {} } }).store;
    await assert.rejects(refused.available(), { code: "auth" });
});

test("the sync engine on the Drive adapter: two computers, the code's file, changes and a media file", async (t) => {
    const srv = await fakeDrive({ page: 3 });
    t.after(() => srv.close());
    const church = { id: "igreja-de-teste-drive", key: crypto.randomBytes(32) };
    const pcs = [0, 1].map(() => {
        const dir = tmp();
        const mediaDir = path.join(dir, "media");
        fs.mkdirSync(mediaDir);
        const store = createStore({ file: path.join(dir, "keryx.db"), schema, log: () => {} });
        store.setRecording(true);
        const shared = adapter(srv, { store: { freshMs: 0 } }).store;
        const engine = createSyncEngine({ store, mediaDir, getStore: () => shared, getPairing: () => church, log: () => {}, writeWaitMs: 0 });
        return { store, mediaDir, engine };
    });
    const [a, b] = pcs;
    fs.writeFileSync(path.join(a.mediaDir, "foto.jpg"), crypto.randomBytes(700 * 1024));
    a.store.call("Song", "create", [{ title: "Grande é o Senhor", background_image: "keryx-media://foto.jpg" }]);
    b.store.call("Song", "create", [{ title: "Santo" }]);
    for (let i = 0; i < 2; i++) {
        for (const pc of [a, b]) {
            const st = await pc.engine.pass();
            assert.equal(st.state, "ok", st.error || "");
        }
    }
    for (const pc of [a, b]) assert.deepEqual(pc.store.call("Song", "list", []).map((s) => s.title).sort(), ["Grande é o Senhor", "Santo"]);
    assert.ok(fs.readFileSync(path.join(b.mediaDir, "foto.jpg")).equals(fs.readFileSync(path.join(a.mediaDir, "foto.jpg"))));
    assert.equal(srv.named("keryx-sync.json").length, 1);
    for (const pc of pcs) pc.store.close();
});
