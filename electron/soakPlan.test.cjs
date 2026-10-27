const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createLive, loadLiveRules } = require("./live.cjs");
const { SCENES, CYCLE_MS, DEFAULT_OUTPUTS, soakConfig, sceneAt, sceneOps, nextSlideOp, soakSummary, songSlides } = require("./soakPlan.cjs");
const { summarizeMetrics } = require("./perfMetrics.cjs");

test("KERYX_SOAK: minutes, outputs, the church's video, where the CSV goes, how often", () => {
    assert.equal(soakConfig({}), null);
    assert.equal(soakConfig({ KERYX_SOAK: "0" }), null);
    assert.equal(soakConfig({ KERYX_SOAK: "abc" }), null);
    assert.deepEqual(soakConfig({ KERYX_SOAK: "180" }), { minutes: 180, outputs: DEFAULT_OUTPUTS, video: null, out: null, sampleMs: 30000 });
    assert.equal(soakConfig({ KERYX_SOAK: "9999" }).minutes, 600);
    const c = soakConfig({ KERYX_SOAK: "5", KERYX_SOAK_OUTPUTS: "Projection, /LyricProjection,/StreamView,/Nope,/Projection", KERYX_SOAK_VIDEO: " C:\\v.mp4 ", KERYX_SOAK_OUT: "C:\\s.csv", KERYX_SOAK_SAMPLE: "10" });
    assert.deepEqual(c.outputs, ["/Projection", "/LyricProjection"], "no Transmissão (not a window), no unknown page, no repeat");
    assert.equal(c.video, "C:\\v.mp4");
    assert.equal(c.out, "C:\\s.csv");
    assert.equal(c.sampleMs, 10000);
    assert.equal(soakConfig({ KERYX_SOAK: "5", KERYX_SOAK_SAMPLE: "1" }).sampleMs, 30000, "never faster than every 5 s");
    assert.deepEqual(soakConfig({ KERYX_SOAK: "5", KERYX_SOAK_OUTPUTS: "/Nope" }).outputs, DEFAULT_OUTPUTS);
});

test("a 10-minute cycle shaped like a service, repeated", () => {
    assert.equal(CYCLE_MS, 10 * 60000);
    assert.equal(sceneAt(0).scene.id, "musica-video");
    assert.equal(sceneAt(3 * 60000 - 1).scene.id, "musica-video");
    assert.deepEqual({ id: sceneAt(3 * 60000).scene.id, startedAt: sceneAt(3 * 60000).startedAt }, { id: "biblia-gerador", startedAt: 180000 });
    assert.equal(sceneAt(9.5 * 60000).scene.id, "ocioso");
    const second = sceneAt(CYCLE_MS + 4 * 60000);
    assert.deepEqual({ id: second.scene.id, cycle: second.cycle, startedAt: second.startedAt }, { id: "biblia-gerador", cycle: 1, startedAt: CYCLE_MS + 180000 });
    assert.equal(sceneAt(-5).scene.id, "musica-video");
});

test("every scene's ops are accepted by the live state, in order, for three cycles", async () => {
    const rules = await loadLiveRules();
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "keryx-soak-")), "live.json");
    let clock = 1000;
    const live = createLive({ file, rules, now: () => clock, log: () => {} });
    const videoUrl = "keryx-media://soak-video.mp4";
    for (let cycle = 0; cycle < 3; cycle++) {
        for (const scene of SCENES) {
            for (const [op, args] of sceneOps(scene.id, { videoUrl })) live.call(op, args);
            const s = live.get();
            if (scene.id === "musica-video") {
                assert.equal(s.background.kind, "video");
                assert.equal(s.content.kind, "lyrics");
                assert.equal(s.video, null);
            }
            if (scene.id === "biblia-gerador") assert.deepEqual([s.background.value, s.content.kind, s.content.slides.length], ["aurora", "bible", 30]);
            if (scene.id === "musica-gerador") assert.equal(s.background.value, "fluid");
            if (scene.id === "video") {
                assert.equal(s.content, null);
                assert.equal(s.background.value, videoUrl);
                assert.equal(s.video.playback.volume, 0, "muted: the soak plays no sound");
            }
            if (scene.id === "ocioso") assert.deepEqual([s.content, s.video], [null, null]);
            // A song walks its slides and starts over.
            if (scene.step) {
                for (let i = 0; i < 40; i++) {
                    const step = nextSlideOp(live.get().content);
                    live.call(...step);
                    clock += scene.step;
                }
                assert.ok(live.get().content.index < live.get().content.slides.length);
            }
            clock += scene.ms;
        }
    }
    live.flush();
});

test("the next slide wraps to the first", () => {
    const slides = songSlides("A", 3);
    assert.equal(slides[2].label, "Refrão");
    assert.deepEqual(nextSlideOp({ slides, index: 0 }), ["content.next", {}]);
    assert.deepEqual(nextSlideOp({ slides, index: 2 }), ["content.goTo", { index: 0 }]);
    assert.equal(nextSlideOp(null), null);
    assert.equal(nextSlideOp({ slides: [], index: 0 }), null);
});

const sample = (seconds, mem, cpu) => ({ seconds, summary: summarizeMetrics([
    { pid: 1, type: "Browser", cpu: { percentCPUUsage: cpu / 2 }, memory: { workingSetSize: (mem / 2) * 1024 } },
    { pid: 2, type: "Tab", cpu: { percentCPUUsage: cpu / 2 }, memory: { workingSetSize: (mem / 2) * 1024 } },
], [{ pid: 2, url: "http://127.0.0.1:7700/Projection" }]) });

test("the verdict: memory at the start and the end, peaks per window, CPU, crashes", () => {
    // 3 hours every 30 s, memory growing 1 MB a minute.
    const samples = Array.from({ length: 361 }, (_, i) => sample(i * 30, 1000 + i / 2, i % 10 === 0 ? 40 : 20));
    const s = soakSummary(samples);
    assert.equal(s.samples, 361);
    assert.equal(s.minutes, 180);
    assert.equal(s.memory.startMB, 1015);
    assert.equal(s.memory.endMB, 1165);
    assert.equal(s.memory.growthMB, 150);
    assert.equal(s.memory.peakMB, 1180);
    assert.deepEqual(s.peaks["Projeção"], { memMB: 590, cpu: 20 });
    assert.equal(s.cpu.peak, 40);
    assert.equal(s.ok, true);
    const crashed = soakSummary(samples.slice(0, 7), { gone: [{ at: 60, type: "GPU", reason: "crashed" }] });
    assert.equal(crashed.ok, false);
    assert.equal(crashed.minutes, 3);
    assert.deepEqual(soakSummary([]).memory, { startMB: 0, endMB: 0, growthMB: 0, peakMB: 0 });
});
