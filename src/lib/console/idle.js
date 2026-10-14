import { updateUser } from "@/hooks/useUser";

// Tela ociosa: saved (so it survives a reopen, liveSeed reads idle_mode) and
// put on air. Used by Aparência and by the Saídas popover, never one without
// the other. A failed save is silent; the live op's error is the one said.
export function setIdleMode(c, mode) {
    updateUser({ idle_mode: mode }).catch(() => {});
    return c.liveOp("idle.set", { mode }).catch((err) => c.say(err?.message || "Não foi possível mudar a tela ociosa."));
}
