// Configurações › Sincronização, main-process side (docs/desktop-architecture.md
// §8b, PR 5): the folder, the church's code, on/off, the status and leaving,
// over the engine (sync.cjs) and the pairing (syncPairing.cjs), through the
// folder adapter of the sync store (syncStore/folder.cjs). Reached from
// the console through `keryx:sync` (data-ipc.cjs); pure enough to test
// without Electron: the native folder picker, the system's protection for
// the code (safeStorage) and the bell come in as functions.
//
// This computer's settings.json keeps, under "sync":
//   { folder, store, paused, pairing: { id, key, code, joinedAt },
//     drive: { email, id, key, joinedAt, accountNew } }
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
//
// On Drive there is no church code (the owner's item 4, 27/10): entering
// with the account joins this computer to the key in the account's hidden
// folder, or makes it there when the account has none (joinDrive in
// syncPairing.cjs). `drive` is that pairing, for that account (`email`);
// `pairing` stays the folder's, untouched, so a computer that moves from the
// folder to Drive keeps its code for the folder and gets the account's key
// beside it (the two never share a key), and going back to the folder needs
// no code typed. While on Drive and entered, a computer without the
// account's key (it never joined, the join failed offline, the key would not
// open here) or with another one (the key there changed) joins again by
// itself on the next pass; only a sign-in (googleSignIn) takes it off the
// Desconectar list.

