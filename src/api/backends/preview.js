// keryx-preview: the browser preview's bridge (dev only; `npm run dev`).
// Installed as window.keryxDesktop by src/api/client.js when a plain browser
// opens the Vite dev server, so the console runs unchanged on the REAL store
// and live engine of scripts/preview/server.cjs: same shape as
// electron/preload.cjs, over HTTP and Server-Sent Events. Data, the live
// state and media are real; what needs the computer itself (monitors, Bible
// downloads, lyrics on the web, the network server, backups, audio meters)
// answers with a pt-BR message or a harmless default. Output pages open in
// browser tabs and follow the live state through the same server.
// Production builds never include this file (the branch in client.js is
// `import.meta.env.DEV`).

const API = "/__keryx/";
const ONLY_DESKTOP = "Disponível no aplicativo do computador.";
const unavailable = async () => ({ error: { message: ONLY_DESKTOP, status: 501 } });

async function request(route, { method = "GET", body, raw } = {}) {
    let res;
    try {
        res = await fetch(API + route, {
            method,
            headers: method === "POST" ? { "X-Keryx": "1", ...(raw ? {} : { "Content-Type": "application/json" }) } : {},
            body: raw || (body === undefined ? undefined : JSON.stringify(body)),
        });
    } catch {
        return { error: { message: "A prévia não respondeu: o servidor do npm run dev está ligado?", status: 0 } };
    }
    try {
        return await res.json();
    } catch {
        return { error: { message: `Resposta inválida da prévia (HTTP ${res.status}).`, status: res.status } };
    }
}

export function createPreviewBridge() {
    const changeListeners = new Set();
    const liveListeners = new Set();
    let source = null;
    const emit = (set, value) => {
        for (const listener of set) {
            try { listener(value); } catch (err) { console.error("[keryx-preview] listener:", err); }
        }
    };
    function connect() {
        if (source) return;
        source = new EventSource(`${API}events`);
        source.onmessage = (event) => { try { emit(changeListeners, JSON.parse(event.data)); } catch { /* a torn frame */ } };
        source.addEventListener("live", (event) => { try { emit(liveListeners, JSON.parse(event.data)); } catch { /* the next frame carries it all */ } });
    }

    // Output pages open as browser tabs; the console sees which are open.
    const windows = new Map();
    const display = { id: 1, label: "Navegador (prévia)", primary: true, width: 1920, height: 1080, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
    const displays = {
        async list() {
            const res = await request("outputs");
            if (res.error) return res;
            const outputs = res.data.map((o) => ({
                ...o,
                assignment: { target: "auto", openAtLaunch: false },
                placement: { mode: "window", displayId: display.id, missing: false },
                open: Boolean(windows.get(o.key) && !windows.get(o.key).closed),
            }));
            return { data: { displays: [display], outputs } };
        },
        set: async () => ({ data: true }),
        async open(key) {
            const name = `keryx-preview-${String(key).replace(/\W/g, "")}`;
            const win = window.open(key, name);
            if (win) windows.set(key, win);
            return win ? { data: true } : { error: { message: "O navegador bloqueou a nova aba: permita pop-ups para a prévia.", status: 400 } };
        },
        async close(key) { windows.get(key)?.close(); windows.delete(key); return { data: true }; },
        identify: async () => ({ data: true }),
        // Exportar / Importar ajustes das saídas, the browser's way: a download
        // and a file picker (the app uses its own save and open dialogs).
        async exportFile(json, name) {
            const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
            const a = Object.assign(document.createElement("a"), { href: url, download: name || "keryx-saidas.json" });
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            return { data: { file: a.download } };
        },
        importFile() {
            return new Promise((resolve) => {
                const input = Object.assign(document.createElement("input"), { type: "file", accept: ".json,application/json", className: "kx-preview-import" });
                input.style.display = "none";
                input.addEventListener("change", async () => {
                    const file = input.files?.[0];
                    input.remove();
                    resolve(file ? { data: { text: await file.text(), name: file.name } } : { data: null });
                });
                document.body.appendChild(input);
                input.click();
            });
        },
    };

    return {
        isDesktop: true,
        isPreview: true,
        platform: "browser",
        versions: {},
        mediaBaseUrl: `${window.location.origin}/media/`,
        db: {
            call: (entity, op, args) => request("db", { method: "POST", body: { entity, op, args } }),
            onChange(listener) { changeListeners.add(listener); connect(); return () => changeListeners.delete(listener); },
        },
        live: {
            get: () => request("live"),
            call: (op, args) => request("live", { method: "POST", body: { op, args } }),
            onChange(listener) { liveListeners.add(listener); connect(); return () => liveListeners.delete(listener); },
        },
        displays,
        bible: {
            status: () => request("bible"),
            onlineChapter: unavailable,
            install: unavailable,
            installFromFile: unavailable,
        },
        network: {
            async call(op) {
                if (op === "info") return { data: { enabled: false, running: false, port: null, hasPin: false, error: ONLY_DESKTOP, urls: [], clients: [], screens: [] } };
                return unavailable();
            },
        },
        lyrics: { call: unavailable },
        meters: { report() {}, onLevel: () => () => {} },
        system: { call: unavailable },
        media: {
            async importFile(file) {
                return request(`media?name=${encodeURIComponent(file.name || "arquivo")}`, { method: "POST", raw: new Uint8Array(await file.arrayBuffer()) });
            },
            info: (names) => request("media-info", { method: "POST", body: { names } }),
        },
    };
}
