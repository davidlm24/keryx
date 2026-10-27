// PCs verificados (docs/desktop-architecture.md §8b): the key every
// computer that entered with the church's Google account uses, so only they
// count (Google Drive direto, the owner's item 4, 27/10: the account is the
// access control, as in Holyrics; the church's code of the shared folder
// went in PR 4).
//
//   keryx-sync.json   { v: 2, id, check, made, by, removed, key, mac }
//
// kept in the account's hidden appDataFolder, which only KERYX reads.
//
// - key: 32 random bytes (base64url), made by the first computer that
//   entered with the account (joinDrive: putIfAbsent, the first made wins,
//   so two first computers end on one key) and read by every other one.
// - id: random, made with the key. check: proves the key whole (a key that
//   does not make the check is a damaged object).
// - removed: the computers taken out from another one (Dispositivos
//   conectados › Desconectar) — [{ pc, at, by }]. Each stops until someone
//   enters with the account on it again; the others skip its changes
//   meanwhile. Only a list under a valid mac counts.
// - mac: an HMAC of the rest with the key.
//
// Every line a computer writes to its changes objects ends in "sig": an
// HMAC-SHA256 of the line's own bytes before it (16 bytes, base64url), so a
// line is checked alone. A line without a valid signature (a damaged object,
// a computer with another key) is counted for that computer and never
// applied. The signatures catch a damaged or half object, not someone with
// the account's password.
//
// Only the object named keryx-sync.json counts, the first made when there
// are several (Drive's names are not unique). A computer that holds the key
// writes the object back when it is missing or damaged (sync.cjs), with the
// same key; one that does not (a new computer) makes a new key over an
// object that is plainly damaged, and the others take it (syncControl.cjs,
// then each sends everything again, as joining does). A file of the old
// kinds — the folder's code file (v 1) or PR 2's Drive code file, never
// released — carries no key and is written over the same way.
//
// Pure Node (crypto) over a store, tested in sync.test.cjs.

const crypto = require("node:crypto");
const { oldestOf } = require("./syncStore/rules.cjs");

const PAIRING_FILE = "keryx-sync.json";
const VERSION = 2;
const KEY_BYTES = 32;
const REMOVED_LIMIT = 200;
const SIG_BYTES = 16;
const SIG_TAIL = /,"sig":"([A-Za-z0-9_-]{22})"\}$/;

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const hmac = (key, text) => crypto.createHmac("sha256", key).update(text).digest();
const sameText = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// What a key signs and proves. `key` is the account's key, `id` its
// file's: sign(body) turns the JSON text of an object into the line written
// (the same object plus "sig", last); verify(text) says whether a line read
// carries this key's signature over its own bytes.
function keysFor(key, id) {
    const lineKey = hmac(key, "keryx-sync-lines");
    const mac = (body) => b64url(hmac(lineKey, body).subarray(0, SIG_BYTES));
    return {
        id,
        check: b64url(hmac(key, `keryx-sync-check:${id}`)),
        sign(body) {
            const text = String(body);
            if (!text.startsWith("{") || !text.endsWith("}") || text === "{}") throw new Error("linha inválida");
            return `${text.slice(0, -1)},"sig":"${mac(text)}"}`;
        },
        verify(text) {
            const m = SIG_TAIL.exec(String(text));
            if (!m) return false;
            return sameText(m[1], mac(`${text.slice(0, m.index)}}`));
        },
        // The key file's mac: over its fields in a fixed order.
        fileMac: (f) => b64url(hmac(lineKey, JSON.stringify(["keryx-sync-file", f.v, f.id, f.check, f.made, f.by, cleanRemoved(f.removed).map((r) => [r.pc, r.at, r.by])]))),
    };
}

// [{ pc, at, by }], well formed, one per computer, at most REMOVED_LIMIT.
function cleanRemoved(list) {
    const out = [];
    const seen = new Set();
    for (const r of Array.isArray(list) ? list : []) {
        if (!r || typeof r.pc !== "string" || !r.pc || r.pc.length > 100 || seen.has(r.pc.toLowerCase())) continue;
        seen.add(r.pc.toLowerCase());
        out.push({ pc: r.pc.toLowerCase(), at: typeof r.at === "string" ? r.at.slice(0, 40) : "", by: typeof r.by === "string" ? r.by.slice(0, 100) : "" });
        if (out.length >= REMOVED_LIMIT) break;
    }
    return out;
}

// The key file: for a new key, or the same key with another list of
// computers taken out. It carries the key itself (`secret`).
function pairingFile(keys, pc, now = new Date(), removed = [], made = null, secret) {
    if (!Buffer.isBuffer(secret)) throw new Error("o arquivo da sincronização leva a chave");
    const file = { v: VERSION, id: keys.id, check: keys.check, made: made || now.toISOString(), by: pc, removed: cleanRemoved(removed) };
    return { ...file, key: b64url(secret), mac: keys.fileMac(file) };
}

