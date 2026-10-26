// Configurações › Sincronização, main-process side (docs/desktop-architecture.md
// §8b, PR 5): the folder, the church's code, on/off, the status and leaving,
// over the engine (sync.cjs) and the pairing (syncPairing.cjs), through the
// folder adapter of the sync store (syncStore/folder.cjs). Reached from
// the console through `keryx:sync` (data-ipc.cjs); pure enough to test
// without Electron: the native folder picker, the system's protection for
// the code (safeStorage) and the bell come in as functions.
//
// This computer's settings.json keeps, under "sync":
//   { folder, store, paused, pairing: { id, key, code, joinedAt } }
// key and code sealed by `protect` (Windows' own protection, DPAPI): the key
// signs and checks the lines; the code is kept only so "Mostrar o código"
// works when another computer joins later. Neither is ever in the folder.
//
// store: "drive" = Google Drive spoken to directly (Google Drive direto,
// PR 2: the adapter syncStore/drive.cjs over the church's account,
// googleAuth.cjs, which keeps its own "google" entry); anything else = the
// folder. Until PR 3 makes Configurações' page for it, only the ops below
// switch it (useDrive, googleSignIn, googleStatus, googleSignOut); the
// folder mode stays until PR 4.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createSyncEngine, inspectFolder, inspectStore } = require("./sync.cjs");
const { createFolderStore } = require("./syncStore/index.cjs");
const { createDriveStore } = require("./syncStore/drive.cjs");
const { createPairing, joinPairing, updateRemoved, codeRules } = require("./syncPairing.cjs");

