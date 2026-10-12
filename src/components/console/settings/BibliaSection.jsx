import React from "react";
import { Seg } from "../kx";
import { FormRow, CfgKey } from "./parts";
import { usePrefs, updateUser } from "@/hooks/useUser";
import BibliasSection from "./BibliasSection";

// Bíblia e músicas: how the Bíblia lists its books, how imported lyrics are
// cut into slides (the church's preferences, in the database) and the
// installed Bíblias (BibliasSection, this computer).
export default function BibliaSection({ c }) {
    const prefs = usePrefs();
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    return (
        <>
            <div className="frm">
                <FormRow k="Livros da Bíblia">
                    <Seg small value={prefs.bible_book_names} onChange={(v) => save({ bible_book_names: v }, v === "full" ? "Livros com o nome inteiro." : "Livros abreviados.")}
                        options={[["short", "Abreviados"], ["full", "Nome inteiro"]]} />
                    <span className="kx-meta">como os livros aparecem no seletor da Bíblia (Gn ou Gênesis)</span>
                </FormRow>
                <FormRow k="Ao importar letras">
                    <Seg small value={String(prefs.import_lines)} onChange={(v) => save({ import_lines: Number(v) }, "Corte das letras importadas salvo.")}
                        options={[["0", "Estrofe"], ["2", "2 linhas"], ["4", "4 linhas"]]} />
                    <span className="kx-meta">cada slide de uma letra importada (arquivo ou internet) tem uma estrofe, ou 2 ou 4 linhas</span>
                </FormRow>
            </div>
            <CfgKey k="Bíblias instaladas" className="listhead"><span className="kx-section">Bíblias instaladas</span></CfgKey>
            <BibliasSection c={c} />
        </>
    );
}
