import test from "node:test";
import assert from "node:assert/strict";
import { remember, forget, outputHealth, rowStatus, netId, localId, showsOn, byGroup, groupOf } from "./outputs.js";

const proj = (open, missing = false) => ({ key: "/Projection", label: "Projeção", open, placement: { mode: "fullscreen", displayId: 2, missing } });
const stage = (open) => ({ key: "/StageView", label: "Palco", open, placement: { mode: "window", displayId: null, missing: false } });
const tv = { ip: "::ffff:192.168.0.24", screen: "/LyricProjection", label: "Letras", agent: "SmartTV", since: "a" };
const at = (h, m) => new Date(2026, 9, 9, h, m).getTime();

test("live with nothing open: amber, never a green zero", () => {
    const h = outputHealth({ outputs: [proj(false), stage(false)], seen: {} });
    assert.deepEqual(h.status, { label: "Nenhuma saída aberta", compact: "Nenhuma tela", state: "warn" });
    assert.deepEqual(h.onAir, { text: "em nenhuma tela", short: "nenhuma tela", warn: true });
    assert.equal(h.banner, null); // never opened this session: nothing dropped
    assert.equal(h.rows.find((r) => r.key === "/Projection").state, "unused");
});

test("everything there: the count, and what each one shows", () => {
    const seen = remember({}, { outputs: [proj(true)], clients: [tv] }, at(19, 0));
    const h = outputHealth({ outputs: [proj(true), stage(false)], seen, air: "Canto · 2/6" });
    assert.equal(h.status.label, "Saídas · 2 conectadas");
    assert.equal(h.status.compact, "2 telas", "what the top bar shows");
    assert.equal(h.status.state, "");
    assert.deepEqual(h.onAir, { text: "em 2 telas", short: "2 telas", warn: false });
    assert.equal(h.rows.find((r) => r.key === "/Projection").shows, "Canto · 2/6");
    assert.equal(h.rows.find((r) => !r.local).shows, "Canto · 2/6");
    assert.equal(h.rows.find((r) => !r.local).ip, "192.168.0.24");
});

test("a network screen that drops stays as Desconectada until it comes back", () => {
    let seen = remember({}, { outputs: [proj(true)], clients: [tv] }, at(19, 0));
    seen = remember(seen, { outputs: [proj(true)], clients: [] }, at(19, 42));
    const h = outputHealth({ outputs: [proj(true)], seen, air: "Canto" });
    const row = h.rows.find((r) => !r.local);
    assert.equal(row.state, "disconnected");
    assert.equal(h.status.label, "Saídas · 1 com problema");
    assert.equal(h.status.compact, "1 com problema");
    assert.equal(h.status.state, "warn");
    assert.deepEqual(h.onAir, { text: "em 1 de 2 telas", short: "1 de 2 telas", warn: true });
    assert.equal(h.banner.kind, "disconnected");
    assert.equal(h.banner.title, "Letras desconectada às 19:42");
    assert.equal(h.banner.sub, "Rede · 192.168.0.24 · a outra tela continua no ar");
    // It reconnects (a new "since", same address and page): connected again.
    seen = remember(seen, { outputs: [proj(true)], clients: [{ ...tv, since: "b" }] }, at(19, 43));
    assert.equal(outputHealth({ outputs: [proj(true)], seen }).problems, 0);
});

test("the drop time is kept, not moved by later polls", () => {
    let seen = remember({}, { clients: [tv] }, at(19, 0));
    seen = remember(seen, { clients: [] }, at(19, 42));
    const again = remember(seen, { clients: [] }, at(19, 50));
    assert.equal(again, seen); // nothing changed: the same object, no re-render
    assert.equal(again[netId(tv)].droppedAt, at(19, 42));
});

test("a poll that could not read the network judges no screen gone", () => {
    const seen = remember({}, { clients: [tv] }, at(19, 0));
    const after = remember(seen, { outputs: [proj(true)], clients: null }, at(19, 1));
    assert.equal(after[netId(tv)].droppedAt, null);
    assert.equal(after[localId("/Projection")].droppedAt, null);
});

test("an output window that closes is Fechada with Reabrir; it clears when reopened", () => {
    let seen = remember({}, { outputs: [proj(true)] }, at(19, 0));
    seen = remember(seen, { outputs: [proj(false)] }, at(19, 30));
    let h = outputHealth({ outputs: [proj(false)], seen });
    assert.equal(h.rows[0].state, "closed");
    assert.equal(h.banner.kind, "closed");
    assert.equal(h.banner.title, "Projeção fechada às 19:30");
    assert.deepEqual(h.onAir, { text: "em nenhuma tela", short: "nenhuma tela", warn: true });
    seen = remember(seen, { outputs: [proj(true)] }, at(19, 31));
    h = outputHealth({ outputs: [proj(true)], seen });
    assert.equal(h.rows[0].state, "connected");
    assert.equal(h.banner, null);
});

test("closed on purpose: forgotten, no warning", () => {
    let seen = remember({}, { outputs: [proj(true)] }, at(19, 0));
    seen = forget(seen, localId("/Projection"));
    seen = remember(seen, { outputs: [proj(false)] }, at(19, 5));
    const h = outputHealth({ outputs: [proj(false)], seen });
    assert.equal(h.rows[0].state, "unused");
    assert.equal(h.banner, null);
    assert.equal(forget(seen, "nada"), seen);
});

