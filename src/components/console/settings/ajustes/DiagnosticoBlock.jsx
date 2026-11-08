import React from "react";
import { CfgGroup, FormRow } from "../parts";
import { useDisplays, useNetworkInfo } from "../useDisplays";
import { isDefaultSettings, ruleOf } from "@/lib/outputPrefs";
import { ruleKind, ruleKindOf } from "@/lib/contentKinds";
import { diagnosticoSummary, estadoText, ajustesLine, netClientsLine, showsNowText } from "@/lib/console/ajustesSummaries";

// Diagnóstico (Editor da tela › Ajustes, Rodada H2): read-only, closed — the
// state of the window, who on the network shows this page, whether the screen
// has settings and a design of its own, and what it shows right now.
// (Identificar and Testar belong to a later front.)
export default function DiagnosticoBlock({ ctx }) {
    const { path, pref, renderer, c } = ctx;
    const { outputs, number } = useDisplays(c.say);
    const { info } = useNetworkInfo();
    const o = outputs.find((x) => x.key === path) || null;
    const clients = (info?.clients || []).filter((cl) => cl.screen === path).length;
    return (
        <CfgGroup id="editor.diagnostico" k="Diagnóstico" defaultOpen={false} summary={diagnosticoSummary({ output: o, clients })}>
            <div className="frm cfg-outprefs-form cfg-diag">
                <FormRow k="Estado">
                    <span className="cfg-diag-v"><span className={`cfg-outtab-dot ${o?.open ? "is-open" : ""}`} aria-hidden="true" />{estadoText(o, number)}</span>
                </FormRow>
                <FormRow k="Na rede">
                    <span className="cfg-diag-v">{netClientsLine(clients, Boolean(info?.running))}</span>
                </FormRow>
                <FormRow k="Ajustes">
                    <span className="cfg-diag-v">{ajustesLine({ defaultSettings: isDefaultSettings(pref), ownDesign: Boolean(pref.design) })}</span>
                </FormRow>
                {renderer && <FormRow k="Mostrando agora">
                    <span className="cfg-diag-v">{showsNowText(c.live, ruleOf(pref, path), { kindOf: ruleKindOf, label: (k) => ruleKind(k).label })}</span>
                </FormRow>}
            </div>
        </CfgGroup>
    );
}
