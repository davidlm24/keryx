// node --test src/lib/console/gerarView.test.mjs   (npm test)
import test from "node:test";
import assert from "node:assert/strict";
import { gerarPage, agoWords, gerarWho, gerarBadge, gerarProgress, needsWords, linkErrorTone, gerarMenuItem, gerarSummary, gerarLibraryLine } from "./gerarView.js";

const NOW = Date.parse("2026-11-18T19:00:00Z");
const on = { configured: true, state: "on", device: { id: "d1", name: "PC do som" }, receive: true, lastSeen: "2026-11-18T18:59:48Z" };

test("the page follows the main process's state", () => {
    assert.equal(gerarPage(null), "off");
    assert.equal(gerarPage({ configured: false, state: "off" }), "unconfigured");
    assert.equal(gerarPage({ configured: true, state: "off", device: null }), "off");
    assert.equal(gerarPage({ configured: true, state: "connecting", device: null }), "connecting");
    assert.equal(gerarPage(on), "on");
    assert.equal(gerarPage({ ...on, state: "offline" }), "offline");
    assert.equal(gerarPage({ ...on, state: "needs", needs: { reason: "revoked" } }), "needs");
});

test("the lines of a connected computer", () => {
    assert.equal(agoWords("2026-11-18T18:59:48Z", NOW), "há 12 s");
    assert.equal(agoWords("2026-11-18T18:57:00Z", NOW), "há 3 min");
    assert.equal(agoWords("2026-11-16T19:00:00Z", NOW), "há 2 dias");
    assert.equal(agoWords("", NOW), "");
    assert.equal(gerarWho(on, NOW), "Este computador é “PC do som” no GERAR · último contato há 12 s");
    assert.deepEqual(gerarBadge("on"), { dot: "ok", words: "conectado" });
    assert.deepEqual(gerarBadge("needs"), { dot: "need", words: "precisa de você" });
    assert.equal(gerarProgress(on, NOW).line, "Em dia · último contato há 12 s");
    assert.equal(gerarProgress({ ...on, state: "offline" }, NOW).tone, "wait");
    assert.equal(gerarProgress({ ...on, pending: 2 }, NOW).line, "Subindo · último contato há 12 s · 2 respostas esperando para subir");
    assert.equal(gerarProgress({ ...on, state: "offline", pending: 1 }, NOW).line, "Sem contato com o GERAR · 1 resposta esperando para subir");
});

test("precisa de você says why: disconnected there, or the session refused", () => {
    assert.match(needsWords({ needs: { reason: "revoked" } }), /administrador desconectou/);
    assert.match(needsWords({ needs: { reason: "session" } }), /não aceita mais a sessão/);
    assert.equal(linkErrorTone("invalid"), "need");
    assert.equal(linkErrorTone("offline"), "warn");
});

test("the menu item: a red dot only while it needs you (D4 = A); none on a KERYX not prepared", () => {
    assert.equal(gerarMenuItem({ configured: false }), null);
    assert.equal(gerarMenuItem(on).dot, undefined);
    const needs = gerarMenuItem({ ...on, state: "needs" });
    assert.equal(needs.dot, "precisa de você");
    assert.equal(needs.dotKind, "danger");
    assert.match(gerarMenuItem({ configured: true, state: "off" }).title, /^Conectar/);
});

test("the summary", () => {
    assert.equal(gerarSummary({ configured: true, state: "off" }), "não conectado");
    assert.equal(gerarSummary(on), "“PC do som” · recebe os pedidos aqui");
    assert.equal(gerarSummary({ ...on, receive: false }), "“PC do som” · não recebe aqui");
    assert.equal(gerarSummary({ ...on, state: "needs" }), "“PC do som” · precisa de você");
});

test("the library line (C8): how many items, when; or who publishes it", () => {
    assert.equal(gerarLibraryLine({ ...on, library: { count: 132, at: "2026-11-18T18:58:00Z" } }, NOW), "Biblioteca no GERAR: 132 itens · publicada há 2 min");
    assert.equal(gerarLibraryLine({ ...on, library: { count: 1, at: "" } }, NOW), "Biblioteca no GERAR: 1 item");
    assert.equal(gerarLibraryLine({ ...on, library: null }, NOW), "Biblioteca no GERAR: ainda não publicada");
    assert.equal(gerarLibraryLine({ ...on, receive: false }, NOW), "Biblioteca no GERAR: publicada pelo computador que recebe os pedidos");
    assert.equal(gerarLibraryLine({ configured: true, state: "off" }, NOW), null);
});
