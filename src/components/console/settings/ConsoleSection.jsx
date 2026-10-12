import React from "react";
import { Btn, Seg } from "../kx";
import { FormRow, Switch } from "./parts";
import { MODULES, DENSITIES, densityOf } from "@/lib/console/layout";

// Console: the operator's screen. Which modules show and the density are the
// church's (they ride backups); the column sizes and the arrangement are
// this computer's. The same choices as the Ver menu, which stays the quick way.
export default function ConsoleSection({ layout, setLayout, restoreLayout }) {
    if (!layout) return null;
    return (
        <div className="frm">
            <FormRow k="Módulos">
                {MODULES.map(([key, name]) => (
                    <span key={key} className="cfg-launch">
                        <Switch on={!layout.hidden[key]} onChange={(on) => setLayout({ ...layout, hidden: { ...layout.hidden, [key]: !on } })} label={`Mostrar ${name}`} />
                        <span className="kx-meta">{name}</span>
                    </span>
                ))}
            </FormRow>
            <FormRow k="Densidade">
                <Seg small value={densityOf(layout)} onChange={(v) => setLayout({ ...layout, density: v })} options={DENSITIES} />
                <span className="kx-meta">a altura das linhas das listas</span>
            </FormRow>
            <FormRow k="Layout">
                <Btn small onClick={restoreLayout}>Restaurar layout</Btn>
                <span className="kx-meta">volta os módulos, a densidade, os tamanhos e a ordem das colunas ao padrão</span>
            </FormRow>
        </div>
    );
}
