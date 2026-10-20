import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// The design system's tokens (docs/design-system/tokens.css) share the page
// with every other stylesheet, the shadcn theme in src/index.css included,
// which loads last. A token name defined again elsewhere silently wins: the
// shadow --popover met shadcn's HSL --popover and every box-shadow that read
// it computed to none (audit C-04: the Camadas drawer and the Desfazer toast
// lost their edge). So a name tokens.css defines is defined nowhere else,
// unless it is one of the deliberate local overrides below.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const TOKENS = "docs/design-system/tokens.css";

// file › selector › token: overrides on purpose, each with its reason.
const OVERRIDES = {
    "src/components/console/console.css › .console › --gutter": "the console's one 6 px gutter (owner 2026-10-13)",
};

// Every custom property a stylesheet declares, with the rule it sits in.
// Comments become spaces (line numbers stay), strings are copied whole.
function customProps(css) {
    const src = css.replace(/\/\*[\s\S]*?\*\//g, (c) => c.replace(/[^\n]/g, " "));
    const out = [];
    const rules = [];
    let buf = "";
    let start = 0;
    for (let i = 0; i < src.length; i++) {
        const ch = src[i];
        if (ch === '"' || ch === "'") {
            let end = src.indexOf(ch, i + 1);
            if (end < 0) end = src.length - 1;
            buf += src.slice(i, end + 1);
            i = end;
        } else if (ch === "{") {
            rules.push(buf.trim().replace(/\s+/g, " "));
            buf = "";
            start = i + 1;
        } else if (ch === ";" || ch === "}") {
            const m = /^(\s*)(--[\w-]+)\s*:\s*([\s\S]*?)\s*$/.exec(buf);
            if (m) {
                const line = src.slice(0, start + m[1].length).split("\n").length;
                out.push({ name: m[2], value: m[3].replace(/\s+/g, " "), rule: rules.at(-1) ?? "", line });
            }
            if (ch === "}") rules.pop();
            buf = "";
            start = i + 1;
        } else {
            buf += ch;
        }
    }
    return out;
}

function stylesheets(dir) {
    return fs.readdirSync(path.join(root, dir), { recursive: true })
        .filter((f) => f.endsWith(".css"))
        .map((f) => path.posix.join(dir, f.split(path.sep).join("/")));
}

const tokens = new Map(customProps(read(TOKENS)).map((d) => [d.name, d.value]));

test("the parser reads custom properties inside nested rules, not comments", () => {
    const found = customProps(`/* --x: 1; */\n@layer base {\n  :root { --a: 1px; --b: "x;y" }\n}\n.k{--c:0 0 0 1px #000}`);
    assert.deepEqual(found.map((d) => [d.name, d.value, d.rule, d.line]), [
        ["--a", "1px", ":root", 3],
        ["--b", '"x;y"', ":root", 3],
        ["--c", "0 0 0 1px #000", ".k", 5],
    ]);
});

test("tokens.css is the compile of tokens.json, name for name and value for value", () => {
    const json = JSON.parse(read("docs/design-system/tokens.json"));
    // The type scale and the layers since Rodada DS2; tokens.css is still
    // kept by hand, so this is what holds the two together until DS3.
    const groups = [json.color, json.spacing, json.radius, json.shadow, json.timing, json.opacity, json.type.scale, json.layer];
    const expected = groups.flatMap((g) => g.tokens.map((t) => [`--${t.name}`, t.value]));
    for (const [family, value] of Object.entries(json.type.families)) expected.push([`--font-${family}`, value]);
    for (const [name, value] of expected) assert.equal(tokens.get(name), value, `${name} in tokens.css`);
    assert.equal(tokens.size, expected.length, "tokens.css defines nothing tokens.json lacks");
});

test("the floaters' shadow has a name of its own, apart from shadcn's --popover colour", () => {
    assert.match(tokens.get("--shadow-popover"), /^0 0 0 1px /);
    assert.equal(tokens.has("--popover"), false);
    const consumers = stylesheets("src").concat(stylesheets("docs/design-system/components"))
        .filter((f) => /box-shadow:\s*var\(--shadow-popover\)/.test(read(f)));
    assert.ok(consumers.includes("src/components/console/console.css"), "the console's floaters wear it");
});

test("no stylesheet redefines a design-system token", () => {
    const sheets = stylesheets("src").concat(stylesheets("docs/design-system/components"));
    assert.ok(sheets.includes("src/index.css") && sheets.includes("src/components/console/console.css"));
    const clashes = [];
    for (const file of sheets) {
        for (const d of customProps(read(file))) {
            if (!tokens.has(d.name) || d.value === tokens.get(d.name)) continue;
            if (OVERRIDES[`${file} › ${d.rule} › ${d.name}`]) continue;
            clashes.push(`${file}:${d.line} ${d.rule} { ${d.name}: ${d.value} } (tokens.css: ${tokens.get(d.name)})`);
        }
    }
    assert.deepEqual(clashes, [], "rename one of them, or list a deliberate local override in OVERRIDES");
});
