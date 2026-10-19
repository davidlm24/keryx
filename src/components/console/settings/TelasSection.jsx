import React, { useState } from "react";
import Icon from "../Icon";
import { Btn, Empty, Seg } from "../kx";
import { useBridge, usePoll, Switch, desktopOnly, CfgKey, Reading, FormRow } from "./parts";
import { useLibrary } from "../useConsoleData";
import { OutputPreview } from "./OutputPrefCard";
import { normalizePref, isDefaultPref, designOf, outputLook } from "@/lib/outputPrefs";
import { useOutputPrefRows } from "@/hooks/useOutputPref";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { ringBell } from "@/lib/bell";
import { keryx } from "@/api/keryxClient";
import { buildOutputsFile, readOutputsFile, prefWrites, fileName } from "@/lib/outputsFile";
import { useLayoutRows } from "@/hooks/useLayout";
import { useChurch } from "@/hooks/useChurch";
import { useContextMenu } from "../ContextMenu";
import { useConfirm } from "../ConfirmDialog";
import { MEDIA_MODES, MEDIA_MS, CLEAR_MODES, CLEAR_MS } from "@/lib/console/transitions";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { IDLE_SCREEN } from "@/components/editor/ScreensMenu";
import { emptyState } from "@shared/live-state.mjs";

const VOLUMES = [["20", "Baixo"], ["35", "Médio"], ["60", "Alto"], ["100", "Máximo"]];

// Som do aviso: the chime of avisos with "Som de alerta", on or off and its
// volume, for every output and network screen (on the profile). The YouTube
// title bar rides here too (from the dissolved Aparência, Rodada B
// 2026-10-14): what the screens draw over a YouTube video is theirs.
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
            <FormRow k="Título do YouTube">
                <Switch on={prefs.youtube_hide_title} onChange={(on) => save({ youtube_hide_title: on }, on ? "A faixa de título do YouTube fica escondida." : "O YouTube volta a mostrar o título sobre o vídeo.")} label="Esconder o título que o YouTube põe sobre o vídeo" />
                <span className="kx-meta">a faixa que o YouTube põe sobre o vídeo, em todas as telas</span>
            </FormRow>
        </div>
    );
}

// Transições (owner 2026-10-16, Rodada F2): how one sound gives way to the
// next and how what leaves the screens goes, for every output and network
// screen (User prefs; the console adds them to the ops, transitions.js). The
// slide-to-slide transition of the text stays the theme's.
const msOptions = (list) => list.map(([v, label]) => [String(v), label]);
function TransicoesBlock({ c }) {
    const prefs = usePrefs();
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    const mediaFade = prefs.media_transition === "fade";
    const clearFades = prefs.clear_transition === "fade";
    return (
        <>
            <CfgKey k="Transições" className="listhead"><span className="kx-section">Transições</span></CfgKey>
            <div className="frm">
                <FormRow k="Entre áudios e vídeos">
                    <Seg small label="Entre áudios e vídeos" value={prefs.media_transition} options={MEDIA_MODES}
                        onChange={(v) => save({ media_transition: v }, v === "mix" ? "Áudios e vídeos tocam juntos, como antes." : v === "cut" ? "Um som novo para o que tocava na hora." : "Um som novo faz o que tocava sumir aos poucos.")} />
                    {mediaFade && <Seg small label="Duração entre áudios e vídeos" value={String(prefs.media_transition_ms)} options={msOptions(MEDIA_MS)} onChange={(v) => save({ media_transition_ms: Number(v) })} />}
                    <span className="kx-meta">Quando um começa, o que tocava para</span>
                </FormRow>
                <FormRow k="Ao tirar da tela">
                    <Seg small label="Ao tirar da tela" value={prefs.clear_transition} options={CLEAR_MODES}
                        onChange={(v) => save({ clear_transition: v }, v === "fade" ? "Esc e Limpar tiram da tela aos poucos." : "Esc e Limpar tiram da tela na hora.")} />
                    {clearFades && <Seg small label="Duração ao tirar da tela" value={String(prefs.clear_transition_ms)} options={msOptions(CLEAR_MS)} onChange={(v) => save({ clear_transition_ms: Number(v) })} />}
                    <span className="kx-meta">Esc e Limpar</span>
                </FormRow>
                <FormRow k="Tela preta e Logo">
                    <Switch on={prefs.screen_transition} disabled={!clearFades} onChange={(on) => save({ screen_transition: on }, on ? "Tela preta e Logo entram e saem aos poucos." : "Tela preta e Logo entram e saem na hora.")} label="Tela preta e Logo entram e saem com a transição" />
                    <span className="kx-meta">{clearFades ? "entram e saem com a transição de Ao tirar da tela" : "com Corte em Ao tirar da tela, entram e saem na hora"}</span>
                </FormRow>
            </div>
        </>
    );
}

