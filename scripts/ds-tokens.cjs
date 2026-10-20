#!/usr/bin/env node
// Writes docs/design-system/tokens.css from docs/design-system/tokens.json,
// the design system's one source (Rodada DS3). Run after changing a token:
// npm run ds:tokens. npm test fails when tokens.css is not what this writes
// (src/lib/designTokens.test.mjs), as schema.json does for the entities.
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const JSON_FILE = path.join(root, "docs", "design-system", "tokens.json");
const CSS_FILE = path.join(root, "docs", "design-system", "tokens.css");

// The colours and the shadows (which carry colours) belong to the theme; the
// rest is the same in any theme. KERYX has one theme, dark.
function compileTokens(json) {
    const line = (t) => `  --${t.name}: ${t.value};`;
    const themed = [json.color, json.shadow].flatMap((g) => g.tokens.map(line));
    const plain = [json.spacing, json.radius, json.timing, json.opacity, json.layer, json.type.scale].flatMap((g) => g.tokens.map(line));
    for (const [family, value] of Object.entries(json.type.families)) plain.push(`  --font-${family}: ${value};`);
    return [
        "/* KERYX — generated from tokens.json by scripts/ds-tokens.cjs (npm run ds:tokens). Never edit by hand. */",
        ':root, [data-theme="dark"] {',
        ...themed,
        "}",
        ":root {",
        ...plain,
        "}",
        "",
    ].join("\n");
}

// tokens.json's own layout: one token (an object of plain values with a
// name) per line, everything else indented by two. `--format` rewrites the
// file in it, after a script has edited the tokens.
const flat = (v) => v && typeof v === "object" && !Array.isArray(v) && Object.values(v).every((x) => x === null || typeof x !== "object");
const inline = (o) => (Object.keys(o).length ? `{ ${Object.entries(o).map(([k, x]) => `${JSON.stringify(k)}: ${JSON.stringify(x)}`).join(", ")} }` : "{}");
function formatTokens(v, pad = "") {
    const inner = pad + "  ";
    if (Array.isArray(v)) {
        if (!v.length) return "[]";
        if (v.length === 1 && flat(v[0])) return `[${inline(v[0])}]`;
        return `[\n${v.map((x) => inner + formatTokens(x, inner)).join(",\n")}\n${pad}]`;
    }
    if (v && typeof v === "object") {
        if (flat(v) && pad && ("name" in v || Object.keys(v).length === 1)) return inline(v);
        return `{\n${Object.entries(v).map(([k, x]) => `${inner}${JSON.stringify(k)}: ${formatTokens(x, inner)}`).join(",\n")}\n${pad}}`;
    }
    return JSON.stringify(v);
}

const formatJson = (json) => formatTokens(json) + "\n";

module.exports = { compileTokens, formatJson, JSON_FILE, CSS_FILE };

if (require.main === module) {
    const json = JSON.parse(fs.readFileSync(JSON_FILE, "utf8"));
    if (process.argv.includes("--format")) fs.writeFileSync(JSON_FILE, formatJson(json));
    const css = compileTokens(json);
    fs.writeFileSync(CSS_FILE, css);
    console.log(`Wrote ${path.relative(root, CSS_FILE)}: ${(css.match(/^ {2}--/gm) || []).length} tokens`);
}
