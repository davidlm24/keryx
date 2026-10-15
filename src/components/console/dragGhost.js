import { iconSvg } from "./Icon";

// A stage's glyph for its ghost (the Biblioteca and the Mídia drag stages).
const STAGE_ICON = { lyrics: "music", bible: "book", text: "text", audio: "volume", video: "film", media: "image", piece: "megaphone", tool: "clock" };
export const stageGhost = (stage) => ({ label: stage?.title || "", icon: STAGE_ICON[stage?.kind] || "text" });

// The compact pill that follows the pointer on every HTML5 drag (owner
// 2026-10-15, Rodada D): the browser's own image was a snapshot of the whole
// hovered row, actions included, drawn over the list it was dropped on.
// Built offscreen, handed to setDragImage, removed on the next tick (the
// browser has its bitmap by then).
export function setDragGhost(e, { label = "", icon = "" } = {}) {
    if (!e?.dataTransfer?.setDragImage) return;
    const el = document.createElement("div");
    el.className = "drag-ghost";
    el.innerHTML = iconSvg(icon);
    const span = document.createElement("span");
    span.textContent = label;
    el.appendChild(span);
    document.body.appendChild(el);
    try { e.dataTransfer.setDragImage(el, 14, 14); } catch { /* the default image then */ }
    setTimeout(() => el.remove(), 0);
}
