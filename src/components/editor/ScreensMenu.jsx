import React from "react";
import { Row, WinNav } from "../console/kx";
import { outputLook } from "@/lib/outputPrefs";
import { useOutputPrefRows } from "@/hooks/useOutputPref";

// The Editor de telas' vertical menu: the Tela ociosa first (every screen's
// look with nothing on air, owner 2026-10-19), then the outputs. The
// window's docked menu (WinNav, owner 2026-10-22: the same as
// Configurações'), Voltar in the bar.
export const IDLE_SCREEN = "tela-ociosa";

export default function ScreensMenu({ path, screens, onPick }) {
    const prefRows = useOutputPrefRows();
    return (
        <WinNav label="Telas">
            <div className="listhead"><span className="kx-section">Telas</span></div>
            <Row single icon="monitor" title="Tela ociosa" className={path === IDLE_SCREEN ? "is-selected" : ""} onClick={() => onPick(IDLE_SCREEN)} />
            <div className="listhead"><span className="kx-section">Saídas</span></div>
            {screens.map((p) => {
                const look = outputLook(p, prefRows.find((x) => x.screen_path === p) || null);
                return <Row key={p} single icon={look.icon} title={look.name} className={p === path ? "is-selected" : ""} onClick={() => onPick(p)} />;
            })}
        </WinNav>
    );
}
