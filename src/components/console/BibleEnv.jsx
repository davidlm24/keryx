import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, Field, Row, Empty } from "./kx";
import AddMenu from "./AddMenu";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { bibleBooks, BIBLE_VERSIONS, parseReference } from "@/lib/bibleBooks";
import { getChapter, preferredVersion } from "@/lib/bibleText";
import { stageFromPassage, stageAirSlide } from "@/lib/console/stage";

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

// The Bíblia environment, Holyrics-style: books and chapters on the left,
// the chapter as a reading view in the middle and, on the right, what is on
// air and the actions.
//   - The verse on air is red (is-air); the selection is green (is-prev).
//   - A click or ↑/↓ moves the selection; nothing changes on the screens.
//   - Enter or a double click projects the selection. One verse goes out as
//     the whole chapter (one verse per slide) starting there, so ←/→ keep
//     walking the chapter; a range picked on purpose (Shift/Ctrl+click) goes
//     out as that passage, grouped 1/2/3/Auto per slide.
export default function BibleEnv({ c, logoUrl, request, stageRef, apiRef, serviceId, itemsCount, ensureService, onSend }) {
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
    const readingRef = useRef(null);
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

    // A reference from the palette, the quick jump or the top field.
    useEffect(() => {
        if (!request) return;
        setBook(request.book); setChapter(request.chapter); setGrid(false);
        const nums = request.verseStart ? Array.from({ length: request.verseEnd - request.verseStart + 1 }, (_, i) => request.verseStart + i) : [];
        setSel(nums);
        setAnchor(nums[0] ?? null);
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

    // What is on air, when it is this chapter.
    const onAir = c.cur?.content?.kind === "bible" ? c.cur.content : null;
    const airIsChapter = Boolean(onAir && onAir.ref?.wholeChapter && onAir.ref.book === book && Number(onAir.ref.chapter) === Number(chapter) && onAir.ref.version === version);
    const airHere = Boolean(onAir && (airIsChapter || String(onAir.ref?.reference || onAir.title).startsWith(`${book} ${chapter}:`)));
    const airSlideText = onAir ? String(onAir.slides[onAir.index]?.text || "") : "";
    const airVerseNums = useMemo(() => (airSlideText.match(/(?:^|\s)(\d{1,3})\s/g) || []).map((m) => Number(m.trim())), [airSlideText]);

    // A passage (several verses) as a stage, grouped per slide.
    const passageStage = useCallback((nums) => {
        const chosen = verses.filter((v) => nums.includes(v.number));
        const parts = group(chosen, how);
        if (!parts.length || !version) return null;
        const ref = `${book} ${chapter}:${rangeLabel(nums)}`;
        return stageFromPassage({ reference: `${ref} · ${version}`, text: chosen.map((v) => `${v.number} ${v.text}`).join("\n"), slides: parts, version });
    }, [verses, how, version, book, chapter]);

    // One verse: the whole chapter, one verse per slide, starting at it. When
    // this chapter is already on air it only moves there (content.goTo).
    const verseStage = useCallback((n) => {
        if (!version || !verses.length) return null;
        const index = verses.findIndex((v) => v.number === n);
        if (index < 0) return null;
        if (airIsChapter) return { ...stageAirSlide(onAir, index, `chapter:${book}:${chapter}:${version}`), title: `${book} ${chapter}:${n}` };
        const slides = verses.map((v) => ({ text: `${v.number} ${v.text}`, label: `v. ${v.number}`, ref: `${book} ${chapter}:${v.number} · ${version}` }));
        const st = stageFromPassage(
            { reference: `${book} ${chapter} · ${version}`, text: verses.map((v) => `${v.number} ${v.text}`).join("\n"), slides, version },
            { book, chapter, version, wholeChapter: true },
        );
        return { ...st, id: `chapter:${book}:${chapter}:${version}`, title: `${book} ${chapter}:${n}`, index };
    }, [verses, version, book, chapter, airIsChapter, onAir]);

    const stageFor = useCallback((nums) => (nums.length === 1 ? verseStage(nums[0]) : nums.length ? passageStage(nums) : null), [verseStage, passageStage]);
    const picked = verses.filter((v) => sel.includes(v.number));
    const slides = useMemo(() => (sel.length > 1 ? group(picked, how) : picked.map((v) => ({ text: `${v.number} ${v.text}` }))), [picked, how, sel.length]);
    const reference = sel.length ? `${book} ${chapter}:${rangeLabel(sel)}` : "";
    const stage = useMemo(() => stageFor(sel), [stageFor, sel]);
    // The console sends this stage on Enter / Ctrl+Enter in the Bible environment.
    useEffect(() => {
        if (!stageRef) return undefined;
        stageRef.current = stage;
        return () => { stageRef.current = null; };
    }, [stage, stageRef]);

    // ↑/↓ from the console: move the selection one verse, keep it in view.
    const move = useCallback((d) => {
        if (!verses.length) return;
        const at = sel.length ? (d > 0 ? Math.max(...sel) : Math.min(...sel)) : airHere && airVerseNums.length ? airVerseNums[0] : null;
        const idx = at == null ? (d > 0 ? 0 : verses.length - 1) : Math.max(0, Math.min(verses.length - 1, verses.findIndex((v) => v.number === at) + d));
        const n = verses[idx].number;
        setSel([n]);
        setAnchor(n);
        readingRef.current?.querySelector(`[data-verse="${n}"]`)?.scrollIntoView({ block: "nearest" });
    }, [verses, sel, airHere, airVerseNums]);
    useEffect(() => {
        if (!apiRef) return undefined;
        apiRef.current = { move };
        return () => { apiRef.current = null; };
    }, [apiRef, move]);

    // Click: select that verse. Shift+click: a range from the last one.
    // Ctrl+click: add or remove one verse.
    const pick = (n, e) => {
        if (e.shiftKey && anchor != null) {
            const [a, b] = [Math.min(anchor, n), Math.max(anchor, n)];
            setSel(Array.from({ length: b - a + 1 }, (_, i) => a + i));
            return;
        }
        if (e.ctrlKey || e.metaKey) { setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n].sort((x, y) => x - y))); setAnchor(n); return; }
        setSel([n]);
        setAnchor(n);
    };
    const goRef = (text) => { const r = parseReference(text); if (!r) { c.say("Referência não reconhecida. Ex.: Jo 3:16-21"); return; } setBook(r.book); setChapter(r.chapter); setGrid(false); setSel(r.verseStart ? Array.from({ length: r.verseEnd - r.verseStart + 1 }, (_, i) => r.verseStart + i) : []); setQ(""); };
    // "+": install a version for use without internet (electron/bible.cjs).
    const installVersion = async (v) => {
        const bible = window.keryxDesktop?.bible;
        if (!bible) { c.say("Instalar Bíblias funciona no KERYX do computador."); return; }
        c.say(`Baixando a ${v}…`);
        try {
            const res = await bible.install(v);
            if (res?.error) throw new Error(res.error.message);
            c.say(`${v} instalada para uso sem internet.`);
            setWanted(v);
        } catch (err) { c.say(err?.message || `Não foi possível instalar a ${v}.`); }
    };
    const favs = mem.favs || [];
    const toggleFav = () => { if (!reference) return; const next = { ...mem, favs: favs.includes(reference) ? favs.filter((f) => f !== reference) : [reference, ...favs].slice(0, 12) }; setMem(next); save(next); };
    // Adds the selected verses as a passage (never the whole chapter).
    const addToService = async () => {
        const passage = passageStage(sel);
        if (!passage) { c.say("Selecione versículos do capítulo."); return; }
        try {
            const sid = serviceId || await ensureService?.();
            if (!sid) return;
            const row = await keryx.entities.BiblePassage.create({ reference: `${reference} · ${version}`, book, chapter, verses: rangeLabel(sel), text: passage.args.slides.map((s) => s.text).join("\n"), slides: passage.args.slides, version });
            await keryx.entities.ServiceItem.create({ serviceId: sid, type: "BIBLE", title: reference, contentId: row.id, order: itemsCount, duration: 120 });
            c.say("Adicionado ao fim da setlist.");
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    };
    const airTitle = c.cur?.content ? c.cur.content.title : c.cur?.media ? c.cur.media.title : "nada";
    const sendLabel = c.isLive ? "Enviar ao ar" : "Mostrar no ensaio";

    return (
        <>
            <div className="col" style={{ flex: "0 1 340px", minWidth: 260 }}>
                <Panel title="Bíblia" count={version || wanted} actions={<select value={wanted} onChange={(e) => setWanted(e.target.value)} aria-label="Versão" style={{ height: 22, background: "var(--bg-2)", color: "var(--fg-1)", border: 0, borderRadius: 4, font: "inherit" }}>{BIBLE_VERSIONS.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}</select>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    {version && version !== wanted && <div className="warnline"><Icon name="warn" /><span>{wanted} não instalada · mostrando {version}</span></div>}
                    <div className="searchrow">
                        <Field value={q} onChange={setQ} placeholder="Livro, capítulo ou referência" onKeyDown={(e) => { if (e.key === "Enter") goRef(q); }} />
                        <AddMenu title="Instalar uma versão da Bíblia" items={BIBLE_VERSIONS.filter((v) => v.install).map((v) => ({ label: `Instalar ${v.id}${v.name ? ` · ${v.name}` : ""}`, icon: "book", onClick: () => installVersion(v.id) }))} />
                    </div>
                    {grid ? (
                        <div className="bgrid" style={{ overflow: "auto" }}>
                            {bibleBooks.map((b, i) => <button type="button" key={b.name} className={`kx-book kx-t ${b.name === book ? "is-selected" : ""}`} style={{ "--group": groupColor(i) }} title={b.name} onClick={() => { setBook(b.name); setChapter(1); setSel([]); setGrid(false); }}>{b.short}</button>)}
                        </div>
                    ) : (
                        <>
                            <div className="bstrip"><button type="button" className="kx-book kx-t is-selected" style={{ "--group": groupColor(bookIdx) }} onClick={() => setGrid(true)} title="Trocar de livro">{bookRow.name}<small>{bookRow.chapters} cap.</small></button><span className="kx-meta">Capítulo</span></div>
                            <div className="chapters" style={{ overflow: "auto", maxHeight: 240 }}>
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
                <Panel title={`${book} ${chapter}${version ? ` · ${version}` : ""}`} count="clique ou ↑↓ seleciona · Enter ou 2 cliques projeta · ←→ no ar" actions={<><Btn small onClick={() => setSel(verses.map((v) => v.number))}>Selecionar todos</Btn><Btn small onClick={() => setSel([])}>Limpar</Btn></>}>
                    {error && <Empty icon="warn" title="Capítulo indisponível">{error}</Empty>}
                    {!error && !verses.length && <Empty title="Carregando…" />}
                    <div className="reading" ref={readingRef}>
                        {verses.map((v) => (
                            <button type="button" key={v.number} data-verse={v.number}
                                className={`kx-verse kx-t ${sel.includes(v.number) ? "is-prev" : ""} ${airHere && airVerseNums.includes(v.number) ? "is-air" : ""}`}
                                onClick={(e) => pick(v.number, e)}
                                onDoubleClick={() => { const st = verseStage(v.number); if (st) { setSel([v.number]); setAnchor(v.number); onSend(st); } }}
                                title="Clique seleciona · 2 cliques projetam a partir deste versículo">
                                <span className="kx-verse-n">{v.number}</span><span>{v.text}</span>
                            </button>
                        ))}
                    </div>
                </Panel>
            </div>
            <div className="kx-split" />
            <div className="col" style={{ flex: "0 1 400px", minWidth: 300 }}>
                <Panel title={<span className={c.isLive ? "kx-air" : "kx-rh"}>{c.isLive ? "No ar agora" : "Ensaio"}</span>} count={airTitle} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="bible-air">
                        <div className={`kx-mon ${c.isLive ? "is-air" : "is-rh"}`}><div className="kx-mon-screen"><ScreenRenderer state={c.cur} now={c.now} logoUrl={logoUrl} preview /></div></div>
                    </div>
                    <div className="kx-panel-h" style={{ borderTop: "1px solid var(--line)" }}>
                        <span className="kx-section">Selecionado <span className="kx-count">· {sel.length ? `${reference}${sel.length > 1 ? ` · ${slides.length} ${slides.length === 1 ? "slide" : "slides"}` : " · capítulo a partir daqui"}` : "nenhum"}</span></span>
                        {sel.length > 1 && (
                            <div className="kx-seg" style={{ height: 22, padding: 1 }}>
                                {[["1", "1"], ["2", "2"], ["3", "3"], ["auto", "Auto"]].map(([v, l]) => <button type="button" key={v} className={`kx-t ${how === v ? "is-on" : ""}`} style={{ height: 20, padding: "0 7px", fontSize: 11 }} onClick={() => setHow(v)} title={v === "auto" ? "Pelo tamanho do texto" : `${v} por slide`}>{l}</button>)}
                            </div>
                        )}
                    </div>
                    <div className="vgroup" style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
                        {!slides.length && <Empty title="Nenhum versículo selecionado">Clique num versículo ou use ↑ ↓. Enter projeta.</Empty>}
                        {slides.map((s, i) => <div key={i} className="vslide"><b>{i + 1}</b><span>{s.text}</span></div>)}
                    </div>
                    <div style={{ display: "flex", gap: "var(--space-1)", padding: "var(--space-2)", flexWrap: "wrap", borderTop: "1px solid var(--line)" }}>
                        <Btn kind={c.isLive ? "prev" : "rh"} className="kx-btn-live" disabled={!stage} onClick={() => onSend(stage)} title={c.isLive ? "Enviar ao ar · Enter" : "As telas não mudam"}>{sendLabel}<kbd className="kx-kbd">Enter</kbd></Btn>
                        <Btn disabled={!sel.length} onClick={addToService}>Adicionar à setlist</Btn>
                        <Btn kind="icon" disabled={!reference} onClick={toggleFav} title={favs.includes(reference) ? "Tirar dos favoritos" : "Favoritar"}><Icon name="star" /></Btn>
                    </div>
                </Panel>
            </div>
        </>
    );
}
