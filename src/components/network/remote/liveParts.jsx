import React, { useState } from "react";
import Icon from "@/components/console/Icon";
import { useLiveNow } from "@/hooks/useLiveState";
import { ADJUST_STEPS, BUILTIN_MINUTES, minutesLabel } from "@/lib/console/timerPresets";
import { allowed, canRun, followInfo, slideInfo, slideRows, timerInfo } from "@/lib/network/remoteView";
import { Cmd, Sheet } from "./parts";

// The pieces of Apresentar (Enviar o próximo, the letra automática, a timer
// on air) and the sheets of Mais › Enviar (Slides, Aviso, Timer). The slide
// arrows, Tela preta / Logo / Limpar / Encerrar and the player are the dock's
// (ControlDock.jsx, owner 2026-10-28).

// The Setlist's next item (and the one before), sent at once.
export function SendNext({ state, caps, c }) {
    if (!canRun(caps, "sendNext")) return null;
    const items = state?.items || [];
    const next = items.find((i) => i.id === state?.nextItemId) || null;
    const back = items.find((i) => i.id === state?.backItemId) || null;
    return (
        <div className="rm-pair">
            <Cmd c={c} action="sendNext" className="is-go is-two" disabled={!next || next.st && next.st !== "ok"}>
                <small>Enviar o próximo</small><b>{next ? next.title || "Sem título" : "Nada depois na setlist"}</b>
            </Cmd>
            {state?.backItemId !== undefined && (
                <Cmd c={c} k="back" action="sendItem" args={{ itemId: back?.id || "" }} className="is-two is-narrow" disabled={!back} title={back ? `Voltar a ${back.title}` : "Nada antes"}>
                    <small>Voltar</small><b>{back ? back.title || "Sem título" : "—"}</b>
                </Cmd>
            )}
        </div>
    );
}

// Mais › Enviar: Slides, Aviso and Timer, each opening its sheet.
export function SendLaunchers({ live, state, caps, c }) {
    const [sheet, setSheet] = useState(null);
    const content = live?.content || null;
    const s = slideInfo(content);
    const can = (a) => canRun(caps, a);
    if (!can("goto") && !can("alert") && !can("tool")) return null;
    return (
        <>
            <h2 className="rm-sec">Enviar</h2>
            <div className="rm-trio">
                {can("goto") && <button type="button" className="rm-b" disabled={!s.has || s.count < 2 || !allowed("goto", {}, c.flags)} onClick={() => setSheet("slides")}><Icon name="list" size={22} />Slides</button>}
                {can("alert") && <button type="button" className="rm-b" disabled={!allowed("alert", {}, c.flags) && !live?.alert} onClick={() => setSheet("alert")}><Icon name="bell" size={22} />Aviso</button>}
                {can("tool") && <button type="button" className="rm-b" disabled={!allowed("tool", {}, c.flags)} onClick={() => setSheet("timer")}><Icon name="clock" size={22} />Timer</button>}
            </div>
            {sheet === "slides" && <SlidesSheet content={content} c={c} onClose={() => setSheet(null)} />}
            {sheet === "alert" && <AlertSheet live={live} state={state} c={c} onClose={() => setSheet(null)} />}
            {sheet === "timer" && <TimerSheet state={state} c={c} onClose={() => setSheet(null)} />}
        </>
    );
}

// Letra automática: the song on air follows its video, its playback or the
// live clock; start, pause, resume.
export function FollowCard({ content, caps, c }) {
    const f = followInfo(content);
    if (!f || !caps.has("follow")) return null;
    const word = { start: "Iniciar", pause: "Pausar", resume: "Retomar" }[f.action] || "";
    return (
        <section className="rm-card rm-inline" aria-label="Letra automática">
            <span className="rm-inline-t"><span className="rm-k">Letra automática</span><b>{f.label}</b></span>
            {f.action && <Cmd c={c} action="follow" args={{ do: f.action }} className="is-sm">{word}</Cmd>}
        </section>
    );
}

