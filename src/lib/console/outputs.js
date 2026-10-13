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

const hhmm = (t) => {
    const d = new Date(t);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

// What a destination shows, by the page it renders. `air` is the Programa's
// own words for what is on air ("Canto do console · 2/6", "Tela preta", …).
const SHOWS = {
    "/Projection": (air) => air,
    "/LyricProjection": (air) => `Letras · ${air}`,
    "/StageView": () => "Palco · atual, próximo e relógio",
    "/VideoProjection": () => "Só os vídeos enviados",
    "/CommunicationProjection": () => "Avisos e contagens",
    "/PastorView": (air) => `Pastor · ${air}`,
    "/StreamView": () => "Transmissão · só o texto, em legenda",
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

// Everything the UI says about the outputs, from the main process's list,
// the session memory, the lock and what is on air.
export function outputHealth({ outputs = [], seen = {}, locked = false, air = "", tries = 1 }) {
    const rows = [];
    for (const o of outputs) {
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
            meta: state === "reconnecting" ? "O monitor escolhido não está ligado · mostrando numa janela"
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
    // green dot never sits next to a zero).
    let status;
    if (problems.length) status = { label: `Saídas · ${problems.length} com problema`, short: "!", state: "warn" };
    else if (locked) status = { label: "Telas travadas", short: "Travadas", state: "rh" };
    else if (!connected) status = { label: "Nenhuma saída aberta", short: "0", state: "warn" };
    else status = { label: `Saídas · ${connected} ${connected === 1 ? "conectada" : "conectadas"}`, short: String(connected), state: "" };

    // Where the Programa is: beside its caption.
    let onAir;
    if (!connected) onAir = { text: "em nenhuma tela", warn: true };
    else if (problems.length) onAir = { text: `em ${connected} de ${total} telas`, warn: true };
    else onAir = { text: connected === 1 ? "em 1 tela" : `em ${connected} telas`, warn: false };

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
