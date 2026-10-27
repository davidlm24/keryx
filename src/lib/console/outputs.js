// Output health: what the Saídas status, its popover, the Programa caption
// and the warning banner say. Three questions kept apart
// (the 2026-10-09 presenter proposal, "Output state"):
//   1. are the screens following? (Travar telas: the status says so)
//   2. are the destinations there?   the status and the rows
//   3. what is each one showing?     the rows' "Mostra" line
//
// The main process only says what is open now, and a network screen that
// drops simply leaves the list. So the console keeps a memory of this
// session: every output window that was open and every network screen that
// connected. One that disappears stays as Fechada / Desconectada (a problem)
// until it comes back or the operator forgets it. Pure; tested in
// outputs.test.mjs.

const LOCAL = "local:";
const NET = "net:";

// A network screen is the same screen when it reconnects from the same
// address showing the same page (its "since" changes on every reconnect).
export const netId = (client) => `${NET}${String(client.ip || "").replace(/^::ffff:/, "")}|${client.screen || ""}`;
export const localId = (key) => `${LOCAL}${key}`;

// The session memory after one poll. `outputs` are the main process's output
// windows ({ key, label, open }), `clients` the network screens connected
// now ({ ip, screen, label, agent }); null when the network could not be
// read this time (then no screen is judged gone). Returns the same object
// when nothing changed, so a poll that finds everything as it was does not
// re-render.
export function remember(seen, { outputs = [], clients = null }, now) {
    let next = seen;
    const put = (id, value) => {
        const was = next[id];
        if (was && Object.keys(value).every((k) => was[k] === value[k])) return;
        if (next === seen) next = { ...seen };
        next[id] = value;
    };
    for (const o of outputs) {
        const id = localId(o.key);
        const was = seen[id];
        if (o.open) put(id, { kind: "local", key: o.key, name: o.label || o.key, droppedAt: null });
        else if (was && !was.droppedAt) put(id, { ...was, droppedAt: now });
    }
    if (!clients) return next;
    const present = new Set();
    for (const cl of clients) {
        const id = netId(cl);
        present.add(id);
        put(id, { kind: "net", key: id, name: cl.label || "Tela na rede", ip: String(cl.ip || "").replace(/^::ffff:/, ""), screen: cl.screen || "", agent: cl.agent || "", droppedAt: null });
    }
    for (const [id, v] of Object.entries(seen)) {
        if (v.kind === "net" && !present.has(id) && !v.droppedAt) put(id, { ...v, droppedAt: now });
    }
    return next;
}

// The operator closed it on purpose, or does not want the warning any more.
export function forget(seen, id) {
    if (!(id in seen)) return seen;
    const next = { ...seen };
    delete next[id];
    return next;
}

// Whether a poll's answer (the main process's displays and output windows)
// says the same as the last one. Every answer is a new object over IPC;
// keeping the old one lets a poll that finds everything as it was leave the
// console alone, as remember does for the session memory. Plain data; a key
// order that differs counts as a change, which only costs one render.
export function sameAnswer(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    try {
        return JSON.stringify(a) === JSON.stringify(b);
    } catch {
        return false;
    }
}

const hhmm = (t) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// What a destination shows, by the page it renders. `air` is the Programa's
// own words for what is on air ("Canto do console · 2/6", "Tela preta", …).
const SHOWS = {
    "/Projection": (air) => air,
    "/LyricProjection": (air) => air,
    "/StageView": () => "atual, próximo e relógio",
    "/VideoProjection": () => "Só os vídeos enviados",
    "/CommunicationProjection": () => "Avisos e contagens",
    "/PastorView": (air) => air,
    "/StreamView": () => "só o texto, em legenda",
};
export const showsOn = (screen, air) => (SHOWS[screen] || ((a) => a))(air || "nada");

// The outputs by what they are for (the UX research's presets, P2): the
// audience in the room, the people on the platform, the live stream. Saídas,
// Telas na rede and the network's screen picker group them this way.
export const GROUPS = [["publico", "Público"], ["palco", "Palco"], ["transmissao", "Transmissão"]];
const GROUP_OF = {
    "/Projection": "publico", "/LyricProjection": "publico", "/VideoProjection": "publico", "/CommunicationProjection": "publico",
    "/StageView": "palco", "/PastorView": "palco",
    "/StreamView": "transmissao",
};
export const groupOf = (page) => GROUP_OF[page] || "publico";

