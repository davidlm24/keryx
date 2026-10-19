import { test } from "node:test";
import assert from "node:assert/strict";
import { createRemoteRunner, REMOTE_HANDLERS } from "./remoteRunner.js";
import { PROTOCOL } from "./remote.js";
import { sendBlock, LOCKED_SAY } from "./sendBlock.js";

const M = PROTOCOL.messages;

// A console made of fakes: what it was asked to do is in `calls`, what it
// said in `said`.
function fakeConsole(over = {}) {
    const calls = [];
    const said = [];
    const verses = Array.from({ length: 30 }, (_, i) => ({ number: i + 1, text: `Versículo ${i + 1} ${"palavra ".repeat(20).trim()}` }));
    const items = [
        { id: "sec", type: "SECTION", title: "Louvor" },
        { id: "a", type: "SONG", title: "Hino", contentId: "s1" },
        { id: "t", type: "TEXT", title: "Avisos" },
    ];
    const d = {
        cur: { screen: "show", locked: false, content: { kind: "lyrics", title: "Hino", slides: [{ text: "a" }, { text: "b" }], index: 0 }, history: [] },
        live: () => d.cur,
        now: () => 1000,
        lockedSay: LOCKED_SAY,
        service: { id: "svc", title: "Culto", date: "2026-10-19" },
        items,
        rows: null,
        airItemId: "a",
        airNow: { id: "a" },
        prefs: { bible_verses_per_slide: "auto" },
        playerPick: null,
        songs: [{ id: "s1", title: "Hino", artist: "X" }],
        media: [{ id: "m1", type: "video", title: "Vinheta", file_url: "keryx-media://v.mp4" }, { id: "m2", type: "image", title: "Foto", missing: true }],
        pieces: [{ id: "p1", title: "Bem-vindos", type: "announcement" }],
        materials: [{ id: "x1", title: "Lição" }],
        themes: [],
        alertPresets: [{ id: "ap", message: "Carro com farol aceso" }],
        timerPresets: [],
        loaded: { songs: true, media: true, pieces: true },
        app: () => "0.2.20",
        bible: async () => ({ version: "ARA", installed: ["ARA"] }),
        reportedDuration: () => 120,
        callOp: async (op, args) => { calls.push(["callOp", op, args]); },
        liveOp: async (op, args) => { calls.push(["liveOp", op, args]); },
        clearText: async () => { calls.push(["clearText"]); },
        say: (message, action) => said.push([message, action]),
        end: async (opts) => { calls.push(["end", opts]); return true; },
        undo: () => { calls.push(["undo"]); return d.canUndo; },
        canUndo: true,
        // The console's send: the real checks (sendBlock), then on air.
        sendStage: async (stage, opts) => {
            calls.push(["sendStage", stage, opts]);
            const block = sendBlock(stage, { locked: d.cur.locked });
            if (block) { opts?.why?.(block); return false; }
            return true;
        },
        buildStage: async (item, index) => ({ id: item.id, title: item.title, index }),
        referenceVerses: async (ref, version) => { calls.push(["referenceVerses", ref, version]); return { version: version || "ARA", verses }; },
        // The real ones (stage.js) cannot load under node:test.
        stages: {
            song: (row) => ({ id: `song:${row.id}`, title: row.title }),
            media: (row, o) => ({ id: `media:${row.id}`, title: row.title, missing: Boolean(row.missing), toVideo: o.toVideo }),
            piece: (row) => ({ id: `piece:${row.id}`, title: row.title }),
            material: (row) => ({ id: `material:${row.id}`, title: row.title }),
            verses: (args) => { calls.push(["verses", args]); return args.nums.length ? { id: "bible", title: "João 3", nums: args.nums } : null; },
            tool: (mode, { minutes }) => ({ id: `tool:${mode}`, title: mode === "timer" ? `Timer ${minutes} min` : mode }),
        },
        ...over,
    };
    if (!("nextItem" in over)) d.nextItem = d.items[2];
    d.calls = calls;
    d.said = said;
    return d;
}
const run = (d, action, args, v = 2) => createRemoteRunner(d).run({ action, args, v });
const lock = (d) => { d.cur = { ...d.cur, locked: true }; return d; };
const playing = (d, extra = {}) => { d.cur = { ...d.cur, media: { kind: "video", url: "http://x/media/v.mp4", title: "Vinheta", playback: { paused: false, position: 30, at: 1000 }, shownAt: 5, ...extra } }; return d; };

