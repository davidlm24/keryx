// What the computer spends on KERYX: memory and CPU per process (each
// window is its own renderer), and which graphics card draws. Pure: main
// hands in what app.getAppMetrics(), app.getGPUInfo("basic") and
// app.getGPUFeatureStatus() returned and the windows' { pid, url }; the
// diagnostic zip (system.cjs, desempenho.json) and the soak run
// (soak.cjs, the CSV) both read it. The minimum PC (docs/requisitos.md)
// is set from these numbers.

const OUTPUT_NAMES = require("../shared/outputNames.json");

const MB = 1024; // Electron reports memory in KB
const round1 = (n) => Math.round((Number(n) || 0) * 10) / 10;

// The window a renderer belongs to, by its page: the console, an output
// (by its factory name), a detached page of the console's window.
function windowLabel(url) {
    let u;
    try {
        u = new URL(String(url || ""));
    } catch {
        return "Janela";
    }
    const page = u.pathname.replace(/\/+$/, "") || "/";
    if (page === "/" || page === "/Console") return "Console";
    if (OUTPUT_NAMES[page]) return OUTPUT_NAMES[page];
    if (page === "/Janela" || page === "/Editor") return `Janela: ${u.searchParams.get("page") || "página"}`;
    return page.slice(1);
}

// Chromium's process types, in pt-BR (the CSV is read by the church).
const TYPE_LABELS = { Browser: "Principal", GPU: "Vídeo (GPU)", Utility: "Utilitário", Zygote: "Zygote", "Sandbox helper": "Sandbox", "Pepper Plugin": "Plugin", "Pepper Plugin Broker": "Plugin", Unknown: "Outro" };

// One line per process: memory in MB (working set and private), CPU in %
// of one core since the last call (Chromium's own measure).
function summarizeMetrics(metrics, windows = []) {
    const byPid = new Map();
    for (const w of windows || []) if (w && w.pid) byPid.set(w.pid, windowLabel(w.url));
    const processes = (Array.isArray(metrics) ? metrics : []).map((m) => {
        const mem = m.memory || {};
        const type = String(m.type || "Unknown");
        const label = type === "Tab" ? byPid.get(m.pid) || "Janela" : (m.serviceName && type === "Utility" ? `${TYPE_LABELS.Utility} (${m.serviceName})` : TYPE_LABELS[type] || type);
        return {
            pid: m.pid,
            type,
            label,
            memMB: round1((mem.workingSetSize || 0) / MB),
            privateMB: round1((mem.privateBytes || 0) / MB),
            peakMB: round1((mem.peakWorkingSetSize || 0) / MB),
            cpu: round1(m.cpu?.percentCPUUsage),
        };
    });
    const sum = (k) => round1(processes.reduce((n, p) => n + p[k], 0));
    return { processes, total: { count: processes.length, memMB: sum("memMB"), privateMB: sum("privateMB"), cpu: sum("cpu") } };
}

const VENDORS = { 0x8086: "Intel", 0x10de: "NVIDIA", 0x1002: "AMD", 0x1022: "AMD", 0x1414: "Microsoft", 0x5143: "Qualcomm" };
const hex = (n) => (Number.isFinite(n) ? `0x${n.toString(16).padStart(4, "0")}` : null);

// The graphics card(s) and whether Chromium draws on them or in software
// (the Microsoft Basic Render Driver, 0x1414, or WebGL "unavailable" /
// "*software*": the generated backgrounds then fall back to their CSS look).
function gpuSummary(info, features) {
    const devices = (Array.isArray(info?.gpuDevice) ? info.gpuDevice : []).map((d) => ({
        vendor: VENDORS[d.vendorId] || hex(d.vendorId),
        vendorId: hex(d.vendorId),
        deviceId: hex(d.deviceId),
        active: Boolean(d.active),
        driverVendor: d.driverVendor || null,
        driverVersion: d.driverVersion || null,
    }));
    const active = devices.find((d) => d.active) || devices[0] || null;
    const feat = features && typeof features === "object" ? features : {};
    const webgl = feat.webgl || null;
    const software = Boolean((active && active.vendorId === "0x1414") || (webgl && /software|unavailable|disabled/.test(webgl)));
    return { active, devices, software, features: feat };
}

// desempenho.json: the machine, the GPU and every process now.
function perfReport({ metrics, windows, gpu, features, machine = {}, at = new Date() }) {
    return {
        generatedAt: at.toISOString(),
        machine,
        gpu: gpuSummary(gpu, features),
        ...summarizeMetrics(metrics, windows),
    };
}

// The soak CSV (soak.cjs): ";" between fields and a decimal comma, with a
// BOM, so a pt-BR Excel opens it in columns. One line per process per
// sample, plus a "Total" line.
const CSV_HEADER = ["segundos", "horario", "cena", "processo", "tipo", "pid", "memoria_mb", "memoria_privada_mb", "cpu_pct"];
const csvCell = (v) => {
    if (typeof v === "number") return String(v).replace(".", ",");
    const s = String(v ?? "");
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const BOM = String.fromCharCode(0xfeff);
const csvLine = (cells) => cells.map(csvCell).join(";");

function csvHeader() {
    return `${BOM}${csvLine(CSV_HEADER)}\r\n`;
}

function csvLines({ seconds, at, scene, summary }) {
    const time = at instanceof Date ? at.toTimeString().slice(0, 8) : String(at || "");
    const rows = summary.processes.map((p) => [seconds, time, scene, p.label, p.type, p.pid, p.memMB, p.privateMB, p.cpu]);
    rows.push([seconds, time, scene, "Total", "", "", summary.total.memMB, summary.total.privateMB, summary.total.cpu]);
    return rows.map((r) => `${csvLine(r)}\r\n`).join("");
}

module.exports = { windowLabel, summarizeMetrics, gpuSummary, perfReport, csvHeader, csvLines, CSV_HEADER };
