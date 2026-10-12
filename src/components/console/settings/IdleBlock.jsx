import React, { useState } from "react";
import { Btn, Seg } from "../kx";
import { FormRow } from "./parts";
import WallpaperPicker from "../WallpaperPicker";

// Tela ociosa: what the screens show when nothing is on air (the live
// state's idle look: logo, black or a background). It only changes an idle
// screen, never what is on air. Saídas has the same choice.
export default function IdleBlock({ c, media }) {
    const [picking, setPicking] = useState(false);
    const idle = c.live?.idle || "logo";
    const idleUrl = c.live?.idleUrl || null;
    const setIdle = (mode, url) => c.liveOp("idle.set", url ? { mode, url } : { mode }).catch((err) => c.say(err?.message || "Não foi possível mudar a tela ociosa."));
    return (
        <>
            <FormRow k="Tela ociosa">
                <Seg small value={idle} onChange={(m) => { if (m === "background" && !idleUrl) setPicking(true); else { setPicking(false); setIdle(m); } }} options={[["logo", "Logo da igreja"], ["black", "Preto"], ["background", "Fundo"]]} />
                {idle === "background" && idleUrl && <><img className="cfg-wall" src={idleUrl} alt="" /><Btn small onClick={() => setPicking(!picking)}>Trocar…</Btn></>}
                <span className="kx-meta">o que as telas mostram quando nada está no ar · o culto pode ter o seu fundo (Planejar o culto)</span>
            </FormRow>
            {picking && (
                <div className="pl-wallpick">
                    <WallpaperPicker value={idleUrl} media={media} onPick={(url) => { setPicking(false); setIdle("background", url); }} />
                </div>
            )}
        </>
    );
}
