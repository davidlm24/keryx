import React from "react";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import { useChurch } from "@/hooks/useChurch";
import OutputScreen from "@/components/screen/OutputScreen";
import { useOutputPref } from "@/hooks/useOutputPref";
import { useScreenDesign } from "@/hooks/useLayout";
import { useUpcoming } from "@/hooks/useUpcoming";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useScreenKeys } from "@/hooks/useScreenKeys";

// The pastor's screen (a tablet on the pulpit, landscape like the others):
// one drawing (owner 2026-11-12, P = A): its own design, else the factory
// Pastor dressed by this output's switches (outputPrefs pageDesign), drawn
// by LayoutRenderer with what comes next in the service's Setlist
// (useUpcoming) — the Editor shows exactly this.
export default function PastorView() {
    const live = useLiveState();
    const nowMs = useLiveNow(1000);
    const church = useChurch();
    const { upcoming, hasService } = useUpcoming(live);
    useScreenKeys(live);
    const { pref, theme } = useOutputPref("/PastorView");
    const { layout } = useScreenDesign("/PastorView", pref);
    if (pref.content) return <OutputScreen page="/PastorView" live={live} prefs={{ pref, theme }} now={nowMs} logoUrl={church.logo} audio={false} />;
    return <LayoutRenderer layout={layout} live={live} nowMs={nowMs} logoUrl={church.logo} upcoming={upcoming} hasService={hasService} church={church} scale={pref.scale} />;
}
