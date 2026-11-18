// node --test electron/gerarFiles.test.cjs   (npm test)
// The files attached to a GERAR request (owner 2026-11-18, wave 4), with the
// GERAR faked: its attachments table and its storage (a Response over bytes),
// importMedia faked too; a real temporary folder.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createGerarFiles } = require("./gerarFiles.cjs");

const CONFIG = { url: "https://gerar.example", anonKey: "anon" };

function setup({ atts = [], storage = {}, offlineFirst = false } = {}) {
    const data = { gerar: { device: { id: "dev-1" } } };
    const settings = { get: (k, d) => (data[k] === undefined ? d : data[k]), set: (k, v) => { data[k] = v; } };
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-gerar-files-"));
    const items = [];
    const imported = [];
    const fetched = [];
    let offline = offlineFirst;
    const link = {
        token: async () => "tok",
        rest: async (method, p) => { assert.match(p, /^attachments\?/); return atts; },
    };
    const fetchImpl = async (url, init) => {
        fetched.push({ url, auth: init.headers.Authorization });
        if (offline) { offline = false; throw new TypeError("fetch failed"); }
        const key = decodeURIComponent(url.split("/service-attachments/")[1] || "");
        if (!(key in storage)) return new Response("not found", { status: 404 });
        return new Response(storage[key], { status: 200, headers: { "content-length": String(Buffer.byteLength(storage[key])) } });
    };
    const importFile = async ({ sourcePath, name }) => {
        imported.push({ name, bytes: fs.readFileSync(sourcePath, "utf8") });
        return { fileName: `uuid-${imported.length}${path.extname(name)}` };
    };
    const deliver = async (p) => { items.push(...p.items); return { results: [] }; };
    const files = createGerarFiles({ link, settings, config: CONFIG, deliver, importFile, tmpDir, fetchImpl, log: () => {} });
    return { files, data, items, imported, fetched, tmpDir };
}

const att = (id, name, owner = "u1") => ({ id, file_name: name, storage_path: `${owner}/live_request/r1/${name}`, bucket_id: "service-attachments" });

test("a request's files come down one by one, through importMedia, and go to the console; baixando… meanwhile", async () => {
    const t = setup({ atts: [att("a1", "playback.mp3"), att("a2", "cifra.pdf")], storage: { "u1/live_request/r1/playback.mp3": "MP3", "u1/live_request/r1/cifra.pdf": "PDF" } });
    t.files.queue("r1");
    await t.files.run();
    assert.deepEqual(t.imported, [{ name: "playback.mp3", bytes: "MP3" }, { name: "cifra.pdf", bytes: "PDF" }]);
    assert.deepEqual(t.items.map((i) => i.type === "file" ? `file:${i.name}:${i.fileName}` : `${i.type}:${i.state}`), ["fileState:downloading", "file:playback.mp3:uuid-1.mp3", "file:cifra.pdf:uuid-2.pdf", "fileState:"]);
    assert.equal(t.fetched[0].auth, "Bearer tok", "as the device, through its RLS");
    assert.match(t.fetched[0].url, /\/storage\/v1\/object\/authenticated\/service-attachments\/u1\/live_request\/r1\/playback\.mp3$/);
    assert.equal(t.files.pending(), 0);
    assert.deepEqual(fs.readdirSync(t.tmpDir), [], "no temporary file left");
});

test("no internet mid-way: the request stays, and the next pass goes on without the file already in", async () => {
    const t = setup({ atts: [att("a1", "a.mp4")], storage: { "u1/live_request/r1/a.mp4": "VID" }, offlineFirst: true });
    t.files.queue("r1");
    await t.files.run();
    assert.equal(t.files.pending(), 1);
    assert.equal(t.imported.length, 0);
    await t.files.run();
    assert.equal(t.imported.length, 1);
    assert.equal(t.files.pending(), 0);
});

test("a file gone from the GERAR: the card says the file did not come, the rest still comes", async () => {
    const t = setup({ atts: [att("a1", "sumiu.mp3"), att("a2", "ok.mp3")], storage: { "u1/live_request/r1/ok.mp3": "OK" } });
    t.files.queue("r1");
    await t.files.run();
    assert.deepEqual(t.imported.map((i) => i.name), ["ok.mp3"]);
    assert.equal(t.items.at(-1).state, "failed");
});

test("no attachment: nothing to tell, nothing kept; one request queued once", async () => {
    const t = setup();
    t.files.queue("r1");
    t.files.queue("r1");
    assert.equal(t.files.pending(), 1);
    await t.files.run();
    assert.equal(t.items.length, 0);
    assert.equal(t.files.pending(), 0);
});

test("an attachment the Mídia does not take (a .docx) stays in the GERAR", async () => {
    const t = setup({ atts: [att("a1", "letra.docx"), att("a2", "ok.mp3")], storage: { "u1/live_request/r1/ok.mp3": "OK", "u1/live_request/r1/letra.docx": "DOC" } });
    t.files.queue("r1");
    await t.files.run();
    assert.deepEqual(t.imported.map((i) => i.name), ["ok.mp3"]);
    assert.ok(!t.fetched.some((f) => f.url.endsWith("letra.docx")), "never downloaded");
});
