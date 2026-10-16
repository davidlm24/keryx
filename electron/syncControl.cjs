// Configurações › Sincronização, main-process side (docs/desktop-architecture.md
// §8b, PR 5): the folder, the church's code, on/off, the status and leaving,
// over the engine (sync.cjs) and the pairing (syncPairing.cjs). Reached from
// the console through `keryx:sync` (data-ipc.cjs); pure enough to test
// without Electron: the native folder picker, the system's protection for
// the code (safeStorage) and the bell come in as functions.
//
// This computer's settings.json keeps, under "sync":
//   { folder, paused, pairing: { id, key, code, joinedAt } }
// key and code sealed by `protect` (Windows' own protection, DPAPI): the key
// signs and checks the lines; the code is kept only so "Mostrar o código"
// works when another computer joins later. Neither is ever in the folder.

const fs = require("node:fs");
const path = require("node:path");
const { createSyncEngine, inspectFolder, syncDirOf } = require("./sync.cjs");
const { createPairing, joinPairing, codeRules } = require("./syncPairing.cjs");

const KEY = "sync";
// The bell's one entry for the sync (notifications.cjs keeps one per key).
const BELL = "sync";
// The folder unavailable this long before the bell says so (a laptop that
// opens before Drive does is not news).
const OFFLINE_BELL_MS = 10 * 60 * 1000;

// Electron's safeStorage as seal/open, or a plain fallback where the system
// has no protection (never on Windows): "safe:" or "plain:" + base64.
function sealWith(safeStorage) {
    const available = () => {
        try {
            return Boolean(safeStorage && safeStorage.isEncryptionAvailable());
        } catch {
            return false;
        }
    };
    return {
        seal: (text) => (available()
            ? `safe:${safeStorage.encryptString(String(text)).toString("base64")}`
            : `plain:${Buffer.from(String(text)).toString("base64")}`),
        open(sealed) {
            const s = String(sealed || "");
            try {
                if (s.startsWith("safe:")) return safeStorage.decryptString(Buffer.from(s.slice(5), "base64"));
                if (s.startsWith("plain:")) return Buffer.from(s.slice(6), "base64").toString("utf8");
            } catch { /* sealed on another Windows account or computer */ }
            return null;
        },
    };
}

