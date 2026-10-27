const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { EventEmitter } = require("node:events");
const { createYouTube, youtubeNote, youtubeId, oembedState, downloadArgs, parseLine, track, progressOf, errorMessage, downloadedFields } = require("./youtube.cjs");
const { importMedia } = require("./mediaImport.cjs");

test("youtubeId: every link form, nothing else", () => {
    for (const url of [
        "https://www.youtube.com/watch?v=aBcDeFgHiJk",
        "https://youtube.com/watch?feature=share&v=aBcDeFgHiJk&t=10",
        "https://youtu.be/aBcDeFgHiJk?si=x",
        "https://www.youtube.com/shorts/aBcDeFgHiJk",
        "https://www.youtube.com/embed/aBcDeFgHiJk",
        "https://www.youtube.com/live/aBcDeFgHiJk",
    ]) assert.equal(youtubeId(url), "aBcDeFgHiJk", url);
    assert.equal(youtubeId("https://vimeo.com/123"), null);
    assert.equal(youtubeId(""), null);
});

test("oembedState: 200 plays, 401/403 the owner blocks, 400/404 gone", () => {
    assert.deepEqual([200, 401, 403, 400, 404, 500].map(oembedState), ["ok", "blocked", "blocked", "missing", "missing", "error"]);
});

test("downloadArgs: H.264 up to 1080p, merged to mp4, the runtime and ffmpeg named", () => {
    const args = downloadArgs({ url: "https://youtu.be/aBcDeFgHiJk", outDir: "C:\\w\\dl", ffmpegDir: "C:\\r\\youtube", node: "C:\\KERYX\\KERYX.exe" });
    const after = (flag) => args[args.indexOf(flag) + 1];
    assert.match(after("-f"), /^bv\*\[height<=1080\]\[vcodec\^=avc1\]\+ba\[acodec\^=mp4a\]/);
    assert.equal(after("--merge-output-format"), "mp4");
    assert.equal(after("--js-runtimes"), "node:C:\\KERYX\\KERYX.exe");
    assert.equal(after("--ffmpeg-location"), "C:\\r\\youtube");
    assert.ok(args.includes("--no-playlist"));
    assert.deepEqual(args.slice(-2), ["--", "https://youtu.be/aBcDeFgHiJk"], "the link last, never read as an option");
    assert.ok(!downloadArgs({ url: "u", outDir: "o", ffmpegDir: "f" }).includes("--js-runtimes"));
});

test("parseLine: progress, info (a title with |), the file; anything else null", () => {
    assert.deepEqual(parseLine("KX 130048 629172 NA"), { kind: "progress", bytes: 130048, total: 629172 });
    assert.deepEqual(parseLine("KX 10 NA 5000.5"), { kind: "progress", bytes: 10, total: 5000.5 });
    assert.deepEqual(parseLine("KX NA NA NA"), { kind: "progress", bytes: 0, total: null });
    assert.deepEqual(parseLine("INFO 288387264|596|Louvor | Ao Vivo"), { kind: "info", total: 288387264, duration: 596, title: "Louvor | Ao Vivo" });
    assert.deepEqual(parseLine("INFO NA|NA|NA"), { kind: "info", total: null, duration: null, title: "" });
    assert.deepEqual(parseLine("FILE C:\\w\\dl\\aBc.mp4"), { kind: "file", path: "C:\\w\\dl\\aBc.mp4" });
    assert.equal(parseLine("[download] Destination: x"), null);
});

test("track/progressOf: the picture then the sound add up; the estimate wins while known", () => {
    let t = track(null, { kind: "info", total: 1000 });
    t = track(t, { kind: "progress", bytes: 400, total: 900 });
    assert.deepEqual(progressOf(t), { bytes: 400, total: 1000 });
    t = track(t, { kind: "progress", bytes: 900, total: 900 });
    t = track(t, { kind: "progress", bytes: 50, total: 100 }); // the sound starts
    assert.deepEqual(progressOf(t), { bytes: 950, total: 1000 });
    // No size from YouTube: the parts' own totals.
    let u = track(null, { kind: "progress", bytes: 10, total: 100 });
    assert.deepEqual(progressOf(u), { bytes: 10, total: 100 });
    u = track(u, { kind: "progress", bytes: 5, total: 20 });
    assert.deepEqual(progressOf(u), { bytes: 105, total: 120 });
    assert.deepEqual(progressOf(null), { bytes: 0, total: null });
});

test("errorMessage: yt-dlp's errors in pt-BR", () => {
    assert.match(errorMessage("ERROR: [youtube] x: Sign in to confirm your age."), /restrito por idade/);
    assert.match(errorMessage("ERROR: [youtube] x: Private video. Sign in"), /não existe ou é privado/);
    assert.match(errorMessage("ERROR: [youtube] x: Video unavailable"), /não existe ou é privado/);
    assert.match(errorMessage("ERROR: The uploader has not made this video available in your country"), /Brasil/);
    assert.match(errorMessage("ERROR: Unable to download webpage: <urlopen error [Errno 11001] getaddrinfo failed>"), /Sem internet/);
    assert.match(errorMessage("ERROR: Sign in to confirm you're not a bot"), /robô/);
    assert.match(errorMessage("something new"), /Atualizar agora/);
});

