import test from "node:test";
import assert from "node:assert/strict";
import { buildMenus, flattenMenus, songInHand, nextMenu, MENU_IDS } from "./menuBar.js";

const find = (menus, id, label) => menus.find((m) => m.id === id).items.find((it) => it.label === label);

test("the bar: the four menus of the owner's pick, in order (Rodada D4, A; O topo; E0)", () => {
    const menus = buildMenus({});
    // Ver is the eye beside the bell, Ajuda is in the logo's menu (owner 2026-10-15).
    assert.deepEqual(menus.map((m) => m.label), ["Culto", "Música", "Mídia", "Ferramentas"]);
    assert.deepEqual(menus.map((m) => m.id), MENU_IDS);
    // Where each thing lives (the artifact's table).
    for (const [id, labels] of Object.entries({
        culto: ["Planejar o culto", "Novo culto", "Modelos de culto", "Exportar a setlist em PDF"],
        musica: ["Nova música", "Buscar letras na internet…", "Importar uma pasta…", "Sincronizar a música…", "Letra automática", "Temas"],
        midia: ["Mídia", "Enviar arquivos…", "Link do YouTube…", "Fundos"],
        ferramentas: ["Avisos", "Novo aviso", "Aviso rápido…", "Timers", "Escola bíblica", "Relatórios"],
    })) for (const l of labels) assert.ok(find(menus, id, l), `${id} › ${l}`);
    // No Telas menu (owner 2026-10-16): the screens' actions are the top
    // bar's chip, the logo's menu and the Saídas popover, never the bar.
    const all = menus.flatMap((m) => m.items.map((it) => it.label));
    for (const l of ["Saídas", "Travar telas", "Tela preta", "Logo", "Limpar texto", "Telas e saídas", "Verificar tudo"]) assert.ok(!all.includes(l), l);
});

test("items say their state and act through the console", () => {
    const calls = [];
    const act = new Proxy({}, { get: (_t, name) => (...args) => calls.push([name, ...args]) });
    const menus = buildMenus({
        act, serviceId: "s1", itemsCount: 3, locked: true, songId: "song9",
        services: [{ id: "s1", title: "Culto de domingo", date: "2026-10-18" }, { id: "s2", title: "Quarta" }],
        timers: [{ minutes: 5, label: "5 min" }], playerOn: true, playing: true,
        follow: { source: "clock", paused: true, clock: null },
    });
    const sunday = find(menus, "culto", "Culto de domingo");
    assert.equal(sunday.checked, true);
    assert.equal(sunday.kbd, "18/10");
    sunday.onSelect();
    find(menus, "musica", "Sincronizar a música…").onSelect();
    find(menus, "midia", "Pausar o player").onSelect();
    find(menus, "ferramentas", "Timers").sub[0].onSelect();
    // The live clock waits for Iniciar, refused while locked.
    const letra = find(menus, "musica", "Letra automática").sub;
    assert.equal(letra[0].label, "Segue o relógio ao vivo");
    assert.equal(letra[1].label, "Iniciar");
    assert.equal(letra[1].disabled, true);
    assert.deepEqual(calls, [["pickService", "s1"], ["syncSong", "song9"], ["playerToggle"], ["timer", 5]]);
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

// The Menu button's popover (Rodada M0): the bar's four menus as one list.
const labelsOf = (items) => items.flatMap((it) => [it.label, ...(it.sub ? labelsOf(it.sub) : [])]).filter(Boolean);
const flatLabels = (list) => list.map((it) => it.label ?? it.head).filter(Boolean);

test("flattenMenus: no item of the bar is lost (the logo's menu once lost 14 of 21)", () => {
    const ctx = {
        serviceId: "s1", itemsCount: 2, songId: "x", playerOn: true, follow: { source: "audio", paused: false },
        services: [{ id: "s1", title: "Culto A" }, { id: "s2", title: "Culto B" }],
        timers: [{ minutes: 5, label: "5 min" }, { minutes: 10, label: "10 min" }],
    };
    const menus = buildMenus(ctx);
    const flat = flattenMenus(menus);
    const got = flatLabels(flat);
    for (const m of menus) {
        assert.ok(got.includes(m.label), `head ${m.label}`);
        for (const l of labelsOf(m.items)) assert.ok(got.includes(l), `${m.id} › ${l}`);
    }
    // The empty bar loses nothing either (the placeholder rows).
    for (const l of labelsOf(buildMenus({}).flatMap((m) => m.items))) assert.ok(flatLabels(flattenMenus(buildMenus({}))).includes(l), l);
    // Menus are stacked: head first, a separator between menus.
    assert.deepEqual(flat.filter((it) => it.head != null && !it.minor).map((it) => it.head), ["Culto", "Música", "Mídia", "Ferramentas"]);
    assert.equal(flat.filter((it) => it.sep).length >= 3, true);
});

test("flattenMenus: submenus inline, state carried over, same handlers", () => {
    const calls = [];
    const act = new Proxy({}, { get: (_t, name) => (...args) => calls.push([name, ...args]) });
    const menus = buildMenus({ act, timers: [{ minutes: 5, label: "5 min" }], follow: { source: "clock", paused: true, clock: null }, locked: true, services: [{ id: "s1", title: "A", date: "2026-10-18" }], serviceId: "s1" });
    const flat = flattenMenus(menus);
    const at = (label) => flat.findIndex((it) => it.label === label || it.head === label);
    // A sub list sits right under its parent, which is no longer an item.
    const timers = at("Timers");
    assert.equal(flat[timers].minor, true);
    assert.equal(flat[timers].onSelect, undefined);
    assert.equal(flat[timers + 1].label, "5 min");
    assert.equal(flat[timers + 1].indent, true);
    flat[timers + 1].onSelect();
    // disabled / checked / kbd ride along unchanged.
    const iniciar = flat[at("Letra automática") + 2];
    assert.equal(iniciar.label, "Iniciar");
    assert.equal(iniciar.disabled, true);
    const svc = flat[at("A")];
    assert.equal(svc.checked, true);
    assert.equal(svc.kbd, "18/10");
    assert.equal(flat[at("Sincronizar a música…")].disabled, true);
    assert.deepEqual(calls, [["timer", 5]]);
});

test("flattenMenus: the services are capped, then Todos os cultos…", () => {
    const services = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, title: `Culto ${i}` }));
    let opened = 0;
    const flat = flattenMenus(buildMenus({ services, serviceId: "s0" }), { onAllServices: () => { opened += 1; } });
    const shown = flat.filter((it) => /^Culto \d$/.test(it.label || ""));
    assert.equal(shown.length, 5);
    assert.deepEqual(shown.map((it) => it.label), ["Culto 0", "Culto 1", "Culto 2", "Culto 3", "Culto 4"]);
    const all = flat.findIndex((it) => it.label === "Todos os cultos…");
    assert.equal(all, flat.indexOf(shown[4]) + 1, "right after the last service shown");
    flat[all].onSelect();
    assert.equal(opened, 1);
    // Few services: no extra row.
    assert.ok(!flattenMenus(buildMenus({ services: services.slice(0, 5) })).some((it) => it.label === "Todos os cultos…"));
    assert.equal(flattenMenus(buildMenus({ services }), { maxServices: 2 }).filter((it) => /^Culto \d$/.test(it.label || "")).length, 2);
});
