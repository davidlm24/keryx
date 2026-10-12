import { test } from "node:test";
import assert from "node:assert/strict";
import { applyOp, emptyState } from "../../shared/live-state.mjs";
import {
    ELEMENT_TYPES, TEXT_TYPES, FACTORY_LAYOUTS, normalizeElement, normalizeLayout, newElement, newLayout, duplicateLayout,
    findLayout, layoutChoices, layoutContext, elementVisible, elementText, elementItems, elementHasContent, layoutHasTimer, snapRect, resizeRect, moveRect, reorderElement, formatSpan,
} from "./layouts.js";

const T0 = Date.UTC(2026, 9, 12, 19, 30, 0);
const song = (now = T0) => applyOp(emptyState(now), "content.show", {
    kind: "lyrics", title: "Grande é o Senhor", artist: "Adhemar", slides: [{ text: "Grande é o Senhor" }, { text: "e mui digno" }],
    stage: { song_key: "G", bpm: 72, chords: "G D Em C", musician_notes: "Intro 2x" },
}, now);

test("element types: every text type exists and the factory layouts are valid", () => {
    for (const id of TEXT_TYPES) assert.ok(ELEMENT_TYPES.some((t) => t.id === id), id);
    assert.equal(FACTORY_LAYOUTS.length, 3);
    for (const l of FACTORY_LAYOUTS) {
        assert.ok(l.factory && l.id.startsWith("factory:"));
        assert.ok(l.elements.length >= 3);
        for (const e of l.elements) assert.ok(e.x + e.w <= 100 && e.y + e.h <= 100, `${l.id} ${e.type} fits`);
    }
});

test("normalizeElement: defaults from the type, clamps, unknown types dropped", () => {
    assert.equal(normalizeElement({ type: "nope" }), null);
    const e = normalizeElement({ type: "clock", x: 95, y: -4, w: 300, h: 1, size: 99, color: "red", when: "later", props: { seconds: "yes" } });
    assert.equal(e.w, 100); assert.equal(e.x, 0); assert.equal(e.y, 0); assert.equal(e.h, 2);
    assert.equal(e.size, 30); assert.equal(e.color, ""); assert.equal(e.when, "always");
    assert.equal(e.props.seconds, false);
    assert.ok(e.id.startsWith("el_"));
    const k = normalizeElement({ type: "song_key" });
    assert.equal(k.label, "Tom"); assert.equal(k.box, true); assert.equal(k.weight, "bold");
    const n = normalizeElement({ type: "next_items", props: { count: 99 } });
    assert.equal(n.props.count, 10);
});

test("newElement lands centred on the spot, inside the canvas", () => {
    const e = newElement("title", { x: 98, y: 2 });
    assert.equal(e.x + e.w, 100); assert.equal(e.y, 0);
    assert.equal(newElement("zzz"), null);
});

test("normalizeLayout and duplicateLayout", () => {
    const l = normalizeLayout({ id: "r1", name: "  Palco banda  ", category: "x", elements: [{ type: "clock" }, { type: "bad" }], background: { color: "#ABCDEF", dim: 2 } });
    assert.equal(l.name, "Palco banda"); assert.equal(l.category, "palco"); assert.equal(l.elements.length, 1);
    assert.equal(l.background.color, "#abcdef"); assert.equal(l.background.dim, 0.95); assert.equal(l.background.song_image, true);
    const d = duplicateLayout(l);
    assert.equal(d.id, ""); assert.equal(d.name, "Palco banda (cópia)"); assert.notEqual(d.elements[0].id, l.elements[0].id);
    assert.equal(newLayout("pastor").category, "pastor");
});

test("findLayout and layoutChoices", () => {
    const rows = [{ id: "r2", name: "Zeta", category: "pastor", elements: [] }, { id: "r1", name: "Alfa", category: "palco", elements: [] }];
    assert.equal(findLayout("", rows), null);
    assert.equal(findLayout("factory:palco", rows).factory, true);
    assert.equal(findLayout("r2", rows).name, "Zeta");
    assert.equal(findLayout("gone", rows), null);
    assert.deepEqual(layoutChoices(rows).map((c) => c.id), ["", "factory:palco", "factory:pastor", "factory:projecao", "r1", "r2"]);
});

