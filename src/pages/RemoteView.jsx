import React, { Suspense, lazy, useEffect, useMemo, useState } from "react";
import Icon from "@/components/console/Icon";
import { useLiveNow, useLiveState } from "@/hooks/useLiveState";
import { useChurch } from "@/hooks/useChurch";
import { UNLOCK_HOLD_MS } from "@/lib/console/remoteClient";
import { airHeader, bannerOf, canRun, capsOf, roleOf, tabsFor } from "@/lib/network/remoteView";
import { useCommands, useKeepAwake, usePhoneState, useStale } from "@/components/network/remote/usePhone";
import { Cmd, HoldButton, TabBar, Toast } from "@/components/network/remote/parts";
import ControlDock from "@/components/network/remote/ControlDock";

// Only the dock draws at once; every tab, the Biblioteca the phone opens on
// included, loads when first shown, so the page stays inside the outputs'
// budget (scripts/bundle-budget.cjs).
const MediaTab = lazy(() => import("@/components/network/remote/MediaTab"));
const PresentTab = lazy(() => import("@/components/network/remote/PresentTab"));
const SetlistTab = lazy(() => import("@/components/network/remote/SetlistTab"));
const BibleTab = lazy(() => import("@/components/network/remote/BibleTab"));
const MoreTab = lazy(() => import("@/components/network/remote/MoreTab"));
// Telas (N2): loaded the first time its button is pressed.
const TelasSheet = lazy(() => import("@/components/network/remote/TelasSheet"));
// The Equipe (Rodada Q PR4): a phone signed in with the Equipe's code.
const EquipeView = lazy(() => import("@/components/network/remote/EquipeView"));

// Controle remoto (/Remote): a phone on the church Wi-Fi conducts the
// service. Only on the network, only while the operator turned it on, only
// with its code (electron/lan.cjs). Every button asks the console, which
// runs it as its own key would and answers (shared/remoteProtocol.json);
// what is on air comes from the live state, like the screens. The sections
// are a tab bar at the bottom, in reach of the thumb, the same as the
// Equipe's (owner 2026-11-08, "mais simples" N1 = A — it replaced the ☰ of
// the 07/11 vistoria); a left rail in landscape and on a tablet (remote.css).
// A section stays mounted once seen, hidden while another shows, so the
// Biblioteca's search and chip and the Bíblia's marks are where they were.
// Sections the console does not run (its `caps`) are not shown. It opens on
// the Biblioteca and stays there after a send (owner 2026-10-28, M1 = A); "No
// ar" (the old Apresentar) is what is on air, big (M3). Tela preta, Logo,
// Limpar and Travar telas are the header's Telas button (N2 = A). The
// controls are the dock above the tab bar while something is on air
// (ControlDock). The phone shows no toast for what went well: only
// refusals, Encerrar's and the hold hint, right above the dock.
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
    const [telas, setTelas] = useState(false);
    // The sections seen so far: each stays mounted (hidden) after.
    const [seen, setSeen] = useState(() => new Set(["library"]));
    const [touchLocked, setTouchLocked] = useState(false);
    // The dock's side, Letra or Player, when the operator picked one.
    const [dockMode, setDockMode] = useState(null);
    const caps = useMemo(() => capsOf(state), [state]);
    const locked = Boolean(live?.locked);
    const c = { busy: cmd.busy, run: cmd.run, flags: { stale, locked } };
    const tabs = tabsFor(state);
    const shown = tabs.some(([k]) => k === tab) ? tab : tabs[0]?.[0] || "more";
    useEffect(() => { setSeen((cur) => (cur.has(shown) ? cur : new Set([...cur, shown]))); }, [shown]);
    const pane = (k, node) => (seen.has(k) || shown === k) && tabs.some(([t]) => t === k) && (
        <div className="rm-sect" hidden={shown !== k} key={k}>{node}</div>
    );
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
            <Header live={live} stale={stale} c={c} church={church.name} onTelas={canRun(caps, "black") || caps.has("lock") ? () => setTelas(true) : null} />
            {banner && (
                <div className={`rm-ban is-${banner.tone}`} role="status">
                    <span>{banner.text}</span>
                    {banner.refresh && <button type="button" className="rm-ban-b" onClick={() => (stale ? window.location.reload() : again())}>Atualizar</button>}
                </div>
            )}
            <div className="rm-body">
                <div className="rm-pane">
                    <Suspense fallback={<div className="rm-main" aria-busy="true" />}>
                        {pane("library", <MediaTab caps={caps} c={c} setGate={setGate} />)}
                        {pane("present", <PresentTab live={live} state={state} caps={caps} c={c} onLibrary={() => setTab("library")} />)}
                        {pane("setlist", <SetlistTab live={live} state={state} caps={caps} c={c} onRefresh={refresh} onBible={() => setTab("bible")} />)}
                        {pane("bible", <BibleTab state={state} caps={caps} c={c} />)}
                        {pane("more", <MoreTab live={live} state={state} caps={caps} c={c} awake={awake} touchLock={{ on: touchLocked, lock: () => setTouchLocked(true) }} onRefresh={again} />)}
                    </Suspense>
                    {/* The answer sits right above the dock, never over it. */}
                    <div className="rm-dockwrap">
                        <Toast toast={cmd.toast} onClose={cmd.closeToast} canUndo={canRun(caps, "undo")} onUndo={() => cmd.run("undo", "undo")} docked />
                        <ControlDock live={live} state={state} caps={caps} c={c}
                            mode={dockMode} setMode={setDockMode} onPresent={() => setTab("present")}
                            ended={cmd.ended} onUndo={() => cmd.run("undo", "undo")} onShort={() => cmd.say("Segure para encerrar tudo.")} />
                    </div>
                </div>
                <TabBar tabs={tabs} shown={shown} onTab={setTab} label="Seções do controle remoto" />
            </div>
            {telas && (
                <Suspense fallback={null}>
                    <TelasSheet live={live} caps={caps} c={c} onClose={() => setTelas(false)} />
                </Suspense>
            )}
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
// its Tirar. At its right the Telas button (N2 = A): Tela preta, Logo,
// Limpar and Travar telas in a sheet, two taps from any section.
function Header({ live, stale, c, church, onTelas }) {
    const now = useLiveNow(1000, Boolean(live) && !stale);
    const h = airHeader(live, { stale, now });
    return (
        <header className={`rm-head is-${h.tone}`}>
            <div className="rm-air">
                <span className="rm-dot" aria-hidden="true" />
                <span className="rm-air-t" aria-live="polite">{h.title}</span>
                {h.pos && <span className="rm-air-pos">{h.pos}</span>}
                {h.since ? <span className="rm-air-since">há {h.since}</span> : <span className="rm-air-since">{church || "KERYX"}</span>}
                {onTelas && (
                    <button type="button" className="rm-telas" aria-label="Telas: Tela preta, Logo, Limpar e Travar telas" aria-haspopup="dialog" onClick={onTelas}>
                        <Icon name="black" size={22} />
                    </button>
                )}
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
