import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../components/console/console.css", import.meta.url), "utf8");
const menu = readFileSync(new URL("../../components/console/Menu.jsx", import.meta.url), "utf8");

// A submenu is a box of its own beside its item, in every menu (owner
// 2026-11-28): inside a right-click menu it was drawn in the flow and pushed
// the items under it down, so the pointer missed the next one.
test("every submenu is fixed beside its item, never in the menu's flow", () => {
    assert.match(css, /\.console \.mb-sub\s*\{[^}]*position:\s*fixed;/);
    assert.doesNotMatch(css, /\.mb-pop \.mb-sub/, "no rule of the bar's menu alone any more");
    assert.doesNotMatch(css, /\.mb-sub\s*\{[^}]*position:\s*(absolute|static|relative)/);
    assert.match(menu, /usePlaced\(list, rowRef, \{ beside: true \}\)/, "placed beside its row by placeSub");
});

test("the open item is marked in every menu, not only the bar's", () => {
    assert.match(css, /\.console \.kx-pop \.kx-menu-item\.is-on\s*\{/);
});
