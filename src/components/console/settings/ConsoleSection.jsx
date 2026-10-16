import React, { useEffect, useState } from "react";
import { Btn, Seg } from "../kx";
import { FormRow, Switch, CfgKey, useBridge } from "./parts";
import ShortcutList from "../ShortcutList";
import { MODULES, DENSITIES, densityOf } from "@/lib/console/layout";
import { relaySend } from "@/lib/janelaRelay";
import { LETTER_KEYS, LETTER_KEYS_HINT, letterKeys } from "@/lib/console/keys";
import { usePrefs, updateUser } from "@/hooks/useUser";

// The console's zoom steps (electron/consoleZoom.cjs ZOOM_STEPS).
const ZOOMS = [[0.9, "90 %"], [1, "100 %"], [1.1, "110 %"], [1.25, "125 %"], [1.5, "150 %"]].map(([z, l]) => [String(z), l]);

// Console: the operator's screen and this computer. The density is the
// church's (it rides backups); which modules show (the culto's tray), the
// sizes and the arrangement are this computer's, and so are "Ao fechar" and
// "Iniciar com o Windows" (settings.json, electron/closeGuard.cjs). The Ver
// menu keeps its quick toggles.
export default function ConsoleSection({ c, layout, setLayout, restoreLayout }) {
    const system = useBridge("system");
    const [machine, setMachine] = useState(null);
    useEffect(() => {
        let alive = true;
        system?.call("machineGet").then((res) => { if (alive && res?.data) setMachine(res.data); }).catch(() => {});
        // Ctrl+= / Ctrl+− / Ctrl+0 change it from the keyboard too.
        const off = system?.onZoom?.((zoom) => { if (alive) setMachine((m) => (m ? { ...m, zoom } : m)); });
        return () => { alive = false; off?.(); };
    }, [system]);
    const letters = letterKeys(usePrefs().letter_keys);
    const setLetters = (v) => updateUser({ letter_keys: v })
        .then(() => c.say(v === "on" ? "As teclas de uma letra agem sozinhas." : v === "shift" ? "As teclas de uma letra agora pedem Shift." : "As teclas de uma letra estão desligadas."))
        .catch(() => c.say("Não foi possível salvar."));
    const change = async (op, args, message) => {
        try {
            const res = await system.call(op, args);
            if (res?.error) { c.say(res.error.message); return; }
            setMachine(res.data);
            if (message) c.say(message);
        } catch { c.say("Não foi possível salvar."); }
    };
    // Detached (/Janela, Rodada F5): the arrangement is the console's own
    // state, so its rows open there; the rest of this computer's settings stay.
    if (!layout && !c.detached) return null;
    const login = machine?.login;
    const inConsole = () => { if (relaySend("janela", "console.open", { what: "settings", section: "console" })) c.say("Configurações › Console abriu no console."); };
    return (
        <>
            <div className="frm">
                {!layout && <FormRow k="Disposição">
                    <Btn small onClick={inConsole}>Abrir no console</Btn>
                    <span className="kx-meta">os módulos, a densidade e a disposição são do console · ajuste-os lá</span>
                </FormRow>}
                {layout && <><FormRow k="Módulos">
                    {MODULES.map(([key, name]) => (
                        <span key={key} className="cfg-launch">
                            <Switch on={!layout.hidden[key]} onChange={(on) => setLayout({ ...layout, hidden: { ...layout.hidden, [key]: !on } })} label={`Mostrar ${name}`} />
                            <span className="kx-meta">{name}</span>
                        </span>
                    ))}
                    <span className="kx-meta">deste computador</span>
                </FormRow>
                <FormRow k="Densidade">
                    <Seg small label="Densidade" value={densityOf(layout)} onChange={(v) => setLayout({ ...layout, density: v })} options={DENSITIES} />
                    <span className="kx-meta">a altura das linhas das listas · da igreja, viaja no backup</span>
                </FormRow>
                <FormRow k="Disposição">
                    <Btn small onClick={restoreLayout}>Restaurar disposição</Btn>
                    <span className="kx-meta">volta os módulos, a densidade, os tamanhos e a ordem das colunas ao padrão · deste computador</span>
                </FormRow></>}
                <FormRow k="Teclas de uma letra">
                    <Seg small label="Teclas de uma letra" value={letters} onChange={setLetters} options={LETTER_KEYS} />
                    <span className="kx-meta">{LETTER_KEYS_HINT[letters]} · da igreja, viaja no backup</span>
                </FormRow>
                <FormRow k="Zoom">
                    <Seg small label="Zoom do console" value={String(machine?.zoom ?? 1)} options={ZOOMS.map(([v, l]) => [v, l, machine?.zoom === undefined ? { disabled: true } : undefined])}
                        onChange={(v) => machine?.zoom !== undefined && change("machineSet", { zoom: Number(v) })} />
                    <span className="kx-meta">{machine?.zoom === undefined ? "só no aplicativo" : "tudo no console maior ou menor · Ctrl+= Ctrl+− Ctrl+0 ou Ctrl+roda · as saídas não mudam · deste computador"}</span>
                </FormRow>
                <FormRow k="Ao fechar">
                    <Switch on={machine ? machine.confirmClose : true} disabled={!system || !machine} label="Perguntar antes de fechar o KERYX"
                        onChange={(on) => change("machineSet", { confirmClose: on }, on ? "O KERYX pergunta antes de fechar." : "Fechar o KERYX não pergunta mais.")} />
                    <span className="kx-meta">fechar tira tudo das telas · deste computador</span>
                </FormRow>
                <FormRow k="Iniciar com o Windows">
                    <Switch on={Boolean(login?.on)} disabled={!login?.available} label="Abrir o KERYX quando o Windows iniciar"
                        onChange={(on) => change("loginSet", { on }, on ? "O KERYX abre quando o Windows iniciar." : "O KERYX não abre mais sozinho.")} />
                    <span className={login?.blocked ? "kx-warn" : "kx-meta"}>
                        {!login?.available ? "só no KERYX instalado" : login.blocked ? "desativado no Gerenciador de Tarefas do Windows (Inicializar)" : "as saídas com Abrir ao iniciar abrem em tela cheia logo depois · deste computador"}
                    </span>
                </FormRow>
            </div>
            <CfgKey k="Atalhos" className="listhead"><span className="kx-section">Atalhos <span className="kx-count">· {letters === "off" ? "também no menu do logo, Atalhos do teclado" : "também no ? do console"}</span></span></CfgKey>
            <div className="cfg-shortcuts"><ShortcutList /></div>
        </>
    );
}
