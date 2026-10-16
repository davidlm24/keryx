// PCs verificados (docs/desktop-architecture.md §8b): what the church's sync
// code (shared/syncCode.mjs) turns into, so only computers that typed it
// count.
//
//   <folder>/sync/keryx-sync.json   { v: 1, id, check, made, by, removed, mac }
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
// Only the file named keryx-sync.json counts. Two computers that made a code
// at the same moment leave a conflict copy beside it; the one that lost sees
// "outro código" and types the code of the file that stayed.
//
// Pure Node (crypto, fs), tested in sync.test.cjs.

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const fsp = fs.promises;

const PAIRING_FILE = "keryx-sync.json";
const VERSION = 1;
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
// computers taken out.
function pairingFile(keys, pc, now = new Date(), removed = [], made = null) {
    const file = { v: VERSION, id: keys.id, check: keys.check, made: made || now.toISOString(), by: pc, removed: cleanRemoved(removed) };
    return { ...file, mac: keys.fileMac(file) };
}

// The computers taken out, from a code file with a valid mac; null when the
// mac does not verify (edited without the key: nobody is taken out by it).
function removedOf(file, keys) {
    if (!file || !keys || typeof file.mac !== "string" || !sameText(file.mac, keys.fileMac(file))) return null;
    return cleanRemoved(file.removed);
}

const isPairingFile = (f) => f && typeof f === "object" && !Array.isArray(f)
    && typeof f.id === "string" && f.id.length >= 8 && f.id.length <= 100 && typeof f.check === "string";

// -> { state: "missing" } | { state: "bad" } (half downloaded, or not ours)
// | { state: "ok", file }.
async function readPairing(syncDir) {
    let text;
    try {
        text = await fsp.readFile(path.join(syncDir, PAIRING_FILE), "utf8");
    } catch (err) {
        return { state: err && err.code === "ENOENT" ? "missing" : "bad" };
    }
    try {
        const file = JSON.parse(text);
        return isPairingFile(file) ? { state: "ok", file } : { state: "bad" };
    } catch {
        return { state: "bad" };
    }
}

// Writes the code file. Without `replace`, only where there is none (false
// when one is already there: another computer made a code first). With it
// (the code changed), over the old one, through a temporary name.
async function writePairing(syncDir, file, { replace = false } = {}) {
    await fsp.mkdir(syncDir, { recursive: true });
    const target = path.join(syncDir, PAIRING_FILE);
    const text = JSON.stringify(file, null, 2) + "\n";
    if (!replace) {
        try {
            await fsp.writeFile(target, text, { flag: "wx" });
            return true;
        } catch (err) {
            if (err && err.code === "EEXIST") return false;
            throw err;
        }
    }
    const tmp = path.join(syncDir, `.${PAIRING_FILE}.${process.pid}.partial`);
    try {
        await fsp.writeFile(tmp, text);
        await fsp.rename(tmp, target);
    } finally {
        await fsp.rm(tmp, { force: true }).catch(() => {});
    }
    return true;
}

// The folder's code file is this pairing's.
const matches = (file, keys) => Boolean(file && keys && file.id === keys.id && sameText(file.check, keys.check));

// A new code for the folder: { code: "K7QM-2HXP", id, key }, or
// { error: "exists" } when the folder already has one (and `replace` was not
// asked: changing the code is asking).
async function createPairing(syncDir, { pc, replace = false, now = new Date() } = {}) {
    const { makeCode, parseCode, formatCode } = await codeRules();
    const { code } = parseCode(makeCode());
    const id = crypto.randomUUID();
    const key = await deriveKey(code, id);
    const written = await writePairing(syncDir, pairingFile(keysFor(key, id), pc, now), { replace });
    if (!written) return { error: "exists" };
    return { code: formatCode(code), id, key };
}

// A typed code against the folder's: { code, id, key } when it is this
// folder's, else { error } — a parseCode error ("short", "check", …),
// "nocode" (the folder has no code yet), "busy" (its file is still arriving)
// or "wrong" (a valid code, but not this folder's).
async function joinPairing(syncDir, typed) {
    const { parseCode, formatCode } = await codeRules();
    const parsed = parseCode(typed);
    if (parsed.error) return parsed;
    const found = await readPairing(syncDir);
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
async function updateRemoved(syncDir, pairing, change, { pc, now = new Date() } = {}) {
    const keys = keysFor(pairing.key, pairing.id);
    const found = await readPairing(syncDir);
    if (found.state === "missing") return { error: "nocode" };
    if (found.state !== "ok") return { error: "busy" };
    if (!matches(found.file, keys)) return { error: "mismatch" };
    const before = removedOf(found.file, keys) || [];
    const after = cleanRemoved(change(before.map((r) => ({ ...r })), now));
    if (JSON.stringify(after) === JSON.stringify(before) && found.file.mac === keys.fileMac(found.file)) return after;
    await writePairing(syncDir, pairingFile(keys, found.file.by || pc, now, after, found.file.made), { replace: true });
    return after;
}

module.exports = { PAIRING_FILE, deriveKey, keysFor, pairingFile, removedOf, readPairing, writePairing, matches, createPairing, joinPairing, updateRemoved, codeRules };
