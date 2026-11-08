import test from "node:test";
import assert from "node:assert/strict";
import { onAir, hasUpdate, shouldOpenOnLaunch, canInstallNow, progressText, phaseOf, LAUNCH_WINDOW_MS } from "./updates.js";

test("on air: anything seen or heard; a paused song or an empty screen is not", () => {
    assert.equal(onAir(null), false);
    assert.equal(onAir({ screen: "logo", content: null, media: null }), false);
    assert.equal(onAir({ content: { title: "Canto" } }), true);
    assert.equal(onAir({ communication: { id: "a" } }), true);
    assert.equal(onAir({ audio: { playback: { paused: false } } }), true);
    assert.equal(onAir({ audio: { playback: { paused: true } } }), false);
});

test("the popup opens by itself only with auto on, right after launch, once", () => {
    const update = { auto: true, status: "downloading", version: "0.2.7" };
    assert.equal(shouldOpenOnLaunch({ update, sinceMountMs: 5000, dismissed: false }), true);
    assert.equal(shouldOpenOnLaunch({ update: { ...update, auto: false }, sinceMountMs: 5000, dismissed: false }), false);
    assert.equal(shouldOpenOnLaunch({ update, sinceMountMs: LAUNCH_WINDOW_MS + 1, dismissed: false }), false, "later: only the bell");
    assert.equal(shouldOpenOnLaunch({ update, sinceMountMs: 5000, dismissed: true }), false, "Agora não holds for the session");
    assert.equal(shouldOpenOnLaunch({ update: { ...update, status: "none" }, sinceMountMs: 5000, dismissed: false }), false);
});

test("install at once only when downloaded and nothing is on air", () => {
    const update = { status: "downloaded", version: "0.2.7" };
    assert.equal(canInstallNow({ update, live: { screen: "logo" } }), true);
    assert.equal(canInstallNow({ update, live: { content: { title: "Canto" } } }), false);
    assert.equal(canInstallNow({ update: { ...update, status: "downloading" }, live: null }), false);
});

test("an update to act on, and what the popup says", () => {
    assert.equal(hasUpdate({ status: "available", version: "0.2.7" }), true);
    assert.equal(hasUpdate({ status: "none", version: null }), false);
    assert.equal(hasUpdate({ status: "error", version: null }), false, "a failed check is not an update");
    assert.equal(progressText({ status: "downloading", total: 0 }), "Baixando…");
    assert.equal(progressText({ status: "downloading", transferred: 9e6, total: 140e6, bytesPerSecond: 2e6 }), "9 de 140 MB · 2 MB/s · falta 1 min");
    assert.equal(progressText({ status: "downloading", transferred: 130e6, total: 140e6, bytesPerSecond: 2e6 }), "130 de 140 MB · 2 MB/s · faltam 5 s");
    assert.equal(phaseOf({ status: "downloaded", version: "0.2.7" }).title, "Versão 0.2.7 pronta");
});
