// The KERYX package (".keryx", owner 2026-10-21, M6 = A): what the selection
// bars' "Exportar…" writes and "Abrir pacote do KERYX…" reads. The rows and
// what they carry are decided by the page (src/lib/keryxPackage.js); here
// the zip is written and read, as archive.cjs writes and reads "Exportar
// tudo":
//
//   <name>.keryx
//     manifest.json    { format: "keryx-pacote", version, app, exportedAt, church, kind, counts, files, left }
//     items.json       { songs, themes, notices, media, materials, backgroundPrefs }
//     media/<file>     the media folder files the rows name
//     fonts/<file>     the church's fonts
//
// Writing goes to "<target>.partial" and is renamed when whole; a file over
// MAX_FILE_BYTES stays out (the mockup's "passou de 1 GB") and is named in
// the manifest's `left`.
//
// A package comes from another church: it is read as untrusted. Opening it
// checks every entry against an allowlist and the caps below (count, each
// file, the whole) and reads only the manifest and the rows; no file is
// written then. The page shows what would come in, and only the files the
// operator's choice needs are taken, one at a time: `fits` first says
// whether they fit on the disk (each lands twice for a moment: unpacked,
// then copied into the media folder), then `take` unpacks one into the
// package's staging folder, copies it into the media folder under a new
// name (mediaImport.cjs) and deletes the unpacked copy. The rows are
// written by the page through the store, so the sync records them. Nothing
// live is ever replaced.
//
// Pure Node (no Electron), so it is unit tested.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const yazl = require("yazl");
const yauzl = require("yauzl");

const FORMAT = "keryx-pacote";
const VERSION = 1;
const FILE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const ENTRY = /^(manifest\.json|items\.json|media\/|fonts\/|(media|fonts)\/[A-Za-z0-9][A-Za-z0-9._-]*)$/;
const MAX_MANIFEST_BYTES = 256 * 1024;
const MAX_ITEMS_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 20000;
// One file (also the export's cap: the same number as MAX_PACKAGE_FILE in
// src/lib/keryxPackage.js) and the whole package, as the zip declares them;
// yauzl checks the bytes against the declared sizes while reading.
const MAX_FILE_BYTES = 1024 ** 3;
const MAX_TOTAL_BYTES = 16 * 1024 ** 3;
const MIN_FREE_BYTES = 512 * 1024 ** 2;
const COMPRESSIBLE = new Set([".json", ".svg", ".txt", ".ttf", ".otf"]);

class PackageError extends Error {
    constructor(message, status = 400) {
        super(message);
        this.name = "PackageError";
        this.status = status;
    }
}

const freeSpaceOf = (dir) => {
    try {
        const st = fs.statfsSync(dir);
        const free = Number(st.bavail) * Number(st.bsize);
        return Number.isFinite(free) ? free : Infinity;
    } catch {
        return Infinity;
    }
};

// manifest: what the page says (kind, counts, church, app); items: the rows;
// files: [{ name, as: "media" | "fonts" }] in the media folder. A file that
// is not there (the sync has not brought it, it was moved) or is over
// maxFile is left out and said in `missing` / `tooBig` (and the manifest's
// `left`); the importer then marks what used it.
// -> { file, bytes, files, missing, tooBig }
async function writePackage({ target, manifest = {}, items = {}, files = [], mediaDir, now = new Date(), maxFile = MAX_FILE_BYTES }) {
    const partial = `${target}.partial`;
    fs.rmSync(partial, { force: true });
    const missing = [];
    const tooBig = [];
    const sizes = {};
    const left = {};
    const add = [];
    const seen = new Set();
    for (const f of Array.isArray(files) ? files : []) {
        const name = String(f?.name || "");
        const as = f?.as === "fonts" ? "fonts" : "media";
        if (!FILE_NAME.test(name) || seen.has(name)) continue;
        seen.add(name);
        const from = path.join(mediaDir, name);
        let st = null;
        try { st = fs.statSync(from); } catch { st = null; }
        if (!st || !st.isFile()) { missing.push(name); left[name] = "missing"; continue; }
        if (st.size > maxFile) { tooBig.push(name); left[name] = "big"; continue; }
        sizes[`${as}/${name}`] = st.size;
        add.push({ from, entry: `${as}/${name}` });
    }
    const head = {
        ...(manifest && typeof manifest === "object" ? manifest : {}),
        format: FORMAT,
        version: VERSION,
        exportedAt: manifest?.exportedAt || now.toISOString(),
        files: sizes,
        left,
    };
    try {
        const zip = new yazl.ZipFile();
        zip.addBuffer(Buffer.from(JSON.stringify(head, null, 2)), "manifest.json");
        zip.addBuffer(Buffer.from(JSON.stringify(items)), "items.json");
        for (const { from, entry } of add) zip.addFile(from, entry, { compress: COMPRESSIBLE.has(path.extname(entry).toLowerCase()) });
        zip.end();
        await pipeline(zip.outputStream, fs.createWriteStream(partial));
        fs.renameSync(partial, target);
        return { file: target, bytes: fs.statSync(target).size, files: add.length, missing, tooBig };
    } finally {
        fs.rmSync(partial, { force: true });
    }
}

