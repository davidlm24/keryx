// The `folder` adapter (index.cjs): a folder that Google Drive para
// computador (or OneDrive, Dropbox) keeps in step, laid out as KERYX 0.2.21
// and earlier wrote it, so computers on an older version keep syncing with
// this one through the same folder until the folder mode goes:
//
//   <folder>/sync/keryx-sync.json            keryx-sync.json
//   <folder>/sync/<pc>/changes-000001.jsonl  changes/<pc>/000001.jsonl
//   <folder>/sync/<pc>/computer.json         computers/<pc>.json
//   <folder>/sync/<pc>/state.json            state/<pc>.json
//   <folder>/sync/media/<file>               media/<file>
//
// An object's id is its path under sync/ ("<pc dir>/changes-000001.jsonl"),
// which is also the key an older KERYX kept its byte cursor under. Copies the
// sync services make ("<pc> (1)/", "changes-000003 (1).jsonl", Dropbox's
// "… conflicted copy …") are listed under the same name as the original, as
// Drive lists two objects of one name; a computer on an older version keeps
// appending to its changes files, which the engine reads by a cursor
// (sync.cjs). Nothing here makes the folder itself: missing, it is a drive
// not mounted or a sync service not running.

const fs = require("node:fs");
const path = require("node:path");
const { PC_DIR, changesName } = require("./rules.cjs");

const fsp = fs.promises;

const SYNC_DIR = "sync";
const MEDIA_DIR = "media";
const PAIRING_FILE = "keryx-sync.json";
const COMPUTER_FILE = "computer.json";
const STATE_FILE = "state.json";
// "changes-000003.jsonl" and every name the services give copies of it.
const ANY_CHANGES = /^changes-(\d+)(?!\d).*\.jsonl$/i;

async function statOf(file) {
    try {
        return await fsp.stat(file);
    } catch {
        return null;
    }
}

const describeStat = (id, name, st) => ({ id, name, size: st.size, created: st.birthtimeMs || st.mtimeMs, modified: st.mtimeMs, props: {} });

