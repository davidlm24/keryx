import React, { useMemo } from "react";
import Icon from "./Icon";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import StageScreen from "@/components/network/StageScreen";
import PastorScreen from "@/components/network/PastorScreen";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import { prefState, prefVars, pastorOptions } from "@/lib/outputPrefs";
import { useOutputPref, useRailViews } from "@/hooks/useOutputPref";
import { useDesign } from "@/hooks/useLayout";
import { useChurch } from "@/hooks/useChurch";
import { useLiveNow } from "@/hooks/useLiveState";
import { SCREEN_PAGES, nextItems } from "@/lib/network/views";
import { tileStatus, motionTile } from "@/lib/console/multiview";
import "@/components/screen/output-prefs.css";

// One quadrant: what is on air as `page` shows it, with that output's own
// settings, by the same rules as its page (OutputScreen; StageView and
// PastorView draw their own layout unless a Conteúdo choice turns them into
// a renderer view; an output with a layout, Ajustes › Layout, is drawn by
// LayoutRenderer like its page). Its label says which output and where it
// is on screen.
function Tile({ page, index, live, now, logoUrl, items, motion, look, status, onPick, church }) {
    const { pref, theme } = useOutputPref(page);
    const layout = useDesign(pref);
    const own = !pref.content && SCREEN_PAGES.some((p) => p.key === page) ? page : null;
    const doc = useMemo(() => (own ? null : prefState(page, live, pref, theme)), [own, page, live, pref, theme]);
    const vars = own ? null : prefVars(pref);
    const upcoming = useMemo(() => (layout ? nextItems(items, live?.session || null, 10) : []), [layout, items, live?.session]);
    let body;
    if (layout && (own || doc)) body = <LayoutRenderer layout={layout} live={live} screenState={own ? undefined : doc} nowMs={now} logoUrl={logoUrl} upcoming={upcoming} hasService={items.length > 0} church={church} scale={own ? pref.scale : 1} embed />;
    else if (own === "/StageView") body = <StageScreen content={live?.content || null} nowMs={now} embed opts={pref.options} scale={pref.scale} />;
    else if (own === "/PastorView") {
        const upcoming = nextItems(items, live?.session || null, pastorOptions(pref).next_count || 1);
        body = <PastorScreen live={live} nowMs={now} logo={logoUrl} upcoming={upcoming} hasService={items.length > 0} embed opts={pref.options} scale={pref.scale} />;
    } else if (doc) body = <ScreenRenderer state={doc} now={now} logoUrl={logoUrl} preview motion={motion} />;
    else body = <div className="kx-screen-empty">Nada no ar nesta saída</div>;
    return (
        <div className={`mx-tile ${vars ? "kp-out" : ""}`} style={vars || undefined} data-page={page}>
            {body}
            <div className={`mx-lbl ${status.state ? `is-${status.state}` : ""}`}>
                <button type="button" className="mx-pick kx-t" onClick={(e) => onPick(e, index)} title="Escolher a saída deste quadro" aria-label={`Quadro ${index + 1}: ${look.name} · escolher a saída`}>
                    <Icon name={look.icon} size={13} /><span className="mx-name">{look.name}</span>
                </button>
                <span className="mx-st">{status.text}</span>
            </div>
        </div>
    );
}

// The Programa as four outputs at once (src/lib/console/multiview.js;
// Programa › Multiview): in the Programa's place and size, a drop target and
// a right-click menu like it. `rows` are the output health rows (Saídas).
// Its clocks tick on its own clock (useLiveNow), never the console's; a
// given `now` is a still frame.
export default function MultiView({ live, now: givenNow, logoUrl, tiles, rows = [], items = [], state, className = "", onPick, dropProps, children, still = false }) {
    const ownNow = useLiveNow(1000, givenNow === undefined);
    const now = givenNow ?? ownNow;
    const looks = useRailViews();
    const church = useChurch();
    const moving = motionTile(tiles);
    return (
        <div className={`kx-mon prog mx ${state ? `is-${state}` : ""} ${className}`} {...dropProps}>
            <div className="kx-mon-screen mx-grid" role="group" aria-label="Multiview: quatro saídas com o que está no ar">
                {tiles.map((page, i) => (
                    <Tile key={page} page={page} index={i} live={live} now={now} logoUrl={logoUrl} items={items} motion={!still && i === moving}
                        look={looks.find((l) => l.key === page) || { name: page, icon: "monitor" }} status={tileStatus(page, rows)} onPick={onPick} church={church} />
                ))}
                {children}
            </div>
        </div>
    );
}
