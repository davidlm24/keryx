// The console's right-click menus (src/components/console/ContextMenu.jsx):
// the pure parts, tested in contextMenu.test.mjs.

// Where a menu of size w × h opens for a click at (x, y) in a window of
// vw × vh: at the pointer, flipped to the left or upwards when it would run
// past an edge, and always at least `margin` inside the window.
export function placeMenu({ x, y, w, h, vw, vh, margin = 8 }) {
    let left = x + w + margin > vw ? x - w : x;
    let top = y + h + margin > vh ? y - h : y;
    left = Math.max(margin, Math.min(left, vw - w - margin));
    top = Math.max(margin, Math.min(top, vh - h - margin));
    return { left: Math.round(left), top: Math.round(top) };
}

// Where a menu of size w × h opens from the button `anchor` (a rect: left,
// top, right, bottom), inside `bounds` (the window, or the frame a fixed
// menu is drawn in; { left: 0, top: 0, right: vw, bottom: vh } by default)
// — the (+) menus and the Bíblia's lists (Rodada G1). Across: its edge on
// the anchor's `align` edge ("end": right edges together, the menu hanging
// to the left; "start": left edges), flipped to the other edge when that
// runs out of the bounds, and always `margin` inside them. Down: under the
// anchor, `gap` apart; with no room below, above it; with room on neither
// side, on the roomier one with a `maxHeight` (null when the whole menu
// fits). `top` in bounds is where nothing may cover it (the top bar).
export function placeBox({ anchor, w, h, vw, vh, bounds, margin = 8, gap = 4, align = "end" }) {
    const b = bounds || { left: 0, top: 0, right: vw, bottom: vh };
    const minL = b.left + margin;
    const maxL = b.right - w - margin;
    const atEnd = anchor.right - w;
    const atStart = anchor.left;
    let left = align === "start"
        ? (atStart > maxL ? atEnd : atStart)
        : (atEnd < minL ? atStart : atEnd);
    left = Math.max(minL, Math.min(left, maxL));
    const below = anchor.bottom + gap;
    const roomBelow = b.bottom - margin - below;
    const roomAbove = anchor.top - gap - (b.top + margin);
    let top;
    let maxHeight = null;
    let above = false;
    if (h <= roomBelow) top = below;
    else if (h <= roomAbove) { top = anchor.top - gap - h; above = true; }
    else if (roomBelow >= roomAbove) { top = below; maxHeight = Math.max(0, roomBelow); }
    else { top = b.top + margin; maxHeight = Math.max(0, roomAbove); above = true; }
    return { left: Math.round(left), top: Math.round(top), maxHeight: maxHeight == null ? null : Math.floor(maxHeight), above };
}

// The items in the order shown. Live safety: anything that changes what is
// on air (`air: true`: Enviar ao ar, Encerrar…) goes last, after a
// separator, never first and never mixed with the safe ones; separators the
// caller left at the ends or doubled are dropped. "sep" is a separator.
export function orderItems(items = []) {
    const list = items.filter(Boolean);
    const safe = list.filter((i) => i === "sep" || !i.air);
    const air = list.filter((i) => i !== "sep" && i.air);
    const out = [];
    for (const item of safe) {
        if (item === "sep" && (!out.length || out[out.length - 1] === "sep")) continue;
        out.push(item);
    }
    while (out[out.length - 1] === "sep") out.pop();
    if (air.length) {
        if (out.length) out.push("sep");
        out.push(...air);
    }
    return out;
}
