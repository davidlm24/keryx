import { updateUser } from "@/hooks/useUser";
import { idleLookOf, isDefaultIdleLook } from "@shared/idleLook.mjs";

// Tela ociosa: saved (so it survives a reopen, liveSeed reads idle_mode) and
// put on air. Used by Culto › Fora do ar and by the Saídas popover, never one without
// the other. A failed save is silent; the live op's error is the one said.
export function setIdleMode(c, mode) {
    updateUser({ idle_mode: mode }).catch(() => {});
    return c.liveOp("idle.set", { mode }).catch((err) => c.say(err?.message || "Não foi possível mudar a tela ociosa."));
}

// The Tela ociosa's look (Editor de telas › Tela ociosa): saved on the
// church's profile only; the console puts it on the screens (useConsole), so
// a detached editor and another computer reach them the same way. The
// default look is saved as null. Rejects when the save fails.
export function setIdleLook(look) {
    const l = idleLookOf(look);
    return updateUser({ idle_look: l && !isDefaultIdleLook(l) ? l : null });
}
