const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { notesText } = require("./updater.cjs");

// Every docs/release-notes/<version>.md fits what the update popup and the
// bell show (notesText keeps 1 200 characters and cuts the rest), so a note
// never reaches the operator cut off. The release session writes one per
// version before publishing (docs/release-notes/README.md). The fragments a
// feature leaves for the next note (next/) fit too, and every picture a note
// or a fragment names is in img/ (owner 2026-11-26: a visual change ships
// with its mockup).
const DIR = path.join(__dirname, "..", "docs", "release-notes");
const NEXT = path.join(DIR, "next");
const IMG = path.join(DIR, "img");
const LIMIT = 1200;
const PICTURE = /^[ \t]*!\[[^\]\n]*\]\(([^)\s]+)\)[ \t]*$/gm;

const pictures = (raw) => [...raw.matchAll(PICTURE)].map((m) => m[1]);

test("release notes fit the update popup, and are named by version", () => {
    const files = fs.readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md");
    assert.ok(files.length > 0);
    for (const f of files) {
        assert.match(f, /^\d+\.\d+\.\d+\.md$/, `${f}: name it <versão>.md`);
        const raw = fs.readFileSync(path.join(DIR, f), "utf8");
        const text = notesText(raw);
        assert.ok(text.length > 0, `${f}: empty`);
        assert.ok(!text.endsWith("…") && text.length < LIMIT, `${f}: ${text.length} characters as shown; keep it under ${LIMIT}`);
    }
});

test("the next note's fragments fit, and every picture named is shipped", () => {
    const notes = fs.readdirSync(DIR).filter((f) => f.endsWith(".md") && f !== "README.md").map((f) => path.join(DIR, f));
    const next = fs.existsSync(NEXT) ? fs.readdirSync(NEXT).filter((f) => f.endsWith(".md")).map((f) => path.join(NEXT, f)) : [];
    for (const file of next) {
        const text = notesText(fs.readFileSync(file, "utf8"));
        assert.ok(text.length > 0 && text.length < LIMIT, `${path.basename(file)}: ${text.length} characters as shown`);
    }
    for (const file of [...notes, ...next]) {
        for (const src of pictures(fs.readFileSync(file, "utf8"))) {
            assert.match(src, /^img\/[\w.-]+\.(png|jpg|webp)$/, `${path.basename(file)}: a picture is img/<arquivo>.png`);
            assert.ok(fs.existsSync(path.join(IMG, src.slice(4))), `${path.basename(file)}: ${src} is not in docs/release-notes/img/`);
        }
    }
});

test("a picture never reaches the plain text (update popup, bell)", () => {
    assert.equal(notesText("## O que mudou\n![As anotações](img/x.png)\n- **Palco** novo"), "O que mudou\n• Palco novo");
});
