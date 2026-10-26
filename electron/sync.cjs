// Sync between the church's computers (docs/desktop-architecture.md §8b). No
// server: each computer writes its own changes to a shared store and reads
// everyone else's. The store is electron/syncStore/ — today the shared folder
// Google Drive para computador keeps in step (`folder`), next Google Drive
// itself — and it has Drive's rules: objects written whole and never
// appended, names that are not unique, a listing that may lag a write.
//
//   changes/<pc>/<seq>.jsonl   one pass's outbox entries (up to `batch`), one
//                              JSON object a line, each signed, and a last
//                              line {"keryx":"end","lines":n} that says the
//                              object is all there; a new object every
//                              time, <seq> never used twice by its computer
//   state/<pc>.json            what that computer has read of everyone's
//                              changes and the media its rows use, for the
//                              cleanup; replaced whole
//   computers/<pc>.json        who that computer is; replaced whole
//   keryx-sync.json            the church's code file (syncPairing.cjs)
//   media/<file>               the media files those rows use, by their uuid
//                              name, never overwritten; collected once no
//                              computer uses one (collect())
//
// What this computer has read is kept in its own database (_meta
// "sync.state", never synced), so a restart goes on where it was: per
// computer, the numbers (<seq>) of the changes objects read to their end
// line, as ranges (`seen[pc].done`), plus the ids of the extra objects read
// when two share a name (`seen[pc].dup`); and, for an object read only part
// of the way, how far (`part[id].at`, bytes past its last whole line). An
// object without its end line is still arriving — a file Drive para
// computador is still bringing down, or one a computer on an older KERYX
// keeps appending to (0.2.21 and before: a changes file that only grew) — so
// it is read as far as it goes and again when it grows; one with its end is
// never read again. Two objects of one name (a conflict copy, a Drive upload
// made twice) are each read. Entries are idempotent through store.applyRemote
// (last edit wins per row), which is what makes reading twice, late or out of
// order harmless. A last line without its newline is left for the next pass,
// never skipped.
//
// Only computers with the church's sync code count (PCs verificados,
// electron/syncPairing.cjs): the store holds the code's file, every line and
// every state object is signed with the key the code makes, and what does
// not verify is counted for its computer, never applied (nor counted by the
// cleanup). Without a code nothing is read or written; with a code that is
// no longer the store's (it changed) neither, and the outbox waits; the same
// for a computer another one took out ("Tirar": the code file's removed
// list), whose changes the others skip until the code is typed on it again.
//
// Pure Node over the store and a sync store, so it runs under node --test.

const fs = require("node:fs");
const path = require("node:path");
const { isSynced, SYNC_ENTITIES } = require("./db/syncScope.cjs");
const { keysFor, readPairing, writePairing, matches, pairingFile, removedOf } = require("./syncPairing.cjs");
const { createFolderStore, changesName, parseChanges, PC_DIR } = require("./syncStore/index.cjs");

const fsp = fs.promises;

const STATE_KEY = "sync.state";
const BATCH = 500;
// Media named by rows that has not arrived yet, retried every pass.
const MISSING_LIMIT = 2000;
// computers/<pc>.json: { pc, name, version, bibles, at, sig } — who the
// computer is (its Windows name, its KERYX version, the Bible editions
// installed on it: their names only, never the text), signed like a line,
// rewritten when any of them changes and twice a day (so "visto" stays true
// without a write every pass).
const COMPUTER_REFRESH_MS = 12 * 60 * 60 * 1000;
// The cleanup of media/: how often it looks, how long a file must have been
// unused by every computer before it goes, and how many collected names a
// computer keeps announcing (so one that still uses one puts it back).
const GC_EVERY_MS = 10 * 60 * 1000;
const GC_GRACE_MS = 7 * 24 * 60 * 60 * 1000;
const COLLECTED_LIMIT = 500;
// The state object's format: 2 since the store (an older KERYX wrote byte
// cursors by file name, which say nothing about objects).
const STATE_V = 2;
// keryx-media://<file> in a row; the app's own files (keryx-media://bundled/…)
// ship with every copy and never travel.
const MEDIA_REF = /keryx-media:\/\/([A-Za-z0-9][A-Za-z0-9._-]*)(?![A-Za-z0-9._/-])/g;