const KEY = "sync";
// The bell's one entry for the sync (notifications.cjs keeps one per key).
const BELL = "sync";
// The folder unavailable this long before the bell says so (a laptop that
// opens before Drive does is not news).
const OFFLINE_BELL_MS = 10 * 60 * 1000;
// After a join, how long the passes look for likely duplicate songs (the
// other computers' songs arrive over a few passes); the bell says so once.
const DUPLICATES_BELL = "sync-dups";
const DUPLICATES_WATCH_MS = 15 * 60 * 1000;
const duplicateRules = () => import(pathToFileURL(path.join(__dirname, "..", "shared", "syncDuplicates.mjs")).href);

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
        // Whether seal() really protects (googleAuth.cjs refuses to keep a
        // Google token in the plain fallback).
        safe: available,
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
        case "mismatch": return "O código da igreja mudou nesta pasta. Digite o código novo primeiro.";
        default: return (await codeRules()).codeMessage(result) || "Não foi possível usar o código.";
    }
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// onStatus: told after every pass, too (main pushes the media still coming).
// google: googleAuth.cjs (null: no Drive here); driveOptions: what the Drive
// adapter is made with besides it (fetchImpl, the tests' endpoints).
function createSyncControl({ store, mediaDir, settings, protect, chooseFolder = async () => null, openPath = null, describe = () => ({}), notify = null, dismiss = null, log = console.warn, now = () => new Date(), onStatus: told = null, engineOptions = {}, google = null, driveOptions = {} }) {
    const config = () => {
        const c = settings.get(KEY, null);
        return c && typeof c === "object" ? c : {};
    };
    const save = (next) => settings.set(KEY, next && Object.keys(next).length ? next : null);
    const onDrive = () => config().store === "drive" && Boolean(google);

    // The store in use, made again when the folder or the account changes
    // (another account is another store: its reading starts over).
    let folderStore = null;
    let driveStore = null;
    function drive() {
        const email = String(google.email() || "").toLowerCase();
        const key = `drive:${email}`;
        if (!driveStore || driveStore.key !== key) {
            driveStore = createDriveStore({ auth: google, key, where: email ? `Google Drive (${email})` : "Google Drive", ...driveOptions });
        }
        return driveStore;
    }
    function shared() {
        const c = config();
        if (c.paused) return null;
        if (onDrive()) return drive();
        if (!c.folder) return null;
        const root = path.resolve(String(c.folder));
        if (!folderStore || folderStore.key !== root) folderStore = createFolderStore(root);
        return folderStore;
    }

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
    const since = { sent: 0, applied: 0, skipped: 0, failed: 0, rejected: 0, collected: 0 };
    let offlineSince = null;
    let belled = null;
    function bell(state) {
        if (!notify) return;
        let note = null;
        if (state.state === "mismatch") {
            note = { title: "Sincronização parada: o código da igreja mudou", body: "Outro computador trocou o código. Digite o código novo em Configurações › Sincronização; as mudanças deste computador esperam." };
        } else if (state.state === "auth") {
            note = { title: "Sincronização parada: entre de novo com a conta da igreja", body: `${state.error || "O Google não aceitou a entrada guardada."} As mudanças deste computador esperam.` };
        } else if (state.state === "offline" && offlineSince && now() - offlineSince >= OFFLINE_BELL_MS && onDrive()) {
            note = { title: "O Google Drive não está respondendo", body: "O KERYX guarda as mudanças e envia quando a internet voltar." };
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
    // Músicas repetidas after a join (shared/syncDuplicates.mjs): the bell
    // once, when the merged library has songs that look the same.
    let watchDuplicates = 0;
    let checking = false;
    async function checkDuplicates() {
        if (!notify || checking || !watchDuplicates) return;
        if (now() - watchDuplicates > DUPLICATES_WATCH_MS) {
            watchDuplicates = 0;
            return;
        }
        checking = true;
        try {
            const { duplicateSongs } = await duplicateRules();
            const kept = store.call("User", "get", ["local"]).song_duplicates_kept;
            const groups = duplicateSongs(store.call("Song", "list", []), Array.isArray(kept) ? kept : []);
            if (!groups.length) return;
            watchDuplicates = 0;
            const n = groups.length;
            notify({
                key: DUPLICATES_BELL,
                kind: "info",
                title: n === 1 ? "1 música parece repetida" : `${n} músicas parecem repetidas`,
                body: "Depois de juntar com os outros computadores, há músicas com o mesmo título e a mesma letra. Veja em Configurações › Sincronização.",
                action: "settings:sincronizacao",
            });
        } catch (err) {
            log(`[keryx-sync] músicas repetidas: ${err.message}`);
        } finally {
            checking = false;
        }
    }

    function onStatus(state) {
        if (state.state === "ok") checkDuplicates();
        if (state.state === "ok") {
            since.sent += state.sent || 0;
            for (const k of ["applied", "skipped", "failed"]) since[k] += state.received?.[k] || 0;
            since.rejected += state.rejected || 0;
            since.collected += state.collectedMedia || 0;
        }
        if (state.state === "offline") offlineSince = offlineSince || now();
        else offlineSince = null;
        bell(state);
        if (told) {
            try {
                told(state);
            } catch { /* a listener's problem */ }
        }
    }

    // The outbox records only while this computer syncs (a folder and a code;
    // paused counts: the changes wait). Joining sends everything anyway.
    // On Drive signed out, the changes wait too.
    const syncing = () => Boolean((config().folder || onDrive()) && config().pairing);
    store.setRecording(syncing());

    const engine = createSyncEngine({
        store,
        mediaDir,
        getStore: shared,
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
        watchDuplicates = now().getTime();
        store.setRecording(true);
        const sent = store.snapshot();
        log(`[keryx-sync] código ${cur.pairing ? "novo" : "aceito"}; ${sent} registros a enviar`);
        engine.pass({ flush: true }).catch(() => {});
        return status();
    }

    async function removed(target, out) {
        const who = String(target || "").toLowerCase();
        const me = String(store.pcId).toLowerCase();
        if (!who) throw fail("Qual computador?");
        if (who === me) throw fail("Para este computador, use Sair da sincronização.");
        const p = currentPairing();
        if (!p) throw fail("Este computador ainda não sincroniza.");
        const list = await updateRemoved(await sharedOrFail(), p, (cur, at) => {
            const rest = cur.filter((r) => r.pc !== who);
            return out ? [...rest, { pc: who, at: at.toISOString(), by: me }] : rest;
        }, { pc: me, now: now() });
        if (list.error) throw fail(await joinMessage(list));
        await engine.pass({ flush: true });
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

    // The store the code is made, typed or changed in: Drive (signed in and
    // answering) or the folder.
    async function sharedOrFail() {
        if (!onDrive()) return createFolderStore(await folderOrFail());
        if (!google.status().signedIn) throw fail("Entre com a conta da igreja primeiro.");
        const d = drive();
        let up = false;
        try {
            up = await d.available();
        } catch (err) {
            throw fail(err.message);
        }
        if (!up) throw fail("O Google Drive não respondeu. Confira a internet.");
        return d;
    }

    // Google's own part of the status: the account and its space.
    async function googleStatus() {
        if (!google) return { available: false };
        const st = google.status();
        let quota = null;
        if (st.signedIn) {
            try {
                quota = await drive().about();
            } catch { /* offline: the space shows next time */ }
        }
        return { available: true, ...st, quota: quota && { used: quota.used, total: quota.total } };
    }

    function status() {
        const cur = config();
        let me = {};
        try {
            me = describe() || {};
        } catch { /* nameless */ }
        return {
            available: true,
            store: onDrive() ? "drive" : "folder",
            google: google ? google.status() : null,
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
            // Choosing a folder is the folder mode, Drive or not before.
            const next = root === cur.folder ? { ...cur } : { folder: root, paused: false };
            delete next.store;
            save(next);
            if (root !== cur.folder) {
                pairing = null;
                pairingFrom = null;
                store.setRecording(false);
                store.pruneOutbox(Number.MAX_SAFE_INTEGER);
            }
            engine.poke();
            return { ...status(), inspect: await inspectFolder(root) };
        },
        open: async () => {
            const folder = await folderOrFail();
            if (openPath) await openPath(folder);
            return null;
        },
        inspect: async () => {
            if (onDrive()) return google.status().signedIn ? inspectStore(drive()) : null;
            const folder = config().folder;
            return folder ? inspectFolder(folder) : null;
        },
        create: async () => {
            const made = await createPairing(await sharedOrFail(), { pc: store.pcId, now: now() });
            if (made.error) throw fail(await joinMessage(made), 409);
            return { code: made.code, ...(await paired(made)) };
        },
        join: async (_event, { code } = {}) => {
            const where = await sharedOrFail();
            const joined = await joinPairing(where, code);
            if (joined.error) throw fail(await joinMessage(joined));
            // Typing the code brings back a computer that was taken out.
            const pc = String(store.pcId).toLowerCase();
            await updateRemoved(where, joined, (list) => list.filter((r) => r.pc !== pc), { pc, now: now() }).catch(() => {});
            return paired(joined);
        },
        // Tirar (owner 2026-10-16): another computer stops until the code is
        // typed on it again; Deixar voltar undoes it from here.
        remove: async (_event, { pc: target } = {}) => removed(target, true),
        restore: async (_event, { pc: target } = {}) => removed(target, false),
        // Trocar o código: a new one over the folder's; the computers that
        // should stay type it, the one left out stops.
        rotate: async () => {
            if (!config().pairing) throw fail("Este computador ainda não sincroniza.");
            const made = await createPairing(await sharedOrFail(), { pc: store.pcId, replace: true, now: now() });
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
            if (!cur.folder && !onDrive()) throw fail("Escolha a pasta primeiro.");
            save({ ...cur, paused: Boolean(paused) });
            if (!paused) engine.poke();
            else await engine.pass({ flush: true });
            return status();
        },
        now: async () => {
            await engine.pass({ flush: true });
            return status();
        },
        // Google Drive direto (PR 2; Configurações' page is PR 3). Entering
        // opens the system's browser on Google's page and waits for it
        // (googleAuth.cjs); it does not switch the store by itself.
        googleSignIn: async () => {
            if (!google) throw fail("O Google Drive não está disponível nesta versão.", 404);
            try {
                await google.signIn();
            } catch (err) {
                throw fail(err.message, err.code === "offline" ? 503 : 400);
            }
            engine.poke();
            return { ...status(), google: await googleStatus() };
        },
        // The account, whether Google refused it, and the space used / total
        // (about.get; null while offline).
        googleStatus: async () => googleStatus(),
        // Sair da conta: forgotten here, revoked at Google. On Drive the
        // changes wait (the store stays chosen) until someone enters again.
        googleSignOut: async () => {
            if (!google) throw fail("O Google Drive não está disponível nesta versão.", 404);
            const out = await google.signOut();
            driveStore = null;
            if (onDrive()) await engine.pass();
            return { ...status(), revoked: out.revoked };
        },
        // The store: Drive ({ on: true }, signed in) or back to the folder.
        // Moving a computer that syncs to Drive sends everything here (it
        // merges there, as joining does: store.snapshot); the engine writes
        // the church's code file to Drive when it is not there yet.
        useDrive: async (_event, { on } = {}) => {
            const cur = config();
            if (!on) {
                const next = { ...cur };
                delete next.store;
                save(next);
                store.setRecording(syncing());
                engine.poke();
                return status();
            }
            if (!google) throw fail("O Google Drive não está disponível nesta versão.", 404);
            if (!google.status().signedIn) throw fail("Entre com a conta da igreja primeiro.");
            if (cur.store === "drive") return status();
            save({ ...cur, store: "drive", paused: false });
            if (cur.pairing) {
                store.setRecording(true);
                const sent = store.snapshot();
                log(`[keryx-sync] agora pelo Google Drive; ${sent} registros a enviar`);
                engine.pass({ flush: true }).catch(() => {});
            }
            return status();
        },
        // Sair da sincronização: this computer stops; nothing is deleted
        // here or in the folder, and the others keep what it sent.
        leave: async () => {
            save(null);
            pairing = null;
            pairingFrom = null;
            store.setRecording(false);
            store.pruneOutbox(Number.MAX_SAFE_INTEGER);
            await engine.pass({ flush: true });
            if (dismiss) dismiss(BELL);
            belled = null;
            return status();
        },
    };

    // After a backup restored or an export imported here (system.cjs asked
    // before the restart): "all" sends every row as an edit made now, so the
    // restored copies win on every computer (what was made after stays);
    // "leave" takes this computer out of the sync.
    function afterImport(mode) {
        if (mode === "leave") {
            save(null);
            pairing = null;
            pairingFrom = null;
            store.setRecording(false);
            store.pruneOutbox(Number.MAX_SAFE_INTEGER);
            log("[keryx-sync] dados restaurados só neste computador: ele saiu da sincronização");
            return;
        }
        if (mode === "all" && syncing()) {
            store.setRecording(true);
            const n = store.snapshot({ bump: true });
            log(`[keryx-sync] dados restaurados para todos os computadores: ${n} registros a enviar`);
            engine.poke();
        }
    }

    return {
        engine,
        ops,
        status,
        afterImport,
        start: (opts) => engine.start(opts),
        stop: () => engine.stop(),
        poke: () => engine.poke(),
        missing: () => engine.missing(),
    };
}

module.exports = { createSyncControl, sealWith, joinMessage, BELL };
