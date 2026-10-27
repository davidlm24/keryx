// node --test electron/syncControl.test.cjs   (npm test)
// Configurações › Sincronização's main-process side, on temp stores and one
// fake Google Drive server (fixtures/fakeDriveServer.cjs), with the sign-in,
// the system's protection and the bell faked.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore, PROFILE_ID } = require("./db/store.cjs");
const { createSyncControl, sealWith } = require("./syncControl.cjs");
const schema = require("./db/schema.json");
const { fakeDriveServer } = require("./fixtures/fakeDriveServer.cjs");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "keryx-syncctl-"));

// settings.json in memory, the way settings.cjs answers.
function memorySettings() {
    const data = {};
    return { data, get: (k, d) => (data[k] === undefined ? d : data[k]), set: (k, v) => { data[k] = v; } };
}

// A protection that is not plain text, like Windows' (and one that a
// different "account" cannot open).
function fakeProtection(account = "igreja") {
    return sealWith({
        isEncryptionAvailable: () => true,
        encryptString: (t) => Buffer.from(`${account}|${t}`),
        decryptString: (b) => {
            const [who, ...rest] = b.toString().split("|");
            if (who !== account) throw new Error("outra conta");
            return rest.join("|");
        },
    });
}

// The church's Google account, faked (googleAuth.cjs's surface): every
// computer signs in to the same one, whose token the fake Drive takes.
function fakeGoogle(srv) {
    const g = { signed: false, refused: false };
    const auth = () => Object.assign(new Error("Entre de novo com a conta da igreja."), { code: "auth" });
    Object.assign(g, {
        status: () => ({ signedIn: g.signed, email: g.signed || g.refused ? "igreja@example.com" : null, refused: g.refused, keyLost: false, signingIn: false, configured: true }),
        email: () => (g.signed ? "igreja@example.com" : null),
        signIn: async () => { g.signed = true; g.refused = false; return g.status(); },
        signOut: async () => { g.signed = false; return { revoked: true, ...g.status() }; },
        accessToken: async () => { if (!g.signed) throw auth(); return srv.token; },
        invalidate() {},
        refuse() { g.signed = false; g.refused = true; },
        cancel: () => { g.canceled = (g.canceled || 0) + 1; return g.status(); },
        reopen: async () => { g.reopened = (g.reopened || 0) + 1; return g.status(); },
    });
    return g;
}

// A computer; with `srv` (a fake Drive server), on the church's account.
function computer(name, opts = {}) {
    const dir = tmp();
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir);
    const store = createStore({ file: path.join(dir, "keryx.db"), schema, log: () => {} });
    const settings = opts.settings || memorySettings();
    const bell = [];
    const google = opts.google || (opts.srv ? fakeGoogle(opts.srv) : null);
    const driveOptions = opts.driveOptions || (opts.srv ? { api: opts.srv.api, upload: opts.srv.upload, freshMs: 0 } : {});
    const control = createSyncControl({
        store,
        mediaDir,
        settings,
        protect: opts.protect || fakeProtection(),
        describe: () => ({ name, version: "0.2.22" }),
        notify: (n) => bell.push(n),
        dismiss: (key) => bell.push({ dismissed: key }),
        log: () => {},
        google,
        driveOptions,
        ...(opts.now ? { now: opts.now } : {}),
    });
    const call = (op, args) => control.ops[op](null, args);
    return { store, settings, control, call, bell, google, close: () => store.close() };
}

const titles = (pc) => pc.store.call("Song", "list", []).map((s) => s.title).sort();
const settle = async (pcs, n = 3) => { for (let i = 0; i < n; i++) for (const pc of pcs) await pc.call("now"); };

const driveFile = (srv) => {
    const [f] = srv.named("keryx-sync.json");
    return f ? JSON.parse(f.bytes.toString("utf8")) : null;
};

// A computer that synced by the shared folder on an older KERYX: its
// settings as that version left them.
const folderSettings = () => {
    const settings = memorySettings();
    settings.data.sync = {
        folder: "G:\\Meu Drive\\KERYX",
        pairing: { id: "codigo-antigo-0001", key: "safe:aWdyZWphfDAw", code: "safe:aWdyZWphfEs3UU0=", joinedAt: "2026-10-01T00:00:00.000Z" },
    };
    return settings;
};

