import React, { useState } from "react";
import { Btn } from "../../kx";
import { FormRow } from "../parts";
import { PREF_OUTPUTS, normalizePref, isDefaultSettings, designOf, ruleOf } from "@/lib/outputPrefs";
import { useLayoutRows } from "@/hooks/useLayout";
import useOutputPrefSave from "./useOutputPrefSave";
import DestinoBlock from "./DestinoBlock";
import ConteudoBlock from "./ConteudoBlock";
import AparenciaBlock from "./AparenciaBlock";
import ComportamentoBlock from "./ComportamentoBlock";
import DiagnosticoBlock from "./DiagnosticoBlock";

// What "Restaurar padrão" writes: the settings, never the drawing (design,
// or an old layout_id: the Editor's "Voltar à página padrão" is for that).
// The rule goes back to the page's own (content_rule empty); the old fields
// are cleared too, so nothing migrates back in.
const DEFAULTS = { content: "", hidden_kinds: [], content_rule: null, text_scale: 100, margin_pct: 0, show_logo: true, theme_id: "", name: "", icon: "", options: {} };

// One output's own settings (OutputPref, src/lib/outputPrefs.js), in the
// Editor da tela's Ajustes half, as five blocks that open and close with a
// one-line summary each (Rodada H2, owner 2026-10-19): Destino, Conteúdo
// (O que esta tela recebe), Aparência, Comportamento and Diagnóstico. Each
// change is saved at once; the output (and any network screen showing the
// same page) follows it live. `alertSample`/`onAlertSample(on, fresh)` show an
// example Aviso rápido on the Editor's canvas while this screen's bar is set.
export default function OutputAjustes({ output, row, themes = [], c, alertSample = false, onAlertSample = null }) {
    const { key: path, label } = output;
    const pref = normalizePref(row);
    const layoutRows = useLayoutRows();
    const design = designOf(pref, layoutRows);
    const { save, saveOpt, saveOptions, options, forgetOptions } = useOutputPrefSave(path, row, pref, c.say);
    const [confirmReset, setConfirmReset] = useState(false);
    const reset = () => {
        if (!confirmReset) { setConfirmReset(true); c.say(`Clique de novo para voltar os ajustes de ${label} ao padrão (o desenho fica).`); return; }
        setConfirmReset(false);
        forgetOptions();
        save(DEFAULTS);
    };
    const ctx = {
        path, label, row, pref, themes, c, design, save, saveOpt, saveOptions, options, alertSample, onAlertSample,
        rule: ruleOf(pref, path),
        themeGone: Boolean(pref.themeId) && !themes.some((t) => t.id === pref.themeId),
        // Palco and Pastor draw their own design, with their own parts; the
        // Transmissão is a band of text on the network.
        renderer: PREF_OUTPUTS.includes(path),
        isStage: path === "/StageView",
        isPastor: path === "/PastorView",
        isStream: path === "/StreamView",
    };
    return (
        <div className="cfg-outprefs" role="group" aria-label={`Ajustes de ${label}`}>
            <DestinoBlock ctx={ctx} />
            {!ctx.isStream && <ConteudoBlock ctx={ctx} />}
            <AparenciaBlock ctx={ctx} />
            {!ctx.isStream && <ComportamentoBlock ctx={ctx} />}
            <DiagnosticoBlock ctx={ctx} />
            <div className="frm cfg-outprefs-form cfg-outprefs-tail">
                <FormRow k="">
                    <Btn small kind={confirmReset ? "air" : ""} disabled={isDefaultSettings(pref)} onClick={reset} title="Volta os ajustes desta tela ao padrão; o desenho fica">{confirmReset ? "Restaurar mesmo" : "Restaurar padrão"}</Btn>
                </FormRow>
            </div>
        </div>
    );
}
