import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Every file the operator picks is copied through uploadFile (mediaImport.js),
// which refuses a video that may freeze on the screens (Rodada O, O11 = B).
// Only these call the copy directly: that door itself, the stills and pages
// KERYX draws (never a video) and a font file.
const DIRECT = new Set(["lib/mediaImport.js", "lib/mediaPosterCapture.js", "lib/pdfPagesCapture.js", "components/editor/FontPicker.jsx"]);

const src = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "ui" ? [] : files(p);
    return /\.(jsx?|mjs)$/.test(e.name) && !/\.test\./.test(e.name) ? [p] : [];
});

test("every upload of a picked file goes through uploadFile", () => {
    const calls = files(src).filter((p) => /Core\.UploadFile\s*\(/.test(fs.readFileSync(p, "utf8"))).map((p) => path.relative(src, p).split(path.sep).join("/"));
    const stray = calls.filter((p) => !DIRECT.has(p));
    assert.deepEqual(stray, [], "copy with uploadFile from @/lib/mediaImport (it refuses a video in HEVC…)");
    for (const p of DIRECT) assert.ok(calls.includes(p), `${p} no longer copies directly: take it off the list`);
});