test("two computers enter with the account: the first makes the key, the second joins with nothing typed, both end with everything", async (t) => {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    const a = computer("IGREJA-SOM", { srv });
    const b = computer("NOTEBOOK-PASTOR", { srv });
    a.store.call("Song", "create", [{ title: "Só no som" }]);
    a.store.call("User", "update", [PROFILE_ID, { church_name: "Igreja Gerar" }]);
    b.store.call("Song", "create", [{ title: "Só no notebook" }]);

    const before = await a.call("status");
    assert.equal(before.store, null);
    assert.equal(before.folder, null);
    assert.equal(before.paired, false);
    assert.equal(a.store.isRecording(), false, "not syncing: the outbox stays empty");
    assert.equal(a.store.outbox().length, 0);
    await assert.rejects(a.call("setPaused", { paused: true }), /Entre com a conta/);
    await assert.rejects(a.call("remove", { pc: b.store.pcId }), /Entre com a conta|ainda não sincroniza/);
    for (const op of ["choose", "create", "join", "rotate", "showCode", "useDrive", "inspect", "open"]) {
        assert.equal(a.control.ops[op], undefined, `${op}: the folder and the church's code went in PR 4`);
    }

    const entered = await a.call("googleSignIn");
    assert.equal(entered.store, "drive");
    assert.equal(entered.paired, true);
    assert.equal(entered.joined.created, true);
    assert.equal(entered.accountNew, true);
    assert.ok(!("canShowCode" in entered) && !("keyLost" in entered), "no code, no code's key");
    const file = driveFile(srv);
    assert.equal(file.v, 2);
    assert.match(file.key, /^[A-Za-z0-9_-]{43}$/, "the key is in the hidden folder");
    assert.match(a.settings.data.sync.drive.key, /^safe:/, "the account's key sealed here");
    assert.ok(!JSON.stringify(a.settings.data).includes(file.key), "the key is never kept in plain text");

    const bIn = await b.call("googleSignIn");
    assert.equal(bIn.joined.created, false);
    assert.equal(bIn.accountNew, false);
    assert.equal(b.settings.data.sync.drive.id, file.id);
    await settle([a, b]);
    assert.deepEqual(titles(a), ["Só no notebook", "Só no som"], "entering merges");
    assert.deepEqual(titles(b), ["Só no notebook", "Só no som"]);
    assert.equal(b.store.call("User", "get", [PROFILE_ID]).church_name, "Igreja Gerar", "a fresh profile never overwrites the church's");

    // An edit on one reaches the other on the next passes.
    const song = a.store.call("Song", "list", []).find((s) => s.title === "Só no som");
    a.store.call("Song", "update", [song.id, { title: "Agora em todos" }]);
    await settle([a, b], 1);
    assert.ok(titles(b).includes("Agora em todos"));

    const st = await b.call("status");
    assert.equal(st.engine.state, "ok");
    assert.ok(!b.bell.some((n) => n.key === "sync-dups"), "no look-alike songs, no bell");
    assert.equal(st.name, "NOTEBOOK-PASTOR");
    const other = st.engine.computers.find((c) => c.pc === a.store.pcId);
    assert.equal(other.name, "IGREJA-SOM");
    assert.equal(other.version, "0.2.22");
    assert.equal(other.verified, true);
    assert.ok(st.since.applied >= 2);
    assert.equal((await a.call("status")).accountNew, false, "another computer showed up");
    a.close();
    b.close();
});

