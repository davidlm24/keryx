import test from "node:test";
import assert from "node:assert/strict";
import { createPool } from "./mediaPool.js";

// A pool with fake elements and hand-run task and timer queues.
function setup() {
    const tasks = [];
    const timers = [];
    const disposed = [];
    let made = 0;
    const pool = createPool({
        create: (url) => ({ url, n: ++made, paused: false, attached: true, pause() { this.paused = true; }, remove() { this.attached = false; } }),
        dispose: (el) => disposed.push(el),
        afterTask: (fn) => tasks.push(fn),
        later: (fn) => timers.push(fn),
        graceMs: 5000,
    });
    const endTask = () => tasks.splice(0).forEach((fn) => fn());
    const endGrace = () => timers.splice(0).forEach((fn) => fn());
    return { pool, endTask, endGrace, disposed, made: () => made };
}

test("an element let go and taken back in the same task is the same one, never paused", () => {
    const { pool, endTask, endGrace, disposed } = setup();
    const a = pool.claim("v.mp4");
    pool.release(a); // the media layer's player unmounts…
    const b = pool.claim("v.mp4"); // …and the audio channel's takes it, same commit
    endTask();
    endGrace();
    assert.equal(b, a);
    assert.equal(a.paused, false);
    assert.deepEqual(disposed, []);
});

test("two players of the same file at once get their own element", () => {
    const { pool, made } = setup();
    const a = pool.claim("v.mp4");
    const b = pool.claim("v.mp4");
    assert.notEqual(a, b);
    assert.equal(made(), 2);
});

test("different files never share an element", () => {
    const { pool } = setup();
    const a = pool.claim("a.mp4");
    pool.release(a);
    const b = pool.claim("b.mp4");
    assert.notEqual(a, b);
});

test("an element nobody takes back goes silent after the task and is let go after the grace", () => {
    const { pool, endTask, endGrace, disposed } = setup();
    const a = pool.claim("v.mp4");
    pool.release(a);
    assert.equal(a.attached, false);
    endTask();
    assert.equal(a.paused, true);
    assert.deepEqual(disposed, []);
    endGrace();
    assert.deepEqual(disposed, [a]);
    assert.equal(pool.size(), 0);
    assert.notEqual(pool.claim("v.mp4"), a);
});

test("taken back within the grace (Tela preta for a moment) it is reused, not disposed", () => {
    const { pool, endTask, endGrace, disposed } = setup();
    const a = pool.claim("v.mp4");
    pool.release(a);
    endTask();
    const b = pool.claim("v.mp4");
    endGrace();
    assert.equal(b, a);
    assert.deepEqual(disposed, []);
});

test("an old timer does not dispose an element let go again later", () => {
    const timers = [];
    const disposed = [];
    const pool = createPool({ create: (url) => ({ url, pause() {}, remove() {} }), dispose: (el) => disposed.push(el), afterTask: (fn) => fn(), later: (fn) => timers.push(fn) });
    const a = pool.claim("v.mp4");
    pool.release(a);
    pool.claim("v.mp4");
    pool.release(a);
    timers[0](); // the first release's timer: stale
    assert.deepEqual(disposed, []);
    timers[1]();
    assert.deepEqual(disposed, [a]);
});

test("releasing an element twice or one the pool never gave is ignored", () => {
    const { pool, endTask, endGrace, disposed } = setup();
    const a = pool.claim("v.mp4");
    pool.release(a);
    pool.release(a);
    pool.release({ remove() {} });
    endTask();
    endGrace();
    assert.deepEqual(disposed, [a]);
});
