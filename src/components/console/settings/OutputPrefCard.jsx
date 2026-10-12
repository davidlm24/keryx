import React, { useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn, Seg } from "../kx";
import Icon from "../Icon";
import { Switch, FormRow } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import StageScreen from "@/components/network/StageScreen";
import PastorScreen from "@/components/network/PastorScreen";
import { mainLayer } from "@shared/live-state.mjs";
import { PREF_CONTENTS, PREF_OUTPUTS, normalizePref, isDefaultPref, outputMeta, ICON_CHOICES, prefState, prefVars, prefViewKey, stageOptions, pastorOptions, showKindsFor } from "@/lib/outputPrefs";
import { sampleLive, sampleNotice, SAMPLE_ITEMS } from "./sample";

const SCALES = [["80", "80%"], ["90", "90%"], ["100", "100%"], ["110", "110%"], ["125", "125%"], ["140", "140%"]];
const MARGINS = [["0", "Sem"], ["2", "2%"], ["5", "5%"], ["10", "10%"]];
const DEFAULTS = { content: "", hidden_kinds: [], text_scale: 100, margin_pct: 0, show_logo: true, theme_id: "", name: "", icon: "", options: {} };
const NEXT_COUNTS = [["0", "Não"], ["1", "1"], ["2", "2"], ["3", "3"], ["4", "4"], ["5", "5"]];
// The icons' names, for screen readers and the tooltip.
const ICON_NAMES = { projector: "Projetor", tv: "TV", monitor: "Monitor", tablet: "Tablet", film: "Filme", megaphone: "Megafone", book: "Livro", image: "Imagem", text: "Texto", star: "Estrela", layers: "Camadas", external: "Janela" };
const sameJson = (a, b) => JSON.stringify(a || {}) === JSON.stringify(b || {});

// One output's own settings (OutputPref, src/lib/outputPrefs.js), under its
// row in Telas e saídas. Each change is saved at once; the output (and any
// network screen showing the same page) follows it live.
export default function OutputPrefCard({ output, row, themes, c }) {
    const say = c.say;
    const pref = normalizePref(row);
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
        if (!confirmReset) { setConfirmReset(true); say(`Clique de novo para voltar ${output.label} ao padrão.`); return; }
        setConfirmReset(false);
        sentOpts.current = null;
        save(DEFAULTS);
    };
    // Palco and Pastor have layouts of their own, with their own switches;
    // a Conteúdo choice turns them into a renderer view, which then takes
    // the renderer rows too. Every output can be named and get an icon.
    const isStage = output.key === "/StageView";
    const isPastor = output.key === "/PastorView";
    const renderer = PREF_OUTPUTS.includes(output.key) || Boolean(pref.content);
    // Mostrar: only for renderer views, only the kinds the view can show.
    const kinds = renderer ? showKindsFor(output.key, pref) : [];
    const meta = outputMeta(output.key);
    const now = c?.now || Date.now();
    // The preview: what is on air when something is, else a sample built
    // with real ops — the preview is the renderer itself, following every
    // change the instant it saves. The sample is made once: rebuilt every
    // second it would replay its fade.
    const liveOn = c?.live && mainLayer(c.live) !== "none" ? c.live : null;
    const madeAt = useRef(now);
    const sample = useMemo(() => sampleLive(madeAt.current), []);
    const notice = useMemo(() => sampleNotice(madeAt.current), []);
    const base = liveOn || sample;
    const prevLive = prefViewKey(output.key, pref) === "/CommunicationProjection" && !base.communication ? notice : base;
    const stage = stageOptions(pref);
    const pastor = pastorOptions(pref);
    const preview = isStage && !pref.content
        ? <div className="cfg-prev"><StageScreen content={prevLive.content} nowMs={now} embed opts={pref.options} scale={pref.scale} /></div>
        : isPastor && !pref.content
            ? <div className="cfg-prev cfg-prev-pastor"><PastorScreen live={{ ...prevLive, session: prevLive.session || { startedAt: now - 42 * 60000 } }} nowMs={now} logo={null} upcoming={SAMPLE_ITEMS.slice(0, pastor.next_count)} hasService embed opts={pref.options} scale={pref.scale} /></div>
            : <div className="cfg-prev"><div className="kp-out cfg-prev-fill" style={prefVars(pref) || undefined}><ScreenRenderer fill state={prefState(output.key, prevLive, pref, themeGone ? null : themes.find((t) => t.id === pref.themeId) || null)} now={now} preview audio={false} /></div></div>;

    return (
        <div className="cfg-outprefs" role="group" aria-label={`Ajustes de ${output.label}`}>
        <div className="frm cfg-outprefs-form">
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
            <FormRow k="Conteúdo">
                <select className="cfg-select" value={pref.content} onChange={(e) => save({ content: e.target.value })} aria-label={`Conteúdo de ${output.label}`}>
                    {PREF_CONTENTS.map((o) => <option key={o.id} value={o.id}>{o.id === "" && (isStage || isPastor) ? "Padrão da página" : o.name}</option>)}
                </select>
                {(isStage || isPastor) && <span className="kx-meta">outro conteúdo troca o layout próprio pela tela escolhida</span>}
            </FormRow>
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
            <FormRow k="Escala do texto">
                <Seg small value={String(Math.round(pref.scale * 100))} options={SCALES} onChange={(v) => save({ text_scale: Number(v) })} />
            </FormRow>
            {isStage && !pref.content && <>
            <FormRow k="Cifra">
                <Switch on={stage.chords} onChange={(on) => saveOpt("chords", on)} label="Cifra no Palco" />
                <span className="kx-meta">o painel de acordes ao lado da letra</span>
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
            {isPastor && !pref.content && <>
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
            <FormRow k="Tema">
                <select className="cfg-select" value={pref.themeId} onChange={(e) => save({ theme_id: e.target.value })} aria-label={`Tema de ${output.label}`}>
                    <option value="">Herdar da projeção</option>
                    {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    {themeGone && <option value={pref.themeId} disabled>(tema excluído)</option>}
                </select>
            </FormRow>
            </>}
            <FormRow k="">
                <Btn small kind={confirmReset ? "air" : ""} disabled={isDefaultPref(pref)} onClick={reset}>{confirmReset ? "Restaurar mesmo" : "Restaurar padrão"}</Btn>
                <span className="kx-meta">vale também para as telas na rede que mostram esta página</span>
            </FormRow>
        </div>
        <div className="cfg-prevcol">
            {preview}
            <span className="kx-meta">{liveOn ? "No ar agora" : "Exemplo"} · a prévia segue cada ajuste</span>
        </div>
        </div>
    );
}
