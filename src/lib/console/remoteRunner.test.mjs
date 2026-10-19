import { test } from "node:test";
import assert from "node:assert/strict";
import { createRemoteRunner, REMOTE_HANDLERS } from "./remoteRunner.js";

// A console made of fakes: what it was asked to do is in `calls`.
function fakeConsole(over = {}) {
    const calls = [];
    const say = [];
    const verses = Array.from({ length: 30 }, (_, i) => ({ number: i + 1, text: `Versículo ${i + 1} ${"palavra ".repeat(20).trim()}` }));
    const deps = {
        live: () => deps.cur,
        cur: { screen: "show", content: { kind: "song", title: "Hino", slides: [{ text: "a" }, { text: "b" }], index: 0 } },
        locked: false,
        lockedSay: "Telas travadas.",
        service: { id: "svc", title: "Culto" },
        items: [
            { id: "sec", type: "SECTION", title: "Louvor" },
            { id: "a", type: "SONG", title: "Hino" },
            { id: "t", type: "TEXT", title: "Avisos" },
        ],
        airItemId: "a",
        airNow: { id: "a" },
        prefs: { bible_verses_per_slide: "auto" },
        playerPick: null,
        callOp: async (op, args) => { calls.push(["callOp", op, args]); },
        liveOp: async (op, args) => { calls.push(["liveOp", op, args]); },
        clearText: async () => { calls.push(["clearText"]); },
        say: (message, action) => say.push([message, action]),
        end: async (opts) => { calls.push(["end", opts]); },
        sendStage: async (stage) => { calls.push(["sendStage", stage]); return true; },
        buildStage: async (item, index) => ({ id: item.id, index }),
        referenceVerses: async () => ({ version: "ARA", verses }),
        // The real one (stage.js) cannot load under node:test; this keeps its
        // rule that a reference with no verse numbers builds nothing.
        stageFromVerses: (args) => { calls.push(["stageFromVerses", args]); return args.nums.length ? { id: "bible", nums: args.nums } : null; },
        ...over,
    };
    // The console's next item is one of its Setlist rows (sendNext finds it by identity).
    if (!("nextItem" in over)) deps.nextItem = deps.items[2];
    deps.calls = calls;
    deps.said = say;
    return deps;
}

test("every action the phone sends today has a handler", () => {
    assert.deepEqual(Object.keys(REMOTE_HANDLERS).sort(), ["bibleFind", "bibleSend", "black", "clear", "end", "logo", "next", "play", "prev", "sendItem", "sendNext", "state"].sort());
    const onAir = Object.keys(REMOTE_HANDLERS).filter((a) => REMOTE_HANDLERS[a].onAir).sort();
    assert.deepEqual(onAir, ["bibleSend", "next", "play", "prev", "sendItem", "sendNext"]);
});

test("state: the service, its items and serviceId", async () => {
    const d = fakeConsole();
    const r = await createRemoteRunner(d).run({ action: "state" });
    assert.equal(r.ok, true);
    assert.equal(r.data.serviceId, "svc");
    assert.deepEqual(r.data.items.map((i) => i.id), ["sec", "a", "t"]);
    assert.equal(r.data.airItemId, "a");
    assert.equal(r.data.nextItemId, "t");
    // Nothing of the Setlist on air: no item marked.
    const off = await createRemoteRunner(fakeConsole({ airNow: null })).run({ action: "state" });
    assert.equal(off.data.airItemId, null);
});

test("next/prev need content on air", async () => {
    const d = fakeConsole({ cur: { screen: "show" } });
    const run = createRemoteRunner(d).run;
    assert.deepEqual(await run({ action: "next" }), { ok: false, message: "Nada com slides no ar.", status: 409 });
    assert.equal(d.calls.length, 0);
    const on = fakeConsole();
    assert.equal((await createRemoteRunner(on).run({ action: "prev" })).ok, true);
    assert.deepEqual(on.calls, [["callOp", "content.prev", undefined]]);
});

