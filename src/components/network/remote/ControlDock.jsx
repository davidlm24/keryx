import React, { useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { useLiveNow } from "@/hooks/useLiveState";
import { HOLD_MS } from "@/lib/console/remoteClient";
import { canRun, dockModes, endState, isV1, nowBarInfo, onAirNow, playerInfo, UNDO_MS, volumeStep } from "@/lib/network/remoteView";
import { Cmd, HoldButton, Sheet } from "./parts";

// The controls at the bottom, always on screen while something is on air,
// on every section (owner's vistoria 2026-11-07, D1/D2 = A; it was open
// only on Apresentar and folded to one line elsewhere):
//   lyrics or a passage: what is on air (its slide, the next) · "Player ▸"
//   when a sound plays too · Encerrar; under it Anterior | Próximo across the
//   whole width, in reach of either thumb;
//   a video or an audio: ⏯ · the title and its progress (a tap opens the
//   player sheet: ⏮ −10 +10 ⏭ and the volume) · "Letra ▸" · the eye ·
//   Encerrar.
// Tela preta, Logo and Limpar live in Mais. After this phone's Encerrar
// tudo the dock stays for its Desfazer.
export default function ControlDock({ live, state, caps, c, mode, setMode, ended, onUndo, onShort, onPresent }) {
    const [sheet, setSheet] = useState(false);
    const now = useLiveNow(1000, Boolean(live?.video || live?.media || live?.audio));
    // The Desfazer after Encerrar keeps the dock until its 8 s are up.
    useLiveNow(1000, Boolean(ended));
    const undoing = Boolean(ended?.undo) && Date.now() - ended.at < UNDO_MS;
    if (!onAirNow(live) && !undoing) return null;
    const m = dockModes(live, mode);
    const n = nowBarInfo(live);
    const p = m.player ? playerInfo(live, now) : null;
    const asPlayer = m.mode === "player" && p;
    const arrows = !asPlayer && m.letra && canRun(caps, "next");
    const swapTo = m.letra && m.player ? (asPlayer ? "letra" : "player") : null;
    const end = <EndButton live={live} caps={caps} c={c} ended={ended} onUndo={onUndo} onShort={onShort} />;
    return (
        <section className="rm-dock" aria-label="Controles do que está no ar">
            <div className="rm-dk1">
                {asPlayer && <PlayToggle p={p} state={state} caps={caps} c={c} />}
                {asPlayer
                    ? (
                        <button type="button" className="rm-dk-mid" onClick={() => setSheet(true)} aria-haspopup="dialog" aria-label={`${p.title}, ${p.at}${p.length ? ` de ${p.length}` : ""}. Abrir o player`}>
                            <span className="rm-now-a"><span className="rm-dot" aria-hidden="true" /><span className="rm-now-t">{p.title}</span>{p.list && <em>{p.list}</em>}</span>
                            <span className="rm-dk-prog" aria-hidden="true"><span>{p.at}</span><span className="rm-bar"><i style={{ width: `${p.pct}%` }} /></span><span>{p.length}</span></span>
                        </button>
                    )
                    : (
                        <button type="button" className="rm-dk-mid" onClick={onPresent} aria-label={n ? `No ar: ${n.now}${n.pos ? `, ${n.pos}` : ""}. Abrir Apresentar` : "Nada no ar"}>
                            <span className="rm-now-a"><span className="rm-dot" aria-hidden="true" /><span className="rm-now-t">{n?.now || "Projeção encerrada"}</span>{n?.pos && <em>{n.pos}</em>}</span>
                            {n?.next && <span className="rm-now-b">{n.next}</span>}
                        </button>
                    )}
                {swapTo && (
                    <button type="button" className="rm-dk-swap" onClick={() => setMode(swapTo)} aria-label={swapTo === "player" ? "Mostrar o player" : "Mostrar a letra"}>
                        {swapTo === "player" ? "Player" : "Letra"}<Icon name="chevron-right" size={15} />
                    </button>
                )}
                {asPlayer && p.swap && caps.has("player") && (
                    <Cmd c={c} k="p-swap" action="player" args={{ do: "swap", layer: p.layer }} className={`rm-dk-eye ${p.swap.sound ? "is-sound" : ""}`} disabled={p.swap.disabled || (p.swap.sound && (c.flags.locked || c.flags.stale))} label={p.swap.title} title={p.swap.title} pressed={p.swap.sound}>
                        <Icon name={p.swap.sound ? "eye-off" : "eye"} size={20} />
                    </Cmd>
                )}
                {end}
            </div>
            {arrows && (
                <div className="rm-dk2">
                    <Cmd c={c} action="prev" className="rm-dk-arr" label="Slide anterior"><Icon name="chevron-left" size={24} />Anterior</Cmd>
                    <Cmd c={c} action="next" className="rm-dk-arr" label={n?.reveal ? "Revelar" : "Próximo slide"}>{n?.reveal ? "Revelar" : "Próximo"}<Icon name="chevron-right" size={24} /></Cmd>
                </div>
            )}
            {sheet && p && (
                <Sheet title="Player" onClose={() => setSheet(false)}>
                    <PlayerPad p={p} state={state} caps={caps} c={c} />
                </Sheet>
            )}
        </section>
    );
}

// ⏯ on the dock's row: the player's toggle (a version 1 console: `play`).
function PlayToggle({ p, state, caps, c }) {
    const full = caps.has("player");
    if (!full && !isV1(state)) return null;
    return full
        ? <Cmd c={c} k="p-toggle" action="player" args={{ do: "toggle", layer: p.layer }} className="rm-dk-play" label={p.paused ? "Tocar" : "Pausar"}><Icon name={p.paused ? "play" : "pause"} size={24} /></Cmd>
        : <Cmd c={c} action="play" className="rm-dk-play" label={p.paused ? "Tocar" : "Pausar"}><Icon name={p.paused ? "play" : "pause"} size={24} /></Cmd>;
}

// The player sheet: where it is, ⏮ −10 ⏯ +10 ⏭, the eye, the volume in
// steps of 10 % and mute. A version 1 console only has tocar/pausar.
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
            <p className="rm-hint is-left">{p.title}</p>
            <div className="rm-prog">
                <span>{p.at}</span>
                <div className="rm-bar" aria-hidden="true"><i style={{ width: `${p.pct}%` }} /></div>
                <span>{p.length}</span>
            </div>
            {full ? (
                <>
                    <div className="rm-ctl">
                        <Cmd c={c} k="p-prev" action="player" args={{ do: "prev", layer }} label="Anterior" disabled={!p.list}><Icon name="skip-back" size={22} /></Cmd>
                        <Cmd c={c} k="p-back" action="player" args={{ do: "back", layer }} label="Voltar 10 segundos"><Icon name="undo" size={18} />10 s</Cmd>
                        <Cmd c={c} k="p-toggle" action="player" args={{ do: "toggle", layer }} className="is-play" label={p.paused ? "Tocar" : "Pausar"}><Icon name={p.paused ? "play" : "pause"} size={24} /></Cmd>
                        <Cmd c={c} k="p-fwd" action="player" args={{ do: "forward", layer }} label="Avançar 10 segundos"><Icon name="redo" size={18} />10 s</Cmd>
                        <Cmd c={c} k="p-next" action="player" args={{ do: "next", layer }} label="Próximo" disabled={!p.list}><Icon name="skip-fwd" size={22} /></Cmd>
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
                        <Cmd c={c} k="p-vol" action="player" args={vol(volumeStep(p.volume, -10))} label="Volume menos 10" disabled={muted}><Icon name="minus" size={18} /></Cmd>
                        <Cmd c={c} k="p-vol" action="player" args={vol(volumeStep(muted ? 0 : p.volume, 10))} label="Volume mais 10"><Icon name="plus" size={18} /></Cmd>
                        <Cmd c={c} k="p-mute" action="player" args={vol(muted ? lastVolume.current : 0)} className={muted ? "is-on" : ""} label={muted ? "Tirar o mudo" : "Mudo"} pressed={muted}>
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
            <button type="button" className={`rm-b rm-act rm-dk-end is-done ${c.busy.has("undo") ? "is-busy" : ""}`} onClick={onUndo} aria-label={`Desfazer o encerramento, ${e.left} segundos`}>
                <Icon name="undo" size={18} /><span>Desfazer <em>{e.left}</em></span>
            </button>
        );
    }
    return (
        <HoldButton ms={HOLD_MS} label="Encerrar" holding="Segure…" icon="power" className={`rm-act rm-dk-end is-end ${e.state === "off" ? "is-off" : ""}`} disabled={e.state === "off"}
            onDone={() => c.run("end", "end")} onShort={onShort} aria="Encerrar tudo: segure por um segundo e meio" />
    );
}
