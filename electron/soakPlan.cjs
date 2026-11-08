// The soak run's plan (KERYX_SOAK=<minutes>, soak.cjs): what goes on air
// when, and what the numbers say at the end. Pure, tested; the runner
// sends these ops through the live state and samples perfMetrics.cjs.
// A 10-minute cycle shaped like a service: songs over a looping video,
// a Bible chapter and a song over generated backgrounds, a video on its
// own, then nothing on air. The texts are made up (no lyrics or
// scripture: KERYX ships neither).

const OUTPUT_NAMES = require("../shared/outputNames.json");

const MINUTE = 60000;
// The outputs a church opens on a Sunday: the projector, the musicians'
// monitor and the video screen. KERYX_SOAK_OUTPUTS changes the list.
const DEFAULT_OUTPUTS = ["/Projection", "/StageView", "/VideoProjection"];
// /StreamView is an OBS source on the network, never a window.
const WINDOW_OUTPUTS = Object.keys(OUTPUT_NAMES).filter((k) => k !== "/StreamView");

const SCENES = [
    { id: "musica-video", label: "Música sobre vídeo", ms: 3 * MINUTE, step: 6000 },
    { id: "biblia-gerador", label: "Bíblia sobre fundo gerado", ms: 2 * MINUTE, step: 10000 },
    { id: "musica-gerador", label: "Música sobre fundo gerado", ms: 3 * MINUTE, step: 6000 },
    { id: "video", label: "Vídeo em loop", ms: MINUTE, step: 0 },
    { id: "ocioso", label: "Nada no ar", ms: MINUTE, step: 0 },
];
const CYCLE_MS = SCENES.reduce((n, s) => n + s.ms, 0);

// KERYX_SOAK=<minutes> (1–600), KERYX_SOAK_OUTPUTS="/Projection,/StageView",
// KERYX_SOAK_VIDEO=<a video file of the church's>, KERYX_SOAK_OUT=<csv path>,
// KERYX_SOAK_SAMPLE=<seconds between samples, 5 or more; 30 by default>.
function soakConfig(env = {}) {
    const minutes = Math.round(Number(env.KERYX_SOAK));
    if (!Number.isFinite(minutes) || minutes <= 0) return null;
    const asked = String(env.KERYX_SOAK_OUTPUTS || "").split(",").map((s) => s.trim()).filter(Boolean)
        .map((s) => (s.startsWith("/") ? s : `/${s}`));
    const outputs = asked.length ? [...new Set(asked)].filter((k) => WINDOW_OUTPUTS.includes(k)) : DEFAULT_OUTPUTS;
    const sample = Number(env.KERYX_SOAK_SAMPLE);
    return {
        minutes: Math.min(minutes, 600),
        outputs: outputs.length ? outputs : DEFAULT_OUTPUTS,
        video: String(env.KERYX_SOAK_VIDEO || "").trim() || null,
        out: String(env.KERYX_SOAK_OUT || "").trim() || null,
        sampleMs: Number.isFinite(sample) && sample >= 5 ? Math.round(sample * 1000) : 30000,
    };
}

// The scene playing `ms` into the run, and when it started (a new start
// = send its ops).
function sceneAt(ms) {
    const t = Math.max(0, Number(ms) || 0);
    const cycle = Math.floor(t / CYCLE_MS);
    let into = t - cycle * CYCLE_MS;
    let startedAt = cycle * CYCLE_MS;
    for (let i = 0; i < SCENES.length; i++) {
        if (into < SCENES[i].ms) return { scene: SCENES[i], index: i, cycle, startedAt };
        into -= SCENES[i].ms;
        startedAt += SCENES[i].ms;
    }
    return { scene: SCENES[0], index: 0, cycle: cycle + 1, startedAt: (cycle + 1) * CYCLE_MS };
}