test("there is a handler for every action of the contract, and nothing else", () => {
    assert.deepEqual(Object.keys(REMOTE_HANDLERS).sort(), Object.keys(PROTOCOL.actions).sort());
});

test("state: v2 for a v2 page, the title string for a v1 page", async () => {
    const d = fakeConsole({ cur: { screen: "show", content: null, history: [{ data: { ref: { serviceItemId: "t" } } }] } });
    const r = await run(d, "state");
    assert.equal(r.ok, true);
    assert.equal(r.data.v, 2);
    assert.equal(r.data.app, "0.2.20");
    assert.deepEqual(r.data.service, { id: "svc", title: "Culto", date: "2026-10-19" });
    assert.deepEqual(r.data.items.map((i) => i.id), ["sec", "a", "t"]);
    assert.equal(r.data.airItemId, "a");
    assert.equal(r.data.nextItemId, "t");
    assert.equal(r.data.backItemId, "t");
    assert.deepEqual(r.data.bible, { version: "ARA", installed: ["ARA"] });
    assert.deepEqual(r.data.timers.map((t) => t.minutes), [5, 10, 15, 30, 60]);
    assert.deepEqual(r.data.alerts, [{ id: "ap", message: "Carro com farol aceso" }]);
    const v1 = await run(d, "state", {}, 1);
    assert.equal(v1.data.service, "Culto");
    assert.equal(v1.data.serviceId, "svc");
    // Nothing of the Setlist on air: no item marked.
    assert.equal((await run(fakeConsole({ airNow: null }), "state")).data.airItemId, null);
});

test("library: a page of the console's own lists", async () => {
    const r = await run(fakeConsole(), "library", { tab: "media" });
    assert.deepEqual(r.data.rows.map((x) => [x.id, x.st]), [["m1", "ok"], ["m2", "missing"]]);
    assert.equal(r.data.ready, true);
});

test("next/prev need content on air", async () => {
    const d = fakeConsole({ cur: { screen: "show" } });
    assert.deepEqual(await run(d, "next"), { ok: false, message: M.noSlides, status: 409, code: "nothing" });
    assert.equal(d.calls.length, 0);
    const on = fakeConsole();
    assert.equal((await run(on, "prev")).ok, true);
    assert.deepEqual(on.calls, [["callOp", "content.prev", undefined]]);
});

test("goto: a slide that exists, quietly", async () => {
    const d = fakeConsole();
    const runner = createRemoteRunner(d);
    assert.equal((await runner.answer({ action: "goto", args: { index: 1 }, v: 2 })).ok, true);
    assert.deepEqual(d.calls, [["callOp", "content.goTo", { index: 1 }]]);
    assert.equal(d.said.length, 0, "a slide picked on the phone is no toast");
    assert.equal((await run(d, "goto", { index: 5 })).code, "not_found");
    assert.equal((await run(fakeConsole({ cur: { screen: "show" } }), "goto", { index: 0 })).code, "nothing");
});

test("black/logo: toggle for v1 pages, `on` idempotent, and they work locked", async () => {
    const d = lock(fakeConsole());
    assert.deepEqual(await run(d, "black"), { ok: true, message: "Celular: Tela preta ligado." });
    d.cur = { ...d.cur, screen: "black" };
    assert.equal((await run(d, "black", { on: true })).message, "Celular: Tela preta ligado.", "on again: nothing flips back");
    assert.equal((await run(d, "logo", { on: false })).message, "Celular: Logo desligado.");
    d.cur = { ...d.cur, screen: "logo" };
    assert.equal((await run(d, "logo")).message, "Celular: Logo desligado.");
    assert.deepEqual(d.calls, [["liveOp", "screen.set", { mode: "black" }], ["liveOp", "screen.set", { mode: "show" }]]);
});

test("clear and off work while locked; off needs that layer on air", async () => {
    const d = lock(fakeConsole());
    assert.equal((await run(d, "clear")).ok, true);
    assert.equal((await run(d, "off", { layer: "content" })).message, "Celular: tirou texto.");
    assert.deepEqual(await run(d, "off", { layer: "video" }), { ok: false, message: "Nada no ar nessa camada.", status: 409, code: "nothing" });
    assert.deepEqual(d.calls, [["clearText"], ["callOp", "content.clear", {}]]);
});

