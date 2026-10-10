import React, { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, Seg, Empty } from "../kx";
import { useBridge, usePoll, Switch, desktopOnly } from "./parts";
import WallpaperPicker from "../WallpaperPicker";
import { useLibrary } from "../useConsoleData";
import OutputPrefCard from "./OutputPrefCard";
import { PREF_OUTPUTS, normalizePref, isDefaultPref } from "@/lib/outputPrefs";

const OUTPUT_ICON = { "/Projection": "projector", "/StageView": "monitor", "/VideoProjection": "tv", "/LyricProjection": "tv", "/PastorView": "tablet", "/BibleMaterialProjection": "monitor", "/CommunicationProjection": "tv", "/StreamView": "external" };

// Telas e saídas: the monitors as a diagram, each output's screen, "Abrir
// ao iniciar", open/close, Identificar, each output's own settings (Ajustes,
// OutputPrefCard) and the idle look of the screens. The placement rules live
// in electron/outputs.cjs.
export default function TelasSection({ c }) {
    const displays = useBridge("displays");
    const [state, , setState] = usePoll(() => displays?.list(), 3000);
    const { media, themes } = useLibrary();
    const [picking, setPicking] = useState(false);
    const [tuning, setTuning] = useState(null);
    const client = useQueryClient();
    useEffect(() => keryx.entities.OutputPref.subscribe(() => client.invalidateQueries({ queryKey: ["console", "OutputPref"] })), [client]);
    const prefRows = useQuery({ queryKey: ["console", "OutputPref"], queryFn: () => keryx.entities.OutputPref.list() }).data || [];
    const prefRow = (key) => prefRows.find((r) => r.screen_path === key) || null;
    if (!displays) return <Empty icon="monitor" title="Telas e saídas">{desktopOnly}</Empty>;
    if (!state) return <Empty title="Lendo as telas…" />;

    const apply = (p) => p.then((res) => { if (res?.error) c.say(res.error.message); else if (res?.data) setState(res.data); }).catch(() => {});
    const list = state.displays || [];
    const outputs = state.outputs || [];
    const number = (id) => list.findIndex((d) => d.id === id) + 1;
    const widest = Math.max(1, ...list.map((d) => d.bounds?.width || d.width || 1));
    const onDisplay = (d) => outputs.filter((o) => o.open && o.placement?.mode === "fullscreen" && o.placement.displayId === d.id).map((o) => o.label);
    const valueOf = (a) => {
        const t = a.target;
        if (t === "auto" || t === "window") return t;
        return list.some((d) => d.id === t.id) ? `d:${t.id}` : `gone:${t.id}`;
    };
    const choose = (o, value) => {
        let target = value;
        if (value.startsWith("d:")) {
            const d = list.find((x) => `d:${x.id}` === value);
            target = { id: d.id, label: d.label, width: d.bounds?.width || d.width, height: d.bounds?.height || d.height };
        }
        apply(displays.set(o.key, { target }));
    };
    const status = (o) => {
        const p = o.placement || {};
        if (p.missing) return "A tela escolhida não está ligada · abre numa janela até ligar";
        if (p.mode === "fullscreen") return `Tela cheia na Tela ${number(p.displayId)}`;
        return "Abre numa janela";
    };
    const idle = c.live?.idle || "logo";
    const idleUrl = c.live?.idleUrl || null;
    const setIdle = (mode, url) => c.liveOp("idle.set", url ? { mode, url } : { mode }).catch((err) => c.say(err?.message || "Não foi possível mudar a tela ociosa."));

    return (
        <>
            <div className="diagram">
                {list.map((d, i) => {
                    const w = Math.round(80 + 160 * ((d.bounds?.width || 1920) / widest));
                    const shows = onDisplay(d);
                    return (
                        <div key={d.id} className={`dmon ${shows.length ? "is-live" : ""}`}>
                            <div className="box" style={{ width: w, height: Math.round(w * 9 / 16) }}>
                                <span>Tela {i + 1}{d.primary ? " · Operador" : ""}</span>
                                {shows.length > 0 && <span className="kx-meta">{shows.join(", ")}</span>}
                            </div>
                            <span className="kx-meta">{d.bounds?.width || d.width}×{d.bounds?.height || d.height}{d.primary ? " · principal" : ""}</span>
                        </div>
                    );
                })}
                <span style={{ flex: 1 }} />
                <Btn onClick={() => displays.identify()} title="Mostra o número de cada tela nela mesma">Identificar telas</Btn>
            </div>
            <div className="listhead"><span className="kx-section">Saídas <span className="kx-count">· cada saída mostra um conteúdo numa tela</span></span></div>
            {outputs.map((o) => (
                <React.Fragment key={o.key}>
                <div className={`kx-row cfg-out ${o.placement?.missing ? "is-warn" : ""}`}>
                    <span className="kx-glyph"><Icon name={OUTPUT_ICON[o.key] || "monitor"} /></span>
                    <div className="kx-row-main"><div className="kx-row-title">{o.label}</div><div className={`kx-row-meta ${o.placement?.missing ? "kx-warn" : ""}`}>{status(o)}{o.open ? " · aberta" : ""}{PREF_OUTPUTS.includes(o.key) && !isDefaultPref(normalizePref(prefRow(o.key))) ? " · com ajustes" : ""}</div></div>
                    <select className="cfg-select" value={valueOf(o.assignment)} onChange={(e) => choose(o, e.target.value)} aria-label={`Tela de ${o.label}`}>
                        <option value="auto">Automático</option>
                        <option value="window">Sempre numa janela</option>
                        {list.map((d, i) => <option key={d.id} value={`d:${d.id}`}>Tela {i + 1} · {d.bounds?.width || d.width}×{d.bounds?.height || d.height}</option>)}
                        {typeof o.assignment.target === "object" && !list.some((d) => d.id === o.assignment.target.id) && <option value={`gone:${o.assignment.target.id}`} disabled>{o.assignment.target.width}×{o.assignment.target.height} (desligada)</option>}
                    </select>
                    <span className="cfg-launch"><Switch on={o.assignment.openAtLaunch === true} onChange={(on) => apply(displays.set(o.key, { openAtLaunch: on }))} label={`Abrir ${o.label} ao iniciar`} /><span className="kx-meta">Abrir ao iniciar</span></span>
                    {o.open
                        ? <><Btn onClick={() => apply(displays.open(o.key))} title="Mostrar esta saída por cima das outras janelas">Trazer para a frente</Btn><Btn onClick={() => apply(displays.close(o.key))}>Fechar</Btn></>
                        : <Btn onClick={() => apply(displays.open(o.key))}>Abrir</Btn>}
                    <span className="cfg-tune">{PREF_OUTPUTS.includes(o.key) && (
                        <Btn on={tuning === o.key} onClick={() => setTuning(tuning === o.key ? null : o.key)} aria-expanded={tuning === o.key}
                            title={`Conteúdo, escala do texto, margens, logo e tema de ${o.label}`}>
                            <Icon name="sliders" />Ajustes
                        </Btn>
                    )}</span>
                </div>
                {tuning === o.key && <OutputPrefCard output={o} row={prefRow(o.key)} themes={themes} say={c.say} />}
                </React.Fragment>
            ))}
            <div className="frm" style={{ borderTop: "1px solid var(--line)", marginTop: "var(--space-1)", paddingTop: "var(--space-2)" }}>
                <span className="k">Tela ociosa</span>
                <div className="frm-v">
                    <Seg small value={idle} onChange={(m) => { if (m === "background" && !idleUrl) setPicking(true); else { setPicking(false); setIdle(m); } }} options={[["logo", "Logo da igreja"], ["black", "Preto"], ["background", "Fundo"]]} />
                    {idle === "background" && idleUrl && <><img className="cfg-wall" src={idleUrl} alt="" /><Btn small onClick={() => setPicking(!picking)}>Trocar…</Btn></>}
                    <span className="kx-meta">o que as telas mostram quando nada está no ar · o culto pode ter o seu fundo (Planejar o culto)</span>
                </div>
                {picking && (
                    <div className="pl-wallpick">
                        <WallpaperPicker value={idleUrl} media={media} onPick={(url) => { setPicking(false); setIdle("background", url); }} />
                    </div>
                )}
            </div>
            <div className="listhead"><span className="kx-meta">As saídas não aparecem na barra de tarefas: use Trazer para a frente para ver uma de novo. Em tela cheia a saída não tem botão de fechar: use Ctrl+W nela, ou Fechar aqui. Fechar o KERYX fecha todas. Ligar um monitor aparece aqui em poucos segundos.</span></div>
        </>
    );
}
