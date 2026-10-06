// For a browser on the church network (tablet, smart TV, stage monitor) that
// opened a screen page from the KERYX computer (electron/lan.cjs). It offers
// the same bridge shape as electron/preload.cjs, so createDesktopBackend works
// on top of it unchanged: reads over HTTP, changes over Server-Sent Events.

const RELOAD_AFTER_AUTH_LOSS_MS = 2000;

export function createNetworkBridge() {
    const listeners = new Set();
    let source = null;
    let wasOpen = false;

    // A 401 means the PIN changed: reload, which lands on the PIN form.
    const authLost = () => setTimeout(() => window.location.reload(), RELOAD_AFTER_AUTH_LOSS_MS);

    function connect() {
        if (source) return;
        source = new EventSource("/api/events");
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
        source.onopen = () => {
            // Back after a drop: changes made meanwhile were missed. The screen
            // pages already refetch on "online" (useProjectionReconnect).
            if (wasOpen) window.dispatchEvent(new Event("online"));
            wasOpen = true;
        };
        source.onerror = () => {
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
        media: {
            async importFile() {
                return { error: { message: "Enviar arquivos não está disponível numa tela da rede.", status: 501 } };
            },
        },
    };
}
