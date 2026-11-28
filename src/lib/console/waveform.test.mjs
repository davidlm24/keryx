import test from "node:test";
import assert from "node:assert/strict";
import { leadSilence, leadStart, LEAD_PRE, LEAD_MIN } from "./waveform.js";

const RATE = 8000;
// Seconds of silence, then a tone; a noise floor or a click may lie over it.
function track({ silence = 2, tone = 1, amp = 0.5, noise = 0, click = null, seconds = 4 } = {}) {
    const n = RATE * seconds;
    const out = new Float32Array(n);
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647 - 0.5; };
    for (let i = 0; i < n; i++) {
        const t = i / RATE;
        if (noise) out[i] = rnd() * 2 * noise;
        if (t >= silence && t < silence + tone) out[i] += amp * Math.sin(2 * Math.PI * 440 * t);
    }
    if (click !== null) out[Math.round(click * RATE)] = 0.9;
    return out;
}
const near = (a, b, tol = 0.02) => assert.ok(Math.abs(a - b) <= tol, String(a) + " is not about " + String(b));

test("leadSilence: where the sound starts (2026-11-28, Achar o som)", () => {
    near(leadSilence([track()], RATE), 2);
    // A click in the silence is one window: it does not count.
    near(leadSilence([track({ click: 0.5 })], RATE), 2);
    // A noise floor under the threshold stays silence.
    near(leadSilence([track({ noise: 0.001 })], RATE), 2);
    // A quiet track has a threshold of its own.
    near(leadSilence([track({ amp: 0.02 })], RATE), 2);
    // The sound in one channel only.
    near(leadSilence([new Float32Array(RATE * 4), track({ silence: 1.5 })], RATE), 1.5);
    // Already starting with sound; a mute file; silence past the search.
    near(leadSilence([track({ silence: 0 })], RATE), 0);
    assert.equal(leadSilence([new Float32Array(RATE * 4)], RATE), null);
    assert.equal(leadSilence([track({ silence: 3 })], RATE, { within: 2 }), null);
    assert.equal(leadSilence([], RATE), null);
});

test("leadStart: a little before the sound, or why not", () => {
    assert.deepEqual(leadStart(2), { at: 2 - LEAD_PRE });
    assert.ok(leadStart(LEAD_MIN - 0.01).why.includes("já começa"));
    assert.ok(leadStart(null).why);
});
