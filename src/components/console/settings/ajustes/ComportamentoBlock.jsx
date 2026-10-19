import React from "react";
import Icon from "../../Icon";
import { Seg } from "../../kx";
import { CfgGroup, CfgKey, FormRow } from "../parts";
import { RULE_EMPTY } from "@/lib/outputPrefs";
import { comportamentoSummary } from "@/lib/console/ajustesSummaries";

// What the KERYX already does by itself for an output, said so nobody
// doubts it (the G10 mockup's "✓ já faz sozinho" lines).
const AUTO = [
    "Se o monitor desligar, a tela espera escondida e volta sozinha, em tela cheia.",
    "Uma tela na rede que cai volta a se ligar sozinha.",
    "Enquanto a saída está aberta, o computador não apaga a tela.",
];

// Comportamento (Editor da tela › Ajustes, Rodada H2): what the screen does
// when nothing from its list is on air — the papel de parede (as always), the
// Tela preta or the Logo, per screen — and the three things it already does
// by itself.
export default function ComportamentoBlock({ ctx }) {
    const { label, rule, renderer, save } = ctx;
    return (
        <CfgGroup id="editor.comportamento" k="Comportamento" defaultOpen={false} summary={renderer ? comportamentoSummary(rule) : "Já faz sozinho: monitor, rede e tela ligada"}>
            {renderer && (
                <div className="frm cfg-outprefs-form">
                    <FormRow k="Sem item da lista">
                        <Seg small label={`O que ${label} mostra sem item da lista`} value={rule.empty} options={RULE_EMPTY} onChange={(v) => save({ content_rule: { ...rule, empty: v } })} />
                        <span className="kx-meta">quando nada do que ela recebe está no ar</span>
                    </FormRow>
                </div>
            )}
            <CfgKey k="Já faz sozinho" className="cfg-auto" role="list" aria-label="O que o KERYX já faz sozinho">
                {AUTO.map((t) => <div key={t} className="cfg-auto-l" role="listitem"><Icon name="check" size={12} /><span className="kx-meta">{t}</span></div>)}
            </CfgKey>
        </CfgGroup>
    );
}
