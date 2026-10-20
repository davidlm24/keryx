import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The tokens that were missing (Rodada DS2, owner 2026-10-20, d6_escala =
// "sete"): the console's stylesheets write a font size, a layer and the dark
// chrome over a screen only through docs/design-system/tokens.css. Two
// audits found 13 sizes typed by hand (9, 10, 10.5, 11.5 and 12.5 px among
// them) and 29 z-index numbers; this keeps them from coming back.
// tokens.json ↔ tokens.css name for name: designTokens.test.mjs.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const SHEETS = ["src/components/console/console.css", "docs/design-system/components/bundle.css"];
const TOKENS = read("docs/design-system/tokens.css");
const defined = new Set([...TOKENS.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));

// Each declaration with the selector of the rule it sits in (comments out).
function declarations(css) {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    const out = [];
    const re = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = re.exec(src))) {
        const selector = m[1].trim().replace(/\s+/g, " ").replace(/^.*\{\s*/, "");
        const line = src.slice(0, m.index + m[0].indexOf(m[2])).split("\n").length;
        for (const d of m[2].split(";")) {
            const i = d.indexOf(":");
            if (i > 0) out.push({ selector, prop: d.slice(0, i).trim(), value: d.slice(i + 1).trim().replace(/\s+/g, " "), line });
        }
    }
    return out;
}

// The only px font sizes left on the console, each with its reason. The
// projected screens' rules (.kx-screen-*) size in cqw, not px, and are not
// on the console's scale at all.
const FONT_SIZE_KEPT = [
    [/\.kx-mark::after$/, "the logo's K, drawn to the size of its mark"],
    [/\.fd-preview$/, "a font specimen in the Fontes do computador dialog"],
    [/\.cfg-sync-bigcode$/, "the church's sync code, shown big to be copied by hand"],
];
const kept = (selector) => FONT_SIZE_KEPT.some(([re]) => re.test(selector));
const SCALE = ["--fs-meta", "--fs-ui", "--fs-content", "--fs-content-lg", "--fs-live", "--fs-clock", "--fs-count"];

test("the type scale is seven steps, 11 to 28 px", () => {
    const px = SCALE.map((n) => { const m = TOKENS.match(new RegExp(`${n}:\\s*(\\d+)px;`)); assert.ok(m, `${n} in tokens.css`); return Number(m[1]); });
    assert.deepEqual(px, [11, 12, 13, 14, 16, 20, 28]);
});

test("the parser finds a declaration under its selector", () => {
    const found = declarations(".a { color: red; }\n/* .b { z-index: 3 } */\n@container x (max-width: 1px) { .c .d { font: 600 12px/16px x; } }");
    assert.deepEqual(found.map((d) => [d.selector, d.prop, d.line]), [[".a", "color", 1], [".c .d", "font", 3]]);
});

test("no px font size outside the scale (only the documented exceptions)", () => {
    const loose = [];
    for (const file of SHEETS) {
        for (const d of declarations(read(file))) {
            const px = d.prop === "font-size" ? /^\d/.test(d.value) && /px$/.test(d.value)
                : d.prop === "font" && /(^|\s)\d+(\.\d+)?px(\/|\s|$)/.test(d.value);
            if (px && !kept(d.selector)) loose.push(`${file}:${d.line} ${d.selector} { ${d.prop}: ${d.value} }`);
            const fs = d.value.match(/var\((--fs-[\w-]+)\)/);
            if (fs) assert.ok(SCALE.includes(fs[1]), `${file}:${d.line} ${fs[1]} is not a step of the scale`);
        }
    }
    assert.deepEqual(loose, [], "use an --fs-* token (11, 12, 13, 14, 16, 20 or 28 px), or document the exception in FONT_SIZE_KEPT");
});

test("every layer is a named token, never a raw z-index", () => {
    const raw = [];
    for (const file of SHEETS) {
        for (const d of declarations(read(file))) {
            if (d.prop !== "z-index") continue;
            const m = d.value.match(/^var\((--z-[\w-]+)\)$/);
            if (!m) raw.push(`${file}:${d.line} ${d.selector} { z-index: ${d.value} }`);
            else assert.ok(defined.has(m[1]), `${file}:${d.line} ${m[1]} is not defined in tokens.css`);
        }
    }
    assert.deepEqual(raw, [], "name the layer by its role in tokens.json › layer");
});

// The order the console relies on (checked by hand against the old numbers
// in Rodada DS2): inside a monitor the frame, the badges, the drop hint and
// the pill; above the panels the popovers, THE window, the background
// library, the dialogs, ConfirmDialog, the menus, the toast, the drag card.
test("the layers keep their order", () => {
    const z = (n) => { const m = TOKENS.match(new RegExp(`--z-${n}:\\s*(\\d+);`)); assert.ok(m, `--z-${n}`); return Number(m[1]); };
    const order = (...names) => names.slice(1).forEach((n, i) => assert.ok(z(n) > z(names[i]), `--z-${n} over --z-${names[i]}`));
    order("screen", "mark", "handle", "edge", "guide", "hatch", "frame", "badge", "drop", "pill", "ring");
    order("ring", "scrim", "menubar", "window-scrim", "pop", "window", "window-over", "drawer", "verify", "library-scrim", "library", "dialog", "confirm-scrim", "confirm", "menu", "menu-top", "toast", "drag");
    assert.deepEqual(["screen", "badge", "pill", "pop", "window", "dialog", "toast"].map(z), [1, 10, 20, 30, 40, 50, 60], "the owner's seven");
});

test("the dark chrome over a screen is a token, not a repeated colour", () => {
    for (const file of SHEETS) {
        const css = read(file).replace(/\/\*[\s\S]*?\*\//g, "");
        assert.doesNotMatch(css, /#0d0d0cd9\b/i, `${file}: var(--chrome-on-screen)`);
        assert.doesNotMatch(css, /#ffffff14\b/i, `${file}: var(--chrome-ring)`);
    }
});

test("the state washes and the fold's motion live in tokens.css only", () => {
    const consoleCss = read("src/components/console/console.css");
    for (const name of ["--live", "--live-fg", "--live-bg", "--prev-bg", "--dur-fold", "--ease-fold", "--control-sm", "--band"]) {
        assert.ok(defined.has(name), `tokens.css defines ${name}`);
        assert.doesNotMatch(consoleCss, new RegExp(`${name}\\s*:`), `console.css does not define ${name}`);
    }
    assert.doesNotMatch(consoleCss, /var\(--(fold-ms|ease)[,)]/, "the old --fold-ms and the undefined --ease are gone");
});

test("the font stacks name no font KERYX does not ship", () => {
    // Geist ships (src/fonts.css); behind it only the system font. "Inter" was
    // never shipped: on a PC that has it, a missing Geist would fall to it.
    for (const name of ["--font-sans", "--font-display"]) {
        const m = TOKENS.match(new RegExp(`${name}:\\s*([^;]+);`));
        assert.ok(m, name);
        assert.match(m[1], /^"Geist", system-ui/);
        assert.doesNotMatch(m[1], /Inter/);
    }
    assert.doesNotMatch(read("src/components/screen/screen.css"), /"Inter"/);
});
