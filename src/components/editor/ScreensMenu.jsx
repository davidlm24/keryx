import React from "react";
import { Panel, Row } from "../console/kx";
import { outputLook } from "@/lib/outputPrefs";
import { useOutputPrefRows } from "@/hooks/useOutputPref";

// The Editor de telas' vertical menu: the Tela ociosa first (every screen's
// look with nothing on air, owner 2026-10-19), then the outputs.
export const IDLE_SCREEN = "tela-ociosa";

export default function ScreensMenu({ path, screens, onPick, style }) {
    const prefRows = useOutputPrefRows();
    return (
        <div className="col" style={style}>
            <Panel title="Telas" bodyStyle={{ overflow: "auto" }}>
                <Row single icon="monitor" title="Tela ociosa" className={path === IDLE_SCREEN ? "is-selected" : ""} onClick={() => onPick(IDLE_SCREEN)} />
                <div className="listhead le-menu-h"><span className="kx-section">Saídas</span></div>
                {screens.map((p) => {
                    const look = outputLook(p, prefRows.find((x) => x.screen_path === p) || null);
                    return <Row key={p} single icon={look.icon} title={look.name} className={p === path ? "is-selected" : ""} onClick={() => onPick(p)} />;
                })}
            </Panel>
        </div>
    );
}
