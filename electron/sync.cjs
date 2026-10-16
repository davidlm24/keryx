// Sync between the church's computers through a shared folder that Google
// Drive para computador (or OneDrive, Dropbox) keeps in step
// (docs/desktop-architecture.md §8b). No server: each computer writes its own
// changes to its own folder and reads everyone else's.
//
//   <folder>/sync/<pc>/changes-000001.jsonl   one computer's outbox entries,
//                                             one JSON object a line, only
//                                             ever appended; a new file past
//                                             FILE_LIMIT bytes
//   <folder>/sync/<pc>/state.json             what that computer has read of
//                                             everyone's files and the media
//                                             its rows use, for the cleanup
//   <folder>/sync/keryx-sync.json             the church's code file
//                                             (syncPairing.cjs)
//   <folder>/sync/media/<file>                the media files those rows use,
//                                             by their uuid name, never
//                                             overwritten; collected once no
//                                             computer uses one (collect())
//
// What this computer has read of each file (a byte offset past the last
// whole line) is kept in its own database (_meta "sync.state", never
// synced), so a restart goes on where it was. Entries are idempotent through
// store.applyRemote (last edit wins per row), which is what makes the
// awkward things a synced folder does harmless: a file read twice, Drive's
// conflict copies ("changes-000003 (1).jsonl"), files arriving late or out of
// order. A last line without its newline is still being written or
// downloaded: it is left for the next pass, never skipped.
//
// Only computers with the church's sync code count (PCs verificados,
// electron/syncPairing.cjs): the folder holds the code's file, every line and
// every state.json is signed with the key the code makes, and what does not
// verify is counted for its computer, never applied (nor counted by the
// cleanup). Without a code nothing is read or written; with a code that is
// no longer the folder's (it changed) neither, and the outbox waits; the
// same for a computer another one took out ("Tirar": the code file's
// removed list), whose folder the others skip until the code is typed on
// it again.
//
// Pure Node over the store and a folder path, so it runs under node --test.

const fs = require("node:fs");
const path = require("node:path");
const { isSynced, SYNC_ENTITIES } = require("./db/syncScope.cjs");
const { keysFor, readPairing, writePairing, matches, pairingFile, removedOf } = require("./syncPairing.cjs");

const fsp = fs.promises;

const SYNC_DIR = "sync";
const MEDIA_DIR = "media";
const MANIFEST = "state.json";
const STATE_KEY = "sync.state";
const FILE_LIMIT = 256 * 1024;
const BATCH = 500;
// Media named by rows that has not arrived yet, retried every pass.
const MISSING_LIMIT = 2000;
// The cleanup of sync/media: how often it looks, how long a file must have
// been unused by every computer before it goes, and how many collected
// names a computer keeps announcing (so one that still uses one puts it back).
const GC_EVERY_MS = 10 * 60 * 1000;
const GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const COLLECTED_LIMIT = 500;

// A computer's folder is its id; Drive may add " (1)" to a copy of it.
const PC_DIR = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
// The files this computer writes, and every name the services give copies of
// them: "changes-000003 (1).jsonl", "changes-000003-PC.jsonl", Dropbox's
// "changes-000003 (… conflicted copy …).jsonl".
const OWN_FILE = /^changes-(\d+)\.jsonl$/;
const ANY_FILE = /^changes-(\d+)(?!\d).*\.jsonl$/i;
// keryx-media://<file> in a row; the app's own files (keryx-media://bundled/…)
// ship with every copy and never travel.
const MEDIA_REF = /keryx-media:\/\/([A-Za-z0-9][A-Za-z0-9._-]*)(?![A-Za-z0-9._/-])/g;

const fileName = (n) => `changes-${String(n).padStart(6, "0")}.jsonl`;

function mediaRefs(row) {
    if (!row) return [];
    const names = new Set();
    for (const m of JSON.stringify(row).matchAll(MEDIA_REF)) {
        if (!m[1].endsWith(".partial")) names.add(m[1]);
    }
    return [...names];
}

async function sizeOf(file) {
    try {
        const st = await fsp.stat(file);
        return st.isFile() ? st.size : -1;
    } catch {
        return -1;
    }
}

