import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { IconBtn, Seg } from "./kx";
import { livePosition } from "@shared/live-state.mjs";
import { useLiveNow } from "@/hooks/useLiveState";
import { playerLayers, playerLayer, playerOp, videoSwap, LAYER_LABEL, clock, followsItem, followLabel, followAction, followTicks, clockLength, seekAt, SEEK_KEY_SECONDS } from "@/lib/console/player";
import { levelsNow, useReportedDuration, useMeterFeed } from "./meterStore";

const HOT = 0.95; // about -3 dBFS
const FALL_PER_FRAME = 0.035;

// Two level meters (L / R): the console measures the PC's own sound output
// (system loopback), so they show what actually reaches the speakers — and
// measuring can never disturb playback. They read the meter store on
// animation frames and paint the bars directly: the levels never re-render
// the console. Peaks fall back slowly, as on a mixer.
function Meters() {
    useMeterFeed();
    const bars = useRef([]);
    const box = useRef(null);
    useEffect(() => {
        let raf = 0;
        const shown = [0, 0];
        let last = 0;
        const paint = (t) => {
            raf = requestAnimationFrame(paint);
            if (t - last < 40) return;
            last = t;
            const lv = levelsNow();
            [lv.l, lv.r].forEach((v, i) => {
                shown[i] = Math.max(v, shown[i] - FALL_PER_FRAME);
                const b = bars.current[i];
                if (b) {
                    b.style.height = `${Math.round(shown[i] * 100)}%`;
                    b.classList.toggle("is-hot", shown[i] >= HOT);
                }
            });
            if (box.current) box.current.dataset.state = lv.state;
        };
        raf = requestAnimationFrame(paint);
        return () => cancelAnimationFrame(raf);
    }, []);
    const title = "Níveis L / R · o som que está saindo deste computador";
    return (
        <span className="meters" ref={box} title={title} aria-hidden="true">
            <span className="kx-meter"><i><b ref={(el) => { bars.current[0] = el; }} /></i><i><b ref={(el) => { bars.current[1] = el; }} /></i></span>
            <span className="lr">L R</span>
        </span>
    );
}

// The volume: a mute toggle and a slider. While it is dragged the slider
// follows the hand; the operation goes out at most every 80 ms.
function Volume({ volume, onVolume, disabled }) {
    const [drag, setDrag] = useState(null);
    const lastSent = useRef(0);
    const before = useRef(1);
    const pending = useRef(null);
    const value = drag ?? Math.round((volume ?? 1) * 100);
    const send = (v, force = false) => {
        const now = Date.now();
        if (!force && now - lastSent.current < 80) {
            clearTimeout(pending.current);
            pending.current = setTimeout(() => send(v, true), 80);
            return;
        }
        lastSent.current = now;
        onVolume(v / 100);
    };
    useEffect(() => () => clearTimeout(pending.current), []);
    const muted = (volume ?? 1) === 0;
    const toggleMute = () => {
        if (muted) onVolume(before.current || 1);
        else { before.current = volume ?? 1; onVolume(0); }
    };
    return (
        <span className="pl-vol">
            <IconBtn name={muted ? "volume-off" : "volume"} title={muted ? "Ligar o som" : "Mudo"} onClick={toggleMute} disabled={disabled} />
            <input type="range" min={0} max={100} step={1} value={value} disabled={disabled} aria-label="Volume"
                style={{ "--v": `${value}%` }}
                onChange={(e) => { const v = Number(e.target.value); setDrag(v); send(v); }}
                // Let go of the focus after a drag (even one that ended off the
                // slider, when no click follows): the live keys, a clicker's
                // PageDown included, are the console's again.
                onPointerUp={(e) => { if (drag != null) { clearTimeout(pending.current); onVolume(drag / 100); } setDrag(null); const el = e.currentTarget; setTimeout(() => el.blur(), 0); }}
                onKeyUp={() => setDrag(null)}
                title={`Volume · ${value}%`} />
            <span className="pl-num">{value}%</span>
        </span>
    );
}

