const test = require("node:test");
const assert = require("node:assert/strict");
const { seedOps } = require("./liveSeed.cjs");
const { loadLiveRules } = require("./live.cjs");

test("an empty live state takes the church's logo look and idle screen", () => {
    assert.deepEqual(seedOps({}), []);
    assert.deepEqual(seedOps({ logo_corner: "top-left", logo_size: "large", logo_opacity: 0.7 }), [["logo.set", { corner: "top-left", size: "large", opacity: 0.7 }]]);
    assert.deepEqual(seedOps({ idle_mode: "black" }), [["idle.set", { mode: "black" }]]);
    assert.deepEqual(seedOps({ idle_mode: "background", standby_background: "keryx-media://a.png" }), [["idle.set", { mode: "background", url: "keryx-media://a.png" }]]);
    assert.deepEqual(seedOps({ idle_mode: "background" }), [], "no picture: the logo stays");
    assert.deepEqual(seedOps({ logo_corner: "middle", logo_opacity: 1, idle_mode: "logo" }), [], "bad or default values add nothing");
});

test("the seed is valid for the live-state rules", async () => {
    const rules = await loadLiveRules();
    let s = rules.emptyState(1);
    for (const [op, args] of seedOps({ logo_corner: "top-right", logo_size: "small", logo_opacity: 0.4, idle_mode: "black" })) s = rules.applyOp(s, op, args, 1);
    assert.deepEqual([s.logo.corner, s.logo.size, s.logo.opacity, s.idle], ["top-right", "small", 0.4, "black"]);
    assert.equal(s.logo.visible, false, "the logo is not put on air");
});

test("the Tela ociosa's look rides the seed, the church's name written in", async () => {
    const rules = await loadLiveRules();
    const ops = seedOps({ idle_mode: "black", church_name: "Igreja de exemplo", idle_look: { bg: "color", color: "#112233", logo: "l", phrase: "church", text: "Seja bem-vindo" } });
    assert.equal(ops.at(-1)[0], "idle.look", "last, after the mode");
    let s = rules.emptyState(1);
    for (const [op, args] of ops) s = rules.applyOp(s, op, args, 1);
    assert.deepEqual([s.idle, s.idleLook.color, s.idleLook.logo, s.idleLook.text], ["black", "#112233", "l", "Igreja de exemplo"]);
    assert.deepEqual(seedOps({ idle_look: null }), []);
});