// Telas e saídas as thumbnails (owner 2026-10-13): the monitors as a
// diagram on top, then one card per output showing WHAT THAT SCREEN SHOWS
// RIGHT NOW (OutputPreview: its view, Mostrar, theme, design — a still).
// Clicking a thumbnail (or Editar… in its right-click menu) opens the
// Editor on that screen; the card keeps only the placement (Automático /
// Tela N, Abrir ao iniciar, Abrir/Fechar; Remover in the menu). The chime
// and the settings file sit below — no more vertical tabs. The idle look
// is in Culto › Fora do ar; the placement rules live in electron/outputs.cjs.
export default function TelasSection({ c, onOpenScreen }) {
    const displays = useBridge("displays");
    const [state, , setState, readError] = usePoll(() => displays?.list(), 3000);
    const { themes } = useLibrary();
    const prefRows = useOutputPrefRows();
    const layoutRows = useLayoutRows();
    const church = useChurch();
    const menu = useContextMenu();
    const prefRow = (key) => prefRows.find((r) => r.screen_path === key) || null;
    // Importar ajustes: the file read and checked (outputsFile.js), waiting
    // for the operator to confirm what changes.
    const [pending, setPending] = useState(null);
    // Remover saída asks first, in the console's dialog.
    const confirm = useConfirm();
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
        if (p.missing) return "A tela está desligada · a saída aparece quando ela ligar";
        if (p.mode === "fullscreen") return number(p.displayId) ? `Tela cheia na Tela ${number(p.displayId)}` : "Tela cheia";
        return "Abre numa janela";
    };
    const removeOutput = async (o) => {
        const ok = await confirm({ title: `Remover a saída ${o.label}?`, text: "Ela sai das listas e não abre mais ao iniciar. Os ajustes continuam salvos: Adicionar saída traz de volta.", ok: "Remover" });
        if (!ok) return;
        apply(displays.set(o.key, { removed: true }).then((res) => { c.say(`${o.label} removida.`); return res; }));
    };
    // One card per output. A removed output leaves the grid (and Saídas,
    // and Verificar); its entry and OutputPref row stay, so Adicionar saída
    // brings it back as it was.
    const outs = outputs.map((raw) => {
        const look = outputLook(raw.key, prefRow(raw.key));
        return { ...raw, look, label: look.custom || raw.label };
    });
    const active = outs.filter((o) => !o.removed);
    const removedOuts = outs.filter((o) => o.removed);

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
            {/* The Tela ociosa (owner 2026-10-19): the whole app's, not a
                culto's; a card like the outputs', the click opens it in the
                Editor de telas. The still shows what the screens show then. */}
            <CfgKey k="Tela ociosa" className="listhead"><span className="kx-section">Tela ociosa <span className="kx-count">· todas as telas, quando nada está no ar e não há papel de parede</span></span></CfgKey>
            <div className="cfg-grid" role="list" aria-label="Tela ociosa">
                <div role="listitem" className="cfg-card">
                    <button type="button" className="kx-t cfg-card-thumb" onClick={() => onOpenScreen?.(IDLE_SCREEN)} title="Editar a tela ociosa no Editor">
                        <div className="cfg-prev"><div className="cfg-prev-fill"><ScreenRenderer fill state={{ ...emptyState(0), idle: c.live?.idle === "black" ? "black" : "logo", idleLook: c.live?.idleLook ?? null }} logoUrl={church.logo} preview audio={false} /></div></div>
                    </button>
                    <div className="cfg-card-h">
                        <Icon name="monitor" />
                        <span className="cfg-card-t">Tela ociosa</span>
                    </div>
                    <span className="kx-meta cfg-card-m">{c.live?.idle === "black" ? "Preto" : "Logo da igreja"}{c.live?.idleLook ? " · com ajustes" : ""}</span>
                </div>
            </div>
            <CfgKey k="Saídas" className="listhead"><span className="kx-section">Saídas <span className="kx-count">· clique numa tela para editá-la no Editor</span></span></CfgKey>
            <div className="cfg-grid" role="list" aria-label="Saídas">
                {active.map((o) => {
                    const pref = normalizePref(prefRow(o.key));
                    return (
                        <div key={o.key} role="listitem" className={`cfg-card ${o.placement?.missing ? "is-warn" : ""}`}
                            onContextMenu={(e) => menu(e, { title: o.label, items: [
                                { label: "Editar a tela…", icon: "edit", onSelect: () => onOpenScreen?.(o.key) },
                                o.open
                                    ? { label: "Fechar", onSelect: () => apply(displays.close(o.key)) }
                                    : { label: "Abrir", icon: "play", onSelect: () => apply(displays.open(o.key)) },
                                o.open && { label: "Trazer para a frente", onSelect: () => apply(displays.open(o.key)) },
                                o.key !== "/Projection" && { label: "Remover saída", icon: "trash", onSelect: () => removeOutput(o) },
                            ].filter(Boolean) })}>
                            <button type="button" className="kx-t cfg-card-thumb" onClick={() => onOpenScreen?.(o.key)} title={`Editar ${o.label} no Editor`}>
                                <OutputPreview path={o.key} pref={pref} design={designOf(pref, layoutRows)} themes={themes} live={c.live} church={church} />
                            </button>
                            <div className="cfg-card-h">
                                <Icon name={o.look.icon} />
                                <span className="cfg-card-t">{o.label}</span>
                                <span className={`cfg-outtab-dot ${o.open ? "is-open" : ""}`} aria-label={o.open ? "aberta" : "fechada"} />
                            </div>
                            <span className={`kx-meta cfg-card-m ${o.placement?.missing ? "kx-warn" : ""}`}>{status(o)}{!isDefaultPref(pref) ? " · com ajustes" : ""}</span>
                            <div className="cfg-card-acts">
                                <select className="cfg-select" value={valueOf(o.assignment)} onChange={(e) => choose(o, e.target.value)} aria-label={`Tela de ${o.label}`}>
                                    <option value="auto">Automático</option>
                                    <option value="window">Sempre numa janela</option>
                                    {list.map((d, i) => <option key={d.id} value={`d:${d.id}`}>Tela {i + 1} · {d.bounds?.width || d.width}×{d.bounds?.height || d.height}</option>)}
                                    {typeof o.assignment.target === "object" && !list.some((d) => d.id === o.assignment.target.id) && <option value={`gone:${o.assignment.target.id}`} disabled>{o.assignment.target.width}×{o.assignment.target.height} (desligada)</option>}
                                </select>
                                <span className="cfg-launch"><Switch on={o.assignment.openAtLaunch === true} onChange={(on) => apply(displays.set(o.key, { openAtLaunch: on }))} label={`Abrir ${o.label} ao iniciar`} /><span className="kx-meta">Abrir ao iniciar</span></span>
                                <span style={{ flex: 1 }} />
                                {o.open
                                    ? <Btn small onClick={() => apply(displays.close(o.key))}>Fechar</Btn>
                                    : <Btn small onClick={() => apply(displays.open(o.key))}>Abrir</Btn>}
                            </div>
                        </div>
                    );
                })}
                {/* Adicionar saída: the removed ones, back with one click
                    (the entry and the Ajustes were kept). */}
                {removedOuts.map((o) => (
                    <CfgKey key={o.key} k="Adicionar saída" as="button" type="button" className="kx-t cfg-card cfg-card-add" title={`Adicionar ${o.label} de volta · os ajustes continuam salvos`}
                        onClick={() => apply(displays.set(o.key, { removed: false }).then((res) => { c.say(`${o.label} adicionada de volta.`); return res; }))}>
                        <span className="cfg-card-plus"><Icon name="plus" /></span>
                        <span className="cfg-card-t">Adicionar {o.label}</span>
                    </CfgKey>
                ))}
            </div>
            <CfgKey k="Arquivo de ajustes" className="listhead"><span className="kx-section">Arquivo de ajustes</span>
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
            <TransicoesBlock c={c} />
            <SomBlock c={c} />
            <div className="listhead"><span className="kx-meta">As saídas não aparecem na barra de tarefas; fechar o KERYX fecha todas.</span></div>
        </>
    );
}