test("black/logo/clear work while locked; black toggles", async () => {
    const d = fakeConsole({ locked: true });
    const run = createRemoteRunner(d).run;
    const black = await run({ action: "black" });
    assert.deepEqual(black, { ok: true, message: "Celular: Tela preta ligado." });
    d.cur = { ...d.cur, screen: "logo" };
    assert.equal((await run({ action: "logo" })).message, "Celular: Logo desligado.");
    assert.equal((await run({ action: "clear" })).ok, true);
    assert.deepEqual(d.calls, [["liveOp", "screen.set", { mode: "black" }], ["liveOp", "screen.set", { mode: "show" }], ["clearText"]]);
});

test("a locked action that puts something on air gets 423 before any 409", async () => {
    // Nothing on air and no next item: unlocked these are 409s.
    const d = fakeConsole({ locked: true, cur: { screen: "show" }, nextItem: null });
    const run = createRemoteRunner(d).run;
    for (const action of ["next", "prev", "play", "sendNext"]) {
        assert.deepEqual(await run({ action }), { ok: false, message: "Telas travadas.", status: 423 }, action);
    }
    assert.equal((await run({ action: "sendItem", args: { itemId: "sec" } })).status, 423);
    assert.equal((await run({ action: "bibleSend", args: { ref: "jo 3" } })).status, 423);
    assert.equal(d.calls.length, 0);
});

test("sendItem: a section gets 409, an unknown id 404, an item goes on air", async () => {
    const d = fakeConsole();
    const run = createRemoteRunner(d).run;
    assert.deepEqual(await run({ action: "sendItem", args: { itemId: "sec" } }), { ok: false, message: "Uma seção não vai ao ar.", status: 409 });
    assert.deepEqual(await run({ action: "sendItem", args: { itemId: "nope" } }), { ok: false, message: "Esse item não está na setlist.", status: 404 });
    const sent = await run({ action: "sendItem", args: { itemId: "t" } });
    assert.deepEqual(sent, { ok: true, message: 'Celular: enviou "Avisos".' });
    assert.deepEqual(d.calls, [["sendStage", { id: "t", index: 2 }]]);
    // When the send did not go on air, the phone hears so.
    const no = fakeConsole({ sendStage: async () => false });
    assert.deepEqual(await createRemoteRunner(no).run({ action: "sendItem", args: { itemId: "t" } }), { ok: false, message: "Não foi para o ar.", status: 409 });
});

test("sendNext: the next item, or 409 with none", async () => {
    const d = fakeConsole();
    assert.equal((await createRemoteRunner(d).run({ action: "sendNext" })).message, 'Celular: enviou "Avisos".');
    assert.deepEqual(d.calls, [["sendStage", { id: "t", index: 2 }]]);
    assert.equal((await createRemoteRunner(fakeConsole({ nextItem: null })).run({ action: "sendNext" })).status, 409);
});

test("play: nothing playing is a 409", async () => {
    const d = fakeConsole();
    assert.deepEqual(await createRemoteRunner(d).run({ action: "play" }), { ok: false, message: "Nada tocando.", status: 409 });
});

test("end runs the console's Esc, saying it came from the phone", async () => {
    const d = fakeConsole();
    const r = await createRemoteRunner(d).answer({ action: "end" });
    assert.deepEqual(r, { ok: true, message: "Projeção encerrada." });
    // The console's end() clears, stops the music and offers Desfazer itself.
    assert.deepEqual(d.calls, [["end", { by: "Celular" }]]);
    assert.equal(d.said.length, 0, "the answer's own toast is not said again");
});

