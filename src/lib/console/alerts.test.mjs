import test from "node:test";
import assert from "node:assert/strict";
import { alertCards, CHIP_MS } from "./alerts.js";

const hhmm = () => "19:40";

test("nothing wrong, nothing floats", () => {
    assert.deepEqual(alertCards({}), []);
    assert.ok(CHIP_MS >= 5000, "the card stays long enough to be read");
});

test("reconnecting: a live alert that never shrinks, Tela preta and Mostrar logo in the menu", () => {
    const [card, ...rest] = alertCards({ banner: { kind: "reconnecting", row: { id: "p1", key: "/Projection", name: "Projeção" } }, tries: 3, lastOkAt: 1, hhmm });
    assert.equal(rest.length, 0);
    assert.equal(card.role, "alert");
    assert.equal(card.title, "Projeção · Reconectando… tentativa 3");
    assert.equal(card.tip, "ATENÇÃO · última conexão boa às 19:40 · o monitor escolhido não está ligado");
    assert.equal(card.chip, null, "Reconectando never becomes a chip");
    assert.equal(card.main.label, "Ver saídas");
    assert.deepEqual(card.menu.map((m) => m.label), ["Tela preta", "Mostrar logo"]);
    // Another output's card has no "última conexão boa" (only the projector keeps lastOkAt).
    const [other] = alertCards({ banner: { kind: "reconnecting", row: { id: "l1", key: "/LyricProjection", name: "Letras" } }, tries: 1, lastOkAt: 1, hhmm });
    assert.equal(other.tip, "ATENÇÃO · o monitor escolhido não está ligado");
});

test("closed: Reabrir is the main action, the rest in the menu, the sub is the tooltip", () => {
    const banner = { kind: "closed", row: { id: "p1", droppedAt: 5 }, title: "Projeção fechada às 19:42", sub: "Reabrir mostra de novo o que está no ar", more: 1 };
    const [card] = alertCards({ banner, problems: 2 });
    assert.equal(card.title, "Projeção fechada às 19:42 · e mais 1");
    assert.equal(card.tip, banner.sub);
    assert.equal(card.chip, "2 telas");
    assert.equal(card.main.label, "Reabrir");
    assert.deepEqual(card.menu.map((m) => m.label), ["Ver saídas", "Esquecer"]);
    assert.ok(card.menu[1].title.includes("nesta sessão"));
});

test("disconnected: Ver saídas is the main action (there is nothing to reopen here)", () => {
    const banner = { kind: "disconnected", row: { id: "n1", droppedAt: 5 }, title: "Letras desconectada às 19:42", sub: "Rede · 192.168.0.4", more: 0 };
    const [card] = alertCards({ banner, problems: 1 });
    assert.equal(card.title, "Letras desconectada às 19:42");
    assert.equal(card.chip, "1 tela");
    assert.equal(card.main.label, "Ver saídas");
    assert.deepEqual(card.menu.map((m) => m.label), ["Esquecer"]);
});

test("locked: a status card with Destravar, the word Travadas as its chip", () => {
    const [card] = alertCards({ locked: true });
    assert.equal(card.role, "status");
    assert.equal(card.title, "Telas travadas");
    assert.match(card.tip, /Tela preta, Logo, Limpar e Esc continuam valendo/);
    assert.equal(card.chip, "Travadas");
    assert.equal(card.main.label, "Destravar");
    assert.equal(card.menu, null);
});

test("an output card and the locked card stack, the output first; a new droppedAt is a new id", () => {
    const banner = { kind: "closed", row: { id: "p1", droppedAt: 5 }, title: "t", sub: "s", more: 0 };
    const cards = alertCards({ banner, problems: 1, locked: true });
    assert.deepEqual(cards.map((c) => c.state), ["warn", "rh"]);
    const again = alertCards({ banner: { ...banner, row: { id: "p1", droppedAt: 9 } }, problems: 1 });
    assert.notEqual(cards[0].id, again[0].id, "dropping again enters as a full card");
});