// The key a file carries, when it is whole (it makes the file's
// check), else null.
function secretOf(file) {
    if (!file || typeof file.key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(file.key)) return null;
    const key = Buffer.from(file.key, "base64url");
    if (key.length !== KEY_BYTES) return null;
    return matches(file, keysFor(key, file.id)) ? key : null;
}

// The computers taken out, from a key file with a valid mac; null when the
// mac does not verify (edited without the key: nobody is taken out by it).
function removedOf(file, keys) {
    if (!file || !keys || typeof file.mac !== "string" || !sameText(file.mac, keys.fileMac(file))) return null;
    return cleanRemoved(file.removed);
}

const isPairingFile = (f) => f && typeof f === "object" && !Array.isArray(f)
    && typeof f.id === "string" && f.id.length >= 8 && f.id.length <= 100 && typeof f.check === "string";

// -> { state: "missing" } | { state: "bad", reason } (half downloaded, or
// not ours: reason "read" when it could not be read now, "content" when
// what was read is not a key file) | { state: "ok", file }. A store that
// cannot be listed throws.
async function readPairing(store) {
    const first = oldestOf((await store.list(PAIRING_FILE)).filter((o) => o.name === PAIRING_FILE));
    if (!first) return { state: "missing" };
    let text;
    try {
        const bytes = await store.read(first.id);
        if (!bytes) return { state: "missing" };
        text = bytes.toString("utf8");
    } catch {
        return { state: "bad", reason: "read" }; // offline, or Drive busy
    }
    try {
        const file = JSON.parse(text);
        return isPairingFile(file) ? { state: "ok", file } : { state: "bad", reason: "content" };
    } catch {
        return { state: "bad", reason: "content" };
    }
}

// Writes the key file. Without `replace`, only where there is none (false
// when one is already there: another computer made a key first). With it
// (damaged, or the list changed), over the old one, whole.
async function writePairing(store, file, { replace = false } = {}) {
    const bytes = Buffer.from(JSON.stringify(file, null, 2) + "\n");
    if (!replace) return store.putIfAbsent(PAIRING_FILE, bytes);
    await store.putWhole(PAIRING_FILE, bytes);
    return true;
}

// The store's key file is this pairing's.
const matches = (file, keys) => Boolean(file && keys && file.id === keys.id && sameText(file.check, keys.check));

// Changes the list of computers taken out (Desconectar / Deixar voltar, and
// a computer that entered again taking itself off it): the store's key file
// must be this pairing's.
// "nocode" | "busy" | "mismatch" }.
async function updateRemoved(store, pairing, change, { pc, now = new Date() } = {}) {
    const keys = keysFor(pairing.key, pairing.id);
    const found = await readPairing(store);
    if (found.state === "missing") return { error: "nocode" };
    if (found.state !== "ok") return { error: "busy" };
    if (!matches(found.file, keys)) return { error: "mismatch" };
    const before = removedOf(found.file, keys) || [];
    const after = cleanRemoved(change(before.map((r) => ({ ...r })), now));
    if (JSON.stringify(after) === JSON.stringify(before) && found.file.mac === keys.fileMac(found.file)) return after;
    await writePairing(store, pairingFile(keys, found.file.by || pc, now, after, found.file.made, pairing.key), { replace: true });
    return after;
}

// The account's key, the one every computer that enters with it uses. -> { id, key, created } (created: this computer made it),
// or { error: "busy" } (the object could not be read now: try again).
//
// - A whole file: its key, whatever `mine` is (the first made wins, so two
//   computers that made one at the same moment end on the oldest).
// - None yet: a new key, put only where there is none.
// - A file that is no key file — damaged, or a code file of before (the
//   folder's, or PR 2's, never released) — is written over: with `mine` (the
//   key this computer already has for this account: nobody else's lines
//   change), else with a new key (the computers that had the old one take
//   the new one and send everything again).
async function joinDrive(store, { pc, now = new Date(), mine = null } = {}) {
    for (let tries = 0; tries < 3; tries += 1) {
        const found = await readPairing(store);
        if (found.state === "bad" && found.reason === "read") return { error: "busy" };
        const key = found.state === "ok" ? secretOf(found.file) : null;
        if (key) return { id: found.file.id, key, created: false };
        if (found.state === "missing") {
            const made = newDriveKey();
            const file = pairingFile(keysFor(made.key, made.id), pc, now, [], null, made.key);
            if (await writePairing(store, file)) return { ...made, created: true };
            continue; // another computer made it first: take that one
        }
        const use = mine && mine.id && Buffer.isBuffer(mine.key) ? { id: mine.id, key: mine.key } : newDriveKey();
        const keys = keysFor(use.key, use.id);
        const removed = (found.state === "ok" && removedOf(found.file, keys)) || [];
        await writePairing(store, pairingFile(keys, pc, now, removed, null, use.key), { replace: true });
        return { ...use, created: !mine };
    }
    return { error: "busy" };
}

const newDriveKey = () => ({ id: crypto.randomUUID(), key: crypto.randomBytes(KEY_BYTES) });

module.exports = { PAIRING_FILE, keysFor, pairingFile, secretOf, removedOf, readPairing, writePairing, matches, updateRemoved, joinDrive };
