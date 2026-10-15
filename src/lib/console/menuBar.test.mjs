import test from "node:test";
import assert from "node:assert/strict";
import { buildMenus, songInHand, nextMenu, MENU_IDS } from "./menuBar.js";

const find = (menus, id, label) => menus.find((m) => m.id === id).items.find((it) => it.label === label);

test("the bar: the five menus of the owner's pick, in order (Rodada D4, A; O topo)", () => {
    const menus = buildMenus({});
    // Ver is the eye beside the bell, Ajuda is in the logo's menu (owner 2026-10-15).
    assert.deepEqual(menus.map((m) => m.label), ["Culto", "Música", "Mídia", "Telas", "Ferramentas"]);
    assert.deepEqual(menus.map((m) => m.id), MENU_IDS);
    // Where each thing lives (the artifact's table).
    for (const [id, labels] of Object.entries({
        culto: ["Planejar o culto", "Novo culto", "Modelos de culto…", "Exportar a setlist em PDF"],
        musica: ["Nova música", "Buscar letras na internet…", "Importar uma pasta…", "Sincronizar a música…", "Letra automática", "Temas…"],
        midia: ["Biblioteca de mídia", "Enviar arquivos…", "Link do YouTube…", "Fundos"],
        telas: ["Saídas", "Travar telas", "Tela preta", "Logo", "Limpar texto", "Telas e saídas…", "Telas na rede…", "Verificar tudo"],
        ferramentas: ["Avisos", "Novo aviso", "Aviso rápido…", "Timers", "Escola bíblica", "Relatórios"],
    })) for (const l of labels) assert.ok(find(menus, id, l), `${id} › ${l}`);
});

test("items say their state and act through the console", () => {
    const calls = [];
    const act = new Proxy({}, { get: (_t, name) => (...args) => calls.push([name, ...args]) });
    const menus = buildMenus({
        act, serviceId: "s1", itemsCount: 3, locked: true, screen: "black", songId: "song9",
        services: [{ id: "s1", title: "Culto de domingo", date: "2026-10-18" }, { id: "s2", title: "Quarta" }],
        timers: [{ minutes: 5, label: "5 min" }], playerOn: true, playing: true,
        follow: { source: "clock", paused: true, clock: null },
    });
    const sunday = find(menus, "culto", "Culto de domingo");
    assert.equal(sunday.checked, true);
    assert.equal(sunday.kbd, "18/10");
    sunday.onSelect();
    assert.equal(find(menus, "telas", "Travar telas").checked, true);
    find(menus, "telas", "Travar telas").onSelect();
    assert.equal(find(menus, "telas", "Tela preta").checked, true);
    find(menus, "musica", "Sincronizar a música…").onSelect();
    find(menus, "midia", "Pausar o player").onSelect();
    find(menus, "ferramentas", "Timers").sub[0].onSelect();
    // The live clock waits for Iniciar, refused while locked.
    const letra = find(menus, "musica", "Letra automática").sub;
    assert.equal(letra[0].label, "Segue o relógio ao vivo");
    assert.equal(letra[1].label, "Iniciar");
    assert.equal(letra[1].disabled, true);
    assert.deepEqual(calls, [["pickService", "s1"], ["lock", false], ["syncSong", "song9"], ["playerToggle"], ["timer", 5]]);
});

test("what is off when there is nothing to act on", () => {
    const menus = buildMenus({});
    assert.equal(find(menus, "musica", "Sincronizar a música…").disabled, true);
    assert.equal(find(menus, "culto", "Exportar a setlist em PDF").disabled, true);
    assert.equal(find(menus, "midia", "Tocar o player").disabled, true);
    assert.equal(find(menus, "musica", "Letra automática").sub[0].disabled, true);
    assert.equal(find(menus, "culto", "Nenhum culto ainda").disabled, true);
    const playing = buildMenus({ follow: { source: "audio", paused: false } });
    assert.equal(find(playing, "musica", "Letra automática").sub[1].label, "Pausar");
    const paused = buildMenus({ follow: { source: "video", paused: true } });
    assert.equal(find(paused, "musica", "Letra automática").sub[1].label, "Retomar");
});

test("the song in hand and moving between menus", () => {
    assert.equal(songInHand({ id: "song:a1" }, null), "a1");
    assert.equal(songInHand({ id: "passage:x" }, { content: { kind: "lyrics", ref: { songId: "b2" } } }), "b2");
    assert.equal(songInHand(null, { content: { kind: "bible", ref: {} } }), null);
    assert.equal(nextMenu("culto", -1), "ferramentas");
    assert.equal(nextMenu("ferramentas", 1), "culto");
    assert.equal(nextMenu("x", 1), "culto");
});
