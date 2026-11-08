import test from "node:test";
import assert from "node:assert/strict";
import { gridStep, columnsOf, rowKey } from "./gridNav.js";

test("gridStep in a list: ↑/↓ step and stop at the ends; ←/→ do nothing", () => {
    assert.equal(gridStep(-1, "ArrowDown", 5), 0);
    assert.equal(gridStep(-1, "ArrowUp", 5), 4);
    assert.equal(gridStep(2, "ArrowDown", 5), 3);
    assert.equal(gridStep(4, "ArrowDown", 5), 4);
    assert.equal(gridStep(0, "ArrowUp", 5), 0);
    assert.equal(gridStep(2, "ArrowRight", 5), null);
    assert.equal(gridStep(2, "Enter", 5), null);
    assert.equal(gridStep(0, "ArrowDown", 0), null);
});

test("gridStep in a grid: a row down / up, a card left / right, Home / End", () => {
    // 10 cards, 4 a row: 0-3 / 4-7 / 8-9
    assert.equal(gridStep(1, "ArrowDown", 10, 4), 5);
    assert.equal(gridStep(5, "ArrowUp", 10, 4), 1);
    assert.equal(gridStep(1, "ArrowUp", 10, 4), 1);
    assert.equal(gridStep(5, "ArrowRight", 10, 4), 6);
    assert.equal(gridStep(4, "ArrowLeft", 10, 4), 3);
    assert.equal(gridStep(9, "ArrowRight", 10, 4), 9);
    // Down from a column the last row lacks: the last card.
    assert.equal(gridStep(6, "ArrowDown", 10, 4), 9);
    assert.equal(gridStep(9, "ArrowDown", 10, 4), 9);
    assert.equal(gridStep(6, "Home", 10, 4), 0);
    assert.equal(gridStep(1, "End", 10, 4), 9);
});

test("columnsOf counts the cards on the first row", () => {
    assert.equal(columnsOf([0, 0, 0, 120, 120]), 3);
    assert.equal(columnsOf([0, 0.5, 1]), 3);
    assert.equal(columnsOf([0]), 1);
    assert.equal(columnsOf([]), 1);
});

test("rowKey: Delete and F2 alone, never Backspace or with a modifier", () => {
    assert.equal(rowKey({ key: "Delete" }), "delete");
    assert.equal(rowKey({ key: "F2" }), "rename");
    assert.equal(rowKey({ key: "Backspace" }), null);
    assert.equal(rowKey({ key: "Delete", ctrlKey: true }), null);
    assert.equal(rowKey({ key: "F2", shiftKey: true }), null);
});
