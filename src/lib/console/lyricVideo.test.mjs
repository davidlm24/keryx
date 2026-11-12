import test from "node:test";
import assert from "node:assert/strict";
import { exportBlock, videoLength, jobLine } from "./lyricVideo.js";

const song = { title: "Hino", audio_url: "http://127.0.0.1:7700/media/p.mp3", duration: 210, slides: [{ text: "a", start: 10 }] };

test("exportBlock: why the lyric video cannot be made, in the order to fix it", () => {
    assert.equal(exportBlock(song), "");
    assert.match(exportBlock(song, { desktop: false }), /Só no programa/);
    assert.match(exportBlock(song, { ffmpeg: false }), /ffmpeg/);
    assert.equal(exportBlock(song, { ffmpeg: null }), "", "not known yet: not blocked");
    assert.match(exportBlock({ ...song, audio_url: "" }), /não tem playback/);
    assert.match(exportBlock({ ...song, audio_url: "https://youtu.be/x" }), /YouTube/);
    assert.match(exportBlock({ ...song, slides: [{ text: "a" }] }), /Marque os tempos/);
    assert.equal(exportBlock({ ...song, slides: [{ text: "a" }], line_starts: [null, 4] }), "", "marks by line count");
    assert.match(exportBlock({ ...song, duration: 0 }), /duração/);
    assert.equal(exportBlock({ ...song, duration: 0 }, { media: [{ file_url: song.audio_url, duration: 200 }] }), "", "the playback's length");
});

test("videoLength and jobLine", () => {
    assert.equal(videoLength(song), 210);
    assert.equal(videoLength({ ...song, duration: null }, [{ file_url: song.audio_url, duration: 199 }]), 199);
    assert.equal(videoLength({ audio_url: "x" }), null);
    assert.equal(jobLine({ phase: "frames", pct: 40 }), "Desenhando os slides · 40 %");
    assert.equal(jobLine({ phase: "encode", pct: 62 }), "Juntando as imagens e o som · 62 %");
    assert.equal(jobLine({ phase: "done", out: "C:/v.mp4" }), "Pronto: C:/v.mp4");
    assert.equal(jobLine({ phase: "failed", error: "x" }), "x");
});

test("the video lasts up to the song's Fim and fade (2026-11-12)", async () => {
    const { videoLength, videoEnd } = await import("./lyricVideo.js");
    assert.equal(videoLength({ duration: 250, end_at: 200, end_fade: 4 }), 204);
    assert.deepEqual(videoEnd({ end_at: 200 }), { at: 200, fade: 3 });
    assert.equal(videoEnd({ end_at: null }), null);
    assert.equal(videoLength({ duration: 250, end_at: null }), 250);
});

test("frameState: the slides drop the intro flag the reducer stamped; bg follows introMode (owner 2026-11-12)", async () => {
    const { frameState } = await import("./lyricVideo.js");
    const { songContent } = await import("./content.js");
    const { applyOp, emptyState, currentSlide } = await import("../../../shared/live-state.mjs");
    const marked = { title: "Hino", artist: "Coral", audio_url: "http://127.0.0.1:7700/media/p.mp3", duration: 210, lyrics: "Primeira linha\n\nSegunda linha", slides: [{ text: "Primeira linha", start: 8 }, { text: "Segunda linha", start: 20 }] };
    const doc = applyOp(emptyState(1000), "content.show", songContent(marked, {}, []), 1000);
    // The bug's shape: the reducer stamps the introduction on a marked song.
    assert.equal(doc.content.intro, true);
    assert.equal(currentSlide(doc.content), null);
    // Every slide frame draws its text.
    for (const i of [0, 1]) {
        const s = frameState(doc, i);
        assert.equal(currentSlide(s.content)?.text, marked.slides[i].text, `slide ${i}`);
    }
    // The bg frame: the background alone, or the title when asked.
    assert.equal(frameState(doc, "bg").content, null);
    const titled = applyOp(emptyState(1000), "content.show", songContent({ ...marked, intro_mode: "title" }, {}, []), 1000);
    const bg = frameState(titled, "bg");
    assert.equal(bg.content.intro, true);
    assert.equal(bg.content.introMode, "title");
    assert.equal(currentSlide(bg.content), null, "the intro view: the renderer draws the title, not a slide");
});
