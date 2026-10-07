import React from "react";
import { IconBtn } from "./kx";
import { plannedTimes } from "./Rundown";

const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// Linha do tempo: one line (Agora, Próximo, how late) that opens into the
// planned blocks (dashed) over the real ones (from the console's log of when
// each item went on air). A click on a block prepares the item; going to it
// is explicit ("Ir" in the Roteiro, or Enter).
export default function Timeline({ service, items, airItemId, prevItemId, log, now, open, onToggle, onPrepare }) {
    const times = plannedTimes(service, items);
    const airIdx = items.findIndex((i) => i.id === airItemId);
    const airItem = airIdx >= 0 ? items[airIdx] : null;
    const nextItem = airIdx >= 0 ? items[airIdx + 1] : items[0];
    const startedAt = airItem && log[airItem.id]?.start;
    const elapsed = startedAt ? (now - startedAt) / 1000 : 0;
    const todayAt = (hhmm) => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime() + minutesOf(hhmm) * 60000; };
    const late = airItem && startedAt ? Math.round((startedAt - todayAt(times[airIdx])) / 60000) : 0;
    const lateText = !airItem ? "" : late > 0 ? `+${late} min atrasado` : late < 0 ? `−${-late} min adiantado` : "no horário";

    const start = service ? todayAt(times[0] || "19:00") - 5 * 60000 : now;
    const total = items.reduce((a, b) => a + (b.duration || 0), 0) * 1000;
    const end = Math.max(start + total + 10 * 60000, now + 5 * 60000);
    const pct = (t) => `${Math.max(0, Math.min(100, ((t - start) / (end - start)) * 100))}%`;
    const width = (a, b) => `${Math.max(0.6, ((b - a) / (end - start)) * 100)}%`;

    return (
        <>
            <div className="kx-tl">
                <span className="kx-tl-now"><span className="kx-tl-k">Agora</span><i className="kx-dot" /><span className="kx-tl-v">{airItem ? airItem.title : "—"}</span>{airItem && startedAt && <span className="kx-meta">{mmss(elapsed)}{airItem.duration ? ` de ${mmss(airItem.duration)}` : ""}</span>}</span>
                <span className="kx-tl-next" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}><span className="kx-tl-k">Próximo</span><i className="kx-dot" /><span className="kx-tl-v">{nextItem ? nextItem.title : "—"}</span>{nextItem?.duration ? <span className="kx-meta">{mmss(nextItem.duration)}</span> : null}</span>
                <span style={{ flex: 1 }} />
                <span className={late > 0 ? "kx-warn" : "kx-meta"}>{lateText}</span>
                <IconBtn name={open ? "chevron-down" : "collapse"} title={open ? "Recolher a linha do tempo" : "Expandir a linha do tempo"} onClick={onToggle} />
            </div>
            {open && service && (
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
