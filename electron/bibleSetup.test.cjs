const test = require("node:test");
const assert = require("node:assert/strict");
const { createBibleSetup, SETTINGS_KEY } = require("./bibleSetup.cjs");
const { SOURCES, BibleError } = require("./bible.cjs");

const KNOWN = Object.keys(SOURCES);

function memorySettings(initial = {}) {
    const store = { ...initial };
    return { get: (k, d) => (k in store ? store[k] : d), set: (k, v) => { store[k] = v; }, store };
}

// A fake source: `answers[version]` is "ok", an HTTP status to fail with, or
// a function; every install is logged.
function rig({ answers = {}, here = {}, initial = {} } = {}) {
    const settings = memorySettings(initial);
    const log = [];
    const notes = [];
    const pushed = [];
    const timers = [];
    const installed = { ...here };
    const setup = createBibleSetup({
        settings,
        known: KNOWN,
        installed: () => installed,
        install: async (v) => {
            log.push(v);
            const a = answers[v];
            if (typeof a === "function") return a(v);
            if (a === "ok" || a === undefined) { installed[v] = 31000; return { version: v, verses: 31000 }; }
            throw new BibleError(`erro ${a}`, a);
        },
        notify: (n) => notes.push(n),
        onChange: (s) => pushed.push(s),
        logger: { info() {}, warn() {} },
        now: () => new Date("2026-10-27T12:00:00Z"),
        setTimer: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; },
        clearTimer: () => {},
    });
    return { setup, settings, log, notes, pushed, timers, installed };
}

test("the answer is kept, the editions download one by one, the bell says what came", async () => {
    const r = rig();
    const st = await r.setup.choose(["NVI", "ARA", "XX"]);
    assert.deepEqual(st.pending, ["NVI", "ARA"]);
    assert.equal(r.settings.store[SETTINGS_KEY].asked, "2026-10-27T12:00:00.000Z");
    await r.setup.flush();
    assert.deepEqual(r.log, ["NVI", "ARA"]);
    const after = await r.setup.state();
    assert.deepEqual(after.done, ["NVI", "ARA"]);
    assert.deepEqual(after.pending, []);
    assert.equal(after.finished, true);
    assert.equal(after.installing, null);
    assert.equal(after.installed.NVI, 31000);
    assert.equal(r.notes.length, 1);
    assert.equal(r.notes[0].title, "Bíblias instaladas: NVI, ARA");
    assert.equal(r.notes[0].action, "settings:biblia");
    // The windows saw each edition start and the end.
    assert.ok(r.pushed.some((s) => s.installing === "NVI"));
    assert.ok(r.pushed.some((s) => s.installing === "ARA"));
    assert.equal(r.pushed.at(-1).installing, null);
    // A second pass has nothing to do and says nothing more.
    await r.setup.flush();
    assert.deepEqual(r.log, ["NVI", "ARA"]);
    assert.equal(r.notes.length, 1);
});

test("no internet ends the pass; the next pass goes on from where it stopped, with no bell in between", async () => {
    const r = rig({ answers: { ARA: 503 } });
    await r.setup.choose(["NVI", "ARA", "ARC"]);
    await r.setup.flush();
    assert.deepEqual(r.log, ["NVI", "ARA"]);
    const st = await r.setup.state();
    assert.deepEqual(st.done, ["NVI"]);
    assert.deepEqual(st.pending, ["ARA", "ARC"]);
    assert.equal(st.finished, false);
    assert.equal(r.notes.length, 0);
    // The internet is back.
    r.log.length = 0;
    delete r.setup.answers;
    const r2 = rig({ initial: r.settings.store, here: r.installed });
    await r2.setup.start();
    assert.deepEqual(r2.log, ["ARA", "ARC"]);
    assert.equal((await r2.setup.state()).finished, true);
    assert.equal(r2.notes[0].title, "Bíblias instaladas: NVI, ARA, ARC");
    // start() left the retry timer.
    assert.equal(r2.timers.length, 1);
    assert.equal(r2.timers[0].ms, 10 * 60 * 1000);
});

test("a file that is not a whole Bible is given up at once and the bell says why; installed by hand counts as done", async () => {
    const r = rig({ answers: { ARA: 400 }, here: { NTLH: 7000 } });
    await r.setup.choose(["NVI", "ARA", "NTLH"]);
    await r.setup.flush();
    assert.deepEqual(r.log, ["NVI", "ARA"]);
    const st = await r.setup.state();
    assert.deepEqual(st.done, ["NVI", "NTLH"]);
    assert.deepEqual(st.failed, { ARA: "erro 400" });
    assert.equal(st.finished, true);
    assert.equal(r.notes[0].kind, "warn");
    assert.equal(r.notes[0].title, "A ARA não baixou");
    assert.match(r.notes[0].body, /Instaladas: NVI, NTLH\. ARA: erro 400/);
    // Chosen again: tried again.
    await r.setup.choose(["ARA"]);
    assert.deepEqual((await r.setup.state()).pending, ["ARA"]);
});

test("Agora não records the answer and downloads nothing", async () => {
    const r = rig();
    const st = await r.setup.dismiss();
    assert.equal(st.asked, "2026-10-27T12:00:00.000Z");
    assert.deepEqual(st.wanted, []);
    await r.setup.flush();
    assert.deepEqual(r.log, []);
    assert.equal(r.notes.length, 0);
});

test("one pass at a time: a second flush while one runs waits for it", async () => {
    let release;
    const r = rig({ answers: { NVI: () => new Promise((res) => { release = () => res({ version: "NVI", verses: 1 }); }) } });
    await r.setup.choose(["NVI"]);
    const a = r.setup.flush();
    const b = r.setup.flush();
    assert.equal(a, b);
    // The pass reaches the download on its own time.
    while (!release) await new Promise((res) => setTimeout(res, 1));
    assert.equal((await r.setup.state()).installing, "NVI");
    release();
    await a;
    assert.deepEqual(r.log, ["NVI"]);
});