function openZip(file) {
    return new Promise((resolve, reject) => {
        yauzl.open(file, { lazyEntries: true }, (err, zip) => (err ? reject(new PackageError("Este arquivo não é um pacote do KERYX (não é um zip).")) : resolve(zip)));
    });
}
const openEntry = (zip, entry) => new Promise((resolve, reject) => zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream))));
async function readAll(stream, limit, what) {
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > limit) throw new PackageError(`O pacote é inválido (${what} grande demais).`);
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

// The zip library's own errors (no .code, unlike file-system errors) in pt-BR.
function asPackageError(err) {
    if (err instanceof SyntaxError) return new PackageError("O pacote é inválido (não dá para ler a lista de itens).");
    if (!(err instanceof PackageError) && !err.code) {
        return new PackageError(/invalid relative path/.test(err.message)
            ? "O pacote contém um item inesperado. Abra apenas pacotes do KERYX."
            : "O pacote está danificado ou incompleto.");
    }
    return err;
}

// Walks the entries of a package, checking each against the allowlist;
// `onEntry(entry, zip)` returns true to stop there.
async function walk(zipFile, onEntry, { maxEntries = MAX_ENTRIES } = {}) {
    const zip = await openZip(zipFile);
    try {
        if (zip.entryCount > maxEntries) throw new PackageError("O pacote tem itens demais para ser do KERYX.");
        await new Promise((resolve, reject) => {
            zip.on("error", reject);
            zip.on("end", resolve);
            zip.on("entry", async (entry) => {
                try {
                    if (!ENTRY.test(entry.fileName)) throw new PackageError(`O pacote contém um item inesperado (${entry.fileName.slice(0, 60)}). Abra apenas pacotes do KERYX.`);
                    if (await onEntry(entry, zip)) resolve();
                    else zip.readEntry();
                } catch (err) {
                    reject(err);
                }
            });
            zip.readEntry();
        });
    } catch (err) {
        throw asPackageError(err);
    } finally {
        zip.close();
    }
}

// Reads a package's manifest and rows, and the size each file declares;
// no file is written. -> { manifest, items, files: ["media/x", …], sizes:
// { "media/x": bytes }, total, bytes }
async function readPackage({ zipFile, maxEntries = MAX_ENTRIES, maxFile = MAX_FILE_BYTES, maxTotal = MAX_TOTAL_BYTES }) {
    let bytes = 0;
    try { bytes = fs.statSync(zipFile).size; } catch { throw new PackageError("O pacote não foi encontrado.", 404); }
    let manifest = null;
    let items = null;
    const sizes = {};
    let total = 0;
    await walk(zipFile, async (entry, zip) => {
        const name = entry.fileName;
        if (name.endsWith("/")) return false;
        if (name === "manifest.json") manifest = JSON.parse((await readAll(await openEntry(zip, entry), MAX_MANIFEST_BYTES, "manifest")).toString("utf8"));
        else if (name === "items.json") items = JSON.parse((await readAll(await openEntry(zip, entry), MAX_ITEMS_BYTES, "lista de itens")).toString("utf8"));
        else {
            const size = Number(entry.uncompressedSize) || 0;
            if (size > maxFile) throw new PackageError(`O pacote tem um arquivo grande demais (${name.slice(name.indexOf("/") + 1, 60)}). Abra apenas pacotes do KERYX.`);
            total += size;
            if (total > maxTotal) throw new PackageError("O pacote é grande demais para ser do KERYX.");
            sizes[name] = size;
        }
        return false;
    }, { maxEntries });
    if (!manifest || manifest.format !== FORMAT) throw new PackageError("Este arquivo não é um pacote do KERYX.");
    if (Number(manifest.version) > VERSION) throw new PackageError("Este pacote foi feito por uma versão mais nova do KERYX. Atualize o KERYX e tente de novo.");
    if (!items || typeof items !== "object" || Array.isArray(items)) throw new PackageError("O pacote não tem a lista de itens.");
    return { manifest, items, files: Object.keys(sizes), sizes, total, bytes };
}

