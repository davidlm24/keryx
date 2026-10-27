// keryx-preview: the browser preview's bridge (dev only; `npm run dev`).
// Installed as window.keryxDesktop by src/api/client.js when a plain browser
// opens the Vite dev server, so the console runs unchanged on the REAL store
// and live engine of scripts/preview/server.cjs: same shape as
// electron/preload.cjs, over HTTP and Server-Sent Events. Data, the live
// state and media are real; what needs the computer itself (monitors, Bible
// downloads, the network server, backups, audio meters)
// answers with a pt-BR message or a harmless default. Output pages open in
// browser tabs and follow the live state through the same server.
// Production builds never include this file (the branch in client.js is
// `import.meta.env.DEV`).

import { reportCode, reportMail } from "@shared/support.mjs";
import { previewSyncCall } from "./previewSync";

const API = "/__keryx/";
const ONLY_DESKTOP = "Disponível no aplicativo do computador.";
const unavailable = async () => ({ error: { message: ONLY_DESKTOP, status: 501 } });

// Relatar um problema in the preview: nothing goes to support. The answer
// is made up so every end of the dialog can be seen: a text with "#fila"
// stays in a pretend queue (as offline), "#recusa" is refused, anything else
// is sent; the e-mail reserve never opens (the dialog shows the text). Every
// other op of the system bridge is the desktop's alone.
const previewReports = [];
async function previewSystem(op, args = {}) {
    if (op === "report") {
        const id = crypto.randomUUID();
        await new Promise((r) => setTimeout(r, 700));
        const text = String(args.text || "");
        const status = text.includes("#fila") ? "queued" : text.includes("#recusa") ? "refused" : "sent";
        if (status !== "sent") previewReports.push({ id, writtenAt: new Date().toISOString(), refused: status === "refused" ? "rate" : null, text, doing: args.doing, contact: args.contact, church: args.church });
        return { data: { id, code: reportCode(id), status, reason: status === "refused" ? "rate" : null } };
    }
    if (op === "reportQueue") return { data: previewQueueList() };
    if (op === "reportRetry") return { data: previewQueueList() };
    if (op === "reportMail") {
        const at = previewReports.findIndex((r) => r.id === args.id);
        if (at < 0) return { error: { message: "Este relato já não está na fila.", status: 404 } };
        const [r] = previewReports.splice(at, 1);
        return { data: { file: null, opened: false, ...reportMail({ ...r, version: "prévia", code: reportCode(r.id) }) } };
    }
    return unavailable();
}
const previewQueueList = () => previewReports.map(({ id, writtenAt, refused, text }) => ({ id, writtenAt, refused, text, tries: 1, hasZip: false }));

