import React, { useEffect } from "react";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";
import StageScreen from "@/components/network/StageScreen";
import OutputScreen from "@/components/screen/OutputScreen";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useOutputPref } from "@/hooks/useOutputPref";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { keryx } from "@/api/keryxClient";

// The stage monitor: StageScreen on the live state (shared/live-state.mjs),
// on the operator's PC or a screen on the network alike, with this output's
// own switches (Configurações › Telas e saídas › Ajustes). A Conteúdo choice
// turns the page into that renderer view instead (OutputScreen). It keeps
// showing while the main projector is black: the band still needs the
// lyrics. Sized in container units (net.css).
export default function StageView() {
    const live = useLiveState();
    const nowMs = useLiveNow(1000);
    const logo = useChurchLogo();
    const { pref, theme } = useOutputPref("/StageView");

    useEffect(() => {
        if (keryx.isDesktop) return undefined; // the main process places desktop outputs
        const tryFullscreen = () => { document.documentElement.requestFullscreen?.().catch(() => {}); };
        document.addEventListener("click", tryFullscreen, { once: true });
        return () => document.removeEventListener("click", tryFullscreen);
    }, []);

    if (pref.content) return <OutputScreen page="/StageView" live={live} prefs={{ pref, theme }} now={nowMs} logoUrl={logo} audio={false} />;
    return (
        <StageScreen content={live?.content || null} nowMs={nowMs} opts={pref.options} scale={pref.scale}>
            {live?.content && <AlertOverlayRenderer />}
        </StageScreen>
    );
}
