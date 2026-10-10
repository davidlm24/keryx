import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, Field, Seg, BackBtn } from "./kx";
import { PERIODS, periodStart, topSongs, playsByCategory, servicesByMonth, ccliReport, ccliText, ccliCsv } from "@/lib/console/reports";

const EMPTY = [];
const when = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return `${d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" })} ${d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
};

// One horizontal bar list: label, a bar to scale, the number.
function Bars({ rows, empty }) {
    const max = Math.max(1, ...rows.map((r) => r.count));
    if (!rows.length) return <div className="rp-empty kx-meta">{empty}</div>;
    return (
        <div className="rp-bars">
            {rows.map((r) => (
                <div key={r.key || r.label} className="rp-bar" title={`${r.label}: ${r.count}`}>
                    <span className="rp-bar-l">{r.label}{r.sub ? <small>{r.sub}</small> : null}</span>
                    <span className="rp-bar-t"><i style={{ width: `${(r.count / max) * 100}%` }} /></span>
                    <span className="rp-bar-n">{r.count}</span>
                </div>
            ))}
        </div>
    );
}

// Relatórios (Estatísticas and Histórico of the old pages), a view inside
// the console: what was sent live (SongHistory, written by the console's
// send), by period — the songs most projected, by category, cultos per
// month, the recent plays, and the CCLI report to copy or save.
export default function ReportsView({ c, onClose }) {
    const [period, setPeriod] = useState("90");
    const [q, setQ] = useState("");
    const songs = useQuery({ queryKey: ["console", "reports", "songs"], queryFn: () => keryx.entities.Song.list("title") }).data ?? EMPTY;
    const history = useQuery({ queryKey: ["console", "reports", "history"], queryFn: () => keryx.entities.SongHistory.list("-played_at", 5000) }).data ?? EMPTY;
    const services = useQuery({ queryKey: ["console", "reports", "services"], queryFn: () => keryx.entities.Service.list("-date", 500) }).data ?? EMPTY;
    const since = useMemo(() => periodStart(period), [period]);
    const top = useMemo(() => topSongs(history, since), [history, since]);
    const cats = useMemo(() => playsByCategory(history, songs, since), [history, songs, since]);
    const months = useMemo(() => servicesByMonth(services), [services]);
    const ccli = useMemo(() => ccliReport(songs, history, since), [songs, history, since]);
    const plays = useMemo(() => history.filter((h) => !since || String(h.played_at || "") >= since), [history, since]);
    const ql = q.trim().toLowerCase();
    const recent = (ql ? plays.filter((h) => [h.song_title, h.song_artist, h.service_title].some((x) => String(x || "").toLowerCase().includes(ql))) : plays).slice(0, 200);
    const periodLabel = PERIODS.find(([k]) => k === period)?.[1] || "";

    const copy = async () => {
        try { await navigator.clipboard.writeText(ccliText(ccli)); c.say(`Relatório CCLI copiado · ${ccli.length} ${ccli.length === 1 ? "música" : "músicas"} · cole numa planilha.`); } catch { c.say("Não foi possível copiar."); }
    };
    const save = () => {
        const blob = new Blob(["﻿" + ccliCsv(ccli)], { type: "text/csv;charset=utf-8" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `keryx_ccli_${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        c.say("Relatório CCLI salvo em CSV.");
    };

    // Esc goes back to the console (never ends the projection from here).
    const closeRef = useRef(onClose);
    closeRef.current = onClose;
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== "Escape" || document.querySelector(".console .scrim")) return;
            if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
            e.preventDefault(); e.stopPropagation();
            closeRef.current();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    return (
        <div className="col center rp">
            <Panel lead={<BackBtn onClick={onClose} />} title={<>Relatórios <span className="kx-count">· {periodLabel} · {plays.length} {plays.length === 1 ? "projeção" : "projeções"} de músicas</span></>} actions={<>
                <Seg small value={period} onChange={setPeriod} options={PERIODS} />
                            </>} bodyStyle={{ overflow: "auto" }}>
                <div className="rp-grid">
                    <section className="rp-card rp-wide">
                        <div className="listhead"><span className="kx-section">Músicas mais projetadas <span className="kx-count">· {top.length}</span></span></div>
                        <Bars rows={top.map((t) => ({ key: t.key, label: t.title, sub: [t.artist, t.last && `última ${when(t.last).slice(0, 8)}`].filter(Boolean).join(" · "), count: t.count }))} empty="Nenhuma música enviada ao ar neste período." />
                    </section>
                    <section className="rp-card">
                        <div className="listhead"><span className="kx-section">Por categoria</span></div>
                        <Bars rows={cats.map((x) => ({ label: x.label, count: x.count }))} empty="Sem projeções neste período." />
                    </section>
                    <section className="rp-card">
                        <div className="listhead"><span className="kx-section">Cultos por mês <span className="kx-count">· últimos 6</span></span></div>
                        <div className="rp-cols">
                            {months.map((m) => { const max = Math.max(1, ...months.map((x) => x.count)); return (
                                <div key={m.key} className="rp-col" title={`${m.label}: ${m.count}`}><span className="rp-col-n">{m.count}</span><span className="rp-col-t"><i style={{ height: `${(m.count / max) * 100}%` }} /></span><span className="rp-col-l">{m.label}</span></div>
                            ); })}
                        </div>
                    </section>
                    <section className="rp-card rp-wide">
                        <div className="listhead"><span className="kx-section">Relatório CCLI <span className="kx-count">· {ccli.length} {ccli.length === 1 ? "música" : "músicas"} com número CCLI · {periodLabel}</span></span><span style={{ flex: 1 }} />
                            <Btn small disabled={!ccli.length} onClick={copy}><Icon name="save" />Copiar</Btn>
                            <Btn small disabled={!ccli.length} onClick={save}>Salvar CSV</Btn>
                        </div>
                        {!ccli.length && <div className="rp-empty kx-meta">Nenhuma música com número CCLI foi projetada neste período. O número fica no editor de música.</div>}
                        {ccli.length > 0 && (
                            <table className="rp-table">
                                <thead><tr><th>Música</th><th>Artista</th><th>CCLI</th><th className="n">Projeções</th></tr></thead>
                                <tbody>{ccli.map((r) => <tr key={`${r.ccli}${r.title}`}><td>{r.title}</td><td>{r.artist}</td><td className="mono">{r.ccli}</td><td className="n">{r.plays}</td></tr>)}</tbody>
                            </table>
                        )}
                    </section>
                    <section className="rp-card rp-wide">
                        <div className="listhead"><span className="kx-section">Histórico <span className="kx-count">· {recent.length}{plays.length > recent.length && !ql ? ` de ${plays.length}` : ""}</span></span><span style={{ flex: 1 }} />
                            <Field value={q} onChange={setQ} placeholder="Música, artista ou culto" style={{ width: 260 }} />
                        </div>
                        {!recent.length && <div className="rp-empty kx-meta">{ql ? `Nada com "${q}".` : "Nada enviado ao ar neste período."}</div>}
                        {recent.length > 0 && (
                            <table className="rp-table">
                                <thead><tr><th>Quando</th><th>Música</th><th>Artista</th><th>Culto</th></tr></thead>
                                <tbody>{recent.map((h) => <tr key={h.id}><td className="mono">{when(h.played_at)}</td><td>{h.song_title}</td><td>{h.song_artist}</td><td>{h.service_title || ""}</td></tr>)}</tbody>
                            </table>
                        )}
                    </section>
                </div>
            </Panel>
        </div>
    );
}
