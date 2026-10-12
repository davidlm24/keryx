import React from "react";
import Icon from "./Icon";
import { IconBtn } from "./kx";
import { plannedTimes } from "./Rundown";
import { serviceTiming, lateWords, clock } from "@/lib/console/timeline";

const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// Linha do tempo: one line about the service as a whole (how many items are
// done, when it will end, how late it runs) that opens into the planned
// blocks (dashed) over the real ones (from the console's log of when each
// item went on air). What is on air and what is next are the live column's
// job, not repeated here. A click on a block prepares the item; going to it
// is explicit ("Ir" in the Setlist, or Enter). Opened with no service, or a
// service with no items, it says so instead of opening onto nothing.
export default function Timeline({ service, items, airItemId, prevItemId, log, now, open, onToggle, onPrepare, forecast = false }) {
    const times = plannedTimes(service, items);
    const airIdx = items.findIndex((i) => i.id === airItemId);
    const airItem = airIdx >= 0 ? items[airIdx] : null;
    const startedAt = airItem && log[airItem.id]?.start;
    const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
    const todayAt = (hhmm) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() + minutesOf(hhmm) * 60000; };
    const timing = serviceTiming({ items, times, airIdx, startedAt, now });
    const { late } = timing;
    const lateText = lateWords(late, Boolean(airItem && startedAt));

    const start = service ? todayAt(times[0] || "19:00") - 5 * 60000 : now;
    const total = items.reduce((a, b) => a + (b.duration || 0), 0) * 1000;
    const end = Math.max(start + total + 10 * 60000, now + 5 * 60000);
    const pct = (t) => `${Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100))}%`;
    const width = (a, b) => `${Math.max(0.6, ((b - a) / (end - start)) * 100)}%`;

    return (
        <>
            <div className="kx-tl">
                <span className="kx-tl-k">Culto</span>
                {!service && <span className="kx-meta">nenhum culto escolhido</span>}
                {service && !timing.count && <span className="kx-meta">sem itens</span>}
                {timing.count > 0 && <span className="kx-tl-v">{timing.done} de {timing.count} {timing.count === 1 ? "item" : "itens"}</span>}
                {forecast && timing.forecastEnd != null && (
                    <span className="kx-meta" title={late ? `Previsto ${clock(timing.plannedEnd)}; no ritmo de agora, ${clock(timing.forecastEnd)}` : "Pelo planejado"}>
                        termina {late ? `~${clock(timing.forecastEnd)}` : clock(timing.forecastEnd)}{late ? ` · previsto ${clock(timing.plannedEnd)}` : ""}
                    </span>
                )}
                <span style={{ flex: 1 }} />
                {forecast && <span className={late > 0 ? "kx-warn" : "kx-meta"}>{lateText}</span>}
                <IconBtn name={open ? "chevron-down" : "collapse"} title={open ? "Recolher a linha do tempo" : "Expandir a linha do tempo"} onClick={onToggle} />
            </div>
            {open && !service && (
                <div className="tl-empty"><Icon name="clock" />Nenhum culto escolhido. Escolha um no menu KERYX, ou crie em Cultos.</div>
            )}
            {open && service && !items.length && (
                <div className="tl-empty"><Icon name="clock" />{service.title || "Este culto"} ainda não tem itens. Adicione pela Setlist (+).</div>
            )}
            {open && service && items.length > 0 && (
                <div className="tl-track">
                    {items.map((it, i) => {
                        const ps = todayAt(times[i]);
                        const pe = ps + (it.duration || 0) * 1000;
                        const done = airIdx >= 0 && i < airIdx;
                        const isAir = it.id === airItemId;
                        const real = log[it.id];
                        const rs = real?.start ?? (isAir ? now : null);
                        const re = real?.end ?? (isAir || real?.start ? now : null);
                        return (
                            <React.Fragment key={it.id}>
                                <button type="button" className={`kx-tl-blk kx-t is-plan ${done ? "is-done" : ""}`} style={{ left: pct(ps), width: width(ps, pe) }} onClick={() => onPrepare(it, i)} title={`Planejado · ${times[i]} · ${mmss(it.duration)}`}>{it.title}</button>
                                {rs && (
                                    <button type="button" className={`kx-tl-blk kx-t ${done ? "is-done" : ""} ${isAir ? "is-air" : ""} ${it.id === prevItemId ? "is-prev" : ""} ${real?.end && real.end - real.start > (it.duration || 0) * 1000 + 30000 ? "is-late" : ""}`} style={{ left: pct(rs), width: width(rs, re) }} onClick={() => onPrepare(it, i)} title={`${done ? "Real" : isAir ? "No ar desde" : "Previsto"} · ${new Date(rs).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}>
                                        {it.title}<span className="kx-meta">{done ? mmss((real.end - real.start) / 1000) : isAir ? `${mmss(elapsed)} de ${mmss(it.duration)}` : ""}</span>
                                    </button>
                                )}
                            </React.Fragment>
                        );
                    })}
                    <div className="kx-tl-now-line" style={{ left: pct(now) }} />
                    {Array.from({ length: 8 }, (_, k) => start + (k * (end - start)) / 7).map((t) => (
                        <span key={t} className="kx-tl-tick" style={{ left: pct(t) }}>{new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                    ))}
                </div>
            )}
        </>
    );
}
