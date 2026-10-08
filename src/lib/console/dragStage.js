// What a drag from the Biblioteca carries: the stage, kept here because
// dataTransfer only moves strings and the drop targets live in other
// components. One drag at a time; cleared on dragend and on drop.
export const STAGE_MIME = "application/x-keryx-stage";

let current = null;
export const setDragStage = (stage) => { current = stage; };
export const getDragStage = () => current;
export const clearDragStage = () => { current = null; };
