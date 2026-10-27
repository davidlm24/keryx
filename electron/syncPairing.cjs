// PCs verificados (docs/desktop-architecture.md §8b): what the church's sync
// code (shared/syncCode.mjs) turns into, so only computers that typed it
// count.
//
//   keryx-sync.json   { v: 1, id, check, made, by, removed, mac }
//
// kept in the sync's store (electron/syncStore/: the shared folder's
// sync/keryx-sync.json, or an object of that name on Drive).
//
// - id: random, made with the code (and again when the code changes). It
//   salts the key, so the same code in another folder is another key.
// - check: proves a typed code is this folder's before a single line is read.
// - removed: the computers taken out of the sync from another one ("Tirar",
//   owner 2026-10-16) — [{ pc, at, by }]. Each stops until the code is typed
//   on it again; the others skip its folder meanwhile. Only a list under a
//   valid mac counts (someone without the key cannot take a computer out).
// - mac: an HMAC of the rest with the key.
// - The code and the key are never in the folder.
//
// The key is scrypt(code, id). Every line a computer appends to its change
// files ends in "sig": an HMAC-SHA256 of the line's own bytes before it (16
// bytes, base64url), so a line is checked alone — a file still arriving, a
// conflict copy, an old file read again all stay as harmless as they were. A
// line without a valid signature (a computer that never had the code, or has
// the old one after the code changed) is counted for that computer and never
// applied.
//
// Only the object named keryx-sync.json counts, the first made when there
// are several (Drive's names are not unique; the folder's conflict copies
// have other names). Two computers that made a code at the same moment: the
// one that lost sees "outro código" and types the code that stayed.
//
// On Google Drive there is no code (Google Drive direto, the owner's item 4,
// 27/10): the church's account is the access control, as in Holyrics, and
// the hidden appDataFolder only KERYX reads keeps the key itself.
//
//   keryx-sync.json   { v: 2, id, check, made, by, removed, key, mac }
//
// - key: 32 random bytes (base64url), made by the first computer that
//   entered with the account (joinDrive: putIfAbsent, the first made wins,
//   so two first computers end on one key) and read by every other one.
//   `check` proves it whole (a key that does not make the check is a
//   damaged object). The key is never derived from a code, and a folder's
//   code file never carries one.
// - The rest is as above: the lines and state objects keep their signatures
//   (they catch a damaged or half object, not someone with the account's
//   password), the removed list is Desconectar's.
// - A computer that holds the account's key writes the object back when it
//   is missing or damaged (sync.cjs), with the same key; one that does not
//   (a new computer) makes a new key over an object that is plainly damaged,
//   and the others take it (syncControl.cjs, then each sends everything
//   again, as joining does).
//
// Pure Node (crypto) over a store, tested in sync.test.cjs.

const crypto = require("node:crypto");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { oldestOf } = require("./syncStore/rules.cjs");

const PAIRING_FILE = "keryx-sync.json";
const VERSION = 1;
const DRIVE_VERSION = 2;
const KEY_BYTES = 32;
// About half a second and 64 MB per try, paid once when a code is made or
// typed: the code is short (35 bits, the owner's pick), so each guess of it
// from a line copied out of the folder has to be slow.
const SCRYPT = { N: 2 ** 16, r: 8, p: 1, maxmem: 160 * 1024 * 1024 };
const REMOVED_LIMIT = 200;
const SIG_BYTES = 16;
const SIG_TAIL = /,"sig":"([A-Za-z0-9_-]{22})"\}$/;

const codeRules = () => import(pathToFileURL(path.join(__dirname, "..", "shared", "syncCode.mjs")).href);

const b64url = (buf) => Buffer.from(buf).toString("base64url");
const hmac = (key, text) => crypto.createHmac("sha256", key).update(text).digest();
const sameText = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
};

// The key for a code (the 12 symbols, as parseCode gives them) in the folder
// whose code file has this id.
function deriveKey(code, id) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(String(code), `keryx-sync:${id}`, KEY_BYTES, SCRYPT, (err, key) => (err ? reject(err) : resolve(key)));
    });
}

// What a key signs and proves. `key` is the derived key, `id` the code
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
        // The code file's mac: over its fields in a fixed order.
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

// The code file: for a new code, or the same code with another list of
// computers taken out. With `secret` (the key itself: Drive's), the file
// carries it (v 2).
function pairingFile(keys, pc, now = new Date(), removed = [], made = null, secret = null) {
    const file = { v: secret ? DRIVE_VERSION : VERSION, id: keys.id, check: keys.check, made: made || now.toISOString(), by: pc, removed: cleanRemoved(removed) };
    return { ...file, ...(secret ? { key: b64url(secret) } : {}), mac: keys.fileMac(file) };
}