// Letra automática (owner 2026-10-15, Rodada D4): what the lyrics on air
// follow, as a chip — a click pauses and resumes it (the band repeated a
// chorus, a prayer in the middle); a live song waits for Iniciar.
function FollowChip({ follow, onAction, disabled }) {
    const action = followAction(follow);
    if (!follow || !action) return null;
    if (action === "start") {
        return (
            <button type="button" className="kx-btn kx-btn-brand kx-t pl-follow-go" disabled={disabled} onClick={() => onAction("start")}
                title="Aperte na introdução: a letra avança sozinha nos tempos marcados · ← → acertam o relógio">
                <Icon name="play" /><span className="lbl">Iniciar letra automática</span>
            </button>
        );
    }
    const state = follow.paused ? "is-paused" : "is-on";
    return (
        <button type="button" className={`kx-btn kx-t pl-follow ${state}`} disabled={disabled} onClick={() => onAction(action)}
            title={follow.paused ? "Retomar: a letra volta a seguir, do slide no ar" : "Pausar a letra automática · ← → continuam acertando o relógio"}>
            <Icon name={follow.source === "clock" ? "clock" : "music"} /><span className="lbl">{followLabel(follow)}</span>
        </button>
    );
}

const SEEK_KEYS = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1 };

// The progress bar (owner 2026-10-16, Rodada F1: "freely movable"): dragged
// with the pointer (captured, so the hand may leave the bar) or stepped with
// ← / → once Tab gives it the focus — a mouse press never focuses it, so the
// live arrows stay the console's. While the hand holds it only this window
// moves (`onScrub`: the bar, the elapsed and the remaining time follow the
// pointer, a tip over the thumb says where); the screens jump ONCE, on
// release (`onSeek`), so the letra automática never walks through every
// slide the hand passed. `can` false (nothing playing, the live clock): a
// bar that only shows.
function Seek({ value, duration, can, scrubbing, ticks, onScrub, onSeek }) {
    const held = useRef(false);
    const at = (e) => seekAt(e.clientX, e.currentTarget.getBoundingClientRect(), duration);
    const pct = duration ? Math.min(100, (value / duration) * 100) : 0;
    const letGo = (e, seek) => {
        if (!held.current) return;
        held.current = false;
        if (seek) onSeek(at(e)); else onScrub(null);
    };
    return (
        <span className={`pl-seek is-live ${duration ? "" : "is-unknown"} ${can ? "is-can" : ""} ${scrubbing ? "is-drag" : ""}`} role="slider" tabIndex={can ? 0 : -1}
            aria-label="Posição" aria-valuemin={0} aria-valuemax={Math.round(duration || 0)} aria-valuenow={Math.round(value)} aria-valuetext={clock(value)} aria-disabled={can ? undefined : true}
            onMouseDown={(e) => e.preventDefault()}
            onPointerDown={(e) => {
                if (!can || e.button !== 0) return;
                held.current = true;
                try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* a pointer the page did not see go down */ }
                onScrub(at(e));
            }}
            onPointerMove={(e) => { if (held.current) onScrub(at(e)); }}
            onPointerUp={(e) => letGo(e, true)}
            onPointerCancel={(e) => letGo(e, false)}
            onKeyDown={(e) => {
                const dir = SEEK_KEYS[e.key];
                if (!can || !dir || e.ctrlKey || e.metaKey || e.altKey) return;
                e.preventDefault();
                onSeek(value + dir * SEEK_KEY_SECONDS);
            }}>
            <i style={{ width: `${pct}%` }} />
            {ticks.map((t) => <span key={t.i} className="pl-tick" style={{ left: `${t.pct}%` }} title={`Slide ${t.label}`} />)}
            <b style={{ left: `${pct}%` }} />
            {scrubbing && <em className="pl-tip" style={{ left: `${pct}%` }}>{clock(value)}</em>}
        </span>
    );
}

