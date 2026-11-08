// The phones paired to this computer by QR (owner 2026-11-08, "KERYX no
// celular · parear por QR", marks M1–M5 = A; as in Holyrics). Each phone
// scans a QR once and keeps a key of its own: no code typed, and each can
// be disconnected alone.
//
//   - a ticket: 16 random bytes, valid for 5 minutes and for one phone only,
//     kept in memory (never saved). Opening the QR's link only shows the page
//     (WhatsApp and the camera open links by themselves); the page's
//     Conectar button spends it (redeem).
//   - a device: { id, role, name, hash, createdAt, lastSeen, agent } in
//     settings.json "network".devices, this computer's alone (never synced:
//     a phone's cookie is for this computer's address anyway). Only the
//     sha256 of its key is kept; the key itself lives in the phone's cookie
//     `keryx_dev=<id>.<key>`.
//   - lastSeen moves in memory at every request and is saved at most every
//     10 minutes per device (and on stop): a phone polling every few seconds
//     never rewrites settings.json.
//   - a device not seen for 180 days leaves by itself (M2 = A); 30 at most per
//     computer (the oldest seen goes first).
//   - an invite (owner 2026-11-08, "mais simples" N9 = A): the same ticket
//     sent as a link (WhatsApp, Copiar link) so nobody walks to the sound
//     booth — 24 hours, one phone. Unlike the QR it outlives a restart (the
//     link is sent on Saturday, the computer starts on Sunday): kept in
//     "network".invites as the sha256 of the ticket, never the ticket; 20 at
//     most, the oldest goes first.
//
// Pure Node, unit tested (phoneDevices.test.cjs).

const crypto = require("node:crypto");

const ROLES = new Set(["control", "team"]);
const TICKET_MS = 5 * 60 * 1000;
const INVITE_MS = 24 * 60 * 60 * 1000;
const MAX_INVITES = 20;
const MAX_TICKETS = 4;
const MAX_DEVICES = 30;
const STALE_MS = 180 * 24 * 60 * 60 * 1000;
const SAVE_EVERY_MS = 10 * 60 * 1000;
const NAME_MAX = 40;
const COOKIE_RE = /^([a-f0-9]{16})\.([A-Za-z0-9_-]{43})$/;

const hashOf = (key) => crypto.createHash("sha256").update(String(key)).digest("hex");
const sameHex = (a, b) => {
    const x = Buffer.from(String(a), "hex");
    const y = Buffer.from(String(b), "hex");
    return x.length === 32 && x.length === y.length && crypto.timingSafeEqual(x, y);
};

// What a phone calls itself until someone names it: "iPhone · Safari".
function deviceName(agent = "") {
    const ua = String(agent);
    const what = /iPad/.test(ua) ? "iPad" : /iPhone|iPod/.test(ua) ? "iPhone" : /Android/.test(ua) ? (/Mobile/.test(ua) ? "Android" : "Tablet Android") : /Windows/.test(ua) ? "Windows" : /Macintosh/.test(ua) ? "Mac" : "";
    const browser = /SamsungBrowser/.test(ua) ? "Samsung Internet" : /EdgA?\//.test(ua) ? "Edge" : /FxiOS|Firefox/.test(ua) ? "Firefox" : /CriOS|Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "";
    return [what, browser].filter(Boolean).join(" · ") || "Celular";
}

