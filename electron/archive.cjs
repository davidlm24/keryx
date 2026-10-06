// "Exportar tudo" / "Importar": the database plus the media folder in one zip.
//
//   keryx-export.zip
//     manifest.json         { format, version, app, exportedAt, counts }
//     keryx.db              a consistent copy of the database
//     media/<file>          every uploaded file
//
// Import never touches the live database (it is open, and on Windows open
// files cannot be replaced). It validates the zip, extracts it into
// <dataDir>/pending-import/ and the next launch swaps it in before the
// database is opened (applyPendingImport). The data it replaces is moved to
// <dataDir>/before-import-<time>/, never deleted.
//
// Pure Node (no Electron), so it is unit tested.

const fs = require("node:fs");
const path = require("node:path");
const { pipeline } = require("node:stream/promises");
const { DatabaseSync } = require("node:sqlite");
const yazl = require("yazl");
const yauzl = require("yauzl");

const FORMAT = "keryx-export";
const VERSION = 1;
const PENDING = "pending-import";
const MAX_MANIFEST_BYTES = 64 * 1024;
const ENTRY = /^(manifest\.json|keryx\.db|media\/|media\/[A-Za-z0-9][A-Za-z0-9._-]*)$/;

class ArchiveError extends Error {
    constructor(message) {
        super(message);
        this.name = "ArchiveError";
    }
}

const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\..*$/, "").replace("T", "-");

// Already-compressed media is stored as is; recompressing a 500 MB video
// costs minutes and saves nothing.
const COMPRESSIBLE = new Set([".db", ".json", ".svg", ".txt"]);

async function exportAll({ store, mediaDir, target, appVersion = "0", now = new Date() }) {
    const dbCopy = `${target}.db.partial`;
    const partial = `${target}.partial`;
    fs.rmSync(dbCopy, { force: true });
    fs.rmSync(partial, { force: true });
    try {
        store.backupTo(dbCopy);
        const mediaFiles = fs.existsSync(mediaDir)
            ? fs.readdirSync(mediaDir, { withFileTypes: true }).filter((e) => e.isFile() && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(e.name))
            : [];

        const zip = new yazl.ZipFile();
        zip.addBuffer(Buffer.from(JSON.stringify({
            format: FORMAT,
            version: VERSION,
            app: appVersion,
            exportedAt: now.toISOString(),
            counts: { media: mediaFiles.length },
        }, null, 2)), "manifest.json");
        zip.addFile(dbCopy, "keryx.db");
        for (const file of mediaFiles) {
            const compress = COMPRESSIBLE.has(path.extname(file.name).toLowerCase());
            zip.addFile(path.join(mediaDir, file.name), `media/${file.name}`, { compress });
        }
        zip.end();
        await pipeline(zip.outputStream, fs.createWriteStream(partial));
        fs.renameSync(partial, target);
        return { file: target, media: mediaFiles.length, bytes: fs.statSync(target).size };
    } finally {
        fs.rmSync(dbCopy, { force: true });
        fs.rmSync(partial, { force: true });
    }
}

function openZip(file) {
    return new Promise((resolve, reject) => {
        yauzl.open(file, { lazyEntries: true }, (err, zip) => (err ? reject(new ArchiveError("O arquivo não é um zip válido.")) : resolve(zip)));
    });
}

const openEntry = (zip, entry) => new Promise((resolve, reject) => zip.openReadStream(entry, (err, stream) => (err ? reject(err) : resolve(stream))));

