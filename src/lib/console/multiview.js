// Multiview (2026-10-12, as Holyrics' four quadrants): the Programa monitor
// as four outputs at once, each showing what is on air the way that output
// shows it (its own settings; Palco and Pastor with their own layouts), so
// the operator sees the band's and the pastor's screens without walking over.
// Which output each quadrant shows is the operator's, saved with the layout
// (layout.js). Pure: no I/O.
import { RAIL_VIEWS } from "../network/views.js";

export const MV_PAGES = RAIL_VIEWS.map((v) => v.key);
export const MV_COUNT = 4;
export const DEFAULT_TILES = ["/Projection", "/LyricProjection", "/StageView", "/CommunicationProjection"];

// Four known outputs, none twice: a saved list from an older version (or
// edited by hand) keeps what it can and fills the rest in the default order.
export function normalizeTiles(saved) {
    const out = [];
    for (const p of Array.isArray(saved) ? saved : []) {
        if (out.length < MV_COUNT && MV_PAGES.includes(p) && !out.includes(p)) out.push(p);
    }
    for (const p of [...DEFAULT_TILES, ...MV_PAGES]) {
        if (out.length < MV_COUNT && !out.includes(p)) out.push(p);
    }
    return out;
}

// `page` into quadrant `index`; when another quadrant was showing it, the
// two swap (an output never shows twice).
export function pickTile(tiles, index, page) {
    const list = normalizeTiles(tiles);
    if (!MV_PAGES.includes(page) || index < 0 || index >= MV_COUNT || list[index] === page) return list;
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
