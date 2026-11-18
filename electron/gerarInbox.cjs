// What the GERAR sends to this computer (owner 2026-11-18, the GERAR's wave
// 2; the brief's "Escopo no KERYX", item 2): its requests and its chat,
// brought down while this computer is connected (gerarLink.cjs) and
// "Receber os pedidos" is on, and handed to the console, which writes them
// as ServiceMessage rows in the culto it shows (as the phones' do;
// src/lib/console/gerarImport.js translates them).
//
// Everything goes out: a catch-up when the connection is on (and on the
// reserve, every RESERVE_MS), then the GERAR's Realtime (postgres_changes on
// event_live_requests and event_live_messages; the RLS hands this device only
// its church's cultos).
//
// Two computers never bring the same request: the LOCK is a row of
// keryx_request_links with this device's id, inserted before the console
// writes (23505 = another computer took it: skip). With the console closed
// nothing is locked: the request waits in the GERAR. A lock whose
// keryx_message_id never came (KERYX closed in between) is finished on the
// next catch-up. After the console's row: the link gets its id and a "new"
// request becomes "in_review" (set_event_live_request_status, the version
// read; 40001 = read it again and try once more).
//
// The chat has no lock in the GERAR: the console finds a row by its GERAR id
// (external_id) and a message two computers both brought shows once in the
// Painel (oneGerarCopy); a cursor (the newest message brought) keeps the
// catch-up short.
//
// A 42501 on a read is the GERAR refusing this device: precisa de você
// (gerarLink.refused), no loop.

const RESERVE_MS = 60 * 1000;
// The Realtime token is renewed this often (the access token lasts an hour).
const REAUTH_MS = 20 * 60 * 1000;
const PAGE = 200;
const ACTIVE = "not.in.(completed,declined,cancelled)";
// How far back the state of what this computer brought is kept in step.
const STATUS_DAYS = 3;

const REQUEST_COLS = "id,event_id,sequence,requester_name,title,category,details,resource_kind,resource_url,status,status_note,version,created_at,updated_at";
const EVENT_EMBED = "events(id,title,date)";

