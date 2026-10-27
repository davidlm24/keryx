// YouTube links: is this one allowed to play outside YouTube, and "Baixar
// para a Mídia" (owner 2026-10-27, mockup "YouTube · checar o link e baixar
// para a Mídia", Y1–Y5).
//
// - check: YouTube's public oEmbed answers 200 for a video that may be
//   embedded, 401/403 when its owner turned embedding off (the projector
//   would show "Este vídeo não está disponível"), 400/404 when it is gone or
//   private. No key, no account.
// - download: yt-dlp (with ffmpeg to join the picture and the sound) fetches
//   the video as H.264 + AAC up to 1080p (Y3 = A: plays on any PC, passes the
//   codec rule of src/lib/videoCodec.js) into a work folder, then the file is
//   copied into the media folder like any import (mediaImport.cjs) and THE
//   SAME Media row becomes a file of the computer (Y1 = A): the Setlist items
//   that name it play the file from then on. The row is written here, through
//   the store, so it syncs and the download ends even if the window closed.
// - Both tools ship in the installer (Y2 = B; scripts/youtube-tools.cjs puts
//   them in resources/youtube). yt-dlp breaks when YouTube changes, so it
//   runs from a copy in <data>/youtube that updates itself (yt-dlp -U) at
//   most once a week before a download, and on "Atualizar agora".
// - Since 2025.11 yt-dlp needs a JavaScript runtime for YouTube: KERYX's own
//   executable in Node mode (ELECTRON_RUN_AS_NODE) is that runtime.
//
// Downloading from YouTube goes against YouTube's Terms of Service unless the
// owner allows it: the console asks the church once (Y5 = A,
// User.youtube_download_ok) before the first download.

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const fsp = fs.promises;

const YTDLP = "yt-dlp.exe";
const FFMPEG = "ffmpeg.exe";
const CHECK_TIMEOUT_MS = 8000;
const UPDATE_EVERY_MS = 7 * 24 * 60 * 60 * 1000;
const UPDATE_TIMEOUT_MS = 90 * 1000;
const STDERR_KEEP = 4000;

// H.264 + AAC up to 1080p, else whatever is there up to 1080p; merged to mp4.
const FORMAT = "bv*[height<=1080][vcodec^=avc1]+ba[acodec^=mp4a]/b[height<=1080][vcodec^=avc1]/bv*[height<=1080]+ba/b[height<=1080]/b";

class YouTubeError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.status = status;
    }
}

