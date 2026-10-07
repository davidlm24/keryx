import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { readQuickRef, quickRefLabel } from "@/lib/console/quickRef";

// The Bible quick jump, as in Holyrics: the first letter typed in the Bible
// environment opens it, and the operator keeps typing "jo 3 16" — Livro,
// Capítulo, Versículo fill in as they go. Tab (or a click) completes the
// book; Enter opens the reference with the verses selected, ready in the
// Prévia; Enter again sends (the console's own key). Esc cancels — it never
// reaches the console here, so it can't take the projection down.
export default function BibleQuickJump({ initial, onPick, onCancel }) {
    const [text, setText] = useState(initial || "");
    const [active, setActive] = useState(0);
    const input = useRef(null);
    const r = useMemo(() => readQuickRef(text), [text]);
    useEffect(() => { input.current?.focus(); }, []);
    useEffect(() => { setActive(0); }, [r.query]);

    const complete = (name) => {
        const rest = text.slice(text.indexOf(r.query) + r.query.length).trimStart();
        setText(`${name} ${rest}`);
        input.current?.focus();
    };
    const onKey = (e) => {
        if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onCancel(); return; }
        if (e.key === "Tab") {
            e.preventDefault();
            const cand = r.candidates[active];
            if (cand && r.step === "livro") complete(cand.name);
            else if (r.book && !r.chapter) complete(r.book.name);
            return;
        }
        if ((e.key === "ArrowDown" || e.key === "ArrowRight") && r.step === "livro" && r.candidates.length > 1 && e.currentTarget.selectionStart === text.length) {
            e.preventDefault(); setActive((a) => (a + 1) % r.candidates.length); return;
        }
        if ((e.key === "ArrowUp" || e.key === "ArrowLeft") && r.step === "livro" && r.candidates.length > 1 && e.currentTarget.selectionStart === text.length) {
            e.preventDefault(); setActive((a) => (a - 1 + r.candidates.length) % r.candidates.length); return;
        }
        if (e.key === "Enter") {
            e.preventDefault(); e.stopPropagation();
            if (r.valid) { onPick(r); return; }
            const cand = r.book || (r.step === "livro" && r.candidates[active]);
            if (cand && !r.chapter) complete(cand.name);
        }
    };
    const verseText = r.verseStart ? `${r.verseStart}${r.verseEnd && r.verseEnd !== r.verseStart ? `-${r.verseEnd}` : ""}` : "";

    return (
        <>
            <div className="scrim" onMouseDown={onCancel} />
            <div className="kx-pop qj" role="dialog" aria-label="Ir para referência">
                <div className="qj-steps">
                    <div className={`qj-step ${r.step === "livro" ? "is-on" : ""}`} style={{ flex: 2 }}><span className="kx-section">Livro</span><b>{r.book?.name || r.query}</b></div>
                    <div className={`qj-step ${r.step === "capitulo" ? "is-on" : ""}`} style={{ flex: 1 }}><span className="kx-section">Capítulo</span><b>{r.chapter || ""}</b></div>
                    <div className={`qj-step ${r.step === "versiculo" ? "is-on" : ""}`} style={{ flex: 1 }}><span className="kx-section">Versículo</span><b>{verseText}</b></div>
                </div>
                <div className="qj-input">
                    <Icon name="book" />
                    <input ref={input} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} aria-label="Referência" spellCheck={false} autoComplete="off" />
                </div>
                <div className="qj-cands">
                    {r.step === "livro" && r.candidates.map((b, i) => (
                        <button type="button" key={b.name} className={`kx-t ${i === active ? "is-on" : ""}`} onMouseDown={(e) => e.preventDefault()} onClick={() => complete(b.name)}>{b.name}</button>
                    ))}
                    {r.step !== "livro" && r.book && <span>{quickRefLabel(r)} · {r.book.chapters} capítulos{r.chapter ? ` · ${r.book.verses[r.chapter - 1]} versículos no ${r.chapter}` : ""}</span>}
                </div>
                <div className="qj-foot">
                    {r.error ? <span className="err">{r.error}</span> : <span>{r.valid ? "Enter abre na prévia" : r.book ? "Digite o capítulo" : "Tab completa o livro"}</span>}
                    <span className="grow" />
                    <span>Ex.: jo 3 16-18 · 1co 13</span>
                    <span>Esc para cancelar</span>
                </div>
            </div>
        </>
    );
}
