// What a drag from the Biblioteca carries: the stage, kept here because
// dataTransfer only moves strings and the drop targets live in other
// components. One drag at a time; cleared on dragend and on drop.
// Several marked rows dragged together (Rodada O2) carry a list, in the
// Biblioteca's order: the Setlist takes them all, the Prévia and the
// Programa only the first (getDragStage).
export const STAGE_MIME = "application/x-keryx-stage";

let current = null;
export const setDragStage = (stage) => {
    const list = (Array.isArray(stage) ? stage : [stage]).filter(Boolean);
    current = list.length ? list : null;
};
export const getDragStage = () => current?.[0] ?? null;
export const getDragStages = () => current || [];
export const clearDragStage = () => { current = null; };
