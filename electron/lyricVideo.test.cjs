const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { segments, fadePlan, ffmpegArgs, mediaPathOf, fileNameFor } = require("./lyricVideo.cjs");

test("segments: the background before the first mark, each slide to the next, the last to the end", () => {
    assert.deepEqual(segments([12, 20, 30], 40), [
        { frame: "bg", from: 0, to: 12 },
        { frame: 0, from: 12, to: 20 },
        { frame: 1, from: 20, to: 30 },
        { frame: 2, from: 30, to: 40 },
    ]);
    assert.deepEqual(segments([0, 10], 25), [{ frame: 0, from: 0, to: 10 }, { frame: 1, from: 10, to: 25 }], "a song that starts on its first slide has no background frame");
    assert.deepEqual(segments([5, null, 15], 20).map((s) => s.frame), ["bg", 0, 2], "a slide with no start is left out");
    assert.deepEqual(segments([5, 50], 30).map((s) => s.frame), ["bg", 0], "a start past the end is left out");
    assert.deepEqual(segments([], 10), [{ frame: "bg", from: 0, to: 10 }]);
    assert.deepEqual(segments([1, 2], 0), []);
});

test("fadePlan: every slide fully in half a fade after its mark, the whole lasting the song", () => {
    const segs = segments([10, 20], 30);
    const p = fadePlan(segs, 0.4);
    assert.equal(p.fade, 0.4);
    assert.deepEqual(p.offsets, [null, 9.8, 19.8]);
    // The stream after each xfade: offset + the next input's length; the last ends at 30.
    assert.ok(Math.abs(p.offsets[2] + p.lens[2] - 30) < 1e-9);
    // Each input is long enough for the fade that leaves it.
    assert.ok(Math.abs(p.lens[0] - (p.offsets[1] + 0.4)) < 1e-9);
    assert.ok(Math.abs(fadePlan(segments([1, 1.3], 10), 0.4).fade - 0.15) < 1e-9, "never more than half the shortest segment");
    assert.equal(fadePlan(segs, 0).fade, 0, "Corte");
});

test("ffmpegArgs: looped PNGs, xfade or concat, the sound mapped, H.264 + AAC for the song's length", () => {
    const segs = segments([10, 20], 30);
    const frameFile = (f) => `F/${f}.png`;
    const soft = ffmpegArgs({ segs, fade: 0.4, frameFile, audio: "A/play.mp3", out: "O/x.mp4", total: 30 });
    const fc = soft[soft.indexOf("-filter_complex") + 1];
    assert.match(fc, /\[s0\]\[s1\]xfade=transition=fade:duration=0\.4:offset=9\.8\[x1\]/);
    assert.match(fc, /\[x1\]\[s2\]xfade=transition=fade:duration=0\.4:offset=19\.8\[v\]/);
    assert.deepEqual(soft.filter((a) => a.endsWith(".png")), ["F/bg.png", "F/0.png", "F/1.png"]);
    assert.ok(soft.includes("3:a:0?"), "the sound is the input after the pictures, optional");
    assert.equal(soft[soft.indexOf("-t", soft.lastIndexOf("-r")) + 1], "30");
    assert.equal(soft.at(-1), "O/x.mp4");
    const cut = ffmpegArgs({ segs, fade: 0, frameFile, audio: null, out: "O/x.mp4", total: 30 });
    assert.match(cut[cut.indexOf("-filter_complex") + 1], /\[s0\]\[s1\]\[s2\]concat=n=3:v=1:a=0\[v\]/);
    assert.ok(!cut.some((a) => /:a:0\?/.test(a)), "no sound: a silent video");
});

