// node --test shared/syncDuplicates.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { duplicateSongs, songKey, pairKey, keepPairs, mergePlan } from "./syncDuplicates.mjs";

const song = (id, title, lyrics, updated = "2026-10-01T00:00:00.000Z") => ({ id, title, lyrics, updated_date: updated });

test("the same title and lyrics, whatever the case, accents, punctuation, chords and spacing", () => {
    assert.equal(songKey(song("a", "Grande é o Senhor", "Grande é o Senhor\ne mui digno")), songKey(song("b", "  GRANDE E O SENHOR! ", "[G]Grande é o [D]Senhor,\n\ne mui  digno.")));
    assert.notEqual(songKey(song("a", "Santo", "Santo, santo")), songKey(song("b", "Santo", "Santo, santo, santo")));
    assert.notEqual(songKey(song("a", "Santo", "x")), songKey(song("b", "Santo Espírito", "x")));
});

test("groups of two or more, newest first; titles alone, empty titles and kept pairs left out", () => {
    const list = [
        song("a1", "Grande é o Senhor", "letra", "2026-09-01T00:00:00.000Z"),
        song("a2", "Grande e o senhor", "Letra.", "2026-10-12T00:00:00.000Z"),
        song("b1", "Aleluia", "uma"),
        song("b2", "Aleluia", "outra"),
        song("c1", "", "sem título"),
        song("c2", "", "sem título"),
        song("d1", "Santo", "s"),
        song("d2", "Santo", "s"),
    ];
    const groups = duplicateSongs(list);
    assert.deepEqual(groups.map((g) => g.songs.map((s) => s.id)), [["a2", "a1"], ["d1", "d2"]]);
    assert.equal(groups[0].title, "Grande e o senhor");
    assert.deepEqual(duplicateSongs(list, [pairKey("d2", "d1")]).map((g) => g.key), [groups[0].key], "Manter as duas");

    // Three copies: kept only when every pair is.
    const three = [song("x", "Hino", "h"), song("y", "Hino", "h"), song("z", "Hino", "h")];
    assert.equal(keepPairs(three).length, 3);
    assert.equal(duplicateSongs(three, [pairKey("x", "y")]).length, 1);
    assert.equal(duplicateSongs(three, keepPairs(three)).length, 0);
});

test("Juntar em uma: the newest stays; setlists, templates and history point at it", () => {
    const [group] = duplicateSongs([song("old", "Hino", "h", "2026-01-01T00:00:00.000Z"), song("new", "Hino", "h", "2026-10-01T00:00:00.000Z")]);
    const plan = mergePlan(group, {
        serviceItems: [
            { id: "i1", type: "SONG", contentId: "old" },
            { id: "i2", type: "SONG", contentId: "new" },
            { id: "i3", type: "BIBLE", contentId: "old" },
        ],
        templates: [
            { id: "t1", items: [{ type: "SONG", contentId: "old", title: "Hino" }, { type: "TEXT", title: "Avisos" }] },
            { id: "t2", items: [{ type: "SONG", contentId: "new" }] },
            { id: "t3", items: null },
        ],
        history: [{ id: "h1", song_id: "old" }, { id: "h2", song_id: "outra" }],
    });
    assert.equal(plan.keep.id, "new");
    assert.deepEqual(plan.remove, ["old"]);
    assert.deepEqual(plan.items, [{ id: "i1", patch: { contentId: "new" } }]);
    assert.deepEqual(plan.templates, [{ id: "t1", patch: { items: [{ type: "SONG", contentId: "new", title: "Hino" }, { type: "TEXT", title: "Avisos" }] } }]);
    assert.deepEqual(plan.history, [{ id: "h1", patch: { song_id: "new" } }]);
});
