import React from "react";
import ScreenRenderer from "./ScreenRenderer";
import "./output-prefs.css";
import { useOutputPref } from "@/hooks/useOutputPref";
import { prefState, prefVars } from "@/lib/outputPrefs";

// An output page's screen: the live state through the page's view, with this
// output's settings (Configurações › Telas e saídas; src/lib/outputPrefs.js).
// `page` is the output's path; `live` the whole live state. With no settings
// it renders exactly what ScreenRenderer alone would. A page that reads the
// settings itself (Vídeo) passes them as `prefs`.
export default function OutputScreen({ page, live, prefs, now, logoUrl, audio }) {
    const own = useOutputPref(prefs ? null : page);
    const { pref, theme } = prefs || own;
    const state = prefState(page, live, pref, theme);
    const vars = prefVars(pref);
    const screen = <ScreenRenderer fill state={state} now={now} logoUrl={logoUrl} audio={audio} />;
    return vars ? <div className="kp-out" style={vars}>{screen}</div> : screen;
}