test("end runs the console's Esc, saying it came from the phone, and says whether it can be undone", async () => {
    const d = lock(fakeConsole());
    const r = await createRemoteRunner(d).answer({ action: "end", v: 2 });
    assert.deepEqual(r, { ok: true, message: "Projeção encerrada.", data: { undo: true } });
    assert.deepEqual(d.calls, [["end", { by: "Celular" }]]);
    assert.equal(d.said.length, 0, "the console's end() says it, with its Desfazer");
});

test("undo: the console's Desfazer, refused locked, 409 with nothing to undo", async () => {
    const d = fakeConsole();
    assert.equal((await run(d, "undo")).ok, true);
    assert.deepEqual(d.calls, [["undo"]]);
    assert.deepEqual(await run(fakeConsole({ canUndo: false }), "undo"), { ok: false, message: M.nothingToUndo, status: 409, code: "nothing" });
    assert.equal((await run(lock(fakeConsole()), "undo")).status, 423);
});

test("a locked action that puts something on air gets 423 before any 404 or 409", async () => {
    // Nothing on air, no next item, an id that is not there: unlocked these are 404s and 409s.
    const d = lock(fakeConsole({ nextItem: null }));
    d.cur = { ...d.cur, content: null };
    const cases = [["next"], ["prev"], ["goto", { index: 9 }], ["play"], ["sendNext"], ["sendItem", { itemId: "nope" }], ["sendMedia", { kind: "song", id: "nope" }],
        ["bibleSend", { ref: "xyz 3" }], ["player", { do: "toggle" }], ["follow", { do: "start" }], ["layer", { which: "text", on: true }],
        ["alert", { presetId: "nope" }], ["tool", { mode: "clock" }], ["timerAdjust", { deltaMs: 60000 }], ["undo"]];
    for (const [action, args] of cases) {
        assert.deepEqual(await run(d, action, args), { ok: false, message: LOCKED_SAY, status: 423, code: "locked" }, action);
    }
    assert.equal(d.calls.length, 0);
});

test("sendItem: not in the setlist 404, a section 409, an item goes on air and the Prévia stays", async () => {
    const d = fakeConsole();
    assert.deepEqual(await run(d, "sendItem", { itemId: "nope" }), { ok: false, message: M.notInSetlist, status: 404, code: "not_found" });
    assert.deepEqual(await run(d, "sendItem", { itemId: "sec" }), { ok: false, message: "Uma seção não vai ao ar.", status: 409, code: "nothing" });
    assert.deepEqual(await run(d, "sendItem", { itemId: "t" }), { ok: true, message: 'Celular: enviou "Avisos".', data: { title: "Avisos" } });
    const [, stage, opts] = d.calls[0];
    assert.deepEqual(stage, { id: "t", title: "Avisos", index: 2 });
    assert.equal(opts.keepPrev, true, "a remote send leaves the operator's Prévia alone");
    // A row gone from the database is not found.
    const gone = fakeConsole({ buildStage: async () => { throw new Error("x"); } });
    assert.equal((await run(gone, "sendItem", { itemId: "t" })).code, "not_found");
});

test("sendNext: the next item, or 409 with none", async () => {
    const d = fakeConsole();
    assert.equal((await run(d, "sendNext")).message, 'Celular: enviou "Avisos".');
    assert.deepEqual(d.calls[0][1], { id: "t", title: "Avisos", index: 2 });
    assert.equal((await run(fakeConsole({ nextItem: null }), "sendNext")).code, "nothing");
});

test("sendMedia: by kind and id; a missing file and a file still syncing say so", async () => {
    const d = fakeConsole();
    assert.equal((await run(d, "sendMedia", { kind: "media", id: "m1", toVideo: true })).ok, true);
    assert.equal(d.calls[0][1].toVideo, true);
    assert.equal((await run(d, "sendMedia", { kind: "song", id: "s1" })).data.title, "Hino");
    assert.equal((await run(d, "sendMedia", { kind: "piece", id: "p1" })).ok, true);
    assert.equal((await run(d, "sendMedia", { kind: "material", id: "x1" })).ok, true);
    assert.deepEqual(await run(d, "sendMedia", { kind: "media", id: "zz" }), { ok: false, message: M.notFound, status: 404, code: "not_found" });
    assert.deepEqual(await run(d, "sendMedia", { kind: "media", id: "m2" }), { ok: false, message: M.fileMissing, status: 409, code: "missing" });
    const syncing = fakeConsole({ sendStage: async (s, o) => { o.why({ status: 409, code: "syncing", message: "x" }); return false; } });
    assert.deepEqual(await run(syncing, "sendMedia", { kind: "media", id: "m1" }), { ok: false, message: M.syncing, status: 409, code: "syncing" });
    const blocked = fakeConsole({ sendStage: async (s, o) => { o.why({ status: 409, code: "blocked", message: "As páginas deste PDF ainda estão sendo preparadas." }); return false; } });
    assert.equal((await run(blocked, "sendMedia", { kind: "media", id: "m1" })).code, "blocked");
});

