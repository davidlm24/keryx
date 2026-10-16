import test from "node:test";
import assert from "node:assert/strict";
import { focusesCancel } from "./confirm.js";

test("a question that deletes or throws work away opens on Cancelar (C-10)", () => {
    assert.equal(focusesCancel({ title: "Excluir a música?" }), true, "no ok: the action is Excluir");
    assert.equal(focusesCancel({ ok: "Excluir" }), true);
    assert.equal(focusesCancel({ ok: "Descartar" }), true, "Descartar as mudanças?");
    assert.equal(focusesCancel(), true);
});

test("other actions keep the focus on the action unless they say danger", () => {
    for (const ok of ["Tirar", "Remover", "Sair", "Escolher a pasta", "Distribuir"]) assert.equal(focusesCancel({ ok }), false, ok);
    for (const ok of ["Trocar o código", "Juntar", "Substituir", "Voltar ao padrão", "Tirar"]) assert.equal(focusesCancel({ ok, danger: true }), true, ok);
    assert.equal(focusesCancel({ ok: "Excluir", danger: false }), false, "danger: false overrides the verb");
});
