import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, applyOp } from "../../../shared/live-state.mjs";
import {
    capsOf, isV1, canRun, kindOf, allowed, airHeader, bannerOf, slideInfo, slideRows, playerInfo, volumeStep,
    followInfo, timerInfo, setlistRows, sayOf,
} from "./remoteView.js";

const T = 1_000_000;
const song = (extra = {}) => applyOp(emptyState(T), "content.show", { kind: "lyrics", title: "Tu és digno", slides: [{ text: "Tu és digno\nde toda honra" }, { text: "Santo, santo" }, { text: "Aleluia" }], index: 0, ...extra }, T);

test("caps gate the sections; a version 1 console runs what the old page did", () => {
    assert.equal(capsOf(null).size, 0);
    const v1 = capsOf({ items: [] });
    assert.ok(v1.has("live") && v1.has("setlist") && !v1.has("library") && !v1.has("lock") && !v1.has("player"));
    assert.equal(isV1({ items: [] }), true);
    assert.equal(isV1({ caps: [] }), false);
    const v2 = capsOf({ caps: ["live", "lock"] });
    assert.ok(canRun(v2, "lock"));
    assert.ok(canRun(v2, "state"));
    assert.ok(!canRun(v2, "library"));
    assert.ok(!canRun(v2, "nope"));
});

test("locked screens and a dead link refuse what puts on air; taking off always works", () => {
    assert.equal(kindOf("next"), "S");
    assert.equal(kindOf("player", { do: "swap" }), "T");
    assert.equal(kindOf("layer", { which: "text", on: false }), "T");
    assert.equal(kindOf("layer", { which: "text", on: true }), "S");
    for (const flags of [{ locked: true }, { stale: true }]) {
        assert.equal(allowed("next", {}, flags), false);
        assert.equal(allowed("sendItem", { itemId: "a" }, flags), false);
        assert.equal(allowed("undo", {}, flags), false);
        for (const a of ["black", "logo", "clear", "end", "alertClear", "lock"]) assert.equal(allowed(a, {}, flags), true, a);
        assert.equal(allowed("off", { layer: "media" }, flags), true);
        assert.equal(allowed("state", {}, flags), true);
    }
    assert.equal(allowed("next", {}, {}), true);
});

test("the header: red on air, amber for Tela preta, Logo or locked, grey for nothing or no link", () => {
    const s = song();
    const h = airHeader(s, { now: T + 102_000 });
    assert.equal(h.tone, "air");
    assert.equal(h.title, "Tu és digno");
    assert.equal(h.pos, "1/3");
    assert.equal(h.since, "1:42");
    assert.deepEqual(h.chips.map((c) => [c.label, c.action, c.args]), [["Letra", "off", { layer: "content" }]]);
    const black = airHeader(applyOp(s, "screen.set", { mode: "black" }, T));
    assert.equal(black.tone, "amber");
    assert.equal(black.title, "Tela preta");
    assert.equal(black.pos, "");
    assert.deepEqual(black.chips[0], { key: "black", label: "Tela preta", action: "black", args: { on: false }, amber: true });
    assert.equal(airHeader(applyOp(s, "screen.set", { mode: "logo" }, T)).title, "Logo na tela");
    const locked = airHeader(applyOp(s, "screens.lock", { locked: true }, T));
    assert.equal(locked.tone, "amber");
    assert.equal(locked.locked, true);
    const stale = airHeader(s, { stale: true });
    assert.equal(stale.tone, "grey");
    assert.equal(stale.since, "");
    const none = airHeader(emptyState(T));
    assert.equal(none.tone, "grey");
    assert.equal(none.title, "Nada no ar");
    assert.deepEqual(none.chips, []);
    const alert = airHeader(applyOp(s, "alert.show", { message: "Carro", type: "message" }, T));
    assert.ok(alert.chips.some((c) => c.action === "alertClear"));
});

test("one banner at a time: no link, then an unknown outcome, then locked", () => {
    assert.equal(bannerOf({}), null);
    assert.match(bannerOf({ stale: true, unknown: true, locked: true }).text, /Sem sinal/);
    const u = bannerOf({ unknown: true, locked: true });
    assert.equal(u.text, "Não sei se foi — confira a tela");
    assert.equal(u.refresh, true);
    assert.match(bannerOf({ locked: true }).text, /Destrave em Mais/);
    assert.match(bannerOf({ locked: true, canUnlock: false }).text, /Saídas/);
});

