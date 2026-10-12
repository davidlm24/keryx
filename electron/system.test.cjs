const test = require("node:test");
const assert = require("node:assert/strict");
const { cachedSize } = require("./system.cjs");

test("the data folder is measured at most once a minute", () => {
    let walks = 0;
    const size = cachedSize(() => { walks += 1; return 100 * walks; }, 60000);
    assert.equal(size("/data", 0), 100);
    assert.equal(size("/data", 30000), 100, "within the minute: the last figure");
    assert.equal(walks, 1);
    assert.equal(size("/data", 61000), 200, "after it: measured again");
    assert.equal(size("/other", 61000), 300, "each folder on its own");
    assert.equal(walks, 3);
});