test("layoutContext reads the live state", () => {
    const ctx = layoutContext({ live: song(), now: T0 + 65_000, upcoming: [{ id: "a" }], hasService: true });
    assert.equal(ctx.current.text, "Grande é o Senhor"); assert.equal(ctx.next.text, "e mui digno");
    assert.equal(ctx.elapsed, 65); assert.equal(ctx.running, null);
    assert.equal(ctx.song.song_key, "G"); assert.equal(ctx.caption.title, "Grande é o Senhor"); assert.equal(ctx.caption.pos, "1/2");
    const empty = layoutContext({ live: null, now: T0 });
    assert.equal(empty.content, null); assert.deepEqual(empty.slides, []); assert.equal(empty.caption.title, "");
});

test("elementVisible follows the rule", () => {
    const on = layoutContext({ live: song(), now: T0 });
    const off = layoutContext({ live: emptyState(T0), now: T0 });
    const tool = layoutContext({ live: applyOp(emptyState(T0), "tool.show", { mode: "timer", durationMs: 180_000 }, T0), now: T0 });
    const v = (when, ctx) => elementVisible({ when }, ctx);
    assert.ok(v("always", off) && v("always", on));
    assert.ok(v("content", on) && !v("content", off));
    assert.ok(v("tool", tool) && !v("tool", on));
    assert.ok(v("idle", off) && !v("idle", on) && !v("idle", tool));
});

test("elementText: each text type, and nothing to say is an empty string", () => {
    const ctx = layoutContext({ live: song(), now: T0 + 65_000, church: { name: "Comunidade", city: "Gerar" } });
    const txt = (type, props = {}, label) => elementText(normalizeElement({ type, props, label }), ctx);
    assert.match(txt("clock"), /^\d\d:\d\d$/);
    assert.match(txt("clock", { seconds: true }), /^\d\d:\d\d:\d\d$/);
    assert.match(txt("date"), /de outubro/);
    assert.equal(txt("title"), "Grande é o Senhor\nAdhemar");
    assert.equal(txt("title", { artist: false }), "Grande é o Senhor");
    assert.equal(txt("next"), "e mui digno");
    assert.equal(txt("song_key"), "G"); assert.equal(txt("bpm"), "72"); assert.equal(txt("song_time"), "1:05");
    assert.equal(txt("notes"), "Intro 2x");
    assert.equal(txt("church"), "Comunidade · Gerar");
    assert.equal(txt("air_title"), "Grande é o Senhor · 1/2");
    assert.equal(txt("air_for"), "1:05");
    assert.equal(txt("service_time"), "");
    assert.equal(txt("timer"), "");
    assert.equal(txt("text", { text: "Olá" }), "Olá");
    assert.equal(elementText(normalizeElement({ type: "monitor" }), ctx), undefined);
    const idle = layoutContext({ live: emptyState(T0), now: T0 });
    assert.equal(elementText(normalizeElement({ type: "title" }), idle), "");
    assert.equal(elementText(normalizeElement({ type: "air_title" }), idle), "");
});

test("elementText: the tool on air", () => {
    const at = (live) => layoutContext({ live, now: T0 + 1000 });
    const timer = applyOp(emptyState(T0), "tool.show", { mode: "timer", durationMs: 180_000 }, T0);
    assert.equal(elementText(normalizeElement({ type: "timer" }), at(timer)), "00:02:59");
    const free = applyOp(emptyState(T0), "tool.show", { mode: "freetext", text: "Silêncio" }, T0);
    assert.equal(elementText(normalizeElement({ type: "timer" }), at(free)), "Silêncio");
    const withSession = applyOp(emptyState(T0), "session.start", {}, T0);
    assert.equal(elementText(normalizeElement({ type: "service_time" }), layoutContext({ live: withSession, now: T0 + 3_725_000 })), "1:02:05");
});

