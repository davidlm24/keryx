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

// The literal lint (Rodada DS3): outside the token files a stylesheet names a
// colour, a font size and a layer only through a token. The console's two
// (console.css, bundle.css) have none left. The other surfaces keep the
// literals they ship with, pinned value by value below, so a new one fails:
// the audience renderer (screen.css and its parts) has its own colours, cqw
// sizes and layer stack on purpose — console tokens never reach a projected
// screen —, and the network pages (the screens' start page, the Companion)
// have their own type scale, to be made tokens as docs/design-system/surfaces.md
// says. A token's own value (tokens.json) is the only place a literal belongs.
const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
const pxSize = (d) => (d.prop === "font-size" && /\dpx/.test(d.value)) || (d.prop === "font" && /(^|\s)\d+(\.\d+)?px(\/|\s|$)/.test(d.value));
const OTHER_SHEETS = {
    "src/components/screen/screen.css": {
        why: "the audience renderer: the screens' own colours (never the console's tokens), cqw sizes, its layer stack",
        colours: ["#000", "#fff", "rgba(0, 0, 0, .45)", "#26304f", "#10131f", "#06070c", "#f2c14e", "#000000b3", "rgba(0, 0, 0, .7)", "#ff6b70", "#1a1300", "#f5b83d", "rgba(0, 0, 0, .6)", "rgba(0, 0, 0, .55)", "#f4f1ea", "#000a", "#f5a524", "#e5484d", "rgba(0, 0, 0, .35)"],
        sizes: [], z: ["20", "30", "90", "9999", "80", "70"],
    },
    "src/components/screen/activity.css": { why: "the audience renderer's activities (quiz cards, the right answer)", colours: ["#4fd08a", "rgba(48, 164, 108, .38)", "rgba(79, 208, 138, .35)", "#06210f", "#ff6b70"], sizes: [], z: [] },
    "src/components/screen/layout.css": { why: "the audience renderer's designs (LayoutRenderer)", colours: ["#000000b3", "#000"], sizes: ["max(9px, 1.5cqmin)"], z: ["0", "1"] },
    "src/components/screen/output-prefs.css": { why: "an output's own settings over the renderer", colours: [], sizes: [], z: [] },
    "src/components/network/net.css": {
        why: "the screens on the network: their start page, sized in cqmin/vmin with a px floor",
        colours: ["#00000080", "#000000b3", "#000", "#000000a6", "#fff"],
        sizes: ["max(11px, 1.4cqmin)", "max(18px, 3.2vmin)", "max(13px, 1.9vmin)", "max(13px, 1.8vmin)", "22px", "15px", "12px", "14px", "16px", "13px", "max(15px, 2.6vmin)"],
        z: ["900", "0", "1", "10"],
    },
    "src/components/network/remote.css": {
        why: "the Companion (/Remote): a touch scale of its own, not tokens yet (surfaces.md)",
        colours: ["#000", "#000a", "#000c"],
        sizes: ["14px", "16px", "12px", "11.5px", "13px", "11px", "17px", "10px", "15px", "28px", "10.5px", "13.5px"],
        z: ["2", "20", "21", "30", "25"],
    },
};

test("the console's stylesheets name no colour by hand", () => {
    const loose = [];
    for (const file of SHEETS) {
        for (const d of declarations(read(file))) {
            for (const m of d.value.match(COLOUR) || []) loose.push(`${file}:${d.line} ${d.selector} { ${d.prop}: … ${m} … }`);
        }
    }
    assert.deepEqual(loose, [], "a colour is a token of tokens.json (npm run ds:tokens); a system colour (Canvas, Highlight…) only in a forced-colours block");
});

test("every component stylesheet is linted: the others keep only their pinned literals", () => {
    const css = fs.readdirSync(path.join(root, "src"), { recursive: true }).filter((f) => f.endsWith(".css")).map((f) => path.posix.join("src", f.split(path.sep).join("/")));
    // src/index.css is the shadcn theme (generated, HSL) and Tailwind; fonts.css only @font-face.
    const covered = new Set([...SHEETS, ...Object.keys(OTHER_SHEETS), "src/index.css", "src/fonts.css", "src/App.css"]);
    assert.deepEqual(css.filter((f) => !covered.has(f)), [], "a new stylesheet joins the lint (SHEETS or OTHER_SHEETS)");
    for (const [file, kept] of Object.entries(OTHER_SHEETS)) {
        const ds = declarations(read(file));
        const colours = new Set(ds.flatMap((d) => d.value.match(COLOUR) || []));
        const sizes = new Set(ds.filter(pxSize).map((d) => d.value));
        const z = new Set(ds.filter((d) => d.prop === "z-index").map((d) => d.value));
        for (const [what, found, allowed] of [["colour", colours, kept.colours], ["px font size", sizes, kept.sizes], ["z-index", z, kept.z]]) {
            const extra = [...found].filter((v) => !allowed.includes(v));
            assert.deepEqual(extra, [], `${file}: a new ${what} by hand (${kept.why}); use a token`);
        }
    }
});