test("sendBlock: the checks before every send, with codes", () => {
    assert.deepEqual(sendBlock({ id: "x" }, { locked: true }), { status: 423, code: "locked", message: LOCKED_SAY });
    assert.equal(sendBlock(null).code, "nothing");
    assert.equal(sendBlock({ missing: true }).code, "missing");
    assert.equal(sendBlock({ blocked: "Salve como PDF" }).message, "Salve como PDF");
    assert.equal(sendBlock({ args: { url: "keryx-media://a.mp4" } }, { pending: new Set(["keryx-media://a.mp4"]) }).code, "syncing");
    assert.equal(sendBlock({ args: { poster: "keryx-media://a.jpg" } }, { pending: new Set(["keryx-media://a.jpg"]) }), null, "a poster never holds a send");
    assert.equal(sendBlock({ id: "x" }), null);
});

test("bibleFind: a preview of at most 280 characters, typed any way or picked", async () => {
    const d = fakeConsole();
    const r = await run(d, "bibleFind", { ref: "jo 3 16-20" });
    assert.equal(r.ok, true);
    assert.deepEqual([r.data.reference, r.data.version], ["João 3:16-20", "ARA"]);
    assert.ok(r.data.text.length <= PROTOCOL.limits.passageText);
    assert.ok(r.data.text.startsWith("16 Versículo 16") && r.data.text.endsWith("…"));
    // A version 1 page: the edition rides in the reference.
    assert.equal((await run(d, "bibleFind", { ref: "jo 3:16" }, 1)).data.reference, "João 3:16 · ARA");
    assert.ok((await run(d, "bibleFind", { book: "João", chapter: 3 })).data.text.startsWith("1 Versículo 1"), "a chapter alone: from verse 1");
    assert.equal((await run(d, "bibleFind", { ref: "jo 3 16", version: "NVI" })).data.version, "NVI");
    assert.equal((await run(d, "bibleFind", { ref: "xyz" })).status, 400);
    assert.equal((await run(d, "bibleFind", { ref: "jo 3:16", version: "XYZ" })).code, "not_found");
    // A verse the edition does not have (the fake ARA stops at 30).
    assert.deepEqual(await run(d, "bibleFind", { ref: "jo 3 33" }), { ok: false, message: "João 3:33 não existe na ARA.", status: 404, code: "not_found" });
});

test("bibleSend: verses go on air; a chapter alone goes from verse 1", async () => {
    const d = fakeConsole();
    assert.deepEqual(await run(d, "bibleSend", { ref: "jo 3 16" }), { ok: true, message: "Celular: enviou João 3:16.", data: { title: "João 3" } });
    assert.deepEqual(d.calls.find((c) => c[0] === "verses")[1].nums, [16]);
    const ch = fakeConsole();
    assert.equal((await run(ch, "bibleSend", { book: "jo", chapter: 3 })).message, "Celular: enviou João 3.");
    assert.deepEqual(ch.calls.find((c) => c[0] === "verses")[1].nums, [1]);
    // A passage on air is handed over so the arrows keep walking it.
    const bible = { kind: "bible", title: "João 3" };
    const onAir = fakeConsole({ cur: { screen: "show", content: bible } });
    await run(onAir, "bibleSend", { ref: "jo 3 16" });
    assert.equal(onAir.calls.find((c) => c[0] === "verses")[1].onAir, bible);
});

