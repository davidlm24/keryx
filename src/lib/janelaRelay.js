// The relay between the console and its detached pages (Rodada F5,
// "Destacar em janela"). A page in a window of its own (/Janela,
// src/pages/Janela.jsx) reads the store and the live state like any window,
// but what goes to the Prévia or on air is the CONSOLE's business — its
// Prévia, its history of what was on air, its log of the service — so the
// page sends a message and the console runs it through its own setPrev,
// sendStage, songSaved and addMaterial. The console, for its part, tells
// the detached pages what its Prévia holds (the Escola bíblica shows it).
//
// On the desktop the main process relays `keryx:janela` (electron/main.cjs:
// from a detached page to the console, from the console to every detached
// page), the way `keryx:remote` reaches the console; in the browser preview
// (no Electron) a BroadcastChannel stands in. Either way the list of
// messages is closed and every one is checked where it arrives
// (checkMessage): anything else is dropped.

// type -> who sends it ("janela": a detached page; "console") and what it
// carries (checked by `ok`).
export const JANELA_MESSAGES = {
    // Pôr na prévia: the console's Prévia takes the stage (null empties it).
    "prev.set": { from: "janela", ok: (m) => m.stage === null || isStage(m.stage) },
    // Enviar ao ar: the stage goes to the Prévia and on air (sendStage).
    "stage.send": { from: "janela", ok: (m) => isStage(m.stage) },
    // Enter in a detached Escola bíblica: what the console's Prévia holds goes on air.
    "prev.send": { from: "janela", ok: () => true },
    // ↑ / ↓ there: the Prévia's selection walks the slides (as the console's keys).
    "prev.step": { from: "janela", ok: (m) => m.d === 1 || m.d === -1 },
    // A song saved in a detached Editor de música (songSaved: the Prévia and
    // the song on air take its new slides).
    "song.saved": { from: "janela", ok: (m) => isRow(m.song) },
    // Escola bíblica › Setlist: a material at the end of the setlist.
    "setlist.material": { from: "janela", ok: (m) => isRow(m.material) && typeof m.material.title === "string" },
    // What only the console has: its Novidades popover, its Configurações
    // (Console: the arrangement is the console's).
    "console.open": { from: "janela", ok: (m) => m.what === "novidades" || (m.what === "settings" && (m.section === undefined || isId(m.section))) },
    // A detached page asks for the console's state when it opens.
    "console.hello": { from: "janela", ok: () => true },
    // Planejar o culto's "Usar no console" (Rodada O, O9 = A): the console's
    // Setlist takes that culto (null: its culto was deleted there, the
    // console chooses again). Its tabs never change it otherwise.
    "service.use": { from: "janela", ok: (m) => m.id === null || isId(m.id) },
    // The console's culto now (null = none), to every detached page: the
    // planner's tabs mark it with a green dot.
    "console.service": { from: "console", ok: (m) => m.id === null || isId(m.id) },
    // The console's Prévia now (null = empty), to every detached page.
    "console.prev": { from: "console", ok: (m) => m.stage === null || isStage(m.stage) },
    // How far each PDF's pages are (Rodada H, HB): only the console makes
    // them (usePagesBackfill), so a detached Mídia reads "Preparando páginas
    // 7/12", or why they failed, from here. By Media id: { done, total } or
    // { error: { cause, retryable, terminal? } }; the whole map each time.
    "pages.progress": { from: "console", ok: (m) => isPagesMap(m.pages) },
    // Tentar de novo on a detached page: the console tries that PDF again.
    "pages.retry": { from: "janela", ok: (m) => isId(m.id) },
};

// The most a message may weigh (a song's slides ride in a stage); main
// relays nothing bigger either.
export const MAX_BYTES = 1024 * 1024;

const isObj = (v) => Boolean(v) && typeof v === "object" && !Array.isArray(v);
const isId = (v) => typeof v === "string" && v.length > 0 && v.length <= 200;
const isRow = (v) => isObj(v) && isId(v.id);
const isCount = (v) => Number.isInteger(v) && v >= 0 && v <= 100000;
const isFailure = (v) => isObj(v) && typeof v.cause === "string" && typeof v.retryable === "boolean" && (v.terminal === undefined || typeof v.terminal === "string");
const isProgress = (v) => isObj(v) && (v.error !== undefined ? isFailure(v.error) : isCount(v.done) && isCount(v.total) && v.done <= v.total);
// The pages map: at most 200 PDFs at a time, each id → its progress.
const isPagesMap = (v) => isObj(v) && Object.keys(v).length <= 200 && Object.entries(v).every(([id, p]) => isId(id) && isProgress(p));
// A stage (src/lib/console/stage.js): an id, a kind, a title and, when it
// has them, its slides.
const isStage = (v) => isObj(v) && isId(v.id) && typeof v.kind === "string" && (v.title === undefined || typeof v.title === "string") && (v.slides === undefined || Array.isArray(v.slides));

// A message as it arrived -> the message (a fresh copy) when it is one of
// the list, sent by `from`'s side; else null.
export function checkMessage(msg, from) {
    if (!isObj(msg) || typeof msg.type !== "string") return null;
    const spec = Object.prototype.hasOwnProperty.call(JANELA_MESSAGES, msg.type) ? JANELA_MESSAGES[msg.type] : null;
    if (!spec || spec.from !== from) return null;
    let copy;
    try {
        const text = JSON.stringify(msg);
        if (text.length > MAX_BYTES) return null;
        copy = JSON.parse(text);
    } catch { return null; }
    return spec.ok(copy) ? copy : null;
}

// -- Transport (a window; nothing here runs under node --test) -------------

const CHANNEL = "keryx-janela";
let channel = null;
const bc = () => {
    if (channel || typeof BroadcastChannel === "undefined") return channel;
    try { channel = new BroadcastChannel(CHANNEL); } catch { channel = null; }
    return channel;
};
const desktop = () => (typeof window !== "undefined" ? window.keryxDesktop?.janela || null : null);

// role: "janela" (a detached page) or "console". Sends one message of the
// list from that side; false when it is not one (nothing is sent).
export function relaySend(role, type, payload = {}) {
    // The checked copy goes: plain data, whatever the payload held.
    const msg = checkMessage({ ...payload, type }, role);
    if (!msg) return false;
    const d = desktop();
    if (d) { d.send({ ...msg, from: role }); return true; }
    const ch = bc();
    if (!ch) return false;
    try { ch.postMessage({ ...msg, from: role }); return true; } catch { return false; }
}

// Listens to what the OTHER side sends, checked: role "console" hears the
// detached pages, role "janela" hears the console. -> unsubscribe.
export function relayListen(role, cb) {
    const other = role === "console" ? "janela" : "console";
    const take = (raw) => {
        if (!raw || raw.from !== other) return;
        const { from, ...msg } = raw;
        const ok = checkMessage(msg, from);
        if (ok) cb(ok);
    };
    const d = desktop();
    if (d) return d.onMessage(take);
    const ch = bc();
    if (!ch) return () => {};
    const on = (e) => take(e.data);
    ch.addEventListener("message", on);
    return () => ch.removeEventListener("message", on);
}
