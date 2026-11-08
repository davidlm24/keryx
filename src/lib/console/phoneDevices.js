// KERYX no celular · Aparelhos (owner 2026-11-08, marks M1–M5 = A): the
// words of the door cards' list and of the pairing dialog. The phones paired
// by QR come from network info().devices (electron/phoneDevices.cjs); the
// phones that typed the code are the live streams with no device.

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const roleOf = (cl) => cl.role || "control";

// The paired phones of one door, connected first, then the most recent.
export function devicesOf(info, role) {
    return (info?.devices || []).filter((d) => d.role === role)
        .sort((a, b) => Number(Boolean(b.online)) - Number(Boolean(a.online)) || String(b.lastSeen).localeCompare(String(a.lastSeen)));
}

// The phones of one door that entered by typing its code (connected now).
export function codePhonesOf(info, role) {
    return (info?.clients || []).filter((cl) => cl.screen === "/Remote" && roleOf(cl) === role && !cl.deviceId);
}

// "conectado agora", else when it was seen: "visto há 5 min", "há 3 h",
// "ontem", "há 6 dias".
export function seenWords(device, now = Date.now()) {
    if (device?.online) return "conectado agora";
    const at = Date.parse(device?.lastSeen || "");
    if (!Number.isFinite(at)) return "ainda não visto";
    const ago = Math.max(0, now - at);
    if (ago < MIN) return "visto agora";
    if (ago < HOUR) return `visto há ${Math.floor(ago / MIN)} min`;
    if (ago < DAY) return `visto há ${Math.floor(ago / HOUR)} h`;
    if (ago < 2 * DAY) return "visto ontem";
    return `visto há ${Math.floor(ago / DAY)} dias`;
}

// The line under the list: "Pelo código · 1 · 192.168.0.23" / "· nenhum".
export function codeLine(phones) {
    const list = phones || [];
    return list.length ? `Pelo código · ${list.length} · ${list.map((p) => p.ip).join(", ")}` : "Pelo código · nenhum agora";
}

// The dialog's countdown: "4:52".
export function countdown(expires, now = Date.now()) {
    const s = Math.max(0, Math.ceil((expires - now) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