// [{ key, label, items }] in GROUPS order, empty groups left out; items keep
// their order. `pageOf` says which page an item shows.
export function byGroup(items, pageOf) {
    return GROUPS.map(([key, label]) => ({ key, label, items: items.filter((it) => groupOf(pageOf(it)) === key) })).filter((g) => g.items.length);
}

const isTablet = (agent) => /iPad|Tablet|Android(?!.*Mobile)/i.test(agent || "");

// What the Saídas popover draws for one row: the switch (local rows only;
// on = the window exists) and one status text, replacing the five state
// shapes it used to have. The dropped time is a hint, not an alarm — the
// banner is the active alert; here the switch simply reads "off".
//   -> { switchOn, text, tone: "ok" | "rh" | "warn" | "off", hint }
export function rowStatus(row, { locked = false } = {}) {
    if (!row.local) {
        if (row.state === "disconnected") return { switchOn: null, text: `Desconectada às ${hhmm(row.droppedAt)}`, tone: "warn", hint: "A tela volta sozinha quando a rede voltar." };
        return { switchOn: null, text: "Conectada", tone: locked ? "rh" : "ok", hint: null };
    }
    if (row.state === "reconnecting") return { switchOn: true, text: "Tela desligada", tone: "warn", hint: "volta sozinha quando ela ligar" };
    if (row.state === "connected") return { switchOn: true, text: locked ? "Aberta · travada" : "Aberta", tone: locked ? "rh" : "ok", hint: null };
    if (row.state === "closed") return { switchOn: false, text: "Fechada", tone: "off", hint: `caiu às ${hhmm(row.droppedAt)}` };
    return { switchOn: false, text: "Fechada", tone: "off", hint: null };
}

