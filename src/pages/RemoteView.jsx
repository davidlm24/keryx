import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { useLiveNow, useLiveState } from "@/hooks/useLiveState";
import { useChurch } from "@/hooks/useChurch";
import { UNLOCK_HOLD_MS } from "@/lib/console/remoteClient";
import { airHeader, bannerOf, canRun, capsOf, roleOf, tabsFor } from "@/lib/network/remoteView";
import { useCommands, useKeepAwake, usePhoneState, useStale } from "@/components/network/remote/usePhone";
import { Cmd, HoldButton, Toast } from "@/components/network/remote/parts";
import ControlDock from "@/components/network/remote/ControlDock";

// Only the dock draws at once; every tab, the Biblioteca the phone opens on
// included, loads when first shown, so the page stays inside the outputs'
// budget (scripts/bundle-budget.cjs).
const MediaTab = lazy(() => import("@/components/network/remote/MediaTab"));
const PresentTab = lazy(() => import("@/components/network/remote/PresentTab"));
const SetlistTab = lazy(() => import("@/components/network/remote/SetlistTab"));
const BibleTab = lazy(() => import("@/components/network/remote/BibleTab"));
const MoreTab = lazy(() => import("@/components/network/remote/MoreTab"));
// The Equipe (Rodada Q PR4): a phone signed in with the Equipe's code.
const EquipeView = lazy(() => import("@/components/network/remote/EquipeView"));

// Controle remoto (/Remote): a phone on the church Wi-Fi conducts the
// service. Only on the network, only while the operator turned it on, only
// with its code (electron/lan.cjs). Every button asks the console, which
// runs it as its own key would and answers (shared/remoteProtocol.json);
// what is on air comes from the live state, like the screens. Tabs at the
// bottom, in reach of the thumb (owner's pick); a left rail in landscape and
// on a tablet (remote.css). Sections the console does not run (its `caps`)
// are not shown. It opens on the Biblioteca and stays there after a send
// (owner 2026-10-28, M1 = A); Apresentar is what is on air, big (M3). The
// owner's vistoria of 2026-11-07: the sections are a ☰ menu at the left of
// the header (no tab bar at the bottom), and the controls are the dock at
// the bottom of every section while something is on air (ControlDock), the
// last thing on screen, nearest the thumb. The phone shows no toast for
// what went well: only refusals, Encerrar's and the hold hint, right above
// the dock.
// The code that signed the phone in decides which page it is (state.role):
// the Controle, or the Equipe's (EquipeView, Rodada Q PR4). The role last
// seen is kept on the phone, so a reload draws the right one at once; a
// phone that never had an answer waits up to ROLE_WAIT_MS for one, then
// draws the Controle (a reload never waits: the role kept answers).
const ROLE_KEY = "keryx.remote.role";
const ROLE_WAIT_MS = 1500;
const storedRole = () => { try { const r = localStorage.getItem(ROLE_KEY); return r === "team" || r === "control" ? r : null; } catch { return null; } };

export default function RemoteView() {
    const live = useLiveState();
    const church = useChurch();
    const stale = useStale();
    const { state, gate, setGate, refresh } = usePhoneState(live);
    const cmd = useCommands({ setGate });
    const awake = useKeepAwake();
    const [tab, setTab] = useState("library");
    const [touchLocked, setTouchLocked] = useState(false);
    // The dock's side, Letra or Player, when the operator picked one.
    const [dockMode, setDockMode] = useState(null);
    const caps = useMemo(() => capsOf(state), [state]);
    const locked = Boolean(live?.locked);
    const c = { busy: cmd.busy, run: cmd.run, flags: { stale, locked } };
    const tabs = tabsFor(state);
    const shown = tabs.some(([k]) => k === tab) ? tab : tabs[0]?.[0] || "more";
    const banner = bannerOf({ stale, unknown: cmd.unknown, locked, canUnlock: caps.has("lock") });
    const again = () => { cmd.clearUnknown(); setGate(null); refresh(); };
    const [kept] = useState(storedRole);
    const [waited, setWaited] = useState(false);
    useEffect(() => { const t = setTimeout(() => setWaited(true), ROLE_WAIT_MS); return () => clearTimeout(t); }, []);
    const role = roleOf(state) || kept || (waited ? "control" : null);
    useEffect(() => { const r = roleOf(state); if (r) try { localStorage.setItem(ROLE_KEY, r); } catch { /* not kept */ } }, [state]);

    if (gate) {
        return (
            <div className="net rm">
                <div className="rm-gate" role="alert">
                    <Icon name={gate === "off" ? "wifi-off" : "monitor"} size={32} />
                    <b>{gate === "off" ? "O controle remoto está desligado no computador" : "O console não está aberto no computador"}</b>
                    <span>{gate === "off" ? "Ligue em Configurações › Telas na rede, no KERYX." : "Abra o KERYX no computador e tente de novo."}</span>
                    <button type="button" className="rm-b is-sm" onClick={again}><Icon name="refresh" size={18} />Tentar de novo</button>
                </div>
            </div>
        );
    }

    if (!role) return <div className="net rm"><p className="rm-gate" aria-busy="true">Conectando ao KERYX…</p></div>;
    if (role === "team") {
        return (
            <Suspense fallback={<div className="net rm" aria-busy="true" />}>
                <EquipeView live={live} state={roleOf(state) === "team" ? state : null} stale={stale} cmd={cmd} />
            </Suspense>
        );
    }

    return (
        <div className="net rm">
            <Header live={live} stale={stale} c={c} church={church.name} tabs={tabs} shown={shown} onTab={setTab} />
            {banner && (
                <div className={`rm-ban is-${banner.tone}`} role="status">
                    <span>{banner.text}</span>
                    {banner.refresh && <button type="button" className="rm-ban-b" onClick={() => (stale ? window.location.reload() : again())}>Atualizar</button>}
                </div>
            )}
            <div className="rm-body">
                <div className="rm-pane">
                    <Suspense fallback={<div className="rm-main" aria-busy="true" />}>
                        {shown === "library" && <MediaTab caps={caps} c={c} setGate={setGate} />}
                        {shown === "present" && <PresentTab live={live} state={state} caps={caps} c={c} onLibrary={() => setTab("library")} />}
                        {shown === "setlist" && <SetlistTab live={live} state={state} caps={caps} c={c} onRefresh={refresh} onBible={() => setTab("bible")} />}
                        {shown === "bible" && <BibleTab state={state} caps={caps} c={c} />}
                        {shown === "more" && <MoreTab live={live} state={state} caps={caps} c={c} awake={awake} touchLock={{ on: touchLocked, lock: () => setTouchLocked(true) }} onRefresh={again} />}
                    </Suspense>
                    {/* The answer sits right above the dock, never over it. */}
                    <div className="rm-dockwrap">
                        <Toast toast={cmd.toast} onClose={cmd.closeToast} canUndo={canRun(caps, "undo")} onUndo={() => cmd.run("undo", "undo")} docked />
                        <ControlDock live={live} state={state} caps={caps} c={c}
                            mode={dockMode} setMode={setDockMode} onPresent={() => setTab("present")}
                            ended={cmd.ended} onUndo={() => cmd.run("undo", "undo")} onShort={() => cmd.say("Segure para encerrar tudo.")} />
                    </div>
                </div>
            </div>
            {touchLocked && (
                <div className="rm-tlock">
                    <div className="rm-sheet" role="dialog" aria-modal="true" aria-label="Toques travados">
                        <span className="rm-grab" aria-hidden="true" />
                        <h2 className="rm-sheet-h">Toques travados</h2>
                        <p className="rm-hint">Os toques na tela estão desligados. Segure o botão para liberar.</p>
                        <HoldButton ms={UNLOCK_HOLD_MS} label="Segure para liberar" icon="unlock" onDone={() => setTouchLocked(false)} />
                    </div>
                </div>
            )}
        </div>
    );
}

