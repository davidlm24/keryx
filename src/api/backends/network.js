// For a browser on the church network (tablet, smart TV, stage monitor) that
// opened a screen page from the KERYX computer (electron/lan.cjs). It offers
// the same bridge shape as electron/preload.cjs, so createDesktopBackend works
// on top of it unchanged: reads over HTTP, changes over Server-Sent Events
// (store changes as plain messages, the live state as "live" events).

import { initialConnection, nextConnection } from "../../lib/network/connection.js";

const RELOAD_AFTER_AUTH_LOSS_MS = 2000;

export function createNetworkBridge() {
    const listeners = new Set();
    const liveListeners = new Set();
    let source = null;
    let wasOpen = false;
    // The stream's phase (connecting, open, reconnecting) for the page to show.
    let conn = initialConnection;
    const connListeners = new Set();
    const onConn = (event) => {
        const next = nextConnection(conn, event);
        if (next === conn) return;
        conn = next;
        for (const listener of [...connListeners]) {
            try { listener(conn); } catch (err) { console.error("[keryx] connection listener failed:", err); }
        }
    };

    // A 401 means the PIN changed: reload, which lands on the PIN form.
    const authLost = () => setTimeout(() => window.location.reload(), RELOAD_AFTER_AUTH_LOSS_MS);

    const emitLive = (snapshot) => {
        for (const listener of liveListeners) {
            try {
                listener(snapshot);
            } catch (err) {
                console.error("[keryx] live listener failed:", err);
            }
        }
    };

    async function getJson(url) {
        let res;
        try {
            res = await fetch(url, { headers: { "X-Keryx": "1" } });
        } catch {
            return { error: { message: "Sem conexão com o computador do KERYX.", status: 0 } };
        }
        if (res.status === 401) authLost();
        try {
            return await res.json();
        } catch {
            return { error: { message: `Resposta inválida do KERYX (HTTP ${res.status}).`, status: res.status } };
        }
    }

    function connect() {
        if (source) return;
        // Which page this screen shows, for the console's list of screens.
        source = new EventSource(`/api/events?screen=${encodeURIComponent(window.location.pathname)}`);
        source.onmessage = (event) => {
            let change;
            try {
                change = JSON.parse(event.data);
            } catch {
                return;
            }
            for (const listener of listeners) {
                try {
                    listener(change);
                } catch (err) {
                    console.error("[keryx] change listener failed:", err);
                }
            }
        };
        source.addEventListener("live", (event) => {
            try {
                emitLive(JSON.parse(event.data));
            } catch { /* a torn frame; the next one carries the whole state again */ }
        });
        source.onopen = () => {
            // Back after a drop: changes made meanwhile were missed. Pages that
            // read the database refetch on "online"; the live state is read
            // again here.
            if (wasOpen) {
                window.dispatchEvent(new Event("online"));
                getJson("/api/live").then((res) => { if (res.data) emitLive(res.data); });
            }
            wasOpen = true;
            onConn("open");
        };
        source.onerror = () => {
            onConn("error");
            // EventSource retries by itself; CLOSED means it gave up (e.g. 401).
            if (source && source.readyState === EventSource.CLOSED) {
                source = null;
                fetch("/api/screens").then((r) => (r.status === 401 ? authLost() : setTimeout(connect, 3000))).catch(() => setTimeout(connect, 3000));
            }
        };
    }

    async function call(entity, op, args) {
        let res;
        try {
            res = await fetch("/api/db", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-Keryx": "1" },
                body: JSON.stringify({ entity, op, args }),
            });
        } catch {
            return { error: { message: "Sem conexão com o computador do KERYX.", status: 0 } };
        }
        if (res.status === 401) authLost();
        try {
            return await res.json();
        } catch {
            return { error: { message: `Resposta inválida do KERYX (HTTP ${res.status}).`, status: res.status } };
        }
    }

    return {
        mediaBaseUrl: `${window.location.origin}/media/`,
        db: {
            call,
            onChange(listener) {
                listeners.add(listener);
                connect();
                return () => listeners.delete(listener);
            },
        },
        live: {
            get: () => getJson("/api/live"),
            // Screens only show; the operator changes the projection on the KERYX computer.
            call: async () => ({ error: { message: "Esta tela só mostra a projeção.", status: 403 } }),
            onChange(listener) {
                liveListeners.add(listener);
                connect();
                return () => liveListeners.delete(listener);
            },
        },
        // Only network screens have a link that can drop (desktop and preview are always connected).
        connection: {
            current: () => conn,
            subscribe(listener) {
                connListeners.add(listener);
                connect();
                return () => connListeners.delete(listener);
            },
        },
        media: {
            async importFile() {
                return { error: { message: "Enviar arquivos não está disponível numa tela da rede.", status: 501 } };
            },
        },
    };
}
