import React from "react";
import ScreenRenderer from "./ScreenRenderer";
import LayoutRenderer from "./LayoutRenderer";
import "./output-prefs.css";
import { useOutputPref } from "@/hooks/useOutputPref";
import { useDesign } from "@/hooks/useLayout";
import { useUpcoming } from "@/hooks/useUpcoming";
import { useChurch } from "@/hooks/useChurch";
import { prefState, prefVars } from "@/lib/outputPrefs";

// An output page's screen: the live state through the page's view, with this
// output's settings (Configurações › Telas e saídas; src/lib/outputPrefs.js).
// `page` is the output's path; `live` the whole live state. With no settings
// it renders exactly what ScreenRenderer alone would. A page that reads the
// settings itself (Vídeo) passes them as `prefs`. With a layout (Ajustes ›
// Layout, or ?layout= on a network screen) the layout draws the screen,
// its Projeção element being this very view (src/lib/layouts.js).
export default function OutputScreen({ page, live, prefs, now, logoUrl, audio }) {
    const own = useOutputPref(prefs ? null : page);
    const { pref, theme } = prefs || own;
    const layout = useDesign(pref);
    const { upcoming, hasService } = useUpcoming(layout ? live : null);
    const church = useChurch();
    const state = prefState(page, live, pref, theme);
    const vars = prefVars(pref);
    const screen = layout
        ? <LayoutRenderer layout={layout} live={live} screenState={state} alert={state?.alert ?? null} nowMs={now} logoUrl={logoUrl} upcoming={upcoming} hasService={hasService} church={church} audio={audio} />
        : <ScreenRenderer fill state={state} now={now} logoUrl={logoUrl} audio={audio} />;
    return vars ? <div className="kp-out" style={vars}>{screen}</div> : screen;
}
