// For a browser on the church network (tablet, smart TV, stage monitor) that
// opened a screen page from the KERYX computer (electron/lan.cjs). It offers
// the same bridge shape as electron/preload.cjs, so createDesktopBackend works
// on top of it unchanged: reads over HTTP, changes over Server-Sent Events
// (store changes as plain messages, the live state as "live" events).

import { initialConnection, nextConnection } from "../../lib/network/connection.js";

const RELOAD_AFTER_AUTH_LOSS_MS = 2000;
const SCREEN_ID = "keryx.screenId";

// This screen's own id (owner 2026-11-15, R2 = A): random letters and digits
// kept in this browser, so the console can name it and choose what it shows
// (electron/screenDevices.cjs). "" where storage is closed (a private tab):
// then the screen is known by its address, as before.
export function screenId() {
    try {
        let id = localStorage.getItem(SCREEN_ID) || "";
        if (!/^[a-z0-9]{12,32}$/.test(id)) {
            const bytes = new Uint8Array(10);
            crypto.getRandomValues(bytes);
            id = Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 16);
            localStorage.setItem(SCREEN_ID, id);
        }
        return id;
    } catch {
        return "";
    }
}

// A page picked on this device from its start page (NetworkHome adds
// ?pick=1): said once to the server, which keeps it as this screen's page,
// then taken off the address.
function pickedHere() {
    try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("pick") !== "1") return false;
        url.searchParams.delete("pick");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
        return true;
    } catch {
        return false;
    }
}

// Where the console sends this screen: a page of the network's (or "/").
const navigable = (to) => typeof to === "string" && /^\/[A-Za-z]*$/.test(to);

export function createNetworkBridge() {
    const listeners = new Set();
    const liveListeners = new Set();
    let source = null;
    let wasOpen = false;
    // The stream's phase (connecting, open, reconnecting) for the page to show.
    let conn = initialConnection;
    const connListeners = new Set();
    // When the stream last said anything (a change, the live state, the
    // server's heartbeat every 10 s): a page tells a quiet service from a
    // dead link by it (connection.lastEventAt()).
    let lastEventAt = 0;
    const heard = () => { lastEventAt = Date.now(); };
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
        // Which page this screen shows, for the console's list of screens,
        // and this screen's own id (the console names it and sends it to a page).
        const id = screenId();
        const picked = pickedHere();
        source = new EventSource(`/api/events?screen=${encodeURIComponent(window.location.pathname)}${id ? `&id=${id}` : ""}${picked ? "&picked=1" : ""}`);
        source.onmessage = (event) => {
            heard();
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
        source.addEventListener("hb", heard);
        // The console chose another page for this screen ("Mostra ▾"): a full
        // load, so the stream comes back saying the new page.
        source.addEventListener("nav", (event) => {
            heard();
            let to = "";
            try { to = JSON.parse(event.data).path; } catch { return; }
            if (navigable(to) && to !== window.location.pathname) window.location.assign(to);
        });
        source.addEventListener("live", (event) => {
            heard();
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
            heard();
            onConn("open");
        };
        source.onerror = () => {
            onConn("error");
            // EventSource retries by itself; CLOSED means it gave up (e.g. 401).
            // The check reads the live state: a screen (PIN) and the
            // controle remoto (its own code) both may; 401 = signed out.
            if (source && source.readyState === EventSource.CLOSED) {
                source = null;
                fetch("/api/live").then((r) => (r.status === 401 ? authLost() : setTimeout(connect, 3000))).catch(() => setTimeout(connect, 3000));
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
            lastEventAt: () => lastEventAt,
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
