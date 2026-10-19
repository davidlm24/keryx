import test from "node:test";
import assert from "node:assert/strict";
import { firstSteps, FIRST_STEP_GOALS } from "./firstSteps.js";
import { keyHint } from "./keys.js";

test("Primeiros passos: seven steps, each with a title and a text, buttons the console knows", () => {
    const steps = firstSteps((a) => keyHint(a, "on"));
    assert.equal(steps.length, 7);
    for (const s of steps) {
        assert.ok(s.title && s.text, s.title);
        if (s.go) assert.ok(FIRST_STEP_GOALS.includes(s.go.id), s.go.id);
    }
});

test("Primeiros passos: the keys follow the church's Teclas de uma letra", () => {
    const text = (letters) => firstSteps((a) => keyHint(a, letters)).map((s) => s.text).join(" ");
    assert.match(text("on"), /Tela preta \(B\), Logo \(L\) e Limpar \(C\)/);
    assert.match(text("on"), /A busca do topo \(\/\)/);
    assert.match(text("shift"), /Tela preta \(Shift\+B\)/);
    assert.match(text("off"), /Tela preta, Logo e Limpar ficam no Programa/);
    assert.match(text("off"), /A busca do topo \(Ctrl\+F\)/);
    // No English copy, no pt-PT forms (CLAUDE.md copy rules).
    assert.doesNotMatch(text("on"), /\b(ecrã|guardar|ficheiro|eliminar)\b/i);
});