// The 11-character id of a YouTube link, or null.
function youtubeId(url) {
    const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

// What an oEmbed answer means for the projector.
function oembedState(status) {
    if (status === 200) return "ok";
    if (status === 401 || status === 403) return "blocked";
    if (status === 400 || status === 404) return "missing";
    return "error";
}

// yt-dlp's arguments for one download into `outDir`. `node` is the
// JavaScript runtime's path.
function downloadArgs({ url, outDir, ffmpegDir, node }) {
    return [
        "--no-playlist", "--newline", "--progress", "--no-colors", "--no-mtime",
        ...(node ? ["--js-runtimes", `node:${node}`] : []),
        "--ffmpeg-location", ffmpegDir,
        "-f", FORMAT,
        "--merge-output-format", "mp4",
        "--progress-template", "download:KX %(progress.downloaded_bytes)s %(progress.total_bytes)s %(progress.total_bytes_estimate)s",
        "--print", "before_dl:INFO %(filesize,filesize_approx)s|%(duration)s|%(title)s",
        "--print", "after_move:FILE %(filepath)s",
        "-o", path.join(outDir, "%(id)s.%(ext)s"),
        "--", url,
    ];
}

const num = (s) => {
    const n = Number(s);
    return Number.isFinite(n) && n >= 0 ? n : null;
};

// One line of yt-dlp's output (downloadArgs' templates), or null.
function parseLine(line) {
    const s = String(line || "").trim();
    let m = s.match(/^KX (\S+) (\S+) (\S+)$/);
    if (m) return { kind: "progress", bytes: num(m[1]) || 0, total: num(m[2]) ?? num(m[3]) };
    m = s.match(/^INFO ([^|]*)\|([^|]*)\|(.*)$/);
    if (m) return { kind: "info", total: num(m[1]), duration: num(m[2]), title: m[3] === "NA" ? "" : m[3] };
    m = s.match(/^FILE (.+)$/);
    if (m) return { kind: "file", path: m[1] };
    return null;
}

// The whole download's progress over its parts (the picture, then the
// sound: each part's bytes start again from 0). -> the next tracker.
function track(prev, parsed) {
    const t = prev || { done: 0, partBytes: 0, partTotal: 0, total: null };
    if (parsed.kind === "info") return { ...t, total: parsed.total ?? t.total };
    if (parsed.kind !== "progress") return t;
    const next = parsed.bytes < t.partBytes ? { ...t, done: t.done + (t.partTotal || t.partBytes) } : { ...t };
    next.partBytes = parsed.bytes;
    next.partTotal = parsed.total || next.partTotal;
    return next;
}

// -> { bytes, total }: total null while unknown, never under bytes.
function progressOf(t) {
    if (!t) return { bytes: 0, total: null };
    const bytes = t.done + t.partBytes;
    const known = t.total || (t.partTotal ? t.done + t.partTotal : null);
    return { bytes, total: known ? Math.max(known, bytes) : null };
}

// What went wrong, in pt-BR, from the end of yt-dlp's stderr.
function errorMessage(stderr) {
    const s = String(stderr || "");
    if (/confirm your age|age[- ]restricted|inappropriate for some users/i.test(s)) return "O YouTube só mostra este vídeo com login (restrito por idade): não dá para baixar.";
    if (/not a bot/i.test(s)) return "O YouTube pediu para confirmar que não é um robô. Tente de novo mais tarde.";
    if (/available in your country|blocked it in your country|geo-?restrict/i.test(s)) return "Este vídeo não está disponível no Brasil.";
    if (/private video|video unavailable|has been removed|does not exist|account associated with this video has been terminated/i.test(s)) return "Este vídeo não existe ou é privado.";
    if (/live event|is live|premieres in/i.test(s)) return "Uma transmissão ao vivo ou estreia só pode ser baixada depois que terminar.";
    if (/requested format is not available/i.test(s)) return "O YouTube não ofereceu um formato que o KERYX toque.";
    if (/no space left|ENOSPC/i.test(s)) return "Falta espaço no disco. Libere espaço e tente de novo.";
    if (/getaddrinfo|timed? ?out|connection|network is unreachable|HTTP Error 5\d\d|Unable to download webpage/i.test(s)) return "Sem internet, ou o YouTube não respondeu. Tente de novo.";
    return "Não foi possível baixar o vídeo. Em Configurações › Telas e saídas › Som e YouTube, use Atualizar agora e tente de novo.";
}

// The row fields of a Media row whose link became the downloaded file
// (Y1 = A). The codec and the still are read again by the console's
// backfills (useCodecBackfill, usePosterBackfill); its size, as every
// file's, from the disk (keryx:media-info).
function downloadedFields(row, { fileName, url, info }) {
    const generic = !row?.title || row.title === "Vídeo do YouTube";
    return {
        type: "video",
        file_url: `keryx-media://${fileName}`,
        source_url: url,
        duration: info?.duration || row?.duration || 0,
        thumbnail_url: "",
        video_codec: "",
        video_bit_depth: null,
        video_chroma: "",
        ...(generic && info?.title ? { title: info.title.slice(0, 200) } : {}),
    };
}

// Kills yt-dlp and what it started (ffmpeg): on Windows a plain kill leaves
// the child running.
function killTree(child) {
    if (!child || child.exitCode !== null) return;
    if (process.platform === "win32" && child.pid) {
        childProcess.execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true }, () => {});
    } else {
        child.kill("SIGKILL");
    }
}

/**
 * toolsDir: where the installer put yt-dlp.exe, ffmpeg.exe and version.json.
 * workDir: this computer's folder for the updating copy and the downloads.
 * runtime: { path, env } the JavaScript runtime yt-dlp runs.
 * importMedia(args) -> { data: { fileName } } | { error } (mediaImport.cjs).
 * store: the local store (call(entity, op, args)).
 * emit(event): a job's progress, to every window ("keryx:youtube").
 */
// The bell's word on a download that ended (owner 2026-10-27: whoever does
// not know where the Mídia is sees it there), its Ver the file in the Mídia.
// -> a note for notifications.add, or null (waiting, canceled).
function youtubeNote(job, title) {
    const name = String(title || "").trim() || "o vídeo do YouTube";
    const base = { key: `youtube:${job.id}`, action: `media:${job.id}` };
    if (job.phase === "done") return { ...base, kind: "youtube", title: `Baixado para a Mídia: ${name}`, body: "" };
    if (job.phase === "failed") return { ...base, kind: "warn", title: `Não deu para baixar ${name}`, body: job.message || "" };
    return null;
}

