import React, { useState } from "react";
import Icon from "../Icon";
import { Btn, Empty, Seg } from "../kx";
import { Switch, desktopOnly, CfgKey, Reading, FormRow, CfgGroup } from "./parts";
import { useDisplays } from "./useDisplays";
import { useLibrary } from "../useConsoleData";
import OutputPreview from "./OutputPreview";
import { normalizePref, isDefaultPref, designOf, outputLook } from "@/lib/outputPrefs";
import { useOutputPrefRows } from "@/hooks/useOutputPref";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { ringBell } from "@/lib/bell";
import { keryx } from "@/api/keryxClient";
import { buildOutputsFile, readOutputsFile, prefWrites, fileName } from "@/lib/outputsFile";
import { useLayoutRows } from "@/hooks/useLayout";
import { useChurch } from "@/hooks/useChurch";
import { outputsSummary } from "@/lib/console/outputs";
import { CHIME_VOLUMES, somSummary, ARQUIVO_SUMMARY } from "@/lib/console/cfgSummaries";
import { useContextMenu } from "../ContextMenu";
import { useConfirm } from "../ConfirmDialog";
import TransicoesBlock from "./TransicoesBlock";

// Som do aviso: the chime of avisos with "Som de alerta", on or off and its
// volume, for every output and network screen (on the profile). The YouTube
// title bar rides here too (from the dissolved Aparência, Rodada B
// 2026-10-14): what the screens draw over a YouTube video is theirs.
function SomBlock({ c }) {
    const prefs = usePrefs();
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    const vol = String(prefs.chime_volume);
    return (
        <CfgGroup id="telas.som" k="Som e YouTube" defaultOpen={false} summary={somSummary(prefs)}>
            <div className="frm">
                <FormRow k="Som do aviso">
                    <Switch on={prefs.chime_on} onChange={(on) => save({ chime_on: on }, on ? "O sino dos avisos toca." : "Sino dos avisos desligado em todas as telas.")} label="Tocar o sino dos avisos" />
                    <Seg small label="Volume do sino" value={CHIME_VOLUMES.some(([v]) => v === vol) ? vol : "35"} options={CHIME_VOLUMES} onChange={(v) => save({ chime_volume: Number(v) })} />
                    <Btn small disabled={!prefs.chime_on} onClick={() => ringBell({ on: true, volume: prefs.chime_volume })} title="Toca o sino aqui, neste computador">Testar som</Btn>
                    <span className="kx-meta">o sino curto dos avisos com Som de alerta, nas saídas e nas telas na rede</span>
                </FormRow>
                <FormRow k="Título do YouTube">
                    <Switch on={prefs.youtube_hide_title} onChange={(on) => save({ youtube_hide_title: on }, on ? "A faixa de título do YouTube fica escondida." : "O YouTube volta a mostrar o título sobre o vídeo.")} label="Esconder o título que o YouTube põe sobre o vídeo" />
                    <span className="kx-meta">a faixa que o YouTube põe sobre o vídeo, em todas as telas</span>
                </FormRow>
                <YouTubeToolsRow c={c} />
            </div>
        </CfgGroup>
    );
}

// Download do YouTube (owner 2026-10-27): the tools of Baixar para a Mídia
// (electron/youtube.cjs status / update). yt-dlp updates itself once a week
// before a download; Atualizar agora is for a download that failed because
// YouTube changed.
function YouTubeToolsRow({ c }) {
    const bridge = React.useRef(window.keryxDesktop?.youtube || null);
    const [st, setSt] = useState(null);
    const [busy, setBusy] = useState(false);
    React.useEffect(() => {
        let alive = true;
        bridge.current?.call("status").then((r) => { if (alive) setSt(r?.data || { ready: false }); });
        return () => { alive = false; };
    }, []);
    const update = async () => {
        setBusy(true);
        const r = await bridge.current.call("update");
        setBusy(false);
        if (r?.error) { c.say(r.error.message); return; }
        setSt((s) => ({ ...(s || {}), ytdlp: r.data.ytdlp || s?.ytdlp, updatedAt: Date.now() }));
        c.say(r.data.changed ? `Ferramentas do YouTube atualizadas: yt-dlp ${r.data.ytdlp}.` : "As ferramentas do YouTube já estavam em dia.");
    };
    const when = st?.updatedAt ? ` · conferido em ${new Date(st.updatedAt).toLocaleDateString("pt-BR")}` : "";
    return (
        <FormRow k="Download do YouTube">
            {!bridge.current ? <span className="kx-meta">só no KERYX do computador</span>
                : !st ? <span className="kx-meta">Conferindo…</span>
                : st.ready ? <>
                    <span>Pronto</span>
                    <Btn small disabled={busy} onClick={update} title="Busca a versão nova do yt-dlp na internet">{busy ? "Atualizando…" : "Atualizar agora"}</Btn>
                    <span className="kx-meta">yt-dlp {st.ytdlp || "?"} · ffmpeg {st.ffmpeg || "?"}{when}</span>
                </>
                : <span className="kx-meta kx-warn">as ferramentas não vieram neste KERYX: instale a versão completa</span>}
        </FormRow>
    );
}

