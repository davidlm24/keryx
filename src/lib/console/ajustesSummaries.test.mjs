import test from "node:test";
import assert from "node:assert/strict";
import { placementShort, destinoSummary, partsSummary, aparenciaSummary, conteudoSummary, kindsSummary, nomeIconeSummary, alertSummary, COMPORTAMENTO_SUMMARY, diagnosticoSummary, netClientsLine, estadoText, ajustesLine, showsNowText } from "./ajustesSummaries.js";
import { normalizePref, defaultRule } from "../outputPrefs.js";
import { ruleKindOf, ruleKind } from "../contentKinds.js";

const two = (id) => (id === 22 ? 2 : 0);

test("Destino: where the screen opens, in one line", () => {
    assert.equal(placementShort(null), "Automático");
    assert.equal(placementShort({ target: "window" }), "Numa janela");
    assert.equal(placementShort({ target: { id: 22 } }, two), "Tela 2");
    assert.equal(placementShort({ target: { id: 9 } }, two), "tela desligada");
    assert.equal(destinoSummary({ name: "Palco", assignment: { target: { id: 22 }, openAtLaunch: true }, number: two }), "Palco · Tela 2 · abre ao iniciar");
    assert.equal(destinoSummary({ name: "Letras", assignment: { target: "auto", openAtLaunch: false } }), "Letras · Automático");
    assert.equal(destinoSummary({ name: "Transmissão", network: true }), "Transmissão · só na rede");
});

test("Conteúdo of the Palco and the Pastor: the parts of the design that are on", () => {
    assert.equal(partsSummary("/StageView", normalizePref(null)), "Todas as partes");
    assert.equal(partsSummary("/StageView", normalizePref({ options: { chords: false } })), "4 de 5 partes");
    assert.equal(partsSummary("/PastorView", normalizePref(null)), "2 de 4 partes", "the Pastor shows no chords or part names unless asked");
    assert.equal(partsSummary("/PastorView", normalizePref({ options: { chords: true, labels: true } })), "Todas as partes");
    assert.equal(partsSummary("/PastorView", normalizePref({ options: { clock: false, next_count: 0 } })), "Nenhuma parte");
});

test("Aparência: theme, text scale and margins", () => {
    assert.equal(aparenciaSummary({ page: "/Projection", pref: normalizePref(null) }), "Tema do console · texto 100% · margens 0");
    assert.equal(aparenciaSummary({ page: "/LyricProjection", pref: normalizePref({ text_scale: 115, margin_pct: 5 }), themeName: "Culto azul" }), "Culto azul · texto 115% · margens 5%");
    assert.equal(aparenciaSummary({ page: "/VideoProjection", pref: normalizePref(null) }), "O mesmo da Projeção · texto 100% · margens 0");
    assert.equal(aparenciaSummary({ page: "/StreamView", pref: normalizePref({ options: { position: "top", size: "l" } }) }), "Faixa no alto · texto G");
    assert.equal(aparenciaSummary({ page: "/StreamView", pref: normalizePref(null) }), "Faixa embaixo · texto automático");
});

test("Conteúdo carries Sem item da lista; the folded rows say what is chosen (owner 2026-10-27, T2–T4)", () => {
    assert.equal(conteudoSummary({ empty: "black" }, "Vídeos"), "Vídeos · sem item: tela preta");
    assert.equal(conteudoSummary(defaultRule("/Projection"), "Tudo · por cima: Aviso rápido, Logo"), "Tudo · por cima: Aviso rápido, Logo");
    assert.equal(kindsSummary(defaultRule("/Projection"), 9), "9 de 9 tipos · por cima: Aviso rápido, Logo");
    assert.equal(kindsSummary({ kinds: ["notice"], top: { alert: false, logo: false } }, 9), "1 de 9 tipos · nada por cima");
    assert.equal(nomeIconeSummary({ name: "Telão", icon: "tv" }), "Telão · ícone próprio");
    assert.equal(nomeIconeSummary({ name: "Projeção", icon: "" }), "Projeção · ícone padrão");
    assert.equal(alertSummary({ style: "band", position: "top", entrance: "slide", size: "m" }), "Faixa âmbar no alto · desliza");
    assert.equal(alertSummary({ style: "pill", position: "bottom", entrance: "none", size: "l" }, { amber: false }), "Pílula embaixo · sem entrada · G");
    assert.equal(alertSummary({ style: "band" }, { hidden: true }), "não aparece nesta saída");
    assert.equal(COMPORTAMENTO_SUMMARY, "Já faz sozinho: monitor, rede e tela ligada");
});

test("Diagnóstico", () => {
    assert.equal(diagnosticoSummary({ output: { open: true, placement: {} }, clients: 2 }), "Aberta · 2 telas na rede");
    assert.equal(diagnosticoSummary({ output: { open: false, placement: {} }, clients: 0 }), "Fechada");
    assert.equal(diagnosticoSummary({ output: { open: true, placement: { missing: true } }, clients: 1 }), "Tela desligada · 1 tela na rede");
    assert.equal(diagnosticoSummary({ output: null, clients: 0 }), "Nenhuma tela mostra esta página");
    assert.equal(netClientsLine(2, true), "2 telas mostram esta página");
    assert.equal(netClientsLine(1, true), "1 tela mostra esta página");
    assert.equal(netClientsLine(0, true), "Nenhuma tela na rede mostra esta página");
    assert.equal(netClientsLine(0, false), "As telas na rede estão desligadas");
});

test("Diagnóstico › Estado, Ajustes and what the screen shows now", () => {
    assert.equal(estadoText({ open: true, placement: { mode: "fullscreen", displayId: 22 } }, two), "Aberta · tela cheia na Tela 2");
    assert.equal(estadoText({ open: true, placement: { mode: "window" } }), "Aberta · numa janela");
    assert.equal(estadoText({ open: false, placement: {} }), "Fechada");
    assert.equal(estadoText({ open: true, placement: { missing: true } }), "Tela desligada · a saída volta quando ela ligar");
    assert.equal(estadoText(null), "Esta página só existe na rede");
    assert.equal(ajustesLine({ defaultSettings: false, ownDesign: true }), "com ajustes · desenho próprio");
    assert.equal(ajustesLine({ defaultSettings: true, ownDesign: false }), "padrão");
    const helpers = { kindOf: ruleKindOf, label: (k) => ruleKind(k).label };
    const letras = defaultRule("/LyricProjection");
    assert.equal(showsNowText({ content: { kind: "lyrics" } }, letras, helpers), "Mostrando Letras");
    assert.equal(showsNowText({ media: { kind: "youtube" } }, letras, helpers), "YouTube não está no que esta tela recebe: mostra o papel de parede");
    assert.equal(showsNowText({ media: { kind: "image" } }, { ...letras, empty: "black" }, helpers), "Imagens não está no que esta tela recebe: mostra a tela preta");
    assert.equal(showsNowText({}, letras, helpers), "Nada no ar");
    assert.equal(showsNowText({ screen: "black", content: { kind: "lyrics" } }, letras, helpers), "Tela preta");
});