// A name from a phone: one line, no control characters, 40 at most.
function cleanName(value) {
    // eslint-disable-next-line no-control-regex
    const one = String(value ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim();
    return [...one].slice(0, NAME_MAX).join("").trim();
}

// A saved list, checked: rows with every field, at most MAX_DEVICES, none stale.
function normalizeDevices(list, now = Date.now()) {
    const rows = (Array.isArray(list) ? list : []).filter((d) => d && typeof d.id === "string" && /^[a-f0-9]{16}$/.test(d.id)
        && ROLES.has(d.role) && typeof d.hash === "string" && /^[a-f0-9]{64}$/.test(d.hash));
    const seen = (d) => Date.parse(d.lastSeen || d.createdAt || "") || 0;
    return rows.filter((d) => now - seen(d) < STALE_MS)
        .sort((a, b) => seen(b) - seen(a))
        .slice(0, MAX_DEVICES)
        .map((d) => ({ id: d.id, role: d.role, name: cleanName(d.name) || deviceName(d.agent), hash: d.hash, createdAt: d.createdAt || "", lastSeen: d.lastSeen || d.createdAt || "", agent: String(d.agent || "").slice(0, 120) }));
}

// load() -> the saved array; save(array) writes it; loadInvites/saveInvites
// the same for the invites (none given: invites live in memory). now() for
// the tests.
function createDevices({ load, save, loadInvites = null, saveInvites = null, now = () => Date.now() } = {}) {
    const memInvites = { rows: [] };
    const invites = () => (loadInvites ? loadInvites() : memInvites.rows)
        .filter((v) => v && typeof v.hash === "string" && ROLES.has(v.role) && Number(v.expires) > now());
    const keepInvites = (rows) => { if (saveInvites) saveInvites(rows); else memInvites.rows = rows; };
    // The invite a link names, if it is still good.
    const inviteOf = (ticket) => { const h = hashOf(String(ticket || "")); return invites().find((v) => sameHex(v.hash, h)) || null; };
    const tickets = new Map(); // ticket -> { role, expires, deviceId }
    const pending = new Map(); // id -> lastSeen not saved yet
    const savedAt = new Map(); // id -> when its lastSeen was saved
    const iso = () => new Date(now()).toISOString();

    const read = () => normalizeDevices(load(), now()).map((d) => (pending.has(d.id) ? { ...d, lastSeen: pending.get(d.id) } : d));
    const write = (rows) => { save(rows); for (const d of rows) { pending.delete(d.id); savedAt.set(d.id, now()); } };
    const dropOld = () => { for (const [t, v] of tickets) if (v.expires <= now() && !v.deviceId) tickets.delete(t); };

    return {
        // A new QR for one door. Older open ones stay (two tabs of the
        // console), up to four. invite: a link that lasts 24 h (N9).
        ticket(role, { invite = false } = {}) {
            if (!ROLES.has(role)) throw Object.assign(new Error("Porta desconhecida."), { status: 400 });
            if (invite) {
                const ticket = crypto.randomBytes(16).toString("base64url");
                const expires = now() + INVITE_MS;
                const rows = [...invites(), { hash: hashOf(ticket), role, expires }].slice(-MAX_INVITES);
                keepInvites(rows);
                return { ticket, role, expires, invite: true };
            }
            dropOld();
            const open = [...tickets.entries()].filter(([, v]) => !v.deviceId);
            while (open.length >= MAX_TICKETS) tickets.delete(open.shift()[0]);
            const ticket = crypto.randomBytes(16).toString("base64url");
            const expires = now() + TICKET_MS;
            tickets.set(ticket, { role, expires, deviceId: null });
            return { ticket, role, expires };
        },
        // What the console's dialog shows: waiting, done (by which phone) or
        // expired. A ticket never made reads as expired.
        status(ticket) {
            const t = tickets.get(String(ticket || ""));
            if (!t) return { state: "expired" };
            if (t.deviceId) {
                const d = read().find((x) => x.id === t.deviceId);
                return { state: "done", device: d ? { id: d.id, name: d.name, role: d.role } : null };
            }
            if (t.expires <= now()) return { state: "expired" };
            return { state: "waiting", role: t.role, expires: t.expires };
        },
        cancel(ticket) { const t = tickets.get(String(ticket || "")); if (t && !t.deviceId) tickets.delete(String(ticket)); },
        // The phone's page asks: is this QR still good? (never spends it)
        peek(ticket) {
            const t = tickets.get(String(ticket || ""));
            if (t) return !t.deviceId && t.expires > now() ? { role: t.role } : null;
            const v = inviteOf(ticket);
            return v ? { role: v.role, invite: true } : null;
        },
        // Conectar: the ticket is spent, the phone gets its key.
        redeem(ticket, { name = "", agent = "" } = {}) {
            const key = String(ticket || "");
            let t = tickets.get(key);
            if (!t) {
                // An invite: spent here, gone from the list (one phone).
                const v = inviteOf(key);
                if (!v) return null;
                keepInvites(invites().filter((x) => x.hash !== v.hash));
                t = { role: v.role, expires: v.expires, deviceId: null, invite: true };
            }
            if (t.deviceId || t.expires <= now()) return null;
            const id = crypto.randomBytes(8).toString("hex");
            const secret = crypto.randomBytes(32).toString("base64url");
            const at = iso();
            const device = { id, role: t.role, name: cleanName(name) || deviceName(agent), hash: hashOf(secret), createdAt: at, lastSeen: at, agent: String(agent).slice(0, 120) };
            const rows = [device, ...read()].slice(0, MAX_DEVICES);
            write(rows);
            t.deviceId = id;
            // A spent ticket is kept until it would have expired, for the
            // dialog's "conectado", then forgotten.
            t.expires = Math.max(t.expires, now() + 60000);
            return { device, cookie: `${id}.${secret}` };
        },
        // The device a cookie names, or null. Marks it seen.
        check(cookie) {
            const m = COOKIE_RE.exec(String(cookie || ""));
            if (!m) return null;
            const d = read().find((x) => x.id === m[1]);
            if (!d || !sameHex(hashOf(m[2]), d.hash)) return null;
            const at = iso();
            pending.set(d.id, at);
            if (now() - (savedAt.get(d.id) || 0) >= SAVE_EVERY_MS) write(read());
            return { ...d, lastSeen: at };
        },
        // For the console: never the hash.
        // eslint-disable-next-line no-unused-vars
        list() { return read().map(({ hash, ...d }) => d); },
        rename(id, name) {
            const clean = cleanName(name);
            if (!clean) throw Object.assign(new Error("Dê um nome ao aparelho."), { status: 400 });
            const rows = read();
            const d = rows.find((x) => x.id === id);
            if (!d) throw Object.assign(new Error("Este aparelho já não está conectado."), { status: 404 });
            d.name = clean;
            write(rows);
            return d;
        },
        remove(id) {
            const rows = read();
            const left = rows.filter((x) => x.id !== id);
            if (left.length !== rows.length) write(left);
            return left.length !== rows.length;
        },
        // Desconectar todos: every phone of one door.
        removeRole(role) {
            const rows = read();
            const gone = rows.filter((x) => x.role === role).map((x) => x.id);
            if (gone.length) write(rows.filter((x) => x.role !== role));
            return gone;
        },
        flush() { if (pending.size) write(read()); },
    };
}

module.exports = { createDevices, deviceName, cleanName, normalizeDevices, hashOf, TICKET_MS, INVITE_MS, MAX_INVITES, MAX_DEVICES, STALE_MS, SAVE_EVERY_MS, NAME_MAX };
