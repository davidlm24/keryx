import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, IconBtn, Field } from "./kx";
import { stageFromTool } from "@/lib/console/stage";
import { clockOf } from "@/lib/console/notice";
import { cleanPreset, canKeep, presetOf, orderPresets } from "@/lib/console/alertPresets";
import { timerChoices, canKeepTimer, cleanMinutes, minutesLabel, ADJUST_STEPS } from "@/lib/console/timerPresets";
import { toolTime } from "@shared/live-state.mjs";

// The quick controls that go to the screens without a library row: the
// Aviso rápido, the ready timers and the Ferramentas. They live in the
// panel beside the Prévia (its tabs, 2026-10-13) and, where that panel is
// not on screen or does not show them, in the Biblioteca's Avisos tab.

const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// Aviso rápido: the field, Mostrar and the mensagens prontas (AlertPreset,
// src/lib/console/alertPresets.js): a click puts one in the field to
// complete it, a double click shows it at once; the star keeps what is in
// the field. The one control that bypasses the Prévia.
export function QuickAlert({ c, data }) {
    const [alertText, setAlertText] = useState("");
    const showAlert = () => {
        const text = alertText.trim();
        if (!text) return;
        c.callOp("alert.show", { message: text, type: "message" }).then(() => setAlertText("")).catch(() => {});
    };
    const presets = orderPresets(data.alertPresets);
    const kept = presetOf(alertText, presets);
    const keep = canKeep(alertText, presets);
    const keepAlert = () => {
        if (!keep.ok) { c.say(keep.why); return; }
        keryx.entities.AlertPreset.create({ message: cleanPreset(alertText) }).then(() => c.say("Mensagem guardada.")).catch((err) => c.say(err?.message || "Não foi possível guardar a mensagem."));
    };
    const dropPreset = (p) => keryx.entities.AlertPreset.delete(p.id).catch((err) => c.say(err?.message || "Não foi possível excluir a mensagem."));
    const sendPreset = (p) => c.callOp("alert.show", { message: p.message, type: "message" }).catch(() => {});
    const alert = c.cur?.alert;
    return (
        <>
            <div className="qt-row">
                <Field icon={null} value={alertText} onChange={setAlertText} placeholder="Aviso para as telas" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") showAlert(); }} />
                <Btn onClick={showAlert} title="Mostrar nas telas agora · Enter">Mostrar</Btn>
                <IconBtn name="star" on={Boolean(kept)} disabled={!kept && !alertText.trim()} title={kept ? "Esta mensagem já está guardada" : "Guardar esta mensagem como pronta"} onClick={keepAlert} />
            </div>
            <div className="kx-presets" role="list" aria-label="Mensagens prontas">
                {!presets.length && <span className="kx-meta kx-presets-empty">Escreva um aviso e use a estrela para guardá-lo como mensagem pronta. Ex.: Chamar pessoa, Kids, Carro.</span>}
                {presets.map((p) => (
                    <span key={p.id} role="listitem" className={`kx-preset ${kept?.id === p.id ? "is-on" : ""}`}>
                        <button type="button" className="kx-t kx-preset-t" title={`${p.message}
Clique coloca no campo · dois cliques mostram nas telas`} onClick={() => setAlertText(p.message)} onDoubleClick={() => sendPreset(p)}>{p.message}</button>
                        <button type="button" className="kx-t kx-preset-x" aria-label={`Excluir a mensagem: ${p.message}`} title="Excluir esta mensagem pronta" onClick={() => dropPreset(p)}><Icon name="x" size={12} /></button>
                    </span>
                ))}
            </div>
            {alert && (
                <div className="kx-alert">
                    <span className="kx-alert-t">{alert.message}</span>
                    <span className="kx-meta">{mmss((c.now - alert.since) / 1000)}</span>
                    <Btn onClick={() => c.callOp("alert.clear").catch(() => {})}>Tirar</Btn>
                </div>
            )}
        </>
    );
}

// A timer on air: its time left, and −1/+1/+5 min (tool.adjust; refused
// while the screens are locked).
export function OnAirTimer({ c }) {
    const t = c.cur?.tool?.mode === "timer" ? c.cur.tool : null;
    if (!t) return null;
    return (
        <div className="kx-tool-pick kx-timer-air" role="group" aria-label="Timer no ar">
            <span className="kx-meta">No ar</span>
            <span className="kx-timer-left">{clockOf(toolTime(t, c.now))}</span>
            {ADJUST_STEPS.map(([ms, label]) => <Btn key={ms} small onClick={() => c.callOp("tool.adjust", { deltaMs: ms }).catch((err) => c.say(err?.message || "Não foi possível mudar o tempo."))} title={ms < 0 ? "Tira um minuto do timer no ar" : `Dá ${label.slice(1)} ao timer no ar`}>{label}</Btn>)}
            <Btn small onClick={() => c.callOp("tool.clear").catch(() => {})}>Tirar</Btn>
        </div>
    );
}

