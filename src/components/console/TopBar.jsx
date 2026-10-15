import React from "react";
import Icon from "./Icon";
import { IconBtn } from "./kx";
import { MenuBarButtons } from "./MenuBar";

// The top bar, a menu bar: the KERYX menu (the mark), the environments
// KERYX | BÍBLIA right after it (bold caps, the gold underline: places, not
// commands — "O topo", owner's pick B 2026-10-15; no icons), then the menu bar (Culto,
// Música, Mídia, Telas, Ferramentas; Rodada D4 — it folds into the mark's
// menu on a narrow window, console.css), the environments
// KERYX | Bíblia as tabs, the search, the service clock (how long the
// service has been running, from its scheduled time: serviceClock in
// src/lib/console/timeline.js; a click opens Planejar o culto), a compact
// clock, the outputs status, Ver (the eye) and the bell, and the screen actions
// (Tela preta, Logo, Limpar, Encerrar) as one chip of glyphs, named by
// their tooltips and aria-labels (owner decision 2026-10-10). Nothing
// wraps: as the window narrows the bar drops the service's end, then the
// clock, then shortens the outputs label and the search (container queries
// in console.css). Tela preta and Mostrar logo act even with the screens locked.
export default function TopBar({ c, menus = [], env, setEnv, open, setOpen, outsLabel, outsCount, outsState, logoUrl, unread = 0, svc, onPlanner }) {
    const { live, now } = c;
    const clock = new Date(now).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    const toggle = (name) => setOpen(open === name ? null : name);
    const envTab = (value, label, title) => (
        <button type="button" role="tab" aria-selected={env === value} className={`kx-t ${env === value ? "is-on" : ""}`} title={title} onClick={() => setEnv(value)}>{label}</button>
    );
    return (
        <div className="topbar">
            <div className="tb-l">
                <button type="button" className={`markbtn kx-t ${open === "menu" ? "is-on" : ""}`} onClick={() => toggle("menu")} aria-haspopup="menu" aria-expanded={open === "menu"} title="Menu" aria-label="Menu">
                    {logoUrl ? <img src={logoUrl} alt="" /> : <span className="kx-mark" />}
                </button>
                <div className="kx-tabs envtabs" role="tablist" aria-label="Ambiente">
                    {envTab("culto", "KERYX", "Projeção: músicas, mídia, setlist")}
                    {envTab("biblia", "Bíblia", "Bíblia · digite a referência")}
                </div>
                {menus.length > 0 && <><span className="tb-div" aria-hidden="true" /><MenuBarButtons menus={menus} open={open} setOpen={setOpen} /></>}
            </div>
            <div className="tb-c">
                <div className="kx-field kx-t tb-search" onClick={() => setOpen("palette")} title="Buscar ou comandar · /" role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === "Enter") setOpen("palette"); }}>
                    <Icon name="search" /><input placeholder="Buscar em tudo" aria-label="Buscar em tudo" readOnly tabIndex={-1} /><kbd>/</kbd>
                </div>
            </div>
            <div className="tb-r">
                {svc && (
                    <button type="button" className={`kx-btn kx-t tb-svc ${svc.muted ? "is-muted" : ""}`} onClick={onPlanner} title={svc.title} aria-label={`${svc.text}${svc.more ? ` · ${svc.more}` : ""} · Planejar o culto`}>
                        <Icon name="clock" /><span className="tb-svc-t">{svc.text}</span>
                        {svc.more && <span className={`tb-svc-more ${svc.warn ? "kx-warn" : ""}`}> · {svc.more}</span>}
                    </button>
                )}
                <span className="tb-clock" title="Hora">{clock}</span>
                <button type="button" className={`kx-status kx-t ${outsState ? `is-${outsState}` : ""}`} onClick={() => toggle("outs")} title={`Telas e saídas · ${outsLabel}`} aria-expanded={open === "outs"}>
                    <i className="kx-dot" /><span className="tb-outs-l">{outsLabel}</span><span className="tb-outs-s">Saídas · {outsCount}</span>
                </button>
                {/* Ver: the modules, the density and the arrangements; beside the bell. */}
                <IconBtn name="eye" className="tb-ver" title="Ver · módulos, densidade e disposição" on={open === "ver"} onClick={() => toggle("ver")} aria-haspopup="menu" aria-expanded={open === "ver"} />
                <span className="tb-bell">
                    <IconBtn name="bell" title={unread ? `Notificações · ${unread} ${unread === 1 ? "nova" : "novas"}` : "Notificações"} on={open === "notifs"} onClick={() => toggle("notifs")} aria-expanded={open === "notifs"} />
                    {unread > 0 && open !== "notifs" && <i className="tb-bell-dot" aria-hidden="true" />}
                </span>
                {/* The actions that change what the audience sees: one chip of
                    glyphs; the names and shortcuts are in the tooltips. */}
                <span className="tb-screens" role="group" aria-label="Telas: ações que mudam o que o público vê">
                    <button type="button" className={`kx-btn kx-t ${live?.screen === "black" ? "is-on" : ""}`} aria-pressed={live?.screen === "black"} aria-label="Tela preta" title="Tela preta · B · nas telas, na hora" onClick={() => c.toggleScreen("black")}><Icon name="black" /></button>
                    <button type="button" className={`kx-btn kx-t ${live?.screen === "logo" ? "is-on" : ""}`} aria-pressed={live?.screen === "logo"} aria-label="Mostrar logo" title="Mostrar logo · L · nas telas" onClick={() => c.toggleScreen("logo")}><Icon name="logo" /></button>
                    <button type="button" className="kx-btn kx-t" aria-label="Limpar texto" title="Limpar texto · C" onClick={c.clearText}><Icon name="eraser" /></button>
                    <button type="button" className="kx-btn kx-t" aria-label="Encerrar a projeção" title="Encerrar a projeção (pergunta antes) · Esc encerra na hora" onClick={() => setOpen("encerrar")}><Icon name="stop" /></button>
                </span>
            </div>
        </div>
    );
}
