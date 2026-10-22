import React, { useContext } from "react";
import { Panel, Row, WinBack, WinCtx } from "../console/kx";
import { outputLook } from "@/lib/outputPrefs";
import { useOutputPrefRows } from "@/hooks/useOutputPref";

// The Editor de telas' vertical menu: the Tela ociosa first (every screen's
// look with nothing on air, owner 2026-10-19), then the outputs. A fixed
// column (Rodada O, O7: no splitter; the gap beside it is the page's), with
// Voltar at its top when the editor was opened from somewhere (O8): then
// the header is Voltar and "Telas" a heading under it.
export const IDLE_SCREEN = "tela-ociosa";

export default function ScreensMenu({ path, screens, onPick }) {
    const prefRows = useOutputPrefRows();
    const back = Boolean(useContext(WinCtx)?.back);
    return (
        <div className="col le-menu-col">
            <Panel title={back ? undefined : "Telas"} lead={back ? <WinBack /> : null} bodyStyle={{ overflow: "auto" }}>
                {back && <div className="listhead le-menu-h"><span className="kx-section">Telas</span></div>}
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