test("mediaPathOf: only this computer's media files; fileNameFor: a name Windows takes", () => {
    const dir = path.join("C:", "data", "media");
    assert.equal(mediaPathOf("http://127.0.0.1:7700/media/abc%20d.mp3", dir), path.join(dir, "abc d.mp3"));
    assert.equal(mediaPathOf("keryx-media://x.mp4", dir), path.join(dir, "x.mp4"));
    assert.equal(mediaPathOf("https://youtu.be/abc", dir), null);
    assert.equal(mediaPathOf("http://127.0.0.1:7700/media/../secret", dir), null);
    assert.equal(mediaPathOf("http://127.0.0.1:7700/media/bundled/x.webp", dir), null);
    assert.equal(fileNameFor('Eu vou: "viver"?'), "Eu vou viver · com letra.mp4");
    assert.equal(fileNameFor(""), "Música · com letra.mp4");
});

test("ffmpegArgs with the song's Fim: the picture to black and the sound out from the mark (2026-11-12)", () => {
    const segs = segments([10, 20], 33);
    const args = ffmpegArgs({ segs, fade: 0.4, frameFile: (f) => `F/${f}.png`, audio: "A/play.mp3", out: "O/x.mp4", total: 33, end: { at: 30, fade: 3 } });
    const fc = args[args.indexOf("-filter_complex") + 1];
    assert.match(fc, /xfade=transition=fade:duration=0\.4:offset=19\.8\[vf\];\[vf\]fade=t=out:st=30:d=3\[v\]$/);
    assert.equal(args[args.indexOf("-af") + 1], "afade=t=out:st=30:d=3:curve=cub");
    // One slide only, no fade: the plain chain, no audio filter.
    const one = ffmpegArgs({ segs: segments([0], 20), fade: 0, frameFile: (f) => `F/${f}.png`, audio: "A/p.mp3", out: "O/y.mp4", total: 20, end: { at: 17, fade: 0 } });
    assert.ok(!one.includes("-af"));
    assert.match(one[one.indexOf("-filter_complex") + 1], /\[s0\]copy\[v\]$/);
});

test("the song's Início: the video leaves out the part before it (2026-11-28)", () => {
    const { trimmed } = require("./lyricVideo.cjs");
    // Every time moves to the video's own: the slides, the length, the Fim.
    assert.deepEqual(trimmed([5, 20, null], 100, { at: 90, fade: 3 }, 4.5), { starts: [0.5, 15.5, null], total: 95.5, end: { at: 85.5, fade: 3 } });
    const same = trimmed([5, 20], 100, null, 0);
    assert.deepEqual(same, { starts: [5, 20], total: 100, end: null }, "no Início: as it was");
    assert.equal(trimmed([5], 10, null, 20).total, 10, "an Início past the end is ignored");
    // ffmpeg: the sound read from the Início (-ss before its -i), coming in over 0.15 s.
    const cut = trimmed([5, 20], 33, { at: 30, fade: 3 }, 4);
    const args = ffmpegArgs({ segs: segments(cut.starts, cut.total), fade: 0, frameFile: (f) => `F/${f}.png`, audio: "A/p.mp3", out: "O/x.mp4", total: cut.total, end: cut.end, from: 4 });
    const i = args.indexOf("A/p.mp3");
    assert.deepEqual(args.slice(i - 3, i + 1), ["-ss", "4", "-i", "A/p.mp3"]);
    assert.equal(args[args.indexOf("-af") + 1], "afade=t=in:st=0:d=0.15,afade=t=out:st=26:d=3:curve=cub");
    assert.equal(args[args.indexOf("-t", i) + 1], "29", "the video lasts the trimmed length");
    // An Início with no Fim: only the fade in.
    const noEnd = ffmpegArgs({ segs: segments([1], 10), fade: 0, frameFile: (f) => `F/${f}.png`, audio: "A/p.mp3", out: "O/y.mp4", total: 10, from: 2 });
    assert.equal(noEnd[noEnd.indexOf("-af") + 1], "afade=t=in:st=0:d=0.15");
    assert.ok(!ffmpegArgs({ segs: segments([1], 10), fade: 0, frameFile: (f) => `F/${f}.png`, audio: "A/p.mp3", out: "O/z.mp4", total: 10 }).includes("-ss"));
});
