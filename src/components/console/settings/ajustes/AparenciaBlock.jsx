import React from "react";
import Icon from "../../Icon";
import { Btn, Seg } from "../../kx";
import { CfgDisc, CfgGroup, FormRow, Switch } from "../parts";
import { ownsTheme, streamOptions, alertOptions, showsAlert, ALERT_DEFAULTS } from "@/lib/outputPrefs";
import { aparenciaSummary, alertSummary } from "@/lib/console/ajustesSummaries";
import { openEditor } from "@/lib/editorWindow";
import { themeName } from "@/lib/console/themes";

const SCALES = [["80", "80%"], ["90", "90%"], ["100", "100%"], ["110", "110%"], ["125", "125%"], ["140", "140%"]];
const MARGINS = [["0", "Sem"], ["2", "2%"], ["5", "5%"], ["10", "10%"]];
// Aviso rápido (alertOptions): the choices, in the bar's own words.
const ALERT_POSITIONS = [["top", "Alto"], ["bottom", "Baixo"]];
const ALERT_STYLES = [["band", "Faixa"], ["pill", "Pílula"]];
const ALERT_SIZES = [["s", "P"], ["m", "M"], ["l", "G"]];
const ALERT_ENTRANCES = [["slide", "Deslizar"], ["fade", "Aparecer"], ["none", "Nenhuma"]];

// Aparência (Editor da tela › Ajustes, Rodada H2): how the screen looks — the
// text scale and margins, the theme, the Aviso rápido bar in this screen's
// look and, for the Transmissão, the band of the lower third.
export default function AparenciaBlock({ ctx }) {
    const { path, label, pref, rule, themes, themeGone, save, saveOpt, saveOptions, options, renderer, isStream, alertSample, onAlertSample, c } = ctx;
    const stream = streamOptions(pref);
    const alertShown = !isStream && showsAlert(path, pref);
    const alertHidden = !rule.top.alert;
    const alertLook = alertOptions(pref, path);
    const saveAlert = (k, v) => { saveOpt(`alert_${k}`, v); onAlertSample?.(true); };
    const alertColoursDefault = alertLook.bg === ALERT_DEFAULTS.bg && alertLook.fg === ALERT_DEFAULTS.fg;
    const resetAlertColours = () => {
        const next = { ...options() };
        delete next.alert_bg;
        delete next.alert_fg;
        saveOptions(next);
        onAlertSample?.(true);
    };
    const theme = themes.find((t) => t.id === pref.themeId);
    return (
        <CfgGroup id="editor.aparencia" k="Aparência" summary={aparenciaSummary({ page: path, pref, themeName: theme && !themeGone ? themeName(theme) : "" })}>
            <div className="frm cfg-outprefs-form">
                {!isStream && <FormRow k="Escala do texto">
                    <Seg small label={`Escala do texto de ${label}`} value={String(Math.round(pref.scale * 100))} options={SCALES} onChange={(v) => save({ text_scale: Number(v) })} />
                </FormRow>}
                {renderer && <FormRow k="Margens">
                    <Seg small label={`Margens de ${label}`} value={String(pref.margin)} options={MARGINS} onChange={(v) => save({ margin_pct: Number(v) })} />
                    <span className="kx-meta">afasta o texto das bordas (TV que corta a imagem)</span>
                </FormRow>}
                {renderer && ownsTheme(path) && <FormRow k="Tema">
                    <select className="cfg-select" value={pref.themeId} onChange={(e) => save({ theme_id: e.target.value })} aria-label={`Tema de ${label}`}>
                        <option value="">O mesmo da Projeção</option>
                        {themes.map((t) => <option key={t.id} value={t.id}>{themeName(t)}</option>)}
                        {themeGone && <option value={pref.themeId} disabled>(tema excluído)</option>}
                    </select>
                    {pref.themeId && !themeGone && <Btn small onClick={() => { const r = openEditor({ theme: pref.themeId, from: "Editor da tela" }); if (r?.error) c.say(r.error); }} title="Abrir este tema no Editor"><Icon name="edit" />Editar tema…</Btn>}
                </FormRow>}
                {renderer && !ownsTheme(path) && <FormRow k="Tema">
                    <span className="kx-meta">segue o tema do console (a Projeção não tem tema próprio)</span>
                </FormRow>}
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
                {/* The Aviso rápido bar on this screen (alertOptions; Rodada E3):
                    no choice is the amber band across the top, as always.
                    Set once, so folded under its summary (T3 = A). */}
                {alertShown && <CfgDisc k="Aviso rápido" bodyClass="frm" summary={alertSummary(alertLook, { amber: alertColoursDefault, hidden: alertHidden })}>
                    <div className="cfg-frm-head">
                        {alertHidden && <span className="kx-meta">esta saída não mostra o Aviso rápido (Conteúdo › Escolher por tipo › Por cima de tudo)</span>}
                        <span className="grow" />
                        {onAlertSample && !alertHidden && <Btn small on={ctx.alertSample} onClick={() => onAlertSample(!alertSample, true)} title="Um aviso de exemplo na tela ao lado, com estes ajustes">Ver exemplo</Btn>}
                    </div>
                    {!alertHidden && <>
                        <FormRow k="Posição">
                            <Seg small label={`Posição do Aviso rápido em ${label}`} value={alertLook.position} options={ALERT_POSITIONS} onChange={(v) => saveAlert("position", v)} />
                        </FormRow>
                        <FormRow k="Estilo">
                            <Seg small label={`Estilo do Aviso rápido em ${label}`} value={alertLook.style} options={ALERT_STYLES} onChange={(v) => saveAlert("style", v)} />
                        </FormRow>
                        <FormRow k="Cores">
                            <input type="color" className="ed-color" value={alertLook.bg} onChange={(e) => saveAlert("bg", e.target.value)} aria-label="Cor do fundo do Aviso rápido" title="Fundo" />
                            <input type="color" className="ed-color" value={alertLook.fg} onChange={(e) => saveAlert("fg", e.target.value)} aria-label="Cor do texto do Aviso rápido" title="Texto" />
                            <span className="kx-meta">fundo e texto</span>
                            {!alertColoursDefault && <Btn small onClick={resetAlertColours} title="Volta ao âmbar de sempre">Cores padrão</Btn>}
                        </FormRow>
                        <FormRow k="Tamanho">
                            <Seg small label={`Tamanho do Aviso rápido em ${label}`} value={alertLook.size} options={ALERT_SIZES} onChange={(v) => saveAlert("size", v)} />
                        </FormRow>
                        <FormRow k="Entrada">
                            <Seg small label={`Entrada do Aviso rápido em ${label}`} value={alertLook.entrance} options={ALERT_ENTRANCES} onChange={(v) => saveAlert("entrance", v)} />
                            <span className="kx-meta">sem movimento quando o Windows pede menos animação</span>
                        </FormRow>
                    </>}
                </CfgDisc>}
            </div>
        </CfgGroup>
    );
}
