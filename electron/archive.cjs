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

// "Restaurar um backup": a daily backup (keryx-YYYY-MM-DD.db) staged like an
// import, so the next launch swaps it in and keeps today's data in
// before-import-<time>/. The media folder staged with it is today's (hard
// links: instant, no extra space; a copy where links are not possible) plus
// whatever only the backup's media mirror still has (files deleted since),
// so the songs and avisos brought back find their files. Returns
// { media, fromBackup }.
const MEDIA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

async function stageRestore({ dataDir, dbFile, mediaDir, mirrorDir = null }) {
    const staging = path.join(dataDir, PENDING);
    const target = path.join(staging, "media");
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(target, { recursive: true });
    const names = (dir) => {
        try {
            return fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && MEDIA_NAME.test(e.name) && !e.name.endsWith(".partial")).map((e) => e.name);
        } catch {
            return [];
        }
    };
    try {
        await fs.promises.copyFile(dbFile, path.join(staging, "keryx.db"));
        try {
            checkDatabase(path.join(staging, "keryx.db"));
        } catch {
            throw new ArchiveError("Este backup está corrompido ou não é do KERYX. Escolha outro dia.");
        }
        let media = 0;
        let fromBackup = 0;
        for (const name of names(mediaDir)) {
            const from = path.join(mediaDir, name);
            const to = path.join(target, name);
            try {
                fs.linkSync(from, to);
            } catch {
                await fs.promises.copyFile(from, to);
            }
            media += 1;
        }
        if (mirrorDir) {
            for (const name of names(mirrorDir)) {
                const to = path.join(target, name);
                if (fs.existsSync(to)) continue;
                await fs.promises.copyFile(path.join(mirrorDir, name), to);
                media += 1;
                fromBackup += 1;
            }
        }
        return { media, fromBackup };
    } catch (err) {
        fs.rmSync(staging, { recursive: true, force: true });
        throw err;
    }
}

function discardPendingImport(dataDir) {
    fs.rmSync(path.join(dataDir, PENDING), { recursive: true, force: true });
}

function hasPendingImport(dataDir) {
    return fs.existsSync(path.join(dataDir, PENDING, "keryx.db"));
}

// The computer's sync id (_meta.pc_id, store.cjs) belongs to the computer,
// not to the data: an export imported on another computer, or a backup
// restored there, would otherwise bring the first one's id and both would
// write the same folder of the sync (docs/desktop-architecture.md §8b). The
// staged database takes the id of the database it replaces; with none here,
// it loses its own and the store makes a new one. Returns "kept" | "new".
function keepComputerId(stagedDb, liveDb) {
    let liveId = null;
    if (fs.existsSync(liveDb)) {
        let db;
        try {
            db = new DatabaseSync(liveDb, { readOnly: true });
            liveId = db.prepare("SELECT value FROM _meta WHERE key = 'pc_id'").get()?.value || null;
        } catch { /* no _meta yet (before 0.2.18): a new id */ } finally {
            if (db) db.close();
        }
    }
    const db = new DatabaseSync(stagedDb);
    try {
        db.exec("CREATE TABLE IF NOT EXISTS _meta (key TEXT PRIMARY KEY, value TEXT)");
        if (liveId) db.prepare("INSERT OR REPLACE INTO _meta (key, value) VALUES ('pc_id', ?)").run(liveId);
        else db.prepare("DELETE FROM _meta WHERE key = 'pc_id'").run();
    } finally {
        db.close();
    }
    return liveId ? "kept" : "new";
}

// Call at startup, before the database is opened. Returns null when nothing
// is pending, else { archived, pcId: "kept" | "new" | "failed" }.
function applyPendingImport(dataDir, now = new Date()) {
    const staging = path.join(dataDir, PENDING);
    if (!hasPendingImport(dataDir)) return null;
    let pcId;
    try {
        pcId = keepComputerId(path.join(staging, "keryx.db"), path.join(dataDir, "keryx.db"));
    } catch {
        pcId = "failed"; // the import still goes ahead; main logs it
    }

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
    return { archived, pcId };
}

module.exports = { ArchiveError, FORMAT, exportAll, stageImport, stageRestore, applyPendingImport, discardPendingImport, hasPendingImport };