async function readAll(stream, limit) {
    const chunks = [];
    let size = 0;
    for await (const chunk of stream) {
        size += chunk.length;
        if (size > limit) throw new ArchiveError("O arquivo de exportação é inválido (manifest grande demais).");
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function checkDatabase(file) {
    let db;
    try {
        db = new DatabaseSync(file, { readOnly: true });
        const ok = db.prepare("PRAGMA quick_check").get();
        if (!ok || Object.values(ok)[0] !== "ok") throw new Error("quick_check failed");
        db.prepare("SELECT 1 FROM profile LIMIT 1").get();
        db.prepare("SELECT 1 FROM song LIMIT 1").get();
    } catch {
        throw new ArchiveError("O banco de dados dentro do arquivo está corrompido ou não é do KERYX.");
    } finally {
        if (db) db.close();
    }
}

// Validates the zip and extracts it to <dataDir>/pending-import/. Nothing
// live is changed. Returns { media, manifest }.
async function stageImport({ zipFile, dataDir }) {
    const staging = path.join(dataDir, PENDING);
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(path.join(staging, "media"), { recursive: true });

    const zip = await openZip(zipFile);
    let manifest = null;
    let hasDb = false;
    let media = 0;
    try {
        await new Promise((resolve, reject) => {
            zip.on("error", reject);
            zip.on("end", resolve);
            zip.on("entry", async (entry) => {
                try {
                    const name = entry.fileName;
                    if (!ENTRY.test(name)) throw new ArchiveError(`O arquivo contém um item inesperado (${name.slice(0, 60)}). Importe apenas exportações do KERYX.`);
                    if (!name.endsWith("/")) {
                        const stream = await openEntry(zip, entry);
                        if (name === "manifest.json") {
                            manifest = JSON.parse((await readAll(stream, MAX_MANIFEST_BYTES)).toString("utf8"));
                        } else {
                            await pipeline(stream, fs.createWriteStream(path.join(staging, name)));
                            if (name === "keryx.db") hasDb = true;
                            else media++;
                        }
                    }
                    zip.readEntry();
                } catch (err) {
                    reject(err);
                }
            });
            zip.readEntry();
        });
    } catch (err) {
        fs.rmSync(staging, { recursive: true, force: true });
        if (err instanceof SyntaxError) throw new ArchiveError("O arquivo de exportação é inválido (manifest ilegível).");
        // The zip library's own errors (no .code, unlike file-system errors).
        if (!(err instanceof ArchiveError) && !err.code) {
            throw new ArchiveError(/invalid relative path/.test(err.message)
                ? "O arquivo contém um item inesperado. Importe apenas exportações do KERYX."
                : "O arquivo zip está danificado ou incompleto.");
        }
        throw err;
    } finally {
        zip.close();
    }

    try {
        if (!manifest || manifest.format !== FORMAT) throw new ArchiveError("Este arquivo não é uma exportação do KERYX.");
        if (manifest.version > VERSION) throw new ArchiveError("Esta exportação foi feita por uma versão mais nova do KERYX. Atualize o KERYX e tente de novo.");
        if (!hasDb) throw new ArchiveError("A exportação não contém o banco de dados.");
        checkDatabase(path.join(staging, "keryx.db"));
    } catch (err) {
        fs.rmSync(staging, { recursive: true, force: true });
        throw err;
    }
    return { media, manifest };
}

function discardPendingImport(dataDir) {
    fs.rmSync(path.join(dataDir, PENDING), { recursive: true, force: true });
}

function hasPendingImport(dataDir) {
    return fs.existsSync(path.join(dataDir, PENDING, "keryx.db"));
}

// Call at startup, before the database is opened. Returns null when nothing
// is pending, else { archived }.
function applyPendingImport(dataDir, now = new Date()) {
    const staging = path.join(dataDir, PENDING);
    if (!hasPendingImport(dataDir)) return null;

    const archived = path.join(dataDir, `before-import-${stamp(now)}`);
    fs.mkdirSync(archived, { recursive: true });
    const live = ["keryx.db", "keryx.db-wal", "keryx.db-shm", "media"].filter((n) => fs.existsSync(path.join(dataDir, n)));
    const moved = []; // live items now in `archived`
    const placed = []; // imported items now in dataDir
    try {
        for (const n of live) {
            fs.renameSync(path.join(dataDir, n), path.join(archived, n));
            moved.push(n);
        }
        for (const n of ["keryx.db", "media"]) {
            fs.renameSync(path.join(staging, n), path.join(dataDir, n));
            placed.push(n);
        }
    } catch (err) {
        // Put everything back so the app opens on the data it had. Only what
        // this function put in place is removed; the live data is never deleted.
        for (const n of placed) fs.rmSync(path.join(dataDir, n), { recursive: true, force: true });
        for (const n of moved) {
            try {
                fs.renameSync(path.join(archived, n), path.join(dataDir, n));
            } catch { /* best effort */ }
        }
        try {
            fs.rmdirSync(archived);
        } catch { /* not empty: something could not be restored; keep it */ }
        throw err;
    }
    fs.rmSync(staging, { recursive: true, force: true });
    return { archived };
}

module.exports = { ArchiveError, FORMAT, exportAll, stageImport, applyPendingImport, discardPendingImport, hasPendingImport };
