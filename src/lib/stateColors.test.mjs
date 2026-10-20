import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// On air and Prévia in the console's lists (Rodada DS1, owner 2026-10-20,
// d1_noar = "mix do A com D"). Two audits found the two washes differed by
// hue alone: gold 24 % and green 24 % over bg-2 were 1.06:1 in lightness and
// nearly one colour to a protanope. The owner's fix splits them in lightness
// (gold 36 %, green 16 %) and adds a gold bar on air; this keeps the numbers
// honest when a token or a percentage changes. The washes are tokens since
// Rodada DS2 and are read, with the colours they mix, from
// docs/design-system/tokens.css; the rules that wear them from console.css,
// so the test follows whatever ships.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

const TOKENS_CSS = read("docs/design-system/tokens.css");
const TOKENS = Object.fromEntries([...TOKENS_CSS.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(([, k, v]) => [k, v]));
const CONSOLE = read("src/components/console/console.css");

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const token = (name) => {
    assert.ok(TOKENS[name], `tokens.css has ${name}`);
    return hex(TOKENS[name]);
};
// `color-mix(in srgb, var(--a) N%, var(--b))`: a straight mix of the sRGB values.
function wash(name) {
    const m = TOKENS_CSS.match(new RegExp(`${name}:\\s*color-mix\\(in srgb,\\s*var\\((--[\\w-]+)\\)\\s*([\\d.]+)%,\\s*var\\((--[\\w-]+)\\)\\)`));
    assert.ok(m, `tokens.css defines ${name} as a color-mix`);
    const [, a, pct, b] = m;
    const p = Number(pct) / 100;
    const ca = token(a), cb = token(b);
    return ca.map((x, i) => x * p + cb[i] * (1 - p));
}

const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const luminance = (rgb) => { const [r, g, b] = rgb.map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };

// CIE L*a*b* (D65) and CIE76 ΔE, enough to tell two fills apart.
function lab(rgb) {
    const [r, g, b] = rgb.map(linear);
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const x = f((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047);
    const y = f(0.2126 * r + 0.7152 * g + 0.0722 * b);
    const z = f((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a, b) => { const [p, q] = [lab(a), lab(b)]; return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]); };

// The classic dichromat matrices on sRGB values (the same protan matrix the
// PR's screenshots apply to the page with an SVG feColorMatrix).
const PROTAN = [[0.567, 0.433, 0], [0.558, 0.442, 0], [0, 0.242, 0.758]];
const DEUTAN = [[0.625, 0.375, 0], [0.7, 0.3, 0], [0, 0.3, 0.7]];
const simulate = (rgb, m) => m.map((row) => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2]);

// ΔE 20 is "clearly two colours" at a glance, in a hurry, on a dim church
// monitor (ΔE 2–3 is the just-noticeable step; 10 already reads as
// different side by side). The old 24 %/24 % pair was 16.4 for a protanope.
const CVD_MIN = 20;

const air = wash("--live-bg");
const prev = wash("--prev-bg");

test("on air and Prévia differ in lightness, not only in hue", () => {
    const ratio = contrast(air, prev);
    assert.ok(ratio >= 1.4, `on air / Prévia lightness ratio ${ratio.toFixed(2)}:1 (at least 1.4:1; it was 1.06:1)`);
});

test("on air and Prévia stay apart for protanopes and deuteranopes", () => {
    for (const [name, m] of [["protan", PROTAN], ["deutan", DEUTAN]]) {
        const d = deltaE(simulate(air, m), simulate(prev, m));
        assert.ok(d >= CVD_MIN, `${name}: ΔE ${d.toFixed(1)} (at least ${CVD_MIN})`);
    }
});

test("the labels and numbers on the washes pass AA", () => {
    const fg1 = token("--fg-1"), fg2 = token("--fg-2");
    const aa = (fg, bg, what) => { const r = contrast(fg, bg); assert.ok(r >= 4.5, `${what}: ${r.toFixed(2)}:1`); };
    aa(fg2, prev, "fg-2 on the Prévia's wash");
    aa(fg1, air, "fg-1 on the on-air wash");
    // fg-2 on the gold wash is 4.15:1 at 36 %: the console draws the label
    // and the number there in fg-1. Pin the rule so nobody puts fg-2 back.
    assert.match(CONSOLE, /\.is-air > :is\(\.kx-slide-n, \.kx-verse-n\), \.console \.is-air \.kx-slide-lab \{ color: var\(--fg-1\); \}/);
    assert.match(CONSOLE, /\.is-prev > \.kx-slide-n, \.console \.is-prev > \.kx-verse-n, \.console \.is-prev \.kx-slide-lab \{ color: var\(--fg-2\); \}/);
});

test("on air carries a bar that does not depend on colour, the next slide its own", () => {
    assert.match(CONSOLE, /--live-bar:\s*inset 3px 0 0 var\(--live\)/);
    assert.match(CONSOLE, /--next-bar:\s*inset 2px 0 0 var\(--fg-3\)/);
    assert.match(CONSOLE, /\.console \.kx-slide\.is-air, \.console \.kx-verse\.is-air, \.console \.onair-card\.is-air \{ background: var\(--live-bg\); box-shadow: var\(--live-bar\); \}/);
    assert.match(CONSOLE, /\.console \.kx-slide\.is-next, \.console \.onair-card\.is-next \{ box-shadow: var\(--next-bar\); \}/);
});
