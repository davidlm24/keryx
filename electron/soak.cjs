// The soak run: KERYX_SOAK=<minutes> with KERYX_SMOKE=1 (smoke.cjs hands
// over here instead of running its checks). KERYX opens its outputs and
// plays a service on a loop (soakPlan.cjs: songs over a looping video, a
// Bible chapter and a song over generated backgrounds, a video, nothing)
// while it writes what each process spends to a CSV every 30 s
// (perfMetrics.cjs). At the end: a JSON beside the CSV with the machine,
// the graphics card and the verdict, a "SOAK FIM" line, and the app quits.
// Closing KERYX early keeps what was measured. The minimum PC in
// docs/requisitos.md comes from these files; only the owner runs it.

const fs = require("node:fs");
const path = require("node:path");
const { app, BrowserWindow } = require("electron");
const { csvHeader, csvLines } = require("./perfMetrics.cjs");
const { soakConfig, sceneAt, sceneOps, nextSlideOp, soakSummary } = require("./soakPlan.cjs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// With no video of the church's: a 20-second 1280×720 clip recorded in the
// console (moving shapes, so the decoder has real work), imported as media.
const RECORD_CLIP = `(async () => {
    const c = document.createElement("canvas");
    c.width = 1280; c.height = 720;
    const g = c.getContext("2d");
    const rec = new MediaRecorder(c.captureStream(30), { mimeType: "video/webm", videoBitsPerSecond: 4000000 });
    const chunks = [];
    rec.ondataavailable = (e) => chunks.push(e.data);
    let t = 0;
    const paint = setInterval(() => {
        t += 1;
        const grad = g.createLinearGradient(0, 0, 1280, 720);
        grad.addColorStop(0, "hsl(" + (t % 360) + ", 60%, 30%)");
        grad.addColorStop(1, "hsl(" + ((t + 120) % 360) + ", 60%, 15%)");
        g.fillStyle = grad;
        g.fillRect(0, 0, 1280, 720);
        for (let i = 0; i < 24; i++) {
            g.beginPath();
            g.arc((i * 97 + t * (2 + i % 5)) % 1280, (i * 53 + t * (1 + i % 3)) % 720, 30 + (i % 4) * 20, 0, Math.PI * 2);
            g.fillStyle = "hsla(" + ((i * 40 + t) % 360) + ", 70%, 60%, 0.35)";
            g.fill();
        }
    }, 33);
    rec.start(500);
    await new Promise((r) => setTimeout(r, 20000));
    const stopped = new Promise((r) => { rec.onstop = r; });
    rec.stop();
    await stopped;
    clearInterval(paint);
    const res = await window.keryxDesktop.media.importFile(new File(chunks, "soak.webm", { type: "video/webm" }));
    return res.data && res.data.fileName;
})()`;

const stamp = (d) => {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

async function clipUrl(cfg, webContents, dataDir) {
    if (cfg.video) {
        const name = `soak-${path.basename(cfg.video).replace(/[^\w.-]+/g, "_")}`;
        fs.copyFileSync(cfg.video, path.join(dataDir, "media", name));
        return `keryx-media://${name}`;
    }
    const fileName = await webContents.executeJavaScript(RECORD_CLIP, true);
    if (!fileName) throw new Error("não foi possível gravar o vídeo de teste");
    return `keryx-media://${fileName}`;
}

function runSoak(win, { outputs, system, live, dataDir }) {
    const cfg = soakConfig(process.env);
    const { webContents } = win;
    const started = new Date();
    const csv = cfg.out || path.join(dataDir, `soak-${stamp(started)}.csv`);
    const jsonFile = csv.replace(/\.csv$/i, "") + ".json";
    const samples = [];
    const gone = [];
    const unresponsive = [];
    const watched = new WeakSet();
    let machine = null;
    let finished = false;
    const elapsed = () => Date.now() - started.getTime();
    const seconds = () => Math.round(elapsed() / 1000);

    app.on("child-process-gone", (_e, d) => gone.push({ at: seconds(), type: d.type, reason: d.reason, name: d.name || "" }));
    app.on("render-process-gone", (_e, wc, d) => {
        let page = "";
        try { page = new URL(wc.getURL()).pathname; } catch { /* gone */ }
        gone.push({ at: seconds(), type: "Tab", reason: d.reason, page });
    });
    const watchWindows = () => {
        for (const w of BrowserWindow.getAllWindows()) {
            if (w.isDestroyed() || watched.has(w)) continue;
            watched.add(w);
            w.on("unresponsive", () => {
                let page = "";
                try { page = new URL(w.webContents.getURL()).pathname; } catch { /* closing */ }
                unresponsive.push({ at: seconds(), page });
            });
        }
    };

    // Written after every sample and at the end, so a run stopped early
    // (KERYX closed, the PC restarted) still has its verdict.
    const writeSummary = () => {
        const summary = soakSummary(samples, { gone, unresponsive });
        const doc = { startedAt: started.toISOString(), plannedMinutes: cfg.minutes, outputs: cfg.outputs, video: cfg.video || "gravado pelo KERYX (1280×720)", csv, ...machine, summary };
        try {
            fs.writeFileSync(jsonFile, JSON.stringify(doc, null, 2));
        } catch (err) {
            console.error(`SOAK não salvou ${jsonFile}: ${err.message}`);
        }
        return summary;
    };
    const finish = (code) => {
        if (finished) return;
        finished = true;
        try { live.call("clear", {}); } catch { /* quitting */ }
        const summary = writeSummary();
        console.log(`SOAK FIM ${JSON.stringify({ csv, json: jsonFile, ok: summary.ok, minutes: summary.minutes, memory: summary.memory, cpu: summary.cpu, gone: gone.length, unresponsive: unresponsive.length })}`);
        app.exit(code ?? (summary.ok ? 0 : 1));
    };
    app.on("before-quit", () => { if (!finished) { finished = true; writeSummary(); } });

    const send = (op, args) => {
        try {
            live.call(op, args);
        } catch (err) {
            console.error(`SOAK ${op}: ${err.message}`);
        }
    };

    const start = async () => {
        try {
            console.log(`SOAK ${cfg.minutes} min · saídas ${cfg.outputs.join(", ")} · CSV ${csv}`);
            fs.mkdirSync(path.dirname(csv), { recursive: true });
            fs.writeFileSync(csv, csvHeader());
            send("screens.lock", { locked: false });
            const videoUrl = await clipUrl(cfg, webContents, dataDir);
            for (const key of cfg.outputs) {
                try {
                    outputs.open(key);
                } catch (err) {
                    console.error(`SOAK não abriu ${key}: ${err.message}`);
                }
            }
            await sleep(3000);
            const first = await system.performance();
            machine = { machine: first.machine, gpu: first.gpu };
            writeSummary();

            const t0 = Date.now();
            started.setTime(t0);
            let sceneStart = -1;
            let lastStep = 0;
            let nextSample = 0;
            while (!finished && elapsed() < cfg.minutes * 60000) {
                const now = elapsed();
                const { scene, startedAt } = sceneAt(now);
                if (startedAt !== sceneStart) {
                    sceneStart = startedAt;
                    lastStep = now;
                    for (const [op, args] of sceneOps(scene.id, { videoUrl })) send(op, args);
                } else if (scene.step && now - lastStep >= scene.step) {
                    lastStep = now;
                    const step = nextSlideOp(live.get().content);
                    if (step) send(...step);
                }
                if (now >= nextSample) {
                    nextSample += cfg.sampleMs;
                    watchWindows();
                    const perf = await system.performance();
                    const s = seconds();
                    samples.push({ seconds: s, summary: perf });
                    fs.appendFileSync(csv, csvLines({ seconds: s, at: new Date(), scene: scene.label, summary: perf }));
                    writeSummary();
                    const mm = (n) => `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
                    console.log(`SOAK ${mm(s)} / ${cfg.minutes}:00 · ${scene.label} · ${perf.total.memMB} MB · CPU ${perf.total.cpu} % · quedas ${gone.length}`);
                }
                await sleep(500);
            }
            finish();
        } catch (err) {
            console.error(`SOAK parou: ${err && (err.stack || err.message)}`);
            finish(1);
        }
    };
    webContents.once("did-finish-load", () => setTimeout(start, 3000));
}

module.exports = { runSoak };
