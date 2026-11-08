import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { remoteCall } from "@/lib/console/remoteClient";
import { BIBLE_SECTIONS, bibleArgs, bibleOnAir, biblePlanArgs, bibleVersions, bookOf, canRun, chapterArgs, fieldBook, fieldRef, refLabel, tapVerse, verseRows } from "@/lib/network/remoteView";
import { Cmd, SendBar, Sheet } from "./parts";

// Bíblia (owner 2026-10-28, M4 = A): the chapter's text takes the screen,
// verse by verse — a tap marks one, a tap on another makes the range — and a
// compact bar at the bottom says where it is: Livro ▾ · Capítulo ▾ · Versão ▾
// and the lupa, each opening the "Escolher a passagem" sheet (the reference
// typed as on the console, "jo 3 16", or the books → chapters grid). The
// chapter is asked once (`bibleFind` with whole); an older console answers
// with the prose only, and the verses are then picked by number. "Enviar
// Salmos 23:1-3 · ARC" sends what is marked (nothing marked: the chapter);
// "+ Setlist" beside it (a console with the `plan` cap) only with verses.
// readOnly (the Equipe, Rodada Q PR4): the text to read, nothing to mark or
// send — the Equipe never touches the air.
// "Mais simples" (owner 2026-11-08): the bar is on top, under the header
// (N4 = A: "Mateus 5 ▾" — book and chapter in one —, the version, the lupa),
// so the bottom is only the send bar and the dock; the send bar is the dock's
// first row (N3); and the chapter on air controls itself (N7 = A): its verse
// on air green, the next with the grey ring, a tap puts that verse on air —
// marking verses is for a chapter that is not on air.
export default function BibleTab({ live = null, state, caps, c, readOnly = false, active = true }) {
    const versions = bibleVersions(state?.bible);
    const [version, setVersion] = useState("");
    const shownVersion = version || state?.bible?.version || versions[0]?.id || "";
    const [ref, setRef] = useState(null);
    const [found, setFound] = useState(null);
    const [finding, setFinding] = useState(false);
    const [sheet, setSheet] = useState(null);
    // The passage + Setlist just added (no toast since 2026-11-07: the button says so).
    const [added, setAdded] = useState("");
    const seq = useRef(0);
    const scroller = useRef(null);

    // The chapter, once per book, chapter and edition; the marks are the phone's.
    const key = ref?.chapter ? `${ref.book}|${ref.chapter}|${version}` : "";
    useEffect(() => {
        setFound(null);
        if (!ref?.chapter) return undefined;
        const id = ++seq.current;
        setFinding(true);
        remoteCall("bibleFind", chapterArgs(ref, version)).then((r) => {
            if (id !== seq.current) return;
            setFinding(false);
            setFound(r.ok ? { ...r.result, ok: true } : { ok: false, message: r.message });
        });
        return undefined;
    }, [key]); // eslint-disable-line react-hooks/exhaustive-deps -- key is the book, chapter and edition

    // A reference typed with its verse: that verse in view once the text came.
    const jump = useRef(null);
    useEffect(() => {
        if (!found?.ok || jump.current == null) return;
        scroller.current?.querySelector(`[data-v="${jump.current}"]`)?.scrollIntoView({ block: "center" });
        jump.current = null;
    }, [found]);
    // A new chapter starts from its top.
    useEffect(() => { if (scroller.current) scroller.current.scrollTop = 0; }, [key]);

    const open = (r) => { jump.current = r.verseStart ?? null; setRef(r); setSheet(null); };
    const book = ref ? bookOf(ref.book) : null;
    const label = ref ? refLabel(ref) : "";
    const sendVersion = found?.ok ? found.version || shownVersion : shownVersion;
    const plan = !readOnly && caps.has("plan") ? biblePlanArgs(ref, version) : null;
    const rows = found?.ok ? verseRows(found.verses, ref) : [];
    const marked = ref?.verseStart != null;
    // N7: this chapter on air, a tap goes to that verse's slide.
    const air = readOnly ? null : bibleOnAir(live?.content, ref);
    const canGoto = canRun(caps, "goto");
    const tap = (n) => {
        if (readOnly) return;
        if (air && !marked && canGoto && air.slideOf(n) != null) { c.run(`goto-${n}`, "goto", { index: air.slideOf(n) }); return; }
        setRef((r) => tapVerse(r, n));
    };

    const bar = (
        <div className="rm-bbar is-top">
            <button type="button" className="rm-pick is-grow" onClick={() => setSheet({ step: book ? "chapter" : "book", book: ref?.book || null })} aria-label={`Passagem: ${book ? `${book.name} ${ref?.chapter || ""}` : "escolher"}`}>
                <span>{book ? `${book.name}${ref?.chapter ? ` ${ref.chapter}` : ""}` : "Livro e capítulo"}</span><Icon name="chevron-down" size={15} />
            </button>
            {versions.length > 1 && (
                <button type="button" className="rm-pick" onClick={() => setSheet({ step: "version" })} aria-label={`Versão: ${shownVersion}`}>
                    <span>{shownVersion}</span><Icon name="chevron-down" size={15} />
                </button>
            )}
            <button type="button" className="rm-pick is-icon" onClick={() => setSheet({ step: "book", book: null, typing: true })} aria-label="Escrever a referência"><Icon name="search" size={19} /></button>
        </div>
    );
    // The send bar: marked verses, or a chapter that is not the one on air.
    const sending = !readOnly && ref?.chapter && (marked || !air);
    return (
        <div className="rm-main is-split">
            {bar}
            <div className="rm-scroll rm-btext" ref={scroller}>
                {!ref?.chapter && (
                    <div className="rm-pempty">
                        <span className="rm-pring" aria-hidden="true"><Icon name="book" size={26} /></span>
                        <b>Escolha a passagem</b>
                        <span>Escreva como “jo 3 16”, ou escolha o livro e o capítulo.</span>
                        <button type="button" className="rm-b is-go" onClick={() => setSheet({ step: "book", book: null, typing: true })}><Icon name="search" size={18} />Escrever a referência</button>
                        <button type="button" className="rm-b" onClick={() => setSheet({ step: ref?.book ? "chapter" : "book", book: ref?.book || null })}>Escolher o livro</button>
                    </div>
                )}
                {ref?.chapter && (
                    <div className="rm-pttl">
                        <b>{book ? `${book.name} ${ref.chapter}` : label}</b>
                        <small>{readOnly || !rows.length ? sendVersion : marked ? `${ref.verseStart === ref.verseEnd ? `versículo ${ref.verseStart}` : `versículos ${ref.verseStart}–${ref.verseEnd}`} · ${sendVersion}` : air ? `No ar · toque num versículo para passar · ${sendVersion}` : `Toque para marcar · ${sendVersion}`}</small>
                    </div>
                )}
                {ref?.chapter && finding && !found && <p className="rm-hint">Buscando no computador…</p>}
                {found && !found.ok && <p className="rm-empty">{found.message}</p>}
                {rows.length > 0 && (
                    <div className="rm-vlist">
                        {rows.map((v) => readOnly
                            ? <p key={v.n} className="rm-vrow" data-v={v.n}><span className="rm-vn">{v.n}</span><span className="rm-vt">{v.text}</span></p>
                            : (
                                <button key={v.n} type="button" data-v={v.n} className={`rm-vrow ${v.mark ? `is-${v.mark}` : ""} ${!marked && air?.stateOf(v.n) ? `is-on-${air.stateOf(v.n)}` : ""}`} aria-pressed={Boolean(v.mark)} onClick={() => tap(v.n)}>
                                    <span className="rm-vn">{v.n}</span><span className="rm-vt">{v.text}</span>
                                </button>
                            ))}
                    </div>
                )}
                {found?.truncated && <p className="rm-hint">O capítulo continua no computador.</p>}
                {/* An older console: the prose of the passage, the verses by number. */}
                {found?.ok && !found.verses && (
                    <>
                        <div className="rm-card">
                            <span className="rm-k">{found.reference} · {found.version}</span>
                            <span className="rm-v is-prose is-read">{found.text}</span>
                        </div>
                        {!readOnly && book && (
                            <div className="rm-grid">
                                {Array.from({ length: book.verses[ref.chapter - 1] || 0 }, (_, i) => i + 1).map((n) => {
                                    const inRange = marked && n >= ref.verseStart && n <= ref.verseEnd;
                                    const edge = n === ref.verseStart || n === ref.verseEnd;
                                    return <button key={n} type="button" className={inRange ? (edge ? "is-sel" : "is-range") : ""} aria-pressed={inRange} onClick={() => tap(n)}>{n}</button>;
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>
            {ref?.chapter && readOnly && <div className="rm-foot"><p className="rm-hint">Só leitura: quem põe no ar é o operador.</p></div>}
            {sending && (
                <SendBar active={active}>
                            <div className="rm-sendrow">
                                <Cmd c={c} k="bibleSend" action="bibleSend" args={bibleArgs(ref, version)} className="is-go" disabled={found ? !found.ok : false}>Enviar {label} · {sendVersion}</Cmd>
                                {plan && (added === `${label}|${version}`
                                    ? <span className="rm-b is-plan is-added" role="status"><Icon name="check" size={18} />Na setlist</span>
                                    : <Cmd c={c} k="setlistAdd" action="setlist.add" args={plan} className="is-plan" disabled={found ? !found.ok : false} label={`Adicionar ${label} à setlist`} then={() => setAdded(`${label}|${version}`)}><Icon name="plus" size={18} />Setlist</Cmd>)}
                                {marked && <button type="button" className="rm-b rm-unpick" onClick={() => setRef((r) => ({ ...r, verseStart: null, verseEnd: null }))} aria-label="Desmarcar os versículos"><Icon name="x" size={18} /></button>}
                            </div>
                </SendBar>
            )}

            {sheet && sheet.step !== "version" && <PassageSheet start={sheet} current={ref} onOpen={open} onClose={() => setSheet(null)} />}
            {sheet?.step === "version" && (
                <Sheet title="Versão" onClose={() => setSheet(null)}>
                    <div className="rm-list">
                        {versions.map((v) => (
                            <button key={v.id} type="button" className={`rm-item ${v.id === shownVersion ? "is-sel" : ""}`} onClick={() => { setVersion(v.id === state?.bible?.version ? "" : v.id); setSheet(null); }}>
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

// Escolher a passagem: the reference typed ("jo 3 16" opens João 3 with 16
// marked), or Livro → Capítulo on a compact grid. A book of one chapter
// opens at once.
function PassageSheet({ start, current, onOpen, onClose }) {
    const [step, setStep] = useState(start.step);
    const [bookName, setBookName] = useState(start.book);
    const [field, setField] = useState("");
    const input = useRef(null);
    useEffect(() => { if (start.typing) input.current?.focus(); }, [start.typing]);
    const typed = fieldRef(field);
    const type = (text) => {
        setField(text);
        const b = fieldRef(text) ? null : fieldBook(text);
        if (b) { setBookName(b); setStep("chapter"); }
    };
    const book = bookName ? bookOf(bookName) : null;
    const pickBook = (b) => {
        if (b.chapters === 1) return onOpen({ book: b.name, chapter: 1, verseStart: null, verseEnd: null });
        setBookName(b.name);
        setStep("chapter");
    };
    return (
        <Sheet title="Escolher a passagem" onClose={onClose}>
            <form className="rm-refrow" onSubmit={(e) => { e.preventDefault(); if (typed) onOpen(typed); }}>
                <label className="rm-field">
                    <Icon name="search" size={20} />
                    <input ref={input} value={field} onChange={(e) => type(e.target.value)} placeholder="Referência (jo 3 16)" aria-label="Referência" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" maxLength={40} />
                </label>
                {typed && <button type="submit" className="rm-b is-go">Abrir</button>}
            </form>
            {field.trim() && !typed && !fieldBook(field) && <p className="rm-hint is-left">Não entendi. Escreva como “jo 3 16” ou “Jo 3:16-18”.</p>}
            {typed && <p className="rm-hint is-left">Abre <b>{refLabel(typed)}</b></p>}
            {/* Livro | Capítulo as one segment (vistoria 2026-11-07, G1: the
                chips were squeezed and cut at the sheet's edge). */}
            <div className="rm-seg is-sheet" role="group" aria-label="Passo">
                <button type="button" aria-pressed={step === "book"} onClick={() => setStep("book")}>{book ? book.name : "Livro"}</button>
                <button type="button" aria-pressed={step === "chapter"} disabled={!book} onClick={() => setStep("chapter")}>Capítulo</button>
            </div>
            {step === "book" && BIBLE_SECTIONS.map(([name, books]) => (
                <section key={name} aria-label={name} className="rm-bsec">
                    <h2 className="rm-sec">{name}</h2>
                    <div className="rm-cells">
                        {books.map((b) => <button key={b.name} type="button" className={bookName === b.name ? "is-sel" : ""} aria-label={b.name} onClick={() => pickBook(b)}>{b.short}</button>)}
                    </div>
                </section>
            ))}
            {step === "chapter" && book && (
                <div className="rm-cells">
                    {Array.from({ length: book.chapters }, (_, i) => i + 1).map((n) => (
                        <button key={n} type="button" className={current?.book === book.name && current?.chapter === n ? "is-sel" : ""} onClick={() => onOpen({ book: book.name, chapter: n, verseStart: null, verseEnd: null })}>{n}</button>
                    ))}
                </div>
            )}
        </Sheet>
    );
}
