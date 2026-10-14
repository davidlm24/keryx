import React, { useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn, Seg } from "../kx";
import Icon from "../Icon";
import { Switch, FormRow } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import StageScreen from "@/components/network/StageScreen";
import PastorScreen from "@/components/network/PastorScreen";
import { mainLayer } from "@shared/live-state.mjs";
import { PREF_CONTENTS, PREF_OUTPUTS, ownsTheme, normalizePref, isDefaultSettings, outputMeta, ICON_CHOICES, prefState, prefVars, prefViewKey, stageOptions, pastorOptions, lyricsOptions, showKindsFor, streamOptions, designOf } from "@/lib/outputPrefs";
import StreamBand from "@/components/network/StreamBand";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import { useLayoutRows } from "@/hooks/useLayout";
import { sampleLive, sampleNotice, SAMPLE_ITEMS } from "./sample";
import { useChurch } from "@/hooks/useChurch";
import { openEditor } from "@/lib/editorWindow";
import { themeName } from "@/lib/console/themes";

const SCALES = [["80", "80%"], ["90", "90%"], ["100", "100%"], ["110", "110%"], ["125", "125%"], ["140", "140%"]];
const MARGINS = [["0", "Sem"], ["2", "2%"], ["5", "5%"], ["10", "10%"]];
// What "Restaurar padrão" writes: the settings, never the drawing (design,
// or an old layout_id: the Editor's "Voltar à página padrão" is for that).
const DEFAULTS = { content: "", hidden_kinds: [], text_scale: 100, margin_pct: 0, show_logo: true, theme_id: "", name: "", icon: "", options: {} };
const NEXT_COUNTS = [["0", "Não"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]];
// The icons' names, for screen readers and the tooltip.
const ICON_NAMES = { projector: "Projetor", tv: "TV", monitor: "Monitor", tablet: "Tablet", film: "Filme", megaphone: "Megafone", book: "Livro", image: "Imagem", text: "Texto", star: "Estrela", layers: "Camadas", external: "Janela" };
const sameJson = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

// What this screen shows right now (or a sample when nothing is on air),
// exactly as the page draws it: its view, Mostrar, theme, design, scale and
// margins. A still — previews never play (ScreenRenderer preview). Used by
// the card below and by Telas e saídas' thumbnails (owner 2026-10-13).
export function OutputPreview({ path, pref, design, themes = [], live, now, church }) {
    const renderer = PREF_OUTPUTS.includes(path);
    const isStream = path === "/StreamView";
    const isStage = path === "/StageView";
    const isPastor = path === "/PastorView";
    const liveOn = live && mainLayer(live) !== "none" ? live : null;
    const madeAt = useRef(now);
    const sample = useMemo(() => sampleLive(madeAt.current), []);
    const notice = useMemo(() => sampleNotice(madeAt.current), []);
    const base = liveOn || sample;
    const prevLive = prefViewKey(path, pref) === "/CommunicationProjection" && !base.communication ? notice : base;
    const pastor = pastorOptions(pref);
    const streamSample = { key: "x", text: "Grande é o Senhor\ne mui digno de louvor", ref: "Salmos 48:1 · NVI" };
    const rendererState = renderer ? prefState(path, prevLive, pref, themes.find((t) => t.id === pref.themeId) || null) : null;
    if (isStream) return <div className="cfg-prev cfg-prev-stream"><div className="cfg-prev-fill" style={{ containerType: "size" }}><StreamBand caption={streamSample} opts={streamOptions(pref)} scale={pref.scale} /></div></div>;
    if (design) return <div className="cfg-prev"><div className="kp-out cfg-prev-fill" style={prefVars(pref) || undefined}><LayoutRenderer layout={design} live={{ ...prevLive, session: prevLive.session || { startedAt: now - 42 * 60000 } }} screenState={renderer ? rendererState : undefined} nowMs={now} logoUrl={church.logo} upcoming={SAMPLE_ITEMS} hasService church={church} embed /></div></div>;
    if (isStage && !pref.content) return <div className="cfg-prev"><StageScreen content={prevLive.content} nowMs={now} embed opts={pref.options} scale={pref.scale} /></div>;
    if (isPastor && !pref.content) return <div className="cfg-prev"><PastorScreen live={{ ...prevLive, session: prevLive.session || { startedAt: now - 42 * 60000 } }} nowMs={now} logo={null} upcoming={SAMPLE_ITEMS.slice(0, pastor.next_count)} hasService embed opts={pref.options} scale={pref.scale} church={church} /></div>;
    return <div className="cfg-prev"><div className="kp-out cfg-prev-fill" style={prefVars(pref) || undefined}><ScreenRenderer fill state={rendererState} now={now} preview audio={false} /></div></div>;
}

