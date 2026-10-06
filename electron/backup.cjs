// Automatic backups of keryx.db: one file per day, newest 14 kept.
// Pure Node (no Electron), so it is unit tested.
//
// A backup is the database only. Uploaded media is not copied every launch
// (videos are large); "Exportar tudo" (archive.cjs) includes it.

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

module.exports = { KEEP, listBackups, runBackup, dayStamp };
