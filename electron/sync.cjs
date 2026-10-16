// Sync between the church's computers through a shared folder that Google
// Drive para computador (or OneDrive, Dropbox) keeps in step
// (docs/desktop-architecture.md §8b). No server: each computer writes its own
// changes to its own folder and reads everyone else's.
//
//   <folder>/sync/<pc>/changes-000001.jsonl   one computer's outbox entries,
//                                             one JSON object a line, only
//                                             ever appended; a new file past
//                                             FILE_LIMIT bytes
//   <folder>/sync/media/<file>                the media files those rows use,
//                                             by their uuid name, never
//                                             overwritten
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
// electron/syncPairing.cjs): the folder holds the code's file
// (sync/keryx-sync.json), every line is signed with the key the code makes,
// and a line that does not verify is counted for its computer, never
// applied. Without a code nothing is read or written; with a code that is no
// longer the folder's (it changed) neither, and the outbox waits; the same
// for a computer another one took out ("Tirar": the code file's removed
// list), whose folder the others skip until the code is typed on it again.
//
// Pure Node over the store and a folder path, so it runs under node --test.

const fs = require("node:fs");
const path = require("node:path");
const { isSynced } = require("./db/syncScope.cjs");
const { keysFor, readPairing, writePairing, matches, pairingFile, removedOf } = require("./syncPairing.cjs");

const fsp = fs.promises;

const SYNC_DIR = "sync";
const MEDIA_DIR = "media";
const STATE_KEY = "sync.state";
const FILE_LIMIT = 256 * 1024;
const BATCH = 500;
// Media named by rows that has not arrived yet, retried every pass.
const MISSING_LIMIT = 2000;
// <folder>/sync/<pc>/computer.json: { pc, name, version, at, sig } — who
// the computer is (its Windows name, its KERYX version), signed like a line,
// rewritten when either changes and twice a day (so "visto" stays true
// without a write every pass).
const COMPUTER_FILE = "computer.json";
const COMPUTER_REFRESH_MS = 12 * 60 * 60 * 1000;

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

// A computer's computer.json: { name, version, at, verified } (verified only
// with `keys`; without, the name is shown as the folder says it), or null.
async function readComputer(dir, keys = null) {
    let text;
    try {
        text = (await fsp.readFile(path.join(dir, COMPUTER_FILE), "utf8")).trim();
    } catch {
        return null;
    }
    let info;
    try {
        info = JSON.parse(text);
    } catch {
        return null;
    }
    if (!info || typeof info !== "object") return null;
    const verified = keys ? keys.verify(text) : null;
    if (keys && !verified) return { name: null, version: null, at: null, verified: false };
    const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);
    return { name: str(info.name, 80), version: str(info.version, 40), at: str(info.at, 40), verified };
}

// What a folder holds, for choosing it and typing the code (before any pass
// runs there): { exists, code: "missing" | "bad" | "ok", computers: [{ pc,
// name, files, lastChange }] }. Reads only; the names are what the folder
// says (nothing can be checked before the code is typed).
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
        const seen = computers.get(pc) || { pc, name: null, files: 0, lastChange: 0 };
        seen.name = seen.name || (await readComputer(path.join(syncDir, d.name)))?.name || null;
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
// (no code typed on this computer yet). describe() -> { name, version }:
// this computer as the others list it.
function createSyncEngine({ store, mediaDir, getFolder, getPairing = () => null, describe = null, log = console.warn, fileLimit = FILE_LIMIT, batch = BATCH, now = () => new Date(), onStatus = null }) {
    const pc = String(store.pcId).toLowerCase();
    // A complete line that is not JSON, by file: the file's size when it was
    // seen. Skipped once the file stops changing (it was not still arriving).
    const unreadable = new Map();
    let status = { state: "off", folder: null, pc };
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
        const fresh = { folder, pairing, cursors: {}, peers: {}, out: null, missing: [], me: null, removed: [] };
        if (!saved || saved.folder !== folder) return fresh;
        const sameCode = saved.pairing === pairing;
        return {
            ...fresh,
            cursors: sameCode && saved.cursors && typeof saved.cursors === "object" ? saved.cursors : {},
            peers: sameCode && saved.peers && typeof saved.peers === "object" ? saved.peers : {},
            me: sameCode && saved.me && saved.me.pc === pc ? saved.me : null,
            removed: sameCode && Array.isArray(saved.removed) ? saved.removed : [],
            out: saved.out && saved.out.pc === pc ? saved.out : null,
            missing: Array.isArray(saved.missing) ? saved.missing : [],
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

    // This computer's computer.json, when what it says changed, it is gone,
    // or it is half a day old.
    async function writeComputer(syncDir, state) {
        if (!describe) return;
        let me;
        try {
            me = describe() || {};
        } catch {
            return;
        }
        const name = String(me.name || "").slice(0, 80);
        const version = String(me.version || "").slice(0, 40);
        const dir = path.join(syncDir, pc);
        const file = path.join(dir, COMPUTER_FILE);
        const last = state.me;
        const at = now();
        const fresh = last && last.name === name && last.version === version && at - Date.parse(last.at || 0) < COMPUTER_REFRESH_MS;
        if (fresh && (await sizeOf(file)) > 0) return;
        await fsp.mkdir(dir, { recursive: true });
        const body = { pc, name, version, at: at.toISOString() };
        const tmp = path.join(dir, `.${COMPUTER_FILE}.${process.pid}.partial`);
        try {
            await fsp.writeFile(tmp, keys.sign(JSON.stringify(body)) + "\n");
            await fsp.rename(tmp, file);
        } finally {
            await fsp.rm(tmp, { force: true }).catch(() => {});
        }
        state.me = { pc, name, version, at: body.at };
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
            const seen = computers.get(from) || { pc: from, name: null, version: null, seen: null, signed: null, files: 0, lastChange: 0 };
            const who = await readComputer(dir, keys);
            if (who && (seen.signed === null || who.verified)) {
                seen.signed = who.verified;
                if (who.verified) Object.assign(seen, { name: who.name, version: who.version, seen: who.at });
            }
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
        // signature (false: it writes without the code, or with an old one);
        // with no line read yet, its computer.json says; null: nothing at all.
        // name, version, seen: from its computer.json, only when signed.
        return {
            totals,
            computers: [...computers.values()].map(({ signed, ...c }) => {
                const peer = state.peers[c.pc];
                return {
                    ...c,
                    lastChange: c.lastChange ? new Date(c.lastChange).toISOString() : null,
                    verified: peer && peer.last ? peer.last === "ok" : signed,
                    rejected: peer ? peer.rejected : 0,
                };
            }),
        };
    }

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
        if (!keys || keys.id !== pairing.id || keys.key !== pairing.key) keys = { ...keysFor(pairing.key, pairing.id), key: pairing.key };
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
            await writeComputer(syncDir, state);
            const { totals, computers } = await readIn(syncDir, state);
            await retryMissing(syncDir, state);
            saveState(state);
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

    return { pass, poke, start, stop, status: () => status };
}

module.exports = { createSyncEngine, inspectFolder, syncDirOf, mediaRefs, coalesce, SYNC_DIR, MEDIA_DIR, STATE_KEY, COMPUTER_FILE, fileName };
