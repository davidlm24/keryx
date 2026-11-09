import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Glass (owner 2026-11-09, G1 = A, G2 = A): what floats over the console —
// the pills, the menus and popovers, the palette, the toast — lets it show
// through, blurred, and THE window's backdrop blurs a little. Never where it
// costs legibility or reaches the audience: every backdrop-filter of the
// console's sheets sits inside ONE guarded block (a browser that blurs,
// Windows' transparency effects on, no contrast theme), names the tokens,
// and no stylesheet an output draws with blurs anything.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const noComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));

// The [start, end) of every `@media <query> { … }` whose query matches.
function blocks(css, query) {
    const out = [];
    const open = new RegExp(`@media\\s*${query}\\s*\\{`, "g");
    for (let m; (m = open.exec(css));) {
        let depth = 1, i = open.lastIndex;
        for (; i < css.length && depth; i++) depth += css[i] === "{" ? 1 : css[i] === "}" ? -1 : 0;
        out.push([m.index, i]);
    }
    return out;
}

const GUARD = "\\(forced-colors:\\s*none\\)\\s*and\\s*\\(prefers-reduced-transparency:\\s*no-preference\\)";

for (const file of ["docs/design-system/components/bundle.css", "src/components/console/console.css"]) {
    test(`${file}: every blur is glass, inside the one guarded block`, () => {
        const css = noComments(read(file));
        const guarded = blocks(css, GUARD);
        assert.equal(guarded.length, 1, "one @media (forced-colors: none) and (prefers-reduced-transparency: no-preference) block");
        const [start, end] = guarded[0];
        assert.match(css.slice(start, end), /@supports\s*\(backdrop-filter:\s*blur\(1px\)\)/, "the glass waits for a browser that blurs");
        const uses = [...css.matchAll(/(?<!\()backdrop-filter\s*:\s*([^;}]+)/g)];
        assert.ok(uses.length > 0);
        for (const m of uses) {
            assert.ok(m.index > start && m.index < end, `${file}: backdrop-filter outside the guarded block`);
            assert.match(m[1].trim(), /^var\(--(glass-blur|blur-backdrop)\)$/, `${file}: a blur is a token (${m[1].trim()})`);
        }
    });
}

test("the glass is only on what floats: never a panel, a list, a monitor's screen or THE window's body", () => {
    const sel = [];
    for (const file of ["docs/design-system/components/bundle.css", "src/components/console/console.css"]) {
        const css = noComments(read(file));
        for (const m of css.matchAll(/([^{};]+)\{[^{}]*(?<!\()backdrop-filter/g)) sel.push(m[1].trim());
    }
    const all = sel.join(" ");
    for (const never of ["kx-panel", "kx-row", "kx-slide", "kx-verse", "kx-mon-screen", "kx-win", "win-body", "ks-"]) {
        assert.ok(!all.includes(never), `no glass on ${never}`);
    }
    for (const floats of ["kx-pop", "kx-pill", "kx-mon-badge", "kx-toast", "palette", "win-scrim"]) {
        assert.ok(all.includes(floats), `${floats} is glass`);
    }
});

test("the outputs never blur: the renderer's stylesheets have no backdrop-filter", () => {
    const dir = "src/components/screen";
    for (const f of fs.readdirSync(path.join(root, dir)).filter((n) => n.endsWith(".css"))) {
        assert.doesNotMatch(noComments(read(`${dir}/${f}`)), /backdrop-filter/, `${dir}/${f}`);
    }
});
