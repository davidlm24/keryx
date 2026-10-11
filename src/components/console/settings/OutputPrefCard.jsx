import React, { useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn, Seg } from "../kx";
import Icon from "../Icon";
import { Switch, FormRow } from "./parts";
import { PREF_CONTENTS, PREF_OUTPUTS, normalizePref, isDefaultPref, outputMeta, ICON_CHOICES } from "@/lib/outputPrefs";

const SCALES = [["80", "80%"], ["90", "90%"], ["100", "100%"], ["110", "110%"], ["125", "125%"], ["140", "140%"]];
const MARGINS = [["0", "Sem"], ["2", "2%"], ["5", "5%"], ["10", "10%"]];
const DEFAULTS = { content: "", text_scale: 100, margin_pct: 0, show_logo: true, theme_id: "", name: "", icon: "" };

// One output's own settings (OutputPref, src/lib/outputPrefs.js), under its
// row in Telas e saídas. Each change is saved at once; the output (and any
// network screen showing the same page) follows it live.
export default function OutputPrefCard({ output, row, themes, say }) {
    const pref = normalizePref(row);
    // The first change creates the row; changes made before it comes back
    // update that one instead of creating another.
    const creating = useRef(null);
    if (row?.id) creating.current = null;
    const save = (patch) => {
        let done;
        if (row?.id) done = keryx.entities.OutputPref.update(row.id, patch);
        else if (creating.current) done = creating.current.then((r) => keryx.entities.OutputPref.update(r.id, patch));
        else done = creating.current = keryx.entities.OutputPref.create({ screen_path: output.key, ...patch });
        done.catch((err) => say(err?.message || "Não foi possível salvar o ajuste da saída."));
    };
    const themeGone = pref.themeId && !themes.some((t) => t.id === pref.themeId);
    // Palco and Pastor have layouts of their own; only the renderer pages
    // take content/scale/margins/logo/theme (their own options come in the
    // next slice). Every output can be named and get an icon.
    const renderer = PREF_OUTPUTS.includes(output.key);
    const meta = outputMeta(output.key);

    return (
        <div className="frm cfg-outprefs" role="group" aria-label={`Ajustes de ${output.label}`}>
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
                        <button type="button" key={ic} role="radio" aria-checked={pref.icon === ic} className={`kx-t ${pref.icon === ic ? "is-on" : ""}`} aria-label={`Ícone ${ic}`} title={ic} onClick={() => save({ icon: ic })}><Icon name={ic} /></button>
                    ))}
                </div>
            </FormRow>
            {renderer && <>
            <FormRow k="Conteúdo">
                <select className="cfg-select" value={pref.content} onChange={(e) => save({ content: e.target.value })} aria-label={`Conteúdo de ${output.label}`}>
                    {PREF_CONTENTS.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
            </FormRow>
            <FormRow k="Escala do texto">
                <Seg small value={String(Math.round(pref.scale * 100))} options={SCALES} onChange={(v) => save({ text_scale: Number(v) })} />
            </FormRow>
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
                <Btn small disabled={isDefaultPref(pref)} onClick={() => save(DEFAULTS)}>Restaurar padrão</Btn>
                <span className="kx-meta">vale também para as telas na rede que mostram esta página</span>
            </FormRow>
        </div>
    );
}