async function isDir(dir) {
    try {
        return (await fsp.stat(dir)).isDirectory();
    } catch {
        return false;
    }
}

// Copies `from` to <dir>/<name> unless it is already there: through a hidden
// temporary name, so neither the sync service nor the media server ever sees
// half a file under the real one.
async function copyNew(from, dir, name) {
    const to = path.join(dir, name);
    if ((await sizeOf(to)) >= 0) return false;
    const tmp = path.join(dir, `.${name}.${process.pid}.partial`);
    try {
        await fsp.copyFile(from, tmp);
        if ((await sizeOf(to)) >= 0) return false;
        await fsp.rename(tmp, to);
        return true;
    } finally {
        await fsp.rm(tmp, { force: true }).catch(() => {});
    }
}

// Replaces <dir>/<name> whole: written aside, then renamed over it.
async function writeWhole(dir, name, text) {
    const tmp = path.join(dir, `.${name}.${process.pid}.partial`);
    try {
        await fsp.writeFile(tmp, text);
        await fsp.rename(tmp, path.join(dir, name));
    } finally {
        await fsp.rm(tmp, { force: true }).catch(() => {});
    }
}

// The computer whose folder a cursor key ("<pc dir>/<file>") points into.
const ownerOf = (key) => (PC_DIR.exec(String(key).split("/")[0]) || [])[1]?.toLowerCase() || null;

const emptyGc = () => ({ at: null, candidates: {}, marks: {}, collected: [] });

// Appends whole lines and waits for the disk. A line a crash cut short is
// closed first, so the new ones never join it (the reader skips it alone).
async function appendLines(file, text) {
    const fh = await fsp.open(file, "a+");
    try {
        const { size } = await fh.stat();
        let prefix = "";
        if (size > 0) {
            const last = Buffer.alloc(1);
            await fh.read(last, 0, 1, size - 1);
            if (last[0] !== 0x0a) prefix = "\n";
        }
        await fh.write(prefix + text);
        await fh.sync();
    } finally {
        await fh.close();
    }
}

// One line per row and moment: two writes of the same row in the same
// millisecond (a create and its first update) have the same date, and the
// other computers would take only the first. The later one wins; the
// profile's entries carry only the fields they set, so they are merged.
function coalesce(entries, pc) {
    const out = [];
    const where = new Map();
    for (const e of entries) {
        const line = { seq: e.seq, entity: e.entity, id: e.id, op: e.op, row: e.row, at: e.at, pc };
        const key = `${e.entity}\u0000${e.id}\u0000${e.at}`;
        const i = where.get(key);
        if (i === undefined) {
            where.set(key, out.length);
            out.push(line);
            continue;
        }
        const prev = out[i];
        if (e.entity === "User" && prev.op === "upsert" && e.op === "upsert") line.row = { ...prev.row, ...e.row };
        out[i] = line;
    }
    return out;
}

const byNumber = (a, b) => Number(ANY_FILE.exec(a)[1]) - Number(ANY_FILE.exec(b)[1]) || (a < b ? -1 : a > b ? 1 : 0);

const isEntry = (e, pc) => e && typeof e === "object" && !Array.isArray(e)
    && typeof e.entity === "string" && (e.op === "upsert" || e.op === "delete")
    && String(e.pc || "").toLowerCase() === pc;

const syncDirOf = (folder) => path.join(path.resolve(String(folder)), SYNC_DIR);

// What a folder holds, for choosing it and typing the code (before any pass
// runs there): { exists, code: "missing" | "bad" | "ok", computers: [{ pc,
// files, lastChange }] }. Reads only.
async function inspectFolder(folder) {
    const root = path.resolve(String(folder));
    if (!(await isDir(root))) return { exists: false, code: "missing", computers: [] };
    const syncDir = path.join(root, SYNC_DIR);
    const code = (await readPairing(syncDir)).state;
    const computers = new Map();
    for (const d of await fsp.readdir(syncDir, { withFileTypes: true }).catch(() => [])) {
        const m = d.isDirectory() && PC_DIR.exec(d.name);
        if (!m) continue;
        const pc = m[1].toLowerCase();
        const seen = computers.get(pc) || { pc, files: 0, lastChange: 0 };
        for (const name of await fsp.readdir(path.join(syncDir, d.name)).catch(() => [])) {
            if (!ANY_FILE.test(name)) continue;
            try {
                const st = await fsp.stat(path.join(syncDir, d.name, name));
                seen.files += 1;
                seen.lastChange = Math.max(seen.lastChange, st.mtimeMs);
            } catch { /* gone while we looked */ }
        }
        computers.set(pc, seen);
    }
    return {
        exists: true,
        code,
        computers: [...computers.values()].map((c) => ({ ...c, lastChange: c.lastChange ? new Date(c.lastChange).toISOString() : null })),
    };
}