function createYouTube({
    toolsDir, workDir, mediaDir, importMedia, store, runtime = null, emit = () => {}, notify = () => {}, log = () => {},
    fetchImpl = (...a) => fetch(...a), spawn = childProcess.spawn, execFile = childProcess.execFile, kill = killTree, now = () => Date.now(),
} = {}) {
    const bundled = path.join(toolsDir, YTDLP);
    const working = path.join(workDir, YTDLP);
    const infoFile = path.join(workDir, "tools.json");
    const jobs = new Map(); // id -> { id, url, phase, bytes, total, message, child, canceled }
    const queue = [];
    let running = null;
    let updating = null;

    const readJson = async (file) => {
        try { return JSON.parse(await fsp.readFile(file, "utf8")); } catch { return null; }
    };
    const bundledVersion = async () => (await readJson(path.join(toolsDir, "version.json"))) || {};

    // The copy yt-dlp updates; taken again from the installer when the
    // installer brought a different yt-dlp than the copy came from.
    async function ensureWorking() {
        const shipped = await bundledVersion();
        const info = (await readJson(infoFile)) || {};
        const have = fs.existsSync(working);
        if (!fs.existsSync(bundled) && !have) throw new YouTubeError("As ferramentas do YouTube não vieram neste KERYX. Instale a versão completa.", 503);
        if (!fs.existsSync(path.join(toolsDir, FFMPEG))) throw new YouTubeError("O ffmpeg não veio neste KERYX. Instale a versão completa.", 503);
        if (!have || (fs.existsSync(bundled) && info.from !== shipped.ytdlp)) {
            await fsp.mkdir(workDir, { recursive: true });
            await fsp.copyFile(bundled, `${working}.partial`);
            await fsp.rename(`${working}.partial`, working);
            await fsp.writeFile(infoFile, JSON.stringify({ from: shipped.ytdlp || null, updatedAt: null }));
        }
        return (await readJson(infoFile)) || {};
    }

    const runTool = (args, timeout) => new Promise((resolve) => {
        execFile(working, args, { windowsHide: true, timeout, env: { ...process.env, ...(runtime?.env || {}) } }, (err, stdout, stderr) => {
            resolve({ ok: !err, stdout: String(stdout || ""), stderr: String(stderr || "") });
        });
    });

    async function version() {
        const r = await runTool(["--version"], 20000);
        return r.ok ? r.stdout.trim().split(/\s+/)[0] || null : null;
    }

    async function status() {
        const shipped = await bundledVersion();
        const ready = (fs.existsSync(bundled) || fs.existsSync(working)) && fs.existsSync(path.join(toolsDir, FFMPEG));
        if (!ready) return { ready: false, ytdlp: null, ffmpeg: shipped.ffmpeg || null, updatedAt: null };
        const info = await ensureWorking().catch(() => ({}));
        return { ready: true, ytdlp: (await version()) || shipped.ytdlp || null, ffmpeg: shipped.ffmpeg || null, updatedAt: info.updatedAt || null };
    }

    // yt-dlp -U on the copy. -> { ytdlp, changed }
    function update() {
        if (updating) return updating;
        updating = (async () => {
            await ensureWorking();
            const before = await version();
            const r = await runTool(["-U"], UPDATE_TIMEOUT_MS);
            if (!r.ok) {
                log(`[keryx-youtube] update: ${r.stderr.slice(-500)}`);
                throw new YouTubeError("Não foi possível atualizar agora: confira a internet e tente de novo.", 502);
            }
            const info = (await readJson(infoFile)) || {};
            await fsp.writeFile(infoFile, JSON.stringify({ ...info, updatedAt: now() }));
            const after = await version();
            return { ytdlp: after, changed: Boolean(after && after !== before) };
        })().finally(() => { updating = null; });
        return updating;
    }

    async function check({ url } = {}) {
        const id = youtubeId(url);
        if (!id) throw new YouTubeError("Isso não parece um link do YouTube.", 400);
        const target = `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(`https://www.youtube.com/watch?v=${id}`)}`;
        let res;
        try {
            res = await fetchImpl(target, { signal: AbortSignal.timeout(CHECK_TIMEOUT_MS) });
        } catch {
            return { id, state: "offline", title: "", author: "", thumbnail: "" };
        }
        const state = oembedState(res.status);
        let body = {};
        if (state === "ok") {
            try { body = await res.json(); } catch { body = {}; }
        }
        return {
            id,
            state,
            title: String(body.title || "").slice(0, 200),
            author: String(body.author_name || "").slice(0, 120),
            thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
        };
    }

    const publicJob = (j) => ({ id: j.id, url: j.url, phase: j.phase, bytes: j.bytes, total: j.total, message: j.message || "" });
    const tell = (j) => emit(publicJob(j));

    function download({ id, url } = {}) {
        if (typeof id !== "string" || !id) throw new YouTubeError("Falta a mídia.", 400);
        if (!youtubeId(url)) throw new YouTubeError("Isso não parece um link do YouTube.", 400);
        const current = jobs.get(id);
        if (current && (current.phase === "waiting" || current.phase === "downloading" || current.phase === "saving")) return publicJob(current);
        const job = { id, url, phase: "waiting", bytes: 0, total: null, message: "" };
        jobs.set(id, job);
        queue.push(job);
        tell(job);
        pump();
        return publicJob(job);
    }

    function cancel({ id } = {}) {
        const job = jobs.get(id);
        if (!job) return { canceled: false };
        job.canceled = true;
        const i = queue.indexOf(job);
        if (i >= 0) queue.splice(i, 1);
        if (job.child) kill(job.child);
        if (job.phase === "waiting") finish(job, "canceled");
        return { canceled: true };
    }

    function finish(job, phase, message = "") {
        job.phase = phase;
        job.message = message;
        job.child = null;
        tell(job);
        // Done or failed: the bell says so too, by the row's title.
        let title = "";
        try { title = store.call("Media", "get", [job.id])?.title || ""; } catch { /* the title only */ }
        const note = youtubeNote(job, title);
        if (note) notify(note);
        // A finished job stays listed a moment for windows that look later.
        setTimeout(() => { if (jobs.get(job.id) === job && job.phase === phase) jobs.delete(job.id); }, 60000).unref?.();
    }

    function pump() {
        if (running || !queue.length) return;
        running = queue.shift();
        run(running).catch((err) => {
            log(`[keryx-youtube] ${err && err.stack}`);
            finish(running, "failed", err && err.status ? err.message : "Não foi possível baixar o vídeo.");
        }).finally(() => {
            running = null;
            pump();
        });
    }

    async function run(job) {
        const info = await ensureWorking();
        if (job.canceled) return finish(job, "canceled");
        // Once a week at most, before a download: YouTube changes often.
        if (!info.updatedAt || now() - info.updatedAt > UPDATE_EVERY_MS) await update().catch(() => {});
        if (job.canceled) return finish(job, "canceled");
        const outDir = path.join(workDir, "dl", job.id.replace(/[^A-Za-z0-9_-]/g, "_"));
        await fsp.rm(outDir, { recursive: true, force: true });
        await fsp.mkdir(outDir, { recursive: true });
        job.phase = "downloading";
        tell(job);
        let out;
        try {
            out = await fetchVideo(job, outDir);
        } finally {
            await fsp.rm(outDir, { recursive: true, force: true }).catch(() => {});
        }
        finish(job, ...out);
    }

    // yt-dlp into outDir, then the file into the media folder and the row. -> [phase, message]
    async function fetchVideo(job, outDir) {
        const result = await new Promise((resolve) => {
            const child = spawn(working, downloadArgs({ url: job.url, outDir, ffmpegDir: toolsDir, node: runtime?.path }), {
                windowsHide: true,
                env: { ...process.env, ...(runtime?.env || {}) },
            });
            job.child = child;
            let t = null;
            let file = null;
            let meta = null;
            let stderr = "";
            let buf = "";
            let lastTell = 0;
            const onLine = (line) => {
                const p = parseLine(line);
                if (!p) return;
                if (p.kind === "file") file = p.path;
                if (p.kind === "info") meta = p;
                t = track(t, p);
                Object.assign(job, progressOf(t));
                if (now() - lastTell > 250) { lastTell = now(); tell(job); }
            };
            child.stdout.on("data", (d) => {
                buf += String(d);
                const lines = buf.split(/\r?\n/);
                buf = lines.pop();
                lines.forEach(onLine);
            });
            child.stderr.on("data", (d) => { stderr = (stderr + String(d)).slice(-STDERR_KEEP); });
            child.on("error", (err) => resolve({ code: -1, stderr: String(err && err.message), file, meta }));
            child.on("close", (code) => {
                if (buf) onLine(buf);
                resolve({ code, stderr, file, meta });
            });
        });
        if (job.canceled) return ["canceled"];
        if (result.code !== 0 || !result.file) {
            log(`[keryx-youtube] ${job.url}: exit ${result.code} ${result.stderr.slice(-800)}`);
            return ["failed", errorMessage(result.stderr)];
        }
        job.phase = "saving";
        tell(job);
        const imported = await importMedia({ mediaDir, sourcePath: result.file, name: result.file }, { log });
        if (imported.error) return ["failed", imported.error.message];
        const { fileName } = imported.data;
        const size = (await fsp.stat(path.join(mediaDir, fileName))).size;
        const row = store.call("Media", "get", [job.id]);
        if (!row) return ["failed", "A mídia foi excluída enquanto baixava; o arquivo ficou na pasta de mídia."];
        store.call("Media", "update", [job.id, downloadedFields(row, { fileName, url: job.url, info: result.meta })]);
        job.bytes = size;
        job.total = size;
        return ["done"];
    }

    return {
        ops: {
            check,
            status,
            update,
            download,
            cancel,
            list: () => [...jobs.values()].map(publicJob),
        },
        stop() {
            for (const job of jobs.values()) {
                job.canceled = true;
                if (job.child) kill(job.child);
            }
        },
    };
}

module.exports = { createYouTube, youtubeNote, youtubeId, oembedState, downloadArgs, parseLine, track, progressOf, errorMessage, downloadedFields, YouTubeError, FORMAT };
