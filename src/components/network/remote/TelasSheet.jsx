import React from "react";
import Icon from "@/components/console/Icon";
import { UNLOCK_HOLD_MS } from "@/lib/console/remoteClient";
import { canRun, onAirNow } from "@/lib/network/remoteView";
import { Cmd, HoldButton, Sheet } from "./parts";

// Telas (owner 2026-11-08, "mais simples" N2 = A; replaced Mais' Telas block
// of the 07/11 vistoria): the header's button opens this sheet, in reach of
// the thumb from any section — Tela preta, Logo, Limpar, then Travar telas
// (a tap; destravar is held, the owner's "segurar"). Loaded on first open.
export default function TelasSheet({ live, caps, c, onClose }) {
    const screen = live?.screen || "show";
    const locked = Boolean(live?.locked);
    return (
        <Sheet title="Telas" onClose={onClose}>
            {canRun(caps, "black") && (
                <div className="rm-screen">
                    <Cmd c={c} action="black" args={{ on: screen !== "black" }} className={`rm-act ${screen === "black" ? "is-on" : ""}`} pressed={screen === "black"}><Icon name="black" size={22} />Tela preta</Cmd>
                    <Cmd c={c} action="logo" args={{ on: screen !== "logo" }} className={`rm-act ${screen === "logo" ? "is-on" : ""}`} pressed={screen === "logo"}><Icon name="logo" size={22} />Logo</Cmd>
                    <Cmd c={c} action="clear" className="rm-act" disabled={!onAirNow(live)}><Icon name="eraser" size={22} />Limpar</Cmd>
                </div>
            )}
            {caps.has("lock") && (locked
                ? (
                    <>
                        <p className="rm-hint is-left">Telas travadas: nada novo vai ao ar. Segure para destravar.</p>
                        <HoldButton ms={UNLOCK_HOLD_MS} label="Segure para destravar" icon="unlock" onDone={() => c.run("lock", "lock", { locked: false })} />
                    </>
                )
                : (
                    <>
                        <p className="rm-hint is-left">Travar telas: nada novo vai ao ar. Tela preta, Logo e Limpar continuam.</p>
                        <Cmd c={c} action="lock" args={{ locked: true }}><Icon name="lock" size={20} />Travar telas</Cmd>
                    </>
                ))}
            <button type="button" className="rm-b is-sm" onClick={onClose}>Fechar</button>
        </Sheet>
    );
}
