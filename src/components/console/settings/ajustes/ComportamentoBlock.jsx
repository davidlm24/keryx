import React from "react";
import Icon from "../../Icon";
import { CfgGroup, CfgKey } from "../parts";
import { COMPORTAMENTO_SUMMARY } from "@/lib/console/ajustesSummaries";

// What the KERYX already does by itself for an output, said so nobody
// doubts it (the G10 mockup's "✓ já faz sozinho" lines).
const AUTO = [
    "Se o monitor desligar, a tela espera escondida e volta sozinha, em tela cheia.",
    "Uma tela na rede que cai volta a se ligar sozinha.",
    "Enquanto a saída está aberta, o computador não apaga a tela.",
];

// Comportamento (Editor da tela › Ajustes, Rodada H2): the three things the
// screen already does by itself. "Sem item da lista" moved up to Conteúdo,
// beside the rule it completes (owner 2026-10-27, T4 = A).
export default function ComportamentoBlock() {
    return (
        <CfgGroup id="editor.comportamento" k="Comportamento" defaultOpen={false} summary={COMPORTAMENTO_SUMMARY}>
            <CfgKey k="Já faz sozinho" className="cfg-auto" role="list" aria-label="O que o KERYX já faz sozinho">
                {AUTO.map((t) => <div key={t} className="cfg-auto-l" role="listitem"><Icon name="check" size={12} /><span className="kx-meta">{t}</span></div>)}
            </CfgKey>
        </CfgGroup>
    );
}
