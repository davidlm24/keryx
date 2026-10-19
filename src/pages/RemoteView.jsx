import React, { useMemo, useState } from "react";
import Icon from "@/components/console/Icon";
import { useLiveNow, useLiveState } from "@/hooks/useLiveState";
import { useChurch } from "@/hooks/useChurch";
import { UNLOCK_HOLD_MS } from "@/lib/console/remoteClient";
import { airHeader, bannerOf, canRun, capsOf } from "@/lib/network/remoteView";
import { useCommands, useKeepAwake, usePhoneState, useStale } from "@/components/network/remote/usePhone";
import { Cmd, HoldButton, Toast } from "@/components/network/remote/parts";
import LiveTab from "@/components/network/remote/LiveTab";
import SetlistTab from "@/components/network/remote/SetlistTab";
import MoreTab from "@/components/network/remote/MoreTab";
import MediaTab from "@/components/network/remote/MediaTab";
import BibleTab from "@/components/network/remote/BibleTab";

// Controle remoto (/Remote): a phone on the church Wi-Fi conducts the
// service. Only on the network, only while the operator turned it on, only
// with its code (electron/lan.cjs). Every button asks the console, which
// runs it as its own key would and answers (shared/remoteProtocol.json);
// what is on air comes from the live state, like the screens. Tabs at the
// bottom, in reach of the thumb (owner's pick); a left rail in landscape and
// on a tablet (remote.css). Sections the console does not run (its `caps`)
// are not shown.
const TABS = [
    ["live", "Ao vivo", "monitor", "live"],
    ["setlist", "Setlist", "list", "setlist"],
    ["media", "Mídia", "media", "library"],
    ["bible", "Bíblia", "book", "bible"],
    ["more", "Mais", "more", null],
];

export default function RemoteView() {
    const live = useLiveState();
    const church = useChurch();
    const stale = useStale();
    const { state, gate, setGate, refresh } = usePhoneState(live);
    const cmd = useCommands({ setGate });
    const awake = useKeepAwake();
    const [tab, setTab] = useState("live");
    const [touchLocked, setTouchLocked] = useState(false);
    const caps = useMemo(() => capsOf(state), [state]);
    const locked = Boolean(live?.locked);
    const c = { busy: cmd.busy, run: cmd.run, flags: { stale, locked } };
    const tabs = TABS.filter(([, , , cap]) => !cap || !state || caps.has(cap));
    const shown = tabs.some(([k]) => k === tab) ? tab : "live";
    const banner = bannerOf({ stale, unknown: cmd.unknown, locked, canUnlock: caps.has("lock") });
    const again = () => { cmd.clearUnknown(); setGate(null); refresh(); };

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

    return (
        <div className="net rm">
            <Header live={live} stale={stale} c={c} church={church.name} />
            {banner && (
                <div className={`rm-ban is-${banner.tone}`} role="status">
                    <span>{banner.text}</span>
                    {banner.refresh && <button type="button" className="rm-ban-b" onClick={() => (stale ? window.location.reload() : again())}>Atualizar</button>}
                </div>
            )}
            <div className="rm-body">
                {shown === "live" && <LiveTab live={live} state={state} caps={caps} c={c} />}
                {shown === "setlist" && <SetlistTab live={live} state={state} c={c} />}
                {shown === "media" && <MediaTab c={c} setGate={setGate} />}
                {shown === "bible" && <BibleTab state={state} c={c} />}
                {shown === "more" && <MoreTab live={live} state={state} caps={caps} c={c} awake={awake} touchLock={{ on: touchLocked, lock: () => setTouchLocked(true) }} onRefresh={again} />}
                <nav className="rm-tabs" role="tablist" aria-label="Seções do controle remoto">
                    {tabs.map(([k, label, icon]) => (
                        <button type="button" key={k} role="tab" aria-selected={shown === k} className="rm-tab" onClick={() => setTab(k)}>
                            <Icon name={icon} size={22} />{label}
                        </button>
                    ))}
                </nav>
            </div>
            <Toast toast={cmd.toast} onClose={cmd.closeToast} canUndo={canRun(caps, "undo")} onUndo={() => cmd.run("undo", "undo")} />
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
// its Tirar.
function Header({ live, stale, c, church }) {
    const now = useLiveNow(1000, Boolean(live) && !stale);
    const h = airHeader(live, { stale, now });
    return (
        <header className={`rm-head is-${h.tone}`}>
            <div className="rm-air">
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
