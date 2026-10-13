import React, { useMemo } from "react";
import { Seg } from "../kx";
import { FormRow, CfgKey, Switch } from "./parts";
import { useUser, usePrefs, updateUser } from "@/hooks/useUser";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { lookDefaults, withLookDefaults } from "@/lib/console/look";
import { groupVerses } from "@/lib/console/bibleVerses";
import BibliasSection from "./BibliasSection";

// The sample passage the preview shows (two verses, so the grouping shows).
const SAMPLE_VERSES = [
    { number: 16, text: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito," },
    { number: 17, text: "para que todo aquele que nele crê não pereça, mas tenha a vida eterna." },
];
const PER_SLIDE = [["auto", "Automático"], ["1", "1"], ["2", "2"], ["3", "3"]];

// Bíblia e músicas: how a passage shows on the screens (verses per slide,
// the reference line, the verse numbers), how the Bíblia lists its books
// and how imported lyrics are cut into slides — the church's preferences,
// in the database — and the installed Bíblias (BibliasSection, this
// computer). The display choices are stamped into a passage when it is
// sent (look.js), like the transition: what is on air does not change.
export default function BibliaSection({ c }) {
    const prefs = usePrefs();
    const user = useUser();
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    const doc = useMemo(() => {
        try {
            const slides = groupVerses(SAMPLE_VERSES, prefs.bible_verses_per_slide);
            const args = withLookDefaults("content.show", { kind: "bible", title: "João 3:16-17 · NVI", slides, style: {} }, lookDefaults(user));
            return applyOp(emptyState(c.now), "content.show", args, c.now);
        } catch { return null; }
    }, [prefs.bible_verses_per_slide, user]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
        <>
            <div className="cfg-outprefs cfg-bible">
                <div className="frm cfg-outprefs-form">
                    <FormRow k="Versículos por slide">
                        <Seg small label="Versículos por slide" value={prefs.bible_verses_per_slide} options={PER_SLIDE}
                            onChange={(v) => save({ bible_verses_per_slide: v }, v === "auto" ? "Versículos por slide: pelo tamanho do texto." : `${v} ${v === "1" ? "versículo" : "versículos"} por slide.`)} />
                        <span className="kx-meta">um versículo só vai com o capítulo inteiro, um por slide</span>
                    </FormRow>
                    <FormRow k="Referência">
                        <Switch on={prefs.bible_show_reference} onChange={(on) => save({ bible_show_reference: on }, on ? "A referência aparece nas telas." : "Sem referência nas telas.")} label="Mostrar a referência" />
                        <span className="kx-meta">João 3:16 embaixo do texto</span>
                    </FormRow>
                    <FormRow k="Versão na referência">
                        <Switch on={prefs.bible_show_reference && prefs.bible_show_version} disabled={!prefs.bible_show_reference} onChange={(on) => save({ bible_show_version: on }, on ? "A versão aparece com a referência." : "A referência sem a versão.")} label="Mostrar a versão na referência" />
                        <span className="kx-meta">João 3:16 · NVI</span>
                    </FormRow>
                    <FormRow k="Números dos versículos">
                        <Seg small label="Números dos versículos" value={prefs.bible_verse_numbers} options={[["sup", "Pequenos"], ["hide", "Ocultos"]]}
                            onChange={(v) => save({ bible_verse_numbers: v }, v === "hide" ? "Números dos versículos ocultos." : "Números dos versículos no texto.")} />
                    </FormRow>
                </div>
                <div className="cfg-prevcol">
                    <div className="cfg-prev"><div className="cfg-prev-fill">{doc && <ScreenRenderer fill state={doc} now={c.now} preview audio={false} />}</div></div>
                    <span className="kx-meta">Exemplo</span>
                </div>
            </div>
            <CfgKey k="Livros e importação" className="listhead"><span className="kx-section">Livros e importação</span></CfgKey>
            <div className="frm">
                <FormRow k="Livros da Bíblia">
                    <Seg small value={prefs.bible_book_names} onChange={(v) => save({ bible_book_names: v }, v === "full" ? "Livros com o nome inteiro." : "Livros abreviados.")}
                        options={[["short", "Abreviados"], ["full", "Nome inteiro"]]} />
                    <span className="kx-meta">no seletor da Bíblia</span>
                </FormRow>
                <FormRow k="Ao importar letras">
                    <Seg small value={String(prefs.import_lines)} onChange={(v) => save({ import_lines: Number(v) }, "Corte das letras importadas salvo.")}
                        options={[["0", "Estrofe"], ["2", "2 linhas"], ["4", "4 linhas"]]} />
                                    </FormRow>
            </div>
            <CfgKey k="Bíblias instaladas" className="listhead"><span className="kx-section">Bíblias instaladas</span></CfgKey>
            <BibliasSection c={c} />
        </>
    );
}
