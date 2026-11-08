// The tools of "Baixar para a Mídia" (owner 2026-10-27, Y2 = B: they ship in
// the installer): yt-dlp.exe and ffmpeg.exe, pinned by version and SHA-256,
// fetched into vendor/youtube (gitignored, never committed: ~130 MB) and
// packed by electron-builder as resources/youtube (package.json
// extraResources; electron/youtube.cjs reads them there, and from
// vendor/youtube under desktop:dev and the browser preview).
//
//   node scripts/youtube-tools.cjs     fetch what is missing (npm run youtube:tools)
//
// The installer build runs it too (scripts/before-pack.cjs): without the
// tools it stops, unless KERYX_BUILD_WITHOUT_YOUTUBE=1 says so on purpose (a
// test build; "Baixar para a Mídia" then says the tools did not come).
// A new version: change TOOLS (url, sha256 of the download and of each file
// taken from it) and run it once; yt-dlp also updates itself on each
// computer (electron/youtube.cjs), so the pinned one only needs to be recent.
//
// yt-dlp is in the public domain (The Unlicense). ffmpeg is GPL v3 (Gyan
// Doshi's "essentials" build of FFmpeg 9.0.2): it ships as its own program,
// beside its LICENSE and where its source is (SOURCE.txt).

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { Readable } = require("node:stream");

const DIR = path.join(__dirname, "..", "vendor", "youtube");
const SKIP = "KERYX_BUILD_WITHOUT_YOUTUBE";

const TOOLS = {
    ytdlp: {
        version: "2026.10.26",
        url: "https://github.com/yt-dlp/yt-dlp/releases/download/2026.10.26/yt-dlp.exe",
        sha256: "f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d",
        files: { "yt-dlp.exe": "f5389d3698ecde4ef06f4e6b1ce0294fe9ac1396228c8990b8d3416d6d177a7d" },
    },
    ffmpeg: {
        version: "9.0.2",
        url: "https://github.com/GyanD/codexffmpeg/releases/download/9.0.2/ffmpeg-9.0.2-essentials_build.zip",
        sha256: "60f467265b1e312373dbcd92200c2618a74850f98d3d078e94296bb3fa2047ba",
        // The zip's entry -> the file it becomes here, with its SHA-256.
        zip: {
            "ffmpeg-9.0.2-essentials_build/bin/ffmpeg.exe": ["ffmpeg.exe", "3256173f3f8bffd7df12227c68adf68025edb1832273a9530688a7bb1ed8edec"],
            "ffmpeg-9.0.2-essentials_build/LICENSE": ["ffmpeg-LICENSE.txt", "8ceb4b9ee5adedde47b31e975c1d90c73ad27b6b165a1dcd80c7c545eb65b903"],
        },
    },
};

const SOURCE_TXT = `ffmpeg.exe: FFmpeg ${TOOLS.ffmpeg.version}, the "essentials" build by Gyan Doshi
(${TOOLS.ffmpeg.url}),
licensed under the GNU GPL v3 (ffmpeg-LICENSE.txt). Its source code:
https://ffmpeg.org/releases/ffmpeg-${TOOLS.ffmpeg.version}.tar.xz and the build's configuration at
https://www.gyan.dev/ffmpeg/builds/. KERYX runs it as a separate program only to join the
picture and the sound of a video downloaded with "Baixar para a Mídia".

yt-dlp.exe: yt-dlp ${TOOLS.ytdlp.version} (${TOOLS.ytdlp.url}), public domain (The Unlicense);
source at https://github.com/yt-dlp/yt-dlp. It updates itself on each computer.
`;

const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// The files of `dir` that are missing or not the pinned ones. -> [names]
function missingFiles(dir = DIR, tools = TOOLS) {
    const want = [
        ...Object.entries(tools.ytdlp.files),
        ...Object.values(tools.ffmpeg.zip),
    ];
    return want.filter(([name, hash]) => {
        const file = path.join(dir, name);
        return !fs.existsSync(file) || sha256(file) !== hash;
    }).map(([name]) => name);
}

async function fetchTo(url, file, fetchImpl = fetch) {
    const res = await fetchImpl(url, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`${url}: HTTP ${res.status}`);
    await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(file));
}

