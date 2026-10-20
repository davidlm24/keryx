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
    const remoteListeners = new Set();
    let source = null;
    let remoteSource = null;
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
    // Remover saída, the preview's way: in memory, so the flows can be tried
    // in the browser; it resets on reload (the app keeps it in its settings).
    const removedKeys = new Set();
    // Where each output opens and Abrir ao iniciar (Ajustes › Destino), the
    // same way: in memory, so the editor's select can be tried here.
    const assigned = new Map();
    const display = { id: 1, label: "Navegador (prévia)", primary: true, width: 1920, height: 1080, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
    const displays = {
        async list() {
            const res = await request("outputs");
            if (res.error) return res;
            const outputs = res.data.map((o) => ({
                ...o,
                assignment: { target: "auto", openAtLaunch: false, ...assigned.get(o.key), removed: removedKeys.has(o.key) },
                removed: removedKeys.has(o.key),
                placement: { mode: "window", displayId: display.id, missing: false },
                open: Boolean(windows.get(o.key) && !windows.get(o.key).closed),
            }));
            return { data: { displays: [display], outputs } };
        },
        async set(key, a) {
            if (a && a.removed === true) {
                if (key === "/Projection") return { error: { message: "A Projeção não pode ser removida.", status: 400 } };
                removedKeys.add(key);
                windows.get(key)?.close();
                windows.delete(key);
            } else if (a && a.removed === false) removedKeys.delete(key);
            else if (a && (a.target !== undefined || a.openAtLaunch !== undefined)) assigned.set(key, { ...assigned.get(key), ...(a.target !== undefined ? { target: a.target } : {}), ...(a.openAtLaunch !== undefined ? { openAtLaunch: a.openAtLaunch } : {}) });
            return displays.list();
        },
        async open(key) {
            if (removedKeys.has(key)) return { error: { message: "Saída removida. Adicione-a de novo em Telas e saídas.", status: 400 } };
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
            onlineChapter: (code, book, chapter) => request("bible-online", { method: "POST", body: { code, book, chapter } }),
            install: (version) => request("bible-install", { method: "POST", body: { version } }),
            installFromFile: unavailable,
        },
        network: {
            async call(op) {
                if (op === "info") return { data: { enabled: false, running: false, port: null, hasPin: false, error: ONLY_DESKTOP, urls: [], clients: [], screens: [] } };
                return unavailable();
            },
        },
        // Configurações › Sincronização: no main process here, so the section
        // shows its first step and every action says where it works.
        sync: {
            async call(op) {
                if (op === "status") return { data: { available: false, preview: true, folder: null, paused: false, paired: false, keyLost: false, canShowCode: false, pc: null, name: "Navegador (prévia)", version: null, since: { sent: 0, applied: 0, skipped: 0, failed: 0, rejected: 0, collected: 0 }, engine: { state: "off", folder: null } } };
                return unavailable();
            },
        },
        // The controle remoto (the /Remote tab posts to /api/remote): the
        // console tab hears its commands as the desktop console hears
        // keryx:remote, and answers (scripts/preview/server.cjs).
        remote: {
            onCommand(listener) {
                remoteListeners.add(listener);
                if (!remoteSource) {
                    remoteSource = new EventSource(`${API}remote-events`);
                    remoteSource.addEventListener("remote", (event) => { try { emit(remoteListeners, JSON.parse(event.data)); } catch { /* a torn frame */ } });
                }
                return () => {
                    remoteListeners.delete(listener);
                    if (!remoteListeners.size && remoteSource) { remoteSource.close(); remoteSource = null; }
                };
            },
            reply: (id, answer) => request("remote-result", { method: "POST", body: { ...answer, id } }),
        },
        lyrics: { call: unavailable },
        meters: { report() {}, onLevel: () => () => {}, sendLevel() {}, onSystemLevel: () => () => {} },
        system: { call: unavailable },
        media: {
            async importFile(file) {
                return request(`media?name=${encodeURIComponent(file.name || "arquivo")}`, { method: "POST", raw: new Uint8Array(await file.arrayBuffer()) });
            },
            info: (names) => request("media-info", { method: "POST", body: { names } }),
        },
    };
}
