import test from "node:test";
import assert from "node:assert/strict";
import { topSongs, playsByCategory, servicesByMonth, ccliReport, ccliText, ccliCsv, periodStart } from "./reports.js";

const now = new Date("2026-10-08T12:00:00Z");
const history = [
    { song_id: "a", song_title: "Firme na rocha", song_artist: "X", played_at: "2026-10-05T19:10:00Z" },
    { song_id: "a", song_title: "Firme na rocha", song_artist: "X", played_at: "2026-09-28T19:10:00Z" },
    { song_id: "b", song_title: "Grandioso és tu", played_at: "2026-10-05T19:20:00Z" },
    { song_title: "Antiga", played_at: "2025-01-01T10:00:00Z" },
];
const songs = [
    { id: "a", title: "Firme na rocha", artist: "X", category: "hymn", ccli_number: "123" },
    { id: "b", title: "Grandioso és tu", category: "worship", ccli_number: " 456 " },
    { id: "c", title: "Nunca tocada", ccli_number: "789" },
    { id: "d", title: "Antiga", ccli_number: "" },
];

test("top songs and categories in a period", () => {
    const since = periodStart("30", now);
    const top = topSongs(history, since);
    assert.deepEqual(top.map((t) => [t.title, t.count]), [["Firme na rocha", 2], ["Grandioso és tu", 1]]);
    assert.equal(top[0].last, "2026-10-05T19:10:00Z");
    assert.equal(topSongs(history, periodStart("all")).length, 3, "everything counts the old row");
    assert.deepEqual(playsByCategory(history, songs, since), [{ label: "Hino", count: 2 }, { label: "Adoração", count: 1 }]);
});

test("cultos per month, the last six", () => {
    const m = servicesByMonth([{ date: "2026-10-04" }, { date: "2026-10-11" }, { date: "2026-08-02" }, { date: "2025-10-04" }], 6, new Date(2026, 9, 8));
    assert.deepEqual(m.map((x) => x.count), [0, 0, 0, 1, 0, 2]);
    assert.equal(m[0].label, "mai/26");
    assert.equal(m[5].label, "out");
});

test("CCLI report: numbered songs played in the period, copy and CSV", () => {
    const r = ccliReport(songs, history, periodStart("30", now));
    assert.deepEqual(r, [{ title: "Firme na rocha", artist: "X", ccli: "123", plays: 2 }, { title: "Grandioso és tu", artist: "", ccli: "456", plays: 1 }]);
    assert.equal(ccliText(r).split("\n")[1], "Firme na rocha\tX\t123\t2");
    assert.equal(ccliCsv([{ title: 'Eu "sou"; teu', artist: "", ccli: "1", plays: 1 }]).split("\n")[1], '"Eu ""sou""; teu";;1;1');
});
