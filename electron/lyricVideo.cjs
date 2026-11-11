// "Exportar vídeo com a letra…" (owner 2026-11-11): a song's slides, drawn as
// the screens draw them with the theme chosen, timed by the song's marks,
// joined with its playback's sound into an MP4 the church can play anywhere
// (another computer, another church, a TV). Desktop only.
//
// How (the owner's pick, "slide images + ffmpeg"):
//   1. A hidden, offscreen 1920×1080 window loads /Render?job=<id>
//      (src/pages/RenderPage.jsx): it asks for the document ("doc"), draws
//      the background alone and then each slide as a still, and after each
//      one asks main to keep that frame ("frame", capturePage → a PNG in a
//      temp folder); "drawn" when the last is kept.
//   2. ffmpeg (the one the installer ships for Baixar para a Mídia,
//      resources/youtube) joins the PNGs, each from its mark to the next
//      one's (segments), with a crossfade of `fade` seconds or a cut
//      (ffmpegArgs), and the playback's sound, into H.264 + AAC, 1080p30, at
//      the path the save dialog gave.
// Progress goes to every window as keryx:lyricVideo jobs; Cancelar kills
// ffmpeg's tree; the temp folder goes at the end, failed or not.
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");

const FFMPEG = "ffmpeg.exe";
const FPS = 30;
const MIN_SEGMENT = 0.1;

// ---------- pure (tested) ----------

// What is on screen when: the background alone from 0 to the first slide's
// start (when the song does not start on it), then each slide from its start
// to the next one's, the last to the end of the sound. `starts`: each
// slide's start in seconds (every slide carries one on air: withFollowStarts).
// -> [{ frame: "bg" | <slide index>, from, to }]
function segments(starts, total) {
    const out = [];
    const end = Number(total) > 0 ? Number(total) : 0;
    const marks = (starts || []).map((v, i) => ({ i, t: Number.isFinite(v) ? Math.max(0, v) : null })).filter((m) => m.t !== null && m.t < end);
    marks.sort((a, b) => a.t - b.t || a.i - b.i);
    if (!marks.length) return end > 0 ? [{ frame: "bg", from: 0, to: end }] : [];
    if (marks[0].t > MIN_SEGMENT) out.push({ frame: "bg", from: 0, to: marks[0].t });
    marks.forEach((m, k) => {
        const from = k === 0 && out.length === 0 ? 0 : m.t;
        const to = k + 1 < marks.length ? marks[k + 1].t : end;
        if (to - from >= MIN_SEGMENT) out.push({ frame: m.i, from, to });
    });
    return out;
}

// The crossfade's plan: each input's length and where each fade starts, so
// every slide is fully in by its mark plus half the fade and the whole lasts
// `total`. A fade never takes more than half the shortest segment.
// -> { fade, lens: [seconds], offsets: [seconds | null] } (offsets[0] null)
function fadePlan(segs, fade) {
    const shortest = Math.min(...segs.map((s) => s.to - s.from));
    const f = segs.length > 1 && fade > 0 ? Math.max(0, Math.min(fade, shortest / 2)) : 0;
    const offsets = segs.map((s, k) => (k === 0 ? null : Math.max(0, s.from - f / 2)));
    const lens = segs.map((s, k) => {
        const start = k === 0 ? 0 : offsets[k];
        const next = k + 1 < segs.length ? offsets[k + 1] + f : s.to;
        return Math.max(MIN_SEGMENT, next - start);
    });
    return { fade: f, lens, offsets };
}

const r3 = (n) => Math.round(n * 1000) / 1000;

// ffmpeg's arguments: one looped PNG input per segment, cut (concat) or
// crossfaded (xfade), the sound from the playback (a video's sound stream
// too; none = a silent video), H.264 yuv420p + AAC, `total` seconds, the
// progress on stdout. `frameFile(frame)` -> the PNG of "bg" or a slide.
function ffmpegArgs({ segs, fade = 0, frameFile, audio, out, total }) {
    const plan = fadePlan(segs, fade);
    const args = ["-y", "-hide_banner", "-nostats", "-progress", "pipe:1"];
    segs.forEach((s, k) => args.push("-loop", "1", "-framerate", String(FPS), "-t", String(r3(plan.lens[k])), "-i", frameFile(s.frame)));
    if (audio) args.push("-i", audio);
    const n = segs.length;
    const prep = segs.map((_, k) => `[${k}:v]scale=1920:1080,setsar=1,fps=${FPS},format=yuv420p[s${k}]`);
    let chain;
    if (n === 1) chain = "[s0]copy[v]";
    else if (!plan.fade) chain = `${segs.map((_, k) => `[s${k}]`).join("")}concat=n=${n}:v=1:a=0[v]`;
    else {
        const steps = [];
        for (let k = 1; k < n; k++) {
            const a = k === 1 ? "[s0]" : `[x${k - 1}]`;
            const b = k === n - 1 ? "[v]" : `[x${k}]`;
            steps.push(`${a}[s${k}]xfade=transition=fade:duration=${r3(plan.fade)}:offset=${r3(plan.offsets[k])}${b}`);
        }
        chain = steps.join(";");
    }
    args.push("-filter_complex", [...prep, chain].join(";"), "-map", "[v]");
    if (audio) args.push("-map", `${n}:a:0?`, "-c:a", "aac", "-b:a", "192k");
    args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-r", String(FPS), "-t", String(r3(total)), "-movflags", "+faststart", out);
    return args;
}

