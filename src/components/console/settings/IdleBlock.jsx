import React from "react";
import { Seg } from "../kx";
import { FormRow } from "./parts";
import { setIdleMode } from "@/lib/console/idle";

// Tela ociosa: what the screens show when nothing is on air and there is no
// Fundo (the live state's idle look: the church logo or black). A picture
// for those moments is the Fundo padrão now (Aparência, Planejar o culto),
// which goes on the Fundo itself. Saídas has the same choice.
export default function IdleBlock({ c }) {
    // A wallpaper chosen here before (mode "background") still shows; it
    // reads as Logo until another choice is made.
    const idle = c.live?.idle === "black" ? "black" : "logo";
    const setIdle = (mode) => setIdleMode(c, mode);
    return (
        <FormRow k="Tela ociosa">
            <Seg small value={idle} onChange={setIdle} options={[["logo", "Logo da igreja"], ["black", "Preto"]]} />
            <span className="kx-meta">quando nada está no ar e não há Fundo padrão</span>
        </FormRow>
    );
}
