import React, { useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, Field, Row, Monitor, Empty } from "./kx";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { bibleBooks, BIBLE_VERSIONS, parseReference } from "@/lib/bibleBooks";
import { getChapter, preferredVersion } from "@/lib/bibleText";
import { stageFromPassage, stageOp } from "@/lib/console/stage";
import { applyOp, emptyState } from "@shared/live-state.mjs";

// Book groups, by position in the canon, for the colour bar of each book.
const GROUPS = [[0, 4, "#b08a5a"], [5, 16, "#9a7a4a"], [17, 21, "#8d8a6a"], [22, 38, "#8a6a9a"], [39, 43, "#5a8ab0"], [44, 64, "#6a9a7a"], [65, 65, "#7a9a5a"]];
const groupColor = (i) => (GROUPS.find(([a, b]) => i >= a && i <= b) || GROUPS[0])[2];
const KEY = "keryx.console.bible";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* not remembered */ } };

const rangeLabel = (nums) => {
    const s = [...nums].sort((a, b) => a - b);
    if (!s.length) return "";
    const parts = []; let a = s[0]; let b = s[0];
    for (const n of s.slice(1)) { if (n === b + 1) b = n; else { parts.push(a === b ? `${a}` : `${a}-${b}`); a = b = n; } }
    parts.push(a === b ? `${a}` : `${a}-${b}`);
    return parts.join(",");
};

// Verses -> slides: one, two, three per slide, or by length (auto).
function group(verses, how) {
    const out = []; let cur = [];
    const flush = () => { if (cur.length) { out.push({ text: cur.map((v) => `${v.number} ${v.text}`).join(" "), label: cur.length > 1 ? `v. ${cur[0].number}–${cur[cur.length - 1].number}` : `v. ${cur[0].number}` }); cur = []; } };
    for (const v of verses) {
        if (how === "auto") { const len = cur.reduce((a, x) => a + x.text.length, 0); if (cur.length && len + v.text.length > 220) flush(); cur.push(v); }
        else { cur.push(v); if (cur.length >= Number(how)) flush(); }
    }
    flush();
    return out;
}

