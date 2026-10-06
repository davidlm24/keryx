// The live state for the web build, which has no main process to hold it:
// kept in this browser's localStorage, so the operator tab and the output
// windows it opens share it ("storage" events tell the other windows).
// Screens on other devices are a desktop feature.

import { applyOp, emptyState, LIVE_VERSION } from "@shared/live-state.mjs";

const KEY = "keryx-live";

export function createLocalLiveBridge() {
    const listeners = new Set();
    const stamp = (state) => ({ ...state, serverNow: Date.now() });

    function read() {
        try {
            const saved = JSON.parse(localStorage.getItem(KEY));
            if (saved && saved.version === LIVE_VERSION && Number.isInteger(saved.rev)) return saved;
        } catch { /* unreadable: start over */ }
        return emptyState();
    }

    window.addEventListener("storage", (event) => {
        if (event.key !== KEY || !event.newValue) return;
        let state;
        try {
            state = JSON.parse(event.newValue);
        } catch {
            return;
        }
        for (const listener of listeners) listener(stamp(state));
    });

    return {
        get: async () => ({ data: stamp(read()) }),
        async call(op, args) {
            try {
                const previous = read();
                const next = applyOp(previous, op, args, Date.now());
                if (next !== previous) localStorage.setItem(KEY, JSON.stringify(next));
                return { data: stamp(next) };
            } catch (err) {
                if (err && err.name === "QuotaExceededError") {
                    return { error: { message: "Conteúdo grande demais para projetar neste navegador.", status: 413 } };
                }
                return { error: { message: err.message, status: err.status || 500 } };
            }
        },
        onChange(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
    };
}
