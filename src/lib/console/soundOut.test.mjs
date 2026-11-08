import test from "node:test";
import assert from "node:assert/strict";
import { soundDevices, soundOutOptions } from "./soundOut.js";

const list = [
    { kind: "audiooutput", deviceId: "default", label: "Padrão - Alto-falantes" },
    { kind: "audiooutput", deviceId: "communications", label: "Comunicações" },
    { kind: "audiooutput", deviceId: "a1", label: "Alto-falantes (Realtek)" },
    { kind: "audioinput", deviceId: "m1", label: "Microfone" },
    { kind: "audiooutput", deviceId: "h2", label: "" },
];

test("the audio outputs, without Chromium's aliases of the default; unnamed ones get a number", () => {
    assert.deepEqual(soundDevices(list), [
        { id: "a1", label: "Alto-falantes (Realtek)" },
        { id: "h2", label: "Saída de som 2" },
    ]);
    assert.deepEqual(soundDevices(null), []);
});

test("Windows' default first; a device chosen before and unplugged now stays, disabled", () => {
    const devices = soundDevices(list);
    assert.deepEqual(soundOutOptions(devices, { id: "", label: "" }).map((o) => o.label), ["Som padrão do Windows", "Alto-falantes (Realtek)", "Saída de som 2"]);
    const gone = soundOutOptions(devices, { id: "usb9", label: "Mesa USB" });
    assert.deepEqual(gone.at(-1), { value: "usb9", label: "Mesa USB (desconectado)", disabled: true });
    assert.equal(soundOutOptions(devices, { id: "a1", label: "x" }).some((o) => o.disabled), false);
});