// The Bíblia environment: books and chapters on the left, the chapter as a
// reading view in the middle (click selects, Shift+click a range), and on
// the right what is on air, the selected verses as slides, a Prévia and the
// three actions. Nothing here changes the screens except "Enviar ao ar".
export default function BibleEnv({ c, logoUrl, request, stageRef, serviceId, itemsCount, onPrepare, onSend }) {
    const [mem, setMem] = useState(load);
    const [version, setVersion] = useState(null);
    const [book, setBook] = useState(mem.book || "João");
    const [chapter, setChapter] = useState(mem.chapter || 3);
    const [grid, setGrid] = useState(false);
    const [sel, setSel] = useState([]);
    const [how, setHow] = useState("auto");
    const [verses, setVerses] = useState([]);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [anchor, setAnchor] = useState(null);
    const bookRow = bibleBooks.find((b) => b.name === book) || bibleBooks[42];
    const bookIdx = bibleBooks.indexOf(bookRow);

    // The version the operator chose and the one shown: when the chosen one
    // is not installed, another installed one is used — and said so, never
    // swapped silently.
    const [wanted, setWanted] = useState(mem.version || "NVI");
    useEffect(() => {
        let alive = true;
        preferredVersion(wanted).then((v) => { if (alive) setVersion(v); }).catch(() => { if (alive) setVersion(wanted); });
        return () => { alive = false; };
    }, [wanted]);

    // A reference from the palette or the top field.
    useEffect(() => {
        if (!request) return;
        setBook(request.book); setChapter(request.chapter); setGrid(false);
        setSel(request.verseStart ? Array.from({ length: request.verseEnd - request.verseStart + 1 }, (_, i) => request.verseStart + i) : []);
    }, [request]);

    useEffect(() => {
        if (!version) return undefined;
        let alive = true;
        setError(""); setVerses([]);
        getChapter(version, book, chapter).then((r) => { if (alive) setVerses(r.verses); }).catch((err) => { if (alive) setError(err?.message || "Não foi possível carregar o capítulo."); });
        const next = { ...mem, version: wanted, book, chapter, recent: [[book, chapter], ...(mem.recent || []).filter(([b, ch]) => !(b === book && ch === chapter))].slice(0, 6) };
        setMem(next); save(next);
        return () => { alive = false; };
    }, [version, book, chapter]); // eslint-disable-line react-hooks/exhaustive-deps

    const picked = verses.filter((v) => sel.includes(v.number));
    const slides = useMemo(() => group(picked, how), [picked, how]);
    const reference = sel.length ? `${book} ${chapter}:${rangeLabel(sel)}` : "";
    // The version travels with the passage: on the screen ("JOÃO 3:16 · NVI"), in the captions, in the rundown.
    const stage = useMemo(() => (slides.length && version ? stageFromPassage({ reference: `${reference} · ${version}`, text: picked.map((v) => `${v.number} ${v.text}`).join("\n"), slides, version }) : null), [slides, reference, picked, version]);
    // The console sends this stage on Enter / Ctrl+Enter in the Bible environment.
    useEffect(() => {
        if (!stageRef) return undefined;
        stageRef.current = stage;
        return () => { stageRef.current = null; };
    }, [stage, stageRef]);
    const pdoc = useMemo(() => { if (!stage) return null; const [op, args] = stageOp(stage); try { return applyOp({ ...emptyState(c.now), background: c.cur?.background || null, logo: c.cur?.logo || emptyState().logo }, op, args, c.now); } catch { return null; } }, [stage, c.cur, c.now]);

    const pick = (n, e) => {
        if (e.shiftKey && anchor != null) { const [a, b] = [Math.min(anchor, n), Math.max(anchor, n)]; setSel((s) => Array.from(new Set([...s, ...Array.from({ length: b - a + 1 }, (_, i) => a + i)])).sort((x, y) => x - y)); }
        else { setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n].sort((x, y) => x - y))); setAnchor(n); }
    };
    const goRef = (text) => { const r = parseReference(text); if (!r) { c.say("Referência não reconhecida. Ex.: Jo 3:16-21"); return; } setBook(r.book); setChapter(r.chapter); setGrid(false); setSel(r.verseStart ? Array.from({ length: r.verseEnd - r.verseStart + 1 }, (_, i) => r.verseStart + i) : []); setQ(""); };
    const favs = mem.favs || [];
    const toggleFav = () => { if (!reference) return; const next = { ...mem, favs: favs.includes(reference) ? favs.filter((f) => f !== reference) : [reference, ...favs].slice(0, 12) }; setMem(next); save(next); };
    const addToService = async () => {
        if (!stage || !serviceId) { c.say(serviceId ? "Selecione versículos do capítulo." : "Escolha um culto no menu KERYX."); return; }
        try {
            const row = await keryx.entities.BiblePassage.create({ reference: `${reference} · ${version}`, book, chapter, verses: rangeLabel(sel), text: stage.args.slides.map((s) => s.text).join("\n"), slides: stage.args.slides, version });
            await keryx.entities.ServiceItem.create({ serviceId, type: "BIBLE", title: reference, contentId: row.id, order: itemsCount, duration: 120 });
            c.say("Adicionado ao fim do Roteiro.");
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    };
    const airTitle = c.cur?.content ? c.cur.content.title : c.cur?.media ? c.cur.media.title : "nada";
    const onAir = c.cur?.content?.kind === "bible" ? c.cur.content : null;
    const airVerseNums = onAir ? (String(onAir.slides[onAir.index]?.text || "").match(/(?:^|\s)(\d{1,3})\s/g) || []).map((m) => Number(m.trim())) : [];
    const airHere = onAir && String(onAir.ref?.reference || onAir.title).startsWith(`${book} ${chapter}`);

    return (
        <>
            <div className="col" style={{ width: 300, flex: "none" }}>
                <Panel title="Bíblia" count={version || wanted} actions={<select value={wanted} onChange={(e) => setWanted(e.target.value)} aria-label="Versão" style={{ height: 22, background: "var(--bg-2)", color: "var(--fg-1)", border: 0, borderRadius: 4, font: "inherit" }}>{BIBLE_VERSIONS.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}</select>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    {version && version !== wanted && <div className="warnline"><Icon name="warn" /><span>{wanted} não instalada · mostrando {version}</span></div>}
                    <div style={{ padding: "var(--space-1) var(--space-2)" }}><Field value={q} onChange={setQ} placeholder="Livro, capítulo ou referência" onKeyDown={(e) => { if (e.key === "Enter") goRef(q); }} /></div>
                    {grid ? (
                        <div className="bgrid" style={{ overflow: "auto" }}>
                            {bibleBooks.map((b, i) => <button type="button" key={b.name} className={`kx-book kx-t ${b.name === book ? "is-selected" : ""}`} style={{ "--group": groupColor(i) }} title={b.name} onClick={() => { setBook(b.name); setChapter(1); setSel([]); setGrid(false); }}>{b.short}</button>)}
                        </div>
                    ) : (
                        <>
                            <div className="bstrip"><button type="button" className="kx-book kx-t is-selected" style={{ "--group": groupColor(bookIdx) }} onClick={() => setGrid(true)} title="Trocar de livro">{bookRow.name}<small>{bookRow.chapters} cap.</small></button><span className="kx-meta">Capítulo</span></div>
                            <div className="chapters" style={{ overflow: "auto", maxHeight: 160 }}>
                                {Array.from({ length: bookRow.chapters }, (_, i) => i + 1).map((n) => <button type="button" key={n} className={`kx-t ${n === chapter ? "is-on" : ""}`} onClick={() => { setChapter(n); setSel([]); }}>{n}</button>)}
                            </div>
                        </>
                    )}
                    <div className="listhead" style={{ borderTop: "1px solid var(--line)" }}><span className="kx-section">Recentes</span></div>
                    {(mem.recent || []).map(([b, ch]) => <Row key={`${b}${ch}`} single icon="history" title={`${b} ${ch}`} onClick={() => { setBook(b); setChapter(ch); setSel([]); setGrid(false); }} />)}
                    <div className="listhead"><span className="kx-section">Favoritos</span></div>
                    {favs.map((f) => <Row key={f} single icon="star" title={f} onClick={() => goRef(f)} />)}
                </Panel>
            </div>
            <div className="kx-split" />
            <div className="col center">
                <Panel title={`${book} ${chapter}${version ? ` · ${version}` : ""}`} count="clique seleciona · Shift+clique um trecho · digite a referência" actions={<><Btn small onClick={() => setSel(verses.map((v) => v.number))}>Selecionar todos</Btn><Btn small onClick={() => setSel([])}>Limpar</Btn></>}>
                    {error && <Empty icon="warn" title="Capítulo indisponível">{error}</Empty>}
                    {!error && !verses.length && <Empty title="Carregando…" />}
                    <div className="reading">
                        {verses.map((v) => (
                            <button type="button" key={v.number} className={`kx-verse kx-t ${sel.includes(v.number) ? "is-prev" : ""} ${airHere && airVerseNums.includes(v.number) ? "is-air" : ""}`} onClick={(e) => pick(v.number, e)}>
                                <span className="kx-verse-n">{v.number}</span><span>{v.text}</span>
                            </button>
                        ))}
                    </div>
                </Panel>
            </div>
            <div className="kx-split" />
            <div className="col" style={{ width: 380, flex: "none" }}>
                <Panel title={<span className={c.isLive ? "kx-air" : "kx-rh"}>{c.isLive ? "No ar agora" : "Ensaio"}</span>} count={airTitle}>
                    <div style={{ padding: "0 var(--space-2) var(--space-2)" }}>
                        <div className={`kx-mon ${c.isLive ? "is-air" : "is-rh"}`} style={{ width: 180 }}><div className="kx-mon-screen"><ScreenRenderer state={c.cur} now={c.now} logoUrl={logoUrl} preview /></div></div>
                    </div>
                    <div className="kx-panel-h" style={{ borderTop: "1px solid var(--line)" }}>
                        <span className="kx-section">Versículos selecionados <span className="kx-count">· {sel.length ? `${rangeLabel(sel)} · ${slides.length} ${slides.length === 1 ? "slide" : "slides"}` : "nenhum"}</span></span>
                        <div className="kx-seg" style={{ height: 22, padding: 1 }}>
                            {[["1", "1"], ["2", "2"], ["3", "3"], ["auto", "Auto"]].map(([v, l]) => <button type="button" key={v} className={`kx-t ${how === v ? "is-on" : ""}`} style={{ height: 20, padding: "0 7px", fontSize: 11 }} onClick={() => setHow(v)} title={v === "auto" ? "Pelo tamanho do texto" : `${v} por slide`}>{l}</button>)}
                        </div>
                    </div>
                    <div className="vgroup" style={{ overflow: "auto", maxHeight: 200 }}>
                        {!slides.length && <Empty title="Nenhum versículo selecionado">Clique nos versículos do capítulo.</Empty>}
                        {slides.map((s, i) => <div key={i} className="vslide"><b>{i + 1}</b><span>{s.text}</span></div>)}
                    </div>
                    <Monitor state={stage ? "prev" : ""} caption={stage ? `Prévia · ${reference} · ${version}` : "Prévia"} live={pdoc} now={c.now} logoUrl={logoUrl} style={{ margin: "0 var(--space-2)" }}>
                        {!stage && <div className="kx-screen-empty">Nada na prévia</div>}
                    </Monitor>
                    <div style={{ display: "flex", gap: "var(--space-1)", padding: "var(--space-2)", flexWrap: "wrap" }}>
                        <Btn kind="outline" disabled={!stage} onClick={() => onPrepare(stage)}>Pôr na prévia</Btn>
                        <Btn kind={c.isLive ? "prev" : "rh"} disabled={!stage} onClick={() => onSend(stage)} title={c.isLive ? "Enviar ao ar" : "As telas não mudam"}>{c.isLive ? "Enviar ao ar" : c.mode === "prep" ? "Mostrar aqui" : "Mostrar no ensaio"}<kbd className="kx-kbd">Enter</kbd></Btn>
                        <Btn disabled={!stage} onClick={addToService}>Adicionar ao culto</Btn>
                        <Btn kind="icon" disabled={!reference} onClick={toggleFav} title={favs.includes(reference) ? "Tirar dos favoritos" : "Favoritar"}><Icon name="star" /></Btn>
                    </div>
                </Panel>
            </div>
        </>
    );
}