test("player: the console's own buttons on the layer playing", async () => {
    const d = playing(fakeConsole());
    assert.equal((await run(d, "player", { do: "toggle" })).ok, true);
    assert.deepEqual(d.calls.at(-1), ["callOp", "transport", { layer: "media", action: "pause" }]);
    await run(d, "player", { do: "forward" });
    assert.deepEqual(d.calls.at(-1), ["callOp", "transport", { layer: "media", action: "seek", time: 40 }]);
    await run(d, "player", { do: "volume", volume: 40 });
    assert.deepEqual(d.calls.at(-1), ["callOp", "transport", { layer: "media", action: "volume", volume: 0.4 }]);
    await run(d, "player", { do: "seek", to: 500 });
    assert.deepEqual(d.calls.at(-1), ["callOp", "transport", { layer: "media", action: "seek", time: 120 }], "clamped to the length the output reported");
    assert.equal((await run(d, "player", { do: "next" })).code, "nothing", "no list: no next track");
    assert.equal((await run(d, "player", { do: "toggle", layer: "audio" })).code, "nothing", "that layer is not playing");
    assert.deepEqual(await run(fakeConsole(), "player", { do: "toggle" }), { ok: false, message: M.nothingPlaying, status: 409, code: "nothing" });
    // Volume and seek are no toast on the console.
    const quiet = playing(fakeConsole());
    await createRemoteRunner(quiet).answer({ action: "player", args: { do: "volume", volume: 50 }, v: 2 });
    assert.equal(quiet.said.length, 0);
});

test("player swap: the eye — off works locked, bringing the video back does not", async () => {
    const d = lock(playing(fakeConsole()));
    assert.equal((await run(d, "player", { do: "swap" })).ok, true);
    assert.deepEqual(d.calls.at(-1), ["callOp", "media.toAudio", {}]);
    const back = lock(fakeConsole());
    back.cur = { ...back.cur, audio: { kind: "video", url: "u", playback: { paused: false, position: 0, at: 0 }, shownAt: 1 } };
    assert.equal((await run(back, "player", { do: "swap" })).status, 423);
    back.cur = { ...back.cur, locked: false };
    await run(back, "player", { do: "swap" });
    assert.deepEqual(back.calls.at(-1), ["callOp", "audio.toMedia", {}]);
    const yt = playing(fakeConsole(), { kind: "youtube" });
    assert.equal((await run(yt, "player", { do: "swap" })).code, "blocked");
});

test("play (v1) is player toggle; the live clock's Tocar is the follow's", async () => {
    const d = playing(fakeConsole());
    assert.deepEqual(await run(d, "play"), { ok: true, message: "Celular: tocar / pausar." });
    const clock = fakeConsole();
    clock.cur = { ...clock.cur, content: { ...clock.cur.content, follow: { source: "clock", clock: null } } };
    await run(clock, "play");
    assert.deepEqual(clock.calls.at(-1), ["callOp", "content.follow", { action: "start" }]);
    assert.equal((await run(fakeConsole(), "play")).code, "nothing");
});

test("follow: the letra automática of the song on air", async () => {
    const d = fakeConsole();
    assert.deepEqual(await run(d, "follow", { do: "pause" }), { ok: false, message: M.noFollow, status: 409, code: "nothing" });
    d.cur = { ...d.cur, content: { ...d.cur.content, follow: { source: "video" } } };
    assert.equal((await run(d, "follow", { do: "pause" })).message, "Celular: letra automática pausada.");
    assert.deepEqual(d.calls.at(-1), ["callOp", "content.follow", { action: "pause" }]);
});

test("layer: hiding works locked, showing does not; the corner logo is refused locked; video is reserved", async () => {
    const d = lock(fakeConsole());
    assert.equal((await run(d, "layer", { which: "text", on: false })).message, "Celular: Texto escondido.");
    assert.deepEqual(d.calls.at(-1), ["callOp", "layers.hide", { layer: "content" }]);
    assert.equal((await run(d, "layer", { which: "bg", on: true })).status, 423);
    assert.equal((await run(d, "layer", { which: "corner", on: false })).status, 423);
    const open = fakeConsole();
    await run(open, "layer", { which: "corner", on: true });
    assert.deepEqual(open.calls.at(-1), ["callOp", "logo.set", { visible: true }]);
    await run(open, "layer", { which: "bg", on: true });
    assert.deepEqual(open.calls.at(-1), ["callOp", "layers.show", { layer: "background" }]);
    assert.equal((await run(open, "layer", { which: "video", on: false })).code, "nothing");
});

test("alert: a message or a ready one; alertClear needs one on air and works locked", async () => {
    const d = fakeConsole();
    await run(d, "alert", { message: "Culto às 19h" });
    assert.deepEqual(d.calls.at(-1), ["callOp", "alert.show", { message: "Culto às 19h", type: "message" }]);
    await run(d, "alert", { presetId: "ap" });
    assert.deepEqual(d.calls.at(-1), ["callOp", "alert.show", { message: "Carro com farol aceso", type: "message" }]);
    assert.equal((await run(d, "alert", { presetId: "zz" })).code, "not_found");
    const l = lock(fakeConsole());
    assert.equal((await run(l, "alertClear")).code, "nothing");
    l.cur = { ...l.cur, alert: { message: "x" } };
    assert.equal((await run(l, "alertClear")).message, "Celular: tirou o aviso.");
});

