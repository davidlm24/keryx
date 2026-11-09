import test from "node:test";
import assert from "node:assert/strict";
import { score, ranked, markParts, paletteGroups, sectionOrder, nextScope, stepIndex, recentEntries, agoWords, nextEntries, commandRows, SCOPE_LIMIT, ALL_LIMIT, SONGS_LIMIT } from "./paletteSearch.js";

test("matching ignores case and accents", () => {
    assert.ok(score("graca", "Canção de exemplo · Graça") > 0);
    assert.ok(score("GRAÇA", "a graça") > 0);
    assert.ok(score("coracao", "Meu coração") > 0);
    assert.equal(score("amor", "Graça"), 0);
});

test("every word must be found, in the title or the other fields", () => {
    assert.ok(score("hino coral", "Hino de exemplo", ["Coral de exemplo"]) > 0);
    assert.equal(score("hino banda", "Hino de exemplo", ["Coral de exemplo"]), 0);
});

test("ranking: exact, then the start, then a word's start, then inside, then other fields", () => {
    const titles = ["Outra canção", "Mais graça", "Graça", "Graça maior", "Desgraçado não", "Hino"];
    const rows = titles.map((t) => ({ t, artist: t === "Hino" ? "Graça e paz" : "" }));
    assert.deepEqual(ranked(rows, "graça", (r) => [r.t, r.artist]).map((r) => r.t), ["Graça", "Graça maior", "Mais graça", "Desgraçado não", "Hino"]);
});

test("equal scores keep the list's order; an empty query keeps everything", () => {
    assert.deepEqual(ranked(["b x", "a x"], "x", (r) => [r]), ["b x", "a x"]);
    assert.deepEqual(ranked(["b", "a"], "", (r) => [r]), ["b", "a"]);
});

test("markParts marks the words found, on the original text", () => {
    assert.deepEqual(markParts("Canção · Graça", "graca"), [{ text: "Canção · ", hit: false }, { text: "Graça", hit: true }]);
});

test("Tudo cuts each group and says how many were left; a kind shows up to 30", () => {
    const many = (n) => Array.from({ length: n }, (_, i) => ({ title: `r${i}` }));
    const sections = [{ id: "songs", rows: many(9) }, { id: "media", rows: many(6) }, { id: "pieces", rows: [] }, { id: "bible", rows: many(3), total: 12 }];
    const all = paletteGroups(sections, "all");
    assert.deepEqual(all.groups.map((g) => [g.id, g.list.length, g.more]), [["songs", SONGS_LIMIT, 4], ["media", ALL_LIMIT, 2], ["bible", 3, 9]]);
    assert.deepEqual(all.counts, { songs: 9, media: 6, pieces: 0, bible: 3 });
    assert.equal(all.flat.length, SONGS_LIMIT + ALL_LIMIT + 3);
    const media = paletteGroups([{ id: "media", rows: many(40) }, { id: "songs", rows: many(2) }], "media");
    assert.deepEqual(media.groups.map((g) => [g.id, g.list.length, g.more]), [["media", SCOPE_LIMIT, 10]]);
    assert.equal(media.groups[0].name, "Mídia");
});

test("a reference puts the Bíblia first; the commands are always last", () => {
    assert.equal(sectionOrder({ bibleFirst: true })[0], "bible");
    assert.equal(sectionOrder()[0], "setlist");
    assert.equal(sectionOrder().at(-1), "commands");
    assert.equal(sectionOrder({ bibleFirst: true }).at(-1), "commands");
});

test("Tab goes to the next kind with results, round; Shift+Tab back", () => {
    const counts = { songs: 2, bible: 0, media: 1, pieces: 0, school: 0, setlist: 0, commands: 3 };
    assert.equal(nextScope("all", 1, counts, true), "songs");
    assert.equal(nextScope("songs", 1, counts, true), "media");
    assert.equal(nextScope("commands", 1, counts, true), "all");
    assert.equal(nextScope("all", -1, counts, true), "commands");
    assert.equal(nextScope("all", 1, {}, false), "songs");
    assert.equal(nextScope("songs", 1, {}, false), "bible");
});

test("↑/↓ go round", () => {
    assert.equal(stepIndex(0, -1, 5), 4);
    assert.equal(stepIndex(4, 1, 5), 0);
    assert.equal(stepIndex(2, 1, 0), 0);
});

test("before typing: the recent ones once each, newest first", () => {
    const h = [
        { at: 5, layer: "content", title: "A" },
        { at: 4, layer: "content", title: "B" },
        { at: 3, layer: "content", title: "A" },
        { at: 2, layer: "media", title: "A" },
        { at: 1, layer: "content" },
        { at: 0, layer: "communication", title: "C" },
    ];
    assert.deepEqual(recentEntries(h).map((x) => x.at), [5, 4, 2, 0]);
    assert.deepEqual(recentEntries(h, 2).map((x) => x.at), [5, 4]);
    assert.deepEqual(recentEntries(null), []);
});

test("agoWords", () => {
    const now = 10 * 3600000;
    assert.equal(agoWords(now - 20000, now), "agora");
    assert.equal(agoWords(now - 12 * 60000, now), "há 12 min");
    assert.equal(agoWords(now - 2 * 3600000, now), "há 2 h");
});

test("the next items of the Setlist come after the one on air", () => {
    const items = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
    assert.deepEqual(nextEntries(items, "b").map((x) => [x.it.id, x.i]), [["c", 2], ["d", 3], ["e", 4]]);
    assert.deepEqual(nextEntries(items, null).map((x) => x.it.id), ["a", "b", "c"]);
    assert.deepEqual(nextEntries(items, "e"), []);
});

test("commands: the screen actions, every runnable menu item (subs under their parent), then Configurações", () => {
    const run = () => {};
    const menus = [
        { label: "Culto", items: [{ head: "No console" }, { label: "Setlist", onSelect: run }, { label: "Domingo", service: true, onSelect: run }, { sep: true }, { label: "Exportar", disabled: true, onSelect: run }] },
        { label: "Música", items: [{ label: "Letra automática", sub: [{ label: "Segue o vídeo", disabled: true }, { label: "Pausar", onSelect: run }] }] },
    ];
    const rows = commandRows(menus, { screen: [{ label: "Tela preta", icon: "black", kbd: "B", onSelect: run }, "sep"], sections: [{ id: "telas", name: "Telas e saídas", icon: "monitor" }], onSection: run });
    assert.deepEqual(rows.map((r) => [r.label, r.meta, r.kbd]), [
        ["Tela preta", "Telas", "B"],
        ["Setlist", "Culto", ""],
        ["Domingo", "Culto · ativar em todos os computadores", ""],
        ["Pausar", "Música › Letra automática", ""],
        ["Telas e saídas…", "Configurações", ""],
    ]);
    assert.ok(rows.every((r) => typeof r.run === "function"));
    assert.equal(commandRows(menus).length, 3, "no sections without onSection");
});
