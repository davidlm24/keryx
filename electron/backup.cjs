// Automatic backups of keryx.db: one file per day, newest 14 kept, plus a
// mirror of the media folder (mirrorMedia). Pure Node (no Electron), so it
// is unit tested.

const fs = require("node:fs");
const path = require("node:path");

const KEEP = 14;
const NAME = /^keryx-(\d{4}-\d{2}-\d{2})\.db$/;

const pad = (n) => String(n).padStart(2, "0");
const dayStamp = (date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function listBackups(dir) {
    let names;
    try {
        names = fs.readdirSync(dir);
    } catch {
        return [];
    }
    return names
        .filter((n) => NAME.test(n))
        .sort()
        .reverse()
        .map((name) => {
            const stat = fs.statSync(path.join(dir, name));
            return { name, file: path.join(dir, name), day: NAME.exec(name)[1], size: stat.size, modified: stat.mtime.toISOString() };
        });
}

// Writes keryx-YYYY-MM-DD.db (replacing today's earlier one) and prunes.
// The copy lands under a temporary name first, so a crash or a full disk
// never leaves a half-written file where a good backup used to be.
function runBackup({ store, dir, now = new Date(), keep = KEEP }) {
    fs.mkdirSync(dir, { recursive: true });
    const final = path.join(dir, `keryx-${dayStamp(now)}.db`);
    const temp = `${final}.partial`;
    fs.rmSync(temp, { force: true });
    try {
        store.backupTo(temp);
        fs.renameSync(temp, final);
    } catch (err) {
        fs.rmSync(temp, { force: true });
        throw err;
    }
    const removed = [];
    for (const old of listBackups(dir).slice(keep)) {
        fs.rmSync(old.file, { force: true });
        removed.push(old.name);
    }
    return { file: final, removed };
}

// The media folder mirrored into <dir>/media: only files that are new or
// changed (size or modification time) are copied, so after the first run a
// backup costs only what was added since. A file deleted from KERYX stays in
// the mirror: a backup never throws away what a church may want back. Each
// copy lands under a temporary name first and keeps the source's times.
const MEDIA_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

async function mirrorMedia({ mediaDir, dir }) {
    const target = path.join(dir, "media");
    await fs.promises.mkdir(target, { recursive: true });
    let entries = [];
    try {
        entries = await fs.promises.readdir(mediaDir, { withFileTypes: true });
    } catch { /* no media yet */ }
    const result = { files: 0, copied: 0, bytes: 0, failed: [] };
    for (const e of entries) {
        if (!e.isFile() || !MEDIA_NAME.test(e.name)) continue;
        result.files += 1;
        const from = path.join(mediaDir, e.name);
        const to = path.join(target, e.name);
        try {
            const src = await fs.promises.stat(from);
            const dst = await fs.promises.stat(to).catch(() => null);
            if (dst && dst.size === src.size && Math.abs(dst.mtimeMs - src.mtimeMs) < 2000) continue;
            const temp = `${to}.partial`;
            await fs.promises.copyFile(from, temp);
            await fs.promises.utimes(temp, src.atime, src.mtime);
            await fs.promises.rename(temp, to);
            result.copied += 1;
            result.bytes += src.size;
        } catch (err) {
            await fs.promises.rm(`${to}.partial`, { force: true }).catch(() => {});
            result.failed.push({ name: e.name, error: err.message });
        }
    }
    return result;
}

// What the mirror holds: number of files and bytes.
function mirrorStats(dir) {
    const target = path.join(dir, "media");
    let names = [];
    try {
        names = fs.readdirSync(target).filter((n) => MEDIA_NAME.test(n) && !n.endsWith(".partial"));
    } catch {
        return { files: 0, bytes: 0 };
    }
    let bytes = 0;
    for (const n of names) {
        try { bytes += fs.statSync(path.join(target, n)).size; } catch { /* vanished */ }
    }
    return { files: names.length, bytes };
}

module.exports = { KEEP, listBackups, runBackup, dayStamp, mirrorMedia, mirrorStats };
