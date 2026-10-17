import React from "react";
import Icon from "./Icon";
import { IconBtn, onTabsKey } from "./kx";
import { MenuBarButtons } from "./MenuBar";
import { keyHint } from "@/lib/console/keys";
import { usePrefs } from "@/hooks/useUser";
import { useLiveNow } from "@/hooks/useLiveState";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { syncState } from "@/lib/console/syncView";

// The sync's cloud, only on a computer that syncs. It reads the status
// itself, so a change of the status re-renders this button and nothing else
// of the console; its tooltip's "há 12 s" counts with the bar's clock (the
// same tick as Clocks, re-rendering only this button).
function SyncCloud({ onSync }) {
    const st = useSyncStatus();
    const now = useLiveNow(1000, Boolean(st?.folder));
    if (!st?.folder) return null;
    const sync = syncState(st, now);
    return (
        <span className="tb-sync">
            <IconBtn name="cloud" title={`Sincronização · ${sync.label}${sync.detail ? ` · ${sync.detail}` : ""}`} onClick={onSync} />
            <i className={`tb-sync-dot is-${sync.tone}`} aria-hidden="true" />
        </span>
    );
}

// The service clock and the clock: the part of the bar that counts, with its
// own tick, so each second re-renders these two and nothing else of the
// console. `svcAt(now)` is the service clock at that time (Console.jsx,
// serviceClock), null with nothing to say.
function Clocks({ svcAt, onPlanner }) {
    const now = useLiveNow(1000);
    const svc = svcAt ? svcAt(now) : null;
    const clock = new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    return (
        <>
            {svc && (
                <button type="button" className={`kx-btn kx-t tb-svc ${svc.muted ? "is-muted" : ""}`} onClick={onPlanner} title={svc.title} aria-label={`${svc.label || `${svc.text}${svc.more ? ` · ${svc.more}` : ""}`} · Planejar o culto`}>
                    <Icon name="clock" /><span className="tb-svc-t">{svc.text}</span>
                    {svc.more && <span className={`tb-svc-more ${svc.warn ? "kx-warn" : ""}`}> · {svc.more}</span>}
                </button>
            )}
            <span className="tb-clock" title="Hora">{clock}</span>
        </>
    );
}

// The top bar, a menu bar: the KERYX menu (the mark), the environments
// KERYX | BÍBLIA right after it (bold caps, the gold underline: places, not
// commands — "O topo", owner's pick B 2026-10-15; no icons), then the menu bar (Culto,
// Música, Mídia, Ferramentas; Rodada D4, no Telas since E0 — it folds into the mark's
// menu on a narrow window, console.css), the environments
// KERYX | Bíblia as tabs, the search, the service clock in its compact
// form ("◷ 19:00 · 9h46", the whole sentence in its tooltip: serviceClock in
// src/lib/console/timeline.js; a click opens Planejar o culto), the clock,
// the outputs status ("2 telas", the full label in its tooltip), the sync's
// cloud (only on a computer that syncs: green in step, amber when something
// waits, grey paused; owner's pick, 2026-10-16), Ver (the eye) and the bell. The screen actions (Tela preta, Logo, Limpar,
// Encerrar) live in the Programa's pill since Rodada E1 (owner's pick B).
// Nothing wraps: as the window narrows the bar drops the service's end,
// then the clock, then shortens the search (container queries in console.css).
export default function TopBar({ menus = [], env, setEnv, open, setOpen, outsLabel, outsCompact, outsState, logoUrl, unread = 0, svcAt, onPlanner, onSync, menuKeysOff = false, inert = false }) {
    const searchKey = keyHint("search", usePrefs().letter_keys);
    const toggle = (name) => setOpen(open === name ? null : name);
    const envTab = (value, label, title) => (
        <button type="button" role="tab" aria-selected={env === value} tabIndex={env === value ? 0 : -1} className={`kx-t ${env === value ? "is-on" : ""}`} title={title} onClick={() => setEnv(value)}>{label}</button>
    );
    return (
        <div className="topbar" inert={inert ? "" : undefined}>
            <div className="tb-l">
                <button type="button" className={`markbtn kx-t ${open === "menu" ? "is-on" : ""}`} onClick={() => toggle("menu")} aria-haspopup="menu" aria-expanded={open === "menu"} title="Menu" aria-label="Menu">
                    {logoUrl ? <img src={logoUrl} alt="" /> : <span className="kx-mark" />}
                </button>
                <div className="kx-tabs envtabs" role="tablist" aria-label="Ambiente" onKeyDown={onTabsKey}>
                    {envTab("culto", "KERYX", "Projeção: músicas, mídia, setlist")}
                    {envTab("biblia", "Bíblia", "Bíblia · digite a referência")}
                </div>
                {menus.length > 0 && <><span className="tb-div" aria-hidden="true" /><MenuBarButtons menus={menus} open={open} setOpen={setOpen} blocked={menuKeysOff} /></>}
            </div>
            <div className="tb-c">
                {/* A real button (C-27): Enter and Space open the search; it only looks like a field. */}
                <button type="button" className="kx-field kx-t tb-search" onClick={() => setOpen("palette")} title={`Buscar ou comandar · ${searchKey}`} aria-label="Buscar em tudo" aria-keyshortcuts={searchKey === "/" ? "/ Control+F" : "Control+F"} aria-haspopup="dialog">
                    <Icon name="search" /><span className="tb-search-ph" aria-hidden="true">Buscar em tudo</span><kbd aria-hidden="true">{searchKey}</kbd>
                </button>
            </div>
            <div className="tb-r">
                <Clocks svcAt={svcAt} onPlanner={onPlanner} />
                <button type="button" className={`kx-status kx-t ${outsState ? `is-${outsState}` : ""}`} onClick={() => toggle("outs")} title={`Telas e saídas · ${outsLabel}`} aria-label={`Telas e saídas · ${outsLabel}`} aria-expanded={open === "outs"}>
                    <i className="kx-dot" /><span className="tb-outs-l">{outsCompact}</span>
                </button>
                <SyncCloud onSync={onSync} />
                {/* Ver: the modules, the density and the arrangements; beside the bell. */}
                <IconBtn name="eye" className="tb-ver" title="Ver · módulos, densidade e disposição" on={open === "ver"} onClick={() => toggle("ver")} aria-haspopup="menu" aria-expanded={open === "ver"} />
                <span className="tb-bell">
                    <IconBtn name="bell" title={unread ? `Notificações · ${unread} ${unread === 1 ? "nova" : "novas"}` : "Notificações"} on={open === "notifs"} onClick={() => toggle("notifs")} aria-expanded={open === "notifs"} />
                    {unread > 0 && open !== "notifs" && <i className="tb-bell-dot" aria-hidden="true" />}
                </span>
            </div>
        </div>
    );
}
