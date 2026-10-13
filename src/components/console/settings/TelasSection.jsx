import React, { useState } from "react";
import Icon from "../Icon";
import { Btn, Empty, Seg } from "../kx";
import { useBridge, usePoll, Switch, desktopOnly, CfgKey, Reading, FormRow } from "./parts";
import { useLibrary } from "../useConsoleData";
import OutputPrefCard from "./OutputPrefCard";
import { normalizePref, isDefaultPref, outputLook } from "@/lib/outputPrefs";
import { useOutputPrefRows } from "@/hooks/useOutputPref";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { ringBell } from "@/lib/bell";
import { keryx } from "@/api/keryxClient";
import { buildOutputsFile, readOutputsFile, prefWrites, fileName } from "@/lib/outputsFile";
import { useLayoutRows } from "@/hooks/useLayout";
import { outputTab } from "@/lib/console/settings";

// Telas e saídas' tabs after the outputs (settings.js TELAS_TABS, with icons).
const TABS = [["geral", "Som e arquivo", "volume"]];

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


// Telas e saídas (owner's request 2026-10-12: shorter, one tab per output):
// the monitors as a diagram on top; then a vertical tab per output (its
// icon, name and whether it is open) and, beside it, that output's screen,
// "Abrir ao iniciar", open/close and its own settings (OutputPrefCard, with
// its Layout first: "Editar no canvas"); two more tabs hold the layouts and
// the chime with the settings file. The tab is Configurações' (?config=
// telas/<tab>, settings.js) so the search lands on it. The idle look of the
// screens is in Aparência. The placement rules live in electron/outputs.cjs.
export default function TelasSection({ c, tab = null, setTab = () => {}, onOpenScreen }) {
    const displays = useBridge("displays");
    const [state, , setState, readError] = usePoll(() => displays?.list(), 3000);
    const { themes } = useLibrary();
    const prefRows = useOutputPrefRows();
    const layoutRows = useLayoutRows();
    const prefRow = (key) => prefRows.find((r) => r.screen_path === key) || null;
    // Importar ajustes: the file read and checked (outputsFile.js), waiting
    // for the operator to confirm what changes.
    const [pending, setPending] = useState(null);
    // Remover saída asks twice (like excluir um layout).
    const [removeConfirm, setRemoveConfirm] = useState(null);
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
    // Exportar / Importar ajustes das saídas (src/lib/outputsFile.js): every
    // output's screen and "Abrir ao iniciar", and every page's Ajustes.
    const exportPrefs = async () => {
        try {
            const file = buildOutputsFile({ outputs, prefRows, themes, layouts: layoutRows, displays: list, appVersion: keryx.versions?.app || "" });
            const res = await displays.exportFile(JSON.stringify(file, null, 2), fileName());
            if (res?.error) c.say(res.error.message);
            else if (res?.data?.file) c.say(`Ajustes das saídas exportados: ${res.data.file}`);
        } catch (err) { c.say(err?.message || "Não foi possível exportar os ajustes das saídas."); }
    };
    const importPrefs = async () => {
        try {
            const res = await displays.importFile();
            if (res?.error) { c.say(res.error.message); return; }
            if (!res?.data) return; // the picker was closed
            const read = readOutputsFile(res.data.text, { themes, layouts: layoutRows, displays: list });
            if (read.error) { c.say(read.error); return; }
            setPending({ read, name: res.data.name || "arquivo" });
        } catch (err) { c.say(err?.message || "Não foi possível ler o arquivo."); }
    };
    // Through the same calls as the rows below: every window and network
    // screen follows at once. Rows are updated or created, never deleted.
    const applyImport = async () => {
        const { read } = pending;
        setPending(null);
        try {
            for (const { key, assignment } of read.assignments) {
                const res = await displays.set(key, assignment);
                if (res?.error) throw new Error(res.error.message);
            }
            for (const w of prefWrites(read.prefs, prefRows)) {
                if (w.op === "update") await keryx.entities.OutputPref.update(w.id, w.data);
                else await keryx.entities.OutputPref.create(w.data);
            }
            const now = await displays.list();
            if (now?.data) setState(now.data);
            c.say("Ajustes das saídas importados.");
        } catch (err) { c.say(err?.message || "Não foi possível importar todos os ajustes das saídas."); }
    };
    const status = (o) => {
        const p = o.placement || {};
        if (p.missing) return "A tela escolhida está desligada · abre numa janela até ligar";
        if (p.mode === "fullscreen") return number(p.displayId) ? `Tela cheia na Tela ${number(p.displayId)}` : "Tela cheia";
        return "Abre numa janela";
    };
    const removeOutput = (o) => {
        if (removeConfirm !== o.key) { setRemoveConfirm(o.key); c.say(`Clique de novo para remover ${o.label}. Os ajustes ficam guardados.`); return; }
        setRemoveConfirm(null);
        apply(displays.set(o.key, { removed: true }).then((res) => { c.say(`${o.label} removida.`); return res; }));
    };
    // The tabs: one per output, then Layouts and Som e arquivo. A removed
    // output leaves the tabs (and Saídas, and Verificar); its entry and
    // OutputPref row stay, so Adicionar saída brings it back as it was.
    const outs = outputs.map((raw) => {
        const look = outputLook(raw.key, prefRow(raw.key));
        return { ...raw, look, label: look.custom || raw.label };
    });
    const active = outs.filter((o) => !o.removed);
    const removedOuts = outs.filter((o) => o.removed);
    const fixed = TABS.some(([k]) => k === tab) ? tab : null;
    const output = fixed ? null : active.find((o) => outputTab(o.key) === tab) || active[0] || null;
    const selKey = fixed || output?.key || null;

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
                            <span className="kx-meta">{d.bounds?.width || d.width}×{d.bounds?.height || d.height}</span>
                        </div>
                    );
                })}
                <span style={{ flex: 1 }} />
                <Btn onClick={identify} title="Mostra o número de cada tela nela mesma">Identificar telas</Btn>
            </CfgKey>
            <div className="cfg-outs">
                <CfgKey as="nav" k="Saídas" className="cfg-outs-nav" role="tablist" aria-label="Saídas" aria-orientation="vertical">
                    {active.map((o) => {
                        const on = selKey === o.key;
                        return (
                            <button type="button" key={o.key} role="tab" aria-selected={on} className={`kx-t cfg-outtab ${on ? "is-on" : ""} ${o.placement?.missing ? "is-warn" : ""}`} onClick={() => setTab(outputTab(o.key))} title={status(o)}>
                                <Icon name={o.look.icon} />
                                <span className="cfg-outtab-t">{o.label}</span>
                                <span className={`cfg-outtab-dot ${o.open ? "is-open" : ""}`} aria-label={o.open ? "aberta" : "fechada"} />
                            </button>
                        );
                    })}
                    <span className="cfg-outs-sep" />
                    {TABS.map(([k, name, icon]) => (
                        <button type="button" key={k} role="tab" aria-selected={selKey === k} className={`kx-t cfg-outtab ${selKey === k ? "is-on" : ""}`} onClick={() => setTab(k)}>
                            <Icon name={icon} /><span className="cfg-outtab-t">{name}</span>
                        </button>
                    ))}
                    {/* Adicionar saída: the removed ones, back with one click
                        (the entry and the Ajustes were kept). */}
                    {removedOuts.length > 0 && (
                        <CfgKey k="Adicionar saída" className="cfg-outs-add">
                            <span className="cfg-outs-sep" />
                            {removedOuts.map((o) => (
                                <button type="button" key={o.key} className="kx-t cfg-outtab is-add" title={`Adicionar ${o.label} de volta · os ajustes ficaram guardados`} onClick={() => apply(displays.set(o.key, { removed: false }).then((res) => { c.say(`${o.label} adicionada de volta.`); return res; }))}>
                                    <Icon name="plus" /><span className="cfg-outtab-t">{o.label}</span>
                                </button>
                            ))}
                        </CfgKey>
                    )}
                </CfgKey>
                <div className="cfg-outs-detail" role="tabpanel">
                    {output && (
                        <>
                            <div className={`kx-row cfg-out ${output.placement?.missing ? "is-warn" : ""}`}>
                                <span className="kx-glyph"><Icon name={output.look.icon} /></span>
                                <div className="kx-row-main"><div className="kx-row-title">{output.label}</div><div className={`kx-row-meta ${output.placement?.missing ? "kx-warn" : ""}`}>{status(output)}{!isDefaultPref(normalizePref(prefRow(output.key))) ? " · com ajustes" : ""}</div></div>
                                <select className="cfg-select" value={valueOf(output.assignment)} onChange={(e) => choose(output, e.target.value)} aria-label={`Tela de ${output.label}`}>
                                    <option value="auto">Automático</option>
                                    <option value="window">Sempre numa janela</option>
                                    {list.map((d, i) => <option key={d.id} value={`d:${d.id}`}>Tela {i + 1} · {d.bounds?.width || d.width}×{d.bounds?.height || d.height}</option>)}
                                    {typeof output.assignment.target === "object" && !list.some((d) => d.id === output.assignment.target.id) && <option value={`gone:${output.assignment.target.id}`} disabled>{output.assignment.target.width}×{output.assignment.target.height} (desligada)</option>}
                                </select>
                                <span className="cfg-launch"><Switch on={output.assignment.openAtLaunch === true} onChange={(on) => apply(displays.set(output.key, { openAtLaunch: on }))} label={`Abrir ${output.label} ao iniciar`} /><span className="kx-meta">Abrir ao iniciar</span></span>
                                {output.open
                                    ? <><Btn onClick={() => apply(displays.open(output.key))} title="Mostrar esta saída por cima das outras janelas">Trazer para a frente</Btn><Btn onClick={() => apply(displays.close(output.key))}>Fechar</Btn></>
                                    : <Btn onClick={() => apply(displays.open(output.key))}>Abrir</Btn>}
                                {/* Off the list (Saídas, these tabs, Verificar); the entry and
                                    the Ajustes stay, so Adicionar saída restores everything.
                                    The main projection is the one the console mirrors: it stays. */}
                                {output.key !== "/Projection" && (
                                    <CfgKey as="span" k="Remover saída">
                                        <Btn kind={removeConfirm === output.key ? "air" : ""} onClick={() => removeOutput(output)}>{removeConfirm === output.key ? "Remover mesmo" : "Remover saída"}</Btn>
                                    </CfgKey>
                                )}
                            </div>
                            <CfgKey k="Ajustes" className="listhead"><span className="kx-section">Ajustes <span className="kx-count">· valem também para as telas na rede desta página</span></span></CfgKey>
                            <OutputPrefCard key={output.key} output={output} row={prefRow(output.key)} themes={themes} c={c} onOpenScreen={onOpenScreen} />
                        </>
                    )}
                                        {selKey === "geral" && (
                        <>
                            <div className="listhead"><span className="kx-section">Arquivo de ajustes</span>
                                <span style={{ flex: 1 }} />
                                <CfgKey as="span" k="Exportar ajustes das saídas"><Btn small onClick={exportPrefs} title="Salva num arquivo a tela e os ajustes de cada saída, para restaurar depois ou levar para outro computador">Exportar ajustes…</Btn></CfgKey>
                                <CfgKey as="span" k="Importar ajustes das saídas"><Btn small onClick={importPrefs} title="Abre um arquivo exportado e mostra o que muda antes de aplicar">Importar ajustes…</Btn></CfgKey>
                            </div>
                            {pending && (
                                <div className="cfg-import" role="group" aria-label="Importar ajustes das saídas">
                                    <span className="kx-section">Importar {pending.name}</span>
                                    <span className="kx-meta">{pending.read.exportedAt ? `Exportado em ${new Date(pending.read.exportedAt).toLocaleDateString("pt-BR")} · ` : ""}a tela de {pending.read.outputs} {pending.read.outputs === 1 ? "saída" : "saídas"} e os ajustes de {pending.read.pages} {pending.read.pages === 1 ? "saída" : "saídas"}. Substitui o que está configurado agora nessas saídas.</span>
                                    {pending.read.notes.map((n) => <span key={n} className="kx-meta kx-warn">{n}</span>)}
                                    <span className="cfg-import-acts"><Btn kind="brand" onClick={applyImport}>Importar</Btn><Btn onClick={() => setPending(null)}>Cancelar</Btn></span>
                                </div>
                            )}
                            <SomBlock c={c} />
                        </>
                    )}
                </div>
            </div>
            <div className="listhead"><span className="kx-meta">As saídas não aparecem na barra de tarefas; fechar o KERYX fecha todas.</span></div>
        </>
    );
}