test("elementItems", () => {
    const ctx = layoutContext({ live: null, now: T0, upcoming: [1, 2, 3, 4] });
    assert.deepEqual(elementItems(normalizeElement({ type: "next_items", props: { count: 2 } }), ctx), [1, 2]);
    assert.deepEqual(elementItems(normalizeElement({ type: "next_items", props: { count: 0 } }), ctx), [1]);
});

test("snapRect: edges, centre and other elements", () => {
    const r = { x: 0.8, y: 44.5, w: 20, h: 10 };
    const { rect, guides } = snapRect(r, []);
    assert.equal(rect.x, 0); assert.equal(rect.y, 45, "the centre snaps to 50");
    assert.deepEqual(guides.map((g) => g.axis), ["x", "y"]);
    const near = snapRect({ x: 30.5, y: 10, w: 10, h: 10 }, [{ x: 40.1, y: 30, w: 10, h: 10 }]);
    assert.equal(near.rect.x + near.rect.w, 40.1, "the right edge meets the other's left edge");
    assert.equal(snapRect({ x: 20, y: 20, w: 10, h: 10 }, []).guides.length, 0);
    const rs = snapRect({ x: 10, y: 10, w: 39.5, h: 10 }, [], { resize: "e" });
    assert.equal(rs.rect.w, 40, "resizing snaps the dragged edge to the centre");
    assert.equal(rs.rect.x, 10);
});

test("resizeRect and moveRect keep the element inside and never too small", () => {
    assert.deepEqual(resizeRect({ x: 10, y: 10, w: 20, h: 20 }, "se", 5, -3), { x: 10, y: 10, w: 25, h: 17 });
    assert.deepEqual(resizeRect({ x: 10, y: 10, w: 20, h: 20 }, "nw", -20, 50), { x: 0, y: 28, w: 30, h: 2 });
    assert.deepEqual(resizeRect({ x: 90, y: 0, w: 10, h: 10 }, "e", 40, 0), { x: 90, y: 0, w: 10, h: 10 });
    assert.deepEqual(moveRect({ x: 90, y: 90, w: 20, h: 20 }, 50, 50), { x: 80, y: 80, w: 20, h: 20 });
});

test("reorderElement", () => {
    const els = [{ id: "a" }, { id: "b" }, { id: "c" }];
    assert.deepEqual(reorderElement(els, "a", 1).map((e) => e.id), ["b", "a", "c"]);
    assert.equal(reorderElement(els, "a", -1), els);
    assert.equal(reorderElement(els, "zz", 1), els);
});

test("formatSpan", () => {
    assert.equal(formatSpan(5), "0:05"); assert.equal(formatSpan(3600), "1:00:00");
});

test("elementHasContent: empty elements draw nothing", () => {
    const on = layoutContext({ live: song(), now: T0 });
    const off = layoutContext({ live: emptyState(T0), now: T0 });
    const has = (type, ctx, props = {}, extra) => elementHasContent(normalizeElement({ type, props }), ctx, extra);
    assert.ok(has("chords", on) && !has("chords", off));
    assert.ok(has("progress", on) && !has("progress", off));
    assert.ok(has("current", on) && !has("current", off));
    assert.ok(has("title", on) && !has("title", off));
    assert.ok(has("logo", off, {}, { logoUrl: "x" }) && !has("logo", off));
    assert.ok(has("image", off, { url: "http://x" }) && !has("image", off));
    assert.ok(has("next_items", off) && has("monitor", off));
});

test("layoutHasTimer and the screen element", () => {
    assert.ok(layoutHasTimer(findLayout("factory:projecao")));
    assert.ok(!layoutHasTimer(findLayout("factory:pastor")));
    assert.ok(elementHasContent(normalizeElement({ type: "screen" }), layoutContext({ live: null, now: T0 })));
});
