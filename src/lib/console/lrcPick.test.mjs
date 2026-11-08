import test from "node:test";
import assert from "node:assert/strict";
import { rankRecordings, autoPick, lengthChip, linesChip, fmtLength, anchorIndex, shiftMarks, anchorMarks, fmtDelta } from "./lrcPick.js";

// Bondade de Deus (Pedras Vivas), cut in two-line slides, and its LRC as
// LRCLIB has it (the times measured against the lyric video of the church's
// playback: 22/10, the medians under a second).
const slides = [
    { text: "Te amo, Deus, tua graça nunca falha\nTodos os dias eu estou em tuas mãos" },
    { text: "Desde quando me levanto até o meu deitar\nEu cantarei da bondade de Deus" },
    { text: "És fiel em todo tempo\nEm todo tempo tu és tão, tão bom" },
    { text: "Aleluia, aleluia" },
];
const lrc = "[00:13.35] Te amo, Deus, tua graça nunca falha\n[00:23.06] Todos os dias eu estou em tuas mãos\n[00:30.66] Desde quando me levanto até o meu deitar\n[00:38.26] Eu cantarei da bondade de Deus\n[00:48.26] És fiel em todo tempo\n[00:55.52] Em todo tempo tu és tão, tão bom";
const other = "[00:18.05] Oh, Deus provedor!\n[00:25.06] Jeová Jireh\n[00:30.62] O fogo não me queima";

test("rank: the playback's length and the lyrics that match come first", () => {
    const ranked = rankRecordings([
        { id: "live", title: "Bondade de Deus (Ao Vivo)", duration: 321, synced: lrc },
        { id: "plain", title: "Bondade de Deus", duration: 296, synced: "" },
        { id: "wrong", title: "Bondade de Deus", duration: 296, synced: other },
        { id: "studio", title: "Bondade De Deus", duration: 296, synced: lrc },
    ], { slides, duration: 295.9 });
    assert.deepEqual(ranked.map((r) => r.id), ["studio", "live", "wrong", "plain"]);
    const [studio, live, wrong, plain] = ranked;
    assert.deepEqual(studio.marks, [13.35, 30.66, 48.26, null]);
    assert.equal(studio.matched, 3);
    assert.equal(studio.length, "same");
    assert.equal(live.diff, 25);
    assert.equal(live.length, "other");
    assert.equal(wrong.few, true);
    assert.equal(plain.usable, false);
});

test("rank: no playback length, the lyrics decide", () => {
    const ranked = rankRecordings([{ id: "a", duration: 200, synced: other }, { id: "b", duration: 300, synced: lrc }], { slides });
    assert.equal(ranked[0].id, "b");
    assert.equal(ranked[0].length, "unknown");
    assert.equal(lengthChip(ranked[0]), null);
});

test("autoPick (S2 = B): only the same length with most slides found", () => {
    const four = [...slides.slice(0, 3), { text: "Com todo fôlego que tenho" }];
    const lrc4 = `${lrc}\n[01:03.29] Com todo fôlego que tenho`;
    assert.equal(autoPick(rankRecordings([{ id: "s", duration: 296, synced: lrc4 }], { slides: four, duration: 296 }))?.id, "s");
    // 3 of 4 found: under 80 %, the list asks.
    assert.equal(autoPick(rankRecordings([{ id: "s", duration: 296, synced: lrc }], { slides, duration: 296 })), null);
    // Another length: the list asks.
    assert.equal(autoPick(rankRecordings([{ id: "s", duration: 310, synced: lrc4 }], { slides: four, duration: 296 })), null);
    assert.equal(autoPick([]), null);
});

test("chips and lengths say it in pt-BR", () => {
    assert.deepEqual(lengthChip({ length: "same" }), ["Mesma duração do playback", "ok"]);
    assert.deepEqual(lengthChip({ length: "other", diff: 25 }), ["25 s mais longa", "warn"]);
    assert.deepEqual(lengthChip({ length: "other", diff: -9 }), ["9 s mais curta", "warn"]);
    assert.deepEqual(linesChip({ matched: 16, total: 17, few: false }), ["16 de 17 slides batem", "ok"]);
    assert.deepEqual(linesChip({ matched: 3, total: 14, few: true }), ["Só 3 de 14 slides batem", "warn"]);
    assert.equal(fmtLength(296), "4:56");
    assert.equal(fmtLength(null), "");
});

test("the tap on the first slide moves every mark (S3)", () => {
    const starts = [null, 13.35, 30.66, null, 48.26];
    assert.equal(anchorIndex(starts), 1);
    assert.equal(anchorIndex([null, null]), -1);
    const { starts: moved, delta } = anchorMarks(starts, 1, 18.47);
    assert.equal(delta, 5.1);
    assert.deepEqual(moved, [null, 18.5, 35.8, null, 53.4]);
    // Earlier: never under 0.
    const back = anchorMarks([2, 10], 0, 0.5);
    assert.equal(back.delta, -1.5);
    assert.deepEqual(back.starts, [0.5, 8.5]);
    assert.deepEqual(shiftMarks([1, null], -5), [0, null]);
    // No mark there: nothing moves.
    assert.deepEqual(anchorMarks([null, 4], 0, 9), { starts: [null, 4], delta: 0 });
    assert.equal(fmtDelta(5.1), "+5,1 s");
    assert.equal(fmtDelta(-0.8), "−0,8 s");
    assert.equal(fmtDelta(0), "0 s");
});
