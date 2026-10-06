// Holds the live state (what every output shows right now) for the whole app:
// operator windows change it over IPC (keryx:live:call), every window and
// every network screen gets the new document after each change. The rules
// are shared/live-state.mjs, the same module the pages and node:test use.
//
// Saved to live.json in the data folder (debounced) so a restart or crash
// comes back with the same content loaded, the screen black.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const MAX_BYTES = 8 * 1024 * 1024;
const SAVE_DELAY_MS = 300;

// ESM from CommonJS: loaded once at startup, before the first window opens.
const loadLiveRules = () => import(pathToFileURL(path.join(__dirname, "..", "shared", "live-state.mjs")).href);

function createLive({ file, rules, log = console.warn, now = Date.now, saveDelayMs = SAVE_DELAY_MS }) {
    const listeners = new Set();
    let timer = null;
    let dirty = false;

    let state;
    try {
        state = rules.restoreState(JSON.parse(fs.readFileSync(file, "utf8")), now());
    } catch (err) {
        if (err.code !== "ENOENT") log(`[keryx-live] ${file} ilegível, começando vazio: ${err.message}`);
        state = rules.emptyState(now());
    }

    function save() {
        timer = null;
        if (!dirty) return;
        dirty = false;
        try {
            const tmp = `${file}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(state));
            fs.renameSync(tmp, file);
        } catch (err) {
            log(`[keryx-live] não foi possível salvar ${file}: ${err.message}`);
        }
    }

    const snapshot = () => ({ ...state, serverNow: now() });

    function call(op, args) {
        const next = rules.applyOp(state, op, args, now());
        if (next === state) return snapshot();
        if (JSON.stringify(next).length > MAX_BYTES) {
            throw new rules.LiveError("Conteúdo grande demais para projetar.", 413);
        }
        state = next;
        dirty = true;
        if (!timer) timer = setTimeout(save, saveDelayMs);
        const snap = snapshot();
        for (const listener of listeners) {
            try {
                listener(snap);
            } catch (err) {
                log(`[keryx-live] erro num ouvinte: ${err.message}`);
            }
        }
        return snap;
    }

    return {
        get: snapshot,
        call,
        onChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        // On quit: write what is pending now.
        flush() {
            if (timer) clearTimeout(timer);
            save();
        },
    };
}

module.exports = { createLive, loadLiveRules };
