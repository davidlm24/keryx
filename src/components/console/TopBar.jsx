import React from "react";
import Icon from "./Icon";
import { IconBtn, onTabsKey } from "./kx";
import { MenuBarButtons } from "./MenuBar";
import { keyHint } from "@/lib/console/keys";
import { usePrefs } from "@/hooks/useUser";
import { useLiveNow } from "@/hooks/useLiveState";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { cloudView } from "@/lib/console/syncView";

// The sync's cloud (Google Drive direto, PR 3; G5 = A: always in the bar,
// grey with no account, a click invites to enter). Its dot: green em dia,
// amber esperando or sem internet, red precisa de você. A click drops the
// summary (SyncPop.jsx, open "sync"). It reads the status itself, so a
// change of the status re-renders this button and nothing else of the
// console.
function SyncCloud({ open, onToggle }) {
    const st = useSyncStatus();
    const sync = cloudView(st);
    // While a pass runs or a file comes down the dot pulses (owner 2026-10-27).
    const title = `Sincronização · ${sync.busy ? "Sincronizando…" : sync.label}`;
    return (
        <span className="tb-sync">
            <IconBtn name="cloud" title={title} on={open} onClick={onToggle} aria-haspopup="dialog" aria-expanded={open} />
            {!open && <i className={`tb-sync-dot is-${sync.tone}${sync.busy ? " is-busy" : ""}`} aria-hidden="true" />}
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
// Música, Mídia, Ferramentas; Rodada D4, no Telas since E0 — on a narrow window
// it folds away and the Menu button takes its place, console.css; the mark's menu
// is the app's: Configurações, Saídas, Verificar tudo, Ajuda), the search, the service clock in its compact
// form ("◷ 19:00 · 9h46", the whole sentence in its tooltip: serviceClock in
// src/lib/console/timeline.js; a click opens Planejar o culto), the clock,
// the outputs status ("2 telas", the full label in its tooltip), the sync's
// cloud (always, G5 = A: its dot green em dia, amber esperando or sem
// internet, red precisa de você, grey without an account; a click drops its
// summary), Ver (the panels glyph) and the bell. The screen actions (Tela preta, Logo, Limpar,
// Encerrar) live in the Programa's pill since Rodada E1 (owner's pick B).
// Nothing wraps: as the window narrows the bar drops the service's end,
// then the clock, then shortens the search (container queries in console.css).
export default function TopBar({ menus = [], env, setEnv, open, setOpen, outsLabel, outsCompact, outsState, logoUrl, unread = 0, verDot = false, svcAt, onPlanner, menuKeysOff = false, inert = false }) {
    const searchKey = keyHint("search", usePrefs().letter_keys);
    const toggle = (name) => setOpen(open === name ? null : name);
    const envTab = (value, label, title) => (
        <button type="button" role="tab" aria-selected={env === value} tabIndex={env === value ? 0 : -1} className={`kx-t ${env === value ? "is-on" : ""}`} title={title} onClick={() => setEnv(value)}>{label}</button>
    );
    return (
        <div className="topbar" inert={inert ? "" : undefined}>
            <div className="tb-l">
                <button type="button" className={`markbtn kx-t ${open === "menu" ? "is-on" : ""}`} onClick={() => toggle("menu")} aria-haspopup="menu" aria-expanded={open === "menu"} title="Menu do KERYX" aria-label="Menu do KERYX">
                    {logoUrl ? <img src={logoUrl} alt="" /> : <span className="kx-mark" />}
                </button>
                {/* Shown exactly when the bar is hidden (console.css, the same container query): its four menus in one popover. */}
                {menus.length > 0 && (
                    <button type="button" className={`kx-btn kx-t tb-menubtn ${open === "menus" ? "is-on" : ""}`} onClick={() => toggle("menus")} aria-haspopup="menu" aria-expanded={open === "menus"} aria-controls="tb-menus-pop" title="Menu · Culto, Música, Mídia e Ferramentas">
                        <Icon name="menu" /><span>Menu</span>
                    </button>
                )}
                {menus.length > 0 && <MenuBarButtons menus={menus} open={open} setOpen={setOpen} blocked={menuKeysOff} />}
            </div>
            <div className="tb-c">
                {/* The environments: a segmented pill beside the search (Rodada R, owner's mark R1 = C). */}
                <div className="envtabs" role="tablist" aria-label="Ambiente" onKeyDown={onTabsKey}>
                    {envTab("culto", "KERYX", "Projeção: músicas, mídia, setlist")}
                    {envTab("biblia", "Bíblia", "Bíblia · digite a referência")}
                </div>
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
                <SyncCloud open={open === "sync"} onToggle={() => toggle("sync")} />
                {/* Ver: the modules, the density and the arrangements; beside the bell.
                    Its gold dot: pedidos not seen while the Painel is in the tray (Rodada Q, S9 = B). */}
                <span className="tb-bell">
                    <IconBtn name="panels" className="tb-ver" title={verDot ? "Ver · módulos, densidade e disposição · pedidos novos no Painel" : "Ver · módulos, densidade e disposição"} on={open === "ver"} onClick={() => toggle("ver")} aria-haspopup="menu" aria-expanded={open === "ver"} />
                    {verDot && open !== "ver" && <i className="tb-bell-dot tb-new-dot" aria-hidden="true" />}
                </span>
                {/* tb-notifs: the bell's own name, the Notificações popover's
                    anchor (Ver's wrapper above is a .tb-bell too). */}
                <span className="tb-bell tb-notifs">
                    <IconBtn name="bell" title={unread ? `Notificações · ${unread} ${unread === 1 ? "nova" : "novas"}` : "Notificações"} on={open === "notifs"} onClick={() => toggle("notifs")} aria-expanded={open === "notifs"} />
                    {unread > 0 && open !== "notifs" && <i className="tb-bell-dot" aria-hidden="true" />}
                </span>
            </div>
        </div>
    );
}