// Timers prontos (TimerPreset, src/lib/console/timerPresets.js): the five
// that always come and the church's own. A click prepares the timer, a
// double click sends it; the star keeps the minutes in the field.
export function ReadyTimers({ c, data, onPrepare, onGo, onPrepared }) {
    const [minutes, setMinutes] = useState(5);
    const timers = timerChoices(data.timerPresets);
    const keepTimer = canKeepTimer(minutes, data.timerPresets);
    const keepTimerNow = () => {
        if (!keepTimer.ok) { c.say(keepTimer.why); return; }
        keryx.entities.TimerPreset.create({ minutes: cleanMinutes(minutes) }).then(() => c.say(`${minutesLabel(cleanMinutes(minutes))} guardado.`)).catch((err) => c.say(err?.message || "Não foi possível guardar o tempo."));
    };
    const dropTimer = (t) => keryx.entities.TimerPreset.delete(t.id).catch((err) => c.say(err?.message || "Não foi possível excluir o tempo."));
    const timerStage = (m) => stageFromTool("timer", { minutes: m });
    return (
        <>
            <div className="kx-timer-presets" role="group" aria-label="Timers prontos">
                {timers.map((t) => (
                    <span key={t.minutes} className={`kx-preset kx-timer-chip ${minutes === t.minutes ? "is-on" : ""}`}>
                        <button type="button" className="kx-t kx-preset-t" title={`${minutesLabel(t.minutes)} · clique põe na prévia · dois cliques mostram nas telas`}
                            onClick={() => { setMinutes(t.minutes); onPrepare(timerStage(t.minutes)); }}
                            onDoubleClick={() => { setMinutes(t.minutes); onGo ? onGo(timerStage(t.minutes)) : onPrepare(timerStage(t.minutes)); }}>{minutesLabel(t.minutes)}</button>
                        {t.id && <button type="button" className="kx-t kx-preset-x" aria-label={`Excluir o tempo ${minutesLabel(t.minutes)}`} title="Excluir este tempo guardado" onClick={() => dropTimer(t)}><Icon name="x" size={12} /></button>}
                    </span>
                ))}
            </div>
            <div className="kx-tool-pick">
                <span className="kx-meta">Minutos</span>
                <input type="number" min="1" max="180" value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))} aria-label="Minutos" className="qt-min" />
                <IconBtn name="star" small disabled={!keepTimer.ok} title={keepTimer.ok ? "Guardar este tempo na lista" : keepTimer.why} onClick={keepTimerNow} />
                <Btn onClick={() => { onPrepare(timerStage(minutes)); onPrepared?.(); }}>Pôr na prévia</Btn>
            </div>
        </>
    );
}

// Ferramentas: Relógio and Cronômetro go to the Prévia at once; Timer and
// Texto livre open their own line (the ready timers; the text field).
export function ToolsPicker({ c, data, onPrepare, onGo }) {
    const [tool, setTool] = useState(null);
    const [freeText, setFreeText] = useState("");
    const pickTool = (mode) => {
        if (mode === "clock" || mode === "stopwatch") { onPrepare(stageFromTool(mode)); setTool(null); return; }
        setTool(tool === mode ? null : mode);
    };
    const sendText = () => { if (freeText.trim()) { onPrepare(stageFromTool("freetext", { text: freeText.trim() })); setTool(null); } };
    return (
        <>
            <div className="kx-tools">
                {[["clock", "Relógio"], ["stopwatch", "Cronômetro"], ["timer", "Timer"], ["freetext", "Texto livre"]].map(([mode, label]) => (
                    <button type="button" key={mode} className={`kx-tool kx-t ${tool === mode || c.cur?.tool?.mode === mode ? "is-on" : ""}`} onClick={() => pickTool(mode)}>
                        <Icon name={mode === "freetext" ? "text" : "clock"} />{label}
                    </button>
                ))}
            </div>
            <OnAirTimer c={c} />
            {tool === "timer" && <ReadyTimers c={c} data={data} onPrepare={onPrepare} onGo={onGo} onPrepared={() => setTool(null)} />}
            {tool === "freetext" && (
                <div className="kx-tool-pick">
                    <Field icon={null} value={freeText} onChange={setFreeText} placeholder="Texto livre" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") sendText(); }} />
                    <Btn onClick={sendText}>Pôr na prévia</Btn>
                </div>
            )}
        </>
    );
}
