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
import { keryx } from "@/api/keryxClient";
import { buildOutputsFile, readOutputsFile, prefWrites, fileName } from "@/lib/outputsFile";
import { useLayoutRows } from "@/hooks/useLayout";
import { normalizeLayout, LAYOUT_CATEGORIES, duplicateLayout, layoutFields } from "@/lib/layouts";

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

const CATEGORY = Object.fromEntries(LAYOUT_CATEGORIES);
const CAT_ICON = { palco: "monitor", pastor: "tablet", outro: "layers" };

// Layouts das telas: the operator's layouts (src/lib/layouts.js), each
// with the outputs using it; Novo, Editar (the LayoutEditor view, through
// `onOpenLayout`), Duplicar and Excluir (an output using a deleted layout
// goes back to its page's own screen).
function LayoutsBlock({ c, rows, prefRows, onOpenLayout }) {
    const [confirm, setConfirm] = useState(null);
    const layouts = rows.map(normalizeLayout).filter((l) => l.id).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name, "pt-BR"));
    const usedBy = (id) => prefRows.filter((r) => r.layout_id === id).map((r) => outputLook(r.screen_path, r).name);
    const duplicate = (l) => keryx.entities.ScreenLayout.create(layoutFields(duplicateLayout(l))).then((row) => { c.say(`Layout "${row.name}" criado.`); onOpenLayout?.(row.id); }).catch((err) => c.say(err?.message || "Não foi possível duplicar o layout."));
    const remove = (l) => {
        if (confirm !== l.id) { setConfirm(l.id); c.say(`Clique de novo para excluir "${l.name}".`); return; }
        setConfirm(null);
        keryx.entities.ScreenLayout.delete(l.id).then(() => c.say(`Layout "${l.name}" excluído.${usedBy(l.id).length ? " As saídas que o usavam voltaram ao padrão." : ""}`)).catch((err) => c.say(err?.message || "Não foi possível excluir o layout."));
    };
    return (
        <>
            <CfgKey k="Layouts das telas" className="listhead"><span className="kx-section">Layouts das telas <span className="kx-count">· o desenho do Palco e da Tela do pastor</span></span>
                <span style={{ flex: 1 }} />
                <Btn small onClick={() => onOpenLayout?.("new")} title="Desenhar uma tela: onde ficam o relógio, o timer, a letra, a próxima…"><Icon name="plus" />Novo layout</Btn>
            </CfgKey>
            {!layouts.length && <div className="listhead"><span className="kx-meta">Nenhum layout seu ainda. Cada saída tem a tela padrão e os modelos Palco e Pastor; Novo layout desenha uma tela do zero, e Ajustes › Layout, numa saída, duplica um modelo para editar.</span></div>}
            {layouts.map((l) => {
                const uses = usedBy(l.id);
                return (
                    <div key={l.id} className="kx-row cfg-out">
                        <span className="kx-glyph"><Icon name={CAT_ICON[l.category] || "layers"} /></span>
                        <div className="kx-row-main"><div className="kx-row-title">{l.name}</div><div className="kx-row-meta">{CATEGORY[l.category]} · {l.elements.length} {l.elements.length === 1 ? "elemento" : "elementos"}{uses.length ? ` · em ${uses.join(", ")}` : ""}</div></div>
                        <Btn small onClick={() => onOpenLayout?.(l.id)}><Icon name="edit" />Editar</Btn>
                        <Btn small onClick={() => duplicate(l)}><Icon name="copy" />Duplicar</Btn>
                        <Btn small kind={confirm === l.id ? "air" : ""} onClick={() => remove(l)}>{confirm === l.id ? "Excluir mesmo" : "Excluir"}</Btn>
                    </div>
                );
            })}
        </>
    );
}

// Telas e saídas: the monitors as a diagram, each output's screen, "Abrir
// ao iniciar", open/close, Identificar, each output's own settings (Ajustes,
// OutputPrefCard), the layouts. The idle look of the screens is in
// Aparência › Geral. The placement rules live in electron/outputs.cjs.
export default function TelasSection({ c, onOpenLayout }) {
    const displays = useBridge("displays");
    const [state, , setState, readError] = usePoll(() => displays?.list(), 3000);
    const { themes } = useLibrary();
    const [tuning, setTuning] = useState(null);
    const prefRows = useOutputPrefRows();
    const layoutRows = useLayoutRows();
    const prefRow = (key) => prefRows.find((r) => r.screen_path === key) || null;
    // Importar ajustes: the file read and checked (outputsFile.js), waiting
    // for the operator to confirm what changes.
    const [pending, setPending] = useState(null);
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
            <CfgKey k="Saídas" className="listhead"><span className="kx-section">Saídas <span className="kx-count">· cada saída mostra um conteúdo numa tela</span></span>
                <span style={{ flex: 1 }} />
                <CfgKey as="span" k="Exportar ajustes das saídas"><Btn small onClick={exportPrefs} title="Salva num arquivo a tela e os ajustes de cada saída, para restaurar depois ou levar para outro computador">Exportar ajustes…</Btn></CfgKey>
                <CfgKey as="span" k="Importar ajustes das saídas"><Btn small onClick={importPrefs} title="Abre um arquivo exportado e mostra o que muda antes de aplicar">Importar ajustes…</Btn></CfgKey>
            </CfgKey>
            {pending && (
                <div className="cfg-import" role="group" aria-label="Importar ajustes das saídas">
                    <span className="kx-section">Importar {pending.name}</span>
                    <span className="kx-meta">{pending.read.exportedAt ? `Exportado em ${new Date(pending.read.exportedAt).toLocaleDateString("pt-BR")} · ` : ""}a tela de {pending.read.outputs} {pending.read.outputs === 1 ? "saída" : "saídas"} e os ajustes de {pending.read.pages} {pending.read.pages === 1 ? "saída" : "saídas"}. Substitui o que está configurado agora nessas saídas.</span>
                    {pending.read.notes.map((n) => <span key={n} className="kx-meta kx-warn">{n}</span>)}
                    <span className="cfg-import-acts"><Btn kind="brand" onClick={applyImport}>Importar</Btn><Btn onClick={() => setPending(null)}>Cancelar</Btn></span>
                </div>
            )}
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
                            title={`Nome, ícone${PREF_OUTPUTS.includes(o.key) ? ", conteúdo, escala do texto, margens, logo e tema" : o.key === "/StageView" || o.key === "/PastorView" ? ", layout e escala do texto" : ""} de ${o.label}`}>
                            <Icon name="sliders" />Ajustes
                        </Btn>
                    </CfgKey>
                </div>
                {tuning === o.key && <OutputPrefCard output={o} row={prefRow(o.key)} themes={themes} c={c} onOpenLayout={onOpenLayout} />}
                </React.Fragment>
                );
            })}
            <LayoutsBlock c={c} rows={layoutRows} prefRows={prefRows} onOpenLayout={onOpenLayout} />
            <SomBlock c={c} />
            <div className="listhead"><span className="kx-meta">As saídas não aparecem na barra de tarefas: use Trazer para a frente para ver uma de novo. Em tela cheia a saída não tem botão de fechar: use Ctrl+W nela, ou Fechar aqui. Fechar o KERYX fecha todas. Ligar um monitor aparece aqui em poucos segundos.</span></div>
        </>
    );
}
