import React, { useEffect, useState } from "react";
import { Btn, Seg } from "../kx";
import { FormRow, Switch, CfgKey, useBridge } from "./parts";
import ShortcutList from "../ShortcutList";
import { MODULES, DENSITIES, densityOf } from "@/lib/console/layout";

// Console: the operator's screen and this computer. Which modules show and
// the density are the church's (they ride backups); the column sizes and the
// arrangement are this computer's, and so are "Ao fechar" and "Iniciar com
// o Windows" (settings.json, electron/closeGuard.cjs). The Ver menu keeps
// its quick toggles.
export default function ConsoleSection({ c, layout, setLayout, restoreLayout }) {
    const system = useBridge("system");
    const [machine, setMachine] = useState(null);
    useEffect(() => {
        let alive = true;
        system?.call("machineGet").then((res) => { if (alive && res?.data) setMachine(res.data); }).catch(() => {});
        return () => { alive = false; };
    }, [system]);
    const change = async (op, args, message) => {
        try {
            const res = await system.call(op, args);
            if (res?.error) { c.say(res.error.message); return; }
            setMachine(res.data);
            if (message) c.say(message);
        } catch { c.say("Não foi possível salvar."); }
    };
    if (!layout) return null;
    const login = machine?.login;
    return (
        <>
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
                    <Seg small label="Densidade" value={densityOf(layout)} onChange={(v) => setLayout({ ...layout, density: v })} options={DENSITIES} />
                    <span className="kx-meta">a altura das linhas das listas</span>
                </FormRow>
                <FormRow k="Disposição">
                    <Btn small onClick={restoreLayout}>Restaurar disposição</Btn>
                    <span className="kx-meta">volta os módulos, a densidade, os tamanhos e a ordem das colunas ao padrão</span>
                </FormRow>
                <FormRow k="Ao fechar">
                    <Switch on={machine ? machine.confirmClose : true} disabled={!system || !machine} label="Perguntar antes de fechar o KERYX"
                        onChange={(on) => change("machineSet", { confirmClose: on }, on ? "O KERYX pergunta antes de fechar." : "Fechar o KERYX não pergunta mais.")} />
                    <span className="kx-meta">fechar tira tudo das telas</span>
                </FormRow>
                <FormRow k="Iniciar com o Windows">
                    <Switch on={Boolean(login?.on)} disabled={!login?.available} label="Abrir o KERYX quando o Windows iniciar"
                        onChange={(on) => change("loginSet", { on }, on ? "O KERYX abre quando o Windows iniciar." : "O KERYX não abre mais sozinho.")} />
                    <span className={login?.blocked ? "kx-warn" : "kx-meta"}>
                        {!login?.available ? "só no KERYX instalado" : login.blocked ? "desativado no Gerenciador de Tarefas do Windows (Inicializar)" : "as saídas com Abrir ao iniciar abrem em tela cheia logo depois"}
                    </span>
                </FormRow>
            </div>
            <CfgKey k="Atalhos" className="listhead"><span className="kx-section">Atalhos <span className="kx-count">· também no ? do console</span></span></CfgKey>
            <div className="cfg-shortcuts"><ShortcutList /></div>
        </>
    );
}
