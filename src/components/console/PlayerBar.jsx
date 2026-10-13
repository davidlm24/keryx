import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { IconBtn, Seg } from "./kx";
import { livePosition } from "@shared/live-state.mjs";
import { playerLayers, playerLayer, playerOp, videoSwap, LAYER_LABEL, clock } from "@/lib/console/player";
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
                onPointerUp={() => { if (drag != null) { clearTimeout(pending.current); onVolume(drag / 100); } setDrag(null); }}
                onKeyUp={() => setDrag(null)}
                title={`Volume · ${value}%`} />
            <span className="pl-num">{value}%</span>
        </span>
    );
}

// The player between the Programa and the Prévia: whatever plays with sound on the screens
// or the KERYX computer (a video, a YouTube link, an audio file or list), with
// Anterior, −10 s, Tocar/Pausar, +10 s, Próximo, Tirar o vídeo (its sound
// carries on; Mostrar o vídeo brings it back), Parar, the position, the
// volume and the output's level meters. Always there, so the monitors never
// move; idle when nothing plays. Acts on the document the console drives
// (the live state; while the screens are locked its controls are refused).
export default function PlayerBar({ c, picked, setPicked, videoScreens, projectorOpen }) {
    const { cur, now } = c;
    const layers = playerLayers(cur);
    const layer = playerLayer(cur, picked);
    const item = layer ? cur[layer] : null;
    const reported = useReportedDuration(layer, item?.url);
    const duration = item?.duration || reported || null;
    const pb = item?.playback;
    const pos = pb ? livePosition(pb, now) : 0;
    const shownPos = duration ? Math.min(pos, duration) : pos;
    const run = (action, extra) => {
        const op = playerOp(cur, layer, action, { pos, duration, ...extra });
        if (op) c.callOp(op[0], op[1]).catch(() => {});
    };
    const list = item?.playlist;
    const at = item?.playlistIndex ?? 0;
    const kindWord = item ? (item.kind === "youtube" ? "YouTube" : item.kind === "audio" ? "Áudio" : layer === "audio" ? "Som do vídeo" : "Vídeo") : "";
    const swap = videoSwap(cur, layer);
    const where = layer === "video" ? (videoScreens || "telas de vídeo") : layer === "media" ? "Projetor" : layer === "audio" ? "Computador do projetor" : "";
    const silent = (layer === "audio" || layer === "media") && !projectorOpen;
    const pct = duration ? Math.min(100, (shownPos / duration) * 100) : 0;
    const off = !item;

    return (
        <div className={`player ${off ? "is-idle" : ""}`} role="group" aria-label="Player de mídia">
            <span className="pl-what" title={item ? `${item.title || kindWord} · ${kindWord}` : undefined}>
                <Icon name={item?.kind === "audio" ? "music" : "film"} />
                <span className="t">{item ? item.title || kindWord : "Nenhum áudio ou vídeo tocando"}</span>
                {item && <span className="kx-meta pl-kind">{kindWord}{list ? ` · ${at + 1}/${list.length}` : ""}</span>}
            </span>
            {layers.length > 1 && (
                <Seg small value={layer} onChange={setPicked} options={layers.map((l) => [l, LAYER_LABEL[l], { title: `Controlar: ${LAYER_LABEL[l]}` }])} />
            )}
            <span className="pl-btns">
                <IconBtn name="skip-back" title={list && at > 0 ? "Anterior da lista" : "Voltar ao início"} disabled={off} onClick={() => run("prev")} />
                <button type="button" className="kx-btn kx-t pl-skip" disabled={off} onClick={() => run("back")} title="Voltar 10 segundos">−10</button>
                <IconBtn name={pb && !pb.paused ? "pause" : "play"} className="pl-play" title={pb && !pb.paused ? "Pausar · Espaço" : "Tocar · Espaço"} disabled={off} onClick={() => run("toggle")} />
                <button type="button" className="kx-btn kx-t pl-skip" disabled={off} onClick={() => run("forward")} title="Avançar 10 segundos">+10</button>
                <IconBtn name="skip-fwd" title="Próximo da lista" disabled={off || !list || at >= list.length - 1} onClick={() => run("next")} />
                {swap && <IconBtn name={swap.action === "audioOnly" ? "eye-off" : "eye"} title={swap.title} disabled={swap.disabled} onClick={() => run(swap.action)} />}
                <IconBtn name="stop" title="Parar e tirar do ar" disabled={off} onClick={() => run("stop")} />
            </span>
            <span className="kx-time pl-time">{clock(shownPos)}</span>
            <span className={`pl-seek is-live ${duration ? "" : "is-unknown"}`} role="slider" aria-label="Posição" aria-valuemin={0} aria-valuemax={Math.round(duration || 0)} aria-valuenow={Math.round(shownPos)}
                onClick={(e) => { if (!duration || off) return; const r = e.currentTarget.getBoundingClientRect(); run("seek", { pos: ((e.clientX - r.left) / r.width) * duration }); }}>
                <i style={{ width: `${duration ? pct : 0}%` }} /><b style={{ left: `${duration ? pct : 0}%` }} />
            </span>
            <span className="kx-time pl-left" title="Tempo restante · duração">{duration ? `-${clock(Math.max(0, duration - shownPos))}` : "--:--"}<small>{duration ? clock(duration) : ""}</small></span>
            <Volume volume={pb?.volume} disabled={off} onVolume={(v) => run("volume", { volume: v })} />
            <Meters />
            {item && (
                <span className={`kx-meta pl-where ${silent ? "kx-warn" : ""}`} title={silent ? "A janela do projetor está fechada: o som não sai. Abra em Saídas." : `Onde o som sai: ${where}`}>
                    <Icon name={silent ? "warn" : "tv"} /><span className="lbl">{silent ? "Projetor fechado" : where}</span>
                </span>
            )}
        </div>
    );
}