// Telas e saídas as thumbnails (owner 2026-10-13): the monitors as a
// diagram on top, then one card per output showing WHAT THAT SCREEN SHOWS
// RIGHT NOW (OutputPreview: its view, Mostrar, theme, design — a still).
// Clicking a thumbnail (or Editar… in its right-click menu) opens the
// Editor on that screen; the card is lean (Rodada H2, owner 2026-10-19:
// thumbnail, name, state, Abrir/Fechar; Remover in the menu) — where the
// screen opens (Automático / Tela N) and Abrir ao iniciar live in the
// Editor's Ajustes › Destino. Rodada H1 (owner
// 2026-10-19): groups — Telas (the monitors, static at the top), Saídas,
// Transições, Som e YouTube and the settings file, the last three closed.
// The Tela ociosa moved to Temas e fundos. The placement rules live in
// electron/outputs.cjs.
export default function TelasSection({ c, onOpenScreen }) {
    const { displays, state, setState, readError, list, outputs, apply, statusOf: status } = useDisplays(c.say);
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

    const identify = () => Promise.resolve(displays.identify()).then((res) => { if (res?.error) c.say(res.error.message); })
        .catch(() => c.say("Não foi possível mostrar os números nas telas."));
    const widest = Math.max(1, ...list.map((d) => d.bounds?.width || d.width || 1));
    const onDisplay = (d) => outputs.filter((o) => o.open && o.placement?.mode === "fullscreen" && o.placement.displayId === d.id).map((o) => o.label);
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
            {/* The monitors stay on top, never folded (owner 2026-10-19: "telas
                1 e 2, e outras que forem ligadas, sempre no topo"). */}
            <CfgGroup id="telas.telas" k="Telas" fold={false}>
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
            </CfgGroup>
            <CfgGroup id="telas.saidas" k="Saídas" summary={outputsSummary(outs)}>
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
                                <span style={{ flex: 1 }} />
                                {o.open
                                    ? <Btn small onClick={() => apply(displays.close(o.key))}>Fechar</Btn>
                                    : <Btn small onClick={() => apply(displays.open(o.key))}>Abrir</Btn>}
                            </div>
                            <span className={`kx-meta cfg-card-m ${o.placement?.missing ? "kx-warn" : ""}`}>{status(o)}{o.assignment.openAtLaunch === true ? " · abre ao iniciar" : ""}{!isDefaultPref(pref) ? " · com ajustes" : ""}</span>
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
            <div className="listhead"><span className="kx-meta">Clique numa tela para editá-la no Editor: lá ficam a tela em que ela abre, Abrir ao iniciar, o que ela recebe e o resto dos ajustes. As saídas não aparecem na barra de tarefas; fechar o KERYX fecha todas.</span></div>
            </CfgGroup>
            <TransicoesBlock c={c} />
            <SomBlock c={c} />
            <CfgGroup id="telas.arquivo" k="Arquivo de ajustes" defaultOpen={false} summary={ARQUIVO_SUMMARY}>
                <div className="cfg-file">
                    <CfgKey as="span" k="Exportar ajustes das saídas"><Btn small onClick={exportPrefs} title="Salva num arquivo a tela e os ajustes de cada saída, para restaurar depois ou levar para outro computador">Exportar ajustes…</Btn></CfgKey>
                    <CfgKey as="span" k="Importar ajustes das saídas"><Btn small onClick={importPrefs} title="Abre um arquivo exportado e mostra o que muda antes de aplicar">Importar ajustes…</Btn></CfgKey>
                    <span className="kx-meta">a tela e os ajustes de cada saída, num arquivo para restaurar depois ou levar a outro computador</span>
                </div>
                {pending && (
                    <div className="cfg-import" role="group" aria-label="Importar ajustes das saídas">
                        <span className="kx-section">Importar {pending.name}</span>
                        <span className="kx-meta">{pending.read.exportedAt ? `Exportado em ${new Date(pending.read.exportedAt).toLocaleDateString("pt-BR")} · ` : ""}a tela de {pending.read.outputs} {pending.read.outputs === 1 ? "saída" : "saídas"} e os ajustes de {pending.read.pages} {pending.read.pages === 1 ? "saída" : "saídas"}. Substitui o que está configurado agora nessas saídas.</span>
                        {pending.read.notes.map((n) => <span key={n} className="kx-meta kx-warn">{n}</span>)}
                        <span className="cfg-import-acts"><Btn kind="brand" onClick={applyImport}>Importar</Btn><Btn onClick={() => setPending(null)}>Cancelar</Btn></span>
                    </div>
                )}
            </CfgGroup>
        </>
    );
}
