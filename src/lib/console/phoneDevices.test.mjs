import test from "node:test";
import assert from "node:assert/strict";
import { devicesOf, codePhonesOf, seenWords, codeLine, countdown } from "./phoneDevices.js";

const info = {
    devices: [
        { id: "a", role: "control", name: "iPhone da Ana", lastSeen: "2026-11-06T12:00:00Z", online: false },
        { id: "b", role: "control", name: "Celular do Davi", lastSeen: "2026-11-01T12:00:00Z", online: true },
        { id: "c", role: "team", name: "Tablet do louvor", lastSeen: "2026-11-08T11:00:00Z", online: false },
    ],
    clients: [
        { screen: "/Remote", role: "control", ip: "192.168.0.23" },
        { screen: "/Remote", role: "control", ip: "192.168.0.30", deviceId: "b" },
        { screen: "/Remote", ip: "192.168.0.31" },
        { screen: "/StageView", ip: "192.168.0.40" },
        { screen: "/Remote", role: "team", ip: "192.168.0.50" },
    ],
};

test("a door's paired phones, connected first; its phones by code, not the paired ones", () => {
    assert.deepEqual(devicesOf(info, "control").map((d) => d.name), ["Celular do Davi", "iPhone da Ana"]);
    assert.deepEqual(devicesOf(info, "team").map((d) => d.id), ["c"]);
    assert.deepEqual(devicesOf({}, "team"), []);
    assert.deepEqual(codePhonesOf(info, "control").map((p) => p.ip), ["192.168.0.23", "192.168.0.31"]);
    assert.equal(codeLine(codePhonesOf(info, "control")), "Pelo código · 2 · 192.168.0.23, 192.168.0.31");
    assert.equal(codeLine([]), "Pelo código · nenhum agora");
});

test("when a phone was seen, in words", () => {
    const now = Date.parse("2026-11-08T12:00:00Z");
    const at = (ms) => ({ lastSeen: new Date(now - ms).toISOString() });
    assert.equal(seenWords({ online: true }, now), "conectado agora");
    assert.equal(seenWords(at(20 * 1000), now), "visto agora");
    assert.equal(seenWords(at(5 * 60 * 1000), now), "visto há 5 min");
    assert.equal(seenWords(at(3 * 3600 * 1000), now), "visto há 3 h");
    assert.equal(seenWords(at(30 * 3600 * 1000), now), "visto ontem");
    assert.equal(seenWords(at(6 * 86400 * 1000), now), "visto há 6 dias");
    assert.equal(seenWords({}, now), "ainda não visto");
});

test("the QR's countdown", () => {
    assert.equal(countdown(1000 + 292000, 1000), "4:52");
    assert.equal(countdown(0, 5000), "0:00");
});
