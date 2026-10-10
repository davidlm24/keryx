const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { notesText } = require("./updater.cjs");

// Every docs/release-notes/<version>.md fits what the update popup and the
// bell show (notesText keeps 1 200 characters and cuts the rest), so a note
// never reaches the operator cut off. The release session writes one per
// version before publishing (docs/release-notes/README.md).
const DIR = path.join(__dirname, "..", "docs", "release-notes");
const LIMIT = 1200;

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
