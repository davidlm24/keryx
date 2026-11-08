import { test } from "node:test";
import assert from "node:assert/strict";
import { letterbox, nudgeRate, clipRate, createTapGate, NUDGE_MAX, NUDGE_DEAD } from "./screenStage.js";

test("letterbox: a 4:3 iPad gets bars above and below, never a cut picture", () => {
    assert.deepEqual(letterbox(1024, 768), { width: 1024, height: 576, left: 0, top: 96 });
});

test("letterbox: a 16:9 TV is the whole screen", () => {
    assert.deepEqual(letterbox(1920, 1080), { width: 1920, height: 1080, left: 0, top: 0 });
});

test("letterbox: wider than 16:9 gets bars at the sides", () => {
    assert.deepEqual(letterbox(2560, 1080), { width: 1920, height: 1080, left: 320, top: 0 });
});

test("letterbox: an upright tablet and odd sizes stay inside the screen, 16:9", () => {
    const box = letterbox(810, 1080);
    assert.equal(box.width, 810);
    assert.equal(box.height, 455);
    assert.equal(box.top, 312);
    const odd = letterbox(1366, 1023);
    assert.ok(odd.width <= 1366 && odd.height <= 1023);
    assert.ok(Math.abs(odd.width / odd.height - 16 / 9) < 0.01);
});

test("letterbox: no size yet = nothing", () => {
    assert.deepEqual(letterbox(0, 768), { width: 0, height: 0, left: 0, top: 0 });
    assert.deepEqual(letterbox(undefined, NaN), { width: 0, height: 0, left: 0, top: 0 });
});

test("nudgeRate: in step (the dead band) is exactly 1", () => {
    assert.equal(nudgeRate(0), 1);
    assert.equal(nudgeRate(NUDGE_DEAD), 1);
    assert.equal(nudgeRate(-NUDGE_DEAD), 1);
    assert.equal(nudgeRate(NaN), 1);
});

test("nudgeRate: behind plays faster, ahead slower, proportionally", () => {
    assert.equal(nudgeRate(-0.1), 1.025);
    assert.equal(nudgeRate(0.1), 0.975);
    assert.ok(nudgeRate(-0.08) < nudgeRate(-0.12));
});

test("nudgeRate: never past ±4 %, however far (the seek takes the big ones)", () => {
    assert.equal(nudgeRate(-1.4), 1 + NUDGE_MAX);
    assert.equal(nudgeRate(1.4), 1 - NUDGE_MAX);
    assert.equal(nudgeRate(-30), 1.04);
});

const T0 = 1_000_000;
const PB = { paused: false, position: 10, at: T0, volume: 1 };
const clip = (o) => ({ currentTime: 12, paused: false, duration: 120, ...o });

test("clipRate: a clip half a second behind the shared time catches up a little faster", () => {
    assert.equal(clipRate(clip({ currentTime: 11.5 }), PB, T0 + 2000), 1.04);
    assert.equal(clipRate(clip({ currentTime: 11.9 }), PB, T0 + 2000), 1.025);
    assert.equal(clipRate(clip({ currentTime: 12.2 }), PB, T0 + 2000), 0.96, "ahead: a little slower, at most 4 %");
});

test("clipRate: 1 in step, paused, past the tolerance (seek), at the end", () => {
    assert.equal(clipRate(clip({ currentTime: 12.03 }), PB, T0 + 2000), 1);
    assert.equal(clipRate(clip({ paused: true, currentTime: 11 }), PB, T0 + 2000), 1);
    assert.equal(clipRate(clip({ currentTime: 11 }), { ...PB, paused: true }, T0 + 2000), 1);
    assert.equal(clipRate(clip({ currentTime: 9 }), PB, T0 + 2000), 1);
    assert.equal(clipRate(clip({ currentTime: 119.5 }), PB, T0 + 200000), 1);
    assert.equal(clipRate(clip(), null, T0), 1);
});

test("clipRate: a loop compares within the clip", () => {
    assert.equal(clipRate(clip({ currentTime: 89.5 }), PB, T0 + 200000, { loop: true }), 1.04);
});

test("tap gate: shows while a refused player waits, the tap hands back every retry", () => {
    const gate = createTapGate();
    let calls = 0;
    gate.subscribe(() => { calls += 1; });
    assert.equal(gate.needed(), false);
    const a = () => "a";
    const b = () => "b";
    gate.refused(a);
    const dropB = gate.refused(b);
    assert.equal(gate.needed(), true);
    dropB();
    assert.deepEqual(gate.start(), [a]);
    assert.equal(gate.needed(), false);
    assert.equal(gate.started, true);
    assert.ok(calls >= 3);
});

test("tap gate: once per load — after the tap it never shows again", () => {
    const gate = createTapGate();
    gate.refused(() => {});
    gate.start();
    gate.refused(() => {});
    assert.equal(gate.needed(), false);
    assert.deepEqual(gate.start(), []);
});

test("tap gate: a player that leaves stops waiting", () => {
    const gate = createTapGate();
    const drop = gate.refused(() => {});
    drop();
    drop();
    assert.equal(gate.needed(), false);
});
