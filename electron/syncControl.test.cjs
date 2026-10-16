// node --test electron/syncControl.test.cjs   (npm test)
// Configurações › Sincronização's main-process side, on temp stores and one
// temp folder, with the folder picker, the system's protection and the bell
// faked.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createStore, PROFILE_ID } = require("./db/store.cjs");
const { createSyncControl, sealWith } = require("./syncControl.cjs");
const schema = require("./db/schema.json");

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

function computer(folder, name, opts = {}) {
    const dir = tmp();
    const mediaDir = path.join(dir, "media");
    fs.mkdirSync(mediaDir);
    const store = createStore({ file: path.join(dir, "keryx.db"), schema, log: () => {} });
    const settings = opts.settings || memorySettings();
    const bell = [];
    const control = createSyncControl({
        store,
        mediaDir,
        settings,
        protect: opts.protect || fakeProtection(),
        chooseFolder: async () => folder,
        describe: () => ({ name, version: "0.2.20" }),
        notify: (n) => bell.push(n),
        dismiss: (key) => bell.push({ dismissed: key }),
        log: () => {},
    });
    const call = (op, args) => control.ops[op](null, args);
    return { store, settings, control, call, bell, close: () => store.close() };
}

const titles = (pc) => pc.store.call("Song", "list", []).map((s) => s.title).sort();
const settle = async (pcs, n = 3) => { for (let i = 0; i < n; i++) for (const pc of pcs) await pc.call("now"); };

