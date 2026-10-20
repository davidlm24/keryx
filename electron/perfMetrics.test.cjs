const test = require("node:test");
const assert = require("node:assert/strict");
const { windowLabel, summarizeMetrics, gpuSummary, perfReport, csvHeader, csvLines, CSV_HEADER } = require("./perfMetrics.cjs");

const APP = "http://127.0.0.1:7700";

test("each renderer is named by its window's page", () => {
    assert.equal(windowLabel(`${APP}/`), "Console");
    assert.equal(windowLabel(`${APP}/Console?config=telas`), "Console");
    assert.equal(windowLabel(`${APP}/Projection`), "Projeção");
    assert.equal(windowLabel(`${APP}/StageView`), "Palco");
    assert.equal(windowLabel(`${APP}/VideoProjection`), "Vídeo");
    assert.equal(windowLabel(`${APP}/Janela?page=theme&theme=new`), "Janela: theme");
    assert.equal(windowLabel("not a url"), "Janela");
});

// What app.getAppMetrics() returns on Windows (memory in KB).
const METRICS = [
    { pid: 10, type: "Browser", cpu: { percentCPUUsage: 1.24 }, memory: { workingSetSize: 153600, privateBytes: 102400, peakWorkingSetSize: 204800 } },
    { pid: 11, type: "GPU", cpu: { percentCPUUsage: 6.5 }, memory: { workingSetSize: 256000, privateBytes: 204800 } },
    { pid: 12, type: "Tab", cpu: { percentCPUUsage: 3 }, memory: { workingSetSize: 307200, privateBytes: 256000 } },
    { pid: 13, type: "Tab", cpu: { percentCPUUsage: 9.96 }, memory: { workingSetSize: 204800, privateBytes: 153600 } },
    { pid: 14, type: "Utility", serviceName: "network.mojom.NetworkService", cpu: { percentCPUUsage: 0 }, memory: { workingSetSize: 30720 } },
    { pid: 15, type: "Tab", memory: {} },
];

test("memory in MB and CPU per process, the windows by their page, and the total", () => {
    const s = summarizeMetrics(METRICS, [{ pid: 12, url: `${APP}/Console` }, { pid: 13, url: `${APP}/Projection` }]);
    assert.deepEqual(s.processes.map((p) => p.label), ["Principal", "Vídeo (GPU)", "Console", "Projeção", "Utilitário (network.mojom.NetworkService)", "Janela"]);
    assert.deepEqual(s.processes[0], { pid: 10, type: "Browser", label: "Principal", memMB: 150, privateMB: 100, peakMB: 200, cpu: 1.2 });
    assert.equal(s.processes[3].cpu, 10);
    assert.deepEqual(s.processes[5], { pid: 15, type: "Tab", label: "Janela", memMB: 0, privateMB: 0, peakMB: 0, cpu: 0 }, "a renderer with no window yet, no numbers");
    assert.deepEqual(s.total, { count: 6, memMB: 930, privateMB: 700, cpu: 20.7 });
    assert.deepEqual(summarizeMetrics(null).total, { count: 0, memMB: 0, privateMB: 0, cpu: 0 });
});

test("the graphics card, and whether Chromium draws in software", () => {
    const intel = gpuSummary({ gpuDevice: [{ vendorId: 0x10de, deviceId: 0x1c8d, active: false }, { vendorId: 0x8086, deviceId: 0x5917, active: true, driverVersion: "31.0.101.2111" }] }, { webgl: "enabled", gpu_compositing: "enabled" });
    assert.deepEqual(intel.active, { vendor: "Intel", vendorId: "0x8086", deviceId: "0x5917", active: true, driverVendor: null, driverVersion: "31.0.101.2111" });
    assert.equal(intel.devices.length, 2);
    assert.equal(intel.software, false);
    assert.equal(gpuSummary({ gpuDevice: [{ vendorId: 0x1414, deviceId: 0x8c, active: true }] }, {}).software, true, "Microsoft Basic Render Driver");
    assert.equal(gpuSummary({ gpuDevice: [{ vendorId: 0x8086, deviceId: 1, active: true }] }, { webgl: "unavailable_software" }).software, true);
    assert.deepEqual(gpuSummary(null, null), { active: null, devices: [], software: false, features: {} });
});

test("desempenho.json holds the machine, the GPU and every process", () => {
    const r = perfReport({ metrics: METRICS.slice(0, 1), windows: [], gpu: null, features: null, machine: { threads: 4 }, at: new Date("2026-10-20T12:00:00Z") });
    assert.equal(r.generatedAt, "2026-10-20T12:00:00.000Z");
    assert.deepEqual(r.machine, { threads: 4 });
    assert.equal(r.processes.length, 1);
    assert.equal(r.total.memMB, 150);
    assert.equal(r.gpu.software, false);
});

test("the soak CSV opens in columns in a pt-BR Excel: BOM, ';' and a decimal comma", () => {
    assert.equal(csvHeader().slice(1), `${CSV_HEADER.join(";")}\r\n`);
    assert.equal(csvHeader().charCodeAt(0), 0xfeff);
    const s = summarizeMetrics(METRICS.slice(0, 2));
    const lines = csvLines({ seconds: 30, at: new Date(2026, 9, 20, 19, 0, 5), scene: "Música; vídeo", summary: s }).split("\r\n");
    assert.deepEqual(lines, [
        '30;19:00:05;"Música; vídeo";Principal;Browser;10;150;100;1,2',
        '30;19:00:05;"Música; vídeo";Vídeo (GPU);GPU;11;250;200;6,5',
        '30;19:00:05;"Música; vídeo";Total;;;400;300;7,7',
        "",
    ]);
});
