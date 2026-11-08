// A small daily log file: <dir>/keryx-YYYY-MM-DD.log, newest 7 kept. It is
// what "Salvar diagnóstico" bundles, so a problem on the booth PC can be
// looked at later. Pure Node (no Electron), so it is unit tested.

const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

const KEEP_DAYS = 7;
const NAME = /^keryx-\d{4}-\d{2}-\d{2}\.log$/;
const pad = (n) => String(n).padStart(2, "0");
const day = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const time = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

function createLogger({ dir, now = () => new Date() }) {
    fs.mkdirSync(dir, { recursive: true });

    function prune() {
        const files = fs.readdirSync(dir).filter((n) => NAME.test(n)).sort().reverse();
        for (const old of files.slice(KEEP_DAYS)) fs.rmSync(path.join(dir, old), { force: true });
    }
    prune();

    function write(level, args) {
        const at = now();
        const message = args.map((a) => (typeof a === "string" ? a : util.inspect(a, { depth: 4, breakLength: Infinity }))).join(" ");
        try {
            fs.appendFileSync(path.join(dir, `keryx-${day(at)}.log`), `${time(at)} ${level.padEnd(5)} ${message}\n`);
        } catch {
            // A logger that throws is worse than a missing line.
        }
    }

    return {
        dir,
        info: (...args) => write("info", args),
        warn: (...args) => write("warn", args),
        error: (...args) => write("error", args),
        recentFiles: (count = 3) => fs.readdirSync(dir).filter((n) => NAME.test(n)).sort().reverse().slice(0, count).map((n) => path.join(dir, n)),
        prune,
    };
}

// Mirror console.* in this process into the log, keeping normal output.
function captureConsole(logger) {
    for (const [method, level] of [["log", "info"], ["info", "info"], ["warn", "warn"], ["error", "error"]]) {
        const original = console[method].bind(console);
        console[method] = (...args) => {
            logger[level](...args);
            original(...args);
        };
    }
}

module.exports = { createLogger, captureConsole, KEEP_DAYS };
