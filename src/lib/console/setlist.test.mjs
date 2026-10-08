import test from "node:test";
import assert from "node:assert/strict";
import { plan, templateItems, itemsFor, playableItems, statusOf, parseMember, clockAt, span, startOf, total } from "./setlist.js";

const items = [
    { id: "s1", type: "SECTION", title: "Pré-culto" },
    { id: "a", type: "ANNOUNCEMENT", title: "Contagem", duration: 300, contentId: "p1" },
    { id: "s2", type: "SECTION", title: "Culto" },
    { id: "b", type: "SONG", title: "Firme na rocha", duration: 276, contentId: "song1", notes: "intro longa" },
    { id: "c", type: "TEXT", title: "Oração", duration: 120, enabled: false },
    { id: "d", type: "BIBLE", title: "Salmo 23", duration: 180, contentId: "bp1" },
];

test("plan: start times, section totals, total and end", () => {
    const p = plan({ startTime: "19:00" }, items);
    assert.equal(p.count, 3, "sections and disabled items do not count");
    assert.equal(p.seconds, 756);
    assert.equal(clockAt(p.ends), "19:12");
    assert.deepEqual(p.rows.map((r) => (r.at === null ? null : clockAt(r.at))), [null, "19:00", null, "19:05", null, "19:09"]);
    assert.deepEqual(p.sections[0], { count: 1, seconds: 300 });
    assert.deepEqual(p.sections[2], { count: 2, seconds: 456 });
    assert.equal(startOf({ time: "18:30" }), 18.5 * 3600, "the legacy time field");
    assert.equal(startOf({}), 19 * 3600);
    assert.equal(span(4500), "1:15:00");
    assert.equal(span(276), "4:36");
    assert.deepEqual([total(1080), total(4500), total(3600), total(40)], ["18 min", "1h15", "1h", "40 s"]);
});

test("templates keep contentId; copies land after the existing items", () => {
    const t = templateItems(items);
    assert.equal(t[3].contentId, "song1", "the bug of the old templates: items without content");
    assert.equal(t[3].order, 3);
    const rows = itemsFor("svc2", t, 4);
    assert.deepEqual(rows[0], { serviceId: "svc2", order: 4, type: "SECTION", title: "Pré-culto", contentId: "", duration: null, notes: "", enabled: true });
    assert.equal(rows[3].contentId, "song1");
    assert.deepEqual(playableItems(items).map((i) => i.id), ["a", "b", "d"]);
});

test("status and team members", () => {
    assert.equal(statusOf("planning"), "DRAFT");
    assert.equal(statusOf("READY"), "READY");
    assert.equal(statusOf(undefined), "DRAFT");
    assert.deepEqual(parseMember("Ana Souza · Ministra, voz"), { member_name: "Ana Souza", role: "Ministra, voz" });
    assert.deepEqual(parseMember("Pedro"), { member_name: "Pedro", role: "Equipe" });
    assert.equal(parseMember("  "), null);
});