// Everything the UI says about the outputs, from the main process's list,
// the session memory, the lock and what is on air. An output the operator
// removed (Telas e saídas › Remover saída) is no row, no count and no
// banner — but a network screen showing that page still is: removal is
// about this computer's window and the lists, never the church network.
// `leaving` are the outputs whose rule leaves out what is on air now
// (outputsLeavingAir in outputPrefs.js: [{ page, name, kind, receives }]): a
// screen of theirs is connected but does not show the item, so the Programa
// says "em 1 de 2 telas" (owner 2026-10-27, P2 = A).
export function outputHealth({ outputs = [], seen = {}, locked = false, air = "", tries = 1, leaving = [] }) {
    const rows = [];
    for (const o of outputs) {
        if (o.removed) continue;
        const id = localId(o.key);
        const mem = seen[id];
        let state;
        if (o.open && o.placement?.missing) state = "reconnecting";
        else if (o.open) state = "connected";
        else if (mem?.droppedAt) state = "closed";
        else state = "unused";
        rows.push({
            id, local: true, key: o.key, name: o.label || o.key, state, group: groupOf(o.key),
            problem: state === "reconnecting" || state === "closed",
            droppedAt: mem?.droppedAt || null,
            shows: state === "connected" || state === "reconnecting" ? showsOn(o.key, air) : null,
            meta: state === "reconnecting" ? "A tela está desligada · a saída volta quando ela ligar"
                : o.placement?.mode === "fullscreen" ? `Tela ${o.placement.displayId ?? ""}`.trim() : "Janela",
        });
    }
    for (const v of Object.values(seen)) {
        if (v.kind !== "net") continue;
        const state = v.droppedAt ? "disconnected" : "connected";
        rows.push({
            id: v.key, local: false, key: v.key, name: v.name, ip: v.ip, screen: v.screen,
            kind: isTablet(v.agent) ? "tablet" : "tv",
            role: v.screen === "/VideoProjection" ? "media" : "lyrics", group: groupOf(v.screen),
            state, problem: state === "disconnected", droppedAt: v.droppedAt,
            shows: state === "connected" ? showsOn(v.screen, air) : null,
            meta: `Rede · ${v.ip}`,
        });
    }
    const connected = rows.filter((r) => r.state === "connected").length;
    const problems = rows.filter((r) => r.problem);
    const total = connected + problems.length;

    // The status in the top bar: a problem wins, then the lock (blue: the
    // screens are not following the console), then nothing open (amber: a
    // green dot never sits next to a zero). `compact` is what the bar shows
    // ("2 telas", Rodada E1); the whole `label` rides its tooltip.
    const telas = (n) => (n === 1 ? "1 tela" : `${n} telas`);
    let status;
    if (problems.length) status = { label: `Saídas · ${problems.length} com problema`, compact: `${problems.length} com problema`, state: "warn" };
    else if (locked) status = { label: "Telas travadas", compact: "Travadas", state: "rh" };
    else if (!connected) status = { label: "Nenhuma saída aberta", compact: "Nenhuma tela", state: "warn" };
    else status = { label: `Saídas · ${connected} ${connected === 1 ? "conectada" : "conectadas"}`, compact: telas(connected), state: "" };

    // Where the Programa is: the sentence, and the short form its pill shows.
    // A connected screen whose rule leaves the item out does not count as
    // showing it; `why` says which and what it receives.
    const left = new Map(leaving.map((l) => [l.page, l]));
    const leftRows = rows.filter((r) => r.state === "connected" && left.has(r.local ? r.key : r.screen));
    const showing = connected - leftRows.length;
    const why = [...new Set(leftRows.map((r) => r.local ? r.key : r.screen))].map((page) => {
        const l = left.get(page);
        return `${l.name} não mostra ${l.kind} (recebe: ${l.receives})`;
    });
    const of = (n) => `${n || "nenhuma"} de ${total} ${total === 1 ? "tela" : "telas"}`;
    let onAir;
    if (!connected) onAir = { text: "em nenhuma tela", short: "nenhuma tela", warn: true };
    else if (problems.length || leftRows.length) onAir = { text: `em ${of(showing)}`, short: of(showing), warn: true };
    else onAir = { text: `em ${telas(connected)}`, short: telas(connected), warn: false };
    onAir.why = why;
    onAir.filtered = leftRows.length > 0;

    // One banner (banners never stack): the projector on the wrong monitor
    // first (it has its own, with Tela preta and Mostrar logo), else the
    // destination that dropped most recently.
    let banner = null;
    const reconnecting = problems.find((r) => r.state === "reconnecting");
    if (reconnecting) banner = { kind: "reconnecting", row: reconnecting, tries };
    else if (problems.length) {
        const row = [...problems].sort((a, b) => (b.droppedAt || 0) - (a.droppedAt || 0))[0];
        const others = connected ? ` · ${connected === 1 ? "a outra tela continua" : `as outras ${connected} telas continuam`} no ar` : "";
        banner = row.local
            ? { kind: "closed", row, title: `${row.name} fechada às ${hhmm(row.droppedAt)}`, sub: `Reabrir mostra de novo o que está no ar${others}`, more: problems.length - 1 }
            : { kind: "disconnected", row, title: `${row.name} desconectada às ${hhmm(row.droppedAt)}`, sub: `Rede · ${row.ip}${others}`, more: problems.length - 1 };
    }

    return { rows, connected, total, problems: problems.length, status, onAir, banner };
}

// Configurações › Telas e saídas › Saídas, the group's summary while it is
// closed (Rodada H1): "7 saídas · 2 abertas". `outputs` are the main
// process's output windows ({ open, removed }); a removed output is no row.
export function outputsSummary(outputs) {
    const active = (outputs || []).filter((o) => !o.removed);
    const open = active.filter((o) => o.open).length;
    const total = `${active.length} ${active.length === 1 ? "saída" : "saídas"}`;
    return `${total} · ${open ? `${open} ${open === 1 ? "aberta" : "abertas"}` : "nenhuma aberta"}`;
}

// The line under an output's card in Telas e saídas: where it opens.
// `displayNumber` is the display's number as Windows counts it here (0: not
// among the ones on).
export function outputStatusText(placement, displayNumber = 0) {
    const p = placement || {};
    if (p.missing) return "A tela está desligada · a saída aparece quando ela ligar";
    if (p.mode === "fullscreen") return displayNumber ? `Tela cheia na Tela ${displayNumber}` : "Tela cheia";
    return "Abre numa janela";
}