test("two computers: choose the folder, make the code on one, type it on the other, both end with everything", async () => {
    const folder = tmp();
    const a = computer(folder, "IGREJA-SOM");
    const b = computer(folder, "NOTEBOOK-PASTOR");
    a.store.call("Song", "create", [{ title: "Só no som" }]);
    a.store.call("User", "update", [PROFILE_ID, { church_name: "Igreja Gerar" }]);
    b.store.call("Song", "create", [{ title: "Só no notebook" }]);

    assert.equal((await a.call("status")).folder, null);
    assert.equal(a.store.isRecording(), false, "not syncing: the outbox stays empty");
    assert.equal(a.store.outbox().length, 0);
    await assert.rejects(a.call("create"), /Escolha a pasta/);
    const chosen = await a.call("choose");
    assert.equal(chosen.folder, path.resolve(folder));
    assert.equal(chosen.inspect.code, "missing");
    const made = await a.call("create");
    assert.match(made.code, /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    assert.equal(made.paired, true);
    const stored = JSON.stringify(a.settings.data);
    assert.ok(!stored.includes(made.code), "the code is never kept in plain text");
    assert.equal((await a.call("showCode")).code, made.code);

    const seen = await b.call("choose");
    assert.equal(seen.inspect.code, "ok");
    await assert.rejects(b.call("join", { code: "K7QM-2H" }), /Faltam/);
    await assert.rejects(b.call("join", { code: made.code.replace(/^./, (c) => (c === "A" ? "B" : "A")) }), /errada|desta pasta/);
    const joined = await b.call("join", { code: made.code.toLowerCase() });
    assert.equal(joined.paired, true);

    await settle([a, b]);
    assert.deepEqual(titles(a), ["Só no notebook", "Só no som"], "the first join merges");
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
    assert.equal(other.version, "0.2.20");
    assert.equal(other.verified, true);
    assert.ok(st.since.applied >= 2);
    a.close();
    b.close();
});

test("pause, sync now, change the code, leave", async () => {
    const folder = tmp();
    const a = computer(folder, "A");
    const b = computer(folder, "B");
    await a.call("choose");
    const made = await a.call("create");
    await b.call("choose");
    await b.call("join", { code: made.code });
    await settle([a, b], 1);

    // Paused: the folder and the code stay; changes wait.
    const paused = await b.call("setPaused", { paused: true });
    assert.equal(paused.paused, true);
    assert.equal(paused.engine.state, "off");
    b.store.call("Song", "create", [{ title: "Durante a pausa" }]);
    await settle([a, b], 1);
    assert.ok(!titles(a).includes("Durante a pausa"));
    await b.call("setPaused", { paused: false });
    await settle([b, a], 1);
    assert.ok(titles(a).includes("Durante a pausa"));

    // A changes the code: B stops (the bell says so) until it types the new one.
    const next = await a.call("rotate");
    assert.notEqual(next.code, made.code);
    b.store.call("Song", "create", [{ title: "Com o código velho" }]);
    const stopped = await b.call("now");
    assert.equal(stopped.engine.state, "mismatch");
    assert.equal(b.bell.at(-1).key, "sync");
    assert.match(b.bell.at(-1).title, /código/);
    await b.call("join", { code: next.code });
    await settle([b, a], 2);
    assert.ok(titles(a).includes("Com o código velho"), "what waited goes with the new code");
    assert.deepEqual(b.bell.at(-1), { dismissed: "sync" }, "the bell clears once it is fine");

    // Tirar from A: B stops until it types the code again.
    await assert.rejects(a.call("remove", { pc: a.store.pcId }), /Sair da sincronização/);
    const afterRemove = await a.call("remove", { pc: b.store.pcId });
    assert.equal(afterRemove.engine.computers.find((c) => c.pc === b.store.pcId).removed.by, a.store.pcId.toLowerCase());
    b.store.call("Song", "create", [{ title: "Enquanto tirado" }]);
    assert.equal((await b.call("now")).engine.state, "removed");
    await settle([a], 1);
    assert.ok(!titles(a).includes("Enquanto tirado"));
    await b.call("join", { code: next.code });
    await settle([b, a], 2);
    assert.ok(titles(a).includes("Enquanto tirado"), "typing the code brought it back");
    // Deixar voltar, from A.
    await a.call("remove", { pc: b.store.pcId });
    assert.equal((await b.call("now")).engine.state, "removed");
    await a.call("restore", { pc: b.store.pcId });
    assert.equal((await b.call("now")).engine.state, "ok");

    // Leaving: this computer stops, nothing is deleted anywhere.
    const left = await b.call("leave");
    assert.equal(left.folder, null);
    assert.equal(left.paired, false);
    assert.equal(left.engine.state, "off");
    assert.equal(b.settings.data.sync, null);
    b.store.call("Song", "create", [{ title: "Depois de sair" }]);
    await settle([a], 1);
    assert.ok(!titles(a).includes("Depois de sair"));
    assert.ok(titles(a).includes("Com o código velho"), "what it sent stays");
    assert.equal(b.store.outbox().length, 0, "nothing is recorded while it does not sync");
    a.close();
    b.close();
});

test("after a join, the bell says once that some songs look repeated", async () => {
    const folder = tmp();
    const a = computer(folder, "A");
    const b = computer(folder, "B");
    a.store.call("Song", "create", [{ title: "Grande é o Senhor", lyrics: "Grande é o Senhor" }]);
    b.store.call("Song", "create", [{ title: "Grande e o senhor", lyrics: "grande é o Senhor!" }]);
    b.store.call("Song", "create", [{ title: "Santo", lyrics: "Santo" }]);
    await a.call("choose");
    const made = await a.call("create");
    await b.call("choose");
    await b.call("join", { code: made.code });
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

test("a key that does not open here (settings from another Windows account) asks for the code again", async () => {
    const folder = tmp();
    const a = computer(folder, "A");
    await a.call("choose");
    await a.call("create");
    const moved = computer(folder, "A-copiado", { settings: a.settings, protect: fakeProtection("outra") });
    const st = await moved.call("now");
    assert.equal(st.paired, true);
    assert.equal(st.keyLost, true);
    assert.equal(st.engine.state, "unpaired", "nothing is read or written without a key");
    await assert.rejects(moved.call("showCode"), /não está guardado/);
    a.close();
    moved.close();
});

test("sealWith: the system's protection, or a marked plain fallback", () => {
    const none = sealWith({ isEncryptionAvailable: () => false });
    const sealed = none.seal("K7QM-2HXP-9WRT");
    assert.match(sealed, /^plain:/);
    assert.equal(none.open(sealed), "K7QM-2HXP-9WRT");
    assert.equal(none.open("garbage"), null);
    const safe = fakeProtection();
    assert.match(safe.seal("x"), /^safe:/);
    assert.equal(safe.open(safe.seal("x")), "x");
});