// One output's own settings (OutputPref, src/lib/outputPrefs.js), under its
// row in Telas e saídas. Each change is saved at once; the output (and any
// network screen showing the same page) follows it live. Palco and Pastor
// also own a design (owner 2026-10-13: each screen owns its drawing);
// `onOpenScreen` opens the Editor on this screen.
export default function OutputPrefCard({ output, row, themes, c, onOpenScreen, inEditor = false }) {
    const say = c.say;
    const church = useChurch();
    const pref = normalizePref(row);
    const layoutRows = useLayoutRows();
    const design = designOf(pref, layoutRows);
    // The first change creates the row; changes made before it comes back
    // update that one instead of creating another. A failed create is
    // forgotten, so the next change tries again.
    const creating = useRef(null);
    if (row?.id) creating.current = null;
    const save = (patch) => {
        let done;
        if (row?.id) done = keryx.entities.OutputPref.update(row.id, patch);
        else if (creating.current) done = creating.current.then((r) => keryx.entities.OutputPref.update(r.id, patch));
        else {
            const made = keryx.entities.OutputPref.create({ screen_path: output.key, ...patch });
            creating.current = made;
            made.catch(() => { if (creating.current === made) creating.current = null; });
            done = made;
        }
        done.catch((err) => say(err?.message || "Não foi possível salvar o ajuste da saída."));
    };
    const themeGone = pref.themeId && !themes.some((t) => t.id === pref.themeId);
    // Page options are one object: two quick switches must not undo each
    // other, so each change builds on the last one sent until the row
    // catches up.
    const sentOpts = useRef(null);
    if (sentOpts.current && sameJson(sentOpts.current, row?.options)) sentOpts.current = null;
    const saveOpt = (k, v) => {
        const next = { ...(sentOpts.current || pref.options), [k]: v };
        sentOpts.current = next;
        save({ options: next });
    };
    const [confirmReset, setConfirmReset] = useState(false);
    const reset = () => {
        if (!confirmReset) { setConfirmReset(true); say(`Clique de novo para voltar os ajustes de ${output.label} ao padrão (o desenho fica).`); return; }
        setConfirmReset(false);
        sentOpts.current = null;
        save(DEFAULTS);
    };
    // Palco and Pastor have layouts of their own, with their own switches;
    // a Conteúdo choice turns them into a renderer view, which then takes
    // the renderer rows too. Every output can be named and get an icon.
    const isStage = output.key === "/StageView";
    const isPastor = output.key === "/PastorView";
    // Transmissão: the band of the lower third (no renderer, no Conteúdo).
    const isStream = output.key === "/StreamView";
    const stream = streamOptions(pref);
    const renderer = PREF_OUTPUTS.includes(output.key) || Boolean(pref.content);
    // Mostrar: only for renderer views, only the kinds the view can show.
    const kinds = renderer ? showKindsFor(output.key, pref) : [];
    const meta = outputMeta(output.key);
    const now = c?.now || Date.now();
    // The preview: this screen right now (OutputPreview above).
    const liveOn = c?.live && mainLayer(c.live) !== "none" ? c.live : null;
    const stage = stageOptions(pref);
    const pastor = pastorOptions(pref);
    const lyricsOpts = lyricsOptions(output.key, pref);
    const preview = <OutputPreview path={output.key} pref={pref} design={design} themes={themeGone ? [] : themes} live={c?.live} now={now} church={church} />;

    return (
        <div className="cfg-outprefs" role="group" aria-label={`Ajustes de ${output.label}`}>
        <div className="frm cfg-outprefs-form">
            {/* The design first: this screen's own drawing (the Editor's canvas). */}
            {!isStream && !inEditor && <FormRow k="Desenho">
                <Btn small kind="brand" onClick={() => onOpenScreen?.(output.key)} title="Abre esta tela no Editor: mover e redimensionar cada elemento"><Icon name="edit" />Editar a tela…</Btn>
                {design && <Btn small onClick={() => save({ design: null, layout_id: "" })} title="A tela volta ao desenho padrão da página">Voltar à página padrão</Btn>}
                <span className="kx-meta">{design ? (pref.design ? "desenho próprio desta tela" : "do antigo layout; é salvo na tela ao editar") : "a página padrão"}</span>
            </FormRow>}
            <FormRow k="Nome">
                <input key={pref.name} className="fg-input" defaultValue={pref.name} placeholder={meta.name} maxLength={40}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v !== pref.name) save({ name: v }); }}
                    onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label={`Nome da saída ${meta.name}`} />
                <span className="kx-meta">no console e nas telas na rede; vazio volta ao nome padrão</span>
            </FormRow>
            <FormRow k="Ícone">
                <div className="cfg-icons" role="radiogroup" aria-label={`Ícone de ${output.label}`}>
                    <button type="button" className={`kx-t ${!pref.icon ? "is-on" : ""}`} role="radio" aria-checked={!pref.icon} title="Padrão" onClick={() => save({ icon: "" })}><Icon name={meta.icon} /><span className="kx-meta">Padrão</span></button>
                    {ICON_CHOICES.map((ic) => (
                        <button type="button" key={ic} role="radio" aria-checked={pref.icon === ic} className={`kx-t ${pref.icon === ic ? "is-on" : ""}`} aria-label={`Ícone: ${ICON_NAMES[ic] || ic}`} title={ICON_NAMES[ic] || ic} onClick={() => save({ icon: ic })}><Icon name={ic} /></button>
                    ))}
                </div>
            </FormRow>
            {!isStream && <FormRow k="Conteúdo">
                <select className="cfg-select" value={pref.content} onChange={(e) => save({ content: e.target.value })} aria-label={`Conteúdo de ${output.label}`}>
                    {PREF_CONTENTS.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
                {(isStage || isPastor) && <span className="kx-meta">outro conteúdo troca o desenho próprio pela tela escolhida</span>}
            </FormRow>}
            {kinds.length > 0 && (
                <FormRow k="Mostrar">
                    <div className="cfg-kinds" role="group" aria-label={`O que ${output.label} mostra`}>
                        {kinds.map((k) => {
                            const on = !pref.hidden.includes(k.id);
                            return (
                                <button type="button" key={k.id} role="checkbox" aria-checked={on} className={`kx-t ${on ? "is-on" : ""}`}
                                    title={on ? `${output.label} mostra ${k.name.toLowerCase()} · clique para esconder` : `${output.label} não mostra ${k.name.toLowerCase()} · clique para mostrar`}
                                    onClick={() => save({ hidden_kinds: on ? [...pref.hidden, k.id] : pref.hidden.filter((x) => x !== k.id) })}>
                                    <Icon name="check" size={12} />{k.name}
                                </button>
                            );
                        })}
                    </div>
                    <span className="kx-meta">o que fica de fora deixa esta saída no que está por baixo (ou no fundo de espera); a música continua tocando</span>
                </FormRow>
            )}
            {!isStream && <FormRow k="Escala do texto">
                <Seg small value={String(Math.round(pref.scale * 100))} options={SCALES} onChange={(v) => save({ text_scale: Number(v) })} />
            </FormRow>}
            {/* What this screen adds to a song's lyrics (lyricsOptions): the
                chords over the syllables and the part's name. The Palco
                shows both unless told otherwise; the others neither. */}
            {((renderer && !isStream) || (isPastor && !pref.content && !design)) && <>
            <FormRow k="Cifra">
                <Switch on={lyricsOpts.chords} onChange={(on) => saveOpt("chords", on)} label={`Cifra em ${output.label}`} />
                <span className="kx-meta">os acordes da letra ([G]) sobre as sílabas</span>
            </FormRow>
            <FormRow k="Nome da parte">
                <Switch on={lyricsOpts.labels} onChange={(on) => saveOpt("labels", on)} label={`Nome da parte em ${output.label}`} />
                <span className="kx-meta">Verso, Refrão, Ponte… sobre a letra</span>
            </FormRow>
            </>}
            {isStage && !pref.content && !design && <>
            <FormRow k="Cifra">
                <Switch on={stage.chords} onChange={(on) => saveOpt("chords", on)} label="Cifra no Palco" />
                <span className="kx-meta">os acordes sobre a letra (ou o bloco de cifra ao lado)</span>
            </FormRow>
            <FormRow k="Nome da parte">
                <Switch on={stage.labels} onChange={(on) => saveOpt("labels", on)} label="Nome da parte no Palco" />
                <span className="kx-meta">Verso, Refrão, Ponte… no alto</span>
            </FormRow>
            <FormRow k="Relógio e tempo">
                <Switch on={stage.clock} onChange={(on) => saveOpt("clock", on)} label="Relógio e tempo no Palco" />
                <span className="kx-meta">a hora e o "na música"</span>
            </FormRow>
            <FormRow k="Notas para músicos">
                <Switch on={stage.notes} onChange={(on) => saveOpt("notes", on)} label="Notas para músicos no Palco" />
            </FormRow>
            <FormRow k="Próximo slide">
                <Switch on={stage.next} onChange={(on) => saveOpt("next", on)} label="Próximo slide no Palco" />
            </FormRow>
            </>}
            {isStream && <>
            <FormRow k="Faixa">
                <input type="color" className="ed-color" value={stream.band} onChange={(e) => saveOpt("band", e.target.value)} aria-label="Cor da faixa" title="Cor da faixa" />
                <Seg small label="Opacidade da faixa" value={String(stream.band_opacity)} options={[["0", "Sem faixa"], ["0.5", "50%"], ["0.78", "78%"], ["1", "100%"]]} onChange={(v) => saveOpt("band_opacity", Number(v))} />
            </FormRow>
            <FormRow k="Tamanho do texto">
                <Seg small label="Tamanho do texto da legenda" value={stream.size} options={[["auto", "Automático"], ["s", "P"], ["m", "M"], ["l", "G"]]} onChange={(v) => saveOpt("size", v)} />
                <span className="kx-meta">automático: menor quando o texto é longo</span>
            </FormRow>
            <FormRow k="Posição">
                <Seg small label="Posição da faixa" value={stream.position} options={[["bottom", "Baixo"], ["middle", "Meio"], ["top", "Alto"]]} onChange={(v) => saveOpt("position", v)} />
            </FormRow>
            <FormRow k="Referência na legenda">
                <Switch on={stream.show_ref} onChange={(on) => saveOpt("show_ref", on)} label="Mostrar a referência na legenda" />
                <span className="kx-meta">João 3:16 embaixo do texto</span>
            </FormRow>
            </>}
            {isPastor && !pref.content && !design && <>
            <FormRow k="Relógio">
                <Switch on={pastor.clock} onChange={(on) => saveOpt("clock", on)} label="Relógio na Tela do pastor" />
                <span className="kx-meta">a hora e o tempo de culto</span>
            </FormRow>
            <FormRow k="Próximos itens">
                <Seg small value={String(pastor.next_count)} options={NEXT_COUNTS} onChange={(v) => saveOpt("next_count", Number(v))} />
                <span className="kx-meta">quantos itens da Setlist aparecem; Não esconde a lista</span>
            </FormRow>
            </>}
            {renderer && <>
            <FormRow k="Margens">
                <Seg small value={String(pref.margin)} options={MARGINS} onChange={(v) => save({ margin_pct: Number(v) })} />
                <span className="kx-meta">afasta o texto das bordas (TV que corta a imagem)</span>
            </FormRow>
            <FormRow k="Mostrar logo">
                <Switch on={pref.showLogo} onChange={(on) => save({ show_logo: on })} label={`Mostrar o logo em ${output.label}`} />
                <span className="kx-meta">a camada Logo nesta saída</span>
            </FormRow>
            {ownsTheme(output.key) && <FormRow k="Tema">
                <select className="cfg-select" value={pref.themeId} onChange={(e) => save({ theme_id: e.target.value })} aria-label={`Tema de ${output.label}`}>
                    <option value="">O mesmo da Projeção</option>
                    {themes.map((t) => <option key={t.id} value={t.id}>{themeName(t)}</option>)}
                    {themeGone && <option value={pref.themeId} disabled>(tema excluído)</option>}
                </select>
                {pref.themeId && !themeGone && <Btn small onClick={() => { const r = openEditor({ theme: pref.themeId }); if (r?.error) c.say(r.error); }} title="Abrir este tema no Editor"><Icon name="edit" />Editar tema…</Btn>}
            </FormRow>}
            </>}
            <FormRow k="">
                <Btn small kind={confirmReset ? "air" : ""} disabled={isDefaultSettings(pref)} onClick={reset} title="Volta os ajustes desta tela ao padrão; o desenho fica">{confirmReset ? "Restaurar mesmo" : "Restaurar padrão"}</Btn>
            </FormRow>
        </div>
        {!inEditor && <div className="cfg-prevcol">
            {preview}
            <span className="kx-meta">{liveOn ? "No ar agora" : "Exemplo"}</span>
        </div>}
        </div>
    );
}
