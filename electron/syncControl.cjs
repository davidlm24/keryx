// Configurações › Sincronização, main-process side (docs/desktop-architecture.md
// §8b): the church's Google account (Google Drive direto), its key, on/off,
// the status and leaving, over the engine (sync.cjs), the pairing
// (syncPairing.cjs) and the Drive adapter of the sync store
// (syncStore/drive.cjs). Reached from the console through `keryx:sync`
// (data-ipc.cjs); pure enough to test without Electron: the sign-in
// (googleAuth.cjs), the system's protection for the key (safeStorage) and
// the bell come in as objects and functions.
//
// This computer's settings.json keeps, under "sync":
//   { store: "drive", paused, drive: { email, id, key, joinedAt, accountNew },
//     googleNoticed, folder }
// key sealed by `protect` (Windows' own protection, DPAPI); it signs and
// checks the lines. googleAuth.cjs keeps its own "google" entry.
//
// There is no church code (the owner's item 4, 27/10): entering with the
// account joins this computer to the key in the account's hidden folder, or
// makes it there when the account has none (joinDrive in syncPairing.cjs).
// `drive` is that pairing, for that account (`email`). While entered, a
// computer without the account's key (it never joined, the join failed
// offline, the key would not open here) or with another one (the key there
// changed) joins again by itself on the next pass; only a sign-in
// (googleSignIn) takes it off the Desconectar list.
//
// The shared folder of before (Google Drive para computador) went in PR 4.
// A computer that synced by it keeps `folder` (its path) only so the page
// can say so (the migration banner, G4) and the bell tells once; it does not
// sync until someone enters with the account on it, and entering forgets the
// folder, its code and its key (`pairing`). Nothing in the folder is read,
// written or deleted.

const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { createSyncEngine } = require("./sync.cjs");
const { createDriveStore } = require("./syncStore/drive.cjs");
const { updateRemoved, joinDrive } = require("./syncPairing.cjs");

const KEY = "sync";
// The bell's one entry for the sync (notifications.cjs keeps one per key).
const BELL = "sync";
// Drive not answering this long before the bell says so (a laptop that
// opens before its network does is not news).
const OFFLINE_BELL_MS = 10 * 60 * 1000;
// After a join, how long the passes look for likely duplicate songs (the
// other computers' songs arrive over a few passes); the bell says so once.
const DUPLICATES_BELL = "sync-dups";
const DUPLICATES_WATCH_MS = 15 * 60 * 1000;
// The one notice for a computer that synced by the folder (G4).
const GOOGLE_BELL = "sync-google";
// A join with the account's key that failed (Drive not answering) is tried
// again by the passes, at most this often.
const DRIVE_JOIN_RETRY_MS = 60 * 1000;
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

// pt-BR for what updateRemoved answers.
function listMessage(result) {
    switch (result.error) {
        case "busy": return "O Google Drive não entregou o arquivo da sincronização. Tente de novo em instantes.";
        case "mismatch": return "A chave da sincronização mudou nesta conta. Espere este computador entrar de novo com ela.";
        default: return "A sincronização ainda não começou nesta conta.";
    }
}

const fail = (message, status = 400) => Object.assign(new Error(message), { status });

