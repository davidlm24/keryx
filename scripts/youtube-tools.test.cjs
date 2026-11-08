const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { Readable } = require("node:stream");
const { execFileSync } = require("node:child_process");
const yazl = require("yazl");
const { TOOLS, SKIP, missingFiles, ensureTools, toolsForInstaller } = require("./youtube-tools.cjs");

const pkg = require("../package.json");
const hash = (data) => crypto.createHash("sha256").update(data).digest("hex");

function zipOf(entries) {
    return new Promise((resolve) => {
        const zip = new yazl.ZipFile();
        for (const [name, data] of Object.entries(entries)) zip.addBuffer(Buffer.from(data), name);
        const parts = [];
        zip.outputStream.on("data", (d) => parts.push(d));
        zip.outputStream.on("end", () => resolve(Buffer.concat(parts)));
        zip.end();
    });
}

async function fakeTools() {
    const exe = Buffer.from("yt-dlp bytes");
    const zip = await zipOf({ "ff/bin/ffmpeg.exe": "ffmpeg bytes", "ff/LICENSE": "GPL", "ff/bin/ffplay.exe": "not wanted" });
    const tools = {
        ytdlp: { version: "1", url: "https://x/yt-dlp.exe", sha256: hash(exe), files: { "yt-dlp.exe": hash(exe) } },
        ffmpeg: { version: "2", url: "https://x/ff.zip", sha256: hash(zip), zip: { "ff/bin/ffmpeg.exe": ["ffmpeg.exe", hash("ffmpeg bytes")], "ff/LICENSE": ["ffmpeg-LICENSE.txt", hash("GPL")] } },
    };
    const served = { [tools.ytdlp.url]: exe, [tools.ffmpeg.url]: zip };
    const fetched = [];
    const fetchImpl = async (url) => { fetched.push(url); return { ok: true, status: 200, body: Readable.toWeb(Readable.from([served[url]])) }; };
    return { tools, served, fetched, fetchImpl };
}

const tmp = (t) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-ytt-"));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    return dir;
};

test("ensureTools: fetches, checks every hash, takes only the files it needs from the zip", async (t) => {
    const dir = tmp(t);
    const { tools, fetched, fetchImpl } = await fakeTools();
    const r = await ensureTools({ dir, tools, fetchImpl, log: () => {} });
    assert.deepEqual(r.fetched.sort(), ["ffmpeg-LICENSE.txt", "ffmpeg.exe", "yt-dlp.exe"]);
    assert.deepEqual(fs.readdirSync(dir).sort(), ["SOURCE.txt", "ffmpeg-LICENSE.txt", "ffmpeg.exe", "version.json", "yt-dlp.exe"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, "version.json"), "utf8")), { ytdlp: "1", ffmpeg: "2" });
    assert.deepEqual(missingFiles(dir, tools), []);
    // A second run fetches nothing.
    fetched.length = 0;
    await ensureTools({ dir, tools, fetchImpl, log: () => {} });
    assert.deepEqual(fetched, []);
    // A changed file is fetched again.
    fs.writeFileSync(path.join(dir, "ffmpeg.exe"), "tampered");
    assert.deepEqual(missingFiles(dir, tools), ["ffmpeg.exe"]);
});

test("ensureTools: a download that is not the pinned one is refused and not kept", async (t) => {
    const dir = tmp(t);
    const { tools, served, fetchImpl } = await fakeTools();
    served[tools.ytdlp.url] = Buffer.from("something else");
    await assert.rejects(ensureTools({ dir, tools, fetchImpl, log: () => {} }), /SHA-256/);
    assert.ok(!fs.existsSync(path.join(dir, "yt-dlp.exe")));
});

test("toolsForInstaller: a build without them only on purpose", async (t) => {
    const dir = tmp(t);
    fs.writeFileSync(path.join(dir, "old.exe"), "x");
    assert.equal(await toolsForInstaller({ env: { [SKIP]: "1" }, dir }), false);
    assert.deepEqual(fs.readdirSync(dir), [], "an empty folder: nothing stale rides the build");
});

test("the installer packs the pinned tools as resources/youtube; git never keeps them", () => {
    assert.equal(pkg.build.beforePack, "./scripts/before-pack.cjs");
    const extra = pkg.build.extraResources.find((e) => e.to === "youtube");
    assert.equal(extra.from, "vendor/youtube");
    for (const name of ["yt-dlp.exe", "ffmpeg.exe", "ffmpeg-LICENSE.txt", "SOURCE.txt", "version.json"]) assert.ok(extra.filter.includes(name), name);
    assert.match(TOOLS.ytdlp.sha256, /^[0-9a-f]{64}$/);
    assert.match(TOOLS.ffmpeg.sha256, /^[0-9a-f]{64}$/);
    const ignored = execFileSync("git", ["check-ignore", "-q", "--no-index", "vendor/youtube/yt-dlp.exe"], { cwd: path.join(__dirname, ".."), stdio: "pipe" });
    assert.equal(ignored.length, 0);
});
