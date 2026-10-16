import React from "react";
import { IconBtn } from "../console/kx";

// Desfazer / Refazer in an editor's WinBar (audit C-33), over the history
// of useDraftHistory; the keys are in the tooltips.
export default function UndoRedo({ history }) {
    return (
        <>
            <IconBtn name="undo" small title="Desfazer · Ctrl+Z" disabled={!history.canUndo} onClick={() => history.undo()} />
            <IconBtn name="redo" small title="Refazer · Ctrl+Y" disabled={!history.canRedo} onClick={() => history.redo()} />
        </>
    );
}