// A file the person picks (the browser's chooser): a File, or null when
// the chooser closes without one. The input sits in the page while it is
// open (data-keryx-pick), so a check can hand it a file.
function pickFile() {
    return new Promise((resolve) => {
        const input = Object.assign(document.createElement("input"), { type: "file", hidden: true });
        input.dataset.keryxPick = "bible";
        const done = (file) => { input.remove(); resolve(file || null); };
        input.addEventListener("change", () => done(input.files?.[0]));
        input.addEventListener("cancel", () => done(null));
        document.body.append(input);
        input.click();
    });
}

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
            // The desktop picks the file in main; here the browser's chooser
            // picks it and the preview server reads it with the same modules.
            installFromFile: async (version) => {
                const file = await pickFile();
                return file ? request(`bible-file?version=${encodeURIComponent(version)}&name=${encodeURIComponent(file.name)}`, { method: "POST", raw: file }) : { data: null };
            },
            readOwn: async () => {
                const file = await pickFile();
                return file ? request(`bible-own-read?name=${encodeURIComponent(file.name)}`, { method: "POST", raw: file }) : { data: null };
            },
            installOwn: (args) => request("bible-own", { method: "POST", body: { op: "install", ...args } }),
            removeOwn: (sigla) => request("bible-own", { method: "POST", body: { op: "remove", sigla } }),
        },
        network: {
            async call(op) {
                if (op === "info") return { data: { enabled: false, running: false, port: null, hasPin: false, error: ONLY_DESKTOP, urls: [], clients: [], screens: [] } };
                return unavailable();
            },
        },
        // Configurações › Sincronização: no main process and never a Google
        // sign-in here, so made-up states, one per board of the mockup
        // (previewSync.js; localStorage keryx.preview.sync picks one).
        sync: { call: previewSyncCall },
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
        // Procurar letra na internet: the preview server asks LRCLIB and
        // letras.mus.br with the app's own module (electron/lyrics.cjs).
        lyrics: { call: (op, args) => request("lyrics", { method: "POST", body: { op, args } }) },
        meters: { report() {}, onLevel: () => () => {}, sendLevel() {}, onSystemLevel: () => () => {} },
        system: { call: previewSystem },
        // This PC's fonts, read by the preview server with the app's own
        // module (electron/systemFonts.cjs), so the dialog lists what the
        // KERYX on this computer would.
        fonts: {
            list: () => request("fonts"),
            async read(id) {
                try {
                    const res = await fetch(`${API}font?id=${encodeURIComponent(id || "")}`);
                    if (!res.ok) return (await res.json().catch(() => null)) || { error: { message: `HTTP ${res.status}`, status: res.status } };
                    return { data: new Uint8Array(await res.arrayBuffer()) };
                } catch {
                    return { error: { message: "A prévia não respondeu: o servidor do npm run dev está ligado?", status: 0 } };
                }
            },
        },
        // The KERYX package, read and written by the preview server with the
        // app's module (electron/keryxPackage.cjs): the export is a download
        // here, and opening one takes the browser's chooser (or the File the
        // song importer was given).
        packages: {
            async export({ manifest, items, files, name }) {
                const res = await request("package-export", { method: "POST", body: { manifest, items, files, name } });
                if (res.error || !res.data) return res;
                const a = Object.assign(document.createElement("a"), { href: `${API}package-download?token=${encodeURIComponent(res.data.token)}`, download: res.data.file });
                document.body.appendChild(a); a.click(); a.remove();
                return res;
            },
            async open(given) {
                const file = given || await new Promise((resolve) => {
                    const input = Object.assign(document.createElement("input"), { type: "file", accept: ".keryx", hidden: true });
                    input.dataset.keryxPick = "package";
                    const done = (f) => { input.remove(); resolve(f || null); };
                    input.addEventListener("change", () => done(input.files?.[0]));
                    input.addEventListener("cancel", () => done(null));
                    document.body.append(input);
                    input.click();
                });
                return file ? request(`package-open?name=${encodeURIComponent(file.name)}`, { method: "POST", raw: file }) : { data: null };
            },
            fits: (id, entries) => request("package-fits", { method: "POST", body: { id, entries } }),
            async read(id, entry, offset, length) {
                try {
                    const res = await fetch(`${API}package-read?${new URLSearchParams({ id, entry, offset: String(offset), length: String(length) })}`);
                    if (!res.ok) return (await res.json().catch(() => null)) || { error: { message: `HTTP ${res.status}`, status: res.status } };
                    return { data: new Uint8Array(await res.arrayBuffer()) };
                } catch {
                    return { error: { message: "A prévia não respondeu: o servidor do npm run dev está ligado?", status: 0 } };
                }
            },
            take: (id, entry) => request("package-take", { method: "POST", body: { id, entry } }),
            close: (id) => request("package-close", { method: "POST", body: { id } }),
        },
        media: {
            async importFile(file) {
                return request(`media?name=${encodeURIComponent(file.name || "arquivo")}`, { method: "POST", raw: new Uint8Array(await file.arrayBuffer()) });
            },
            info: (names) => request("media-info", { method: "POST", body: { names } }),
        },
    };
}
