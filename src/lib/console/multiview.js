// Multiview (2026-10-12, as Holyrics' quadrants): the Programa monitor as
// several outputs at once — 1, 2, 4 or 6 (owner 2026-11-12, P4 = A) — each
// showing what is on air the way that output shows it (its own settings;
// Palco and Pastor with their own layouts), so the operator sees the band's
// and the pastor's screens without walking over. Which output each quadrant
// shows, and how many show, is the operator's, saved with the layout
// (layout.js: mvTiles keeps the WHOLE order, the first mvCount show). Pure.
import { RAIL_VIEWS } from "../network/views.js";

export const MV_PAGES = RAIL_VIEWS.map((v) => v.key);
export const MV_COUNT = 4; // the default of MV_COUNTS
export const MV_COUNTS = [1, 2, 4, 6];
export const normalizeCount = (v) => (MV_COUNTS.includes(Number(v)) ? Number(v) : MV_COUNT);
export const DEFAULT_TILES = ["/Projection", "/LyricProjection", "/StageView", "/CommunicationProjection"];

// The whole order, every known output once (the first mvCount show): a
// saved list — 4 long until 12/11 — keeps what it can and fills the rest
// in the default order.
export function normalizeTiles(saved) {
    const out = [];
    for (const p of Array.isArray(saved) ? saved : []) {
        if (MV_PAGES.includes(p) && !out.includes(p)) out.push(p);
    }
    for (const p of [...DEFAULT_TILES, ...MV_PAGES]) {
        if (!out.includes(p)) out.push(p);
    }
    return out;
}

// `page` into quadrant `index`; when another quadrant was showing it, the
// two swap (an output never shows twice).
export function pickTile(tiles, index, page) {
    const list = normalizeTiles(tiles);
    if (!MV_PAGES.includes(page) || index < 0 || index >= list.length || list[index] === page) return list;
    const next = [...list];
    const was = next.indexOf(page);
    if (was >= 0) next[was] = next[index];
    next[index] = page;
    return next;
}

// Where an output is on screen right now, from the output health rows
// (outputs.js, outputHealth): its windows on this computer and the screens
// on the network showing its page. A problem (closed, disconnected, on the
// wrong monitor) wins; nothing open is said plainly, never as a problem
// (the quadrant still shows what that output would show).
export function tileStatus(page, rows = []) {
    const mine = rows.filter((r) => (r.local ? r.key : r.screen) === page && r.state !== "unused");
    const showing = mine.filter((r) => r.state === "connected" || r.state === "reconnecting").length;
    const problems = mine.filter((r) => r.problem).length;
    if (problems) return { text: problems === 1 ? "1 com problema" : `${problems} com problema`, state: "warn" };
    if (showing) return { text: showing === 1 ? "em 1 tela" : `em ${showing} telas`, state: "" };
    return { text: "sem tela aberta", state: "idle" };
}

// The one quadrant whose videos really play (muted), as the Programa's do:
// Projeção, else Vídeo; the others show a still. -1: none.
export function motionTile(tiles) {
    const at = tiles.indexOf("/Projection");
    return at >= 0 ? at : tiles.indexOf("/VideoProjection");
}