test("the slide now and next, and Revelar on an activity not revealed", () => {
    const s = song();
    assert.deepEqual(slideInfo(s.content), { has: true, index: 0, count: 3, now: "Tu és digno\nde toda honra", next: "Santo, santo", reveal: false });
    assert.equal(slideInfo(null).has, false);
    const quiz = applyOp(emptyState(T), "content.show", { kind: "text", title: "Quiz", slides: [{ text: "Quem?", activity: { kind: "choice", options: ["A", "B"], answer: 0 } }], index: 0 }, T);
    assert.equal(slideInfo(quiz.content).reveal, true);
    const shown = applyOp(quiz, "content.reveal", { step: 1 }, T);
    assert.equal(slideInfo(shown.content).reveal, false);
    const rows = slideRows(s.content);
    assert.deepEqual(rows[0], { i: 0, title: "Tu és digno", sub: "de toda honra", air: true });
    assert.equal(rows[2].air, false);
});

test("the player card, volume in steps, Letra automática and the timer", () => {
    assert.equal(playerInfo(emptyState(T)), null);
    const v = applyOp(emptyState(T), "media.show", { kind: "video", url: "http://x/v.mp4", title: "Abertura", duration: 200 }, T);
    const p = playerInfo(v, T + 50_000);
    assert.equal(p.layer, "media");
    assert.equal(p.title, "Abertura");
    assert.equal(p.at, "0:50");
    assert.equal(p.length, "3:20");
    assert.equal(p.pct, 25);
    assert.equal(p.paused, false);
    assert.equal(p.volume, 100);
    assert.deepEqual(p.swap, { disabled: false, title: "Tirar o vídeo · o som continua", sound: false });
    assert.equal(volumeStep(60, 10), 70);
    assert.equal(volumeStep(95, 10), 100);
    assert.equal(volumeStep(4, -10), 0);
    assert.equal(followInfo(song().content), null);
    const t = applyOp(emptyState(T), "tool.show", { mode: "timer", durationMs: 300_000 }, T);
    assert.deepEqual(timerInfo(t, T + 60_000), { mode: "timer", text: "4:00", adjust: true });
    assert.equal(timerInfo(emptyState(T)), null);
});

test("the Setlist: sections as headers, time and length, no ar / próximo / último and the file states", () => {
    const state = {
        airItemId: "b", nextItemId: "c",
        items: [
            { id: "s", title: "Louvor", type: "SECTION", section: true },
            { id: "a", title: "Abertura", type: "VIDEO", at: 68100, dur: 200, st: "missing" },
            { id: "b", title: "Tu és digno", type: "SONG", at: 68400, dur: 252, st: "ok" },
            { id: "c", title: "João 3:16", type: "BIBLE", at: 68700, dur: 0 },
        ],
    };
    const rows = setlistRows(state);
    assert.deepEqual(rows[0], { id: "s", section: true, title: "Louvor" });
    assert.equal(rows[1].sub, "Vídeo · 18:55 · 3:20");
    assert.equal(rows[1].st, "missing");
    assert.equal(rows[1].stText, "Arquivo não encontrado");
    assert.equal(rows[2].tag, "air");
    assert.equal(rows[3].tag, "next");
    assert.equal(rows[3].sub, "Bíblia · 19:05");
    // After Esc: the item sent last is "último", never red.
    const after = setlistRows({ ...state, airItemId: null, nextItemId: null }, { session: { itemId: "b" } });
    assert.equal(after[2].tag, "last");
    assert.deepEqual(setlistRows(null), []);
});

test("what the phone says after a command", () => {
    assert.equal(sayOf({ ok: true, message: "Celular: Tela preta ligado." }), "Tela preta ligado.");
    assert.equal(sayOf({ ok: true, message: "" }), "Feito.");
    assert.equal(sayOf({ ok: false, message: "Telas travadas: nada vai ao ar. Destrave em Saídas." }), "Telas travadas: nada vai ao ar. Destrave em Saídas.");
});