test("downloadedFields: the same row becomes the file; a name the church gave stays", () => {
    const f = downloadedFields({ title: "Vídeo do YouTube", duration: 0 }, { fileName: "abc.mp4", url: "https://youtu.be/aBcDeFgHiJk", info: { title: "Louvor (Ao Vivo)", duration: 312 } });
    assert.equal(f.file_url, "keryx-media://abc.mp4");
    assert.equal(f.source_url, "https://youtu.be/aBcDeFgHiJk");
    assert.equal(f.title, "Louvor (Ao Vivo)");
    assert.deepEqual([f.type, f.duration, f.thumbnail_url, f.video_codec], ["video", 312, "", ""]);
    assert.ok(!("size" in f), "Media has no size column: the Mídia reads it from the disk");
    assert.equal(downloadedFields({ title: "Abertura" }, { fileName: "a.mp4", url: "u", info: { title: "Other" } }).title, undefined);
});

function setup(t, { files = true } = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-yt-"));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const toolsDir = path.join(root, "tools");
    const mediaDir = path.join(root, "media");
    fs.mkdirSync(toolsDir);
    fs.mkdirSync(mediaDir);
    if (files) {
        fs.writeFileSync(path.join(toolsDir, "yt-dlp.exe"), "bundled");
        fs.writeFileSync(path.join(toolsDir, "ffmpeg.exe"), "ff");
        fs.writeFileSync(path.join(toolsDir, "version.json"), JSON.stringify({ ytdlp: "2026.10.26", ffmpeg: "9.0.2" }));
    }
    const rows = new Map([["m1", { id: "m1", title: "Vídeo do YouTube", type: "video", file_url: "https://youtu.be/aBcDeFgHiJk" }]]);
    const store = {
        call(entity, op, args) {
            assert.equal(entity, "Media");
            if (op === "get") return rows.get(args[0]) || null;
            if (op === "update") { rows.set(args[0], { ...rows.get(args[0]), ...args[1] }); return rows.get(args[0]); }
            throw new Error(op);
        },
    };
    return { root, toolsDir, mediaDir, workDir: path.join(root, "work"), rows, store };
}

// A yt-dlp that prints `lines`, writes the file it names, and exits `code`.
function fakeSpawn(calls, { lines, code = 0, stderr = "", write = true }) {
    return (cmd, args) => {
        calls.push({ cmd, args });
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.exitCode = null;
        setImmediate(() => {
            const out = args[args.indexOf("-o") + 1].replace("%(id)s.%(ext)s", "aBcDeFgHiJk.mp4");
            if (write) fs.writeFileSync(out, "video bytes");
            child.stdout.emit("data", Buffer.from(`${lines.map((l) => l.replace("$FILE", out)).join("\n")}\n`));
            if (stderr) child.stderr.emit("data", Buffer.from(stderr));
            child.exitCode = code;
            child.emit("close", code);
        });
        return child;
    };
}
const execOk = (calls) => (file, args, opts, cb) => { calls.push({ file, args }); cb(null, args[0] === "--version" ? "2026.10.26\n" : "", ""); };

function until(events, phase) {
    return new Promise((resolve) => {
        const tick = () => (events.some((e) => e.phase === phase) ? resolve() : setTimeout(tick, 5));
        tick();
    });
}

test("download: the copy is made, yt-dlp runs with the runtime, the SAME row becomes the file", async (t) => {
    const env = setup(t);
    const spawns = [];
    const execs = [];
    const events = [];
    const yt = createYouTube({
        ...env, importMedia, runtime: { path: "C:\\KERYX\\KERYX.exe", env: { ELECTRON_RUN_AS_NODE: "1" } },
        emit: (e) => events.push(e),
        spawn: fakeSpawn(spawns, { lines: ["INFO 11|312|Louvor (Ao Vivo)", "KX 5 11 NA", "KX 11 11 NA", "FILE $FILE"] }),
        execFile: execOk(execs),
    });
    const first = yt.ops.download({ id: "m1", url: "https://youtu.be/aBcDeFgHiJk" });
    assert.equal(first.phase, "waiting");
    assert.equal(yt.ops.download({ id: "m1", url: "https://youtu.be/aBcDeFgHiJk" }).phase, "waiting", "the same row twice is one job");
    await until(events, "done");
    assert.equal(fs.readFileSync(path.join(env.workDir, "yt-dlp.exe"), "utf8"), "bundled", "the copy that updates itself");
    assert.ok(execs.some((c) => c.args[0] === "-U"), "never updated: it updates before the first download");
    assert.equal(spawns.length, 1);
    assert.equal(spawns[0].cmd, path.join(env.workDir, "yt-dlp.exe"));
    const row = env.rows.get("m1");
    assert.match(row.file_url, /^keryx-media:\/\/[0-9a-f-]+\.mp4$/);
    assert.equal(fs.readFileSync(path.join(env.mediaDir, row.file_url.slice("keryx-media://".length)), "utf8"), "video bytes");
    assert.deepEqual([row.title, row.duration, row.source_url], ["Louvor (Ao Vivo)", 312, "https://youtu.be/aBcDeFgHiJk"]);
    assert.ok(!fs.existsSync(path.join(env.workDir, "dl", "m1")), "the work folder is cleaned");
    assert.ok(events.some((e) => e.phase === "downloading"));
    assert.deepEqual(yt.ops.list().map((j) => [j.id, j.phase]), [["m1", "done"]]);
});

