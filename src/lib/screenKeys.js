// What a key press on an output window (Projeção, Letras, Vídeo,
// Comunicação, Palco, Pastor) does to the live state. The operator who
// clicked one of those windows keeps the console's screen keys there, and a
// key means what it means on the console (keys.js liveAction): ← / → and
// PageUp / PageDown move the slide on air, B and L toggle Tela preta and the
// logo, C clears the text (Limpar), Esc takes everything down. Space
// (Tocar/Pausar), ↑/↓ (the selection) and Enter (the Prévia) are the
// console's own: an output has neither a player nor a Prévia, so they do
// nothing here. A click on an output never moves anything (owner 2026-10-16).
// The church's Transições ride along (withTransitions), as from the console.
// Travar telas holds in applyOp; the slide keys are not even sent while
// locked, as the console's moveSlide refuses them. Pure: node --test checks it.

import { liveAction } from "./console/keys.js";
import { withTransitions } from "./console/transitions.js";

// e: a keydown event (key, modifiers, target); live: the live state; prefs:
// the church's (User) prefs. -> [op, args] to send, or null.
export function screenKeyOp(e, live, prefs) {
    const action = liveAction(e);
    const op = (name, args = {}) => [name, withTransitions(name, args, prefs)];
    switch (action) {
        case "next": case "prev":
            if (!live?.content || live.locked) return null;
            return op(action === "next" ? "content.next" : "content.prev");
        case "black": case "logo":
            return op("screen.set", { mode: live?.screen === action ? "show" : action });
        case "clear":
            return op("text.clear");
        case "end":
            return op("clear");
        default:
            return null;
    }
}
