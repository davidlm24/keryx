import React, { useState } from "react";
import { Btn, Field, Seg } from "../kx";
import { IMPORT_LINES_KEY, importLines } from "@/lib/songImport";
import { useBridge, usePoll, FormRow } from "./parts";

// Letras: the church's Vagalume key (web search, electron/lyrics.cjs) and
// how imported lyrics are cut into slides.
export default function LetrasSection({ c }) {
    const lyrics = useBridge("lyrics");
    const [status, refresh] = usePoll(() => lyrics?.call("status"), 0);
    const [key, setKey] = useState("");
    const [lines, setLines] = useState(() => String(importLines()));
    const saveKey = async (value) => {
        if (!lyrics) { c.say("A busca na internet funciona no KERYX do computador."); return; }
        const res = await lyrics.call("setKey", value);
        if (res?.error) { c.say(res.error.message); return; }
        c.say(value ? "Chave do Vagalume salva." : "Chave do Vagalume removida.");
        setKey("");
        refresh();
    };
    const pickLines = (v) => {
        setLines(v);
        try { localStorage.setItem(IMPORT_LINES_KEY, v); } catch { /* not remembered */ }
    };

    return (
        <>
            <div className="frm">
                <FormRow k="Chave do Vagalume">
                    <Field icon={null} value={key} onChange={setKey} placeholder={status?.hasKey ? "Chave salva · cole outra para trocar" : "Cole a chave da API do Vagalume"} onKeyDown={(e) => { if (e.key === "Enter" && key.trim()) saveKey(key.trim()); }} style={{ maxWidth: 420 }} />
                    <Btn kind="brand" disabled={!key.trim()} onClick={() => saveKey(key.trim())}>Salvar</Btn>
                    {status?.hasKey && <Btn onClick={() => saveKey("")}>Remover</Btn>}
                    <span className={status?.hasKey ? "kx-prev" : "kx-meta"}>{status?.hasKey ? "Ativa" : "Sem chave"}</span>
                </FormRow>
                <FormRow k="Ao importar">
                    <Seg small value={lines} onChange={pickLines} options={[["0", "Estrofe inteira"], ["2", "2 linhas por slide"], ["4", "4 linhas por slide"]]} />
                </FormRow>
            </div>
            <div className="listhead"><span className="kx-meta">Com a chave, "+ › Na internet" traz a letra direto do Vagalume. Sem ela, a busca mostra os resultados do letras.mus.br, que abrem no navegador para copiar e colar. A chave é grátis em vagalume.com.br/api e fica só neste computador.</span></div>
        </>
    );
}
