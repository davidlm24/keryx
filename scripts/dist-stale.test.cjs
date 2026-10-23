const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { newestMtime, distStatus } = require("./dist-stale.cjs");

function tree(files) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "keryx-stale-"));
    for (const [rel, seconds] of Object.entries(files)) {
        const full = path.join(root, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, "x");
        fs.utimesSync(full, seconds, seconds);
    }
    return root;
}

test("newestMtime walks subfolders and skips test files", () => {
    const root = tree({ "src/a.js": 100, "src/deep/b.js": 300, "src/deep/b.test.mjs": 900 });
    assert.equal(newestMtime(path.join(root, "src")), 300 * 1000);
});

test("newestMtime of a missing folder is 0", () => {
    assert.equal(newestMtime(path.join(os.tmpdir(), "keryx-no-such-folder")), 0);
});

test("a dist/ newer than src/ and shared/ is fresh", () => {
    const root = tree({ "src/a.js": 100, "shared/b.mjs": 200, "dist/index.html": 500 });
    const status = distStatus(root);
    assert.equal(status.stale, false);
    assert.equal(status.missing, false);
});

test("a source newer than dist/index.html makes it stale", () => {
    const root = tree({ "src/a.js": 100, "shared/b.mjs": 800, "dist/index.html": 500 });
    const status = distStatus(root);
    assert.equal(status.stale, true);
    assert.equal(status.missing, false);
    assert.equal(status.sourceAt, 800 * 1000);
});

test("only a test file newer than dist/ is not stale", () => {
    const root = tree({ "src/a.js": 100, "src/a.test.mjs": 800, "dist/index.html": 500 });
    assert.equal(distStatus(root).stale, false);
});

test("no dist/index.html is stale and missing", () => {
    const root = tree({ "src/a.js": 100 });
    const status = distStatus(root);
    assert.equal(status.stale, true);
    assert.equal(status.missing, true);
});
