import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FONT_MAP } from "./deviceStyles.js";

// The fonts KERYX ships (src/fonts.css): the console and every screen use
// the same Geist, from the app itself, never from the internet.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p));

test("Sem serifa is the bundled Geist, with the system font only as a fallback", () => {
    assert.match(FONT_MAP.sans, /^"Geist",/);
    assert.match(FONT_MAP.sans, /system-ui/);
});

test("the @font-face points at a real woff2 shipped in the repository", () => {
    const css = read("src/fonts.css").toString();
    const url = css.match(/url\("\.\/(assets\/fonts\/[^"]+\.woff2)"\)/);
    assert.ok(url, "fonts.css declares a local woff2");
    const file = read(path.join("src", url[1]));
    assert.equal(file.subarray(0, 4).toString("latin1"), "wOF2");
    assert.match(css, /font-weight:\s*100 900/);
});

test("the font's license ships with the build (SIL OFL 1.1)", () => {
    const license = read("public/fonts/Geist-OFL.txt").toString();
    assert.match(license, /SIL Open Font License, Version 1\.1/);
    assert.match(license, /Copyright \(c\) 2023 Vercel/);
});

test("no stylesheet fetches fonts from the internet", () => {
    for (const p of ["src/index.css", "src/fonts.css", "src/components/console/console.css", "src/components/screen/screen.css", "docs/design-system/components/bundle.css", "docs/design-system/tokens.css", "index.html"]) {
        assert.doesNotMatch(read(p).toString(), /fonts\.(googleapis|gstatic)\.com/, p);
    }
});
