import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { remoteCall } from "@/lib/console/remoteClient";
import { BIBLE_SECTIONS, bibleArgs, bibleVersions, bookOf, fieldBook, fieldRef, refLabel, tapVerse } from "@/lib/network/remoteView";
import { Cmd, Sheet } from "./parts";

// Bíblia: type the reference ("jo 3 16" works, as on the console) or pick it,
// books → chapters → verses (bibleBooks.js, no request), a range with a tap
// on the first verse and one on the last. The text is the console's
// (`bibleFind`, the edition chosen there unless the chip picks another), and
// the sticky "Enviar João 3:16-18 · NVI" sends it; a chapter alone goes whole.
export default function BibleTab({ state, c }) {
    const versions = bibleVersions(state?.bible);
    const [version, setVersion] = useState("");
    const shownVersion = version || state?.bible?.version || versions[0]?.id || "";
    const [field, setField] = useState("");
    const [ref, setRef] = useState(null);
    const [step, setStep] = useState("book");
    const [found, setFound] = useState(null);
    const [finding, setFinding] = useState(false);
    const [picking, setPicking] = useState(false);
    const seq = useRef(0);

    // Typing: a reference read as typed moves the picker there.
    const type = (text) => {
        setField(text);
        const r = fieldRef(text);
        if (r) { setRef(r); setStep("verse"); return; }
        // Only the book so far: its chapters.
        const b = fieldBook(text);
        setRef(b ? { book: b, chapter: null, verseStart: null, verseEnd: null } : null);
        if (b) setStep("chapter");
    };
    // Picking: the field follows.
    const pickRef = (r, nextStep) => { setRef(r); setField(r ? refLabel(r) : ""); if (nextStep) setStep(nextStep); };

    // The text of what is chosen, a moment after it stops changing; an
    // answer for an older choice is dropped.
    const key = ref?.chapter ? JSON.stringify(bibleArgs(ref, version)) : "";
    useEffect(() => {
        setFound(null);
        if (!ref?.chapter) return undefined;
        const id = ++seq.current;
        const t = setTimeout(async () => {
            setFinding(true);
            const r = await remoteCall("bibleFind", bibleArgs(ref, version));
            if (id !== seq.current) return;
            setFinding(false);
            setFound(r.ok ? { ...r.result, ok: true } : { ok: false, message: r.message });
        }, 350);
        return () => clearTimeout(t);
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- key is ref and version

    const book = ref ? bookOf(ref.book) : null;
    const label = ref ? refLabel(ref) : "";
    const sendVersion = found?.ok ? found.version || shownVersion : shownVersion;

    return (
        <div className="rm-main">
            <label className="rm-field">
                <Icon name="book" size={20} />
                <input value={field} onChange={(e) => type(e.target.value)} placeholder="Referência (jo 3 16)" aria-label="Referência" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="done" maxLength={40} />
            </label>
            <p className="rm-hint is-left" aria-live="polite">
                {field.trim() && !ref ? "Não entendi. Escreva como “jo 3 16” ou “Jo 3:16-18”."
                    : ref && !ref.chapter ? <><b>{ref.book}</b> · escolha o capítulo</>
                        : ref ? <><b>{label}</b>{ref.verseStart == null ? " · capítulo inteiro" : ""} · {shownVersion}</>
                            : "Escreva a referência ou escolha abaixo."}
            </p>
            <div className="rm-crumbrow">
                <nav className="rm-crumb" aria-label="Onde está">
                    <button type="button" onClick={() => setStep("book")} aria-current={step === "book" || undefined}>Livros</button>
                    {book && <>›<button type="button" onClick={() => setStep("chapter")} aria-current={step === "chapter" || undefined}>{book.name}</button></>}
                    {book && ref?.chapter && step === "verse" && <>›<span>{ref.chapter}</span></>}
                </nav>
                {versions.length > 1 && <button type="button" className="rm-chip is-sm" onClick={() => setPicking(true)} aria-label={`Versão: ${shownVersion}`}>{shownVersion} ▾</button>}
            </div>

            {step === "book" && BIBLE_SECTIONS.map(([name, books]) => (
                <section key={name} aria-label={name}>
                    <h2 className="rm-sec">{name}</h2>
                    <div className="rm-grid">
                        {books.map((b) => (
                            <button key={b.name} type="button" className={book?.name === b.name ? "is-sel" : ""} aria-label={b.name} onClick={() => pickRef(b.chapters === 1 ? { book: b.name, chapter: 1, verseStart: null, verseEnd: null } : { book: b.name, chapter: null, verseStart: null, verseEnd: null }, b.chapters === 1 ? "verse" : "chapter")}>{b.short}</button>
                        ))}
                    </div>
                </section>
            ))}
            {step === "chapter" && book && (
                <div className="rm-grid">
                    {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
                        <button key={n} type="button" className={ref?.chapter === n ? "is-sel" : ""} onClick={() => pickRef({ book: book.name, chapter: n, verseStart: null, verseEnd: null }, "verse")}>{n}</button>
                    ))}
                </div>
            )}
            {step === "verse" && book && ref?.chapter && (
                <div className="rm-grid">
                    {Array.from({ length: book.verses[ref.chapter - 1] || 0 }, (_, i) => i + 1).map((n) => {
                        const inRange = ref.verseStart != null && n >= ref.verseStart && n <= ref.verseEnd;
                        const edge = n === ref.verseStart || n === ref.verseEnd;
                        return <button key={n} type="button" className={inRange ? (edge ? "is-sel" : "is-range") : ""} aria-pressed={inRange} onClick={() => pickRef(tapVerse(ref, n))}>{n}</button>;
                    })}
                </div>
            )}

            {ref?.chapter && (finding || found) && (
                <div className="rm-card">
                    <span className="rm-k">{found?.ok ? `${found.reference} · ${found.version}` : "Texto"}</span>
                    <span className={`rm-v is-prose ${found && !found.ok ? "is-bad" : ""}`}>{finding && !found ? "Buscando no computador…" : found?.ok ? found.text : found?.message}</span>
                </div>
            )}

            <div className="rm-sticky">
                {ref?.chapter
                    ? <Cmd c={c} k="bibleSend" action="bibleSend" args={bibleArgs(ref, version)} className="is-go is-wide" disabled={found ? !found.ok : false} then={() => { setField(""); setRef(null); setStep("book"); }}>Enviar {label} · {sendVersion}</Cmd>
                    : <p className="rm-hint">Escolha o livro e o capítulo.</p>}
                {ref?.chapter && step === "verse" && <p className="rm-hint">Toque num versículo; toque em outro para fazer um intervalo.</p>}
            </div>

            {picking && (
                <Sheet title="Versão" onClose={() => setPicking(false)}>
                    <div className="rm-list">
                        {versions.map((v) => (
                            <button key={v.id} type="button" className={`rm-item ${v.id === shownVersion ? "is-sel" : ""}`} onClick={() => { setVersion(v.id === state?.bible?.version ? "" : v.id); setPicking(false); }}>
                                <span className="rm-item-t"><b>{v.id}</b><small>{v.installed ? "Instalada no computador" : "Pela internet"}</small></span>
                                {v.id === state?.bible?.version && <span className="rm-tag">a do console</span>}
                            </button>
                        ))}
                    </div>
                </Sheet>
            )}
        </div>
    );
}
