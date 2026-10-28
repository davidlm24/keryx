import React, { useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { useLiveNow } from "@/hooks/useLiveState";
import { HOLD_MS } from "@/lib/console/remoteClient";
import { canRun, dockModes, endState, isV1, nowBarInfo, onAirNow, playerInfo, volumeStep } from "@/lib/network/remoteView";
import { Cmd, HoldButton, Sheet } from "./parts";

// The controls at the bottom, in reach of the thumb (owner 2026-10-28, M2 =
// A): open on Apresentar — Letra | Player on top, the big arrows or the
// player, then Tela preta · Logo · Limpar · Encerrar —, folded on every other
// tab to one line (⏮ · the slide on air and the next · ⏭), whose middle opens
// the same controls in a sheet. The side follows what is on air (Player when
// only something plays) unless the operator picked the other. It replaced
// Ao vivo's cards and the No ar bar (Rodada Q).
export default function ControlDock({ live, state, caps, c, open, onFold, mode, setMode, ended, onUndo, onShort }) {
    const [sheet, setSheet] = useState(false);
    const n = nowBarInfo(live);
    const body = { live, state, caps, c, mode, setMode, ended, onUndo, onShort };
    if (open) return <section className="rm-dock" aria-label="Controles do que está no ar"><DockBody {...body} onFold={onFold} /></section>;
    if (!n) return null;
    const arrows = n.arrows && canRun(caps, "next");
    const expand = () => (onFold ? onFold() : setSheet(true));
    return (
        <>
            <div className={`rm-now is-${n.tone}`}>
                {arrows && <Cmd c={c} k="now-prev" action="prev" className="rm-now-arr" label="Slide anterior" quiet><Icon name="chevron-left" size={24} /></Cmd>}
                <button type="button" className="rm-now-mid" onClick={expand} aria-haspopup={onFold ? undefined : "dialog"} aria-label={`No ar: ${n.now}${n.pos ? `, ${n.pos}` : ""}. Abrir os controles`}>
                    <span className="rm-now-a"><span className="rm-dot" aria-hidden="true" /><span className="rm-now-t">{n.now}</span>{n.pos && <em>{n.pos}</em>}</span>
                    {n.next && <span className="rm-now-b">{n.next}</span>}
                </button>
                {arrows && <Cmd c={c} k="now-next" action="next" className="rm-now-arr" label={n.reveal ? "Revelar" : "Próximo slide"} quiet><Icon name="chevron-right" size={24} /></Cmd>}
                <button type="button" className="rm-fold" onClick={expand} aria-label="Abrir os controles"><Icon name="chevron-up" size={20} /></button>
            </div>
            {sheet && (
                <Sheet title="No ar" onClose={() => setSheet(false)}>
                    <DockBody {...body} />
                </Sheet>
            )}
        </>
    );
}

function DockBody({ live, state, caps, c, mode, setMode, onFold, ended, onUndo, onShort }) {
    const now = useLiveNow(1000, Boolean(live?.video || live?.media || live?.audio));
    const m = dockModes(live, mode);
    const n = nowBarInfo(live);
    const on = onAirNow(live);
    const p = m.player ? playerInfo(live, now) : null;
    const screen = live?.screen || "show";
    const what = m.mode === "player" && p ? `${p.at}${p.length ? ` de ${p.length}` : ""}` : n?.next || "";
    return (
        <div className="rm-dockb">
            {on && (
                <div className="rm-dock-top">
                    <div className="rm-dseg" role="group" aria-label="Controle">
                        <button type="button" aria-pressed={m.mode === "letra"} disabled={!m.letra} onClick={() => setMode("letra")}>Letra</button>
                        <button type="button" aria-pressed={m.mode === "player"} disabled={!m.player} onClick={() => setMode("player")}>Player</button>
                    </div>
                    <span className="rm-dock-what">{what}</span>
                    {onFold && <button type="button" className="rm-fold" onClick={onFold} aria-label="Fechar os controles"><Icon name="chevron-down" size={20} /></button>}
                </div>
            )}
            {m.mode === "letra" && m.letra && canRun(caps, "next") && (
                <div className="rm-arrows">
                    <Cmd c={c} action="prev" className="rm-arr" label="Slide anterior"><Icon name="chevron-left" size={24} />Anterior</Cmd>
                    <Cmd c={c} action="next" className="rm-arr" label={n?.reveal ? "Revelar" : "Próximo slide"}>{n?.reveal ? "Revelar" : "Próximo"}<Icon name="chevron-right" size={24} /></Cmd>
                </div>
            )}
            {m.mode === "player" && p && <PlayerPad p={p} state={state} caps={caps} c={c} />}
            <div className="rm-acts">
                <Cmd c={c} action="black" args={{ on: screen !== "black" }} className={`rm-act ${screen === "black" ? "is-on" : ""}`} pressed={screen === "black"}><Icon name="black" size={18} />Tela preta</Cmd>
                <Cmd c={c} action="logo" args={{ on: screen !== "logo" }} className={`rm-act ${screen === "logo" ? "is-on" : ""}`} pressed={screen === "logo"}><Icon name="logo" size={18} />Logo</Cmd>
                <Cmd c={c} action="clear" className="rm-act" disabled={!on}><Icon name="eraser" size={18} />Limpar</Cmd>
                <EndButton live={live} caps={caps} c={c} ended={ended} onUndo={onUndo} onShort={onShort} />
            </div>
        </div>
    );
}

// What plays: where it is, ⏮ −10 ⏯ +10 ⏭, the eye, the volume in steps of
// 10 % and mute. A version 1 console only has tocar/pausar.
function PlayerPad({ p, state, caps, c }) {
    const lastVolume = useRef(100);
    const full = caps.has("player");
    if (!full && !isV1(state)) return null;
    if (p.volume > 0) lastVolume.current = p.volume;
    const layer = p.layer;
    const muted = p.volume === 0;
    const vol = (v) => ({ do: "volume", layer, volume: v });
    return (
        <section className="rm-pad" aria-label={`Player: ${p.title}`}>
            <div className="rm-prog">
                <span>{p.at}</span>
                <div className="rm-bar" aria-hidden="true"><i style={{ width: `${p.pct}%` }} /></div>
                <span>{p.length}</span>
            </div>
            {full ? (
                <>
                    <div className="rm-ctl">
                        <Cmd c={c} k="p-prev" action="player" args={{ do: "prev", layer }} label="Anterior" quiet disabled={!p.list}><Icon name="skip-back" size={22} /></Cmd>
                        <Cmd c={c} k="p-back" action="player" args={{ do: "back", layer }} label="Voltar 10 segundos" quiet>−10</Cmd>
                        <Cmd c={c} k="p-toggle" action="player" args={{ do: "toggle", layer }} className="is-play" label={p.paused ? "Tocar" : "Pausar"} quiet><Icon name={p.paused ? "play" : "pause"} size={24} /></Cmd>
                        <Cmd c={c} k="p-fwd" action="player" args={{ do: "forward", layer }} label="Avançar 10 segundos" quiet>+10</Cmd>
                        <Cmd c={c} k="p-next" action="player" args={{ do: "next", layer }} label="Próximo" quiet disabled={!p.list}><Icon name="skip-fwd" size={22} /></Cmd>
                    </div>
                    <div className="rm-vol2">
                        {p.swap
                            ? (
                                <Cmd c={c} k="p-swap" action="player" args={{ do: "swap", layer }} className={p.swap.sound ? "is-sound" : ""} disabled={p.swap.disabled || (p.swap.sound && (c.flags.locked || c.flags.stale))} label={p.swap.title} title={p.swap.title} pressed={p.swap.sound}>
                                    <Icon name={p.swap.sound ? "eye-off" : "eye"} size={20} />
                                </Cmd>
                            )
                            : <span />}
                        <span className="rm-vol-n" aria-live="polite">{muted ? "mudo" : `${p.volume}%`}</span>
                        <Cmd c={c} k="p-vol" action="player" args={vol(volumeStep(p.volume, -10))} label="Volume menos 10" quiet disabled={muted}>−</Cmd>
                        <Cmd c={c} k="p-vol" action="player" args={vol(volumeStep(muted ? 0 : p.volume, 10))} label="Volume mais 10" quiet>+</Cmd>
                        <Cmd c={c} k="p-mute" action="player" args={vol(muted ? lastVolume.current : 0)} className={muted ? "is-on" : ""} label={muted ? "Tirar o mudo" : "Mudo"} pressed={muted} quiet>
                            <Icon name={muted ? "volume-off" : "volume"} size={20} />
                        </Cmd>
                    </div>
                </>
            ) : (
                <div className="rm-ctl is-one">
                    <Cmd c={c} action="play" className="is-play" label={p.paused ? "Tocar" : "Pausar"}><Icon name={p.paused ? "play" : "pause"} size={24} />{p.paused ? "Tocar" : "Pausar"}</Cmd>
                </div>
            )}
        </section>
    );
}

// Encerrar (owner 2026-10-28, M5): off with nothing on air, a red outline
// while something is (held 1,5 s; a short tap only says to hold it), and for
// 8 s after this phone ended it is Desfazer with its count.
function EndButton({ live, caps, c, ended, onUndo, onShort }) {
    // Ticks each second while a Desfazer counts; ended.at is this phone's own
    // clock, so the count is too (the live clock follows the computer's).
    useLiveNow(1000, Boolean(ended));
    const e = endState({ live, ended, now: Date.now(), canUndo: canRun(caps, "undo") });
    if (e.state === "done") {
        return (
            <button type="button" className={`rm-b rm-act is-done ${c.busy.has("undo") ? "is-busy" : ""}`} onClick={onUndo} aria-label={`Desfazer o encerramento, ${e.left} segundos`}>
                <Icon name="undo" size={18} /><span>Desfazer <em>{e.left}</em></span>
            </button>
        );
    }
    return (
        <HoldButton ms={HOLD_MS} label="Encerrar" holding="Segure…" icon="power" className={`rm-act is-end ${e.state === "off" ? "is-off" : ""}`} disabled={e.state === "off"}
            onDone={() => c.run("end", "end")} onShort={onShort} aria="Encerrar tudo: segure por um segundo e meio" />
    );
}
