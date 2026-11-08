import React, { useMemo, useRef } from "react";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import StageScreen from "@/components/network/StageScreen";
import PastorScreen from "@/components/network/PastorScreen";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import StreamBand from "@/components/network/StreamBand";
import { mainLayer } from "@shared/live-state.mjs";
import { PREF_OUTPUTS, prefState, prefVars, pastorOptions, streamOptions, ruleOf, noticeOnly } from "@/lib/outputPrefs";
import { sampleLive, sampleNotice, SAMPLE_ITEMS } from "./sample";
import { useLiveNow } from "@/hooks/useLiveState";

// What this screen shows right now (or a sample when nothing is on air),
// exactly as the page draws it: its rule (O que esta tela recebe), theme,
// design, scale and margins. A still — previews never play (ScreenRenderer
// preview). Used by the Editor's Ajustes, Telas e saídas' thumbnails and the
// network screens' rows (owner 2026-10-13). Moved here from OutputPrefCard in
// Rodada H2.
export default function OutputPreview({ path, pref, design, themes = [], live, church }) {
    const renderer = PREF_OUTPUTS.includes(path);
    const isStream = path === "/StreamView";
    const isStage = path === "/StageView";
    const isPastor = path === "/PastorView";
    const liveOn = live && mainLayer(live) !== "none" ? live : null;
    // The Palco, the Pastor and a design count on this preview's own clock
    // (their clocks, the sample service's 42 min); a renderer view on the
    // renderer's, which ticks only while it shows a timer or an aviso.
    const now = useLiveNow(1000, !isStream && (Boolean(design) || ((isStage || isPastor) && !pref.content)));
    const madeAt = useRef(now);
    const sample = useMemo(() => sampleLive(madeAt.current), []);
    const notice = useMemo(() => sampleNotice(madeAt.current), []);
    const base = liveOn || sample;
    // A screen that receives only avisos gets an example one when none is on air.
    const prevLive = noticeOnly(ruleOf(pref, path)) && !base.communication ? notice : base;
    const pastor = pastorOptions(pref);
    const streamSample = { key: "x", text: "Grande é o Senhor\ne mui digno de louvor", ref: "Salmos 48:1 · NVI" };
    const rendererState = renderer ? prefState(path, prevLive, pref, themes.find((t) => t.id === pref.themeId) || null) : null;
    if (isStream) return <div className="cfg-prev cfg-prev-stream"><div className="cfg-prev-fill" style={{ containerType: "size" }}><StreamBand caption={streamSample} opts={streamOptions(pref)} scale={pref.scale} /></div></div>;
    if (design) return <div className="cfg-prev"><div className="kp-out cfg-prev-fill" style={prefVars(pref) || undefined}><LayoutRenderer layout={design} live={{ ...prevLive, session: prevLive.session || { startedAt: now - 42 * 60000 } }} screenState={renderer ? rendererState : undefined} nowMs={now} logoUrl={church.logo} upcoming={SAMPLE_ITEMS} hasService church={church} embed /></div></div>;
    if (isStage && !pref.content) return <div className="cfg-prev"><StageScreen content={prevLive.content} nowMs={now} embed opts={pref.options} scale={pref.scale} /></div>;
    if (isPastor && !pref.content) return <div className="cfg-prev"><PastorScreen live={{ ...prevLive, session: prevLive.session || { startedAt: now - 42 * 60000 } }} nowMs={now} logo={null} upcoming={SAMPLE_ITEMS.slice(0, pastor.next_count)} hasService embed opts={pref.options} scale={pref.scale} church={church} /></div>;
    return <div className="cfg-prev"><div className="kp-out cfg-prev-fill" style={prefVars(pref) || undefined}><ScreenRenderer fill state={rendererState} preview audio={false} /></div></div>;
}
