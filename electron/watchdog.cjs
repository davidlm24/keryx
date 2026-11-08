// Brings KERYX back when its main process dies (owner 2026-10-20, crash
// recovery). Before, a crash of main closed every window and nothing
// reopened them until someone noticed and double-clicked the icon.
//
// A tiny Node process (Electron's own binary with ELECTRON_RUN_AS_NODE, so
// nothing new is shipped), started detached by main once the run marker
// exists (electron/runMarker.cjs). It polls main's pid; when main is gone it
// looks at the marker: removed = a normal quit, nothing to do; still there =
// KERYX died, so it starts KERYX again — which finds the marker, lights the
// screens as they were and reopens the outputs — unless KERYX was brought
// back 3 times in 5 minutes (a crash loop: better a closed app than a
// projector flashing). It never outlives that one decision.
//
// Only the installed app runs it (not npm run desktop:dev, where Ctrl+C would
// start KERYX again, nor the smoke).

const path = require("node:path");
const { readMarker, shouldRelaunch } = require("./runMarker.cjs");

const POLL_MS = 2000;
// After main is gone: let a quit that was removing the marker finish.
const SETTLE_MS = 1500;

// What to do once the watched pid is gone.
function afterDeath(marker, watchedPid, now) {
    if (!marker) return "stop"; // a normal quit
    if (marker.pid !== null && marker.pid !== watchedPid) return "stop"; // another KERYX already runs
    return shouldRelaunch(marker, now) ? "relaunch" : "stop";
}

const isAlive = (pid) => {
    try {
        process.kill(pid, 0);
        return true;
    } catch (err) {
        return err.code === "EPERM"; // exists, not ours to signal
    }
};

// Started by main. `relaunch` = { command, args, cwd } starting KERYX the way
// it was started now.
function startWatchdog({ spawn, execPath, pid, markerFile, relaunch, log = console.warn, script = __filename }) {
    try {
        const child = spawn(execPath, [script, JSON.stringify({ pid, markerFile, relaunch })], {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
            env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
        });
        child.on("error", (err) => log(`[keryx-watchdog] não iniciou: ${err.message}`));
        child.unref();
        return child;
    } catch (err) {
        log(`[keryx-watchdog] não iniciou: ${err.message}`);
        return null;
    }
}

// The watchdog's own loop (deps injected for tests).
async function watch({ pid, markerFile, relaunch }, { alive = isAlive, read = readMarker, now = Date.now, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), spawn = require("node:child_process").spawn, pollMs = POLL_MS, settleMs = SETTLE_MS } = {}) {
    while (alive(pid)) await sleep(pollMs);
    await sleep(settleMs);
    const verdict = afterDeath(read(markerFile), pid, now());
    if (verdict !== "relaunch") return verdict;
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(relaunch.command, relaunch.args || [], { cwd: relaunch.cwd, detached: true, stdio: "ignore", env });
    if (child && typeof child.unref === "function") child.unref();
    return verdict;
}

if (require.main === module) {
    let opts = null;
    try {
        opts = JSON.parse(process.argv[2] || "");
    } catch { /* nothing to watch */ }
    if (opts && Number.isInteger(opts.pid) && typeof opts.markerFile === "string" && opts.relaunch && typeof opts.relaunch.command === "string") {
        watch({ ...opts, markerFile: path.resolve(opts.markerFile) }).catch(() => {}).finally(() => process.exit(0));
    } else {
        process.exit(0);
    }
}

module.exports = { afterDeath, startWatchdog, watch, POLL_MS };
