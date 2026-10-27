import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Btn, Field } from "./kx";
import { useDialogFocus } from "./useDialogFocus";
import { rankRecordings, autoPick, lengthChip, linesChip, fmtLength } from "@/lib/console/lrcPick";

// Sincronizar › "Buscar marcas…" (owner 2026-10-22, the mockup "Sincronizar
// · marcas do LRCLIB", S2 = B): the recordings of the song on LRCLIB, each
// measured against the playback (same length, how many slides match). With
// `auto`, a recording of the playback's length whose lyrics match is used at
// once and the list never shows; otherwise the list, the best one chosen.
// What goes wrong has its own face: LRCLIB busy or offline (Tentar de novo),
// nothing with times (search again), the lyrics of another song (Usar mesmo
// assim, Voltar à lista). Windows order: the action, then Cancelar.
export default function SyncMarks({ title = "", artist = "", duration = null, slides = [], auto = true, onUse, onClose }) {
    const bridge = useRef(window.keryxDesktop?.lyrics || null);
    const [q, setQ] = useState(() => (artist ? `${title} – ${artist}` : title));
    const [state, setState] = useState({ loading: true });
    const [pick, setPick] = useState(0);
    const [check, setCheck] = useState(null); // a recording whose lyrics do not match, asked about
    const boxRef = useRef(null);
    useDialogFocus(boxRef, true);

    const search = async (query, { allowAuto = false } = {}) => {
        setState({ loading: true });
        setCheck(null);
        try {
            if (!bridge.current) throw Object.assign(new Error("A busca na internet funciona no KERYX do computador."), { status: 400 });
            const res = await bridge.current.call("recordings", query.trim());
            if (res?.error) throw Object.assign(new Error(res.error.message), { status: res.error.status });
            const ranked = rankRecordings(res.data.results, { slides, duration });
            const best = allowAuto ? autoPick(ranked) : null;
            if (best) { onUse(best); return; }
            setPick(0);
            setState({ ranked, query: query.trim() });
        } catch (err) {
            setState({ error: err.message || "Não foi possível buscar.", status: err.status || 0 });
        }
    };
    useEffect(() => { search(q, { allowAuto: auto }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const ranked = state.ranked || [];
    const usable = ranked.filter((r) => r.usable);
    const chosen = usable[pick] || null;
    const use = () => {
        if (!chosen) return;
        if (chosen.few) setCheck(chosen); else onUse(chosen);
    };
    const searchRow = (
        <div className="sm-q">
            <Field value={q} onChange={setQ} placeholder="Título – artista" label="Título e artista" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(q); } }} />
            <Btn onClick={() => search(q)} disabled={state.loading || q.trim().length < 2}>Buscar</Btn>
        </div>
    );

    let body;
    let foot;
    if (state.loading) {
        body = <div className="sm-wait"><Icon name="refresh" />Buscando no LRCLIB…</div>;
        foot = <Btn onClick={onClose}>Cancelar</Btn>;
    } else if (state.error && state.status !== 400) {
        body = (
            <div className="sm-msg">
                <Icon name="warn" className="sm-warn" />
                <div><b>O site das letras não respondeu</b><span>{state.error}</span>
                    <span className="kx-meta">Sem internet? Grave as marcas tocando e apertando Espaço.</span></div>
            </div>
        );
        foot = <><Btn kind="brand" onClick={() => search(q)}>Tentar de novo</Btn><Btn onClick={onClose}>Cancelar</Btn></>;
    } else if (state.error) {
        body = <>{searchRow}<div className="sm-msg"><Icon name="warn" className="sm-warn" /><div><span>{state.error}</span></div></div></>;
        foot = <Btn onClick={onClose}>Cancelar</Btn>;
    } else if (check) {
        const [lt] = linesChip(check);
        body = (
            <div className="sm-check">
                <div className="sm-card">
                    <div className="sm-ttl"><b>{check.title} — {check.artist}</b><span className="sm-dur">{fmtLength(check.duration)}</span></div>
                    <div className="sm-chips"><span className="sm-chip is-warn">{lt}</span><span className="sm-chip is-warn">Deve ser outra música com o mesmo nome</span></div>
                </div>
                <span>As marcas iriam para os slides errados. Escolha outra gravação, ou busque com o artista certo.</span>
            </div>
        );
        foot = <><Btn onClick={() => onUse(check)}>Usar mesmo assim</Btn><Btn kind="brand" onClick={() => setCheck(null)}>Voltar à lista</Btn></>;
    } else if (!usable.length) {
        const plain = ranked.filter((r) => !r.timed).length;
        body = (
            <>
                <div className="sm-msg"><div><b>Nada com tempo para essa busca</b>
                    <span>{plain ? `Achamos ${plain} ${plain === 1 ? "gravação" : "gravações"} de "${state.query}", mas só com a letra, sem tempo.` : ranked.length ? `As gravações de "${state.query}" não têm a letra desta música.` : `Nenhuma gravação de "${state.query}" no LRCLIB.`}</span></div></div>
                {searchRow}
                <span className="kx-meta">Tente outro artista que gravou a música, ou tire "(Playback)" e "(Ao vivo)" do nome.</span>
            </>
        );
        foot = <Btn onClick={onClose}>Cancelar</Btn>;
    } else {
        body = (
            <>
                {searchRow}
                <div className="sm-info kx-meta">
                    <span>Seu playback: <b>{fmtLength(duration) || "sem duração"}</b></span>
                    <span>Letra: <b>{slides.length} slides</b></span>
                    <span style={{ flex: 1 }} />
                    <span>{ranked.length} {ranked.length === 1 ? "gravação encontrada" : "gravações encontradas"}</span>
                </div>
                <div className="sm-list" role="radiogroup" aria-label="Gravações">
                    {ranked.map((r) => {
                        const i = usable.indexOf(r);
                        const len = lengthChip(r);
                        const lines = r.usable ? linesChip(r) : null;
                        return (
                            <button key={r.id} type="button" role="radio" aria-checked={i === pick && i >= 0} disabled={!r.usable}
                                className={`sm-row ${i === pick && i >= 0 ? "is-prev" : ""}`} onClick={() => setPick(i)} onDoubleClick={use}>
                                <span className="sm-radio" aria-hidden="true" />
                                <span className="sm-main">
                                    <span className="sm-ttl"><b>{r.title} — {r.artist}</b></span>
                                    <span className="kx-meta">{!r.timed ? "Só a letra, sem tempo: não dá para usar" : !r.matched ? "Nenhum slide bate: é outra música" : r.album || " "}</span>
                                    {r.usable && (
                                        <span className="sm-chips">
                                            {len && <span className={`sm-chip is-${len[1]}`}>{len[0]}</span>}
                                            {lines && <span className={`sm-chip is-${lines[1]}`}>{lines[0]}</span>}
                                            {i === 0 && !r.few && <span className="sm-chip">Recomendada</span>}
                                        </span>
                                    )}
                                </span>
                                <span className="sm-dur">{fmtLength(r.duration)}</span>
                            </button>
                        );
                    })}
                </div>
            </>
        );
        foot = <><span className="kx-meta sm-src">Fonte: LRCLIB.net · a letra da música não muda, só os tempos</span><Btn kind="brand" onClick={use} disabled={!chosen}>Usar estas marcas</Btn><Btn onClick={onClose}>Cancelar</Btn></>;
    }

    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={onClose} />
            <div ref={boxRef} className="dialog confirm-dialog import-dialog sync-marks" role="dialog" aria-modal="true" aria-label="Buscar marcas na internet">
                <div className="sm-head">
                    <span className="sm-h">Buscar marcas na internet</span>
                    <span className="kx-meta">As marcas vêm de uma gravação da música. Depois você acerta o 1º slide no seu playback e os outros acompanham.</span>
                </div>
                <div className="sm-body">{body}</div>
                <div className="im-foot">{foot}</div>
            </div>
        </>
    );
}
