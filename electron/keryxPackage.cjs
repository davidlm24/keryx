// The KERYX package (".keryx", owner 2026-10-21, M6 = A): what the selection
// bars' "Exportar…" writes and "Abrir pacote do KERYX…" reads. The rows and
// what they carry are decided by the page (src/lib/keryxPackage.js); here
// the zip is written and read, as archive.cjs writes and reads "Exportar
// tudo":
//
//   <name>.keryx
//     manifest.json    { format: "keryx-pacote", version, app, exportedAt, church, kind, counts, files }
//     items.json       { songs, themes, notices, media, materials, backgroundPrefs }
//     media/<file>     the media folder files the rows name
//     fonts/<file>     the church's fonts
//
// Writing goes to "<target>.partial" and is renamed when whole. Reading
// checks every entry against an allowlist and the caps below before a
// byte is written, extracts the files into a staging folder of their own
// and gives the page the rows; the page then copies each file it needs into
// the media folder (mediaImport.cjs, a new name) and writes the rows through
// the store, so the sync records them. Nothing live is ever replaced.
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
// is not there (the sync has not brought it, it was moved) is left out and
// said in `missing`; the importer then marks what used it.
// -> { file, bytes, files, missing }
async function writePackage({ target, manifest = {}, items = {}, files = [], mediaDir, now = new Date() }) {
    const partial = `${target}.partial`;
    fs.rmSync(partial, { force: true });
    const missing = [];
    const sizes = {};
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
        if (!st || !st.isFile()) { missing.push(name); continue; }
        sizes[`${as}/${name}`] = st.size;
        add.push({ from, entry: `${as}/${name}` });
    }
    const head = {
        ...(manifest && typeof manifest === "object" ? manifest : {}),
        format: FORMAT,
        version: VERSION,
        exportedAt: manifest?.exportedAt || now.toISOString(),
        files: sizes,
    };
    try {
        const zip = new yazl.ZipFile();
        zip.addBuffer(Buffer.from(JSON.stringify(head, null, 2)), "manifest.json");
        zip.addBuffer(Buffer.from(JSON.stringify(items)), "items.json");
        for (const { from, entry } of add) zip.addFile(from, entry, { compress: COMPRESSIBLE.has(path.extname(entry).toLowerCase()) });
        zip.end();
        await pipeline(zip.outputStream, fs.createWriteStream(partial));
        fs.renameSync(partial, target);
        return { file: target, bytes: fs.statSync(target).size, files: add.length, missing };
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

// Reads a package into `dir` (made empty first): the manifest and the rows
// come back, the files stay there for takeFile. -> { manifest, items,
// files: ["media/x", …], bytes }
async function readPackage({ zipFile, dir, freeSpace = freeSpaceOf, maxEntries = MAX_ENTRIES, minFree = MIN_FREE_BYTES }) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "media"), { recursive: true });
    fs.mkdirSync(path.join(dir, "fonts"), { recursive: true });
    let bytes = 0;
    try { bytes = fs.statSync(zipFile).size; } catch { throw new PackageError("O pacote não foi encontrado.", 404); }
    const zip = await openZip(zipFile);
    let manifest = null;
    let items = null;
    const files = [];
    try {
        if (zip.entryCount > maxEntries) throw new PackageError("O pacote tem itens demais para ser do KERYX.");
        await new Promise((resolve, reject) => {
            zip.on("error", reject);
            zip.on("end", resolve);
            zip.on("entry", async (entry) => {
                try {
                    const name = entry.fileName;
                    if (!ENTRY.test(name)) throw new PackageError(`O pacote contém um item inesperado (${name.slice(0, 60)}). Abra apenas pacotes do KERYX.`);
                    if (!name.endsWith("/")) {
                        const stream = await openEntry(zip, entry);
                        if (name === "manifest.json") manifest = JSON.parse((await readAll(stream, MAX_MANIFEST_BYTES, "manifest")).toString("utf8"));
                        else if (name === "items.json") items = JSON.parse((await readAll(stream, MAX_ITEMS_BYTES, "lista de itens")).toString("utf8"));
                        else {
                            const size = Number(entry.uncompressedSize) || 0;
                            if (size + minFree > freeSpace(dir)) throw new PackageError("Não há espaço livre no disco para abrir este pacote. Libere espaço e tente de novo.", 507);
                            await pipeline(stream, fs.createWriteStream(path.join(dir, name)));
                            files.push(name);
                        }
                    }
                    zip.readEntry();
                } catch (err) {
                    reject(err);
                }
            });
            zip.readEntry();
        });
        if (!manifest || manifest.format !== FORMAT) throw new PackageError("Este arquivo não é um pacote do KERYX.");
        if (Number(manifest.version) > VERSION) throw new PackageError("Este pacote foi feito por uma versão mais nova do KERYX. Atualize o KERYX e tente de novo.");
        if (!items || typeof items !== "object" || Array.isArray(items)) throw new PackageError("O pacote não tem a lista de itens.");
    } catch (err) {
        fs.rmSync(dir, { recursive: true, force: true });
        if (err instanceof SyntaxError) throw new PackageError("O pacote é inválido (não dá para ler a lista de itens).");
        if (!(err instanceof PackageError) && !err.code) {
            throw new PackageError(/invalid relative path/.test(err.message)
                ? "O pacote contém um item inesperado. Abra apenas pacotes do KERYX."
                : "O pacote está danificado ou incompleto.");
        }
        throw err;
    } finally {
        zip.close();
    }
    return { manifest, items, files, bytes };
}

// A file extracted by readPackage, by its entry name: only "media/<file>"
// or "fonts/<file>" inside `dir`. -> its path, or null.
function stagedFile(dir, entry) {
    const m = /^(media|fonts)\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(String(entry || ""));
    if (!m) return null;
    const file = path.join(dir, m[1], m[2]);
    try { return fs.statSync(file).isFile() ? file : null; } catch { return null; }
}

// The packages a window has open: one staging folder each under `root`
// (<dataDir>/pacotes), all removed at launch and when the window closes
// the dialog. importMedia copies a file into the media folder.
function createPackages({ root, mediaDir, importMedia, log = () => {} }) {
    const open = new Map();
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (err) { log(`[keryx-package] cleanup: ${err && err.message}`); }
    return {
        write: (args) => writePackage({ ...args, mediaDir }),
        async open(zipFile) {
            const id = crypto.randomUUID();
            const dir = path.join(root, id);
            const read = await readPackage({ zipFile, dir });
            open.set(id, dir);
            return { id, ...read };
        },
        async take(id, entry) {
            const dir = open.get(id);
            const file = dir && stagedFile(dir, entry);
            if (!file) throw new PackageError("Este arquivo não está no pacote aberto.", 404);
            const res = await importMedia({ mediaDir, sourcePath: file, name: path.basename(file) });
            if (res.error) throw new PackageError(res.error.message, res.error.status);
            return res.data;
        },
        close(id) {
            const dir = open.get(id);
            open.delete(id);
            if (dir) fs.rmSync(dir, { recursive: true, force: true });
            return true;
        },
    };
}

module.exports = { FORMAT, VERSION, PackageError, writePackage, readPackage, stagedFile, createPackages };
