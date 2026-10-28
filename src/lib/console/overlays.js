// Camadas › Sobreposições (owner 2026-10-14: the + adds layers, not reopen
// the one that exists). The live state already keeps the whole list
// (`overlays.set`, capped at 50 there) and every screen draws all of them
// (ScreenRenderer); this module is the console's own rules — the limit, where
// a new one is born and where it sits. In Camadas the top row is the one
// drawn on top on the screens: the END of the list, since the renderer draws
// overlays in list order and the later ones paint over the earlier.
//
// Prepared first, then put on air (owner 2026-10-28, Camadas K3 = A, as
// ProPresenter's Props): a new one is born OFF the air with no text, so the
// congregation never sees a placeholder or the typing; Enter in its field
// (or its eye) puts it on.

export const OVERLAY_LIMIT = 5;

// The row's name is the overlay's own text ("Sobreposição", muted, while empty).
export const overlayName = (o) => String(o?.content || "").trim();

// Where an overlay sits: two rows (Alto, Baixo) by three columns (Esq.,
// Centro, Dir.), the copy's words. Its box is WIDTH % wide, so a column is
// where the box starts.
const WIDTH = 40;
const COL_X = { esq: 4, centro: 30, dir: 56 };
const ROW_Y = { alto: 4, baixo: 86 };
export const OVERLAY_ROWS = [["alto", "Alto"], ["baixo", "Baixo"]];
export const OVERLAY_COLS = [["esq", "Esq."], ["centro", "Centro"], ["dir", "Dir."]];

// The place of an overlay as the two choices, read from its x/y (any value an
// older KERYX wrote lands on the nearest).
export function overlayPlace(o) {
    const x = Number(o?.x ?? COL_X.esq);
    const y = Number(o?.y ?? ROW_Y.baixo);
    const col = x < (COL_X.esq + COL_X.centro) / 2 ? "esq" : x < (COL_X.centro + COL_X.dir) / 2 ? "centro" : "dir";
    return { row: y < 50 ? "alto" : "baixo", col };
}

// The x/y of a place.
export const placeAt = (row, col) => ({ x: COL_X[col] ?? COL_X.esq, y: ROW_Y[row] ?? ROW_Y.baixo });

// How far up each new one standing at the bottom left goes, so none covers another.
const STEP = 7;

// A new overlay: off the air, no text, bottom left, one step up for each one
// already standing there.
export function newOverlay(overlays = []) {
    const taken = overlays.filter((o) => {
        if (!o) return false;
        const p = overlayPlace(o);
        return p.row === "baixo" && p.col === "esq";
    }).length;
    return { id: `ov-${Date.now()}`, type: "text", content: "", x: COL_X.esq, y: Math.max(50, ROW_Y.baixo - taken * STEP), width: WIDTH, enabled: false };
}

// Camadas' rows, the screen's top first (the end of the list draws on top).
export const overlayRows = (overlays = []) => [...overlays].reverse();