function createFolderStore(folder) {
    const root = path.resolve(String(folder));
    const syncDir = path.join(root, SYNC_DIR);
    const full = (id) => path.join(syncDir, ...String(id).split("/"));

    // The path an engine name is written to.
    function pathOf(name) {
        const s = String(name);
        if (s === PAIRING_FILE) return PAIRING_FILE;
        let m = /^media\/([^/]+)$/.exec(s);
        if (m) return `${MEDIA_DIR}/${m[1]}`;
        m = /^changes\/([0-9a-f-]{36})\/(\d+)\.jsonl$/.exec(s);
        if (m) return `${m[1]}/changes-${m[2]}.jsonl`;
        m = /^(computers|state)\/([0-9a-f-]{36})\.json$/.exec(s);
        if (m) return `${m[2]}/${m[1] === "computers" ? COMPUTER_FILE : STATE_FILE}`;
        throw new Error(`nome fora da sincronização: ${s}`);
    }

    // Every object whose name starts with prefix: only the folders and files
    // the prefix can name are looked at. `quick`: names only (size,
    // created and modified null), no stat per file — a folder Drive para
    // computador keeps holds thousands of them, and the engine stats only
    // the ones it has not read to their end (stat()).
    async function list(prefix = "", { quick = false } = {}) {
        const p = String(prefix);
        const out = [];
        const add = async (id, name) => {
            if (quick) {
                out.push({ id, name, size: null, created: null, modified: null, props: {} });
                return;
            }
            const st = await statOf(full(id));
            if (st && st.isFile()) out.push(describeStat(id, name, st));
        };
        if (PAIRING_FILE.startsWith(p)) await add(PAIRING_FILE, PAIRING_FILE);
        if ("media/".startsWith(p) || p.startsWith("media/")) {
            for (const n of await fsp.readdir(path.join(syncDir, MEDIA_DIR)).catch(() => [])) {
                if (n.startsWith(".") || n.endsWith(".partial")) continue;
                const name = `media/${n}`;
                if (name.startsWith(p)) await add(`${MEDIA_DIR}/${n}`, name);
            }
        }
        const kinds = ["changes/", "computers/", "state/"].filter((k) => k.startsWith(p) || p.startsWith(k));
        if (!kinds.length) return out;
        for (const d of await fsp.readdir(syncDir, { withFileTypes: true }).catch(() => [])) {
            const m = d.isDirectory() && PC_DIR.exec(d.name);
            if (!m) continue;
            const pc = m[1].toLowerCase();
            for (const n of await fsp.readdir(path.join(syncDir, d.name)).catch(() => [])) {
                let name = null;
                const c = ANY_CHANGES.exec(n);
                if (c) name = changesName(pc, Number(c[1]));
                else if (n === COMPUTER_FILE) name = `computers/${pc}.json`;
                else if (n === STATE_FILE) name = `state/${pc}.json`;
                if (name && name.startsWith(p)) await add(`${d.name}/${n}`, name);
            }
        }
        return out;
    }

    // { size, created, modified } of one object, or null when it is gone.
    async function stat(id) {
        const st = await statOf(full(id));
        return st && st.isFile() ? { size: st.size, created: st.birthtimeMs || st.mtimeMs, modified: st.mtimeMs } : null;
    }

    async function read(id) {
        try {
            return await fsp.readFile(full(id));
        } catch (err) {
            if (err && err.code === "ENOENT") return null;
            throw err; // locked by the sync service: the next pass
        }
    }

    async function described(id, name) {
        const st = await statOf(full(id));
        return st ? describeStat(id, name, st) : { id, name, size: 0, created: Date.now(), modified: Date.now(), props: {} };
    }

    // Written straight to its name and only where there is none, as the
    // older versions wrote their change files: a reader that meets it half
    // written reads it as far as it goes and comes back (its last line ends
    // it, sync.cjs).
    async function putNew(name, bytes) {
        const id = pathOf(name);
        await fsp.mkdir(path.dirname(full(id)), { recursive: true });
        const fh = await fsp.open(full(id), "wx");
        try {
            await fh.write(bytes);
            await fh.sync();
        } finally {
            await fh.close();
        }
        return described(id, name);
    }

    // Written aside, then renamed over it.
    async function putWhole(name, bytes) {
        const id = pathOf(name);
        const file = full(id);
        await fsp.mkdir(path.dirname(file), { recursive: true });
        const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.partial`);
        try {
            await fsp.writeFile(tmp, bytes);
            await fsp.rename(tmp, file);
        } finally {
            await fsp.rm(tmp, { force: true }).catch(() => {});
        }
        return described(id, name);
    }

    async function putIfAbsent(name, bytes) {
        const id = pathOf(name);
        await fsp.mkdir(path.dirname(full(id)), { recursive: true });
        try {
            await fsp.writeFile(full(id), bytes, { flag: "wx" });
            return true;
        } catch (err) {
            if (err && err.code === "EEXIST") return false;
            throw err;
        }
    }

    async function remove(id) {
        await fsp.rm(full(id), { force: true });
    }

    // Through a hidden temporary name, so neither the sync service nor
    // another computer ever sees half a file under the real one; never over
    // a file already there.
    async function upload(name, fromFile) {
        const id = pathOf(name);
        const to = full(id);
        if (await statOf(to)) return null;
        await fsp.mkdir(path.dirname(to), { recursive: true });
        const tmp = path.join(path.dirname(to), `.${path.basename(to)}.${process.pid}.partial`);
        try {
            await fsp.copyFile(fromFile, tmp);
            if (await statOf(to)) return null;
            await fsp.rename(tmp, to);
        } finally {
            await fsp.rm(tmp, { force: true }).catch(() => {});
        }
        return described(id, name);
    }

    // A local copy is whole or not there: it starts over.
    async function download(id, toFile) {
        await fsp.copyFile(full(id), toFile);
    }

    async function available() {
        const st = await statOf(root);
        return Boolean(st && st.isDirectory());
    }

    return { kind: "folder", where: root, key: root, available, list, stat, read, putNew, putWhole, putIfAbsent, remove, upload, download };
}

module.exports = { createFolderStore, SYNC_DIR, MEDIA_DIR, PAIRING_FILE, COMPUTER_FILE, STATE_FILE };
