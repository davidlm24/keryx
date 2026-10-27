import test from "node:test";
import assert from "node:assert/strict";
import { cleanPreset, canKeep, presetOf, orderPresets, PRESET_MAX } from "./alertPresets.js";

test("a preset is trimmed, its spaces and line breaks collapsed, and cut at the limit", () => {
    assert.equal(cleanPreset("  Chamar   pessoa \n da   sala 3 "), "Chamar pessoa da sala 3");
    assert.equal(cleanPreset(null), "");
    assert.equal(cleanPreset(undefined), "");
    assert.equal(cleanPreset("x".repeat(500)).length, PRESET_MAX);
});

test("an empty text, or one already kept, cannot be kept; the reason says why", () => {
    const rows = [{ id: "1", message: "Kids: chamar os pais" }];
    assert.equal(canKeep("   ", rows).ok, false);
    assert.match(canKeep("", rows).why, /Escreva/);
    assert.equal(canKeep("kids:  CHAMAR os pais ", rows).ok, false); // same, ignoring case and spacing
    assert.match(canKeep("Kids: chamar os pais", rows).why, /já está/);
    assert.deepEqual(canKeep("Baby: sala de apoio", rows), { ok: true, why: "" });
    assert.equal(canKeep("Carro ABC-1234", []).ok, true);
});

test("presetOf finds the kept row of a text, accents and capitals intact", () => {
    const rows = [{ id: "1", message: "Chamar pessoa" }, { id: "2", message: "Ônibus chegou" }];
    assert.equal(presetOf("ônibus  CHEGOU", rows).id, "2");
    assert.equal(presetOf("Ônibus", rows), null);
    assert.equal(presetOf("", rows), null);
});

test("presets come oldest first, blank rows dropped", () => {
    const rows = [
        { id: "b", message: "Segunda", created_date: "2026-10-12T10:00:00Z" },
        { id: "x", message: "   ", created_date: "2026-10-12T09:00:00Z" },
        { id: "a", message: "Primeira", created_date: "2026-10-11T10:00:00Z" },
        { id: "c", message: "Sem data" },
    ];
    assert.deepEqual(orderPresets(rows).map((r) => r.id), ["c", "a", "b"]);
    assert.deepEqual(orderPresets(), []);
});
