import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { BACKGROUNDS, bundledBackgrounds, backgroundThumbUrl } from "./backgrounds.js";

const dir = fileURLToPath(new URL("../../resources/backgrounds/", import.meta.url));

test("every factory photo ships with its small copy for the tiles (owner 2026-10-23)", () => {
    for (const id of new Set(Object.values(BACKGROUNDS).flat())) {
        assert.ok(existsSync(`${dir}${id}.webp`), `${id}: the photo`);
        const thumb = `${dir}thumbs/${id}.webp`;
        assert.ok(existsSync(thumb), `${id}: its small copy (resources/backgrounds/thumbs/)`);
        assert.ok(statSync(thumb).size < 80 * 1024, `${id}: the small copy stays small`);
    }
});

test("a factory photo carries its thumb; outside the desktop, Unsplash's smaller size", () => {
    const [first] = bundledBackgrounds();
    assert.equal(first.thumb, backgroundThumbUrl(first.id));
    assert.match(backgroundThumbUrl("1557672172-298e090bd0f1"), /w=480/);
});
