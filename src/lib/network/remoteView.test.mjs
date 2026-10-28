import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyState, applyOp } from "../../../shared/live-state.mjs";
import {
    capsOf, isV1, canRun, kindOf, allowed, airHeader, bannerOf, slideInfo, slideRows, playerInfo, volumeStep,
    followInfo, timerInfo, setlistRows, sayOf,
    MEDIA_CHIPS, libraryArgs, emptyList, joinPage, mediaRow, sendMediaArgs,
    fieldRef, fieldBook, tapVerse, refLabel, bibleArgs, BIBLE_SECTIONS, bibleVersions,
    nowBarInfo, addToSetlistArgs, biblePlanArgs,
    onAirNow, presentRows, dockModes, endState, verseRows, chapterArgs, UNDO_MS,
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

test("the No ar bar: nothing on air hides it; slides give the line, the place, the next and the arrows", () => {
    assert.equal(nowBarInfo(null), null);
    assert.equal(nowBarInfo(emptyState(T)), null);
    const s = nowBarInfo(song());
    assert.deepEqual(s, { tone: "air", now: "Tu és digno / de toda honra", pos: "1/3", next: "Próximo: Santo, santo", arrows: true, reveal: false });
    // The last slide: the item's title under it.
    assert.equal(nowBarInfo(song({ index: 2 })).next, "Tu és digno");
    // A video: what the header says, no arrows.
    const v = nowBarInfo(applyOp(emptyState(T), "media.show", { kind: "video", url: "http://x/v.mp4", title: "Abertura", duration: 200 }, T));
    assert.equal(v.now, "Abertura");
    assert.equal(v.arrows, false);
    // Tela preta over a song: the bar says so, the arrows stay.
    const black = nowBarInfo(applyOp(song(), "screen.set", { mode: "black" }, T));
    assert.equal(black.now, "Tela preta");
    assert.equal(black.tone, "amber");
    assert.equal(black.arrows, true);
    // An activity not revealed: → reveals.
    const quiz = applyOp(emptyState(T), "content.show", { kind: "text", title: "Quiz", slides: [{ text: "Quem?", activity: { kind: "choice", options: ["A", "B"], answer: 0 } }], index: 0 }, T);
    assert.equal(nowBarInfo(quiz).reveal, true);
});

test("Apresentar: every slide whole, the one on air, the next and those already shown", () => {
    assert.deepEqual(presentRows(null), []);
    const rows = presentRows(song({ index: 1, slides: [{ text: "A\nB", label: "Estrofe" }, { text: "C" }, { text: "D" }, { image_url: "x.png" }] }).content);
    assert.deepEqual(rows.map((r) => r.state), ["past", "air", "next", ""]);
    assert.equal(rows[0].label, "Estrofe · 1");
    assert.equal(rows[0].text, "A\nB", "the whole slide, its lines kept");
    assert.equal(rows[3].text, "Imagem");
    assert.equal(onAirNow(emptyState(T)), false);
    assert.equal(onAirNow(song()), true);
    assert.equal(onAirNow(applyOp(emptyState(T), "screen.set", { mode: "black" }, T)), true, "Tela preta is something to end");
});

test("the dock: Letra with slides, Player with what plays, the operator's side kept while it means something", () => {
    assert.deepEqual(dockModes(emptyState(T)), { letra: false, player: false, mode: "letra" });
    assert.equal(dockModes(song()).mode, "letra");
    const video = applyOp(emptyState(T), "media.show", { kind: "video", url: "http://x/v.mp4", title: "Abertura", duration: 200 }, T);
    assert.deepEqual(dockModes(video), { letra: false, player: true, mode: "player" }, "only a video: the Player by itself");
    const both = applyOp(song(), "audio.show", { kind: "audio", url: "http://x/a.mp3", title: "Playback", duration: 200 }, T);
    assert.equal(dockModes(both).mode, "letra");
    assert.equal(dockModes(both, "player").mode, "player");
    assert.equal(dockModes(song(), "player").mode, "letra", "a side with nothing falls back");
    assert.equal(dockModes(applyOp(song(), "screen.set", { mode: "black" }, T)).letra, false, "under Tela preta the slides do not count");
});

test("Encerrar: off with nothing on air, armed on air, Desfazer for 8 s after the phone ended", () => {
    assert.deepEqual(endState({ live: emptyState(T) }), { state: "off", left: 0 });
    assert.deepEqual(endState({ live: song() }), { state: "arm", left: 0 });
    const ended = { at: T, undo: true };
    assert.deepEqual(endState({ live: emptyState(T), ended, now: T + 500, canUndo: true }), { state: "done", left: 8 });
    assert.equal(endState({ live: emptyState(T), ended, now: T + UNDO_MS, canUndo: true }).state, "off", "after 8 s it goes back");
    assert.equal(endState({ live: emptyState(T), ended, now: T + 500, canUndo: false }).state, "off", "a console without Desfazer");
    assert.equal(endState({ live: emptyState(T), ended: { at: T, undo: false }, now: T + 500, canUndo: true }).state, "off", "nothing to put back");
});

test("Bíblia verse by verse: the chapter asked once, the range's ends and inside marked", () => {
    assert.deepEqual(chapterArgs({ book: "Salmos", chapter: 23, verseStart: 1, verseEnd: 3 }, "ARC"), { book: "Salmos", chapter: 23, whole: true, version: "ARC" });
    assert.deepEqual(chapterArgs({ book: "Salmos", chapter: 23 }), { book: "Salmos", chapter: 23, whole: true });
    const verses = [1, 2, 3, 4].map((n) => ({ n, text: `v${n}` }));
    assert.deepEqual(verseRows(verses, { verseStart: 1, verseEnd: 3 }).map((r) => r.mark), ["sel", "in", "sel", ""]);
    assert.deepEqual(verseRows(verses, { verseStart: 4, verseEnd: 4 }).map((r) => r.mark), ["", "", "", "sel"]);
    assert.deepEqual(verseRows(verses, { verseStart: null }).map((r) => r.mark), ["", "", "", ""]);
    assert.deepEqual(verseRows(null, null), []);
});

test("+ Setlist: songs, files and materials go; avisos never; a passage only with its verses", () => {
    assert.deepEqual(addToSetlistArgs("songs", "s1"), { kind: "song", id: "s1" });
    for (const k of ["video", "image", "audio", "pdf"]) assert.deepEqual(addToSetlistArgs(k, "m"), { kind: "media", id: "m" });
    assert.deepEqual(addToSetlistArgs("materials", "e"), { kind: "material", id: "e" });
    assert.equal(addToSetlistArgs("pieces", "p"), null);
    assert.equal(addToSetlistArgs("songs", ""), null);
    assert.equal(biblePlanArgs(null), null);
    assert.equal(biblePlanArgs({ book: "João", chapter: 3, verseStart: null, verseEnd: null }), null);
    assert.deepEqual(biblePlanArgs({ book: "João", chapter: 3, verseStart: 16, verseEnd: 17 }, "NVI"), { book: "João", chapter: 3, verseStart: 16, verseEnd: 17, version: "NVI" });
});

// ---- The Equipe (Rodada Q PR4) ----
import {
    roleOf, tabsFor, teamStrip, cleanName, youtubeId, youtubeUrl, youtubeCover, pedidoArgs, chatArgs, PEDIDO_LIMITS,
    messageRows, PICK_CHIPS, pedidoGlyph, teamSetlistRows, lyricParts, hasChords, songSub, hasUnseen, newestAt, requestsEvery, REQUESTS_CHAT_MS, REQUESTS_EVERY_MS,
} from "./remoteView.js";
import PROTOCOL from "../../../shared/remoteProtocol.json" with { type: "json" };

test("the role picks the environment and its tabs", () => {
    assert.equal(roleOf(null), null);
    assert.equal(roleOf({ caps: [] }), "control");
    assert.equal(roleOf({ role: "team", caps: [] }), "team");
    const team = tabsFor({ role: "team", caps: PROTOCOL.teamCaps });
    assert.deepEqual(team.map(([k]) => k), ["pedidos", "songs", "bible", "setlist"]);
    const control = tabsFor({ role: "control", caps: PROTOCOL.caps.filter((c) => c !== "requests") });
    assert.deepEqual(control.map(([k]) => k), ["library", "present", "bible", "setlist", "more"], "the Biblioteca first (owner 2026-10-28, M1)");
    // A team never gets a projection tab, whatever caps say.
    assert.ok(!tabsFor({ role: "team", caps: PROTOCOL.caps }).some(([k]) => ["present", "library", "more"].includes(k)));
    // A console without requests: no Pedidos tab.
    assert.ok(!tabsFor({ role: "team", caps: ["library", "bible"] }).some(([k]) => k === "pedidos"));
});

test("every action an Equipe tab may run is one the contract lets the team run", () => {
    for (const a of ["state", "library", "bibleFind", "songText", "requests", "chat.send", "request.send"]) assert.equal(PROTOCOL.actions[a].team, true, a);
});

test("the strip says what is on air and that the phone only reads", () => {
    assert.deepEqual(teamStrip(song()), { tone: "air", text: "No ar · Tu és digno", pos: "1/3 · só leitura" });
    assert.deepEqual(teamStrip(emptyState(T)), { tone: "grey", text: "Nada no ar", pos: "só leitura" });
    assert.equal(teamStrip(song(), { stale: true }).text, "Sem sinal do computador");
    assert.equal(teamStrip(null).tone, "grey");
});

test("YouTube links: only YouTube's, rebuilt from the id", () => {
    assert.equal(youtubeId("youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10"), "dQw4w9WgXcQ");
    assert.equal(youtubeId("https://m.youtube.com/shorts/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
    assert.equal(youtubeId("https://vimeo.com/123"), null);
    assert.equal(youtubeId("https://evil.com/?v=dQw4w9WgXcQ"), null);
    assert.equal(youtubeId("https://u:p@youtube.com/watch?v=dQw4w9WgXcQ"), null);
    assert.equal(youtubeUrl("youtu.be/dQw4w9WgXcQ"), "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    assert.equal(youtubeCover("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg");
});

test("the pedido form against the contract's limits", () => {
    assert.equal(pedidoArgs({ song: "Raridade" }).error, "from");
    assert.equal(pedidoArgs({ from: "Lucas" }).error, "song");
    assert.deepEqual(pedidoArgs({ from: " Lucas ", song: "Raridade", singer: "Ana", note: "Depois da oferta", songId: "s-1" }).args,
        { from: "Lucas", song: "Raridade", singer: "Ana", note: "Depois da oferta", songId: "s-1" });
    assert.equal(pedidoArgs({ from: "L", song: "x", songId: "bad id!" }).args.songId, undefined);
    assert.equal(pedidoArgs({ from: "L", song: "x", link: "https://vimeo.com/1" }).message, PROTOCOL.messages.notYouTube);
    assert.equal(pedidoArgs({ from: "L", song: "x", link: "youtu.be/dQw4w9WgXcQ" }).args.link, "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    const long = pedidoArgs({ from: "N".repeat(99), song: "S".repeat(200), singer: "C".repeat(99), note: "O".repeat(400) }).args;
    const spec = PROTOCOL.actions["request.send"].args;
    assert.equal(long.from.length, spec.from.max);
    assert.equal(long.song.length, spec.song.max);
    assert.equal(long.singer.length, spec.singer.max);
    assert.equal(long.note.length, spec.note.max);
    assert.equal(cleanName("  Ana   Souza "), "Ana Souza");
    assert.equal(PEDIDO_LIMITS.text, PROTOCOL.limits.requestText);
    // A video or an audio of the library (S15), never beside a song.
    assert.deepEqual(pedidoArgs({ from: "Júlia", song: "Raridade · lyric video", mediaId: "m-1" }).args, { from: "Júlia", song: "Raridade · lyric video", mediaId: "m-1" });
    assert.deepEqual(pedidoArgs({ from: "J", song: "x", songId: "s-1", mediaId: "m-1" }).args, { from: "J", song: "x", songId: "s-1" });
    assert.equal(pedidoArgs({ from: "J", song: "x", mediaId: "bad id!" }).args.mediaId, undefined);
});

// S15 = A: Escolher da biblioteca's three tabs ask only what the Equipe
// may read (the library's songs, the Mídia's videos and audios).
test("the pedido sheet's tabs: Letras · Vídeos · Áudios", () => {
    assert.deepEqual(PICK_CHIPS.map((c) => [c.key, c.label, c.icon]), [["songs", "Letras", "music"], ["video", "Vídeos", "film"], ["audio", "Áudios", "volume"]]);
    const team = PROTOCOL.actions.library;
    for (const c of PICK_CHIPS) {
        const args = libraryArgs(c.key, "x", 0);
        assert.ok(team.teamArgs.tab.includes(args.tab), c.key);
        if (args.tab === "media") assert.ok(team.teamArgs.kind.includes(args.kind), c.key);
    }
    assert.deepEqual([{ media: "video" }, { media: "youtube" }, { media: "audio" }, { songId: "s" }, {}].map(pedidoGlyph), ["film", "youtube", "volume", "music", "music"]);
});

test("the chat composer: a text, or a link with a text of its own", () => {
    assert.equal(chatArgs({ from: "L", text: "  " }).error, "text");
    assert.deepEqual(chatArgs({ from: "L", text: "Oi" }).args, { from: "L", text: "Oi" });
    assert.deepEqual(chatArgs({ from: "L", link: "youtu.be/dQw4w9WgXcQ" }).args, { from: "L", text: "Vídeo do YouTube", link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" });
    assert.equal(chatArgs({ from: "L", text: "x".repeat(400) }).args.text.length, PROTOCOL.actions["chat.send"].args.text.max);
});

test("messages: mine on the right, a pedido's status", () => {
    const rows = messageRows([
        { id: "1", at: "2026-10-23T21:52:00.000Z", kind: "chat", from: "Marcos", text: "Oi", status: "open" },
        { id: "2", at: "2026-10-23T21:55:00.000Z", kind: "pedido", from: "lucas", singer: "Ana", song: "Raridade", text: "", status: "open" },
        { id: "3", at: "", kind: "pedido", from: "Ana", song: "X", status: "done", link: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" },
    ], "Lucas");
    assert.equal(rows[0].mine, false);
    assert.equal(rows[1].mine, true);
    assert.equal(rows[1].status, "Enviado · aguardando o operador");
    assert.equal(rows[2].status, "✓ Atendido");
    assert.equal(rows[2].head, "Ana");
    assert.ok(rows[2].cover.startsWith("https://i.ytimg.com/"));
    assert.equal(messageRows([{ id: "x", from: "A" }], "")[0].mine, false);
    assert.equal(rows[1].by, "Você pediu");
    assert.equal(rows[0].by, "Pedido de Marcos");
    assert.equal(rows[1].icon, "music");
    assert.equal(messageRows([{ id: "v", kind: "pedido", from: "J", song: "Raridade", mediaId: "m", media: "video" }])[0].icon, "film");
});

test("the operator's rows say so (S12/S14), never mine even with my name", () => {
    const rows = messageRows([
        { id: "1", at: "2026-10-23T21:53:00.000Z", kind: "chat", side: "operator", from: "Operador", text: "Beleza", status: "open" },
        { id: "2", at: "2026-10-23T21:54:00.000Z", kind: "chat", side: "team", from: "Operador", text: "Sou eu", status: "open" },
        { id: "3", at: "2026-10-23T22:09:00.000Z", kind: "pedido", side: "operator", from: "Operador", singer: "Marcos", song: "Hino", status: "open" },
    ], "Operador");
    assert.deepEqual(rows.map((r) => [r.operator, r.mine]), [[true, false], [false, true], [true, false]]);
    assert.match(rows[0].head, /^Operador · \d\d:\d\d$/);
    assert.match(rows[1].head, /^Você · /);
    assert.equal(rows[2].by, "Anotado pelo operador");
    assert.equal(rows[2].status, "", "no \"aguardando\" on what the operator noted");
});

test("unseen: a row this phone did not send, newer than the last seen", () => {
    const rows = [
        { id: "1", at: "2026-10-23T21:52:00.000Z", from: "Lucas" },
        { id: "2", at: "2026-10-23T21:55:00.000Z", side: "operator", from: "Operador" },
    ];
    assert.equal(newestAt(rows), "2026-10-23T21:55:00.000Z");
    assert.equal(hasUnseen(rows, "", "Lucas"), true);
    assert.equal(hasUnseen(rows, "2026-10-23T21:53:00.000Z", "Lucas"), true, "the operator's answer");
    assert.equal(hasUnseen(rows, newestAt(rows), "Lucas"), false);
    assert.equal(hasUnseen([rows[0]], "", "lucas"), false, "my own is never new to me");
    assert.equal(hasUnseen([], "", "Lucas"), false);
});

test("the chat is asked every 5 s while it is open, the rest every 15 s", () => {
    assert.equal(requestsEvery("chat", true), REQUESTS_CHAT_MS);
    assert.equal(requestsEvery("chat", false), REQUESTS_EVERY_MS);
    assert.equal(requestsEvery("pedido", true), REQUESTS_EVERY_MS);
});

test("the Equipe's setlist: on air and the next one marked, songs open", () => {
    const rows = teamSetlistRows({ airItemId: "b", items: [
        { id: "a", title: "Aviso", type: "ANNOUNCEMENT" },
        { id: "b", title: "Tu és digno", type: "SONG", songId: "s1" },
        { id: "s", title: "Palavra", type: "SECTION", section: true },
        { id: "c", title: "João 3", type: "BIBLE" },
    ] });
    assert.deepEqual(rows.map((r) => r.tag ?? (r.section ? "sec" : null)), [null, "air", "sec", "next"]);
    assert.equal(rows[1].songId, "s1");
    assert.equal(rows[3].songId, null);
    assert.ok(teamSetlistRows({ items: [{ id: "a", type: "SONG" }] }).every((r) => !r.tag));
    assert.equal(teamSetlistRows({ items: [{ id: "a", type: "SONG", singer: " Ana " }] })[0].singer, "Ana", "who sings a pedido (S13)");
});

test("lyrics: chords cut out of the line, shown only with Cifra", () => {
    const s = { artist: "Pedras Vivas", key: "G", parts: [{ name: "Estrofe 1", lines: ["[G]Te amo, [D]Deus", ""] }, { name: "", lines: [] }] };
    assert.deepEqual(lyricParts(s), [{ name: "Estrofe 1", lines: [{ chords: "", text: "Te amo, Deus" }] }]);
    assert.equal(lyricParts(s, { chords: true })[0].lines[0].chords, "G  D");
    assert.equal(hasChords(s), true);
    assert.equal(hasChords({ parts: [{ lines: ["sem"] }] }), false);
    assert.equal(songSub(s), "Pedras Vivas · Tom G");
});
