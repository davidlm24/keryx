import React from "react";
import { Btn, Seg } from "../kx";
import { FormRow } from "./parts";
import { useLibraryPicker } from "../library/libraryContext";
import { updateUser } from "@/hooks/useUser";

// Tela ociosa: what the screens show when nothing is on air (the live
// state's idle look: logo, black or a background). It only changes an idle
// screen, never what is on air. Saídas has the same choice.
export default function IdleBlock({ c }) {
    const pick = useLibraryPicker();
    const idle = c.live?.idle || "logo";
    const idleUrl = c.live?.idleUrl || null;
    const setIdle = (mode, url) => {
        updateUser({ idle_mode: mode }).catch(() => {});
        return c.liveOp("idle.set", url ? { mode, url } : { mode }).catch((err) => c.say(err?.message || "Não foi possível mudar a tela ociosa."));
    };
    // The wallpaper comes from the background library (pictures only).
    const chooseWall = async () => {
        const r = await pick({ accept: ["image"], value: idleUrl ? { kind: "image", value: idleUrl } : null, title: "Fundo da tela ociosa" });
        if (r?.spec) setIdle("background", r.spec.value);
    };
    return (
        <FormRow k="Tela ociosa">
            <Seg small value={idle} onChange={(m) => { if (m === "background" && !idleUrl) chooseWall(); else setIdle(m); }} options={[["logo", "Logo da igreja"], ["black", "Preto"], ["background", "Fundo"]]} />
            {idle === "background" && idleUrl && <><img className="cfg-wall" src={idleUrl} alt="" /><Btn small onClick={chooseWall}>Trocar…</Btn></>}
            <span className="kx-meta">o que as telas mostram quando nada está no ar · o culto pode ter o seu fundo (Planejar o culto)</span>
        </FormRow>
    );
}