test("pause, sync now, Desconectar and Deixar voltar, sign out and in, leave", async (t) => {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    const a = computer("A", { srv });
    const b = computer("B", { srv });
    await a.call("googleSignIn");
    await b.call("googleSignIn");
    await settle([a, b], 1);

    // Paused: the account and the key stay; changes wait.
    const paused = await b.call("setPaused", { paused: true });
    assert.equal(paused.paused, true);
    assert.equal(paused.engine.state, "off");
    b.store.call("Song", "create", [{ title: "Durante a pausa" }]);
    await settle([a, b], 1);
    assert.ok(!titles(a).includes("Durante a pausa"));
    await b.call("setPaused", { paused: false });
    await settle([b, a], 1);
    assert.ok(titles(a).includes("Durante a pausa"));

    // Desconectar B from A: B stops, its change waits; entering again on B
    // takes it off the list.
    await assert.rejects(a.call("remove", { pc: a.store.pcId }), /Sair da conta/);
    const afterRemove = await a.call("remove", { pc: b.store.pcId });
    assert.equal(afterRemove.engine.computers.find((c) => c.pc === b.store.pcId).removed.by, a.store.pcId.toLowerCase());
    assert.deepEqual(driveFile(srv).removed.map((r) => r.pc), [b.store.pcId.toLowerCase()]);
    assert.ok(driveFile(srv).key, "the key stays in the file");
    b.store.call("Song", "create", [{ title: "Depois de desconectado" }]);
    const off = await b.call("now");
    assert.equal(off.engine.state, "removed");
    assert.match(off.engine.error, /desconectado/);
    assert.equal((await b.call("now")).engine.state, "removed", "a pass never readmits it");
    await settle([a]);
    assert.ok(!titles(a).includes("Depois de desconectado"));
    const back = await b.call("googleSignIn");
    assert.equal(back.joined.sent, 0, "the same key: nothing sent again");
    assert.deepEqual(driveFile(srv).removed, []);
    await settle([b, a]);
    assert.ok(titles(a).includes("Depois de desconectado"));

    // Deixar voltar, from A.
    await a.call("remove", { pc: b.store.pcId });
    assert.equal((await b.call("now")).engine.state, "removed");
    await a.call("restore", { pc: b.store.pcId });
    assert.equal((await b.call("now")).engine.state, "ok");

    // Signed out: the engine says so, the changes wait, and go once it enters.
    const out = await b.call("googleSignOut");
    assert.equal(out.revoked, true);
    assert.equal(out.engine.state, "auth");
    b.store.call("Song", "create", [{ title: "Enquanto fora" }]);
    assert.ok(b.store.outbox().length > 0);
    await b.call("googleSignIn");
    await settle([b, a]);
    assert.ok(titles(a).includes("Enquanto fora"));

    // Google refusing the account here: the state, and the bell once.
    a.google.refuse();
    const refused = await a.call("now");
    assert.equal(refused.engine.state, "auth");
    assert.match(refused.engine.error, /Entre de novo/);
    assert.equal(a.bell.filter((n) => /entre de novo com a conta/.test(n.title || "")).length, 1);

    // Leaving: this computer stops, nothing is deleted anywhere.
    const left = await b.call("leave");
    assert.equal(left.paired, false);
    assert.equal(left.engine.state, "off");
    assert.equal(b.settings.data.sync, null);
    b.store.call("Song", "create", [{ title: "Depois de sair" }]);
    assert.equal(b.store.outbox().length, 0, "nothing is recorded while it does not sync");
    assert.ok(titles(b).includes("Enquanto fora"), "what it had stays");
    a.close();
    b.close();
});

test("a third computer joins the same key; the key file stays one", async (t) => {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    const pcs = ["IGREJA-SOM", "NOTEBOOK-PASTOR", "SALA-JOVENS"].map((n) => computer(n, { srv }));
    pcs.forEach((pc, i) => pc.store.call("Song", "create", [{ title: `Música ${i + 1}` }]));
    for (const pc of pcs) await pc.call("googleSignIn");
    await settle(pcs);
    for (const pc of pcs) assert.deepEqual(titles(pc), ["Música 1", "Música 2", "Música 3"]);
    assert.equal(srv.named("keryx-sync.json").length, 1);
    for (const pc of pcs) pc.close();
});

test("after a join, the bell says once that some songs look repeated", async (t) => {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    const a = computer("A", { srv });
    const b = computer("B", { srv });
    a.store.call("Song", "create", [{ title: "Grande é o Senhor", lyrics: "Grande é o Senhor" }]);
    b.store.call("Song", "create", [{ title: "Grande e o senhor", lyrics: "grande é o Senhor!" }]);
    b.store.call("Song", "create", [{ title: "Santo", lyrics: "Santo" }]);
    await a.call("googleSignIn");
    await b.call("googleSignIn");
    await settle([a, b], 2);
    for (const pc of [a, b]) {
        const dups = pc.bell.filter((n) => n.key === "sync-dups");
        assert.equal(dups.length, 1, "once");
        assert.equal(dups[0].title, "1 música parece repetida");
        assert.equal(dups[0].action, "settings:sincronizacao");
    }
    a.close();
    b.close();
});