// What is on air, sticky on top: red on air, amber for Tela preta, Logo or
// locked screens, grey with nothing (or no link); one chip per layer with
// its Tirar. The ☰ at its left opens the sections (vistoria 2026-11-07).
function Header({ live, stale, c, church, tabs, shown, onTab }) {
    const now = useLiveNow(1000, Boolean(live) && !stale);
    const h = airHeader(live, { stale, now });
    const current = tabs.find(([k]) => k === shown);
    return (
        <header className={`rm-head is-${h.tone}`}>
            <div className="rm-air">
                <SectionsMenu tabs={tabs} shown={shown} onTab={onTab} label={current ? `Seções: ${current[1]}` : "Seções"} />
                <span className="rm-dot" aria-hidden="true" />
                <span className="rm-air-t" aria-live="polite">{h.title}</span>
                {h.pos && <span className="rm-air-pos">{h.pos}</span>}
                {h.since ? <span className="rm-air-since">há {h.since}</span> : <span className="rm-air-since">{church || "KERYX"}</span>}
            </div>
            {(h.chips.length > 0 || h.locked) && (
                <div className="rm-chiprow">
                    {h.chips.map((ch) => (
                        <span key={ch.key} className={`rm-lchip ${ch.amber ? "is-amber" : ""}`}>
                            {ch.label}
                            <Cmd c={c} k={`off-${ch.key}`} action={ch.action} args={ch.args} className="rm-lchip-x" label={`Tirar ${ch.label}`}><Icon name="x" size={14} /></Cmd>
                        </span>
                    ))}
                    {h.locked && <span className="rm-lchip is-lock"><Icon name="lock" size={14} />Travado</span>}
                </div>
            )}
        </header>
    );
}

// The sections (Biblioteca, Apresentar, Bíblia, Setlist, Mais) behind the ☰
// at the header's left (owner 2026-11-07: no tab bar at the bottom, the dock
// is the last thing on screen). Esc, the scrim or a pick closes it; the focus
// goes back to the ☰.
function SectionsMenu({ tabs, shown, onTab, label }) {
    const [open, setOpen] = useState(false);
    const button = useRef(null);
    const list = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        list.current?.querySelector("[aria-current='page']")?.focus() || list.current?.querySelector("button")?.focus();
        const key = (e) => { if (e.key === "Escape") { setOpen(false); button.current?.focus(); } };
        document.addEventListener("keydown", key);
        return () => document.removeEventListener("keydown", key);
    }, [open]);
    const pick = (k) => { setOpen(false); onTab(k); button.current?.focus(); };
    return (
        <>
            <button type="button" ref={button} className={`rm-menu ${open ? "is-open" : ""}`} aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
                <Icon name="menu" size={22} />
            </button>
            {open && (
                <>
                    <div className="rm-scrim is-menu" onClick={() => setOpen(false)} aria-hidden="true" />
                    <nav className="rm-mnu" ref={list} aria-label="Seções do controle remoto">
                        {tabs.map(([k, name, icon]) => (
                            <button type="button" key={k} className="rm-mrow" aria-current={shown === k ? "page" : undefined} onClick={() => pick(k)}>
                                <Icon name={icon} size={22} />{name}
                            </button>
                        ))}
                    </nav>
                </>
            )}
        </>
    );
}
