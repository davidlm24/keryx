import React, { useState } from "react";
import { Seg } from "../kx";
import { IMPORT_LINES_KEY, importLines } from "@/lib/songImport";
import { FormRow } from "./parts";

// Letras: how imported lyrics are cut into slides. (The web search,
// electron/lyrics.cjs, needs no setting.)
export default function LetrasSection() {
    const [lines, setLines] = useState(() => String(importLines()));
    const pickLines = (v) => {
        setLines(v);
        try { localStorage.setItem(IMPORT_LINES_KEY, v); } catch { /* not remembered */ }
    };

    return (
        <>
            <div className="frm">
                <FormRow k="Ao importar">
                    <Seg small value={lines} onChange={pickLines} options={[["0", "Estrofe inteira"], ["2", "2 linhas por slide"], ["4", "4 linhas por slide"]]} />
                </FormRow>
            </div>
            <div className="listhead"><span className="kx-meta">"+ › Na internet" busca no LRCLIB e no letras.mus.br. Os do LRCLIB trazem a letra direto, sem chave; os do letras.mus.br abrem no navegador para copiar e colar.</span></div>
        </>
    );
}
