import React, { useEffect } from "react";
import { AlertLayer } from "@/components/screen/AlertBar";
import StageScreen from "@/components/network/StageScreen";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import OutputScreen from "@/components/screen/OutputScreen";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useOutputPref } from "@/hooks/useOutputPref";
import { useDesign } from "@/hooks/useLayout";
import { useUpcoming } from "@/hooks/useUpcoming";
import { useChurch } from "@/hooks/useChurch";
import { keryx } from "@/api/keryxClient";
import { alertOf } from "@/lib/outputPrefs";

// The stage monitor: StageScreen on the live state (shared/live-state.mjs),
// on the operator's PC or a screen on the network alike, with this output's
// own switches (Configurações › Telas e saídas › Ajustes). A layout the
// operator drew (Ajustes › Layout, or ?layout= on a network screen) is drawn
// by LayoutRenderer instead; a Conteúdo choice turns the page into that
// renderer view (OutputScreen). It keeps showing while the main projector is
// black: the band still needs the lyrics. Sized in container units.
export default function StageView() {
    const live = useLiveState();
    const nowMs = useLiveNow(1000);
    const church = useChurch();
    const { pref, theme } = useOutputPref("/StageView");
    const layout = useDesign(pref);
    const { upcoming, hasService } = useUpcoming(live);

    useEffect(() => {
        if (keryx.isDesktop) return undefined; // the main process places desktop outputs
        const tryFullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };
        document.addEventListener("click", tryFullscreen, { once: true });
        return () => document.removeEventListener("click", tryFullscreen);
    }, []);

    if (pref.content) return <OutputScreen page="/StageView" live={live} prefs={{ pref, theme }} now={nowMs} logoUrl={church.logo} audio={false} />;
    // The Aviso rápido while a song is on air, in the Palco's own look
    // (Rodada E3: the same bar as every screen).
    const alert = live?.content ? alertOf(live, pref, "/StageView") : null;
    if (layout) return <LayoutRenderer layout={layout} live={live} alert={alert} nowMs={nowMs} logoUrl={church.logo} upcoming={upcoming} hasService={hasService} church={church} scale={pref.scale} />;
    // The bar rides beside the StageScreen, not in it: .net-stage puts its
    // children in the column's flow.
    return (
        <>
            <StageScreen content={live?.content || null} nowMs={nowMs} opts={pref.options} scale={pref.scale} />
            <AlertLayer alert={alert} />
        </>
    );
}