// pt-BR for what joinPairing / createPairing answer.
async function joinMessage(result) {
    switch (result.error) {
        case "nocode": return "Esta pasta ainda não tem a sincronização. Crie o código da igreja no primeiro computador.";
        case "busy": return "O arquivo do código ainda está chegando pela pasta. Tente de novo em instantes.";
        case "wrong": return "Este código não é o desta pasta. Confira com quem criou, ou veja em Mostrar o código num computador que já sincroniza.";
        case "exists": return "Esta pasta já tem o código de uma igreja. Digite esse código.";
        default: return (await codeRules()).codeMessage(result) || "Não foi possível usar o código.";
    }
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

function createSyncControl({ store, mediaDir, settings, protect, chooseFolder = async () => null, describe = () => ({}), notify = null, dismiss = null, log = console.warn, now = () => new Date(), engineOptions = {} }) {
    const config = () => {
        const c = settings.get(KEY, null);
        return c && typeof c === "object" ? c : {};
    };
    const save = (next) => settings.set(KEY, next && Object.keys(next).length ? next : null);

    // The pairing opened once (decrypting on every pass would cost nothing
    // much, but a key that no longer opens should say so once).
    let pairing = null;
    let pairingFrom = null;
    function currentPairing() {
        const p = config().pairing;
        if (!p || !p.id || !p.key) return null;
        if (pairingFrom === p.key && pairing) return pairing;
        const hex = protect.open(p.key);
        pairingFrom = p.key;
        pairing = hex && /^[0-9a-f]{64}$/.test(hex) ? { id: p.id, key: Buffer.from(hex, "hex") } : null;
        if (!pairing) log("[keryx-sync] a chave guardada não abriu neste computador: digite o código da igreja de novo");
        return pairing;
    }

    // What has gone back and forth since KERYX opened, and the bell.
    const since = { sent: 0, applied: 0, skipped: 0, failed: 0, rejected: 0 };
    let offlineSince = null;
    let belled = null;
    function bell(state) {
        if (!notify) return;
        let note = null;
        if (state.state === "mismatch") {
            note = { title: "Sincronização parada: o código da igreja mudou", body: "Outro computador trocou o código. Digite o código novo em Configurações › Sincronização; as mudanças deste computador esperam." };
        } else if (state.state === "offline" && offlineSince && now() - offlineSince >= OFFLINE_BELL_MS) {
            note = { title: "A pasta da sincronização não está disponível", body: `${state.folder || "A pasta"} não abre. O KERYX guarda as mudanças e envia quando ela voltar. O Google Drive (ou OneDrive, Dropbox) está aberto?` };
        }
        if (note && belled !== state.state) {
            belled = state.state;
            notify({ key: BELL, kind: "warn", action: "settings:sincronizacao", ...note });
        } else if (!note && belled && state.state === "ok") {
            belled = null;
            if (dismiss) dismiss(BELL);
        }
    }
    function onStatus(state) {
        if (state.state === "ok") {
            since.sent += state.sent || 0;
            for (const k of ["applied", "skipped", "failed"]) since[k] += state.received?.[k] || 0;
            since.rejected += state.rejected || 0;
        }
        if (state.state === "offline") offlineSince = offlineSince || now();
        else offlineSince = null;
        bell(state);
    }

    const engine = createSyncEngine({
        store,
        mediaDir,
        getFolder: () => (config().paused ? null : config().folder || null),
        getPairing: currentPairing,
        describe,
        log,
        now,
        onStatus,
        ...engineOptions,
    });

    // Keeps the pairing a code gave, then sends everything here (the first
    // join merges: store.snapshot) and starts a pass without waiting for it.
    async function paired(result) {
        const cur = config();
        save({
            ...cur,
            paused: false,
            pairing: {
                id: result.id,
                key: protect.seal(result.key.toString("hex")),
                code: protect.seal(result.code),
                joinedAt: now().toISOString(),
            },
        });
        pairing = null;
        pairingFrom = null;
        const sent = store.snapshot();
        log(`[keryx-sync] código ${cur.pairing ? "novo" : "aceito"}; ${sent} registros a enviar`);
        engine.pass().catch(() => {});
        return status();
    }

    async function folderOrFail() {
        const folder = config().folder;
        if (!folder) throw fail("Escolha a pasta primeiro.");
        let ok = false;
        try {
            ok = (await fs.promises.stat(folder)).isDirectory();
        } catch { /* missing */ }
        if (!ok) throw fail("A pasta não está disponível. O Google Drive (ou OneDrive, Dropbox) está aberto?");
        return folder;
    }

    function status() {
        const cur = config();
        let me = {};
        try {
            me = describe() || {};
        } catch { /* nameless */ }
        return {
            available: true,
            folder: cur.folder || null,
            paused: Boolean(cur.paused),
            paired: Boolean(cur.pairing),
            // The key would not open here (settings brought from another
            // computer or Windows account): the code has to be typed again.
            keyLost: Boolean(cur.pairing) && !currentPairing(),
            canShowCode: Boolean(cur.pairing && cur.pairing.code),
            joinedAt: cur.pairing?.joinedAt || null,
            pc: store.pcId,
            name: me.name || null,
            version: me.version || null,
            since: { ...since },
            engine: engine.status(),
        };
    }

    const ops = {
        status: async () => status(),
        // The native folder picker, then what the folder holds (a code or
        // not, the computers in it). A new folder forgets the old one's code.
        choose: async (event) => {
            const folder = await chooseFolder(event);
            if (!folder) return { canceled: true, ...status() };
            const root = path.resolve(String(folder));
            const cur = config();
            save(root === cur.folder ? cur : { folder: root, paused: false });
            if (root !== cur.folder) {
                pairing = null;
                pairingFrom = null;
            }
            engine.poke();
            return { ...status(), inspect: await inspectFolder(root) };
        },
        inspect: async () => {
            const folder = config().folder;
            return folder ? inspectFolder(folder) : null;
        },
        create: async () => {
            const folder = await folderOrFail();
            const made = await createPairing(syncDirOf(folder), { pc: store.pcId, now: now() });
            if (made.error) throw fail(await joinMessage(made), 409);
            return { code: made.code, ...(await paired(made)) };
        },
        join: async (_event, { code } = {}) => {
            const folder = await folderOrFail();
            const joined = await joinPairing(syncDirOf(folder), code);
            if (joined.error) throw fail(await joinMessage(joined));
            return paired(joined);
        },
        // Trocar o código: a new one over the folder's; the computers that
        // should stay type it, the one left out stops.
        rotate: async () => {
            if (!config().pairing) throw fail("Este computador ainda não sincroniza.");
            const folder = await folderOrFail();
            const made = await createPairing(syncDirOf(folder), { pc: store.pcId, replace: true, now: now() });
            return { code: made.code, ...(await paired(made)) };
        },
        showCode: async () => {
            const sealed = config().pairing?.code;
            const code = sealed ? protect.open(sealed) : null;
            if (!code) throw fail("O código não está guardado neste computador. Veja num computador que já sincroniza, ou troque o código.", 404);
            return { code };
        },
        setPaused: async (_event, { paused } = {}) => {
            const cur = config();
            if (!cur.folder) throw fail("Escolha a pasta primeiro.");
            save({ ...cur, paused: Boolean(paused) });
            if (!paused) engine.poke();
            else await engine.pass();
            return status();
        },
        now: async () => {
            await engine.pass();
            return status();
        },
        // Sair da sincronização: this computer stops; nothing is deleted
        // here or in the folder, and the others keep what it sent.
        leave: async () => {
            save(null);
            pairing = null;
            pairingFrom = null;
            store.pruneOutbox(Number.MAX_SAFE_INTEGER);
            await engine.pass();
            if (dismiss) dismiss(BELL);
            belled = null;
            return status();
        },
    };

    return {
        engine,
        ops,
        status,
        start: (opts) => engine.start(opts),
        stop: () => engine.stop(),
        poke: () => engine.poke(),
    };
}

module.exports = { createSyncControl, sealWith, joinMessage, BELL };