// getFolder() -> the folder chosen, or null (off). getPairing() -> { id, key }
// (the code file's id and the key the code makes, syncPairing.cjs), or null
// (no code typed on this computer yet).
function createSyncEngine({
    store, mediaDir, getFolder, getPairing = () => null, log = console.warn, fileLimit = FILE_LIMIT, batch = BATCH, now = () => new Date(), onStatus = null,
    gcEveryMs = GC_EVERY_MS, gcGraceMs = GC_GRACE_MS,
}) {
    const pc = String(store.pcId).toLowerCase();
    // A complete line that is not JSON, by file: the file's size when it was
    // seen. Skipped once the file stops changing (it was not still arriving).
    const unreadable = new Map();
    let status = { state: "off", folder: null, pc };
    // The media files rows here name and that have not arrived (keryx-media
    // names), for the windows to say "Baixando…".
    let missingNow = (() => {
        const saved = store.getMeta(STATE_KEY);
        return Array.isArray(saved?.missing) ? saved.missing.map((m) => m.name) : [];
    })();
    // The media the rows here use, worked out again after a change.
    let refs = null;
    store.onChange((event) => {
        if (isSynced(event.entity)) refs = null;
    });
    // The manifest last written, so an unchanged one is not written again.
    let published = "";
    let lastLogged = "";
    let applying = false;
    let running = null;
    let again = false;
    let timer = null;
    let debounce = null;
    let unsubscribe = null;
    let keys = null; // keysFor the pairing in use, made again when it changes

    const setStatus = (next) => {
        status = { pc, ...next };
        if (onStatus) {
            try {
                onStatus(status);
            } catch { /* a listener's problem */ }
        }
    };

    const logOnce = (message) => {
        if (message === lastLogged) return;
        lastLogged = message;
        if (message) log(`[keryx-sync] ${message}`);
    };

    // Cursors and the writer's file number belong to one folder; another
    // folder starts over (reading twice is harmless). The writer's state is
    // also this computer's: a database brought from elsewhere drops it.
    // Another code (it changed, or the computer joined again) reads every
    // file again: lines skipped under the old key may verify now.
    function loadState(folder, pairing) {
        const saved = store.getMeta(STATE_KEY);
        if (!saved || saved.folder !== folder) return { folder, pairing, cursors: {}, peers: {}, out: null, missing: [], removed: [], gc: emptyGc() };
        const gc = saved.gc && typeof saved.gc === "object" ? saved.gc : {};
        const sameCode = saved.pairing === pairing;
        return {
            folder,
            pairing,
            cursors: sameCode && saved.cursors && typeof saved.cursors === "object" ? saved.cursors : {},
            peers: sameCode && saved.peers && typeof saved.peers === "object" ? saved.peers : {},
            removed: sameCode && Array.isArray(saved.removed) ? saved.removed : [],
            out: saved.out && saved.out.pc === pc ? saved.out : null,
            missing: Array.isArray(saved.missing) ? saved.missing : [],
            gc: {
                at: typeof gc.at === "string" ? gc.at : null,
                candidates: gc.candidates && typeof gc.candidates === "object" ? gc.candidates : {},
                marks: gc.marks && typeof gc.marks === "object" ? gc.marks : {},
                collected: Array.isArray(gc.collected) ? gc.collected : [],
            },
        };
    }
    const saveState = (state) => store.setMeta(STATE_KEY, state);

    // -- Out: this computer's outbox to its folder ------------------------------

    // The file to append `bytes` to. A number is never used twice: when the
    // file this computer wrote is gone (its folder deleted), the next one
    // starts, so no other computer's cursor points into a new file.
    async function outFile(dir, state, bytes) {
        let onDisk = 0;
        for (const name of await fsp.readdir(dir).catch(() => [])) {
            const m = OWN_FILE.exec(name);
            if (m) onDisk = Math.max(onDisk, Number(m[1]));
        }
        const out = state.out;
        let n = Math.max(out?.n || 0, onDisk, 1);
        const size = await sizeOf(path.join(dir, fileName(n)));
        if (size < 0 && out?.n === n && out.used) n += 1;
        else if (size > 0 && size + bytes > fileLimit) n += 1;
        return n;
    }

    // Copies the media a row names into sync/media; returns { file: size }
    // for the files that are here, so a reader knows when one has arrived whole.
    async function shipMedia(syncDir, row) {
        const sizes = {};
        for (const name of mediaRefs(row)) {
            const local = path.join(mediaDir, name);
            const size = await sizeOf(local);
            if (size < 0) continue;
            await copyNew(local, path.join(syncDir, MEDIA_DIR), name);
            sizes[name] = size;
        }
        return Object.keys(sizes).length ? sizes : undefined;
    }

    async function writeOut(syncDir, state) {
        const dir = path.join(syncDir, pc);
        let sent = 0;
        for (;;) {
            const entries = store.outbox(0, batch);
            if (!entries.length) break;
            await fsp.mkdir(dir, { recursive: true });
            const lines = coalesce(entries, pc);
            for (const line of lines) {
                if (line.op !== "upsert") continue;
                const media = await shipMedia(syncDir, line.row);
                if (media) line.media = media;
            }
            const text = lines.map((line) => keys.sign(JSON.stringify(line)) + "\n").join("");
            const n = await outFile(dir, state, Buffer.byteLength(text));
            await appendLines(path.join(dir, fileName(n)), text);
            state.out = { pc, n, used: true };
            saveState(state);
            // Only what is on disk is forgotten; a crash before this line
            // writes the same entries again, which nobody minds.
            store.pruneOutbox(entries[entries.length - 1].seq);
            sent += lines.length;
        }
        return sent;
    }

    // -- In: everyone else's folders ------------------------------------------

    function noteMissing(state, name, size) {
        const at = state.missing.findIndex((m) => m.name === name);
        if (at >= 0) state.missing.splice(at, 1);
        state.missing.push({ name, size: Number.isFinite(size) ? size : null });
        if (state.missing.length > MISSING_LIMIT) state.missing.splice(0, state.missing.length - MISSING_LIMIT);
    }

    // A file from sync/media into the media folder, when it is there whole
    // (the size its row said). Returns true when the file is here now.
    async function fetchFile(syncDir, name, expected) {
        if ((await sizeOf(path.join(mediaDir, name))) >= 0) return true;
        const from = path.join(syncDir, MEDIA_DIR, name);
        const size = await sizeOf(from);
        if (size < 0 || (expected != null && size !== expected)) return false;
        await fsp.mkdir(mediaDir, { recursive: true });
        await copyNew(from, mediaDir, name);
        return (await sizeOf(path.join(mediaDir, name))) >= 0;
    }

    async function fetchMedia(syncDir, state, entry) {
        if (entry.op !== "upsert") return;
        for (const name of mediaRefs(entry.row)) {
            const expected = entry.media && Number.isFinite(entry.media[name]) ? entry.media[name] : null;
            let here = false;
            try {
                here = await fetchFile(syncDir, name, expected);
            } catch { /* locked or offline: retried */ }
            if (!here) noteMissing(state, name, expected);
        }
    }

    async function retryMissing(syncDir, state) {
        const still = [];
        for (const m of state.missing) {
            let here = false;
            try {
                here = await fetchFile(syncDir, m.name, m.size);
            } catch { /* retried */ }
            if (!here) still.push(m);
        }
        state.missing = still;
    }

    async function applyBatch(syncDir, state, entries, totals) {
        if (!entries.length) return;
        for (const entry of entries) await fetchMedia(syncDir, state, entry);
        applying = true;
        try {
            const r = store.applyRemote(entries);
            totals.applied += r.applied;
            totals.skipped += r.skipped;
            totals.failed += r.failed;
        } finally {
            applying = false;
        }
    }

    // Reads one file from its cursor. Stops at a last line still without its
    // newline, and at an unreadable line until the file has stopped growing
    // or a later line shows the file went on.
    async function readFile(syncDir, state, dir, name, key, from, totals) {
        const file = path.join(dir, name);
        let st;
        try {
            st = await fsp.stat(file);
        } catch {
            return null;
        }
        let offset = Number(state.cursors[key]) || 0;
        if (st.size === offset) return st.mtimeMs;
        // Shorter than what was read: replaced by another copy. Read it again.
        if (st.size < offset) offset = 0;
        let buf;
        try {
            buf = await fsp.readFile(file);
        } catch {
            return st.mtimeMs; // locked by the sync service: next pass
        }
        let pos = offset;
        let pending = [];
        const flush = async () => {
            await applyBatch(syncDir, state, pending, totals);
            pending = [];
            state.cursors[key] = pos;
            saveState(state);
        };
        while (pos < buf.length) {
            const nl = buf.indexOf(0x0a, pos);
            if (nl < 0) break;
            const text = buf.toString("utf8", pos, nl).trim();
            let entry = null;
            if (text) {
                try {
                    entry = JSON.parse(text);
                } catch {
                    const later = buf.indexOf(0x0a, nl + 1) >= 0;
                    if (!later && unreadable.get(key) !== buf.length) {
                        unreadable.set(key, buf.length);
                        break;
                    }
                    totals.bad += 1;
                    logOnce(`linha ilegível ignorada em ${key}`);
                }
            }
            if (isEntry(entry, from)) {
                // Signed with this church's key, or not taken at all.
                const peer = state.peers[from] || (state.peers[from] = { ok: 0, rejected: 0, last: null });
                if (keys.verify(text)) {
                    delete entry.sig;
                    pending.push(entry);
                    peer.ok += 1;
                    peer.last = "ok";
                } else {
                    peer.rejected += 1;
                    peer.last = "rejected";
                    totals.rejected += 1;
                    logOnce(`linhas sem a assinatura do código da igreja ignoradas em ${key}`);
                }
            }
            pos = nl + 1;
            if (pending.length >= batch) await flush();
        }
        await flush();
        return st.mtimeMs;
    }

    async function readIn(syncDir, state) {
        const totals = { applied: 0, skipped: 0, failed: 0, bad: 0, rejected: 0 };
        const computers = new Map();
        const out = new Map(state.removed.map((r) => [r.pc, r]));
        for (const d of await fsp.readdir(syncDir, { withFileTypes: true })) {
            const m = d.isDirectory() && PC_DIR.exec(d.name);
            if (!m) continue;
            const from = m[1].toLowerCase();
            if (from === pc) continue;
            const dir = path.join(syncDir, d.name);
            let names;
            try {
                names = (await fsp.readdir(dir)).filter((n) => ANY_FILE.test(n)).sort(byNumber);
            } catch {
                continue; // deleted while we looked
            }
            const seen = computers.get(from) || { pc: from, files: 0, lastChange: 0 };
            // Taken out: listed, never read, until it types the code again.
            if (out.has(from)) {
                seen.removed = { at: out.get(from).at, by: out.get(from).by };
                computers.set(from, seen);
                continue;
            }
            for (const name of names) {
                const mtime = await readFile(syncDir, state, dir, name, `${d.name}/${name}`, from, totals);
                if (mtime == null) continue;
                seen.files += 1;
                seen.lastChange = Math.max(seen.lastChange, mtime);
            }
            computers.set(from, seen);
        }
        // verified: the last line read from it carried this church's
        // signature (false: it writes without the code, or with an old one;
        // null: nothing read from it yet).
        return {
            totals,
            computers: [...computers.values()].map((c) => {
                const peer = state.peers[c.pc];
                return {
                    ...c,
                    lastChange: c.lastChange ? new Date(c.lastChange).toISOString() : null,
                    verified: peer && peer.last ? peer.last === "ok" : null,
                    rejected: peer ? peer.rejected : 0,
                };
            }),
        };
    }

    // -- The cleanup of sync/media -------------------------------------------
    //
    // sync/media only grows as rows bring files; a video deleted on every
    // computer would hold the Drive's space for ever. A file there goes only
    // when it has been unused for gcGraceMs by every computer and every
    // computer has read past the moment it became unused — which is when
    // each of them had taken the deletes that freed it. Each computer says
    // both in its own <pc>/state.json (written after it reads): `read`, its
    // cursors, and `refs`, the media its rows use. A computer with a folder
    // and no state.json (an older KERYX, or one not yet run) holds every
    // file. Only the shared copy goes: the media folder of each computer is
    // never touched. A computer that still uses a file someone collected (a
    // row edited while it was away) copies it back from its own media
    // folder: the names collected are announced in state.json (`collected`).
    // state.json is signed like a line: only computers with the church's
    // code count, and a computer taken out ("Tirar") holds nothing back.

    // The media every row here names (the church's content only).
    function liveRefs() {
        if (refs) return refs;
        const names = new Set();
        for (const entity of SYNC_ENTITIES) {
            let rows = [];
            try {
                rows = store.call(entity, "list", []);
            } catch { /* not in this schema */ }
            for (const row of rows) for (const name of mediaRefs(row)) names.add(name);
        }
        refs = names;
        return names;
    }

    async function publish(syncDir, state, names) {
        const body = { pc, read: state.cursors, refs: [...names].sort(), collected: state.gc.collected };
        const text = JSON.stringify(body);
        const dir = path.join(syncDir, pc);
        // Unchanged and still there (this computer's folder may be deleted).
        if (text === published && (await sizeOf(path.join(dir, MANIFEST))) >= 0) return;
        await fsp.mkdir(dir, { recursive: true });
        await writeWhole(dir, MANIFEST, keys.sign(JSON.stringify({ ...body, at: now().toISOString() })));
        published = text;
    }

    // The other computers that count: every folder in sync/ (Drive's " (1)"
    // copies counted as theirs) and the newest signed state.json each wrote
    // (null: none yet, which holds every file). A computer taken out, or one
    // whose files never verified (no code, an old one), does not count.
    async function readManifests(syncDir, state) {
        const seen = new Map();
        const out = new Set(state.removed.map((r) => r.pc));
        for (const d of await fsp.readdir(syncDir, { withFileTypes: true })) {
            const m = d.isDirectory() && PC_DIR.exec(d.name);
            if (!m) continue;
            const from = m[1].toLowerCase();
            if (from === pc || out.has(from)) continue;
            let text = null;
            try {
                text = (await fsp.readFile(path.join(syncDir, d.name, MANIFEST), "utf8")).trim();
            } catch { /* none yet */ }
            let manifest = null;
            if (text && keys.verify(text)) {
                try {
                    manifest = JSON.parse(text);
                } catch { /* not JSON: as none */ }
            }
            if (!manifest && state.peers[from]?.last !== "ok") continue;
            const ok = manifest && String(manifest.pc || "").toLowerCase() === from ? manifest : null;
            const before = seen.get(from) || null;
            if (!before || (ok && String(ok.at || "") > String(before.at || ""))) seen.set(from, ok);
        }
        return seen;
    }

    // Every change file's size now: { "<pc dir>/<file>": bytes }.
    async function changeSizes(syncDir) {
        const sizes = {};
        for (const d of await fsp.readdir(syncDir, { withFileTypes: true })) {
            if (!d.isDirectory() || !PC_DIR.test(d.name)) continue;
            const names = await fsp.readdir(path.join(syncDir, d.name)).catch(() => []);
            for (const name of names) {
                if (!ANY_FILE.test(name)) continue;
                const size = await sizeOf(path.join(syncDir, d.name, name));
                if (size >= 0) sizes[`${d.name}/${name}`] = size;
            }
        }
        return sizes;
    }

    // Whether `read` (a computer's cursors) covers what was in the files when
    // the mark was taken, the computer's own files aside.
    const readPast = (who, read, mark) => Boolean(read) && Object.entries(mark)
        .every(([key, size]) => ownerOf(key) === who || (Number(read[key]) || 0) >= size);

    async function collect(syncDir, state, names) {
        const gc = state.gc;
        const at = now();
        const manifests = await readManifests(syncDir, state);
        const shared = path.join(syncDir, MEDIA_DIR);

        // Put back what someone collected that a row here still uses.
        const listed = new Set(await fsp.readdir(shared).catch(() => []));
        const announced = [...gc.collected, ...[...manifests.values()].flatMap((m) => (m && Array.isArray(m.collected) ? m.collected : []))];
        for (const c of announced) {
            const name = c && typeof c.name === "string" ? c.name : null;
            if (!name || listed.has(name) || !names.has(name)) continue;
            const local = path.join(mediaDir, name);
            if ((await sizeOf(local)) < 0) continue;
            try {
                if (await copyNew(local, shared, name)) listed.add(name);
            } catch { /* next time */ }
        }

        const used = new Set(names);
        for (const m of manifests.values()) for (const name of (m && Array.isArray(m.refs) ? m.refs : [])) used.add(name);
        const files = [...listed].filter((n) => !n.startsWith(".") && !n.endsWith(".partial"));
        const present = new Set(files);
        for (const name of Object.keys(gc.candidates)) {
            if (used.has(name) || !present.has(name)) delete gc.candidates[name];
        }
        let mark = null;
        for (const name of files) {
            if (used.has(name) || gc.candidates[name]) continue;
            if (!mark) {
                mark = at.toISOString();
                gc.marks[mark] = await changeSizes(syncDir);
            }
            gc.candidates[name] = { since: mark, mark };
        }

        let removed = 0;
        const everyone = [[pc, state.cursors], ...[...manifests].map(([who, m]) => [who, m && m.read && typeof m.read === "object" ? m.read : null])];
        for (const [name, c] of Object.entries(gc.candidates)) {
            if (at.getTime() - Date.parse(c.since) < gcGraceMs) continue;
            const marked = gc.marks[c.mark];
            if (!marked || !everyone.every(([who, read]) => readPast(who, read, marked))) continue;
            try {
                await fsp.rm(path.join(shared, name), { force: true });
            } catch {
                continue; // locked by the sync service: next time
            }
            delete gc.candidates[name];
            gc.collected.push({ name, at: at.toISOString() });
            removed += 1;
        }
        if (gc.collected.length > COLLECTED_LIMIT) gc.collected.splice(0, gc.collected.length - COLLECTED_LIMIT);
        const inUse = new Set(Object.values(gc.candidates).map((c) => c.mark));
        for (const key of Object.keys(gc.marks)) if (!inUse.has(key)) delete gc.marks[key];
        gc.at = at.toISOString();
        return removed;
    }

    const gcDue = (state) => !state.gc.at || now().getTime() - Date.parse(state.gc.at) >= gcEveryMs;

    // -- A pass ----------------------------------------------------------------

    async function once() {
        let folder = null;
        try {
            folder = getFolder();
        } catch { /* settings unreadable: off */ }
        if (!folder) {
            setStatus({ state: "off", folder: null });
            return;
        }
        const root = path.resolve(String(folder));
        const at = now().toISOString();
        let pairing = null;
        try {
            pairing = getPairing();
        } catch { /* unreadable: as if no code */ }
        // A folder but no code: nothing is read or written (the outbox waits).
        if (!pairing || !pairing.id || !pairing.key) {
            setStatus({ state: "unpaired", folder: root, lastPass: at, error: null });
            return;
        }
        if (!keys || keys.id !== pairing.id || keys.key !== pairing.key) {
            keys = { ...keysFor(pairing.key, pairing.id), key: pairing.key };
            published = "";
        }
        // The folder itself is never made here: missing, it is a drive not
        // mounted or a sync service not running, not a place to start one.
        if (!(await isDir(root))) {
            setStatus({ ...status, state: "offline", folder: root, lastPass: at, error: "A pasta de sincronização não está disponível." });
            logOnce(`pasta indisponível: ${root}`);
            return;
        }
        const syncDir = path.join(root, SYNC_DIR);
        try {
            // The folder's code file: this code's, written back if it went
            // missing (any computer with the code can), or another code's —
            // then this computer neither reads nor writes until the new code
            // is typed here.
            const code = await readPairing(syncDir);
            if (code.state === "bad") {
                setStatus({ ...status, state: "offline", folder: root, lastPass: at, error: "O arquivo do código da igreja ainda está chegando pela pasta." });
                return;
            }
            let state = null;
            if (code.state === "missing") {
                state = loadState(root, pairing.id);
                await writePairing(syncDir, pairingFile(keys, pc, now(), state.removed));
                logOnce("arquivo do código refeito na pasta");
            } else if (!matches(code.file, keys)) {
                setStatus({ ...status, state: "mismatch", folder: root, lastPass: at, error: "O código da igreja mudou nesta pasta. Digite o código novo para voltar a sincronizar." });
                logOnce("o código da pasta não é o deste computador");
                return;
            }
            state = state || loadState(root, pairing.id);
            if (code.state === "ok") state.removed = removedOf(code.file, keys) || [];
            const me = state.removed.find((r) => r.pc === pc);
            if (me) {
                saveState(state);
                setStatus({ ...status, state: "removed", folder: root, lastPass: at, removed: { at: me.at, by: me.by }, error: "Este computador foi tirado da sincronização. Digite o código da igreja para voltar." });
                logOnce("este computador foi tirado da sincronização");
                return;
            }
            await fsp.mkdir(path.join(syncDir, MEDIA_DIR), { recursive: true });
            const sent = await writeOut(syncDir, state);
            const { totals, computers } = await readIn(syncDir, state);
            await retryMissing(syncDir, state);
            // A file no row here names any more is not waited for.
            const names = liveRefs();
            state.missing = state.missing.filter((m) => names.has(m.name));
            const collected = gcDue(state) ? await collect(syncDir, state, names) : 0;
            saveState(state);
            await publish(syncDir, state, names);
            missingNow = state.missing.map((m) => m.name);
            const { bad, rejected, ...received } = totals;
            setStatus({
                state: "ok",
                folder: root,
                lastPass: at,
                lastOk: at,
                error: null,
                sent,
                received,
                bad,
                rejected,
                missingMedia: state.missing.length,
                collectedMedia: collected,
                computers,
            });
            logOnce("");
        } catch (err) {
            const message = err && err.message ? err.message : String(err);
            setStatus({ ...status, state: "error", folder: root, lastPass: at, error: `Não foi possível sincronizar: ${message}` });
            logOnce(`erro: ${message}`);
        }
    }

    // One pass at a time; asked for while one runs, another follows it.
    function pass() {
        if (running) {
            again = true;
            return running;
        }
        running = (async () => {
            try {
                do {
                    again = false;
                    await once();
                } while (again);
            } finally {
                running = null;
            }
            return status;
        })();
        return running;
    }

    let debounceMs = 3000;
    function poke() {
        clearTimeout(debounce);
        debounce = setTimeout(() => { pass(); }, debounceMs);
        debounce.unref?.();
    }

    // On a timer (others' changes arrive whenever the sync service brings
    // them) and a moment after a local change to the church's content.
    // Without a folder each pass ends at once.
    function start({ intervalMs = 30000, debounce: wait = 3000 } = {}) {
        stop();
        debounceMs = wait;
        timer = setInterval(() => { pass(); }, intervalMs);
        timer.unref?.();
        unsubscribe = store.onChange((event) => {
            if (!applying && isSynced(event.entity)) poke();
        });
        poke();
    }

    function stop() {
        clearInterval(timer);
        clearTimeout(debounce);
        timer = null;
        if (unsubscribe) unsubscribe();
        unsubscribe = null;
    }

    // The media files rows here name that have not come down yet (none with
    // sync off: then a file that is not here is simply not found).
    function missing() {
        try {
            if (!getFolder()) return [];
        } catch {
            return [];
        }
        return [...missingNow];
    }

    return { pass, poke, start, stop, status: () => status, missing };
}

module.exports = { createSyncEngine, inspectFolder, syncDirOf, mediaRefs, coalesce, SYNC_DIR, MEDIA_DIR, MANIFEST, STATE_KEY, fileName };