const LINE = ["Linha de teste para medir o desempenho", "com duas linhas como uma estrofe comum"];
function songSlides(tag, count = 12) {
    return Array.from({ length: count }, (_, i) => ({
        text: `${LINE[0]} ${tag}${i + 1}\n${LINE[1]}`,
        label: i % 3 === 2 ? "Refrão" : `Estrofe ${Math.floor(i / 3) + 1}`,
        ...(i % 3 === 2 ? { is_chorus: true } : {}),
    }));
}
function bibleSlides(count = 30) {
    return Array.from({ length: count }, (_, i) => ({
        text: `${i + 1} Texto de teste do versículo ${i + 1}, longo como um versículo de verdade, para o KERYX quebrar em duas ou três linhas na tela.`,
        ref: `Teste 1:${i + 1}`,
    }));
}

// What each scene sends when it starts: [op, args] in order.
function sceneOps(id, { videoUrl }) {
    const videoBg = { kind: "video", value: videoUrl, title: "Vídeo de teste" };
    switch (id) {
        case "musica-video":
            return [
                ["video.clear", {}],
                ["background.set", videoBg],
                ["content.show", { kind: "lyrics", title: "Música de teste A", artist: "Teste", slides: songSlides("A") }],
            ];
        case "biblia-gerador":
            return [
                ["background.set", { kind: "generator", value: "aurora", title: "Aurora" }],
                ["content.show", { kind: "bible", title: "Capítulo de teste", slides: bibleSlides() }],
            ];
        case "musica-gerador":
            return [
                ["background.set", { kind: "generator", value: "fluid", title: "Fluido" }],
                ["content.show", { kind: "lyrics", title: "Música de teste B", artist: "Teste", slides: songSlides("B") }],
            ];
        case "video":
            // The looping Fundo on the projector and the clip on the video
            // screen, muted (the soak plays no sound).
            return [
                ["text.clear", {}],
                ["background.set", videoBg],
                ["video.show", { kind: "video", url: videoUrl, title: "Vídeo de teste", volume: 0 }],
            ];
        case "ocioso":
            return [["video.clear", {}], ["clear", {}]];
        default:
            return [];
    }
}

// The next slide, back to the first after the last (a song repeats).
function nextSlideOp(content) {
    if (!content || !Array.isArray(content.slides) || content.slides.length === 0) return null;
    return content.index >= content.slides.length - 1 ? ["content.goTo", { index: 0 }] : ["content.next", {}];
}

const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

// The verdict of a run, from its samples ({ seconds, summary }): each
// window's peak memory, the total at the start and the end (the first and
// the last 30 minutes, or the first and last third of a short run) —
// memory that keeps growing is a leak —, the CPU, and what crashed.
function soakSummary(samples, { gone = [], unresponsive = [] } = {}) {
    const list = Array.isArray(samples) ? samples : [];
    const window = list.length ? Math.min(30 * 60, Math.max(1, Math.floor(list[list.length - 1].seconds / 3))) : 0;
    const last = list.length ? list[list.length - 1].seconds : 0;
    const head = list.filter((s) => s.seconds <= window);
    const tail = list.filter((s) => s.seconds >= last - window);
    const peaks = {};
    for (const s of list) {
        for (const p of s.summary.processes) {
            const key = p.label;
            const cur = peaks[key] || { memMB: 0, cpu: 0 };
            peaks[key] = { memMB: Math.max(cur.memMB, p.memMB), cpu: Math.max(cur.cpu, p.cpu) };
        }
    }
    const startMB = avg(head.map((s) => s.summary.total.memMB));
    const endMB = avg(tail.map((s) => s.summary.total.memMB));
    return {
        samples: list.length,
        minutes: Math.round(last / 6) / 10,
        memory: {
            startMB,
            endMB,
            growthMB: Math.round((endMB - startMB) * 10) / 10,
            peakMB: Math.max(0, ...list.map((s) => s.summary.total.memMB)),
        },
        cpu: { avg: avg(list.map((s) => s.summary.total.cpu)), peak: Math.max(0, ...list.map((s) => s.summary.total.cpu)) },
        peaks,
        gone,
        unresponsive,
        ok: gone.length === 0,
    };
}

module.exports = { SCENES, CYCLE_MS, DEFAULT_OUTPUTS, soakConfig, sceneAt, sceneOps, songSlides, bibleSlides, nextSlideOp, soakSummary };