function checkHash(file, hash, label) {
    const got = sha256(file);
    if (got !== hash) throw new Error(`${label}: SHA-256 ${got}, esperado ${hash}. O arquivo baixado não é o fixado em scripts/youtube-tools.cjs.`);
}

// The entries of a zip named in `wanted` ({ entry: [name, hash] }) into dir.
async function extract(zipFile, wanted, dir) {
    const yauzl = require("yauzl");
    const zip = await new Promise((resolve, reject) => yauzl.open(zipFile, { lazyEntries: true }, (err, z) => (err ? reject(err) : resolve(z))));
    const left = new Set(Object.keys(wanted));
    try {
        await new Promise((resolve, reject) => {
            zip.on("error", reject);
            zip.on("end", resolve);
            zip.on("entry", (entry) => {
                if (!left.has(entry.fileName)) { zip.readEntry(); return; }
                const [name, hash] = wanted[entry.fileName];
                const target = path.join(dir, name);
                zip.openReadStream(entry, (err, stream) => {
                    if (err) { reject(err); return; }
                    pipeline(stream, fs.createWriteStream(`${target}.partial`)).then(() => {
                        checkHash(`${target}.partial`, hash, name);
                        fs.renameSync(`${target}.partial`, target);
                        left.delete(entry.fileName);
                        zip.readEntry();
                    }).catch(reject);
                });
            });
            zip.readEntry();
        });
        if (left.size) throw new Error(`Faltam no zip do ffmpeg: ${[...left].join(", ")}`);
    } finally {
        zip.close();
    }
}

// Everything in place, fetched where missing. -> { fetched: [names] }
async function ensureTools({ dir = DIR, tools = TOOLS, fetchImpl, log = console.log } = {}) {
    fs.mkdirSync(dir, { recursive: true });
    const missing = missingFiles(dir, tools);
    if (missing.includes("yt-dlp.exe")) {
        log(`  • yt-dlp ${tools.ytdlp.version}`);
        const tmp = path.join(dir, "yt-dlp.exe.partial");
        await fetchTo(tools.ytdlp.url, tmp, fetchImpl);
        checkHash(tmp, tools.ytdlp.sha256, "yt-dlp.exe");
        fs.renameSync(tmp, path.join(dir, "yt-dlp.exe"));
    }
    const fromZip = Object.values(tools.ffmpeg.zip).map(([name]) => name);
    if (missing.some((n) => fromZip.includes(n))) {
        log(`  • ffmpeg ${tools.ffmpeg.version}`);
        const tmp = path.join(dir, "ffmpeg.zip.partial");
        try {
            await fetchTo(tools.ffmpeg.url, tmp, fetchImpl);
            checkHash(tmp, tools.ffmpeg.sha256, "ffmpeg.zip");
            await extract(tmp, tools.ffmpeg.zip, dir);
        } finally {
            fs.rmSync(tmp, { force: true });
        }
    }
    fs.writeFileSync(path.join(dir, "version.json"), `${JSON.stringify({ ytdlp: tools.ytdlp.version, ffmpeg: tools.ffmpeg.version })}\n`);
    fs.writeFileSync(path.join(dir, "SOURCE.txt"), SOURCE_TXT);
    return { fetched: missing };
}

// The installer build's step (before-pack.cjs). -> true with the tools,
// false for a build without them (an empty folder, so extraResources holds).
async function toolsForInstaller({ env = process.env, dir = DIR, ...rest } = {}) {
    if (env[SKIP] === "1") {
        fs.rmSync(dir, { recursive: true, force: true });
        fs.mkdirSync(dir, { recursive: true });
        return false;
    }
    await ensureTools({ dir, ...rest });
    const still = missingFiles(dir);
    if (still.length) throw new Error(`Ferramentas do YouTube incompletas: ${still.join(", ")}. Para um build de teste sem elas, ${SKIP}=1.`);
    return true;
}

module.exports = { TOOLS, DIR, SKIP, missingFiles, ensureTools, toolsForInstaller, sha256 };

if (require.main === module) {
    ensureTools().then(({ fetched }) => console.log(fetched.length ? `Pronto: ${fetched.join(", ")}` : "As ferramentas do YouTube já estavam aqui."), (err) => {
        console.error(err.message);
        process.exitCode = 1;
    });
}
