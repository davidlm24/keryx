"use strict";
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { SIZE, STEPS, splashEnabled, splashBounds, stepOf, fontFile } = require("./splash.cjs");

test("splash: off in a smoke run and with KERYX_NO_SPLASH=1, on otherwise", () => {
    assert.equal(splashEnabled({}), true);
    assert.equal(splashEnabled({ KERYX_SMOKE: "1" }), false);
    assert.equal(splashEnabled({ KERYX_NO_SPLASH: "1" }), false);
});

test("splash: centred in the console's box, never larger than it", () => {
    assert.deepEqual(splashBounds({ x: 0, y: 0, width: 1920, height: 1040 }), { x: 700, y: 360, width: SIZE.width, height: SIZE.height });
    // The console on a second monitor to the left: the splash follows it.
    assert.deepEqual(splashBounds({ x: -1366, y: 0, width: 1366, height: 728 }), { x: -943, y: 204, width: 520, height: 320 });
    assert.deepEqual(splashBounds({ x: 10, y: 10, width: 400, height: 300 }), { x: 10, y: 10, width: 400, height: 300 });
});

test("splash: the steps move forward, in pt-BR, ending before the console", () => {
    const order = ["data", "backup", "live", "network", "sync", "console"];
    assert.deepEqual(Object.keys(STEPS), order);
    let last = 0;
    for (const id of order) {
        const s = stepOf(id);
        assert.ok(s.at > last && s.at < 1, id);
        assert.match(s.text, /…$/, id);
        last = s.at;
    }
    assert.equal(stepOf("nope"), null);
});

test("splash: the Geist file, from the source in dev or the built asset installed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-splash-"));
    try {
        assert.equal(fontFile(root), null);
        fs.mkdirSync(path.join(root, "dist", "assets"), { recursive: true });
        fs.writeFileSync(path.join(root, "dist", "assets", "Geist-Variable-Bj2R_7yk.woff2"), "");
        assert.equal(fontFile(root), path.join(root, "dist", "assets", "Geist-Variable-Bj2R_7yk.woff2"));
        fs.mkdirSync(path.join(root, "src", "assets", "fonts"), { recursive: true });
        fs.writeFileSync(path.join(root, "src", "assets", "fonts", "Geist-Variable.woff2"), "");
        assert.equal(fontFile(root), path.join(root, "src", "assets", "fonts", "Geist-Variable.woff2"));
    } finally {
        fs.rmSync(root, { recursive: true, force: true });
    }
    // The real repository has the source file.
    assert.ok(fontFile(path.join(__dirname, "..")));
});

test("splash: the page's colours are the design system's tokens", () => {
    const html = fs.readFileSync(path.join(__dirname, "splash.html"), "utf8");
    const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "docs", "design-system", "tokens.json"), "utf8"));
    const colors = Object.fromEntries(tokens.color.tokens.map((t) => [t.name, t.value]));
    for (const name of ["bg-0", "fg-1", "brand", "on-brand", "brand-gradient"]) {
        assert.ok(colors[name], `token ${name}`);
        assert.ok(html.includes(`--${name}: ${colors[name]};`), `splash.html --${name} = ${colors[name]}`);
    }
});