test("the projector on the wrong monitor wins the banner", () => {
    let seen = remember({}, { outputs: [proj(true)], clients: [tv] }, at(19, 0));
    seen = remember(seen, { outputs: [proj(true, true)], clients: [] }, at(19, 10));
    const h = outputHealth({ outputs: [proj(true, true)], seen, tries: 3 });
    assert.equal(h.banner.kind, "reconnecting");
    assert.equal(h.banner.tries, 3);
    assert.equal(h.problems, 2);
});

test("Telas travadas: blue status unless something is wrong; the Programa still says where it is", () => {
    const seen = remember({}, { outputs: [proj(true)] }, at(19, 0));
    let h = outputHealth({ outputs: [proj(true)], seen, locked: true });
    assert.deepEqual(h.status, { label: "Telas travadas", compact: "Travadas", state: "rh" });
    assert.deepEqual(h.onAir, { text: "em 1 tela", short: "1 tela", warn: false });
    // A dropped output still wins: amber over blue.
    const dropped = remember(seen, { outputs: [proj(false)] }, at(19, 1));
    h = outputHealth({ outputs: [proj(false)], seen: dropped, locked: true });
    assert.equal(h.status.state, "warn");
    // Unlocked is the default.
    assert.equal(outputHealth({ outputs: [proj(true)], seen }).status.label, "Saídas · 1 conectada");
});

test("a removed output is no row, no count, no banner; its network screen still is", () => {
    // Palco removed while a TV on the network shows /StageView.
    const palcoTv = { ip: "::ffff:192.168.0.40", screen: "/StageView", label: "Palco", agent: "SmartTV", since: "a" };
    const seen = remember({}, { outputs: [proj(true)], clients: [palcoTv] }, at(19, 0));
    const h = outputHealth({ outputs: [proj(true), { ...stage(false), removed: true }], seen, air: "Canto" });
    assert.ok(!h.rows.some((r) => r.local && r.key === "/StageView"), "no local row");
    assert.equal(h.status.label, "Saídas · 2 conectadas", "the projector and the network TV");
    assert.equal(h.banner, null);
    assert.equal(h.rows.find((r) => !r.local).screen, "/StageView", "the network screen stays");
    // Even one that was open and dropped: removed wins, no Fechada nag.
    let dropped = remember({}, { outputs: [stage(true)] }, at(19, 0));
    dropped = remember(dropped, { outputs: [stage(false)] }, at(19, 30));
    assert.equal(outputHealth({ outputs: [{ ...stage(false), removed: true }], seen: dropped }).banner, null);
});

test("rowStatus: one switch and one text per row", () => {
    const local = (state, droppedAt = null) => ({ local: true, state, droppedAt });
    assert.deepEqual(rowStatus(local("connected")), { switchOn: true, text: "Aberta", tone: "ok", hint: null });
    assert.deepEqual(rowStatus(local("connected"), { locked: true }), { switchOn: true, text: "Aberta · travada", tone: "rh", hint: null });
    assert.deepEqual(rowStatus(local("reconnecting")), { switchOn: true, text: "Tela desligada", tone: "warn", hint: "mostrando numa janela até ela ligar" });
    assert.deepEqual(rowStatus(local("unused")), { switchOn: false, text: "Fechada", tone: "off", hint: null });
    const closed = rowStatus(local("closed", at(19, 42)));
    assert.equal(closed.switchOn, false);
    assert.equal(closed.text, "Fechada");
    assert.equal(closed.hint, "caiu às 19:42");
    // Network rows have no switch.
    assert.equal(rowStatus({ local: false, state: "connected" }).switchOn, null);
    const off = rowStatus({ local: false, state: "disconnected", droppedAt: at(19, 42) });
    assert.equal(off.text, "Desconectada às 19:42");
    assert.equal(off.tone, "warn");
});

test("what a page shows", () => {
    assert.equal(showsOn("/Projection", "Tela preta"), "Tela preta");
    assert.equal(showsOn("/StageView", "x"), "atual, próximo e relógio");
    assert.equal(showsOn("/VideoProjection", "x"), "Só os vídeos enviados");
    assert.equal(showsOn("/Desconhecida", ""), "nada");
});

test("outputs group by what they are for: Público, Palco, Transmissão", () => {
    const stream = { ...tv, ip: "::ffff:192.168.0.30", screen: "/StreamView", label: "Transmissão", agent: "OBS" };
    const seen = remember({}, { outputs: [proj(true), stage(true)], clients: [tv, stream] }, at(19, 0));
    const h = outputHealth({ outputs: [proj(true), stage(true)], seen, air: "Canto" });
    const groups = byGroup(h.rows, (r) => (r.local ? r.key : r.screen));
    assert.deepEqual(groups.map((g) => [g.label, g.items.map((r) => r.name)]), [
        ["Público", ["Projeção", "Letras"]],
        ["Palco", ["Palco"]],
        ["Transmissão", ["Transmissão"]],
    ]);
    assert.equal(h.rows.find((r) => r.screen === "/StreamView").shows, "só o texto, em legenda");
    // Empty groups are left out; an unknown page counts as Público.
    assert.deepEqual(byGroup([{ p: "/Nova" }], (x) => x.p).map((g) => g.key), ["publico"]);
    assert.equal(groupOf("/PastorView"), "palco");
});
