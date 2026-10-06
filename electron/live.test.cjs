const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLive, loadLiveRules } = require("./live.cjs");

const tempFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keryx-live-")), "live.json");

test("changes are broadcast with serverNow; no-op changes are not", async () => {
    const rules = await loadLiveRules();
    let clock = 5000;
    const live = createLive({ file: tempFile(), rules, now: () => clock, log: () => {} });
    const seen = [];
    const off = live.onChange((s) => seen.push(s));

    const shown = live.call("content.show", { title: "Hino", slides: ["a", "b"] });
    assert.equal(shown.rev, 1);
    assert.equal(shown.serverNow, 5000);
    clock = 6000;
    live.call("content.goTo", { index: 1 });
    const same = live.call("content.goTo", { index: 1 });
    assert.equal(same.rev, 2, "no change returns the current document");
    assert.equal(seen.length, 2);
    assert.equal(seen[1].content.index, 1);
    assert.equal(live.get().serverNow, 6000);

    off();
    live.call("clear");
    assert.equal(seen.length, 2, "unsubscribed");
    assert.throws(() => live.call("content.next"), (e) => e.status === 409);
    assert.throws(() => live.call("nope"), /Operação desconhecida/);
    assert.equal(live.get().rev, 3, "a refused op changes nothing");
});

test("saved to disk and restored black after a restart", async () => {
    const rules = await loadLiveRules();
    const file = tempFile();
    const live = createLive({ file, rules, log: () => {}, saveDelayMs: 10 });
    live.call("content.show", { title: "Hino", slides: ["a", "b", "c"], index: 2 });
    live.call("alert.show", { message: "Aviso" });
    await new Promise((r) => setTimeout(r, 50));
    assert.ok(fs.existsSync(file), "debounced save happened");
    live.call("content.prev");
    live.flush();

    const again = createLive({ file, rules, log: () => {} });
    const s = again.get();
    assert.equal(s.screen, "black");
    assert.equal(s.content.index, 1);
    assert.equal(s.alert.message, "Aviso");
    assert.equal(s.rev, 3);
    assert.equal(fs.existsSync(`${file}.tmp`), false);
});

test("a corrupt or missing file starts empty; a huge document is refused", async () => {
    const rules = await loadLiveRules();
    const file = tempFile();
    fs.writeFileSync(file, "{ not json");
    const logs = [];
    const live = createLive({ file, rules, log: (m) => logs.push(m) });
    assert.equal(live.get().rev, 0);
    assert.equal(live.get().screen, "show");
    assert.match(logs[0], /ilegível/);
    assert.equal(createLive({ file: tempFile(), rules, log: () => logs.push("x") }).get().rev, 0);
    assert.equal(logs.length, 1, "a missing file is not an error");

    const big = Array.from({ length: 1000 }, () => "x".repeat(10000));
    assert.throws(() => live.call("content.show", { slides: big }), (e) => e.status === 413);
    assert.equal(live.get().content, null);
});
