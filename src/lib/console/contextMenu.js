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
