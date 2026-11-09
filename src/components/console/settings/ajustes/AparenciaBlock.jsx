import React from "react";
import Icon from "../../Icon";
import { Btn, Seg } from "../../kx";
import { CfgDisc, CfgGroup, FormRow, Switch } from "../parts";
import { ownsTheme, streamOptions, alertOptions, showsAlert, churchAlertLook, ALERT_DEFAULTS } from "@/lib/outputPrefs";
import { usePrefs } from "@/hooks/useUser";
import { useOutputPref } from "@/hooks/useOutputPref";
import { aparenciaSummary, alertSummary } from "@/lib/console/ajustesSummaries";
import { openEditor } from "@/lib/editorWindow";
import { themeName } from "@/lib/console/themes";

const SCALES = [["80", "80%"], ["90", "90%"], ["100", "100%"], ["110", "110%"], ["125", "125%"], ["140", "140%"]];
const MARGINS = [["0", "Sem"], ["2", "2%"], ["5", "5%"], ["10", "10%"]];
// Aviso rápido (alertOptions): each screen keeps only its position; the
// look is the church's (Configurações › Telas e saídas › Avisos, 2026-11-09).
const ALERT_POSITIONS = [["top", "Alto"], ["bottom", "Baixo"]];

// Aparência (Editor da tela › Ajustes, Rodada H2): how the screen looks — the
// text scale and margins, the theme, the Aviso rápido bar in this screen's
// look and, for the Transmissão, the band of the lower third.
export default function AparenciaBlock({ ctx }) {
    const { path, label, pref, rule, themes, themeGone, save, saveOpt, renderer, isStream, alertSample, onAlertSample, c } = ctx;
    const stream = streamOptions(pref);
    const alertShown = !isStream && showsAlert(path, pref);
    const alertHidden = !rule.top.alert;
    const prefs = usePrefs();
    const { pref: projPref } = useOutputPref("/Projection");
    const alertLook = alertOptions(pref, path, churchAlertLook(prefs.alert_look, projPref?.options));
    const saveAlert = (k, v) => { saveOpt(`alert_${k}`, v); onAlertSample?.(true); };
    const alertColoursDefault = alertLook.bg === ALERT_DEFAULTS.bg && alertLook.fg === ALERT_DEFAULTS.fg;
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
                    only its position here; the look is the church's, one for
                    every screen (2026-11-09, A4 = A). Folded (T3 = A). */}
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
                        <span className="kx-meta">O estilo, as cores, o tamanho e a entrada são um só para todas as telas: Configurações › Telas e saídas › Avisos.</span>
                    </>}
                </CfgDisc>}
            </div>
        </CfgGroup>
    );
}
