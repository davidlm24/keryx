// Relatar um problema (owner 2026-10-20): the reports waiting to reach
// support. Each is <dir>/<id>.json (what the operator wrote and who sent it)
// and, when the diagnostic goes with it, <dir>/<id>.zip. The folder lives in
// the data folder, never in the store or the sync: a report is this
// computer's. `send` posts one to the Supabase function
// (supabase/functions/relato) as multipart/form-data, built by hand so
// Electron's net.fetch and Node's fetch send the same bytes; the function
// answers by the report's own id, so a resend never makes a second report.
//
// What the answer means is shared/support.mjs `reportOutcome`: sent (the
// files go), refused (kept, marked, never retried: the dialog and
// Configurações offer the e-mail) or queued (kept for the next try: at
// launch, every REPORT_RETRY_MS while any waits, and when the PC wakes).

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function multipart(report, zip) {
    const boundary = `----keryx${crypto.randomBytes(12).toString("hex")}`;
    const chunks = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="report"\r\nContent-Type: application/json; charset=utf-8\r\n\r\n`),
        Buffer.from(JSON.stringify(report), "utf8"),
        Buffer.from("\r\n"),
    ];
    if (zip) {
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="diag"; filename="diagnostico.zip"\r\nContent-Type: application/zip\r\n\r\n`), zip, Buffer.from("\r\n"));
    }
    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    return { body: Buffer.concat(chunks), type: `multipart/form-data; boundary=${boundary}` };
}

// support: () => Promise<shared/support.mjs>; fetch: (url, init) => Response.
function createReportQueue({ dir, fetch, support, logger = console, now = () => Date.now(), setTimer = setInterval, clearTimer = clearInterval }) {
    const file = (id, ext) => path.join(dir, `${id}.${ext}`);
    const readMeta = (id) => {
        try { return JSON.parse(fs.readFileSync(file(id, "json"), "utf8")); } catch { return null; }
    };
    const writeMeta = (meta) => {
        fs.mkdirSync(dir, { recursive: true });
        const tmp = file(meta.id, "json.tmp");
        fs.writeFileSync(tmp, JSON.stringify(meta));
        fs.renameSync(tmp, file(meta.id, "json"));
    };
    const ids = () => {
        try { return fs.readdirSync(dir).filter((n) => n.endsWith(".json")).map((n) => n.slice(0, -5)).filter((id) => ID.test(id)); } catch { return []; }
    };
    const remove = (id) => {
        fs.rmSync(file(id, "json"), { force: true });
        fs.rmSync(file(id, "zip"), { force: true });
    };
    // Where the zip of a new report is written before `add`.
    const zipPath = (id) => { fs.mkdirSync(dir, { recursive: true }); return file(id, "zip"); };

    // report: { id, text, doing, contact, church, version, os, install, writtenAt }
    function add(report) {
        if (!ID.test(report.id)) throw new Error("Relato sem id.");
        writeMeta({ ...report, tries: 0, refused: null });
        return report.id;
    }

    // One report, now. { status: "sent", code } | { status: "queued" } | { status: "refused", reason }.
    async function send(id, { timeoutMs } = {}) {
        const meta = readMeta(id);
        if (!meta) return { status: "gone" };
        if (meta.refused) return { status: "refused", reason: meta.refused };
        const { REPORT_URL, REPORT_WAIT_MS, reportOutcome, reportCode } = await support();
        let zip = null;
        try { zip = fs.readFileSync(file(id, "zip")); } catch { /* sent without the diagnostic */ }
        // The queue's own fields stay home.
        const report = { ...meta };
        delete report.tries;
        delete report.refused;
        const { body, type } = multipart(report, zip);
        let outcome;
        try {
            const res = await fetch(REPORT_URL, {
                method: "POST",
                headers: { "Content-Type": type },
                body,
                signal: AbortSignal.timeout(timeoutMs || REPORT_WAIT_MS * 4),
            });
            const answer = await res.json().catch(() => null);
            outcome = reportOutcome(res.status, answer);
            if (outcome.status === "queued") logger.warn(`[keryx-relato] ${reportCode(id)}: o suporte respondeu ${res.status}; fica na fila`);
        } catch (err) {
            outcome = { status: "queued" };
            logger.warn(`[keryx-relato] ${reportCode(id)}: sem conexão (${err?.name === "TimeoutError" ? "demorou demais" : err?.message || err}); fica na fila`);
        }
        if (outcome.status === "sent") {
            remove(id);
            logger.info(`[keryx-relato] ${outcome.code || reportCode(id)} enviado`);
            return { status: "sent", code: outcome.code || reportCode(id) };
        }
        if (readMeta(id)) writeMeta({ ...meta, tries: (meta.tries || 0) + 1, refused: outcome.status === "refused" ? outcome.reason : null });
        if (outcome.status === "refused") logger.warn(`[keryx-relato] ${reportCode(id)} recusado: ${outcome.reason}`);
        return outcome;
    }

    // Old reports leave the queue (logged, so the text is not lost).
    async function prune() {
        const { REPORT_KEEP_DAYS, reportCode } = await support();
        const limit = now() - REPORT_KEEP_DAYS * 24 * 3600 * 1000;
        for (const id of ids()) {
            const meta = readMeta(id);
            const at = Date.parse(meta?.writtenAt || "");
            if (meta && Number.isFinite(at) && at >= limit) continue;
            logger.warn(`[keryx-relato] ${reportCode(id)} saiu da fila sem chegar (mais de ${REPORT_KEEP_DAYS} dias): ${String(meta?.text || "").replace(/\s+/g, " ").slice(0, 400)}`);
            remove(id);
        }
    }

    // Every waiting report, one at a time (never two passes at once).
    let running = null;
    function flush() {
        if (running) return running;
        running = (async () => {
            try {
                await prune();
                for (const id of ids()) {
                    const meta = readMeta(id);
                    if (!meta || meta.refused) continue;
                    const out = await send(id);
                    // Offline: the next one would fail the same way.
                    if (out.status === "queued") break;
                }
            } finally {
                running = null;
            }
        })();
        return running;
    }

    // What Configurações shows: oldest first.
    function list() {
        return ids().map(readMeta).filter(Boolean)
            .map((m) => ({ id: m.id, writtenAt: m.writtenAt, refused: m.refused || null, tries: m.tries || 0, text: m.text, hasZip: fs.existsSync(file(m.id, "zip")) }))
            .sort((a, b) => String(a.writtenAt).localeCompare(String(b.writtenAt)));
    }

    let timer = null;
    // At launch: one pass now, then one every REPORT_RETRY_MS while any waits.
    async function start() {
        if (timer) return;
        const { REPORT_RETRY_MS } = await support();
        timer = setTimer(() => { if (ids().length) flush().catch(() => {}); }, REPORT_RETRY_MS);
        timer?.unref?.();
        await flush().catch((err) => logger.warn(`[keryx-relato] ${err.message}`));
    }
    function stop() { if (timer) clearTimer(timer); timer = null; }

    return { add, send, flush, list, remove, read: readMeta, zipPath, zipFile: (id) => file(id, "zip"), start, stop };
}

module.exports = { createReportQueue, multipart };