// The key a Drive file carries, when it is whole (it makes the file's
// check), else null.
function secretOf(file) {
    if (!file || typeof file.key !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(file.key)) return null;
    const key = Buffer.from(file.key, "base64url");
    if (key.length !== KEY_BYTES) return null;
    return matches(file, keysFor(key, file.id)) ? key : null;
}

// The computers taken out, from a code file with a valid mac; null when the
// mac does not verify (edited without the key: nobody is taken out by it).
function removedOf(file, keys) {
    if (!file || !keys || typeof file.mac !== "string" || !sameText(file.mac, keys.fileMac(file))) return null;
    return cleanRemoved(file.removed);
}

const isPairingFile = (f) => f && typeof f === "object" && !Array.isArray(f)
    && typeof f.id === "string" && f.id.length >= 8 && f.id.length <= 100 && typeof f.check === "string";

// -> { state: "missing" } | { state: "bad", reason } (half downloaded, or
// not ours: reason "read" when it could not be read now, "content" when
// what was read is not a code file) | { state: "ok", file }. A store that
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
        return { state: "bad", reason: "read" }; // locked by the sync service, or offline
    }
    try {
        const file = JSON.parse(text);
        return isPairingFile(file) ? { state: "ok", file } : { state: "bad", reason: "content" };
    } catch {
        return { state: "bad", reason: "content" };
    }
}

// Writes the code file. Without `replace`, only where there is none (false
// when one is already there: another computer made a code first). With it
// (the code changed), over the old one, whole.
async function writePairing(store, file, { replace = false } = {}) {
    const bytes = Buffer.from(JSON.stringify(file, null, 2) + "\n");
    if (!replace) return store.putIfAbsent(PAIRING_FILE, bytes);
    await store.putWhole(PAIRING_FILE, bytes);
    return true;
}

// The folder's code file is this pairing's.
const matches = (file, keys) => Boolean(file && keys && file.id === keys.id && sameText(file.check, keys.check));

// A new code for the folder: { code: "K7QM-2HXP", id, key }, or
// { error: "exists" } when the folder already has one (and `replace` was not
// asked: changing the code is asking).
async function createPairing(store, { pc, replace = false, now = new Date() } = {}) {
    const { makeCode, parseCode, formatCode } = await codeRules();
    const { code } = parseCode(makeCode());
    const id = crypto.randomUUID();
    const key = await deriveKey(code, id);
    const written = await writePairing(store, pairingFile(keysFor(key, id), pc, now), { replace });
    if (!written) return { error: "exists" };
    return { code: formatCode(code), id, key };
}

// A typed code against the folder's: { code, id, key } when it is this
// folder's, else { error } — a parseCode error ("short", "check", …),
// "nocode" (the folder has no code yet), "busy" (its file is still arriving)
// or "wrong" (a valid code, but not this folder's).
async function joinPairing(store, typed) {
    const { parseCode, formatCode } = await codeRules();
    const parsed = parseCode(typed);
    if (parsed.error) return parsed;
    const found = await readPairing(store);
    if (found.state === "missing") return { error: "nocode" };
    if (found.state !== "ok") return { error: "busy" };
    const key = await deriveKey(parsed.code, found.file.id);
    if (!matches(found.file, keysFor(key, found.file.id))) return { error: "wrong" };
    return { code: formatCode(parsed.code), id: found.file.id, key };
}

// Changes the list of computers taken out ("Tirar" / "Deixar voltar", and
// a computer that typed the code again taking itself off it): the folder's
// code file must be this pairing's. -> the new list, or { error:
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
    // Drive's file keeps the key it carries (it is this pairing's: matches).
    const secret = pairing.share || found.file.key ? pairing.key : null;
    await writePairing(store, pairingFile(keys, found.file.by || pc, now, after, found.file.made, secret), { replace: true });
    return after;
}

// Drive (no code): the account's key, the one every computer that enters
// with it uses. -> { id, key, created } (created: this computer made it),
// or { error: "busy" } (the object could not be read now: try again).
//
// - A whole file: its key, whatever `mine` is (the first made wins, so two
//   computers that made one at the same moment end on the oldest).
// - None yet: a new key, put only where there is none.
// - A file that is no Drive key file — damaged, or a code file of the old
//   Drive mode (PR 2, never released) — is written over: with `mine` (the
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

module.exports = { PAIRING_FILE, deriveKey, keysFor, pairingFile, secretOf, removedOf, readPairing, writePairing, matches, createPairing, joinPairing, updateRemoved, joinDrive, codeRules };