test("answer: the console says what the phone did; a throw is a 500", async () => {
    const d = fakeConsole();
    const runner = createRemoteRunner(() => d);
    await runner.answer({ action: "clear" });
    assert.deepEqual(d.said, [["Celular: limpou o texto.", undefined]]);
    // Refusals and reads say nothing on the console.
    await runner.answer({ action: "state" });
    await runner.answer({ action: "sendItem", args: { itemId: "sec" } });
    assert.equal(d.said.length, 1);
    const boom = fakeConsole({ clearText: async () => { throw Object.assign(new Error("Falhou."), { status: 503 }); } });
    assert.deepEqual(await createRemoteRunner(boom).answer({ action: "clear" }), { ok: false, message: "Falhou.", status: 503 });
    const plain = fakeConsole({ clearText: async () => { throw new Error(""); } });
    assert.deepEqual(await createRemoteRunner(plain).answer({ action: "clear" }), { ok: false, message: "Não foi possível.", status: 500 });
});

test("unknown actions are a 400, even locked; inherited names are not actions", async () => {
    const run = createRemoteRunner(fakeConsole({ locked: true })).run;
    assert.deepEqual(await run({ action: "dance" }), { ok: false, message: "Comando desconhecido.", status: 400 });
    assert.equal((await run({ action: "toString" })).status, 400);
    assert.equal((await run({})).status, 400);
});

test("the deps are read per command: the latest state wins", async () => {
    let d = fakeConsole({ cur: { screen: "show" } });
    const run = createRemoteRunner(() => d).run;
    assert.equal((await run({ action: "next" })).status, 409);
    d = fakeConsole();
    assert.equal((await run({ action: "next" })).ok, true);
});

test("bibleFind: a preview of at most 280 characters; a bad reference is 400, a missing verse 404", async () => {
    const run = createRemoteRunner(fakeConsole()).run;
    const r = await run({ action: "bibleFind", args: { ref: "jo 3:16-20" } });
    assert.equal(r.ok, true);
    assert.equal(r.data.reference, "João 3:16-20 · ARA");
    assert.ok(r.data.text.length <= 280);
    assert.ok(r.data.text.startsWith("16 Versículo 16"));
    assert.ok(r.data.text.endsWith("…"));
    // A chapter alone previews its first verse.
    const ch = await run({ action: "bibleFind", args: { ref: "jo 3" } });
    assert.ok(ch.data.text.startsWith("1 Versículo 1"));
    assert.equal((await run({ action: "bibleFind", args: { ref: "xyz" } })).status, 400);
    // A verse the edition does not have (the fake ARA stops at 30).
    assert.equal((await run({ action: "bibleFind", args: { ref: "jo 3:33" } })).status, 404);
    // Today the hint's own spelling does not parse (PR2b): "jo 3 16" is a 400.
    assert.deepEqual(await run({ action: "bibleFind", args: { ref: "jo 3 16" } }), { ok: false, message: 'Não entendi "jo 3 16". Escreva como jo 3 16.', status: 400 });
});

test("bibleSend: verses go on air; a chapter alone is refused today", async () => {
    const d = fakeConsole();
    const run = createRemoteRunner(d).run;
    const ok = await run({ action: "bibleSend", args: { ref: "jo 3:16" } });
    assert.deepEqual(ok, { ok: true, message: "Celular: enviou João 3:16." });
    assert.deepEqual(d.calls.at(-1), ["sendStage", { id: "bible", nums: [16] }]);
    // PR2b changes this: today a chapter-only reference builds no stage.
    const ch = await run({ action: "bibleSend", args: { ref: "jo 3" } });
    assert.deepEqual(ch, { ok: false, message: "João 3 não existe na ARA.", status: 404 });
    const asked = d.calls.filter((c) => c[0] === "stageFromVerses").at(-1)[1];
    assert.deepEqual(asked.nums, []);
    assert.equal(asked.book, "João");
    assert.equal(asked.chapter, 3);
    // A passage on air is handed over so the arrows keep walking it.
    const bible = { kind: "bible", title: "João 3" };
    const onAir = fakeConsole({ cur: { screen: "show", content: bible } });
    await createRemoteRunner(onAir).run({ action: "bibleSend", args: { ref: "jo 3:16" } });
    assert.equal(onAir.calls[0][1].onAir, bible);
});