// A timer on air: its time, −1 / +1 / +5 min.
export function TimerCard({ live, caps, c }) {
    const now = useLiveNow(1000, Boolean(live?.tool));
    const t = timerInfo(live, now);
    if (!t) return null;
    return (
        <section className="rm-card rm-timer" aria-label={t.mode === "timer" ? "Timer no ar" : "Cronômetro no ar"}>
            <span className="rm-timer-n">{t.text}</span>
            {t.adjust && caps.has("timer") && ADJUST_STEPS.map(([ms, word]) => (
                <Cmd key={ms} c={c} k={`t${ms}`} action="timerAdjust" args={{ deltaMs: ms }} className="is-sm" label={word}>{word.replace(" min", "")}</Cmd>
            ))}
        </section>
    );
}

// Ir para o slide: a tap sends it (the content is already on air).
export function SlidesSheet({ content, c, onClose }) {
    const rows = slideRows(content);
    return (
        <Sheet title="Ir para o slide" onClose={onClose}>
            <div className="rm-list">
                {rows.map((r) => (
                    <Cmd key={r.i} c={c} k="goto" action="goto" args={{ index: r.i }} className={`rm-item ${r.air ? "is-sel" : ""}`} quiet then={onClose}>
                        <span className="rm-item-t"><b>{r.i + 1} · {r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                        {r.air && <span className="rm-tag is-air">no ar</span>}
                    </Cmd>
                ))}
            </div>
        </Sheet>
    );
}

// Aviso rápido: the text (or one of the avisos prontos), as it will look,
// then Mostrar na tela; Tirar o aviso while one is on.
export function AlertSheet({ live, state, c, onClose }) {
    const presets = state?.alerts || [];
    const [text, setText] = useState(live?.alert?.message || "");
    const preset = presets.find((p) => p.message === text) || null;
    const args = preset ? { presetId: preset.id } : { message: text.trim() };
    return (
        <Sheet title="Aviso rápido" onClose={onClose}>
            <label className="rm-field">
                <input value={text} onChange={(e) => setText(e.target.value)} maxLength={200} placeholder="O que aparece na tela" aria-label="Texto do aviso" enterKeyHint="send" />
            </label>
            {presets.length > 0 && (
                <div className="rm-chips is-wrap">
                    {presets.map((p) => <button key={p.id} type="button" className="rm-chip" aria-pressed={p.message === text} onClick={() => setText(p.message)}>{p.message}</button>)}
                </div>
            )}
            {text.trim() && <><p className="rm-hint">Assim aparece na tela:</p><div className="rm-alert-prev" aria-hidden="true"><div className="rm-alert-band">{text.trim()}</div></div></>}
            <div className="rm-pair">
                <Cmd c={c} action="alert" args={args} className="is-go" disabled={!text.trim()} then={onClose}>Mostrar na tela</Cmd>
                {live?.alert
                    ? <Cmd c={c} action="alertClear" then={onClose}>Tirar o aviso</Cmd>
                    : <button type="button" className="rm-b" onClick={onClose}>Cancelar</button>}
            </div>
        </Sheet>
    );
}

// Timer: the timers prontos (5…60 min and the church's), the clock and the
// stopwatch. A tap puts it on air.
export function TimerSheet({ state, c, onClose }) {
    const timers = state?.timers?.length ? state.timers : BUILTIN_MINUTES.map((m) => ({ id: `min-${m}`, minutes: m }));
    return (
        <Sheet title="Timer" onClose={onClose}>
            <div className="rm-chips is-wrap">
                {timers.map((t) => (
                    <Cmd key={t.id} c={c} k="tool" action="tool" args={{ mode: "timer", minutes: t.minutes }} className="rm-chip" then={onClose}>{minutesLabel(t.minutes)}</Cmd>
                ))}
            </div>
            <div className="rm-pair">
                <Cmd c={c} k="tool" action="tool" args={{ mode: "clock" }} then={onClose}><Icon name="clock" size={18} />Relógio</Cmd>
                <Cmd c={c} k="tool" action="tool" args={{ mode: "stopwatch" }} then={onClose}>Cronômetro</Cmd>
            </div>
            <button type="button" className="rm-b is-sm" onClick={onClose}>Cancelar</button>
        </Sheet>
    );
}
