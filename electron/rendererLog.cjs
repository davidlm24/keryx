// The windows' own errors in the daily log (Rodada N3): window.onerror,
// unhandledrejection and console.error in the console and the output
// windows reach main over `keryx:log` (src/lib/rendererLog.js) and are
// written as "[renderer:<page>] …", so the diagnostic has them too. Each
// window may write at most PER_MINUTE lines a minute, each cut to MAX_CHARS;
// what goes past the limit is counted and said once when the minute ends.
// Pure (the logger and the clock are injected), so it is unit tested.

const PER_MINUTE = 20;
const MAX_CHARS = 2048;
const MINUTE_MS = 60000;

// "/Console?config=telas" → "Console"; "/" → "Console" (where / lands).
function pageOf(url) {
    try {
        const name = new URL(url).pathname.replace(/^\/+/, "").split("/")[0];
        return name.replace(/[^\w-]/g, "").slice(0, 40) || "Console";
    } catch {
        return "?";
    }
}

const clip = (s, n) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function createRendererLog({ logger, now = () => Date.now() }) {
    const windows = new Map(); // sender id → { start, count, dropped }

    function write(senderId, url, payload) {
        if (!payload || typeof payload !== "object") return false;
        const page = pageOf(url);
        const t = now();
        let w = windows.get(senderId);
        if (!w || t - w.start >= MINUTE_MS) {
            if (w && w.dropped) logger.warn(`[renderer:${w.page}] mais ${w.dropped} ${w.dropped === 1 ? "erro omitido" : "erros omitidos"} no último minuto`);
            w = { start: t, count: 0, dropped: 0, page };
            windows.set(senderId, w);
        }
        if (w.count >= PER_MINUTE) {
            w.dropped += 1;
            return false;
        }
        w.count += 1;
        const level = payload.level === "warn" ? "warn" : "error";
        const msg = typeof payload.msg === "string" ? payload.msg : String(payload.msg ?? "");
        const stack = typeof payload.stack === "string" && payload.stack && !msg.includes(payload.stack) ? `\n${payload.stack}` : "";
        logger[level](clip(`[renderer:${page}] ${msg}${stack}`, MAX_CHARS));
        return true;
    }

    // A window that closed: forget it.
    const forget = (senderId) => windows.delete(senderId);

    return { write, forget };
}

module.exports = { createRendererLog, pageOf, PER_MINUTE, MAX_CHARS };
