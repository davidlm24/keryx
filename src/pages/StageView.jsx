import React, { useEffect } from "react";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import OutputScreen from "@/components/screen/OutputScreen";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useScreenKeys } from "@/hooks/useScreenKeys";
import { useOutputPref } from "@/hooks/useOutputPref";
import { useScreenDesign } from "@/hooks/useLayout";
import { useUpcoming } from "@/hooks/useUpcoming";
import { useChurch } from "@/hooks/useChurch";
import { keryx } from "@/api/keryxClient";
import { alertOf } from "@/lib/outputPrefs";

// The stage monitor: one drawing (owner 2026-11-12, "Editor de telas ·
// Palco"): its own design, else the factory Palco dressed by this output's
// switches (Ajustes › Conteúdo; outputPrefs pageDesign), drawn by
// LayoutRenderer on the operator's PC and on a network screen alike — the
// Editor shows exactly this. A Conteúdo choice turns the page into that
// renderer view (OutputScreen). It keeps showing while the main projector is
// black: the band still needs the lyrics. Sized in container units.
export default function StageView() {
    const live = useLiveState();
    const nowMs = useLiveNow(1000);
    const church = useChurch();
    const { pref, theme } = useOutputPref("/StageView");
    const { layout } = useScreenDesign("/StageView", pref);
    const { upcoming, hasService } = useUpcoming(live);
    useScreenKeys(live);

    useEffect(() => {
        if (keryx.isDesktop) return undefined; // the main process places desktop outputs
        const tryFullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };
        document.addEventListener("click", tryFullscreen, { once: true });
        return () => document.removeEventListener("click", tryFullscreen);
    }, []);

    if (pref.content) return <OutputScreen page="/StageView" live={live} prefs={{ pref, theme }} now={nowMs} logoUrl={church.logo} audio={false} />;
    // The Aviso rápido while a song is on air, in the Palco's own look
    // (Rodada E3: the same bar as every screen), docked beside the Próximo
    // bar (LayoutRenderer, alertDock).
    const alert = live?.content ? alertOf(live, pref, "/StageView") : null;
    return <LayoutRenderer layout={layout} live={live} alert={alert} nowMs={nowMs} logoUrl={church.logo} upcoming={upcoming} hasService={hasService} church={church} scale={pref.scale} />;
}
