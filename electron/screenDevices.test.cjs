const test = require("node:test");
const assert = require("node:assert/strict");
const { createScreens, normalizeScreens, cleanName, validId, MAX_SCREENS } = require("./screenDevices.cjs");

const PAGES = ["/Projection", "/StageView", "/PastorView"];
const ID = "a1b2c3d4e5f6a7b8";

function fixture(start = Date.parse("2026-11-15T19:00:00Z")) {
    let t = start;
    const box = { saved: {}, writes: 0 };
    const screens = createScreens({ load: () => box.saved, save: (m) => { box.saved = m; box.writes += 1; }, pages: PAGES, now: () => t });
    return { screens, box, tick: (ms) => { t += ms; } };
}

test("ids: letters and digits only, 12 to 32", () => {
    assert.ok(validId(ID));
    for (const bad of ["", "short", "a".repeat(33), "ABC-def-123456", "../../etc/passwd", null, 42]) assert.ok(!validId(bad), String(bad));
});

test("a page chosen from the console is kept, only among the screens' pages", () => {
    const { screens, box } = fixture();
    assert.equal(screens.setPage(ID, "/StageView").page, "/StageView");
    assert.equal(box.saved[ID].page, "/StageView");
    assert.equal(screens.setPage(ID, "/Console").page, "", "a page the network does not serve is no choice");
    assert.equal(screens.setPage(ID, "/").page, "", "the start page = none");
    assert.equal(screens.setPage("bad id", "/StageView"), null);
});

test("names: one line, 40 characters at most; kept with the page", () => {
    const { screens } = fixture();
    screens.setPage(ID, "/Projection");
    assert.equal(screens.rename(ID, "  TV\ndo   palco  ").name, "TV do palco");
    assert.equal(screens.get(ID).page, "/Projection", "renaming keeps the page");
    assert.equal(cleanName("x".repeat(60)).length, 40);
});

test("seen: a new screen is saved at once, then at most every 10 minutes; flush writes the rest", () => {
    const { screens, box, tick } = fixture();
    screens.seen(ID);
    assert.ok(box.saved[ID], "a new screen is remembered");
    const writes = box.writes;
    tick(60_000);
    screens.seen(ID);
    assert.equal(box.writes, writes, "a minute later: memory only");
    screens.flush();
    assert.equal(box.writes, writes + 1);
    tick(11 * 60_000);
    screens.seen(ID);
    assert.equal(box.writes, writes + 2, "past 10 minutes: saved");
});

test("normalizeScreens: bad rows, unknown pages and stale screens go; 30 at most", () => {
    const now = Date.parse("2026-11-15T19:00:00Z");
    const pages = new Set(PAGES);
    const old = new Date(now - 200 * 86400000).toISOString();
    const out = normalizeScreens({ [ID]: { name: "TV", page: "/Console", lastSeen: new Date(now).toISOString() }, bad: { name: "x" }, b1b2c3d4e5f6a7b8: { page: "/StageView", lastSeen: old } }, pages, now);
    assert.deepEqual(Object.keys(out), [ID]);
    assert.equal(out[ID].page, "");
    const many = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`screen${String(i).padStart(8, "0")}`, { lastSeen: new Date(now - i * 1000).toISOString() }]));
    assert.equal(Object.keys(normalizeScreens(many, pages, now)).length, MAX_SCREENS);
    assert.deepEqual(normalizeScreens(["x"], pages, now), {});
});
