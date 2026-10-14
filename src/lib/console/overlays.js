// Camadas › Sobreposições (owner 2026-10-14: the + adds layers, not reopen
// the one that exists). The live state already keeps the whole list
// (`overlays.set`, capped at 50 there) and every screen draws all of them
// (ScreenRenderer); this module is the console's own rules — the limit, where
// a new one is born, and the row order. In Camadas the top row is the one
// drawn on top on the screens: the END of the list, since the renderer draws
// overlays in list order and the later ones paint over the earlier.

export const OVERLAY_LIMIT = 5;

export const isTextOverlay = (o) => Boolean(o) && (o.type === "text" || o.type === "announcement");

// The row's name is the overlay's own text ("Sobreposição", muted, while empty).
export const overlayName = (o) => String(o?.content || "").trim();

// Where new ones are born (Baixo esq.), and how far up each step goes so none
// covers another.
const BIRTH = { x: 4, y: 86, width: 40 };
const STEP = 7;

// A new overlay: bottom left, one step up for each one already standing there.
export function newOverlay(overlays = []) {
    const taken = overlays.filter((o) => o && (o.y ?? 0) > 50 && (o.x ?? 0) <= 30).length;
    return { id: `ov-${Date.now()}`, type: "text", content: "Sobreposição", ...BIRTH, y: Math.max(50, BIRTH.y - taken * STEP), enabled: true };
}

// Camadas' rows, the screen's top first (the end of the list draws on top).
export const overlayRows = (overlays = []) => [...overlays].reverse();

// Move a row to a row gap (0 = before the top row, rows.length = after the
// last), as the layer order's drag does. The same list when nothing moves.
export function moveOverlayRow(overlays, id, toRow) {
    const rows = overlayRows(overlays);
    const from = rows.findIndex((o) => o && o.id === id);
    if (from < 0) return overlays;
    const [moved] = rows.splice(from, 1);
    rows.splice(Math.max(0, Math.min(toRow > from ? toRow - 1 : toRow, rows.length)), 0, moved);
    const next = rows.reverse();
    return next.every((o, i) => o === overlays[i]) ? overlays : next;
}