// The player between the Programa and the Prévia: whatever plays with sound on the screens
// or the KERYX computer (a video, a YouTube link, an audio file or list), with
// Anterior, −10 s, Tocar/Pausar, +10 s, Próximo, Só o som (a video leaves
// the screen and its sound carries on; red while it does, the eye again
// brings it back), Parar, the position, the volume and the output's level
// meters. Always there, so the monitors never move; idle when nothing plays
// (only its icon, the controls dimmed). Acts on the document the console
// drives (the live state; while the screens are locked its controls are refused).
export default function PlayerBar({ c, picked, setPicked, videoScreens, projectorOpen }) {
    const { cur } = c;
    const layers = playerLayers(cur);
    const layer = playerLayer(cur, picked);
    const media = layer ? cur[layer] : null;
    // A song on air that follows the live clock, with nothing else playing:
    // the player is that clock (Iniciar, pause, its time and the marks).
    const follow = cur?.content?.follow || null;
    const clockOnly = !media && follow?.source === "clock";
    const item = media || (clockOnly ? { title: cur.content.title, kind: "clock", playback: follow.clock } : null);
    const reported = useReportedDuration(layer, media?.url);
    // A song's playback or video the file has not told its length yet: the song's.
    const duration = clockOnly ? clockLength(cur.content.slides, follow) : media?.duration || reported || (followsItem(follow, media) ? follow.length || null : null);
    const pb = item?.playback;
    // The position counts on the player's own clock, only while it plays:
    // its tick re-renders the player, not the console.
    const now = useLiveNow(1000, Boolean(pb && !pb.paused));
    const pos = pb ? livePosition(pb, now) : 0;
    const followOp = (action) => c.callOp("content.follow", { action }).catch(() => {});
    const ticks = followsItem(follow, media) || clockOnly ? followTicks(cur.content.slides, follow, duration) : [];
    const run = (action, extra) => {
        // The live clock: its play/pause is the follow's.
        if (clockOnly) { if (action === "toggle") followOp(followAction(follow)); return; }
        const op = playerOp(cur, layer, action, { pos, duration, ...extra });
        if (op) c.callOp(op[0], op[1]).catch(() => {});
    };
    const off = !item;
    // Where the hand holds the progress bar ({ t, held }). After the release
    // it stays until the screens have the new position (`key` changes: the
    // playback the seek wrote), the seek is refused, or 1.5 s pass, so the
    // bar never jumps back for a moment. The live clock never seeks.
    const canSeek = Boolean(duration) && !off && !clockOnly;
    const [scrub, setScrub] = useState(null);
    const pbKey = `${layer}|${media?.url}|${pb?.position}|${pb?.at}|${pb?.paused}`;
    useEffect(() => { setScrub((s) => (s && !s.held && s.key !== pbKey ? null : s)); }, [pbKey]);
    useEffect(() => { if (!canSeek) setScrub(null); }, [canSeek]);
    useEffect(() => {
        if (!scrub || scrub.held) return undefined;
        const t = setTimeout(() => setScrub(null), 1500);
        return () => clearTimeout(t);
    }, [scrub]);
    const seekTo = (t) => {
        const op = canSeek ? playerOp(cur, layer, "seek", { pos: t, duration }) : null;
        if (!op) { setScrub(null); return; }
        setScrub({ t: op[1].time, held: false, key: pbKey });
        c.callOp(op[0], op[1]).catch(() => setScrub(null));
    };
    const livePos = duration ? Math.min(pos, duration) : pos;
    const shownPos = scrub ? scrub.t : livePos;
    const list = item?.playlist;
    const at = item?.playlistIndex ?? 0;
    const listPos = list ? `${at + 1}/${list.length}` : "";
    // No kind word on screen (owner 2026-10-16, Rodada F1: the icon says
    // it); only the tooltip keeps it, and an item without a title.
    const kindWord = item ? (item.kind === "clock" ? "Ao vivo · sem mídia" : item.kind === "youtube" ? "YouTube" : item.kind === "audio" ? "Áudio" : layer === "audio" ? "Som do vídeo" : "Vídeo") : "";
    const name = item ? item.title || kindWord : "";
    const swap = videoSwap(cur, layer);
    // A video playing as sound only: the eye is red and pressed.
    const soundOnly = swap?.action === "showVideo";
    const where = layer === "video" ? (videoScreens || "telas de vídeo") : layer === "media" ? "Projetor" : layer === "audio" ? "Computador do projetor" : "";
    const silent = (layer === "audio" || layer === "media") && !projectorOpen;

    // Two rows (owner 2026-10-16, Rodada F1): what plays (its icon, title
    // and place in the list), the time and the progress bar on the first;
    // the controls under it: the transport, the eye, Parar, the layer, the
    // letra automática, where the sound goes, then the volume and the meters
    // at the right end. As the player narrows row 2 gives way (console.css):
    // the volume number, −10/+10, the labels, the volume's width, then the
    // meters and where; Tocar, the eye, Parar and the mute always stay.
    return (
        <div className={`player ${off ? "is-idle" : ""}`} role="group" aria-label="Player de mídia">
            <div className="pl-row pl-row1">
                <span className="pl-what" title={item ? `${name} · ${kindWord}${listPos ? ` · ${listPos}` : ""}` : undefined}>
                    <Icon name={item?.kind === "clock" ? "clock" : item?.kind === "audio" ? "volume" : item?.kind === "youtube" ? "youtube" : "film"} />
                    {item && <span className="t">{name}</span>}
                    {listPos && <span className="pl-n">{listPos}</span>}
                </span>
                <span className="kx-time pl-time">{clock(shownPos)}</span>
                <Seek value={shownPos} duration={duration} can={canSeek} scrubbing={Boolean(scrub?.held)} ticks={ticks}
                    onScrub={(t) => setScrub(t == null ? null : { t, held: true })} onSeek={seekTo} />
                <span className="kx-time pl-left" title="Tempo restante · duração">{duration ? `-${clock(Math.max(0, duration - shownPos))}` : "--:--"}<small>{duration ? clock(duration) : ""}</small></span>
            </div>
            <div className="pl-row pl-row2">
                <span className="pl-btns">
                    <IconBtn name="skip-back" title={list && at > 0 ? "Anterior da lista" : "Voltar ao início"} disabled={off || clockOnly} onClick={() => run("prev")} />
                    <button type="button" className="kx-btn kx-t pl-skip" disabled={off || clockOnly} onClick={() => run("back")} title="Voltar 10 segundos">−10</button>
                    <IconBtn name={pb && !pb.paused ? "pause" : "play"} className="pl-play" title={pb && !pb.paused ? "Pausar · Espaço" : "Tocar · Espaço"} disabled={off} onClick={() => run("toggle")} />
                    <button type="button" className="kx-btn kx-t pl-skip" disabled={off || clockOnly} onClick={() => run("forward")} title="Avançar 10 segundos">+10</button>
                    <IconBtn name="skip-fwd" title="Próximo da lista" disabled={off || !list || at >= list.length - 1} onClick={() => run("next")} />
                    {swap && <IconBtn name={soundOnly ? "eye-off" : "eye"} className={`pl-eye ${soundOnly ? "is-sound" : ""}`} title={swap.title} aria-label="Só o som" aria-pressed={soundOnly} disabled={swap.disabled} onClick={() => run(swap.action)} />}
                    <IconBtn name="stop" title="Parar e tirar do ar" disabled={off || clockOnly} onClick={() => run("stop")} />
                </span>
                {layers.length > 1 && (
                    <Seg small value={layer} onChange={setPicked} label="Controlar" options={layers.map((l) => [l, LAYER_LABEL[l], { title: `Controlar: ${LAYER_LABEL[l]}` }])} />
                )}
                <FollowChip follow={follow} onAction={followOp} disabled={Boolean(cur?.locked)} />
                {media && (
                    <span className={`kx-meta pl-where ${silent ? "kx-warn" : ""}`} title={silent ? "A janela do projetor está fechada: o som não sai. Abra em Saídas." : `Onde o som sai: ${where}`}>
                        <Icon name={silent ? "warn" : "tv"} /><span className="lbl">{silent ? "Projetor fechado" : where}</span>
                    </span>
                )}
                <span className="pl-gap" />
                <Volume volume={pb?.volume} disabled={off || clockOnly} onVolume={(v) => run("volume", { volume: v })} />
                <Meters />
            </div>
        </div>
    );
}