test("a backup restored here for everyone wins on the others; for this one only, it leaves", async (t) => {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    const a = computer("A", { srv });
    const b = computer("B", { srv });
    a.store.importRows("Song", [{ id: "hino", title: "Hino", created_date: "2026-10-01T00:00:00.000Z", updated_date: "2026-10-01T00:00:00.000Z" }]);
    await a.call("googleSignIn");
    await b.call("googleSignIn");
    await settle([a, b], 2);
    b.store.call("Song", "update", ["hino", { title: "Hino (editado depois do backup)" }]);
    b.store.call("Song", "create", [{ title: "Nova depois do backup" }]);
    await settle([b, a], 1);
    // A restores the backup (the swap: the old row, before B's edit and new song).
    a.store.importRows("Song", [{ id: "hino", title: "Hino", created_date: "2026-10-01T00:00:00.000Z", updated_date: "2026-10-01T00:00:00.000Z" }]);
    a.control.afterImport("all");
    await settle([a, b], 2);
    assert.equal(b.store.call("Song", "get", ["hino"]).title, "Hino", "the backup wins everywhere");
    assert.ok(titles(b).includes("Nova depois do backup"), "what was made after stays");

    a.control.afterImport("leave");
    const st = await a.call("status");
    assert.equal(st.store, null);
    assert.equal(st.paired, false);
    a.close();
    b.close();
});

test("sealWith: the system's protection, or a marked plain fallback", () => {
    const none = sealWith({ isEncryptionAvailable: () => false });
    const sealed = none.seal("chave");
    assert.match(sealed, /^plain:/);
    assert.equal(none.open(sealed), "chave");
    assert.equal(none.open("garbage"), null);
    const safe = fakeProtection();
    assert.match(safe.seal("x"), /^safe:/);
    assert.equal(safe.open(safe.seal("x")), "x");
});

test("Drive: a computer whose kept key will not open joins again by itself; a join Drive fails leaves the sign-in standing", async (t) => {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    // Drive's retries without their waits.
    const driveOptions = { api: srv.api, upload: srv.upload, freshMs: 0, sleep: async () => {} };
    const a = computer("IGREJA-SOM", { google: fakeGoogle(srv), driveOptions });
    a.store.call("Song", "create", [{ title: "Da conta" }]);
    await a.call("googleSignIn");
    await a.call("now");

    // Settings brought from another Windows account: the key does not open.
    const gb = fakeGoogle(srv);
    await gb.signIn();
    const settings = memorySettings();
    settings.data.sync = JSON.parse(JSON.stringify(a.settings.data.sync));
    const b = computer("NOTEBOOK", { google: gb, driveOptions, settings, protect: fakeProtection("outra") });
    const first = await b.call("now");
    assert.equal(first.engine.state, "unpaired", "the key comes from the account again");
    for (let i = 0; i < 50 && !b.settings.data.sync.drive.key.startsWith("safe:b3V0cm"); i++) await new Promise((r) => setTimeout(r, 10));
    assert.equal(b.control.status().paired, true);
    await settle([b]);
    assert.deepEqual(titles(b), ["Da conta"]);

    // Drive failing during the sign-in: the sign-in stands, the join waits for the passes.
    const c = computer("SALA", { google: fakeGoogle(srv), driveOptions });
    srv.fault(() => true, 500, { times: 40 });
    const entered = await c.call("googleSignIn");
    assert.equal(entered.google.signedIn, true);
    assert.equal(entered.joined, null);
    assert.ok(entered.joinError);
    assert.equal(entered.paired, false);
    a.close();
    b.close();
    c.close();
});

test("Google sign-in: Cancelar and Abrir de novo reach the browser's sign-in", async (t) => {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    const a = computer("IGREJA-SOM", { srv });
    await a.call("googleReopen");
    await a.call("googleCancel");
    assert.equal(a.google.reopened, 1);
    assert.equal(a.google.canceled, 1);
    const none = computer("SEM-GOOGLE");
    await assert.rejects(none.call("googleCancel"), /não está disponível/);
    await assert.rejects(none.call("googleSignIn"), /não está disponível/);
    a.close();
    none.close();
});