test("tool and timerAdjust", async () => {
    const d = fakeConsole();
    assert.deepEqual(await run(d, "tool", { mode: "timer", minutes: 10 }), { ok: true, message: "Celular: enviou o timer de 10 min.", data: { title: "Timer 10 min" } });
    assert.equal((await run(d, "tool", { mode: "clock" })).message, "Celular: enviou o relógio.");
    assert.equal((await run(d, "timerAdjust", { deltaMs: 60000 })).code, "nothing");
    d.cur = { ...d.cur, tool: { mode: "timer", endsAt: 5000 } };
    assert.equal((await run(d, "timerAdjust", { deltaMs: -60000 })).message, "Celular: timer −1 min.");
    assert.deepEqual(d.calls.at(-1), ["callOp", "tool.adjust", { deltaMs: -60000 }]);
});

test("lock works locked (to unlock)", async () => {
    const d = lock(fakeConsole());
    assert.equal((await run(d, "lock", { locked: false })).message, "Celular: telas destravadas.");
    assert.deepEqual(d.calls, [["liveOp", "screens.lock", { locked: false }]]);
});

test("writes go one at a time; reads and the emergency lane never wait", async () => {
    const order = [];
    let release;
    const gate = new Promise((r) => { release = r; });
    const d = fakeConsole({
        callOp: async (op) => { order.push(`start ${op}`); if (op === "content.next") await gate; order.push(`end ${op}`); },
        liveOp: async (op) => { order.push(op); },
    });
    const runner = createRemoteRunner(d);
    const first = runner.run({ action: "next", v: 2 });
    const second = runner.run({ action: "prev", v: 2 });
    const black = runner.run({ action: "black", v: 2 });
    const state = runner.run({ action: "state", v: 2 });
    await black;
    await state;
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual([...order].sort(), ["screen.set", "start content.next"], "Tela preta went while next was still running; prev waits");
    release();
    await first;
    await second;
    assert.deepEqual(order.slice(-3), ["end content.next", "start content.prev", "end content.prev"]);
    // A failed write does not hold the queue.
    const failing = fakeConsole({ callOp: async () => { throw Object.assign(new Error("Falhou."), { status: 409 }); } });
    const r2 = createRemoteRunner(failing);
    assert.deepEqual(await r2.answer({ action: "next", v: 2 }), { ok: false, message: "Falhou.", status: 409, code: "nothing" });
    assert.equal((await r2.run({ action: "state", v: 2 })).ok, true);
});

test("answer: the console says what the phone did; a throw keeps its status", async () => {
    const d = fakeConsole();
    const runner = createRemoteRunner(() => d);
    await runner.answer({ action: "clear", v: 2 });
    assert.deepEqual(d.said, [["Celular: limpou o texto.", undefined]]);
    // Reads and refusals say nothing on the console.
    await runner.answer({ action: "state", v: 2 });
    await runner.answer({ action: "library", args: { tab: "songs" }, v: 2 });
    await runner.answer({ action: "sendItem", args: { itemId: "sec" }, v: 2 });
    assert.equal(d.said.length, 1);
    const locked = fakeConsole({ clearText: async () => { throw Object.assign(new Error("Travado."), { status: 423 }); } });
    assert.deepEqual(await createRemoteRunner(locked).answer({ action: "clear" }), { ok: false, message: "Travado.", status: 423, code: "locked" });
    const plain = fakeConsole({ clearText: async () => { throw new Error(""); } });
    assert.deepEqual(await createRemoteRunner(plain).answer({ action: "clear" }), { ok: false, message: "Não foi possível.", status: 500 });
});

test("unknown actions are a 400, even locked; inherited names are not actions", async () => {
    const d = lock(fakeConsole());
    assert.deepEqual(await run(d, "dance"), { ok: false, message: "Comando desconhecido.", status: 400 });
    assert.equal((await run(d, "toString")).status, 400);
    assert.equal((await createRemoteRunner(d).run({})).status, 400);
});

test("the deps are read per command: the latest state wins", async () => {
    let d = fakeConsole({ cur: { screen: "show" } });
    const runner = createRemoteRunner(() => d);
    assert.equal((await runner.run({ action: "next" })).status, 409);
    d = fakeConsole();
    assert.equal((await runner.run({ action: "next" })).ok, true);
});
