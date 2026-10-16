import { iconSvg } from "./Icon";

// A stage's glyph for its ghost (the Biblioteca and the Mídia drag stages).
const STAGE_ICON = { lyrics: "music", bible: "book", text: "text", audio: "volume", video: "film", media: "image", piece: "megaphone", tool: "clock" };
export const stageGhost = (stage) => ({ label: stage?.title || "", icon: STAGE_ICON[stage?.kind] || "text" });

// The card that follows the pointer on every HTML5 drag (owner 2026-10-16,
// Rodada E2: "bigger dragging cards"): the row's width and height, its icon,
// title and time, lifted (a shadow, a little bigger), held where the
// pointer took it. The browser's own drag image is a still bitmap, so it
// gets a transparent one and this card, on <body>, moves with the drag's
// events (as Dock.jsx's .dock-ghost moves with the pointer). A list that
// takes the drop claims the card and lands it in its slot (useSortable);
// any other drop, or none, lets it fade.
let cur = null; // { el, dx, dy, x, y, raf, claimed, timer, off }

const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function place(g) {
    g.raf = 0;
    g.el.style.transform = `translate(${Math.round(g.x - g.dx)}px, ${Math.round(g.y - g.dy)}px)`;
}

function finish(g, fade) {
    if (!g || g.done) return;
    g.done = true;
    g.off();
    if (cur === g) cur = null;
    if (!fade || reduced()) { g.el.remove(); return; }
    g.el.classList.add("is-gone");
    setTimeout(() => g.el.remove(), 140);
}

// A transparent pixel for the browser's own image (an element on the page,
// so Chromium paints it at once; removed on the next tick).
function blankImage(e) {
    const el = document.createElement("div");
    el.style.cssText = "position:fixed;top:-10px;left:-10px;width:1px;height:1px;pointer-events:none";
    document.body.appendChild(el);
    try { e.dataTransfer.setDragImage(el, 0, 0); } catch { /* a synthetic DataTransfer: no image at all */ }
    setTimeout(() => el.remove(), 0);
}

export function setDragGhost(e, { label = "", icon = "", time = "" } = {}) {
    if (!e?.dataTransfer) return;
    finish(cur, false);
    blankImage(e);
    const src = e.currentTarget?.getBoundingClientRect?.() || { left: e.clientX, top: e.clientY, width: 220, height: 32 };
    const w = clamp(src.width, 160, 480);
    const h = clamp(src.height, 28, 56);
    const el = document.createElement("div");
    el.className = "drag-card";
    el.setAttribute("aria-hidden", "true");
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    const card = document.createElement("div");
    card.className = "drag-card-in";
    card.innerHTML = iconSvg(icon);
    const name = document.createElement("span");
    name.className = "drag-card-t";
    name.textContent = label;
    card.appendChild(name);
    if (time) { const t = document.createElement("span"); t.className = "drag-card-time"; t.textContent = time; card.appendChild(t); }
    el.appendChild(card);
    // Held where the pointer took it (a synthetic event has no pointer: the corner).
    const g = { el, dx: clamp(e.clientX - src.left, 0, w), dy: clamp(e.clientY - src.top, 0, h), x: e.clientX, y: e.clientY, raf: 0, claimed: false, done: false };
    const move = (ev) => {
        if (!ev.clientX && !ev.clientY) return; // the last `drag` of a drop says 0, 0
        g.x = ev.clientX; g.y = ev.clientY;
        if (!g.raf && !g.claimed) g.raf = requestAnimationFrame(() => place(g));
    };
    // Dropped where no list took it (the Prévia, the Programa, nowhere):
    // it fades. A list's drop runs first (React's root) and claims it.
    const settle = () => { if (!g.claimed) finish(g, true); };
    // Safety: a drag whose source left the page sends no dragend; the first
    // move without a button after it means the drag is over.
    const stray = (ev) => { if (ev.buttons === 0 && !g.claimed) finish(g, false); };
    document.addEventListener("dragover", move, true);
    document.addEventListener("drag", move, true);
    window.addEventListener("drop", settle);
    window.addEventListener("dragend", settle);
    window.addEventListener("pointermove", stray, true);
    g.off = () => {
        cancelAnimationFrame(g.raf);
        clearTimeout(g.timer);
        document.removeEventListener("dragover", move, true);
        document.removeEventListener("drag", move, true);
        window.removeEventListener("drop", settle);
        window.removeEventListener("dragend", settle);
        window.removeEventListener("pointermove", stray, true);
    };
    document.body.appendChild(el);
    place(g);
    cur = g;
}

// A list takes the drop: the card stops following the pointer and is the
// list's to land and remove. -> { land(rect), remove() } or null.
export function claimGhost() {
    const g = cur;
    if (!g || g.done) return null;
    g.claimed = true;
    cancelAnimationFrame(g.raf);
    // Never left on screen: a list that went away before it landed.
    g.timer = setTimeout(() => finish(g, true), 3000);
    return {
        // Settles into `rect` (the lit slot, viewport px) in 180 ms.
        land(rect) {
            if (g.done || !rect) return;
            g.el.classList.add("is-land");
            g.el.style.width = `${rect.width}px`;
            g.el.style.height = `${rect.height}px`;
            g.dx = 0; g.dy = 0; g.x = rect.left; g.y = rect.top;
            place(g);
        },
        remove() { finish(g, false); },
    };
}
