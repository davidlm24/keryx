import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { ICON_NODES, ICON_NAMES, STROKE, iconNode, iconMarkup, strokeFor } from "./icons.js";
import { NOTICE_TYPES, noticeIcon } from "./console/notice.js";
import { mediaIcon } from "./console/libraryRows.js";
import { typeIcon } from "./console/setlist.js";

const SRC = fileURLToPath(new URL("..", import.meta.url));

// Every .js/.jsx/.mjs under src/, but the generated shadcn folder (it draws
// lucide-react itself) and the tests.
function sources(dir = SRC, out = []) {
    for (const f of readdirSync(dir)) {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) {
            if (relative(SRC, p).replace(/\\/g, "/") !== "components/ui") sources(p, out);
        } else if (/\.(jsx?|mjs)$/.test(f) && !/\.test\.mjs$/.test(f)) out.push(p);
    }
    return out;
}

// The strings an expression can evaluate to: itself, or a ternary's / a
// fallback's branches — never the operands of a comparison (grid === "small").
const results = (s) => [...s.matchAll(/(?:^|\?|:|\|\||&&)\s*["']([a-z][a-z0-9-]*)["']/g)].map((m) => m[1]);

// The icon names the code writes: <Icon name="…" / name={a ? "…" : "…"}>,
// icon: "…" / icon="…" / icon={…} (the models and props that end in an
// Icon), iconSvg("…"), and the *_ICON / *_GLYPH tables.
function namesIn(text) {
    const found = [];
    for (const [tag] of text.matchAll(/<Icon\b[^>]*>/g)) {
        for (const m of tag.matchAll(/\bname=(?:"([^"]+)"|\{([^}]*)\})/g)) found.push(...(m[1] ? [m[1]] : results(m[2].trim())));
    }
    // icon="…" and icon={…} (props), icon: … (models, to the end of the value).
    for (const m of text.matchAll(/\bicon=(?:"([^"]+)"|\{([^}]*)\})/g)) found.push(...(m[1] ? [m[1]] : results(m[2].trim())));
    for (const m of text.matchAll(/\bicon:\s*([^,;\n}]*)/g)) found.push(...results(m[1].trim()));
    for (const m of text.matchAll(/\biconSvg\(\s*["']([^"']+)["']/g)) found.push(m[1]);
    for (const m of text.matchAll(/\bconst [A-Z_]*(?:ICON|GLYPH)S?\s*=\s*\{([\s\S]*?)\};/g)) {
        for (const v of m[1].matchAll(/:\s*["']([a-z][a-z0-9-]*)["']/g)) found.push(v[1]);
    }
    return found;
}

test("every icon name the code uses is mapped", () => {
    const missing = [];
    let count = 0;
    for (const file of sources()) {
        for (const name of namesIn(readFileSync(file, "utf8"))) {
            count += 1;
            if (!iconNode(name)) missing.push(`${relative(SRC, file)}: ${name}`);
        }
    }
    assert.ok(count > 200, `the scan found only ${count} names; did the patterns break?`);
    assert.deepEqual(missing, []);
});

test("the computed names are mapped (avisos, media, setlist types)", () => {
    for (const [type] of NOTICE_TYPES) assert.ok(iconNode(noticeIcon(type)), type);
    assert.ok(iconNode(noticeIcon("nope")));
    for (const type of ["video", "image", "gif", "pdf", "powerpoint", "audio", "other", undefined]) assert.ok(iconNode(mediaIcon({ type })), String(type));
    assert.ok(iconNode(mediaIcon({ type: "video", file_url: "https://youtu.be/x" })));
    for (const type of ["SONG", "BIBLE", "TEXT", "NOTICE", "MEDIA", "SECTION", "nope"]) assert.ok(iconNode(typeIcon(type)), type);
});

test("the 74 names, each a node of [tag, attrs]", () => {
    assert.equal(ICON_NAMES.length, 74);
    for (const [name, node] of Object.entries(ICON_NODES)) {
        assert.ok(Array.isArray(node) && node.length > 0, name);
        for (const el of node) {
            assert.ok(["path", "circle", "rect", "line", "polyline", "polygon", "ellipse"].includes(el[0]), `${name}: ${el[0]}`);
            assert.equal(typeof el[1], "object", name);
        }
    }
    assert.equal(iconNode("nope"), null);
    assert.equal(iconNode("toString"), null);
});

test("one stroke, one pixel at any size", () => {
    assert.equal(STROKE, 1.5);
    assert.equal(strokeFor(16), "1.5");
    assert.equal(strokeFor(12), "2");
    assert.equal(strokeFor(32), "0.75");
});

test("the markup for the drag ghost", () => {
    const svg = iconMarkup("unlock", 14);
    assert.match(svg, /^<svg class="kx-i" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.71"/);
    assert.match(svg, /<rect [^>]*\/><path d="M7 11V7a5 5 0 0 1 9.9-1"\/><\/svg>$/);
    assert.equal(iconMarkup("nope"), "");
});