// The file of a song's playback: its media URL (the page's
// http://127.0.0.1:<port>/media/<file>, or keryx-media://<file>) -> the path
// in the media folder; null for anything else (a YouTube link, the web).
function mediaPathOf(url, mediaDir) {
    const s = String(url || "");
    const m = /^keryx-media:\/\/(.+)$/.exec(s) || /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/media\/(.+)$/.exec(s);
    if (!m) return null;
    const name = decodeURIComponent(m[1].split(/[?#]/)[0]);
    if (!name || name.includes("..") || name.startsWith("bundled/")) return null;
    return path.join(mediaDir, name);
}

// The name the save dialog proposes.
const fileNameFor = (title) => `${String(title || "Música").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, " ").trim() || "Música"} · com letra.mp4`;

// ---------- the controller ----------

function createLyricVideo({ BrowserWindow, dialog, url, webPreferences, toolsDir, mediaDir, emit = () => {}, log = console, tmpRoot = os.tmpdir() }) {
    const jobs = new Map();
    const ffmpegPath = () => path.join(toolsDir, FFMPEG);
    const hasFfmpeg = () => { try { return fs.existsSync(ffmpegPath()); } catch { return false; } };
    const view = (j) => ({ id: j.id, title: j.title, phase: j.phase, pct: j.pct, error: j.error || "", out: j.out });
    const tell = (j, patch) => { Object.assign(j, patch); emit(view(j)); };

    function cleanup(j) {
        if (j.win && !j.win.isDestroyed()) j.win.destroy();
        j.win = null;
        try { fs.rmSync(j.dir, { recursive: true, force: true }); } catch { /* best effort */ }
    }
    function fail(j, message) {
        if (j.phase === "done" || j.phase === "failed" || j.phase === "canceled") return;
        log.warn(`[keryx-video] ${j.title}: ${message}`);
        tell(j, { phase: "failed", error: message });
        cleanup(j);
    }

    async function start({ title, doc, total, fade, audioUrl }, owner) {
        if (!hasFfmpeg()) throw Object.assign(new Error("Este KERYX não trouxe o ffmpeg: o vídeo com a letra não pode ser feito aqui."), { status: 503 });
        const slides = doc?.content?.slides || [];
        if (!slides.length) throw Object.assign(new Error("A música não tem slides."), { status: 400 });
        const len = Number(total);
        if (!(len > 0)) throw Object.assign(new Error("A música não tem duração: preencha a duração ou escolha o playback."), { status: 400 });
        const audio = audioUrl ? mediaPathOf(audioUrl, mediaDir) : null;
        if (audioUrl && (!audio || !fs.existsSync(audio))) throw Object.assign(new Error("O arquivo do playback não está neste computador."), { status: 404 });
        const save = await dialog.showSaveDialog(owner || undefined, {
            title: "Salvar o vídeo com a letra",
            defaultPath: path.join(require("node:os").homedir(), "Videos", fileNameFor(title)),
            filters: [{ name: "Vídeo MP4", extensions: ["mp4"] }],
        });
        if (save.canceled || !save.filePath) return { canceled: true };
        const id = crypto.randomUUID();
        const dir = fs.mkdtempSync(path.join(tmpRoot, "keryx-video-"));
        const j = { id, title: title || "Música", doc, total: len, fade: Number(fade) || 0, audio, out: save.filePath, dir, phase: "frames", pct: 0, frames: new Set(), win: null, proc: null };
        jobs.set(id, j);
        tell(j, {});
        const win = new BrowserWindow({
            show: false, width: 1920, height: 1080, useContentSize: true, frame: false, skipTaskbar: true, focusable: false,
            backgroundColor: "#000000", title: "KERYX · vídeo com a letra",
            webPreferences: { ...webPreferences, offscreen: true, backgroundThrottling: false },
        });
        j.win = win;
        win.webContents.on("render-process-gone", () => fail(j, "A página que desenha os slides parou."));
        win.loadURL(`${url}?job=${encodeURIComponent(id)}`).catch((err) => fail(j, `Não foi possível desenhar os slides: ${err.message}`));
        return { id };
    }

    function encode(j) {
        const starts = (j.doc.content.slides || []).map((s) => s.start);
        const segs = segments(starts, j.total);
        if (!segs.length) return fail(j, "Nada a gravar: confira as marcas.");
        const frameFile = (frame) => path.join(j.dir, frame === "bg" ? "bg.png" : `slide-${frame}.png`);
        const missing = segs.find((s) => !fs.existsSync(frameFile(s.frame)));
        if (missing) return fail(j, "Um slide não foi desenhado.");
        const args = ffmpegArgs({ segs, fade: j.fade, frameFile, audio: j.audio, out: j.out, total: j.total });
        tell(j, { phase: "encode", pct: 0 });
        const proc = spawn(ffmpegPath(), args, { windowsHide: true });
        j.proc = proc;
        let err = "";
        let buf = "";
        proc.stdout.on("data", (d) => {
            buf += d.toString();
            const lines = buf.split(/\r?\n/);
            buf = lines.pop();
            for (const line of lines) {
                const m = /^out_time_(?:us|ms)=(\d+)/.exec(line);
                if (m) tell(j, { pct: Math.min(99, Math.round((Number(m[1]) / 1e6 / j.total) * 100)) });
            }
        });
        proc.stderr.on("data", (d) => { err = (err + d.toString()).slice(-4000); });
        proc.on("error", (e) => fail(j, `O ffmpeg não abriu: ${e.message}`));
        proc.on("close", (code) => {
            j.proc = null;
            if (j.phase === "canceled") return;
            if (code === 0) { tell(j, { phase: "done", pct: 100 }); cleanup(j); }
            else { log.warn(`[keryx-video] ffmpeg ${code}: ${err}`); fail(j, "O ffmpeg não conseguiu fazer o vídeo."); }
        });
    }

    const ops = {
        status: () => ({ ffmpeg: hasFfmpeg() }),
        list: () => [...jobs.values()].map(view),
        // From the hidden page: the document to draw.
        doc: ({ id }) => {
            const j = jobs.get(id);
            if (!j) throw Object.assign(new Error("Trabalho não encontrado."), { status: 404 });
            return { doc: j.doc, count: (j.doc.content?.slides || []).length };
        },
        cancel: ({ id }) => {
            const j = jobs.get(id);
            if (!j || j.phase === "done" || j.phase === "failed") return { ok: false };
            tell(j, { phase: "canceled" });
            if (j.proc) { try { spawnSync("taskkill", ["/PID", String(j.proc.pid), "/T", "/F"], { windowsHide: true }); } catch { j.proc.kill(); } }
            cleanup(j);
            try { fs.rmSync(j.out, { force: true }); } catch { /* the half file */ }
            return { ok: true };
        },
    };

    // The hidden page's calls carry the sender, whose frame is captured.
    async function frame(event, { id, frame }) {
        const j = jobs.get(id);
        if (!j || j.phase !== "frames" || !j.win || event.sender !== j.win.webContents) return { ok: false };
        const image = await event.sender.capturePage();
        fs.writeFileSync(path.join(j.dir, frame === "bg" ? "bg.png" : `slide-${Number(frame)}.png`), image.toPNG());
        j.frames.add(String(frame));
        const count = (j.doc.content?.slides || []).length + 1;
        tell(j, { pct: Math.round((j.frames.size / count) * 100) });
        return { ok: true };
    }
    function drawn(event, { id }) {
        const j = jobs.get(id);
        if (!j || j.phase !== "frames" || !j.win || event.sender !== j.win.webContents) return { ok: false };
        if (j.win && !j.win.isDestroyed()) j.win.destroy();
        j.win = null;
        encode(j);
        return { ok: true };
    }

    return { ops, start, frame, drawn, hasFfmpeg, jobs };
}

// IPC: keryx:lyricVideo { op, args } — start (the console, the save dialog
// over its window), status, list, cancel, and from the hidden page doc,
// frame and drawn.
function registerLyricVideo({ ipcMain, BrowserWindow, isTrusted, video, log = console }) {
    ipcMain.handle("keryx:lyricVideo", async (event, payload) => {
        if (!isTrusted(event)) return { error: { message: "Origem não autorizada.", status: 403 } };
        const { op, args } = payload || {};
        try {
            if (op === "start") return { data: await video.start(args || {}, BrowserWindow.fromWebContents(event.sender)) };
            if (op === "frame") return { data: await video.frame(event, args || {}) };
            if (op === "drawn") return { data: video.drawn(event, args || {}) };
            if (!Object.prototype.hasOwnProperty.call(video.ops, op)) return { error: { message: `Operação desconhecida: ${op}.`, status: 400 } };
            return { data: await video.ops[op](args || {}) };
        } catch (err) {
            if (!err.status) log.error(`[keryx-video] ${op}: ${err && err.stack}`);
            return { error: { message: err.message || "Falha no vídeo.", status: err.status || 500 } };
        }
    });
}

module.exports = { segments, fadePlan, ffmpegArgs, mediaPathOf, fileNameFor, createLyricVideo, registerLyricVideo, FPS };
