// keryx.live: the live state (shared/live-state.mjs) as a page sees it. One
// subscription per page, shared by every component (src/hooks/useLiveState.js).
//
// The bridge is whatever holds the document, all with one shape —
// { get, call(op, args), onChange(listener) }, replies { data } | { error }:
//   desktop          window.keryxDesktop.live (IPC to electron/live.cjs)
//   network screen   HTTP + SSE to electron/lan.cjs (read-only)
//   web build        backends/localLive.js (this browser only)
//
// Snapshots only move forward: one with an older rev than the one shown is
// ignored, so a late event can't undo a newer reply.

import { ClientError } from "./errors";

const same = (v) => v;

export function createLiveClient(bridge, { toStore = same, fromStore = same } = {}) {
    let current = null;
    let offset = 0;
    let started = false;
    const subscribers = new Set();

    function adopt(raw) {
        if (!raw || typeof raw.rev !== "number") return current;
        if (current && raw.rev <= current.rev) return current;
        const { serverNow, ...doc } = raw;
        if (typeof serverNow === "number") offset = serverNow - Date.now();
        current = fromStore(doc);
        for (const callback of [...subscribers]) {
            try {
                callback(current);
            } catch (err) {
                console.error("[keryx] erro num ouvinte da projeção:", err);
            }
        }
        return current;
    }

    async function unwrap(promise) {
        let res;
        try {
            res = await promise;
        } catch (err) {
            throw new ClientError(`Falha ao falar com a projeção: ${err.message}`, 500, err);
        }
        if (res.error) throw new ClientError(res.error.message, res.error.status);
        return res.data;
    }

    async function load() {
        start();
        return adopt(await unwrap(bridge.get()));
    }

    function start() {
        if (started) return;
        started = true;
        bridge.onChange(adopt);
        load().catch((err) => console.error("[keryx] não foi possível ler a projeção:", err));
    }

    return {
        // The document, or null until the first read arrives.
        current() {
            start();
            return current;
        },
        subscribe(callback) {
            start();
            subscribers.add(callback);
            return () => subscribers.delete(callback);
        },
        load,
        // Changes what is on screen; resolves with the new document (also
        // delivered to subscribers). Throws ClientError with a pt-BR message.
        async call(op, args = {}) {
            start();
            return adopt(await unwrap(bridge.call(op, toStore(args)))) ?? current;
        },
        // "Now" on the clock the document's times use (timers, video position).
        now: () => Date.now() + offset,
    };
}
