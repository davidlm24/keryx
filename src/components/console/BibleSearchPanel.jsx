import React, { useCallback, useEffect, useRef, useState } from "react";
import { Field, Seg, Empty } from "./kx";
import { bibleBooks } from "@/lib/bibleBooks";
import { searchBible } from "@/lib/bibleText";
import { highlightParts, scopeBooks, SCOPES } from "@/lib/bibleSearch";

// The word search of the Bíblia environment: the query, where to look, and
// the verses found (installed Bíblias only; src/lib/bibleText.js). Held by
// BibleEnv so ↑/↓ can walk the results.
export function useBibleSearch(version, book) {
    const [q, setQ] = useState("");
    const [scope, setScope] = useState("all");
    const [result, setResult] = useState(null); // { version, terms, total, verses, short }
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const seq = useRef(0);
    const run = useCallback(async (query = q, where = scope) => {
        const text = String(query || "").trim();
        if (!text) { setResult(null); setError(""); return; }
        const n = ++seq.current;
        setBusy(true);
        setError("");
        try {
            const r = await searchBible(text, version, { books: scopeBooks(where, bibleBooks, book) });
            if (n !== seq.current) return;
            if (r === null) { setError("A busca por palavra usa uma Bíblia instalada: funciona no KERYX do computador."); setResult(null); }
            else setResult(r);
        } catch (err) {
            if (n === seq.current) { setError(err?.message || "Não foi possível buscar."); setResult(null); }
        } finally {
            if (n === seq.current) setBusy(false);
        }
    }, [q, scope, version, book]);
    return { q, setQ, scope, setScope, result, busy, error, run };
}

// Results: reference, the verse with the words marked. A click selects the
// verse (its chapter opens behind, the selection turns green), a double
// click projects from it, ↑/↓ walk the list.
export default function BibleSearchPanel({ search, selected, onPick, onSend, inputRef }) {
    const { q, setQ, scope, setScope, result, busy, error, run } = search;
    const listRef = useRef(null);
    const isSel = (r) => selected && selected.book === r.book && Number(selected.chapter) === Number(r.chapter) && Number(selected.verse) === Number(r.verse);
    useEffect(() => {
        listRef.current?.querySelector(".kx-verse.is-prev")?.scrollIntoView({ block: "nearest" });
    }, [selected]);
    return (
        <div className="bs">
            <div className="bs-bar">
                <Field inputRef={inputRef} value={q} onChange={setQ} placeholder='Palavra ou frase · "entre aspas" para a frase exata' onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); run(); } }} kbd="Enter" style={{ flex: 1, minWidth: 200 }} />
                <Seg small value={scope} onChange={(v) => { setScope(v); if (q.trim()) run(q, v); }} options={SCOPES} />
            </div>
            <div className="listhead bs-status">
                <span className="kx-meta">
                    {busy ? "Buscando…"
                        : error ? ""
                            : !result ? "Todas as palavras, sem diferença de acentos ou maiúsculas."
                                : result.short ? "Digite ao menos uma palavra de 3 letras."
                                    : `${result.total} ${result.total === 1 ? "versículo" : "versículos"} na ${result.version}${result.total > result.verses.length ? ` · mostrando os ${result.verses.length} primeiros` : ""}`}
                </span>
            </div>
            <div className="bs-list" ref={listRef}>
                {error && <Empty icon="warn" title="Busca indisponível">{error}</Empty>}
                {result && !result.short && !result.total && !busy && <Empty icon="search" title="Nada encontrado">Tente outra palavra, tire uma delas ou mude para Toda a Bíblia.</Empty>}
                {result?.verses.map((r) => (
                    <button type="button" key={`${r.book}${r.chapter}:${r.verse}`} className={`kx-verse kx-t bs-hit ${isSel(r) ? "is-prev" : ""}`}
                        onClick={() => onPick(r)} onDoubleClick={() => onSend(r)} title="Clique seleciona · 2 cliques projetam a partir deste versículo">
                        <span className="bs-ref">{r.book} {r.chapter}:{r.verse}</span>
                        <span>{highlightParts(r.text, result.terms).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>))}</span>
                    </button>
                ))}
            </div>
        </div>
    );
}
