import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("../../components/console/console.css", import.meta.url), "utf8");

// The right-click menu's backdrop must cover THE window and the dialogs
// (z-menu). `.console .scrim` (the generic backdrop, a lower layer) comes later
// in the file, so a `.console .ctx-scrim` of the same weight lost to it and a
// click away inside a page left the menu open.
test("the right-click backdrop out-weighs the generic .scrim, which is declared after it", () => {
    assert.match(css, /\.console \.scrim\.ctx-scrim\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*var\(--z-menu\)/);
    assert.doesNotMatch(css, /(^|\n)\.console \.ctx-scrim\s*\{/, "a bare .ctx-scrim rule has the same weight as .scrim and loses to it");
});