test("download: yt-dlp fails -> failed with the reason, the row untouched", async (t) => {
    const env = setup(t);
    const events = [];
    const yt = createYouTube({
        ...env, importMedia, emit: (e) => events.push(e),
        spawn: fakeSpawn([], { lines: [], code: 1, write: false, stderr: "ERROR: [youtube] aBcDeFgHiJk: Private video" }),
        execFile: execOk([]),
    });
    yt.ops.download({ id: "m1", url: "https://youtu.be/aBcDeFgHiJk" });
    await until(events, "failed");
    assert.match(events.at(-1).message, /privado/);
    assert.equal(env.rows.get("m1").file_url, "https://youtu.be/aBcDeFgHiJk");
});

test("download: without the tools it says so; cancel while waiting", async (t) => {
    const env = setup(t, { files: false });
    const events = [];
    const yt = createYouTube({ ...env, importMedia, emit: (e) => events.push(e), spawn: () => { throw new Error("never"); }, execFile: execOk([]) });
    assert.equal((await yt.ops.status()).ready, false);
    yt.ops.download({ id: "m1", url: "https://youtu.be/aBcDeFgHiJk" });
    await until(events, "failed");
    assert.match(events.at(-1).message, /não vieram neste KERYX/);
    assert.throws(() => yt.ops.download({ id: "m1", url: "https://vimeo.com/1" }), /não parece um link do YouTube/);
});

test("check: oEmbed 200 / 401 / 404 / offline", async (t) => {
    const env = setup(t);
    const answers = [
        { status: 200, json: async () => ({ title: "Louvor", author_name: "Ministério" }) },
        { status: 401 },
        { status: 404 },
    ];
    const urls = [];
    const yt = createYouTube({ ...env, importMedia, fetchImpl: async (url) => { urls.push(url); const a = answers.shift(); if (!a) throw new Error("offline"); return a; } });
    const ok = await yt.ops.check({ url: "https://youtu.be/aBcDeFgHiJk" });
    assert.deepEqual([ok.state, ok.title, ok.author, ok.id], ["ok", "Louvor", "Ministério", "aBcDeFgHiJk"]);
    assert.match(urls[0], /^https:\/\/www\.youtube\.com\/oembed\?format=json&url=https%3A%2F%2Fwww\.youtube\.com%2Fwatch%3Fv%3DaBcDeFgHiJk$/);
    assert.equal((await yt.ops.check({ url: "https://youtu.be/aBcDeFgHiJk" })).state, "blocked");
    assert.equal((await yt.ops.check({ url: "https://youtu.be/aBcDeFgHiJk" })).state, "missing");
    assert.equal((await yt.ops.check({ url: "https://youtu.be/aBcDeFgHiJk" })).state, "offline");
    await assert.rejects(yt.ops.check({ url: "nope" }), /não parece um link/);
});

test("the bell on a download that ended: done opens the file in the Mídia, failed says why", async (t) => {
    assert.deepEqual(youtubeNote({ id: "m1", phase: "done" }, "Louvor (Ao Vivo)"),
        { key: "youtube:m1", action: "media:m1", kind: "youtube", title: "Baixado para a Mídia: Louvor (Ao Vivo)", body: "" });
    assert.deepEqual(youtubeNote({ id: "m1", phase: "failed", message: "O vídeo é privado." }, ""),
        { key: "youtube:m1", action: "media:m1", kind: "warn", title: "Não deu para baixar o vídeo do YouTube", body: "O vídeo é privado." });
    assert.equal(youtubeNote({ id: "m1", phase: "canceled" }, "x"), null);
    assert.equal(youtubeNote({ id: "m1", phase: "downloading" }, "x"), null);
    // Through the engine: one note when it ends, by the row's new title.
    const env = setup(t);
    const events = [];
    const notes = [];
    const yt = createYouTube({
        ...env, importMedia, emit: (e) => events.push(e), notify: (n) => notes.push(n),
        spawn: fakeSpawn([], { lines: ["INFO 11|312|Louvor (Ao Vivo)", "KX 11 11 NA", "FILE $FILE"] }),
        execFile: execOk([]),
    });
    yt.ops.download({ id: "m1", url: "https://youtu.be/aBcDeFgHiJk" });
    await until(events, "done");
    assert.deepEqual(notes.map((n) => [n.kind, n.title]), [["youtube", "Baixado para a Mídia: Louvor (Ao Vivo)"]]);
});
