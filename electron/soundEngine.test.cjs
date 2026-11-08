"use strict";
const test = require("node:test");
const assert = require("node:assert");
const { EventEmitter } = require("node:events");
const { createSoundEngine, ROUTE } = require("./soundEngine.cjs");

// A BrowserWindow that records what it was made with.
function fakeWindows() {
    const made = [];
    class Win extends EventEmitter {
        constructor(opts) {
            super();
            this.opts = opts;
            this.destroyed = false;
            this.webContents = new EventEmitter();
            this.loaded = null;
            made.push(this);
        }
        loadURL(url) { this.loaded = url; return Promise.resolve(); }
        isDestroyed() { return this.destroyed; }
        destroy() { if (this.destroyed) return; this.destroyed = true; this.emit("closed"); }
    }
    return { Win, made };
}
const quiet = { warn() {}, error() {} };

function engine(extra = {}) {
    const { Win, made } = fakeWindows();
    const timers = [];
    let t = 0;
    const e = createSoundEngine({
        BrowserWindow: Win, url: `http://127.0.0.1:7700${ROUTE}`, webPreferences: { sandbox: true }, log: quiet,
        now: () => t, schedule: (fn) => { timers.push(fn); return timers.length; }, ...extra,
    });
    const tick = () => { const fns = timers.splice(0); fns.forEach((fn) => fn()); };
    return { e, made, tick, advance: (ms) => { t += ms; } };
}

test("sound engine: one hidden window, never focusable, no taskbar button, on /Som", () => {
    const { e, made } = engine();
    const w = e.start();
    assert.equal(made.length, 1);
    assert.equal(w.loaded, "http://127.0.0.1:7700/Som");
    assert.equal(w.opts.show, false);
    assert.equal(w.opts.focusable, false);
    assert.equal(w.opts.skipTaskbar, true);
    assert.deepEqual(w.opts.webPreferences, { sandbox: true });
    // Starting again keeps the one there is.
    assert.equal(e.start(), w);
    assert.equal(made.length, 1);
    assert.equal(e.window(), w);
    assert.ok(e.isEngine(w));
});

test("sound engine: made again when its page dies or its window goes", () => {
    const { e, made, tick } = engine();
    const w = e.start();
    w.webContents.emit("render-process-gone", {}, { reason: "crashed" });
    assert.equal(e.window(), null);
    tick();
    assert.equal(made.length, 2);
    assert.equal(e.window(), made[1]);
    made[1].destroy(); // closed by someone else (the smoke closes every window)
    tick();
    assert.equal(made.length, 3);
});

test("sound engine: gives up after too many restarts in a minute, tries again later", () => {
    const { e, made, tick, advance } = engine({ maxRestarts: 2, windowMs: 60_000 });
    e.start();
    made[0].destroy(); tick();
    made[1].destroy(); tick();
    made[2].destroy(); tick();
    assert.equal(made.length, 3); // the third death is not followed
    assert.equal(e.window(), null);
    advance(61_000);
    e.start();
    assert.equal(made.length, 4);
});

test("sound engine: stop ends it for good", () => {
    const { e, made, tick } = engine();
    e.start();
    e.stop();
    tick();
    assert.equal(made.length, 1);
    assert.ok(made[0].isDestroyed());
    assert.equal(e.start(), null);
    assert.equal(made.length, 1);
});
