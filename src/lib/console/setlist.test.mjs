import test from "node:test";
import assert from "node:assert/strict";
import { plan, templateItems, itemsFor, playableItems, statusOf, parseMember, clockAt, span, startOf, total, itemOnAir, stageItem, addedSay, neighbours } from "./setlist.js";

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

test("itemOnAir: the session's item is on air only while the screens still show it (C-08)", () => {
    const song = { content: { kind: "lyrics", ref: { songId: "song1", serviceItemId: "b" }, slides: [{ text: "x" }], index: 0 } };
    const at = (itemId, rest) => ({ session: { itemId }, ...rest });
    assert.equal(itemOnAir(at("b", song), items), true);
    // After Esc the session keeps its item; nothing is on air.
    assert.equal(itemOnAir(at("b", {}), items), false);
    // Covered by Tela preta or the Logo it is still on air (the panels say "coberto").
    assert.equal(itemOnAir(at("b", { ...song, screen: "black" }), items), true);
    assert.equal(itemOnAir(at("b", { ...song, screen: "logo" }), items), true);
    // Another item (or a song from the Biblioteca) over it.
    assert.equal(itemOnAir(at("b", { content: { kind: "lyrics", ref: { songId: "song9" } } }), items), false);
    assert.equal(itemOnAir(at("b", { content: { kind: "lyrics", ref: { songId: "song1", serviceItemId: "x" } } }), items), false);
    assert.equal(itemOnAir(at("b", { ...song, tool: { mode: "clock" } }), items), false);
    // The same song sent from the Biblioteca is still the item.
    assert.equal(itemOnAir(at("b", { content: { kind: "lyrics", ref: { songId: "song1" } } }), items), true);
    // An aviso, a passage and a timer, each by its own layer.
    assert.equal(itemOnAir(at("a", { communication: { item: { id: "p1" } } }), items), true);
    assert.equal(itemOnAir(at("a", { communication: { item: { id: "p2" } } }), items), false);
    assert.equal(itemOnAir(at("d", { content: { kind: "bible", ref: { passageId: "bp1" } } }), items), true);
    const more = [...items, { id: "t", type: "TIMER" }, { id: "m", type: "AUDIO", contentId: "aud1" }, { id: "v", type: "VIDEO", contentId: "vid1" }];
    assert.equal(itemOnAir(at("t", { tool: { mode: "timer" } }), more), true);
    assert.equal(itemOnAir(at("m", { audio: { id: "aud1" } }), more), true);
    assert.equal(itemOnAir(at("m", {}), more), false);
    assert.equal(itemOnAir(at("v", { media: { id: "vid1" } }), more), true);
    // No session, or an item no longer in the Setlist.
    assert.equal(itemOnAir({ ...song }, items), false);
    assert.equal(itemOnAir(at("gone", song), items), false);
    assert.equal(itemOnAir(null, items), false);
});

test("stageItem: what a Biblioteca stage becomes in the Setlist", () => {
    assert.deepEqual(stageItem({ kind: "lyrics", id: "song:s1" }), { type: "SONG", contentId: "s1" });
    assert.deepEqual(stageItem({ id: "media:m1", args: { kind: "video" } }), { type: "VIDEO", contentId: "m1" });
    assert.deepEqual(stageItem({ id: "media:m2", args: { kind: "presentation" } }), { type: "PDF", contentId: "m2" });
    assert.deepEqual(stageItem({ id: "media:m3", args: { kind: "image" } }), { type: "IMAGE", contentId: "m3" });
    assert.deepEqual(stageItem({ id: "material:x" }), { type: "MATERIAL", contentId: "x" });
    assert.equal(stageItem({ id: "yt:https://youtu.be/a" }).type, "YT");
    assert.equal(stageItem({ id: "piece:p1", kind: "piece" }), null, "an aviso does not go in a setlist");
    assert.equal(stageItem(null), null);
});

test("addedSay: one toast for one or several rows (Rodada O2)", () => {
    assert.equal(addedSay(["Graça"]), "Graça na setlist.");
    assert.equal(addedSay(["A", "B", "C"]), "3 itens na setlist.");
    assert.equal(addedSay(["A", "B"], 1), "2 itens na setlist · 1 não entra.");
    assert.equal(addedSay(["A"], 2), "A na setlist · 2 não entram.");
    assert.match(addedSay([], 1), /^Esse item ainda não entra/);
    assert.match(addedSay([], 3), /^Esses itens ainda não entram/);
});

test("neighbours: skips sections and disabled items, in setlist order", () => {
    const n = neighbours(items, "b");
    assert.equal(n.prev.id, "a");
    assert.equal(n.prevIndex, 1);
    assert.equal(n.next.id, "d");
    assert.equal(n.nextIndex, 5);
});

test("neighbours: both ends have no neighbour", () => {
    assert.equal(neighbours(items, "a").prev, null);
    assert.equal(neighbours(items, "a").next.id, "b");
    assert.equal(neighbours(items, "d").next, null);
    assert.equal(neighbours(items, "d").prev.id, "b");
});

test("neighbours: nothing on air -> the first playable item, no previous", () => {
    const n = neighbours(items, null);
    assert.equal(n.next.id, "a");
    assert.equal(n.prev, null);
    assert.equal(neighbours(items, "gone").next.id, "a");
    assert.deepEqual(neighbours([], "x"), { prev: null, next: null, prevIndex: null, nextIndex: null });
});