test("a computer that synced by the folder: it stops, the bell says so once, entering forgets the folder and its code", async (t) => {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    // A new computer: no bell (it goes straight to the account).
    const fresh = computer("NOVO", { srv });
    fresh.control.start({ intervalMs: 60000 });
    fresh.control.stop();
    assert.equal(fresh.bell.filter((n) => n.key === "sync-google").length, 0);
    fresh.close();

    const a = computer("IGREJA-SOM", { srv, settings: folderSettings() });
    a.store.call("Song", "create", [{ title: "Da pasta" }]);
    const st = await a.call("now");
    assert.equal(st.store, null);
    assert.equal(st.folder, "G:\\Meu Drive\\KERYX", "the page's banner names it");
    assert.equal(st.paired, false);
    assert.equal(st.engine.state, "off", "the folder is never read");
    assert.equal(a.store.isRecording(), false);

    // The bell once, never again after a restart.
    for (let i = 0; i < 3; i++) {
        a.control.start({ intervalMs: 60000 });
        a.control.stop();
    }
    const notes = a.bell.filter((n) => n.key === "sync-google");
    assert.equal(notes.length, 1);
    assert.equal(notes[0].title, "A sincronização agora é pela conta Google");
    assert.match(notes[0].body, /não sincroniza/);
    assert.equal(notes[0].action, "settings:sincronizacao");

    // Entering: on Drive with what it has; the folder and its code forgotten.
    const entered = await a.call("googleSignIn");
    assert.equal(entered.store, "drive");
    assert.equal(entered.folder, null);
    assert.ok(entered.joined.sent > 0, "everything here goes");
    assert.equal(a.settings.data.sync.folder, undefined);
    assert.equal(a.settings.data.sync.pairing, undefined);
    assert.equal(a.settings.data.sync.googleNoticed, true);
    assert.ok(a.bell.some((n) => n.dismissed === "sync-google"));
    a.store.call("Song", "create", [{ title: "Esperando" }]);
    assert.ok((await a.call("status")).waiting > 0, "the outbox count");
    await a.call("now");
    const sent = await a.call("status");
    assert.equal(sent.waiting, 0, "sent");
    assert.equal(sent.arriving, null);
    const q = (await a.call("googleStatus")).quota;
    assert.ok(q.mine > 0 && q.mine <= q.used + 1e12, "bytes in the hidden folder");

    const b = computer("NOTEBOOK", { srv });
    await b.call("googleSignIn");
    await settle([b]);
    assert.deepEqual(titles(b), ["Da pasta", "Esperando"]);
    a.close();
    b.close();
});

// A sign-in whose readmit Drive did not take: the passes try it again, and
// take off the Desconectar list only what was disconnected before that
// sign-in (the owner, 2026-10-27: "tirar da lista só o que foi desconectado
// antes da entrada").
async function readmitRace(t, { againAfter }) {
    const srv = await fakeDriveServer({ page: 50 });
    t.after(() => srv.close());
    let busy = false;
    srv.fault(() => busy, 500, { times: 1e6 });
    // Drive's retries without their waits; B's clock moves past the retry wait.
    const driveOptions = { api: srv.api, upload: srv.upload, freshMs: 0, sleep: async () => {} };
    const clock = { ahead: 0 };
    const a = computer("A", { srv });
    const b = computer("B", { google: fakeGoogle(srv), driveOptions, now: () => new Date(Date.now() + clock.ahead) });
    await a.call("googleSignIn");
    await b.call("googleSignIn");
    await settle([a, b], 1);
    await a.call("remove", { pc: b.store.pcId });
    assert.equal((await b.call("now")).engine.state, "removed");
    await new Promise((r) => setTimeout(r, 5));

    // B enters again while Drive does not answer: the sign-in stands, the
    // readmit waits.
    busy = true;
    const entered = await b.call("googleSignIn");
    assert.ok(entered.joinError, "Drive was busy");
    busy = false;
    await new Promise((r) => setTimeout(r, 5));
    if (againAfter) await a.call("remove", { pc: b.store.pcId });

    // Past the retry wait, B's passes try the readmit again.
    clock.ahead = 2 * 60 * 1000;
    await b.call("now");
    for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 10));
        const listed = driveFile(srv).removed.some((r) => r.pc === b.store.pcId.toLowerCase());
        if (againAfter ? i > 30 : !listed) break;
    }
    const st = await b.call("now");
    a.close();
    b.close();
    return { st, removed: driveFile(srv).removed, pc: b.store.pcId.toLowerCase() };
}

test("a readmit Drive failed, retried: a Desconectar made after the sign-in stays (G3 = A)", async (t) => {
    const { st, removed, pc } = await readmitRace(t, { againAfter: true });
    assert.deepEqual(removed.map((r) => r.pc), [pc], "the new Desconectar is still on the list");
    assert.equal(st.engine.state, "removed", "only a new sign-in brings it back");
});

test("a readmit Drive failed, retried: a Desconectar made before the sign-in is taken off", async (t) => {
    const { st, removed } = await readmitRace(t, { againAfter: false });
    assert.deepEqual(removed, []);
    assert.equal(st.engine.state, "ok");
});