function createGerarInbox({ link, deliver, settings, realtime = null, files = null, log = console.warn, now = () => Date.now(), timers = { setTimeout, clearTimeout, setInterval, clearInterval } }) {
    let running = false;
    let reserve = null;
    let reauth = null;
    let channel = null;
    let busy = null;
    let again = false;
    const events = new Map(); // event id -> { id, title, date }
    // Requests another computer locked: not tried again on every catch-up.
    const taken = new Set();

    const cfg = () => {
        const c = settings.get("gerar", null);
        return c && typeof c === "object" ? c : {};
    };
    const deviceId = () => (cfg().device && cfg().device.id) || "";
    const cursor = () => cfg().msgCursor || cfg().linkedAt || new Date(now()).toISOString();
    const setCursor = (at) => {
        const c = cfg();
        if (!at || (c.msgCursor && c.msgCursor >= at)) return;
        settings.set("gerar", { ...c, msgCursor: at });
    };
    const wanted = () => {
        const s = link.status();
        return s.configured && s.state === "on" && Boolean(s.device) && s.receive;
    };

    // A refusal that means this device is out (42501): precisa de você.
    function guard(err) {
        if (err && err.pg === "42501") { link.refused("revoked"); stop(); return true; }
        if (err && err.code === "needs") { stop(); return true; }
        return false;
    }

    const enc = encodeURIComponent;
    async function eventOf(id) {
        if (!id) return null;
        if (events.has(id)) return events.get(id);
        const rows = await link.rest("GET", `events?select=id,title,date&id=eq.${enc(id)}`);
        const ev = Array.isArray(rows) && rows[0] ? rows[0] : null;
        if (ev) events.set(id, ev);
        return ev;
    }
    const remember = (row) => { if (row && row.events && row.events.id) events.set(row.events.id, row.events); };

    // The console writes the rows; null = the console is not there (nothing
    // is locked then).
    async function hand(items) {
        if (!items.length) return [];
        const res = await deliver({ items });
        if (!res || res.error) return null;
        return Array.isArray(res.results) ? res.results : [];
    }

    // set_event_live_request_status, "new" -> "in_review" (the GERAR sees the
    // desk took it). 40001: the version changed, read it and try once more.
    async function review(req) {
        if (req.status !== "new") return;
        const call = (version) => link.rpc("set_event_live_request_status", { _request_id: req.id, _status: "in_review", _expected_version: version, _note: null });
        try {
            await call(req.version);
        } catch (err) {
            if (guard(err)) return;
            if (err.pg !== "40001") { log(`[gerar] in_review ${req.id}: ${err.status} ${err.pg || ""} ${err.message}`); return; }
            try {
                const rows = await link.rest("GET", `event_live_requests?select=status,version&id=eq.${enc(req.id)}`);
                const fresh = Array.isArray(rows) && rows[0];
                if (fresh && fresh.status === "new") await call(fresh.version);
            } catch (e) {
                if (!guard(e)) log(`[gerar] in_review ${req.id} (again): ${e.status} ${e.pg || ""} ${e.message}`);
            }
        }
    }

    // Lock, hand to the console, then write the link's id and the state.
    async function importRequests(fresh, resume = []) {
        const me = deviceId();
        if (!me) return;
        const mine = [...resume];
        for (const req of fresh) {
            if (taken.has(req.id)) continue;
            try {
                await link.rest("POST", "keryx_request_links", { body: { request_id: req.id, device_id: me }, prefer: "return=minimal" });
                mine.push(req);
            } catch (err) {
                if (guard(err)) return;
                if (err.pg === "23505" || err.status === 409) { taken.add(req.id); continue; } // another computer took it
                throw err;
            }
        }
        if (!mine.length) return;
        for (const req of mine) if (!req.events && req.event_id) req.events = await eventOf(req.event_id);
        const results = await hand(mine.map((req) => ({ type: "request", request: req })));
        if (!results) return; // the console went away: finished on the next catch-up
        for (const req of mine) {
            const done = results.find((r) => r && r.key === req.id && r.id);
            if (!done) continue;
            try {
                await link.rest("PATCH", `keryx_request_links?request_id=eq.${enc(req.id)}`, { body: { keryx_message_id: done.id }, prefer: "return=minimal" });
            } catch (err) {
                if (guard(err)) return;
                log(`[gerar] link ${req.id}: ${err.status} ${err.pg || ""} ${err.message}`);
            }
            await review(req);
            // Its attached files come down next (gerarFiles.cjs).
            if (files) files.queue(req.id);
        }
        if (files) files.run().catch((err) => { if (!guard(err)) log(`[gerar] anexos: ${err.message}`); });
    }

    async function importMessages(list) {
        const team = list.filter((m) => m && m.side === "team");
        if (!team.length) return;
        for (const m of team) if (!m.events && m.event_id) m.events = await eventOf(m.event_id);
        const results = await hand(team.map((m) => ({ type: "message", message: m })));
        if (!results) return;
        const newest = team.reduce((at, m) => (m.created_at > at ? m.created_at : at), "");
        setCursor(newest);
    }

    async function statusUpdates(list) {
        if (!list.length) return;
        await hand(list.map((req) => ({ type: "status", request: req })));
    }

    // The catch-up: active requests nobody took, this computer's unfinished
    // locks, the state of what it brought lately, and the chat since the cursor.
    async function catchUp() {
        if (!wanted()) return;
        const me = deviceId();
        const reqs = await link.rest("GET", `event_live_requests?select=${REQUEST_COLS},${EVENT_EMBED},keryx_request_links(device_id,keryx_message_id)&status=${ACTIVE}&order=created_at.asc&limit=${PAGE}`);
        const fresh = [];
        const resume = [];
        for (const r of Array.isArray(reqs) ? reqs : []) {
            remember(r);
            const lk = Array.isArray(r.keryx_request_links) ? r.keryx_request_links[0] : r.keryx_request_links;
            if (!lk) fresh.push(r);
            else if (lk.device_id === me && !lk.keryx_message_id) resume.push(r);
        }
        await importRequests(fresh, resume);
        const since = new Date(now() - STATUS_DAYS * 86400000).toISOString();
        const linked = await link.rest("GET", `keryx_request_links?select=request_id,event_live_requests(${REQUEST_COLS})&device_id=eq.${enc(me)}&keryx_message_id=not.is.null&imported_at=gte.${enc(since)}&limit=${PAGE}`);
        await statusUpdates((Array.isArray(linked) ? linked : []).map((l) => l.event_live_requests).filter(Boolean));
        const msgs = await link.rest("GET", `event_live_messages?select=id,event_id,side,sender_name,text,link,created_at,${EVENT_EMBED}&side=eq.team&created_at=gt.${enc(cursor())}&order=created_at.asc&limit=${PAGE}`);
        for (const m of Array.isArray(msgs) ? msgs : []) remember(m);
        await importMessages(Array.isArray(msgs) ? msgs : []);
    }

    // One pass at a time; a call while one runs asks for one more after it.
    function pass() {
        if (busy) { again = true; return busy; }
        busy = (async () => {
            do {
                again = false;
                try {
                    await catchUp();
                    if (files) await files.run();
                } catch (err) {
                    if (!guard(err)) log(`[gerar] busca: ${err.status || ""} ${err.pg || ""} ${err.message}`);
                }
            } while (again && running);
        })().finally(() => { busy = null; });
        return busy;
    }

    // Realtime: a new request or message comes at once; a changed request
    // updates the row this computer has (the console ignores one it lacks).
    function onChange(payload) {
        if (!running) return;
        const table = payload && payload.table;
        const row = payload && payload.new;
        if (!row) return;
        if (table === "event_live_messages" && payload.eventType === "INSERT") {
            importMessages([row]).catch((err) => { if (!guard(err)) log(`[gerar] chat: ${err.message}`); });
        } else if (table === "event_live_requests" && payload.eventType === "INSERT") {
            if (["completed", "declined", "cancelled"].includes(row.status)) return;
            importRequests([row]).catch((err) => { if (!guard(err)) log(`[gerar] pedido: ${err.message}`); });
        } else if (table === "event_live_requests" && payload.eventType === "UPDATE") {
            statusUpdates([row]).catch(() => {});
        }
    }

    async function subscribe() {
        if (!realtime || channel) return;
        try {
            channel = await realtime.subscribe(onChange);
        } catch (err) {
            channel = null;
            if (!guard(err)) log(`[gerar] realtime: ${err && err.message}`);
        }
    }

    function start() {
        if (running || !wanted()) return;
        running = true;
        subscribe();
        pass();
        reserve = timers.setInterval(() => pass(), RESERVE_MS);
        if (realtime && realtime.reauth) reauth = timers.setInterval(() => { realtime.reauth().catch(() => {}); }, REAUTH_MS);
    }

    function stop() {
        running = false;
        if (reserve) timers.clearInterval(reserve);
        if (reauth) timers.clearInterval(reauth);
        reserve = null;
        reauth = null;
        if (channel && channel.unsubscribe) { try { channel.unsubscribe(); } catch { /* gone */ } }
        channel = null;
    }

    // The link's status changed (connected, needs, Receber off): start or stop.
    function follow() {
        if (wanted()) start();
        else stop();
    }

    return { start, stop, follow, pass, running: () => running, _onChange: onChange };
}

// The GERAR's Realtime through supabase-js, only as transport: the session
// is gerarLink's (its access token, renewed there), never supabase-js's.
function supabaseRealtime({ config, link, createClient }) {
    let client = null;
    return {
        async subscribe(onChange) {
            if (!client) client = createClient(config.url, config.anonKey, { accessToken: () => link.token() });
            await client.realtime.setAuth(await link.token());
            const ch = client.channel("keryx-mesa")
                .on("postgres_changes", { event: "*", schema: "public", table: "event_live_requests" }, onChange)
                .on("postgres_changes", { event: "INSERT", schema: "public", table: "event_live_messages" }, onChange)
                .subscribe();
            return { unsubscribe: () => client.removeChannel(ch) };
        },
        async reauth() {
            if (client) await client.realtime.setAuth(await link.token());
        },
    };
}

module.exports = { createGerarInbox, supabaseRealtime, RESERVE_MS };