// onStatus: told after every pass, too (main pushes the media still coming).
// google: googleAuth.cjs (null: no Drive here); driveOptions: what the Drive
// adapter is made with besides it (fetchImpl, the tests' endpoints).
function createSyncControl({ store, mediaDir, settings, protect, describe = () => ({}), notify = null, dismiss = null, log = console.warn, now = () => new Date(), onStatus: told = null, engineOptions = {}, google = null, driveOptions = {} }) {
    const config = () => {
        const c = settings.get(KEY, null);
        return c && typeof c === "object" ? c : {};
    };
    const save = (next) => settings.set(KEY, next && Object.keys(next).length ? next : null);
    const onDrive = () => config().store === "drive" && Boolean(google);

    // The store in use, made again when the account changes (another account
    // is another store: its reading starts over).
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
        return onDrive() ? drive() : null;
    }

    // The account's key opened once (decrypting on every pass would cost
    // nothing much, but a key that no longer opens should say so once).
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
        const p = onDrive() ? drivePairing() : null;
        if (!p || !p.id || !p.key) return null;
        if (pairingFrom === p.key && pairing) return pairing;
        const hex = protect.open(p.key);
        pairingFrom = p.key;
        pairing = hex && /^[0-9a-f]{64}$/.test(hex) ? { id: p.id, key: Buffer.from(hex, "hex") } : null;
        if (!pairing) log("[keryx-sync] a chave guardada não abriu neste computador: ela vem de novo da conta");
        return pairing;
    }
    const forgetPairing = () => {
        pairing = null;
        pairingFrom = null;
    };
    // Drive's join (driveJoin): a sign-in's readmit not done yet ({ at }: when
    // that sign-in happened), the join under way, and when the last one
    // failed.
    let readmitPending = null;
    let joining = null;
    let joinFailedAt = 0;

    // What has gone back and forth since KERYX opened, and the bell.
    const since = { sent: 0, applied: 0, skipped: 0, failed: 0, rejected: 0, collected: 0 };
    let offlineSince = null;
    let belled = null;
    function bell(state) {
        if (!notify) return;
        let note = null;
        // A key that changed is taken again by itself (driveJoin): no bell.
        if (state.state === "auth") {
            note = { title: "Sincronização parada: entre de novo com a conta da igreja", body: `${state.error || "O Google não aceitou a entrada guardada."} As mudanças deste computador esperam.` };
        } else if (state.state === "offline" && offlineSince && now() - offlineSince >= OFFLINE_BELL_MS) {
            note = { title: "O Google Drive não está respondendo", body: "O KERYX guarda as mudanças e envia quando a internet voltar." };
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
        // Entered: no key here yet, or the account's changed; or a sign-in
        // whose readmit Drive failed (it is still on the list).
        const rejoin = state.state === "unpaired" || state.state === "mismatch" || (state.state === "removed" && readmitPending);
        if (rejoin && onDrive() && google.status().signedIn) autoJoin();
        bell(state);
        if (told) {
            try {
                told(state);
            } catch { /* a listener's problem */ }
        }
    }

    // The outbox records only while this computer syncs (entered and joined;
    // paused counts: the changes wait, and signed out too). Joining sends
    // everything anyway.
    const syncing = () => Boolean(onDrive() && drivePairing());
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

    // Joins this computer to the account's key (joinDrive), made there
    // when the account has none. With `readmit` (a sign-in) it also takes
    // itself off the Desconectar list — only what was disconnected before
    // that sign-in (the owner, 2026-10-27: "tirar da lista só o que foi
    // desconectado antes da entrada"): a readmit that Drive failed is tried
    // again by the passes, and a Desconectar made meanwhile stays (G3 = A:
    // only a new sign-in brings it back). A key that is new here is kept and
    // everything here is sent (it merges: store.snapshot); the same key again
    // changes nothing. -> { created, sent } | throws.
    async function driveJoin({ readmit = false } = {}) {
        if (readmit) readmitPending = { at: now().toISOString() };
        const where = await sharedOrFail();
        const me = String(store.pcId).toLowerCase();
        const email = account();
        // No account known (it should be, right after a sign-in): never hand
        // joinDrive a key kept for another one.
        const kept = email ? drivePairing() && currentPairing() : null;
        const got = await joinDrive(where, { pc: me, now: now(), mine: kept });
        if (got.error) throw fail("O Google Drive não entregou o arquivo da sincronização. Tente de novo em instantes.", 503);
        const joinedKey = { id: got.id, key: got.key };
        if (readmitPending) {
            const since = readmitPending.at;
            // An entry's `at` is the ISO time the other computer wrote (its
            // clock); one at or before this sign-in goes.
            const list = await updateRemoved(where, joinedKey, (cur) => cur.filter((r) => r.pc !== me || String(r.at || "") > since), { pc: me, now: now() });
            if (!list.error) readmitPending = null;
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
        if (who === me) throw fail("Para este computador, use Sair da conta.");
        const p = currentPairing();
        if (!p) throw fail("Este computador ainda não sincroniza.");
        const list = await updateRemoved(await sharedOrFail(), p, (cur, at) => {
            const rest = cur.filter((r) => r.pc !== who);
            return out ? [...rest, { pc: who, at: at.toISOString(), by: me }] : rest;
        }, { pc: me, now: now() });
        if (list.error) throw fail(listMessage(list));
        await engine.pass({ flush: true });
        return status();
    }

    // Drive, signed in and answering.
    async function sharedOrFail() {
        if (!onDrive()) throw fail("Entre com a conta da igreja primeiro.");
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
                const d = drive();
                quota = await d.about();
                // What the KERYX hidden folder holds (Espaço da conta, G2).
                quota.mine = (await d.list("")).reduce((sum, o) => sum + (Number(o.size) || 0), 0);
            } catch { /* offline: the space shows next time */ }
        }
        return { available: true, ...st, quota: quota && { used: quota.used, total: quota.total, mine: quota.mine ?? null } };
    }

    function status() {
        const cur = config();
        let me = {};
        try {
            me = describe() || {};
        } catch { /* nameless */ }
        const drive = onDrive();
        const p = drive ? drivePairing() : null;
        const eng = engine.status();
        const pc = String(store.pcId).toLowerCase();
        return {
            available: true,
            store: drive ? "drive" : null,
            google: google ? google.status() : null,
            // The shared folder this computer synced by before PR 4 (the
            // migration banner, G4), until it enters with the account.
            folder: drive ? null : cur.folder || null,
            paused: Boolean(cur.paused),
            paired: Boolean(p),
            joinedAt: p?.joinedAt || null,
            // This computer started the church's sync in an account that had
            // no KERYX, and no other computer has shown up there yet.
            accountNew: Boolean(drive && p && p.accountNew)
                && !(eng.computers || []).some((c) => String(c.pc).toLowerCase() !== pc && c.verified),
            pc: store.pcId,
            name: me.name || null,
            version: me.version || null,
            since: { ...since },
            // The changes here still to go, and the media file coming now
            // ({ name, size, got }): the cloud's Esperando and Chegando.
            waiting: store.outboxCount ? store.outboxCount() : 0,
            arriving: engine.arriving ? engine.arriving() : null,
            engine: eng,
        };
    }

    // G4 = A (the owner's mark, 2026-10-26): a computer that synced by the
    // folder hears once, in the bell, that the sync is the Google account's
    // now; Configurações › Sincronização keeps the banner until it enters.
    function noticeGoogle() {
        const cur = config();
        if (!notify || !google || !cur.folder || cur.store === "drive" || cur.googleNoticed) return;
        notify({
            key: GOOGLE_BELL,
            kind: "info",
            title: "A sincronização agora é pela conta Google",
            body: "Entre com a conta da igreja em Configurações › Sincronização. Até entrar, este computador não sincroniza com os outros.",
            action: "settings:sincronizacao",
        });
        save({ ...cur, googleNoticed: true });
    }

    // Google's sign-in, then this computer on Drive with the account's key
    // (made there when the account has none), off the Desconectar list, and
    // everything here sent. A join that fails (Drive not answering) is left
    // to the passes; the sign-in itself stands. The folder of before and its
    // code are forgotten here. -> status + { joined }.
    async function enterDrive({ readmit }) {
        const next = { ...config(), store: "drive", paused: false };
        delete next.folder;
        delete next.pairing;
        save(next);
        if (dismiss) dismiss(GOOGLE_BELL);
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
        // Dispositivos conectados › Desconectar (the owner's G3 = A): another
        // computer stops until someone enters with the account on it again;
        // Deixar voltar undoes it from here.
        remove: async (_event, { pc: target } = {}) => removed(target, true),
        restore: async (_event, { pc: target } = {}) => removed(target, false),
        setPaused: async (_event, { paused } = {}) => {
            const cur = config();
            if (!onDrive()) throw fail("Entre com a conta da igreja primeiro.");
            save({ ...cur, paused: Boolean(paused) });
            if (!paused) engine.poke();
            else await engine.pass({ flush: true });
            return status();
        },
        now: async () => {
            await engine.pass({ flush: true });
            return status();
        },
        // Entrar com Google: the system's browser on Google's page, waited
        // for (googleAuth.cjs), then this computer syncs through that
        // account: the account's key (joined, or made when the account has
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
        // Sair da conta: forgotten here, revoked at Google. The changes wait
        // (the store stays chosen) until someone enters again.
        googleSignOut: async () => {
            if (!google) throw fail("O Google Drive não está disponível nesta versão.", 404);
            const out = await google.signOut();
            driveStore = null;
            // A readmit still pending belonged to that sign-in.
            readmitPending = null;
            if (onDrive()) await engine.pass();
            return { ...status(), revoked: out.revoked };
        },
        // Sair da sincronização: this computer stops; nothing is deleted
        // here or in the account, and the others keep what it sent.
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
        start: (opts) => {
            noticeGoogle();
            return engine.start(opts);
        },
        stop: () => engine.stop(),
        poke: () => engine.poke(),
        missing: () => engine.missing(),
    };
}

module.exports = { createSyncControl, sealWith, BELL };
