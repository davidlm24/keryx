import React from "react";
import PastorScreen from "@/components/network/PastorScreen";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import { useChurch } from "@/hooks/useChurch";
import OutputScreen from "@/components/screen/OutputScreen";
import { useOutputPref } from "@/hooks/useOutputPref";
import { useDesign } from "@/hooks/useLayout";
import { useUpcoming } from "@/hooks/useUpcoming";
import { pastorOptions } from "@/lib/outputPrefs";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";

// The pastor's screen (a tablet on the pulpit, landscape like the others): PastorScreen
// on the live state, with what comes next in the service's Setlist
// (useUpcoming). A layout the operator drew (Ajustes › Layout, or ?layout=
// on a network screen) is drawn by LayoutRenderer instead.
export default function PastorView() {
    const live = useLiveState();
    const nowMs = useLiveNow(1000);
    const church = useChurch();
    const session = live?.session || null;
    const { upcoming, hasService } = useUpcoming(live);
    const { pref, theme } = useOutputPref("/PastorView");
    const layout = useDesign(pref);
    if (pref.content) return <OutputScreen page="/PastorView" live={live} prefs={{ pref, theme }} now={nowMs} logoUrl={church.logo} audio={false} />;
    if (layout) return <LayoutRenderer layout={layout} live={live} nowMs={nowMs} logoUrl={church.logo} upcoming={upcoming} hasService={hasService} church={church} scale={pref.scale} />;
    const count = pastorOptions(pref).next_count;
    return <PastorScreen live={live} nowMs={nowMs} logo={church.logo} upcoming={upcoming.slice(0, count || 1)} hasService={hasService} opts={pref.options} scale={pref.scale} church={church} />;
}
