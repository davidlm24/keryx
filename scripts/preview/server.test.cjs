const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs");
const { createPreviewServer } = require("./server.cjs");

async function started() {
    const dataDir = path.join(os.tmpdir(), `keryx-preview-test-${process.pid}-${Math.random().toString(36).slice(2, 8)}`);
    const api = await createPreviewServer({ dataDir });
    const server = http.createServer((req, res) => api.middleware(req, res, () => res.writeHead(404).end()));
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    const base = `http://127.0.0.1:${server.address().port}`;
    const post = (route, body, headers = { "X-Keryx": "1" }) => fetch(`${base}/__keryx/${route}`, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }).then((r) => r.json());
    const stop = () => { api.close(); server.close(); fs.rmSync(dataDir, { recursive: true, force: true }); };
    return { api, base, post, stop, dataDir };
}

test("the real store behind the API: seeded, and every op", async (t) => {
    const f = await started();
    t.after(f.stop);
    const songs = (await f.post("db", { entity: "Song", op: "list", args: ["title"] })).data;
    assert.ok(songs.length >= 3, "sample songs seeded");
    const svc = (await f.post("db", { entity: "Service", op: "filter", args: [{ title: "Culto de exemplo" }] })).data[0];
    const items = (await f.post("db", { entity: "ServiceItem", op: "filter", args: [{ serviceId: svc.id }, "order"] })).data;
    assert.equal(items[0].type, "SECTION");
    assert.ok((await f.post("db", { entity: "BibleVerse", op: "filter", args: [{ book: "João", chapter: 3 }] })).data.every((v) => /^Texto de exemplo/.test(v.text)), "placeholder Bible text only");

    const created = (await f.post("db", { entity: "Song", op: "create", args: [{ title: "Nova", lyrics: "x" }] })).data;
    const updated = (await f.post("db", { entity: "Song", op: "update", args: [created.id, { title: "Nova 2" }] })).data;
    assert.equal(updated.title, "Nova 2");
    assert.equal(f.api.store.call("Song", "get", [created.id]).title, "Nova 2", "the same store");
    assert.deepEqual((await f.post("db", { entity: "Song", op: "delete", args: [created.id] })).data, { success: true });
    const bad = await f.post("db", { entity: "Song", op: "filter", args: [{ nope: 1 }] });
    assert.equal(bad.error.status, 400, "store errors come back as { error }");

    const snap = (await f.post("live", { op: "content.show", args: { title: "T", slides: [{ text: "Linha" }] } })).data;
    assert.equal(snap.content.slides[0].text, "Linha");
    assert.equal((await (await fetch(`${f.base}/__keryx/live`)).json()).data.content.title, "T");
    assert.equal((await f.post("live", { op: "nope" })).error.status, 400);
});

test("changes and the live state stream over SSE", async (t) => {
    const f = await started();
    t.after(f.stop);
    const controller = new AbortController();
    t.after(() => controller.abort());
    const res = await fetch(`${f.base}/__keryx/events`, { signal: controller.signal });
    const reader = res.body.getReader();
    await new Promise((r) => setTimeout(r, 50));
    f.api.store.call("Song", "create", [{ title: "Por evento", lyrics: "x" }]);
    f.api.live.call("content.show", { title: "Ao vivo", slides: [{ text: "a" }] });
    let text = "";
    while (!(text.includes("Por evento") && text.includes("event: live"))) text += new TextDecoder().decode((await reader.read()).value);
    assert.match(text, /data: \{"entity":"Song","type":"create"/);
});

test("this machine only; writes need the header; media in and out", async (t) => {
    const f = await started();
    t.after(f.stop);
    const port = new URL(f.base).port;
    const foreign = await new Promise((resolve) => {
        http.get({ host: "127.0.0.1", port, path: "/__keryx/live", headers: { Host: "evil.example" } }, (r) => resolve(r.statusCode));
    });
    assert.equal(foreign, 403, "another host name is refused (DNS rebinding)");
    assert.equal((await f.post("db", { entity: "Song", op: "list", args: [] }, {})).error.status, 403, "no X-Keryx header");

    const up = await fetch(`${f.base}/__keryx/media?name=a.png`, { method: "POST", headers: { "X-Keryx": "1" }, body: Buffer.from("png!") }).then((r) => r.json());
    assert.match(up.data.fileName, /\.png$/);
    assert.equal(await (await fetch(`${f.base}/media/${up.data.fileName}`)).text(), "png!");
    const info = (await f.post("media-info", { names: [up.data.fileName, "missing.png", "../x"] })).data;
    assert.deepEqual(info[up.data.fileName], { exists: true, size: 4 });
    assert.equal(info["missing.png"].exists, false);
    assert.equal(info["../x"].exists, false);
    assert.equal((await fetch(`${f.base}/media/bundled/backgrounds/1557672172-298e090bd0f1.webp`)).status, 200, "bundled files");
    assert.notEqual((await fetch(`${f.base}/media/..%2f..%2fpackage.json`)).status, 200);
    assert.deepEqual((await (await fetch(`${f.base}/__keryx/bible`)).json()).data, { NVI: 5 });
});
