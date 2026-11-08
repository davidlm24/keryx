// Configurações › Telas na rede › KERYX no celular in the browser preview
// (dev only): there is no network server here, so with
// localStorage `keryx.preview.phones` = "1" the section answers from a
// made-up church — the doors open, two phones paired to each, one typed the
// code — and Conectar um aparelho… pretends a phone scans the QR after 4 s.
// Without the key, the section says it is desktop only, as before.

const KEY = "keryx.preview.phones";
const on = () => { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } };
const iso = (msAgo) => new Date(Date.now() - msAgo).toISOString();
const DAY = 86400000;

let devices = [
    { id: "a0000000000000a1", role: "control", name: "Celular do Davi", lastSeen: iso(10000), createdAt: iso(20 * DAY), agent: "Android · Chrome" },
    { id: "a0000000000000a2", role: "control", name: "iPhone da Ana", lastSeen: iso(2 * DAY), createdAt: iso(30 * DAY), agent: "iPhone · Safari" },
    { id: "a0000000000000a3", role: "team", name: "Tablet do louvor", lastSeen: iso(20000), createdAt: iso(9 * DAY), agent: "Tablet Android · Chrome" },
    { id: "a0000000000000a4", role: "team", name: "Celular da Bia", lastSeen: iso(6 * DAY), createdAt: iso(40 * DAY), agent: "Android · Chrome" },
];
const online = new Set(["a0000000000000a1", "a0000000000000a3"]);
const tickets = new Map();
let n = 0;

function info() {
    const clients = [
        { screen: "/Remote", role: "control", ip: "192.168.0.23", label: "Controle" },
        ...devices.filter((d) => online.has(d.id)).map((d, i) => ({ screen: "/Remote", role: d.role, ip: `192.168.0.${30 + i}`, deviceId: d.id, label: d.role === "team" ? "Equipe" : "Controle" })),
    ];
    return {
        enabled: true, running: true, port: 7701, hasPin: false, error: "",
        phones: { enabled: true }, remote: { enabled: true, hasCode: true }, team: { enabled: true, hasCode: true },
        urls: [{ name: "Wi-Fi", url: "http://192.168.0.15:7701" }],
        clients, screens: [],
        devices: devices.map((d) => ({ ...d, online: online.has(d.id) })),
    };
}

const ops = {
    info: () => info(),
    firewall: () => ({ blocked: false }),
    revealRemoteCode: () => ({ code: "246813" }),
    revealTeamCode: () => ({ code: "975310" }),
    pairStart: ({ role }) => {
        n += 1;
        const ticket = `preview${n}`;
        tickets.set(ticket, { role, expires: Date.now() + 5 * 60000, at: Date.now() });
        return { ticket, role, expires: tickets.get(ticket).expires, path: `/lan/pair?t=${ticket}` };
    },
    pairStatus: ({ ticket }) => {
        const t = tickets.get(ticket);
        if (!t) return { state: "expired" };
        if (t.device) return { state: "done", device: t.device };
        if (Date.now() - t.at < 4000) return { state: "waiting", role: t.role, expires: t.expires };
        const d = { id: `b${String(n).padStart(15, "0")}`, role: t.role, name: "Celular do João", lastSeen: iso(0), createdAt: iso(0), agent: "Android · Chrome" };
        devices = [d, ...devices];
        online.add(d.id);
        t.device = { id: d.id, name: d.name, role: d.role };
        return { state: "done", device: t.device };
    },
    pairCancel: ({ ticket }) => { tickets.delete(ticket); return { ok: true }; },
    renameDevice: ({ id, name }) => { devices = devices.map((d) => (d.id === id ? { ...d, name } : d)); return info(); },
    removeDevice: ({ id }) => { devices = devices.filter((d) => d.id !== id); online.delete(id); return info(); },
    disconnectRemotes: () => { devices = devices.filter((d) => d.role !== "control"); return info(); },
    disconnectTeam: () => { devices = devices.filter((d) => d.role !== "team"); return info(); },
};

// null = not faking (the key is off, or an op this fake does not know).
export function previewPhonesCall(op, args) {
    if (!on() || !ops[op]) return null;
    return { data: ops[op](args || {}) };
}
