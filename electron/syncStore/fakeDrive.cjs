// The `fakeDrive` adapter (index.cjs): Google Drive's appDataFolder in
// memory, for the tests, holding the engine to Drive's rules:
//
//   - objects are immutable: putNew always makes another object, even under
//     a name already there (names are not unique); only putWhole changes an
//     object's bytes, whole (a new revision); there is no append or rename;
//   - the listing lags: with `lag: n`, an object made shows in a listing
//     only after n more list calls, and one removed keeps showing for n
//     (read(id) of it then answers null); hide()/reveal() hold objects back
//     by name for as long as a test wants;
//   - any call can fail: failNext(op, n, match) makes the next n calls of op
//     throw (op "*" = any; match(name), when given, picks the objects), and
//     offline makes available() false and every call throw;
//   - transfers resume: an upload or download cut with cutNext(op, bytes)
//     goes on from where it stopped the next time (stats counts the bytes
//     that really moved).
//
// One fake is one church's Drive, shared by every test computer.

const fs = require("node:fs");
const crypto = require("node:crypto");
const { oldestOf, firstWins } = require("./rules.cjs");

const fsp = fs.promises;

function createFakeDrive({ lag = 0, key = "drive:fake" } = {}) {
    const objects = new Map(); // id -> { id, name, bytes, props, created, modified, shownAt, goneAt }
    let listCalls = 0;
    let clock = 1_000_000;
    const tick = () => ++clock;
    const hidden = [];
    const failing = []; // { op, left, match }
    const cuts = new Map(); // "upload" | "download" -> bytes before the cut
    const sessions = new Map(); // "<name>\0<file>" -> bytes already up
    const stats = { uploaded: 0, downloaded: 0, puts: 0 };
    const fake = { offline: false, lag };

    // name: the object's (or the prefix listed).
    function check(op, name = "") {
        if (fake.offline) throw Object.assign(new Error("sem internet"), { code: "offline" });
        const f = failing.find((x) => x.left > 0 && (x.op === op || x.op === "*") && (!x.match || x.match(name)));
        if (f) {
            f.left -= 1;
            throw Object.assign(new Error(`falha simulada em ${op}`), { code: "simulated" });
        }
    }
    const nameOf = (id) => objects.get(id)?.name || "";

    const meta = (o) => ({ id: o.id, name: o.name, size: o.bytes.length, created: o.created, modified: o.modified, props: { ...o.props } });
    const isHidden = (name) => hidden.some((h) => (typeof h === "function" ? h(name) : h instanceof RegExp ? h.test(name) : h === name));

    function make(name, bytes, props = {}) {
        const id = crypto.randomBytes(12).toString("base64url");
        const at = tick();
        const o = { id, name: String(name), bytes: Buffer.from(bytes), props: { ...props }, created: at, modified: at, shownAt: listCalls + fake.lag, goneAt: null };
        objects.set(id, o);
        stats.puts += 1;
        return o;
    }

    const live = (o) => o && o.goneAt === null;

    async function list(prefix = "") {
        check("list", prefix);
        listCalls += 1;
        const out = [];
        for (const o of objects.values()) {
            if (!o.name.startsWith(String(prefix))) continue;
            const shown = listCalls > o.shownAt && !isHidden(o.name);
            const ghost = o.goneAt !== null && listCalls <= o.goneAt;
            if (live(o) ? shown : ghost) out.push(meta(o));
        }
        // Drive's own order is no promise: the newest first, so a reader
        // that relies on it is caught.
        return out.sort((a, b) => b.created - a.created);
    }

    async function read(id) {
        check("read", nameOf(id));
        const o = objects.get(id);
        return live(o) ? Buffer.from(o.bytes) : null;
    }

    async function putNew(name, bytes, props) {
        check("putNew", name);
        return meta(make(name, bytes, props));
    }

    // As a Drive adapter does it: look the name up (the listing may not show
    // it yet: then another object is made), update the oldest, drop the rest.
    async function putWhole(name, bytes) {
        check("putWhole", name);
        const same = (await list(name)).filter((o) => o.name === name);
        const keep = oldestOf(same);
        if (!keep || !live(objects.get(keep.id))) return meta(make(name, bytes));
        const o = objects.get(keep.id);
        o.bytes = Buffer.from(bytes);
        o.modified = tick();
        stats.puts += 1;
        for (const other of same) if (other.id !== keep.id) await remove(other.id);
        return meta(o);
    }

    const putIfAbsent = (name, bytes) => firstWins(api, name, bytes);

    async function remove(id) {
        check("remove", nameOf(id));
        const o = objects.get(id);
        if (live(o)) o.goneAt = listCalls + fake.lag;
    }

    async function upload(name, fromFile) {
        check("upload", name);
        const bytes = await fsp.readFile(fromFile);
        const session = `${name}\u0000${fromFile}`;
        const from = sessions.get(session) || 0;
        const cut = cuts.get("upload");
        if (cut != null) {
            cuts.delete("upload");
            const upTo = Math.min(bytes.length, from + cut);
            stats.uploaded += upTo - from;
            sessions.set(session, upTo);
            throw Object.assign(new Error("envio interrompido"), { code: "cut" });
        }
        stats.uploaded += bytes.length - from;
        sessions.delete(session);
        return meta(make(name, bytes));
    }

    async function download(id, toFile) {
        check("download", nameOf(id));
        const o = objects.get(id);
        if (!live(o)) throw Object.assign(new Error("o arquivo não está mais no Drive"), { code: "gone" });
        let have = 0;
        try {
            const st = await fsp.stat(toFile);
            have = st.size <= o.bytes.length ? st.size : 0;
        } catch { /* nothing yet */ }
        if (have === 0) await fsp.writeFile(toFile, Buffer.alloc(0));
        const cut = cuts.get("download");
        const upTo = cut != null ? Math.min(o.bytes.length, have + cut) : o.bytes.length;
        if (cut != null) cuts.delete("download");
        await fsp.appendFile(toFile, o.bytes.subarray(have, upTo));
        stats.downloaded += upTo - have;
        if (upTo < o.bytes.length) throw Object.assign(new Error("download interrompido"), { code: "cut" });
    }

    async function available() {
        return !fake.offline;
    }

    const api = { kind: "drive", where: "Google Drive (teste)", key, available, list, read, putNew, putWhole, putIfAbsent, remove, upload, download };

    // For the tests: what is there, by name, whatever the listing says.
    Object.assign(fake, api, {
        stats,
        failNext(op, n = 1, match = null) { failing.push({ op, left: n, match }); },
        cutNext(op, bytes) { cuts.set(op, bytes); },
        hide(match) { hidden.push(match); },
        reveal() { hidden.length = 0; },
        // Every object that is there now (never lagging), oldest first.
        all(prefix = "") {
            return [...objects.values()].filter((o) => live(o) && o.name.startsWith(prefix)).sort((a, b) => a.created - b.created).map(meta);
        },
        bytesOf(id) { const o = objects.get(id); return live(o) ? Buffer.from(o.bytes) : null; },
        // The one object of a name (the oldest), its text.
        text(name) { const o = oldestOf(fake.all(name).filter((x) => x.name === name)); return o ? objects.get(o.id).bytes.toString("utf8") : null; },
        // A test writing an object as another computer, or a service, would.
        put(name, bytes, props) { return meta(make(name, bytes, props)); },
        drop(prefix) { for (const o of objects.values()) if (live(o) && o.name.startsWith(prefix)) o.goneAt = listCalls + fake.lag; },
        // Replace an object's bytes in place (Drive's update: one revision).
        rewrite(id, bytes) { const o = objects.get(id); o.bytes = Buffer.from(bytes); o.modified = tick(); },
    });
    return fake;
}

module.exports = { createFakeDrive };
