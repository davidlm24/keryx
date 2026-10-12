import React, { useState } from "react";
import Icon from "../Icon";
import { Btn, Empty, Seg } from "../kx";
import { useBridge, usePoll, Switch, desktopOnly, CfgKey, Reading, FormRow } from "./parts";
import { useLibrary } from "../useConsoleData";
import OutputPrefCard from "./OutputPrefCard";
import { PREF_OUTPUTS, normalizePref, isDefaultPref, outputLook } from "@/lib/outputPrefs";
import { useOutputPrefRows } from "@/hooks/useOutputPref";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { ringBell } from "@/lib/bell";

const VOLUMES = [["20", "Baixo"], ["35", "Médio"], ["60", "Alto"], ["100", "Máximo"]];

// Som do aviso: the chime of avisos with "Som de alerta", on or off and its
// volume, for every output and network screen (on the profile).
function SomBlock({ c }) {
    const prefs = usePrefs();
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    const vol = String(prefs.chime_volume);
    return (
        <div className="frm" style={{ borderTop: "1px solid var(--line)", marginTop: "var(--space-1)" }}>
            <FormRow k="Som do aviso">
                <Switch on={prefs.chime_on} onChange={(on) => save({ chime_on: on }, on ? "O sino dos avisos toca." : "Sino dos avisos desligado em todas as telas.")} label="Tocar o sino dos avisos" />
                <Seg small label="Volume do sino" value={VOLUMES.some(([v]) => v === vol) ? vol : "35"} options={VOLUMES} onChange={(v) => save({ chime_volume: Number(v) })} />
                <Btn small disabled={!prefs.chime_on} onClick={() => ringBell({ on: true, volume: prefs.chime_volume })} title="Toca o sino aqui, neste computador">Testar som</Btn>
                <span className="kx-meta">o sino curto dos avisos com Som de alerta, nas saídas e nas telas na rede</span>
            </FormRow>
        </div>
    );
}

// Telas e saídas: the monitors as a diagram, each output's screen, "Abrir
// ao iniciar", open/close, Identificar, each output's own settings (Ajustes,
// OutputPrefCard). The idle look of the screens is in Aparência › Geral.
// The placement rules live in electron/outputs.cjs.
export default function TelasSection({ c }) {
    const displays = useBridge("displays");
    const [state, , setState, readError] = usePoll(() => displays?.list(), 3000);
    const { themes } = useLibrary();
    const [tuning, setTuning] = useState(null);
    const prefRows = useOutputPrefRows();
    const prefRow = (key) => prefRows.find((r) => r.screen_path === key) || null;
    if (!displays) return <Empty icon="monitor" title="Telas e saídas">{desktopOnly}</Empty>;
    if (!state) return <Reading what="as telas" error={readError} />;

    // Every change answers with the new state, or says why it failed.
    const apply = (p) => p.then((res) => { if (res?.error) c.say(res.error.message); else if (res?.data) setState(res.data); })
        .catch((err) => c.say(err?.message || "Não foi possível mudar a saída."));
    const identify = () => Promise.resolve(displays.identify()).then((res) => { if (res?.error) c.say(res.error.message); })
        .catch(() => c.say("Não foi possível mostrar os números nas telas."));
    const list = state.displays || [];
    const outputs = state.outputs || [];
    // A display's number as Windows counts it here (0: not among the ones on).
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
        if (p.mode === "fullscreen") return number(p.displayId) ? `Tela cheia na Tela ${number(p.displayId)}` : "Tela cheia";
        return "Abre numa janela";
    };

    return (
        <>
            <CfgKey k="Identificar telas" className="diagram">
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
                <Btn onClick={identify} title="Mostra o número de cada tela nela mesma">Identificar telas</Btn>
            </CfgKey>
            <CfgKey k="Saídas" className="listhead"><span className="kx-section">Saídas <span className="kx-count">· cada saída mostra um conteúdo numa tela</span></span></CfgKey>
            {outputs.map((raw) => {
                const lk = outputLook(raw.key, prefRow(raw.key));
                const o = { ...raw, label: lk.custom || raw.label };
                return (
                <React.Fragment key={o.key}>
                <div className={`kx-row cfg-out ${o.placement?.missing ? "is-warn" : ""}`}>
                    <span className="kx-glyph"><Icon name={lk.icon} /></span>
                    <div className="kx-row-main"><div className="kx-row-title">{o.label}</div><div className={`kx-row-meta ${o.placement?.missing ? "kx-warn" : ""}`}>{status(o)}{o.open ? " · aberta" : ""}{!isDefaultPref(normalizePref(prefRow(o.key))) ? " · com ajustes" : ""}</div></div>
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
                    <CfgKey as="span" k="Ajustes" className="cfg-tune">
                        <Btn on={tuning === o.key} onClick={() => setTuning(tuning === o.key ? null : o.key)} aria-expanded={tuning === o.key}
                            title={`Nome, ícone${PREF_OUTPUTS.includes(o.key) ? ", conteúdo, escala do texto, margens, logo e tema" : ""} de ${o.label}`}>
                            <Icon name="sliders" />Ajustes
                        </Btn>
                    </CfgKey>
                </div>
                {tuning === o.key && <OutputPrefCard output={o} row={prefRow(o.key)} themes={themes} c={c} />}
                </React.Fragment>
                );
            })}
            <SomBlock c={c} />
            <div className="listhead"><span className="kx-meta">As saídas não aparecem na barra de tarefas: use Trazer para a frente para ver uma de novo. Em tela cheia a saída não tem botão de fechar: use Ctrl+W nela, ou Fechar aqui. Fechar o KERYX fecha todas. Ligar um monitor aparece aqui em poucos segundos.</span></div>
        </>
    );
}
