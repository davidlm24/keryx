import test from "node:test";
import assert from "node:assert/strict";
import { keepInView } from "./keepInView.js";

// Cards 50 px tall, back to back: card k spans k*50 .. k*50+50.
const card = (k) => ({ start: k * 50, end: k * 50 + 50 });
const at = (scroll, k, size = 300) => keepInView({ scroll, size }, card(k), { next: card(k + 1), prev: k > 0 ? card(k - 1) : null, pad: 0 });

test("the list moves when the card on air is the next-to-last one visible (0.2.18)", () => {
    // 300 px shows cards 0..5. Card 3 on air: 2..4 visible, nothing to do.
    assert.equal(at(0, 3), null);
    // Card 5 is the last one visible: the next one (6) would be cut, so it scrolls to show it.
    assert.equal(at(0, 5), 50);
    // Card 4 is the next-to-last: its next (5) is fully visible, nothing yet.
    assert.equal(at(0, 4), null);
});

test("going back keeps the card before in view", () => {
    // Scrolled to 200 (cards 4..9 visible), card 4 on air: card 3 must show.
    assert.equal(at(200, 4), 150);
    assert.equal(at(200, 5), null);
});

test("a span of several verses, a short list, the edges", () => {
    const view = { scroll: 0, size: 300 };
    // Verses 4 and 5 on air together: their span and the next one (6).
    assert.equal(keepInView(view, { start: 200, end: 300 }, { next: card(6), prev: card(3), pad: 0 }), 50);
    // Too tall for prev + item + next: the item and the next one win.
    assert.equal(keepInView({ scroll: 0, size: 120 }, card(4), { next: card(5), prev: card(3), pad: 0 }), 180);
    // An item taller than the view: its start shows.
    assert.equal(keepInView({ scroll: 0, size: 40 }, card(2), { pad: 0 }), 100);
    // Never past the top.
    assert.equal(keepInView({ scroll: 30, size: 300 }, card(0), { next: card(1), pad: 4 }), 0);
    assert.equal(keepInView({ scroll: 0, size: 0 }, card(0)), null);
});
