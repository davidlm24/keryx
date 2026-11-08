import test from "node:test";
import assert from "node:assert/strict";
import { newNotice, noticeTime, noticeLeft, fileAt, clockOf, noticeLabel } from "./notice.js";

test("countdown and cronômetro times", () => {
    const c = newNotice("countdown");
    assert.equal(c.duration, 300);
    assert.equal(clockOf(noticeTime(c, 61_000)), "03:59");
    assert.equal(noticeTime(c, 400_000), 0, "a countdown stops at zero");
    assert.equal(noticeTime({ type: "timer", duration: 0 }, 75_000), 75_000);
    assert.equal(noticeTime({ type: "timer", duration: 60 }, 75_000), 60_000);
    assert.equal(noticeTime({ type: "announcement", duration: 20 }, 5_000), null);
    assert.equal(noticeLeft({ type: "announcement", duration: 20 }, 5_000), 15_000);
    assert.equal(noticeLeft({ type: "timer", duration: 0 }, 5_000), null, "no duration: never ends");
    assert.equal(clockOf(3_725_000), "01:02:05");
    assert.equal(noticeLabel("attention"), "Chamar atenção");
    assert.equal(newNotice("attention").sound_alert, true);
});

test("background files on a loop, the same on every screen", () => {
    const files = [{ url: "a.jpg", type: "image" }, { url: "b.mp4", type: "video", duration: 10 }, { url: "m.mp3", type: "audio" }, { url: "c.jpg", type: "image", duration: 3 }];
    assert.equal(fileAt(files, 0).file.url, "a.jpg");
    assert.equal(fileAt(files, 4_999).file.url, "a.jpg");
    const v = fileAt(files, 7_000);
    assert.equal(v.file.url, "b.mp4");
    assert.equal(v.offsetMs, 2_000);
    assert.equal(fileAt(files, 16_000).file.url, "c.jpg", "audio files are not part of the picture loop");
    assert.equal(fileAt(files, 18_000).file.url, "a.jpg", "18 s = one full loop");
    assert.equal(fileAt([], 1000), null);
});
