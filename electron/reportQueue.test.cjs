const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createReportQueue } = require("./reportQueue.cjs");

const support = () => import(pathToFileURL(path.join(__dirname, "..", "shared", "support.mjs")).href);
const quiet = { info() {}, warn() {}, error() {} };
const ID = "3f6c2a10-1b2c-4d3e-8f90-1234567890ab";
const ID2 = "9a8b7c6d-1b2c-4d3e-8f90-1234567890ab";

// A fetch that answers from a script: a status and body, or "offline" (throws).
function fakeFetch(answers) {
    const calls = [];
    const fetch = async (url, init) => {
        calls.push({ url, init, body: Buffer.from(init.body).toString("latin1") });
        const a = answers.shift() ?? "offline";
        if (a === "offline") throw new TypeError("fetch failed");
        return { status: a.status, json: async () => a.body ?? {} };
    };
    return { fetch, calls };
}

function rig(answers, opts = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-relatos-"));
    const f = fakeFetch(answers);
    const q = createReportQueue({ dir, fetch: f.fetch, support, logger: quiet, ...opts });
    return { q, dir, ...f };
}
const report = (id = ID, extra = {}) => ({ id, writtenAt: new Date().toISOString(), church: "Igreja X", version: "0.2.21", os: "Windows 11", install: "pc-1", text: "O vídeo travou", doing: "Apertei Esc", contact: "Pr. Marcos", ...extra });

test("a report sent goes out of the queue, with its zip, as multipart to the function", async () => {
    const { q, dir, calls } = rig([{ status: 200, body: { id: ID, code: "R-7K2Q" } }]);
    q.add(report());
    fs.writeFileSync(q.zipPath(ID), Buffer.from("PK\u0003\u0004zip"));
    const out = await q.send(ID);
    assert.deepEqual(out, { status: "sent", code: "R-7K2Q" });
    assert.deepEqual(fs.readdirSync(dir), []);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /\/functions\/v1\/relato$/);
    assert.match(calls[0].init.headers["Content-Type"], /^multipart\/form-data; boundary=/);
    assert.match(calls[0].body, /name="report"/);
    assert.match(calls[0].body, /name="diag"; filename="diagnostico\.zip"/);
    assert.ok(calls[0].body.includes("PK\u0003\u0004zip"));
    const json = JSON.parse(calls[0].body.match(/\r\n\r\n(\{.*?\})\r\n/)[1]);
    assert.equal(json.id, ID);
    assert.equal(json.contact, "Pr. Marcos");
    assert.equal("tries" in json, false, "the queue's own fields stay home");
});

test("offline or a server error keeps it queued, then a later pass sends it once", async () => {
    const { q, dir, calls } = rig(["offline", { status: 503 }, { status: 200, body: { id: ID, code: "R-1" } }]);
    q.add(report());
    assert.equal((await q.send(ID)).status, "queued");
    assert.equal((await q.send(ID)).status, "queued");
    assert.equal(q.list()[0].tries, 2);
    await q.flush();
    assert.deepEqual(fs.readdirSync(dir), []);
    assert.equal(calls.length, 3);
    assert.equal(new Set(calls.map((c) => JSON.parse(c.body.match(/\r\n\r\n(\{.*?\})\r\n/)[1]).id)).size, 1, "the same id every time: the function never makes two");
});

test("a refusal is kept, marked and never tried again; the e-mail takes it", async () => {
    const { q, calls } = rig([{ status: 429, body: { code: "rate" } }]);
    q.add(report());
    assert.deepEqual(await q.send(ID), { status: "refused", reason: "rate" });
    await q.flush();
    assert.equal(calls.length, 1);
    assert.deepEqual(q.list().map((r) => r.refused), ["rate"]);
    q.remove(ID);
    assert.deepEqual(q.list(), []);
});

test("a pass stops at the first offline report, and never runs twice at once", async () => {
    const { q, calls } = rig(["offline"]);
    q.add(report(ID, { writtenAt: "2026-10-20T10:00:00.000Z" }));
    q.add(report(ID2, { writtenAt: "2026-10-20T11:00:00.000Z" }));
    const a = q.flush();
    assert.equal(q.flush(), a);
    await a;
    assert.equal(calls.length, 1);
    assert.deepEqual(q.list().map((r) => r.id), [ID, ID2], "oldest first");
});

test("reports older than 30 days leave the queue, logged", async () => {
    const warned = [];
    const now = Date.parse("2026-12-01T00:00:00Z");
    const { q } = rig([], { now: () => now, logger: { ...quiet, warn: (m) => warned.push(m) } });
    q.add(report(ID, { writtenAt: "2026-10-01T00:00:00Z" }));
    q.add(report(ID2, { writtenAt: "2026-11-20T00:00:00Z" }));
    await q.flush();
    assert.deepEqual(q.list().map((r) => r.id), [ID2]);
    assert.ok(warned.some((m) => /saiu da fila/.test(m) && /O vídeo travou/.test(m)));
});

test("start tries at once and sets one timer", async () => {
    const timers = [];
    const { q, calls } = rig([{ status: 200, body: { code: "R-1" } }], { setTimer: (fn, ms) => { timers.push(ms); return { unref() {} }; } });
    q.add(report());
    await q.start();
    await q.start();
    assert.equal(calls.length, 1);
    assert.deepEqual(timers, [10 * 60 * 1000]);
});
