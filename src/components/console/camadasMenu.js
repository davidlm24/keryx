// Camadas' + (owner 2026-10-14, "Frente 2 = A"): only what goes over the
// projection and is in no theme, the text overlay and the logo. Clock,
// stopwatch, timer, free text and Aviso rápido live in the tabs panel
// (Ferramentas, Timers, Aviso rápido) and the Setlist's +. Shared by the
// console and Camadas in a window of its own (PanelPage.jsx).
import { OVERLAY_LIMIT } from "@/lib/console/overlays";

// addOverlay: the Layers panel's "new overlay" (its addRef).
export function camadasAddItems(c, addOverlay) {
    const logoOn = Boolean(c.cur?.logo?.visible);
    const ovFull = (c.cur?.overlays?.length || 0) >= OVERLAY_LIMIT;
    return [
        { label: ovFull ? `Sobreposição de texto · máx. ${OVERLAY_LIMIT}` : "Sobreposição de texto", icon: "text", disabled: ovFull, onSelect: () => addOverlay() },
        { label: logoOn ? "Logo no canto · no ar" : "Logo no canto", icon: "logo", disabled: logoOn, onSelect: () => c.callOp("logo.set", { visible: true }).catch((err) => c.say(err?.message || "Não foi possível mostrar o logo.")) },
    ];
}
