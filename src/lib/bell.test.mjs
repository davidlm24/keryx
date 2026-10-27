import { test } from "node:test";
import assert from "node:assert/strict";
import { chimeNotes, CHIME_VOLUME } from "./bell.js";

test("the chime: two notes at the church's volume, none when turned off", () => {
    assert.deepEqual(chimeNotes().map((n) => n.gain), [0.35, 0.35], "untouched: as it always was");
    assert.deepEqual(chimeNotes({ volume: 100 }).map((n) => n.freq), [880, 1320]);
    assert.equal(chimeNotes({ volume: 100 })[0].gain, 1);
    assert.equal(chimeNotes({ volume: 1 })[0].gain, 0.05, "never inaudible by accident");
    assert.deepEqual(chimeNotes({ on: false }), []);
    assert.equal(CHIME_VOLUME, 35);
});