const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createSyncEngine, inspectFolder, inspectStore } = require("./sync.cjs");
const { createFolderStore } = require("./syncStore/index.cjs");
const { createDriveStore } = require("./syncStore/drive.cjs");
const { createPairing, joinPairing, updateRemoved, joinDrive, codeRules } = require("./syncPairing.cjs");

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
// A join with the account's key that failed (Drive not answering) is tried
// again by the passes, at most this often.
const DRIVE_JOIN_RETRY_MS = 60 * 1000;
// What the ops answer on Drive for the code's own actions.
const NO_CODE_ON_DRIVE = "Na conta Google não há código da igreja: entrar com a conta já junta este computador.";
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
    // much, but a key that no longer opens should say so once): the folder's
    // (the code's) or, on Drive, the account's.
    let pairing = null;
    let pairingFrom = null;
    const account = () => String((google && google.email()) || "").toLowerCase();
    // The Drive pairing kept here, when it is the account's entered now (no
    // account known — signed out — keeps it: the engine says "auth").
    function drivePairing() {
        const d = config().drive;
        if (!d || !d.id || !d.key) return null;
        const now = account();
        return !now || !d.email || d.email === now ? d : null;
    }
    function currentPairing() {
        const share = onDrive();
        const p = share ? drivePairing() : config().pairing;
        if (!p || !p.id || !p.key) return null;
        if (pairingFrom === p.key && pairing) return pairing;
        const hex = protect.open(p.key);
        pairingFrom = p.key;
        pairing = hex && /^[0-9a-f]{64}$/.test(hex) ? { id: p.id, key: Buffer.from(hex, "hex"), ...(share ? { share: true } : {}) } : null;
        if (!pairing) log(`[keryx-sync] a chave guardada não abriu neste computador: ${share ? "ela vem de novo da conta" : "digite o código da igreja de novo"}`);
        return pairing;
    }
    const forgetPairing = () => {
        pairing = null;
        pairingFrom = null;
    };
    // Drive's join (driveJoin): a sign-in's readmit not done yet, the join
    // under way, and when the last one failed.
    let readmitPending = false;
    let joining = null;
    let joinFailedAt = 0;

    // What has gone back and forth since KERYX opened, and the bell.
    const since = { sent: 0, applied: 0, skipped: 0, failed: 0, rejected: 0, collected: 0 };
    let offlineSince = null;
    let belled = null;
    function bell(state) {
        if (!notify) return;
        let note = null;
        // On Drive a key that changed is taken again by itself (driveJoin).
        if (state.state === "mismatch" && !onDrive()) {
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
        // On Drive, entered: no key here yet, or the account's changed; or a
        // sign-in whose readmit Drive failed (it is still on the list).
        const rejoin = state.state === "unpaired" || state.state === "mismatch" || (state.state === "removed" && readmitPending);
        if (rejoin && onDrive() && google.status().signedIn) autoJoin();
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
    const syncing = () => Boolean(onDrive() ? drivePairing() : config().folder && config().pairing);
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
        forgetPairing();
        watchDuplicates = now().getTime();
        store.setRecording(true);
        const sent = store.snapshot();
        log(`[keryx-sync] código ${cur.pairing ? "novo" : "aceito"}; ${sent} registros a enviar`);
        engine.pass({ flush: true }).catch(() => {});
        return status();
    }

    // Drive: joins this computer to the account's key (joinDrive), made there
    // when the account has none. With `readmit` (a sign-in) it also takes
    // itself off the Desconectar list. A key that is new here is kept and
    // everything here is sent (it merges, as typing the code does); the same
    // key again changes nothing. -> { created, sent } | throws.
    async function driveJoin({ readmit = false } = {}) {
        if (readmit) readmitPending = true;
        const where = await sharedOrFail();
        const me = String(store.pcId).toLowerCase();
        const email = account();
        const kept = drivePairing() && currentPairing();
        const got = await joinDrive(where, { pc: me, now: now(), mine: kept });
        if (got.error) throw fail("O Google Drive não entregou o arquivo da sincronização. Tente de novo em instantes.", 503);
        const share = { id: got.id, key: got.key, share: true };
        if (readmitPending) {
            const list = await updateRemoved(where, share, (cur) => cur.filter((r) => r.pc !== me), { pc: me, now: now() });
            if (!list.error) readmitPending = false;
        }
        if (kept && kept.id === got.id && kept.key.equals(got.key)) return { created: false, sent: 0 };
        // The account had no KERYX yet: this computer started the church's
        // sync there (PR 3's "ainda não tem nada do KERYX").
        let alone = got.created;
        if (alone) {
            try {
                alone = !(await where.list("computers/")).some((o) => !o.name.toLowerCase().includes(me));
            } catch { /* unknown: said as new */ }
        }
        save({
            ...config(),
            drive: { email, id: got.id, key: protect.seal(got.key.toString("hex")), joinedAt: now().toISOString(), accountNew: alone },
        });
        forgetPairing();
        watchDuplicates = now().getTime();
        store.setRecording(true);
        const sent = store.snapshot();
        log(`[keryx-sync] ${got.created ? "chave nova na conta" : "chave da conta recebida"}; ${sent} registros a enviar`);
        engine.pass({ flush: true }).catch(() => {});
        return { created: got.created, sent };
    }
    // From the passes: one join at a time, a failed one not again for a while.
    function autoJoin() {
        if (joining || (joinFailedAt && now() - joinFailedAt < DRIVE_JOIN_RETRY_MS)) return;
        joining = driveJoin()
            .then(() => { joinFailedAt = 0; })
            .catch((err) => {
                joinFailedAt = now().getTime();
                log(`[keryx-sync] entrar com a chave da conta: ${err.message}`);
            })
            .finally(() => { joining = null; });
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
        const drive = onDrive();
        const p = drive ? drivePairing() : cur.pairing;
        const eng = engine.status();
        const pc = String(store.pcId).toLowerCase();
        return {
            available: true,
            store: drive ? "drive" : "folder",
            google: google ? google.status() : null,
            folder: cur.folder || null,
            paused: Boolean(cur.paused),
            paired: Boolean(p),
            // The key would not open here (settings brought from another
            // computer or Windows account): the code has to be typed again.
            // On Drive it comes from the account again by itself.
            keyLost: !drive && Boolean(p) && !currentPairing(),
            canShowCode: !drive && Boolean(p && p.code),
            joinedAt: p?.joinedAt || null,
            // Drive: this computer started the church's sync in an account
            // that had no KERYX, and no other computer has shown up there yet.
            accountNew: Boolean(drive && p && p.accountNew)
                && !(eng.computers || []).some((c) => String(c.pc).toLowerCase() !== pc && c.verified),
            pc: store.pcId,
            name: me.name || null,
            version: me.version || null,
            since: { ...since },
            engine: eng,
        };
    }

    // Google's sign-in, then this computer on Drive with the account's key
    // (made there when the account has none), off the Desconectar list, and
    // everything here sent. A join that fails (Drive not answering) is left
    // to the passes; the sign-in itself stands. -> status + { joined }.
    async function enterDrive({ readmit }) {
        save({ ...config(), store: "drive", paused: false });
        forgetPairing();
        store.setRecording(syncing());
        let joined = null;
        let joinError = null;
        try {
            joined = await driveJoin({ readmit });
        } catch (err) {
            joinError = err.message;
            joinFailedAt = now().getTime();
            log(`[keryx-sync] entrar com a chave da conta: ${err.message}`);
        }
        engine.poke();
        return { ...status(), google: await googleStatus(), joined, joinError };
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
                forgetPairing();
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
            if (onDrive()) throw fail(NO_CODE_ON_DRIVE, 409);
            const made = await createPairing(await sharedOrFail(), { pc: store.pcId, now: now() });
            if (made.error) throw fail(await joinMessage(made), 409);
            return { code: made.code, ...(await paired(made)) };
        },
        join: async (_event, { code } = {}) => {
            if (onDrive()) throw fail(NO_CODE_ON_DRIVE, 409);
            const where = await sharedOrFail();
            const joined = await joinPairing(where, code);
            if (joined.error) throw fail(await joinMessage(joined));
            // Typing the code brings back a computer that was taken out.
            const pc = String(store.pcId).toLowerCase();
            await updateRemoved(where, joined, (list) => list.filter((r) => r.pc !== pc), { pc, now: now() }).catch(() => {});
            return paired(joined);
        },
        // Tirar (owner 2026-10-16): another computer stops until the code is
        // typed on it again; Deixar voltar undoes it from here. On Drive it
        // is Dispositivos conectados › Desconectar: the computer stops until
        // someone enters with the account on it again (the owner's G3 = A).
        remove: async (_event, { pc: target } = {}) => removed(target, true),
        restore: async (_event, { pc: target } = {}) => removed(target, false),
        // Trocar o código: a new one over the folder's; the computers that
        // should stay type it, the one left out stops.
        rotate: async () => {
            if (onDrive()) throw fail(NO_CODE_ON_DRIVE, 409);
            if (!config().pairing) throw fail("Este computador ainda não sincroniza.");
            const made = await createPairing(await sharedOrFail(), { pc: store.pcId, replace: true, now: now() });
            return { code: made.code, ...(await paired(made)) };
        },
        showCode: async () => {
            if (onDrive()) throw fail(NO_CODE_ON_DRIVE, 404);
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
        // (googleAuth.cjs), then this computer syncs through that account:
        // Drive, the account's key (joined, or made when the account has
        // none: `joined.created`, and `accountNew` in the status), off the
        // Desconectar list. A canceled sign-in rejects with code "canceled".
        googleSignIn: async () => {
            if (!google) throw fail("O Google Drive não está disponível nesta versão.", 404);
            try {
                await google.signIn();
            } catch (err) {
                throw Object.assign(fail(err.message, err.code === "offline" ? 503 : 400), { code: err.code });
            }
            return enterDrive({ readmit: true });
        },
        // Cancelar, while the browser is open on Google's page.
        googleCancel: async () => {
            if (!google) throw fail("O Google Drive não está disponível nesta versão.", 404);
            google.cancel();
            return status();
        },
        // Abrir de novo: the same Google page, for the sign-in waiting.
        googleReopen: async () => {
            if (!google) throw fail("O Google Drive não está disponível nesta versão.", 404);
            try {
                await google.reopen();
            } catch (err) {
                throw fail(err.message, 409);
            }
            return status();
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
        // The store: Drive ({ on: true }, signed in: the account's key, as a
        // sign-in does, without taking this computer off the Desconectar
        // list) or back to the folder, whose code stays kept here. Moving to
        // Drive sends everything here (it merges there, as joining does).
        useDrive: async (_event, { on } = {}) => {
            const cur = config();
            if (!on) {
                const next = { ...cur };
                delete next.store;
                save(next);
                forgetPairing();
                store.setRecording(syncing());
                engine.poke();
                return status();
            }
            if (!google) throw fail("O Google Drive não está disponível nesta versão.", 404);
            if (!google.status().signedIn) throw fail("Entre com a conta da igreja primeiro.");
            if (cur.store === "drive" && drivePairing()) return status();
            const entered = await enterDrive({ readmit: false });
            return entered;
        },
        // Sair da sincronização: this computer stops; nothing is deleted
        // here or in the folder, and the others keep what it sent.
        leave: async () => {
            save(null);
            forgetPairing();
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
            forgetPairing();
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
