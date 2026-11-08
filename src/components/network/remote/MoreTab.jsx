import React from "react";
import Icon from "@/components/console/Icon";
import { allowed, SWAP_TO } from "@/lib/network/remoteView";
import { Toggle } from "./parts";
import { SendLaunchers } from "./liveParts";

// Mais, only the rare things (owner 2026-11-08, "mais simples" N6 = A):
// Enviar (Aviso, Timer — the slides are No ar's), Na tela (the main text,
// the logo in the corner, the Fundo while there is one; owner 2026-10-28,
// K5 = A: the Vídeo switch never worked), this phone's own (its name when
// paired, Travar toques, Manter a tela ligada, Entrar como Equipe…), then
// Sobre (the version, Atualizar, Adicionar à tela inicial). Tela preta,
// Logo, Limpar and Travar telas are the header's Telas button (N2 = A).
export default function MoreTab({ live, state, caps, c, touchLock, awake, onRefresh }) {
    const hidden = live?.hiddenLayers || [];
    // A layer's switch: on = shown now; a tap asks for the other.
    const layer = (which, shown, key = `layer-${which}`) => {
        const args = { which, on: !shown };
        // The corner logo is refused both ways while locked (logo.set, the contract).
        const off = !allowed("layer", args, c.flags) || (which === "corner" && c.flags.locked);
        return { on: shown, disabled: off, busy: c.busy.has(key), onChange: () => c.run(key, "layer", args) };
    };
    const device = state?.device?.name || "";
    return (
        <div className="rm-main">
            <SendLaunchers live={live} state={state} caps={caps} c={c} slides={false} top />

            {caps.has("layers") && (
                <>
                    <h2 className="rm-sec">Na tela</h2>
                    <Toggle title="Texto principal" sub="A letra ou o versículo no ar" {...layer("text", !hidden.includes("content"))} />
                    <Toggle title="Logo no canto" sub="O logo da igreja sobre a tela" {...layer("corner", Boolean(live?.logo?.visible))} />
                    {live?.background && <Toggle title="Fundo" sub="O papel de parede ou o fundo do item" {...layer("bg", !hidden.includes("background"))} />}
                </>
            )}

            <h2 className="rm-sec">Este celular</h2>
            {/* Este aparelho (M5 = A): a phone paired by QR is told its name (lan.cjs). */}
            {device && (
                <div className="rm-row2">
                    <Icon name="tablet" size={20} />
                    <span className="rm-row2-t"><b>{device}</b><small>Controle · conectado a este computador</small></span>
                </div>
            )}
            <Toggle title="Travar toques" sub="Evita toques no bolso. Segure para liberar." on={touchLock.on} onChange={touchLock.lock} />
            <Toggle
                title="Manter a tela ligada"
                sub="Toca um vídeo escondido e gasta bateria. Ou, nos ajustes do celular: Bloqueio automático: Nunca."
                on={awake.on}
                onChange={() => (awake.on ? awake.stop() : awake.start())}
            />
            {/* To the Equipe (owner 2026-10-30, C = A): its own code, never this one's. */}
            <a className="rm-row2 rm-swap-row" href={SWAP_TO.team}>
                <span className="rm-row2-t"><b>Entrar como Equipe…</b><small>Pedidos, chat e letras, com o código da equipe.</small></span>
            </a>

            <h2 className="rm-sec">Sobre</h2>
            <div className="rm-row2">
                <span className="rm-row2-t">
                    <b>KERYX {state?.app || ""}</b>
                    {!device && <small>Ligado com o código da igreja. <a href="/lan/remote-code">Digitar o código de novo</a></small>}
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
