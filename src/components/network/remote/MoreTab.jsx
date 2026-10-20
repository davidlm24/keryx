import React from "react";
import Icon from "@/components/console/Icon";
import { UNLOCK_HOLD_MS } from "@/lib/console/remoteClient";
import { allowed } from "@/lib/network/remoteView";
import { Cmd, HoldButton, Toggle } from "./parts";

// Mais: Travar telas (a tap; destravar is held, owner's pick "segurar"),
// Camadas (the main text, the logo in the corner, the video screens), and
// this phone's own: Travar toques, Manter a tela ligada, the version.
export default function MoreTab({ live, state, caps, c, touchLock, awake, onRefresh }) {
    const locked = Boolean(live?.locked);
    const hidden = live?.hiddenLayers || [];
    // A layer's switch: on = shown now; a tap asks for the other.
    const layer = (which, shown, key = `layer-${which}`) => {
        const args = { which, on: !shown };
        // The corner logo is refused both ways while locked (logo.set, the contract).
        const off = !allowed("layer", args, c.flags) || (which === "corner" && c.flags.locked);
        return { on: shown, disabled: off, busy: c.busy.has(key), onChange: () => c.run(key, "layer", args) };
    };
    return (
        <div className="rm-main">
            {caps.has("lock") && (locked
                ? (
                    <>
                        <div className="rm-row2"><span className="rm-row2-t"><b>Telas travadas</b><small>Nada novo vai ao ar. Segure 1 s para destravar.</small></span></div>
                        <HoldButton ms={UNLOCK_HOLD_MS} label="Segure para destravar" icon="unlock" onDone={() => c.run("lock", "lock", { locked: false })} />
                    </>
                )
                : (
                    <>
                        <div className="rm-row2"><span className="rm-row2-t"><b>Travar telas</b><small>Nada novo vai ao ar. Tela preta, Logo e Limpar continuam.</small></span></div>
                        <Cmd c={c} action="lock" args={{ locked: true }}><Icon name="lock" size={20} />Travar telas</Cmd>
                    </>
                ))}

            {caps.has("layers") && (
                <>
                    <h2 className="rm-sec">Camadas</h2>
                    <Toggle title="Texto principal" sub="A letra ou o versículo no ar" {...layer("text", !hidden.includes("content"))} />
                    <Toggle title="Logo no canto" sub="O logo da igreja sobre a tela" {...layer("corner", Boolean(live?.logo?.visible))} />
                    {live?.video && <Toggle title="Vídeo" sub="O vídeo nas telas de vídeo" {...layer("video", !hidden.includes("video"))} />}
                </>
            )}

            <h2 className="rm-sec">Este celular</h2>
            <Toggle title="Travar toques" sub="Evita toques no bolso. Segure para liberar." on={touchLock.on} onChange={touchLock.lock} />
            <Toggle
                title="Manter a tela ligada"
                sub="Toca um vídeo escondido e gasta bateria. Ou, nos ajustes do celular: Bloqueio automático: Nunca."
                on={awake.on}
                onChange={() => (awake.on ? awake.stop() : awake.start())}
            />
            <div className="rm-row2">
                <span className="rm-row2-t">
                    <b>KERYX {state?.app || ""}</b>
                    <small>Controle remoto ligado com o código da igreja. <a href="/lan/remote-code">Digitar o código de novo</a></small>
                </span>
                <button type="button" className="rm-b is-sm" onClick={onRefresh}><Icon name="refresh" size={18} />Atualizar</button>
            </div>
            <details className="rm-install">
                <summary>Adicionar à tela inicial</summary>
                <p><b>Android (Chrome):</b> menu ⋮ › <em>Adicionar à tela inicial</em>.</p>
                <p><b>iPhone (Safari):</b> Compartilhar › <em>Adicionar à Tela de Início</em>. Ao abrir pelo ícone, a tela fica sem a barra de endereço.</p>
                <small>É um atalho seguro para o endereço da igreja. A instalação completa e o uso offline exigem HTTPS e ainda não estão disponíveis.</small>
            </details>
        </div>
    );
}
