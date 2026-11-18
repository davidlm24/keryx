// What goes back to the GERAR (owner 2026-11-18, wave 3; the brief's "fila
// de volta", in the mould of reportQueue.cjs): the operator's Atendido,
// Desfazer and Excluir on a request that came from the GERAR, and the
// operator's chat reply (D7 = A; src/lib/console/gerarBack.js makes the
// entries). Kept in settings.json "gerar".outbox, so a reply written without
// internet, or with the GERAR asking for a new code, goes when it can (a
// new code keeps the queue; Desconectar / Esquecer drops it with the rest).
//
//   status: { type, requestId, status, note }  -> set_event_live_request_status
//           with the version read just before (40001 = read it again, once)
//   chat:   { type, eventId, clientMessageId, text, rowId } -> send_event_live_message
//           (idempotent by clientMessageId), then the local row keeps the
//           GERAR's id (external_id: "enviada ao GERAR")
//
// Unreachable: tried again later, in order. 42501: precisa de você (the
// queue waits for a new code). Any other refusal drops that entry, logged.

const KEY = "gerar";
const MAX = 200;
const RETRY_MS = 30 * 1000;
const STATUSES = new Set(["completed", "in_review", "cancelled"]);
const enc = encodeURIComponent;

function valid(e) {
    if (!e || typeof e !== "object") return null;
    if (e.type === "status" && e.requestId && STATUSES.has(e.status)) {
        return { type: "status", requestId: String(e.requestId).slice(0, 64), status: e.status, note: e.note ? String(e.note).slice(0, 500) : null };
    }
    const text = String(e.text || "").replace(/\s+/g, " ").trim().slice(0, 280);
    if (e.type === "chat" && e.eventId && e.clientMessageId && text) {
        return { type: "chat", eventId: String(e.eventId).slice(0, 64), clientMessageId: String(e.clientMessageId).slice(0, 64), text, rowId: e.rowId ? String(e.rowId).slice(0, 160) : "" };
    }
    return null;
}

function createGerarOutbox({ link, settings, store = null, log = console.warn, timers = { setTimeout, clearTimeout } }) {
    let timer = null;
    let running = null;

    const cfg = () => {
        const c = settings.get(KEY, null);
        return c && typeof c === "object" ? c : {};
    };
    const queue = () => (Array.isArray(cfg().outbox) ? cfg().outbox : []);
    const save = (list) => {
        const c = cfg();
        if (!c.device && !list.length) return;
        settings.set(KEY, { ...c, outbox: list.slice(-MAX) });
    };
    const drop = (entry) => save(queue().filter((e) => e !== entry && JSON.stringify(e) !== JSON.stringify(entry)));
    const later = () => {
        if (timer) timers.clearTimeout(timer);
        timer = timers.setTimeout(() => { timer = null; flush(); }, RETRY_MS);
    };

    async function sendStatus(e) {
        const read = async () => {
            const rows = await link.rest("GET", `event_live_requests?select=id,status,status_note,version&id=eq.${enc(e.requestId)}`);
            return Array.isArray(rows) ? rows[0] || null : null;
        };
        let cur = await read();
        if (!cur) return; // gone, or not this church's: nothing to do
        if (cur.status === e.status) return;
        const call = (version) => link.rpc("set_event_live_request_status", { _request_id: e.requestId, _status: e.status, _expected_version: version, _note: e.note });
        try {
            await call(cur.version);
        } catch (err) {
            if (err.pg !== "40001") throw err;
            cur = await read();
            if (cur && cur.status !== e.status) await call(cur.version);
        }
    }

    async function sendChat(e) {
        const saved = await link.rpc("send_event_live_message", { _event_id: e.eventId, _client_message_id: e.clientMessageId, _text: e.text, _link: null });
        const id = saved && (saved.id || (Array.isArray(saved) && saved[0] && saved[0].id));
        if (id && e.rowId && store) {
            try { store.call("ServiceMessage", "update", [e.rowId, { external_id: String(id) }]); } catch (err) { log(`[gerar] resposta ${e.rowId}: ${err.message}`); }
        }
    }

    // In order, one at a time; stops at the first unreachable one.
    function flush() {
        if (running) return running;
        running = (async () => {
            // The head of the queue each time: what is added meanwhile goes too.
            for (let entry = queue()[0]; entry; entry = queue()[0]) {
                const s = link.status();
                if (!(s.configured && s.state === "on" && s.device)) return;
                try {
                    if (entry.type === "status") await sendStatus(entry);
                    else if (entry.type === "chat") await sendChat(entry);
                    drop(entry);
                } catch (err) {
                    if (err.pg === "42501") { link.refused("revoked"); return; }
                    if (err.code === "needs") return;
                    if (err.code === "offline" || err.status >= 500) { later(); return; }
                    log(`[gerar] volta (${entry.type}) recusada: ${err.status || ""} ${err.pg || ""} ${err.message}`);
                    drop(entry);
                }
            }
        })().finally(() => { running = null; });
        return running;
    }

    return {
        // From the console (keryx:gerar push): kept, then sent when it can.
        add(entry) {
            const e = valid(entry);
            if (!e || !cfg().device) return { queued: false };
            save([...queue(), e]);
            flush();
            return { queued: true };
        },
        flush,
        pending: () => queue().length,
        stop() { if (timer) timers.clearTimeout(timer); timer = null; },
    };
}

module.exports = { createGerarOutbox };