// Whether the files chosen fit: all of them in the media folder, plus the
// largest unpacked for a moment beside its copy, plus the reserve.
// -> { ok, need, free }
function fitsOn({ sizes, entries, free, minFree = MIN_FREE_BYTES }) {
    const list = (entries || []).map((e) => sizes[e] || 0);
    const need = list.reduce((a, b) => a + b, 0) + Math.max(0, ...list) + minFree;
    return { ok: need <= free, need, free };
}

// Unpacks one entry ("media/<file>" or "fonts/<file>") to `dir`. -> its path
async function unpackEntry({ zipFile, entry, dir, maxFile = MAX_FILE_BYTES }) {
    const m = /^(media|fonts)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(String(entry || ""));
    if (!m) throw new PackageError("Este arquivo não está no pacote aberto.", 404);
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, m[2]);
    let found = false;
    try {
        await walk(zipFile, async (e, zip) => {
            if (e.fileName !== entry) return false;
            if ((Number(e.uncompressedSize) || 0) > maxFile) throw new PackageError("O arquivo do pacote é grande demais.");
            await pipeline(await openEntry(zip, e), fs.createWriteStream(out));
            found = true;
            return true;
        });
    } catch (err) {
        fs.rmSync(out, { force: true });
        throw err;
    }
    if (!found) throw new PackageError("Este arquivo não está no pacote aberto.", 404);
    return out;
}

// The packages a window has open, under `root` (<dataDir>/pacotes, removed
// at launch): each remembers its zip (deleted on close when it is the
// package's own copy, as the preview's upload is) and a staging folder for
// the file being taken. importMedia copies a file into the media folder.
function createPackages({ root, mediaDir, importMedia, freeSpace = freeSpaceOf, log = () => {}, limits = {} }) {
    const open = new Map();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (err) { log(`[keryx-package] cleanup: ${err && err.message}`); }
    const get = (id) => {
        const p = open.get(id);
        if (!p) throw new PackageError("O pacote não está mais aberto.", 404);
        return p;
    };
    const close = (id) => {
        const p = open.get(id);
        open.delete(id);
        if (p) {
            fs.rmSync(p.dir, { recursive: true, force: true });
            if (p.owned) fs.rmSync(p.zipFile, { force: true });
        }
        return true;
    };
    return {
        write: (args) => writePackage({ ...args, mediaDir, ...(limits.maxFile ? { maxFile: limits.maxFile } : {}) }),
        // owned: the zip is the package's own copy (deleted on close).
        async open(zipFile, { owned = false } = {}) {
            try {
                const read = await readPackage({ zipFile, ...limits });
                const id = crypto.randomUUID();
                open.set(id, { zipFile, owned, dir: path.join(root, id), sizes: read.sizes });
                return { id, ...read };
            } catch (err) {
                if (owned) fs.rmSync(zipFile, { force: true });
                throw err;
            }
        },
        fits(id, entries) {
            const p = get(id);
            fs.mkdirSync(root, { recursive: true });
            return fitsOn({ sizes: p.sizes, entries, free: freeSpace(fs.existsSync(mediaDir) ? mediaDir : root) });
        },
        async take(id, entry) {
            const p = get(id);
            if (!(entry in p.sizes)) throw new PackageError("Este arquivo não está no pacote aberto.", 404);
            const file = await unpackEntry({ zipFile: p.zipFile, entry, dir: p.dir, ...(limits.maxFile ? { maxFile: limits.maxFile } : {}) });
            try {
                const res = await importMedia({ mediaDir, sourcePath: file, name: path.basename(file) });
                if (res.error) throw new PackageError(res.error.message, res.error.status);
                return res.data;
            } finally {
                fs.rmSync(file, { force: true });
            }
        },
        close,
    };
}

module.exports = { FORMAT, VERSION, MAX_FILE_BYTES, MAX_TOTAL_BYTES, PackageError, writePackage, readPackage, fitsOn, unpackEntry, createPackages };
