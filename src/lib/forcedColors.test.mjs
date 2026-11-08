import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Windows contrast themes (forced colours; design audit C-05, 2026-10-16).
// Under a contrast theme Chromium repaints backgrounds and borders in the
// system's colours and drops shadows: the console's states, which are
// backgrounds, would vanish, and the outputs would be recoloured. These
// rules are CSS only, so this keeps them from being lost in a later edit.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const { NETWORK_SCREENS } = createRequire(import.meta.url)(path.join(root, "electron/lan.cjs"));

// The bodies of every `@media (forced-colors: active) { … }` in a stylesheet.
function forcedBlocks(css) {
    const blocks = [];
    const open = /@media\s*\(\s*forced-colors\s*:\s*active\s*\)\s*\{/g;
    for (let m; (m = open.exec(css));) {
        let depth = 1, i = open.lastIndex;
        for (; i < css.length && depth; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
        blocks.push(css.slice(open.lastIndex, i - 1));
    }
    return blocks;
}

// The rules of a block as [selector, declarations] pairs.
const rules = (block) => [...block.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, s, d]) => [s.trim(), d.trim()]);
const ruleFor = (block, pattern) => rules(block).filter(([s]) => pattern.test(s)).map(([, d]) => d).join(" ");

// The selectors given forced-color-adjust: none, outside any media block.
const optedOut = (css) => rules(css.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/g, "")).filter(([, d]) => /forced-color-adjust:\s*none/.test(d)).map(([s]) => s).join(", ");

const BUNDLE = "docs/design-system/components/bundle.css";
const CONSOLE = "src/components/console/console.css";

test("bundle.css and console.css each keep ONE forced-colours block, near the end", () => {
    for (const file of [BUNDLE, CONSOLE]) {
        const css = read(file);
        const blocks = forcedBlocks(css);
        assert.equal(blocks.length, 1, `${file}: one @media (forced-colors: active) block`);
        assert.ok(css.lastIndexOf("forced-colors") > css.length * 0.9, `${file}: the block sits at the end`);
    }
});

test("inside the blocks every colour is a system colour (the theme's own palette)", () => {
    for (const file of [BUNDLE, CONSOLE]) {
        const [block] = forcedBlocks(read(file));
        for (const [selector, decl] of rules(block)) {
            assert.doesNotMatch(decl, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(|color-mix|var\(--/i, `${file}: ${selector} uses an authored colour`);
        }
    }
});

// Does a rule whose selector names `kind` and ends in `end` declare `decl`?
const states = (block, kind, end, decl) => rules(block).some(([s, d]) => s.includes(kind) && end.test(s) && decl.test(d));

test("the on-air, Prévia and next states keep a cue under a contrast theme", () => {
    const [bundle] = forcedBlocks(read(BUNDLE));
    const [console] = forcedBlocks(read(CONSOLE));
    const air = /background:\s*Highlight;\s*color:\s*HighlightText/;
    const prev = /outline:\s*2px dashed LinkText/;
    for (const kind of [".kx-slide", ".kx-verse", ".kx-row"]) {
        assert.ok(states(bundle, kind, /\.is-air$/, air), `bundle ${kind}.is-air fills with Highlight`);
        assert.ok(states(bundle, kind, /\.is-prev$/, prev), `bundle ${kind}.is-prev has a dashed ring`);
    }
    for (const kind of [".kx-slide", ".onair-card", ".kx-verse", ".kx-row", ".verse-cells button"]) {
        assert.ok(states(console, kind, /(\.is-air|:is\(\.is-air, \.is-air\.is-prev\))$/, air), `console ${kind}.is-air fills with Highlight`);
        assert.ok(states(console, kind, /\.is-prev:not\(:focus-visible\)$/, prev), `console ${kind}.is-prev has a dashed ring`);
    }
    assert.match(ruleFor(console, /\.onair-card\)\.is-next/), /outline:\s*2px dotted CanvasText/);
    assert.match(ruleFor(console, /\.is-on, \.is-sel, \.is-selected/), /outline:\s*2px solid Highlight/, "chosen / pressed");
});

test("the controls that are fills or shadows get system-colour boundaries", () => {
    const [bundle] = forcedBlocks(read(BUNDLE));
    const [console] = forcedBlocks(read(CONSOLE));
    assert.match(ruleFor(bundle, /\.kx-btn-outline/), /border:\s*1px solid ButtonText/);
    assert.match(ruleFor(bundle, /^\.kx-field$/), /border:\s*1px solid FieldText/);
    assert.match(ruleFor(bundle, /^\.kx-num$/), /border:\s*1px solid FieldText/, "NumBox (Rodada HF2)");
    assert.match(ruleFor(bundle, /\.kx-seg > button\.is-on/), /outline:\s*2px solid Highlight/);
    // The switch, the check, the group, the toast and THE window are bundle.css components (Rodada DS3).
    assert.match(ruleFor(bundle, /^\.kx \.kx-switch$/), /border:\s*1px solid ButtonText/);
    assert.match(ruleFor(bundle, /^\.kx \.kx-switch::after$/), /background:\s*ButtonText/);
    assert.match(ruleFor(bundle, /^\.kx \.kx-switch\.is-on$/), /background:\s*Highlight/);
    assert.match(ruleFor(bundle, /^\.kx \.kx-switch:disabled$/), /GrayText/);
    assert.match(ruleFor(bundle, /^\.kx \.kx-check:not/), /outline:\s*1px solid ButtonText/);
    assert.match(ruleFor(bundle, /^\.kx button\.kx-group-t$/), /outline:\s*1px solid ButtonText/);
    assert.match(ruleFor(bundle, /\.kx-toast, \.kx-win/), /outline:\s*1px solid CanvasText/, "floating, they lose their shadow: an edge");
    assert.match(ruleFor(console, /:not\(\.kx-switch, :focus-visible\)/), /outline:\s*2px solid Highlight/, "a switch is not ringed as chosen");
    assert.match(ruleFor(console, /select, textarea, input/), /border:\s*1px solid FieldText/);
});

test("what the congregation sees never takes the contrast theme", () => {
    const screens = optedOut(read("src/components/screen/screen.css"));
    for (const sel of ["html.ks-output-doc", ".ks", ".kl", ".ks-alert-layer", ".net-stage", ".net-pastor", ".kx-stream-band"]) {
        assert.ok(screens.split(/,\s*/).some((s) => s === sel || s.includes(`> ${sel})`)), `screen.css opts ${sel} out`);
    }
    assert.match(optedOut(read(BUNDLE)), /\.kx-mon-screen/, "the console's monitors (Programa, Prévia, Multiview) opt out");
    assert.match(optedOut(read(CONSOLE)), /\.cfg-prev/, "the stills of Telas e saídas opt out");
    // Every output page marks its document (App.jsx), the network's included.
    const app = read("src/App.jsx");
    assert.match(app, /classList\.toggle\('ks-output-doc', output\)/);
    const outputs = app.match(/const TITLED = new Set\(\[([^\]]*)\]\)/)[1];
    for (const s of NETWORK_SCREENS) assert.ok(outputs.includes(`'${s.path}'`), `${s.path} marks its document`);
});
