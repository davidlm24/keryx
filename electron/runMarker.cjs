// Did KERYX close, or did it die? (owner 2026-10-20, crash recovery.)
//
// running.json sits in the data folder while KERYX runs and is removed on a
// normal quit (will-quit, after the live state is flushed). Found at start,
// the last run did not end normally: a crash, a kill, a power cut. If it was
// alive a few minutes ago, the screens come back as the audience saw them
// (restoreState's afterCrash) and the outputs that were open reopen; an old
// marker (the PC was off for days) changes nothing but the log.
//
// The file also feeds the watchdog (electron/watchdog.cjs): it reads the pid
// it watches and how many times KERYX was brought back lately.

const nodeFs = require("node:fs");

// How often the marker says "still alive" (and which outputs are open).
const ALIVE_EVERY_MS = 15_000;
// A crash older than this does not light the screens again.
const RECOVER_WITHIN_MS = 20 * 60_000;
// The watchdog stops bringing KERYX back after this many restarts in this window.
const RESTART_LIMIT = 3;
const RESTART_WINDOW_MS = 5 * 60_000;

function readMarker(file, fs = nodeFs) {
    try {
        const m = JSON.parse(fs.readFileSync(file, "utf8"));
        if (!m || typeof m !== "object" || !Number.isFinite(m.aliveAt)) return null;
        return {
            pid: Number.isInteger(m.pid) ? m.pid : null,
            startedAt: Number.isFinite(m.startedAt) ? m.startedAt : m.aliveAt,
            aliveAt: m.aliveAt,
            outputs: Array.isArray(m.outputs) ? m.outputs.filter((k) => typeof k === "string" && k.startsWith("/")) : [],
            restarts: Array.isArray(m.restarts) ? m.restarts.filter(Number.isFinite) : [],
        };
    } catch {
        return null;
    }
}

// What the last run left behind means for this one. null = it ended normally.
function recoveryPlan(previous, now) {
    if (!previous) return null;
    const ago = now - previous.aliveAt;
    const lit = ago >= 0 && ago <= RECOVER_WITHIN_MS;
    return {
        diedAt: previous.aliveAt,
        lit,
        // Only a recent crash reopens what was open; otherwise Abrir ao iniciar decides.
        outputs: lit ? previous.outputs : [],
        // This start counts as a restart only when it brings a crash back.
        restarts: lit ? [...previous.restarts.filter((t) => now - t <= RESTART_WINDOW_MS), now] : [],
    };
}

// The watchdog's question: bring KERYX back? Only while the marker is there
// (no normal quit) and the restarts are under the limit.
function shouldRelaunch(marker, now) {
    if (!marker) return false;
    return marker.restarts.filter((t) => now - t <= RESTART_WINDOW_MS).length < RESTART_LIMIT;
}

function createRunMarker({ file, now = Date.now, pid = process.pid, fs = nodeFs, log = console.warn, aliveEveryMs = ALIVE_EVERY_MS, setInterval: every = setInterval, clearInterval: stop = clearInterval }) {
    const previous = readMarker(file, fs);
    const plan = recoveryPlan(previous, now());
    const startedAt = now();
    let outputs = () => [];
    let timer = null;
    let cleared = false;

    function write() {
        if (cleared) return;
        const doc = { pid, startedAt, aliveAt: now(), outputs: safeOutputs(), restarts: plan ? plan.restarts : [] };
        try {
            const tmp = `${file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(doc));
            fs.renameSync(tmp, file);
        } catch (err) {
            log(`[keryx-run] não foi possível gravar ${file}: ${err.message}`);
        }
    }

    function safeOutputs() {
        try {
            const list = outputs();
            return Array.isArray(list) ? list.filter((k) => typeof k === "string") : [];
        } catch {
            return [];
        }
    }

    return {
        previous,
        // null after a normal quit; else { diedAt, lit, outputs, restarts }.
        plan,
        // Starts writing; `openOutputs` lists the output keys open now.
        start(openOutputs) {
            if (typeof openOutputs === "function") outputs = openOutputs;
            write();
            if (!timer) {
                timer = every(write, aliveEveryMs);
                if (timer && typeof timer.unref === "function") timer.unref();
            }
        },
        // Writes now (an output opened or closed).
        touch: write,
        // A normal quit (or a restart KERYX asked for): no marker, nothing to recover.
        clear() {
            cleared = true;
            if (timer) stop(timer);
            timer = null;
            try {
                fs.rmSync(file, { force: true });
            } catch (err) {
                log(`[keryx-run] não foi possível apagar ${file}: ${err.message}`);
            }
        },
    };
}

module.exports = { createRunMarker, readMarker, recoveryPlan, shouldRelaunch, ALIVE_EVERY_MS, RECOVER_WITHIN_MS, RESTART_LIMIT, RESTART_WINDOW_MS };