const endLine = (n) => `${JSON.stringify({ keryx: "end", lines: n })}\n`;
const isEnd = (e) => Boolean(e && typeof e === "object" && e.keryx === "end");
const computerName = (pc) => `computers/${pc}.json`;
const stateName = (pc) => `state/${pc}.json`;
const mediaName = (name) => `media/${name}`;
// A local download on its way, kept to go on from after a cut.
const tempOf = (name) => `.${name}.sync.partial`;

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

// -- Ranges of numbers ([[from, to], …], sorted, apart) ----------------------

function addRange(ranges, n) {
    const out = [];
    let lo = n;
    let hi = n;
    for (const [a, b] of Array.isArray(ranges) ? ranges : []) {
        if (b < lo - 1 || a > hi + 1) out.push([a, b]);
        else {
            lo = Math.min(lo, a);
            hi = Math.max(hi, b);
        }
    }
    out.push([lo, hi]);
    return out.sort((x, y) => x[0] - y[0]);
}

const inRanges = (ranges, n) => (Array.isArray(ranges) ? ranges : []).some(([a, b]) => n >= a && n <= b);
const rangeWithin = ([a, b], ranges) => (Array.isArray(ranges) ? ranges : []).some(([x, y]) => a >= x && b <= y);
function rangesOf(numbers) {
    let out = [];
    for (const n of numbers) out = addRange(out, n);
    return out;
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

const isEntry = (e, pc) => e && typeof e === "object" && !Array.isArray(e)
    && typeof e.entity === "string" && (e.op === "upsert" || e.op === "delete")
    && String(e.pc || "").toLowerCase() === pc;

// The Bible editions a computer object lists: short names ("NVI"), a few.
const BIBLES_LIMIT = 20;
const editionList = (v) => (Array.isArray(v)
    ? [...new Set(v.filter((x) => typeof x === "string" && /^[A-Za-z0-9]{1,12}$/.test(x)).map((x) => x.toUpperCase()))].sort().slice(0, BIBLES_LIMIT)
    : []);

// The computer an object's name belongs to (changes/, computers/, state/).
const pcOfName = (name) => {
    const m = /^(?:changes|computers|state)\/([^/.]+)/.exec(String(name));
    return m && PC_DIR.test(m[1]) ? m[1].toLowerCase() : null;
};

// Objects by the computer they belong to.
function byPc(list) {
    const out = new Map();
    for (const o of list) {
        const pc = pcOfName(o.name);
        if (!pc) continue;
        if (!out.has(pc)) out.set(pc, []);
        out.get(pc).push(o);
    }
    return out;
}

// A computer object: { name, version, bibles, at, verified } (verified only
// with `keys`; without, the name is shown as the store says it), or null.
async function readComputer(shared, obj, keys = null) {
    let text;
    try {
        const bytes = await shared.read(obj.id);
        if (!bytes) return null;
        text = bytes.toString("utf8").trim();
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
    if (keys && !verified) return { name: null, version: null, bibles: [], at: null, verified: false };
    const str = (v, n) => (typeof v === "string" ? v.slice(0, n) : null);
    return { name: str(info.name, 80), version: str(info.version, 40), bibles: editionList(info.bibles), at: str(info.at, 40), verified };
}

// Of a computer's objects of one name (a copy may sit beside it): the
// verified one, the newest by what it says.
async function bestComputer(shared, objs, keys) {
    let best = null;
    for (const o of objs) {
        const who = await readComputer(shared, o, keys);
        if (!who) continue;
        if (!best || (who.verified && !best.verified) || (Boolean(who.verified) === Boolean(best.verified) && String(who.at || "") > String(best.at || ""))) best = who;
    }
    return best;
}

// What a store holds, for choosing it and typing the code (before any pass
// runs there): { exists, code: "missing" | "bad" | "ok", computers: [{ pc,
// name, files, lastChange }] }. Reads only; the names are what the store
// says (nothing can be checked before the code is typed).
async function inspectStore(shared) {
    if (!(await shared.available())) return { exists: false, code: "missing", computers: [] };
    const code = (await readPairing(shared)).state;
    const all = await shared.list("");
    const computers = new Map();
    for (const [pc, objs] of byPc(all)) {
        const seen = { pc, name: null, files: 0, lastChange: 0 };
        const who = await bestComputer(shared, objs.filter((o) => o.name === computerName(pc)));
        seen.name = who?.name || null;
        for (const o of objs) {
            if (!parseChanges(o.name)) continue;
            seen.files += 1;
            seen.lastChange = Math.max(seen.lastChange, o.modified || 0);
        }
        computers.set(pc, seen);
    }
    return {
        exists: true,
        code,
        computers: [...computers.values()].map((c) => ({ ...c, lastChange: c.lastChange ? new Date(c.lastChange).toISOString() : null })),
    };
}

const inspectFolder = (folder) => inspectStore(createFolderStore(folder));

const emptyGc = () => ({ at: null, candidates: {}, marks: {}, collected: [] });

// The mark an older KERYX kept ({ "<pc dir>/<file>": bytes }) as one of
// these: those files are the folder adapter's objects of those ids.
function markFromCursors(cursors) {
    const mark = {};
    for (const [id, at] of Object.entries(cursors || {})) {
        const pc = (PC_DIR.exec(id) || [])[1]?.toLowerCase();
        const seq = Number((/\/changes-(\d+)/.exec(id) || [])[1]);
        if (!pc || !Number.isFinite(seq)) continue;
        (mark[pc] ||= { done: [], part: {} }).part[id] = [seq, Number(at) || 0];
    }
    return mark;
}

// getStore() -> the sync store (syncStore/), or null (off); or, instead,
// getFolder() -> the shared folder chosen, or null. getPairing() -> { id, key }
// (the code file's id and the key the code makes, syncPairing.cjs), or null
// (no code typed on this computer yet). describe() -> { name, version,
// bibles }: this computer as the others list it.
function createSyncEngine({
    store, mediaDir, getStore = null, getFolder = null, getPairing = () => null, describe = null, log = console.warn, batch = BATCH, now = () => new Date(), onStatus = null,
    gcEveryMs = GC_EVERY_MS, gcGraceMs = GC_GRACE_MS,
}) {
    const pc = String(store.pcId).toLowerCase();
    // A complete line that is not JSON, by object: the object's size when it
    // was seen. Skipped once the object stops changing (it was not still
    // arriving).
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
    // The state object last written, so an unchanged one is not written again.
    let published = "";
    let lastLogged = "";
    let applying = false;
    let running = null;
    let again = false;
    let timer = null;
    let debounce = null;
    let unsubscribe = null;
    let keys = null; // keysFor the pairing in use, made again when it changes
    let folderStore = null;

    // The store in use, or null (off).
    function current() {
        if (getStore) return getStore() || null;
        const folder = getFolder ? getFolder() : null;
        if (!folder) return null;
        const root = path.resolve(String(folder));
        if (!folderStore || folderStore.key !== root) folderStore = createFolderStore(root);
        return folderStore;
    }

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

    // What was read and the writer's number belong to one store; another
    // starts over (reading twice is harmless). The writer's state is also
    // this computer's: a database brought from elsewhere drops it. Another
    // code (it changed, or the computer joined again) reads everything again:
    // lines skipped under the old key may verify now. A state an older KERYX
    // saved (byte cursors by file) is taken as it was: those files are the
    // folder's objects of those ids.
    function loadState(key, pairing) {
        const saved = store.getMeta(STATE_KEY);
        const fresh = { store: key, pairing, seen: {}, part: {}, peers: {}, out: null, missing: [], me: null, removed: [], gc: emptyGc() };
        if (!saved || (saved.store ?? saved.folder) !== key) return fresh;
        const gc = saved.gc && typeof saved.gc === "object" ? saved.gc : {};
        const sameCode = saved.pairing === pairing;
        const legacy = !saved.seen && saved.cursors && typeof saved.cursors === "object";
        let part = sameCode && saved.part && typeof saved.part === "object" ? saved.part : {};
        if (sameCode && legacy) {
            part = {};
            for (const [id, p] of Object.entries(markFromCursors(saved.cursors))) {
                for (const [objId, [seq, at]] of Object.entries(p.part)) part[objId] = { pc: id, seq, at };
            }
        }
        let out = saved.out && saved.out.pc === pc ? saved.out : null;
        // An older KERYX's file number n: the objects from n + 1 on are this one's.
        if (out && !out.first) out = { pc, n: Number(out.n) || 0, first: (Number(out.n) || 0) + 1 };
        let marks = gc.marks && typeof gc.marks === "object" ? gc.marks : {};
        if (legacy) marks = Object.fromEntries(Object.entries(marks).map(([at, m]) => [at, markFromCursors(m)]));
        return {
            store: key,
            pairing,
            seen: sameCode && saved.seen && typeof saved.seen === "object" ? saved.seen : {},
            part,
            peers: sameCode && saved.peers && typeof saved.peers === "object" ? saved.peers : {},
            me: sameCode && saved.me && saved.me.pc === pc ? saved.me : null,
            removed: sameCode && Array.isArray(saved.removed) ? saved.removed : [],
            out,
            missing: Array.isArray(saved.missing) ? saved.missing : [],
            gc: {
                at: typeof gc.at === "string" ? gc.at : null,
                candidates: gc.candidates && typeof gc.candidates === "object" ? gc.candidates : {},
                marks,
                collected: Array.isArray(gc.collected) ? gc.collected : [],
            },
        };
    }
    const saveState = (state) => store.setMeta(STATE_KEY, state);
    const seenOf = (state, from) => {
        const t = state.seen[from] || (state.seen[from] = { done: [], dup: {} });
        if (!Array.isArray(t.done)) t.done = [];
        if (!t.dup || typeof t.dup !== "object") t.dup = {};
        return t;
    };

    // -- Out: this computer's outbox to the store ------------------------------

    // Copies the media a row names into media/; returns { file: size } for
    // the files that are here, so a reader knows when one has arrived whole.
    async function shipMedia(shared, media, row) {
        const sizes = {};
        for (const name of mediaRefs(row)) {
            const local = path.join(mediaDir, name);
            const size = await sizeOf(local);
            if (size < 0) continue;
            if (!media.has(name)) {
                const made = await shared.upload(mediaName(name), local);
                media.set(name, made ? [made] : []);
            }
            sizes[name] = size;
        }
        return Object.keys(sizes).length ? sizes : undefined;
    }

    // One new object per batch. Its number is kept before it is written, so
    // it is never used twice (a crash after the write sends the same entries
    // again under the next one, which nobody minds), and it is past every
    // number of this computer the store shows (its database brought back
    // from a backup).
    async function writeOut(shared, state, own, media) {
        let sent = 0;
        for (;;) {
            const entries = store.outbox(0, batch);
            if (!entries.length) break;
            const lines = coalesce(entries, pc);
            for (const line of lines) {
                if (line.op !== "upsert") continue;
                const sizes = await shipMedia(shared, media, line.row);
                if (sizes) line.media = sizes;
            }
            const text = lines.map((line) => keys.sign(JSON.stringify(line)) + "\n").join("") + endLine(lines.length);
            const onStore = own.reduce((n, o) => Math.max(n, parseChanges(o.name)?.seq || 0), 0);
            const seq = Math.max(state.out?.n || 0, onStore) + 1;
            state.out = { pc, n: seq, first: state.out?.first || seq };
            saveState(state);
            own.push(await shared.putNew(changesName(pc, seq), Buffer.from(text), { pc, seq: String(seq) }));
            // Only what is in the store is forgotten.
            store.pruneOutbox(entries[entries.length - 1].seq);
            sent += lines.length;
        }
        return sent;
    }

    // This computer's object, when what it says changed, it is gone, or it
    // is half a day old.
    async function writeComputer(shared, state) {
        if (!describe) return;
        let me;
        try {
            me = describe() || {};
        } catch {
            return;
        }
        const name = String(me.name || "").slice(0, 80);
        const version = String(me.version || "").slice(0, 40);
        const bibles = editionList(me.bibles);
        const last = state.me;
        const at = now();
        const fresh = last && last.name === name && last.version === version && String(last.bibles || []) === String(bibles)
            && at - Date.parse(last.at || 0) < COMPUTER_REFRESH_MS;
        if (fresh && (await shared.list(computerName(pc))).some((o) => o.name === computerName(pc))) return;
        const body = { pc, name, version, bibles, at: at.toISOString() };
        await shared.putWhole(computerName(pc), Buffer.from(keys.sign(JSON.stringify(body)) + "\n"));
        state.me = { pc, name, version, bibles, at: body.at };
    }

    // -- In: everyone else's changes -------------------------------------------

    function noteMissing(state, name, size) {
        const at = state.missing.findIndex((m) => m.name === name);
        if (at >= 0) state.missing.splice(at, 1);
        state.missing.push({ name, size: Number.isFinite(size) ? size : null });
        if (state.missing.length > MISSING_LIMIT) state.missing.splice(0, state.missing.length - MISSING_LIMIT);
    }

    // A file from media/ into the media folder, when it is there whole (the
    // size its row said; of two objects of the name, one that has it).
    // Through a hidden name, kept after a cut so the next try goes on from
    // it. Returns true when the file is here now.
    async function fetchFile(shared, media, name, expected) {
        const local = path.join(mediaDir, name);
        if ((await sizeOf(local)) >= 0) return true;
        const objs = (media.get(name) || []).filter((o) => expected == null || o.size === expected);
        if (!objs.length) return false;
        await fsp.mkdir(mediaDir, { recursive: true });
        const tmp = path.join(mediaDir, tempOf(name));
        for (const o of objs) {
            try {
                await shared.download(o.id, tmp);
            } catch {
                continue; // cut or locked: retried, from where it stopped
            }
            if ((await sizeOf(tmp)) !== o.size) {
                await fsp.rm(tmp, { force: true }).catch(() => {});
                continue;
            }
            if ((await sizeOf(local)) < 0) await fsp.rename(tmp, local);
            await fsp.rm(tmp, { force: true }).catch(() => {});
            return true;
        }
        return false;
    }

    async function fetchMedia(shared, media, state, entry) {
        if (entry.op !== "upsert") return;
        for (const name of mediaRefs(entry.row)) {
            const expected = entry.media && Number.isFinite(entry.media[name]) ? entry.media[name] : null;
            let here = false;
            try {
                here = await fetchFile(shared, media, name, expected);
            } catch { /* locked or offline: retried */ }
            if (!here) noteMissing(state, name, expected);
        }
    }

    async function retryMissing(shared, media, state) {
        const still = [];
        for (const m of state.missing) {
            let here = false;
            try {
                here = await fetchFile(shared, media, m.name, m.size);
            } catch { /* retried */ }
            if (!here) still.push(m);
        }
        state.missing = still;
    }

    async function applyBatch(shared, media, state, entries, totals) {
        if (!entries.length) return;
        for (const entry of entries) await fetchMedia(shared, media, state, entry);
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

    // Reads one changes object from where it was left. Stops at a last line
    // still without its newline, and at an unreadable line until the object
    // has stopped growing or a later line shows it went on; at its end line
    // it is done for good. `alone`: the only object of its name (else it is
    // remembered by its id). -> false when it is gone.
    async function readObject(shared, media, state, obj, from, alone, totals) {
        const seq = parseChanges(obj.name).seq;
        const seen = seenOf(state, from);
        if (alone ? inRanges(seen.done, seq) : seen.dup[obj.id]) return true;
        const part = state.part[obj.id];
        let offset = part ? Number(part.at) || 0 : 0;
        if (part && obj.size === offset) return true;
        // Shorter than what was read: replaced by another copy. Read it again.
        if (obj.size < offset) offset = 0;
        let buf;
        try {
            buf = await shared.read(obj.id);
        } catch {
            return true; // locked by the sync service: next pass
        }
        if (!buf) return false;
        if (buf.length < offset) offset = 0;
        let pos = offset;
        let pending = [];
        let ended = false;
        const flush = async () => {
            await applyBatch(shared, media, state, pending, totals);
            pending = [];
            if (ended) {
                delete state.part[obj.id];
                seen.done = addRange(seen.done, seq);
                if (!alone) seen.dup[obj.id] = 1;
            } else {
                state.part[obj.id] = { pc: from, seq, at: pos };
            }
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
                    if (!later && unreadable.get(obj.id) !== buf.length) {
                        unreadable.set(obj.id, buf.length);
                        break;
                    }
                    totals.bad += 1;
                    logOnce(`linha ilegível ignorada em ${obj.name}`);
                }
            }
            pos = nl + 1;
            if (isEnd(entry)) {
                ended = true;
                break;
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
                    logOnce(`linhas sem a assinatura do código da igreja ignoradas em ${obj.name}`);
                }
            }
            if (pending.length >= batch) await flush();
        }
        await flush();
        return true;
    }

    async function readIn(shared, media, state) {
        const totals = { applied: 0, skipped: 0, failed: 0, bad: 0, rejected: 0 };
        const out = new Map(state.removed.map((r) => [r.pc, r]));
        const changes = byPc((await shared.list("changes/")).filter((o) => parseChanges(o.name)));
        const who = byPc(await shared.list("computers/"));
        const states = byPc(await shared.list("state/"));
        const pcs = new Set([...changes.keys(), ...who.keys(), ...states.keys()]);
        const computers = [];
        for (const from of pcs) {
            if (from === pc) continue;
            const seen = { pc: from, name: null, version: null, bibles: [], seen: null, signed: null, files: 0, lastChange: 0 };
            const info = await bestComputer(shared, (who.get(from) || []).filter((o) => o.name === computerName(from)), keys);
            if (info) {
                seen.signed = info.verified;
                if (info.verified) Object.assign(seen, { name: info.name, version: info.version, bibles: info.bibles, seen: info.at });
            }
            // Taken out: listed, never read, until it types the code again.
            if (out.has(from)) {
                seen.removed = { at: out.get(from).at, by: out.get(from).by };
                computers.push(seen);
                continue;
            }
            // In order, the first made first among objects of one name.
            const objs = (changes.get(from) || []).sort((a, b) => (parseChanges(a.name).seq - parseChanges(b.name).seq) || a.created - b.created);
            const count = new Map();
            for (const o of objs) count.set(o.name, (count.get(o.name) || 0) + 1);
            for (const o of objs) {
                if (!(await readObject(shared, media, state, o, from, count.get(o.name) === 1, totals))) continue;
                seen.files += 1;
                seen.lastChange = Math.max(seen.lastChange, o.modified || 0);
            }
            computers.push(seen);
        }
        // verified: the last line read from it carried this church's
        // signature (false: it writes without the code, or with an old one);
        // with no line read yet, its computer object says; null: nothing at
        // all. name, version, bibles, seen: from its computer object, only
        // when signed.
        return {
            totals,
            computers: computers.map(({ signed, ...c }) => {
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

    // -- The cleanup of media/ ---------------------------------------------------
    //
    // media/ only grows as rows bring files; a video deleted on every
    // computer would hold the space for ever. A file there goes only when it
    // has been unused for gcGraceMs by every computer and every computer has
    // read past the moment it became unused — which is when each of them had
    // taken the deletes that freed it. Each computer says both in its own
    // state object (written after it reads): `read`, what it has read, and
    // `refs`, the media its rows use. A computer that has written changes
    // and no state object (one not yet run), or only an older KERYX's (whose
    // byte cursors say nothing about objects), holds every file. Only the
    // shared copy goes: the media folder of each computer is never touched.
    // A computer that still uses a file someone collected (a row edited while
    // it was away) puts it back from its own media folder: the names
    // collected are announced in the state object (`collected`). The state
    // object is signed like a line: only computers with the church's code
    // count, and a computer taken out ("Tirar") holds nothing back.

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

    const readOf = (state) => ({ seen: state.seen, part: state.part });

    async function publish(shared, state, names) {
        const body = { v: STATE_V, pc, read: readOf(state), refs: [...names].sort(), collected: state.gc.collected };
        const text = JSON.stringify(body);
        // Unchanged and still there (someone may have deleted it).
        if (text === published && (await shared.list(stateName(pc))).some((o) => o.name === stateName(pc))) return;
        await shared.putWhole(stateName(pc), Buffer.from(keys.sign(JSON.stringify({ ...body, at: now().toISOString() }))));
        published = text;
    }

    // The other computers that count: every one with a state object or whose
    // lines verified, and the newest signed state object each wrote (null:
    // none yet, which holds every file). A computer taken out, or one whose
    // lines never verified (no code, an old one), does not count. An older
    // KERYX's state object keeps its refs and its collected names, and holds
    // every file (its `read` cannot be compared with objects).
    async function readManifests(shared, state) {
        const seen = new Map();
        const out = new Set(state.removed.map((r) => r.pc));
        const listed = byPc(await shared.list("state/"));
        const pcs = new Set([...listed.keys(), ...Object.keys(state.peers)]);
        for (const from of pcs) {
            if (from === pc || out.has(from)) continue;
            let best = null;
            for (const o of (listed.get(from) || []).filter((x) => x.name === stateName(from))) {
                let text = null;
                try {
                    text = (await shared.read(o.id))?.toString("utf8").trim() || null;
                } catch { /* locked: as none */ }
                let manifest = null;
                if (text && keys.verify(text)) {
                    try {
                        manifest = JSON.parse(text);
                    } catch { /* not JSON: as none */ }
                }
                if (!manifest || String(manifest.pc || "").toLowerCase() !== from) continue;
                if (manifest.v !== STATE_V) manifest = { ...manifest, read: null };
                if (!best || String(manifest.at || "") > String(best.at || "")) best = manifest;
            }
            if (!best && state.peers[from]?.last !== "ok") continue;
            seen.set(from, best);
        }
        return seen;
    }

    // What has been read now, as every computer must have read it before a
    // file goes: for each computer, the numbers read to their end, and the
    // objects read part of the way (how far). This computer's own objects
    // are all there: from its first number on, whole; before it, the files
    // an older KERYX appended to, by their size.
    function markNow(state, own) {
        const mark = {};
        for (const [from, t] of Object.entries(state.seen)) mark[from] = { done: (t.done || []).map((r) => [...r]), part: {} };
        for (const [id, p] of Object.entries(state.part)) (mark[p.pc] ||= { done: [], part: {} }).part[id] = [p.seq, p.at];
        const first = state.out?.first || Infinity;
        const mine = { done: [], part: {} };
        const whole = [];
        for (const o of own) {
            const seq = parseChanges(o.name)?.seq;
            if (!seq) continue;
            if (seq >= first) whole.push(seq);
            else mine.part[o.id] = [seq, o.size];
        }
        mine.done = rangesOf(whole);
        mark[pc] = mine;
        return mark;
    }

    // Whether `read` (a computer's) covers the mark, the computer's own
    // objects aside.
    function readPast(who, read, mark) {
        if (!read || typeof read !== "object" || !read.seen || typeof read.seen !== "object") return false;
        const part = read.part && typeof read.part === "object" ? read.part : {};
        return Object.entries(mark).every(([owner, m]) => {
            if (owner === who) return true;
            const done = read.seen[owner]?.done || [];
            return (m.done || []).every((r) => rangeWithin(r, done))
                && Object.entries(m.part || {}).every(([id, [seq, size]]) => inRanges(done, seq) || (Number(part[id]?.at) || 0) >= size);
        });
    }

    async function collect(shared, state, names, media, own) {
        const gc = state.gc;
        const at = now();
        const manifests = await readManifests(shared, state);

        // Put back what someone collected that a row here still uses.
        const announced = [...gc.collected, ...[...manifests.values()].flatMap((m) => (m && Array.isArray(m.collected) ? m.collected : []))];
        for (const c of announced) {
            const name = c && typeof c.name === "string" ? c.name : null;
            if (!name || media.has(name) || !names.has(name)) continue;
            const local = path.join(mediaDir, name);
            if ((await sizeOf(local)) < 0) continue;
            try {
                const made = await shared.upload(mediaName(name), local);
                if (made) media.set(name, [made]);
            } catch { /* next time */ }
        }

        const used = new Set(names);
        for (const m of manifests.values()) for (const name of (m && Array.isArray(m.refs) ? m.refs : [])) used.add(name);
        const files = [...media.keys()].filter((n) => (media.get(n) || []).length);
        const present = new Set(files);
        for (const name of Object.keys(gc.candidates)) {
            if (used.has(name) || !present.has(name)) delete gc.candidates[name];
        }
        let mark = null;
        for (const name of files) {
            if (used.has(name) || gc.candidates[name]) continue;
            if (!mark) {
                mark = at.toISOString();
                gc.marks[mark] = markNow(state, own);
            }
            gc.candidates[name] = { since: mark, mark };
        }

        let removed = 0;
        const everyone = [[pc, readOf(state)], ...[...manifests].map(([who, m]) => [who, m && m.read && typeof m.read === "object" ? m.read : null])];
        for (const [name, c] of Object.entries(gc.candidates)) {
            if (at.getTime() - Date.parse(c.since) < gcGraceMs) continue;
            const marked = gc.marks[c.mark];
            if (!marked || !everyone.every(([who, read]) => readPast(who, read, marked))) continue;
            try {
                for (const o of media.get(name) || []) await shared.remove(o.id);
            } catch {
                continue; // locked by the sync service: next time
            }
            media.delete(name);
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

    // media/ by name: the objects of each (a name may have two).
    async function mediaIndex(shared) {
        const media = new Map();
        for (const o of await shared.list("media/")) {
            const name = o.name.slice("media/".length);
            if (!name || name.includes("/")) continue;
            if (!media.has(name)) media.set(name, []);
            media.get(name).push(o);
        }
        return media;
    }

    // -- A pass ----------------------------------------------------------------

    async function once() {
        let shared = null;
        try {
            shared = current();
        } catch { /* settings unreadable: off */ }
        if (!shared) {
            setStatus({ state: "off", folder: null });
            return;
        }
        const where = shared.where;
        const at = now().toISOString();
        let pairing = null;
        try {
            pairing = getPairing();
        } catch { /* unreadable: as if no code */ }
        // A store but no code: nothing is read or written (the outbox waits).
        if (!pairing || !pairing.id || !pairing.key) {
            setStatus({ state: "unpaired", folder: where, lastPass: at, error: null });
            return;
        }
        if (!keys || keys.id !== pairing.id || keys.key !== pairing.key) {
            keys = { ...keysFor(pairing.key, pairing.id), key: pairing.key };
            published = "";
        }
        // The folder itself is never made here: missing, it is a drive not
        // mounted or a sync service not running, not a place to start one.
        let up = false;
        try {
            up = await shared.available();
        } catch { /* as not there */ }
        if (!up) {
            const why = shared.kind === "folder" ? "A pasta de sincronização não está disponível." : "O Google Drive não respondeu.";
            setStatus({ ...status, state: "offline", folder: where, lastPass: at, error: why });
            logOnce(`indisponível: ${where}`);
            return;
        }
        try {
            // The store's code file: this code's, written back if it went
            // missing (any computer with the code can), or another code's —
            // then this computer neither reads nor writes until the new code
            // is typed here.
            const code = await readPairing(shared);
            if (code.state === "bad") {
                setStatus({ ...status, state: "offline", folder: where, lastPass: at, error: "O arquivo do código da igreja ainda está chegando pela pasta." });
                return;
            }
            let state = null;
            if (code.state === "missing") {
                state = loadState(shared.key, pairing.id);
                await writePairing(shared, pairingFile(keys, pc, now(), state.removed));
                logOnce("arquivo do código refeito");
            } else if (!matches(code.file, keys)) {
                setStatus({ ...status, state: "mismatch", folder: where, lastPass: at, error: "O código da igreja mudou nesta pasta. Digite o código novo para voltar a sincronizar." });
                logOnce("o código da pasta não é o deste computador");
                return;
            }
            state = state || loadState(shared.key, pairing.id);
            if (code.state === "ok") state.removed = removedOf(code.file, keys) || [];
            const me = state.removed.find((r) => r.pc === pc);
            if (me) {
                saveState(state);
                setStatus({ ...status, state: "removed", folder: where, lastPass: at, removed: { at: me.at, by: me.by }, error: "Este computador foi tirado da sincronização. Digite o código da igreja para voltar." });
                logOnce("este computador foi tirado da sincronização");
                return;
            }
            const own = (await shared.list(`changes/${pc}/`)).filter((o) => parseChanges(o.name)?.pc === pc);
            const media = await mediaIndex(shared);
            const sent = await writeOut(shared, state, own, media);
            await writeComputer(shared, state);
            const { totals, computers } = await readIn(shared, media, state);
            await retryMissing(shared, media, state);
            // A file no row here names any more is not waited for.
            const names = liveRefs();
            for (const m of state.missing) {
                if (!names.has(m.name)) await fsp.rm(path.join(mediaDir, tempOf(m.name)), { force: true }).catch(() => {});
            }
            state.missing = state.missing.filter((m) => names.has(m.name));
            const collected = gcDue(state) ? await collect(shared, state, names, media, own) : 0;
            saveState(state);
            await publish(shared, state, names);
            missingNow = state.missing.map((m) => m.name);
            const { bad, rejected, ...received } = totals;
            setStatus({
                state: "ok",
                folder: where,
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
            setStatus({ ...status, state: "error", folder: where, lastPass: at, error: `Não foi possível sincronizar: ${message}` });
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

    // On a timer (others' changes arrive whenever they reach the store) and
    // a moment after a local change to the church's content. Without a
    // store each pass ends at once.
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
            if (!current()) return [];
        } catch {
            return [];
        }
        return [...missingNow];
    }

    return { pass, poke, start, stop, status: () => status, missing };
}

module.exports = { createSyncEngine, inspectStore, inspectFolder, mediaRefs, coalesce, addRange, inRanges, endLine, STATE_KEY };
