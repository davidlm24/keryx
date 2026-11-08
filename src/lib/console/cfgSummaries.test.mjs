import test from "node:test";
import assert from "node:assert/strict";
import {
    somSummary, enderecosSummary, phonesSummary, connectedSummary, themesSummary, fundosSummary, idleSummary, fontsSummary,
    importSummary, biblesSummary, wallpaperSummary, templatesSummary, teamSummary, shortcutsSummary, machineSummary, dataSummary, updatesSummary,
} from "./cfgSummaries.js";

test("Som e YouTube: the chime's volume and the YouTube bar", () => {
    assert.equal(somSummary({ chime_on: true, chime_volume: 35, youtube_hide_title: true }), "Sino Médio · YouTube sem título");
    assert.equal(somSummary({ chime_on: true, chime_volume: 100, youtube_hide_title: false }), "Sino Máximo · YouTube com título");
    assert.equal(somSummary({ chime_on: false, chime_volume: 60, youtube_hide_title: true }), "Sino desligado · YouTube sem título");
    assert.equal(somSummary({ chime_on: true, chime_volume: 47, youtube_hide_title: true }), "Sino Médio · YouTube sem título", "a volume off the list reads as the middle one");
    assert.equal(somSummary(null), "");
});

test("Telas na rede: addresses, the controle remoto, who is connected", () => {
    assert.equal(enderecosSummary({ running: false }), "Desligado");
    assert.equal(enderecosSummary({ running: true, urls: [{}, {}], screens: [{}] }), "2 endereços · 1 tela");
    // KERYX no celular: the main switch, then which doors are open.
    const both = { phones: { enabled: true }, remote: { enabled: true }, team: { enabled: true } };
    assert.equal(phonesSummary({ ...both, phones: { enabled: false } }, 3), "Desligado");
    assert.equal(phonesSummary({}, 0), "Desligado");
    assert.equal(phonesSummary(both, 0), "Ligado · Controle e Equipe · nenhum celular agora");
    assert.equal(phonesSummary(both, 1), "Ligado · Controle e Equipe · 1 celular conectado");
    assert.equal(phonesSummary({ ...both, team: { enabled: false } }, 2), "Ligado · só o Controle · 2 celulares conectados");
    assert.equal(phonesSummary({ ...both, remote: { enabled: false } }, 0), "Ligado · só a Equipe · nenhum celular agora");
    assert.equal(connectedSummary([], true), "Nenhuma agora");
    assert.equal(connectedSummary([], false), "Desligado");
    assert.equal(connectedSummary([{}, {}], true), "2 conectadas");
});

test("Temas e fundos", () => {
    assert.equal(themesSummary([]), "Nenhum tema ainda");
    assert.equal(themesSummary([{ name: "Azul", is_default: true }, { name: "Verde" }]), "2 temas · padrão Azul");
    assert.equal(themesSummary([{ is_default: true }]), "1 tema · com tema padrão", "an unnamed theme is never named");
    assert.equal(fundosSummary(["Natureza", "Outros"]), "2 categorias: Natureza · Outros");
    assert.equal(fundosSummary([]), "Imagens, vídeos, gerados e cores");
    assert.equal(idleSummary("black", true), "Preto · com ajustes");
    assert.equal(idleSummary("logo", false), "Logo da igreja");
    assert.equal(idleSummary("logo", { bg: "color" }), "Logo da igreja · com ajustes");
    assert.equal(idleSummary("logo", { bg: "media", media: { kind: "image", value: "x", name: "Cruz" } }), "Logo da igreja · Da biblioteca · Cruz");
    assert.equal(idleSummary("logo", { bg: "media", media: { kind: "video", value: "x", name: "" } }), "Logo da igreja · Da biblioteca");
    assert.equal(fontsSummary(0), "Nenhuma ainda");
    assert.equal(fontsSummary(2), "2 fontes");
});

test("Bíblia e músicas", () => {
    assert.equal(importSummary({ import_lines: 0 }), "Letras: uma estrofe por slide");
    assert.equal(importSummary({ bible_book_names: "full", import_lines: 4 }), "Letras: 4 linhas por slide");
    assert.equal(importSummary({ import_lines: 1 }), "Letras: 1 linha por slide");
    assert.equal(biblesSummary("NVI", 2), "NVI em uso · 2 instaladas neste computador");
    assert.equal(biblesSummary("ARA", 0), "ARA em uso · nenhuma instalada");
    assert.equal(biblesSummary("", 1), "1 instalada neste computador");
});

test("Culto", () => {
    assert.equal(wallpaperSummary(true), "Papel de parede da igreja");
    assert.equal(wallpaperSummary(false), "Tela ociosa");
    assert.equal(templatesSummary(0), "Nenhum ainda");
    assert.equal(templatesSummary(3), "3 modelos");
    assert.equal(teamSummary([]), "Ninguém ainda");
    assert.equal(teamSummary([{ active: true }, { active: false }, {}]), "3 pessoas · 2 ativas");
    assert.equal(teamSummary([{}]), "1 pessoa");
});

test("Console", () => {
    assert.equal(shortcutsSummary("shift"), "Teclas de uma letra com Shift");
    assert.equal(shortcutsSummary("off"), "Teclas de uma letra desligadas");
    assert.equal(shortcutsSummary("whatever"), "Teclas de uma letra ligadas");
    assert.equal(machineSummary({ zoom: 1.1, confirmClose: true, login: { on: true } }), "Zoom 110 % · pergunta ao fechar · abre com o Windows");
    assert.equal(machineSummary({ confirmClose: false }), "fecha sem perguntar");
    assert.equal(machineSummary(null), "");
});

test("Backup e atualizações", () => {
    assert.equal(dataSummary("412 MB"), "Pasta de dados 412 MB · exportar e importar · suporte");
    assert.equal(dataSummary(""), "Pasta de dados · exportar e importar · suporte");
    assert.equal(updatesSummary({ version: "0.2.19", update: { auto: true } }), "KERYX 0.2.19 · atualiza sozinho");
    assert.equal(updatesSummary({ version: "0.2.19", update: { auto: false } }), "KERYX 0.2.19 · atualização manual");
    assert.equal(updatesSummary({ version: "0.2.19", update: { status: "disabled" } }), "KERYX 0.2.19 · atualização indisponível");
});
