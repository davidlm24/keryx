import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, applyOp } from "../../../shared/live-state.mjs";
import {
    capsOf, isV1, canRun, kindOf, allowed, airHeader, bannerOf, slideInfo, slideRows, playerInfo, volumeStep,
    followInfo, timerInfo, setlistRows, sayOf,
    MEDIA_CHIPS, libraryArgs, emptyList, joinPage, mediaRow, sendMediaArgs,
    fieldRef, fieldBook, tapVerse, refLabel, bibleArgs, BIBLE_SECTIONS, bibleVersions,
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

test("Mídia: each chip's library page, a search, pages of 30", () => {
    assert.deepEqual(libraryArgs("songs"), { tab: "songs", skip: 0, limit: 30 });
    assert.deepEqual(libraryArgs("video", "  Páscoa ", 30), { tab: "media", skip: 30, limit: 30, kind: "video", q: "Páscoa" });
    assert.deepEqual(libraryArgs("pdf").kind, "pdf");
    assert.equal(libraryArgs("pieces").tab, "pieces");
    assert.equal(libraryArgs("materials").tab, "materials");
    assert.equal(libraryArgs("songs", "x".repeat(80)).q.length, 40);
    assert.deepEqual(MEDIA_CHIPS.map((c) => c.label), ["Músicas", "Vídeos", "Imagens", "Áudios", "Slides", "Avisos", "Escola"]);
});

test("Mídia: pages join in order; an answer for an older search or out of order is dropped", () => {
    const page = (skip, n, total) => ({ skip, total, ready: true, rows: Array.from({ length: n }, (_, i) => ({ id: `r${skip + i}`, title: `R${skip + i}` })) });
    let l = emptyList("songs|");
    l = joinPage(l, "songs|", page(0, 30, 45));
    assert.equal(l.rows.length, 30);
    assert.equal(l.done, false);
    assert.equal(joinPage(l, "songs|", page(0, 30, 45)), l, "the same page twice");
    assert.equal(joinPage(l, "songs|graça", page(30, 15, 45)), l, "another search");
    l = joinPage(l, "songs|", page(30, 15, 45));
    assert.equal(l.rows.length, 45);
    assert.equal(l.done, true);
    assert.equal(joinPage(emptyList("k"), "k", { skip: 0, total: 0, ready: false, rows: [] }).ready, false);
});

test("Mídia: a row's state blocks the pick; a video asks where it plays", () => {
    assert.deepEqual(mediaRow({ id: "v", title: "Abertura", sub: "Vídeo", dur: 200, st: "ok", thumb: "/media/p.jpg" }), { id: "v", title: "Abertura", sub: "Vídeo · 3:20", thumb: "/media/p.jpg", st: null, stText: "" });
    const missing = mediaRow({ id: "m", title: "", st: "missing", thumb: "http://evil/x.jpg" });
    assert.equal(missing.st, "missing");
    assert.equal(missing.stText, "Arquivo não encontrado");
    assert.equal(missing.thumb, null);
    assert.equal(missing.title, "Sem título");
    assert.deepEqual(sendMediaArgs("songs", "s1"), { kind: "song", id: "s1" });
    assert.deepEqual(sendMediaArgs("video", "v1", true), { kind: "media", id: "v1", toVideo: true });
    assert.deepEqual(sendMediaArgs("video", "v1", false), { kind: "media", id: "v1" });
    assert.deepEqual(sendMediaArgs("image", "i1", true), { kind: "media", id: "i1" });
    assert.deepEqual(sendMediaArgs("pieces", "p"), { kind: "piece", id: "p" });
    assert.deepEqual(sendMediaArgs("materials", "e"), { kind: "material", id: "e" });
});

test("Bíblia: the field reads 'jo 3 16' as the console's quick jump does", () => {
    assert.deepEqual(fieldRef("jo 3 16"), { book: "João", chapter: 3, verseStart: 16, verseEnd: 16 });
    assert.deepEqual(fieldRef("Jo 3:16-18"), { book: "João", chapter: 3, verseStart: 16, verseEnd: 18 });
    assert.deepEqual(fieldRef("jo 3"), { book: "João", chapter: 3, verseStart: null, verseEnd: null });
    assert.deepEqual(fieldRef("1co 13 4-7"), { book: "1 Coríntios", chapter: 13, verseStart: 4, verseEnd: 7 });
    assert.equal(fieldRef("jo"), null);
    assert.equal(fieldRef("xyz 3"), null);
    assert.equal(fieldRef("jo 99"), null);
    assert.equal(fieldBook("joã"), "João");
    assert.equal(fieldBook("zz"), null);
});

test("Bíblia: tap, tap makes a range; the args are the contract's structured group", () => {
    const ch = { book: "João", chapter: 3, verseStart: null, verseEnd: null };
    const one = tapVerse(ch, 16);
    assert.deepEqual([one.verseStart, one.verseEnd], [16, 16]);
    const range = tapVerse(one, 18);
    assert.deepEqual([range.verseStart, range.verseEnd], [16, 18]);
    const back = tapVerse(tapVerse(ch, 18), 16);
    assert.deepEqual([back.verseStart, back.verseEnd], [16, 18]);
    const again = tapVerse(range, 5);
    assert.deepEqual([again.verseStart, again.verseEnd], [5, 5]);
    const off = tapVerse(one, 16);
    assert.equal(off.verseStart, null);
    assert.equal(refLabel(range), "João 3:16-18");
    assert.equal(refLabel(ch), "João 3");
    assert.equal(refLabel({ book: "João", chapter: null }), "João");
    assert.deepEqual(bibleArgs(range, "NVI"), { book: "João", chapter: 3, verseStart: 16, verseEnd: 18, version: "NVI" });
    assert.deepEqual(bibleArgs(ch), { book: "João", chapter: 3 });
    assert.equal(BIBLE_SECTIONS[0][1].length + BIBLE_SECTIONS[1][1].length, 66);
});

test("Bíblia: the console's edition first, then the installed ones, then those online", () => {
    const v = bibleVersions({ version: "ARA", installed: ["NVI"] });
    assert.equal(v[0].id, "ARA");
    assert.ok(v.find((x) => x.id === "NVI").installed);
    assert.ok(!v.some((x) => x.id === "AA"), "AA is neither installed nor online");
    // NVI has no online source (bolls.life does not carry it): offered only installed.
    assert.equal(bibleVersions(null)[0].id, "ACF");
    assert.ok(!bibleVersions(null).some((x) => x.id === "NVI"));
});

test("a presentation being prepared says how far, in the console's words, when it sends them", () => {
    const rows = setlistRows({ items: [
        { id: "p1", title: "Culto.pdf", type: "PDF", st: "blocked", progress: "Preparando páginas 3/12" },
        { id: "p2", title: "Velho.pdf", type: "PDF", st: "blocked" },
        { id: "p3", title: "Sumido.pdf", type: "PDF", st: "missing", progress: "Preparando páginas 1/2" },
    ] });
    assert.deepEqual(rows.map((r) => r.stText), ["Preparando páginas 3/12", "Preparando páginas", "Arquivo não encontrado"], "a console that says nothing, or another state, keeps the old words");
    assert.equal(mediaRow({ id: "m", title: "Lição", st: "blocked", progress: "Não deu para preparar as páginas: o arquivo está corrompido ou incompleto." }).stText, "Não deu para preparar as páginas: o arquivo está corrompido ou incompleto.");
    assert.equal(mediaRow({ id: "m", title: "Lição", st: "ok", progress: "x" }).stText, "");
});
