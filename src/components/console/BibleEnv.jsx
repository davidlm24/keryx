import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, Field, Row, Seg, Empty } from "./kx";
import AddMenu from "./AddMenu";
import BibleSearchPanel, { useBibleSearch } from "./BibleSearchPanel";
import BibleCompareView from "./BibleCompareView";
import { useBibleNotes } from "./useBibleNotes";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { bibleBooks, BIBLE_VERSIONS, parseReference } from "@/lib/bibleBooks";
import { getChapter, preferredVersion, installedVersions, forgetInstalledVersions } from "@/lib/bibleText";
import { stageFromPassage, stageAirSlide } from "@/lib/console/stage";
import { verseNumbers } from "@/lib/verseMarks";

// Book groups, by position in the canon, for the colour bar of each book.
const GROUPS = [[0, 4, "#b08a5a"], [5, 16, "#9a7a4a"], [17, 21, "#8d8a6a"], [22, 38, "#8a6a9a"], [39, 43, "#5a8ab0"], [44, 64, "#6a9a7a"], [65, 65, "#7a9a5a"]];
const groupColor = (i) => (GROUPS.find(([a, b]) => i >= a && i <= b) || GROUPS[0])[2];
const KEY = "keryx.console.bible";
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch { return {}; } };
// The old local favourites ("favs") belong to useBibleNotes, which moves
// them into the database: saving here never writes them back.
const save = (v) => {
    try {
        const { favs: _drop, ...rest } = v;
        const keep = load().favs;
        localStorage.setItem(KEY, JSON.stringify(Array.isArray(keep) && keep.length ? { ...rest, favs: keep } : rest));
    } catch { /* not remembered */ }
};
const MODES = [["ler", "Ler"], ["buscar", "Buscar"], ["comparar", "Comparar"]];

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

// A passage (several verses) as a stage, grouped per slide.
function passageStageOf({ verses, nums, how, version, book, chapter }) {
    const chosen = verses.filter((v) => nums.includes(v.number));
    const parts = group(chosen, how);
    if (!parts.length || !version) return null;
    const ref = `${book} ${chapter}:${rangeLabel(nums)}`;
    return stageFromPassage({ reference: `${ref} · ${version}`, text: chosen.map((v) => `${v.number} ${v.text}`).join("\n"), slides: parts, version });
}

// One verse: the whole chapter, one verse per slide, starting at it. When
// that chapter (same version) is already on air it only moves there.
function chapterStageOf({ verses, n, version, book, chapter, onAir }) {
    if (!version || !verses.length) return null;
    const index = verses.findIndex((v) => v.number === n);
    if (index < 0) return null;
    const id = `chapter:${book}:${chapter}:${version}`;
    const airIsChapter = Boolean(onAir && onAir.ref?.wholeChapter && onAir.ref.book === book && Number(onAir.ref.chapter) === Number(chapter) && onAir.ref.version === version);
    if (airIsChapter) return { ...stageAirSlide(onAir, index, id), title: `${book} ${chapter}:${n}` };
    const slides = verses.map((v) => ({ text: `${v.number} ${v.text}`, label: `v. ${v.number}`, ref: `${book} ${chapter}:${v.number} · ${version}` }));
    const st = stageFromPassage(
        { reference: `${book} ${chapter} · ${version}`, text: verses.map((v) => `${v.number} ${v.text}`).join("\n"), slides, version },
        { book, chapter, version, wholeChapter: true },
    );
    return { ...st, id, title: `${book} ${chapter}:${n}`, index };
}

// The Bíblia environment, Holyrics-style: books and chapters in a band on
// top (with recent chapters, favourites and notes), the chapter below it —
// read it (Ler), search the installed Bíblia by word (Buscar), or set
// versions side by side (Comparar) — and, on the right, what is on air, the
// selection, its note and the actions.
//   - The verse on air is red (is-air); the selection is green (is-prev).
//   - A click or ↑/↓ moves the selection (in Buscar, through the results);
//     nothing changes on the screens.
//   - Enter or a double click projects the selection. One verse goes out as
//     the whole chapter (one verse per slide) starting there, so ←/→ keep
//     walking the chapter; a range picked on purpose (Shift/Ctrl+click) goes
//     out as that passage, grouped 1/2/3/Auto per slide.
// Favoritos and Anotações: a button with a dropdown list (the selector band
// stays one line high).
function ListMenu({ icon, label, count, empty, rows }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    useEffect(() => {
        if (!open) return undefined;
        const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
        window.addEventListener("mousedown", away);
        window.addEventListener("keydown", esc, true);
        return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
    }, [open]);
    return (
        <span className="addmenu" ref={box}>
            <button type="button" className={`bchip kx-t ${open ? "is-on" : ""}`} onClick={() => setOpen((o) => !o)} aria-expanded={open}><Icon name={icon} size={12} />{label} · {count}</button>
            {open && (
                <div className="kx-pop addmenu-pop blist-pop" role="menu">
                    {!rows.length && <div className="be-hint kx-meta">{empty}</div>}
                    {rows.map((r) => <Row key={r.key} single={!r.meta} icon={r.icon} title={r.title} meta={r.meta} onClick={() => { setOpen(false); r.onPick(); }} />)}
                </div>
            )}
        </span>
    );
}

export default function BibleEnv({ c, logoUrl, request, stageRef, apiRef, serviceId, itemsCount, ensureService, onSend }) {
    const [mem, setMem] = useState(load);
    const [version, setVersion] = useState(null);
    const [book, setBook] = useState(mem.book || "João");
    const [chapter, setChapter] = useState(mem.chapter || 3);
    const [sel, setSel] = useState([]);
    const [how, setHow] = useState("auto");
    const [verses, setVerses] = useState([]);
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [anchor, setAnchor] = useState(null);
    const [mode, setMode] = useState("ler");
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const readingRef = useRef(null);
    const searchInputRef = useRef(null);
    const bookRow = bibleBooks.find((b) => b.name === book) || bibleBooks[42];
    const bookIdx = bibleBooks.indexOf(bookRow);
    const notesApi = useBibleNotes();

    // The version the operator chose and the one shown: when the chosen one
    // is not installed, another installed one is used — and said so, never
    // swapped silently.
    const [wanted, setWanted] = useState(mem.version || "NVI");
    // Bumped after an install, so the installed list and the version are read again.
    const [installRev, setInstallRev] = useState(0);
    const [installed, setInstalled] = useState([]);
    useEffect(() => {
        let alive = true;
        preferredVersion(wanted).then((v) => { if (alive) setVersion(v); }).catch(() => { if (alive) setVersion(wanted); });
        installedVersions().then((m) => { if (alive) setInstalled(Object.keys(m || {})); }).catch(() => {});
        return () => { alive = false; };
    }, [wanted, installRev]);
    // Where the chapter on screen came from: "local" (installed on this
    // computer), "online" (abibliadigital, needs internet) or null.
    const [source, setSource] = useState(null);
    const search = useBibleSearch(version || wanted, book);

    // A reference from the palette, the quick jump or the top field; or a
    // word search from the palette ({ search }).
    useEffect(() => {
        if (!request) return;
        if (request.search) {
            setMode("buscar");
            search.setQ(request.search);
            search.run(request.search, "all");
            return;
        }
        setBook(request.book); setChapter(request.chapter);
        const nums = request.verseStart ? Array.from({ length: request.verseEnd - request.verseStart + 1 }, (_, i) => request.verseStart + i) : [];
        setSel(nums);
        setAnchor(nums[0] ?? null);
    }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (!version) return undefined;
        let alive = true;
        setError(""); setVerses([]); setSource(null);
        getChapter(version, book, chapter).then((r) => { if (alive) { setVerses(r.verses); setSource(r.source || null); } }).catch((err) => { if (alive) setError(err?.message || "Não foi possível carregar o capítulo."); });
        // Walking search results does not fill "Recentes".
        const recent = modeRef.current === "buscar" ? (mem.recent || []) : [[book, chapter], ...(mem.recent || []).filter(([b, ch]) => !(b === book && ch === chapter))].slice(0, 6);
        const next = { ...mem, version: wanted, book, chapter, recent };
        setMem(next); save(next);
        return () => { alive = false; };
    }, [version, book, chapter, installRev]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (mode === "buscar") setTimeout(() => searchInputRef.current?.focus(), 0); }, [mode]);

    // What is on air, when it is this chapter.
    const onAir = c.cur?.content?.kind === "bible" ? c.cur.content : null;
    const airIsChapter = Boolean(onAir && onAir.ref?.wholeChapter && onAir.ref.book === book && Number(onAir.ref.chapter) === Number(chapter) && onAir.ref.version === version);
    const airHere = Boolean(onAir && (airIsChapter || String(onAir.ref?.reference || onAir.title).startsWith(`${book} ${chapter}:`)));
    const airSlideText = onAir ? String(onAir.slides[onAir.index]?.text || "") : "";
    const airVerseNums = useMemo(() => verseNumbers(airSlideText), [airSlideText]);

    const passageStage = useCallback((nums) => passageStageOf({ verses, nums, how, version, book, chapter }), [verses, how, version, book, chapter]);
    const verseStage = useCallback((n) => chapterStageOf({ verses, n, version, book, chapter, onAir }), [verses, version, book, chapter, onAir]);
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

    // A search result: its chapter opens behind and the verse is selected.
    const pickResult = useCallback((r) => {
        setBook(r.book); setChapter(r.chapter);
        setSel([r.verse]); setAnchor(r.verse);
    }, []);
    // A double click on a result: project from that verse right away.
    const sendResult = useCallback(async (r) => {
        pickResult(r);
        try {
            const { verses: vs } = await getChapter(version, r.book, r.chapter);
            const st = chapterStageOf({ verses: vs, n: r.verse, version, book: r.book, chapter: r.chapter, onAir });
            if (st) onSend(st);
        } catch (err) { c.say(err?.message || "Não foi possível abrir o capítulo."); }
    }, [pickResult, version, onAir, onSend, c]);

    // ↑/↓ from the console: move the selection one verse (in Buscar, one
    // result), keep it in view.
    const move = useCallback((d) => {
        if (mode === "buscar") {
            const list = search.result?.verses || [];
            if (!list.length) return;
            const at = list.findIndex((r) => r.book === book && Number(r.chapter) === Number(chapter) && sel.length === 1 && r.verse === sel[0]);
            const idx = at < 0 ? (d > 0 ? 0 : list.length - 1) : Math.max(0, Math.min(list.length - 1, at + d));
            pickResult(list[idx]);
            return;
        }
        if (!verses.length) return;
        const at = sel.length ? (d > 0 ? Math.max(...sel) : Math.min(...sel)) : airHere && airVerseNums.length ? airVerseNums[0] : null;
        const idx = at == null ? (d > 0 ? 0 : verses.length - 1) : Math.max(0, Math.min(verses.length - 1, verses.findIndex((v) => v.number === at) + d));
        const n = verses[idx].number;
        setSel([n]);
        setAnchor(n);
        readingRef.current?.querySelector(`[data-verse="${n}"]`)?.scrollIntoView({ block: "nearest" });
    }, [mode, search.result, book, chapter, verses, sel, airHere, airVerseNums, pickResult]);
    useEffect(() => {
        if (!apiRef) return undefined;
        apiRef.current = { move };
        return () => { apiRef.current = null; };
    }, [apiRef, move]);

    // Click: select that verse. Shift+click: a range from the last one.
    // Ctrl+click: add or remove one verse.
    const pick = (n, e) => {
        if (e?.shiftKey && anchor != null) {
            const [a, b] = [Math.min(anchor, n), Math.max(anchor, n)];
            setSel(Array.from({ length: b - a + 1 }, (_, i) => a + i));
            return;
        }
        if (e?.ctrlKey || e?.metaKey) { setSel((s) => (s.includes(n) ? s.filter((x) => x !== n) : [...s, n].sort((x, y) => x - y))); setAnchor(n); return; }
        setSel([n]);
        setAnchor(n);
    };
    const goRef = (text) => { const r = parseReference(text); if (!r) { c.say("Referência não reconhecida. Ex.: Jo 3:16-21"); return false; } setBook(r.book); setChapter(r.chapter); setSel(r.verseStart ? Array.from({ length: r.verseEnd - r.verseStart + 1 }, (_, i) => r.verseStart + i) : []); setAnchor(r.verseStart || null); setQ(""); return true; };
    // The top field: a reference opens it; anything else searches by word.
    const submitTop = () => {
        const text = q.trim();
        if (!text) return;
        if (parseReference(text)) { goRef(text); setMode("ler"); return; }
        setMode("buscar"); search.setQ(text); search.run(text); setQ("");
    };
    // "+": install a version for use without internet (electron/bible.cjs).
    const installVersion = async (v) => {
        const bible = window.keryxDesktop?.bible;
        if (!bible) { c.say("Instalar Bíblias funciona no KERYX do computador."); return; }
        c.say(`Baixando a ${v}…`);
        try {
            const res = await bible.install(v);
            if (res?.error) throw new Error(res.error.message);
            c.say(`${v} instalada para uso sem internet.`);
            // The installed list changed: read it again (the cache would keep
            // showing the old fallback), and the chapter with it.
            forgetInstalledVersions();
            setWanted(v);
            setInstallRev((n) => n + 1);
        } catch (err) { c.say(err?.message || `Não foi possível instalar a ${v}.`); }
    };
    const toggleFav = async () => {
        if (!reference) return;
        try {
            const on = await notesApi.toggleFavorite({ reference, book, chapter, verse: Math.min(...sel), text: picked.map((v) => v.text).join(" ") });
            c.say(on ? `${reference} nos favoritos.` : `${reference} saiu dos favoritos.`);
        } catch (err) { c.say(err?.message || "Não foi possível."); }
    };
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
    // Comparar › Enviar: the selection in that version (one verse: its
    // chapter from there, as in Ler).
    const sendVersion = (v, vs) => {
        const st = sel.length === 1 ? chapterStageOf({ verses: vs, n: sel[0], version: v, book, chapter, onAir }) : passageStageOf({ verses: vs, nums: sel, how, version: v, book, chapter });
        if (st) onSend(st);
    };
    const switchVersion = (v) => { setWanted(v); c.say(`Bíblia na ${v}.`); };

    const marked = notesApi.versesWithNotes(book, chapter);
    const oneVerse = sel.length === 1 ? verses.find((v) => v.number === sel[0]) : null;
    const note = oneVerse ? notesApi.noteOf(book, chapter, oneVerse.number) : null;
    const saveNote = async (text) => {
        if (!oneVerse) return;
        try {
            const r = await notesApi.saveNote({ book, chapter, verse: oneVerse.number, text, verseText: oneVerse.text });
            if (r === "saved") c.say(`Anotação salva em ${book} ${chapter}:${oneVerse.number}.`);
            if (r === "removed") c.say("Anotação apagada.");
        } catch (err) { c.say(err?.message || "Não foi possível salvar a anotação."); }
    };
    // The 66-book grid: open or closed by the operator, else by the room
    // (console.css folds it when the column is short, so the reading keeps
    // its height). The book's name in the chapters row opens and closes it.
    const gridRef = useRef(null);
    const toggleBooks = () => {
        const shown = gridRef.current && getComputedStyle(gridRef.current).display !== "none";
        const next = { ...mem, books: shown ? "closed" : "open" };
        setMem(next); save(next);
    };
    // The edition, said plainly: installed here, from the internet, or missing.
    // (The browser preview's verses are samples, never a real edition: said so.)
    const badge = error ? { text: `${version || wanted} · não disponível`, warn: true }
        : keryx.isPreview && source ? { text: `${version} · texto de exemplo (prévia)`, warn: true, title: "Na prévia de desenvolvimento os versículos são de exemplo; no aplicativo vêm da Bíblia instalada." }
        : source === "local" ? { text: `${version} · instalada neste computador`, warn: false }
            : source === "online" ? { text: `${version} · pela internet`, warn: true, title: "Sem internet, este capítulo não abre. Instale a versão pelo + para usar sem internet." }
                : null;
    const canInstall = (v) => Boolean(BIBLE_VERSIONS.find((x) => x.id === v)?.install) && !installed.includes(v);
    const others = installed.filter((v) => v !== (version || wanted));
    const airTitle = c.cur?.content ? c.cur.content.title : c.cur?.media ? c.cur.media.title : "nada";
    const sendLabel = "Enviar ao ar";
    const searchSel = sel.length === 1 ? { book, chapter, verse: sel[0] } : null;

    return (
        <>
            <div className={`col center bible-center ${mem.books === "open" ? "books-open" : mem.books === "closed" ? "books-closed" : ""}`}>
                <Panel className="bband" title="Bíblia" count={version || wanted} actions={<>
                    {badge && <span className={`bsrc ${badge.warn ? "kx-warn" : ""}`} title={badge.title || badge.text}><Icon name={badge.warn ? "warn" : "check"} size={12} />{badge.text}</span>}
                    <select value={wanted} onChange={(e) => setWanted(e.target.value)} aria-label="Versão" style={{ height: 22, background: "var(--bg-2)", color: "var(--fg-1)", border: 0, borderRadius: "var(--radius-control)", font: "inherit" }}>{BIBLE_VERSIONS.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}</select>
                </>}>
                    {version && version !== wanted && (
                        <div className="warnline"><Icon name="warn" /><span>{wanted} não instalada · mostrando {version}</span>
                            {canInstall(wanted) && <Btn small kind="outline" onClick={() => installVersion(wanted)} title={`Baixar a ${wanted} para usar sem internet`}>Instalar {wanted}</Btn>}
                        </div>
                    )}
                    <div className="searchrow">
                        <Field value={q} onChange={setQ} placeholder="Referência (Jo 3:16) ou palavra" onKeyDown={(e) => { if (e.key === "Enter") submitTop(); }} />
                        <AddMenu title="Instalar uma versão da Bíblia" items={BIBLE_VERSIONS.filter((v) => v.install).map((v) => ({ label: `Instalar ${v.id}${v.name ? ` · ${v.name}` : ""}`, icon: "book", onClick: () => installVersion(v.id) }))} />
                    </div>
                    <div className="bgrid" ref={gridRef}>
                        {bibleBooks.map((b, i) => <button type="button" key={b.name} className={`kx-book kx-t ${b.name === book ? "is-selected" : ""}`} style={{ "--group": groupColor(i) }} title={b.name} onClick={() => { setBook(b.name); setChapter(1); setSel([]); }}>{b.short}</button>)}
                    </div>
                    <div className="bchap">
                        <button type="button" className="bchap-name kx-t" style={{ "--group": groupColor(bookIdx) }} onClick={toggleBooks} title="Mostrar ou esconder os livros">{bookRow.name}<small>{bookRow.chapters} cap.</small><Icon name="chevron-down" size={12} /></button>
                        <div className="chapters">
                            {Array.from({ length: bookRow.chapters }, (_, i) => i + 1).map((n) => <button type="button" key={n} className={`kx-t ${n === chapter ? "is-on" : ""}`} onClick={() => { setChapter(n); setSel([]); }}>{n}</button>)}
                        </div>
                    </div>
                    <div className="bband-lists">
                        <span className="kx-section">Recentes</span>
                        {!(mem.recent || []).length && <span className="kx-meta">nenhum</span>}
                        {(mem.recent || []).map(([b, ch]) => <button type="button" key={`${b}${ch}`} className="bchip kx-t" onClick={() => { setBook(b); setChapter(ch); setSel([]); setMode("ler"); }}><Icon name="history" size={12} />{b} {ch}</button>)}
                        <span style={{ flex: 1 }} />
                        <ListMenu icon="star" label="Favoritos" count={notesApi.favorites.length} empty="Selecione versículos e use a estrela."
                            rows={notesApi.favorites.map((fv) => ({ key: fv.id, icon: "star", title: fv.reference, onPick: () => { if (goRef(fv.reference)) setMode("ler"); } }))} />
                        <ListMenu icon="text" label="Anotações" count={notesApi.notes.length} empty="Selecione um versículo e escreva à direita."
                            rows={notesApi.notes.map((n) => ({ key: n.id, icon: "text", title: n.reference, meta: n.note_text, onPick: () => { if (goRef(n.reference)) setMode("ler"); } }))} />
                    </div>
                </Panel>
                <Panel title={mode === "buscar" ? "Buscar na Bíblia" : `${book} ${chapter}${version ? ` · ${version}` : ""}`}
                    count={mode === "ler" ? "clique ou ↑↓ seleciona · Enter ou 2 cliques projeta · ←→ no ar" : mode === "buscar" ? "↑↓ percorre os resultados · Enter ou 2 cliques projeta" : "versões lado a lado"}
                    actions={<>
                        {mode === "ler" && <><Btn small onClick={() => setSel(verses.map((v) => v.number))}>Selecionar todos</Btn><Btn small onClick={() => setSel([])}>Limpar</Btn></>}
                        <Seg small value={mode} onChange={setMode} options={MODES} />
                    </>} bodyStyle={mode === "ler" ? undefined : { display: "flex", flexDirection: "column" }}>
                    {mode === "ler" && (
                        <>
                            {error && (
                                <div className="kx-empty">
                                    <span className="kx-glyph"><Icon name="book" /></span>
                                    <span className="kx-empty-t">Capítulo indisponível</span>
                                    <span>{error}</span>
                                    <span>O KERYX nunca mostra texto de exemplo no lugar de uma Bíblia.</span>
                                    {(canInstall(version || wanted) || others.length > 0) && (
                                        <span className="bunavail-acts">
                                            {canInstall(version || wanted) && <Btn kind="outline" onClick={() => installVersion(version || wanted)}>Instalar {version || wanted}</Btn>}
                                            {others.map((v) => <Btn key={v} onClick={() => switchVersion(v)}>Usar {v}</Btn>)}
                                        </span>
                                    )}
                                </div>
                            )}
                            {!error && !verses.length && <Empty title="Carregando…" />}
                            <div className="reading" ref={readingRef}>
                                {verses.map((v) => (
                                    <button type="button" key={v.number} data-verse={v.number}
                                        className={`kx-verse kx-t ${sel.includes(v.number) ? "is-prev" : ""} ${airHere && airVerseNums.includes(v.number) ? "is-air" : ""} ${marked.has(v.number) ? "has-note" : ""}`}
                                        onClick={(e) => pick(v.number, e)}
                                        onDoubleClick={() => { const st = verseStage(v.number); if (st) { setSel([v.number]); setAnchor(v.number); onSend(st); } }}
                                        title={marked.has(v.number) ? `Anotação: ${notesApi.noteOf(book, chapter, v.number)?.note_text || ""}` : "Clique seleciona · 2 cliques projetam a partir deste versículo"}>
                                        <span className="kx-verse-n">{v.number}</span><span>{v.text}{marked.has(v.number) && <span className="be-notemark" aria-label="tem anotação"><Icon name="text" size={12} /></span>}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {mode === "buscar" && <BibleSearchPanel search={search} selected={searchSel} onPick={pickResult} onSend={sendResult} inputRef={searchInputRef} />}
                    {mode === "comparar" && <BibleCompareView book={book} chapter={chapter} version={version || wanted} sel={sel} onSelect={pick} onSendVersion={sendVersion} onUseVersion={switchVersion} />}
                </Panel>
            </div>
            <div className="kx-gap" />
            <div className="col bible-air-col" style={{ flex: "0 1 400px", minWidth: 300 }}>
                <Panel title={<span className={c.locked ? "kx-rh" : "kx-air"}>{c.locked ? "No ar · travado" : "No ar agora"}</span>} count={airTitle} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="bible-air">
                        <div className={`kx-mon ${c.locked ? "is-rh" : "is-air"}`}><div className="kx-mon-screen"><ScreenRenderer state={c.cur} now={c.now} logoUrl={logoUrl} preview /></div></div>
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
                    {oneVerse && (
                        <div className="be-note">
                            <div className="listhead"><span className="kx-section">Anotação <span className="kx-count">· {book} {chapter}:{oneVerse.number} · só no console</span></span></div>
                            <textarea key={`${book}:${chapter}:${oneVerse.number}:${note?.id || "novo"}`} className="ed-text" rows={3} defaultValue={note?.note_text || ""} placeholder="Uma nota sobre este versículo (não vai para as telas)" aria-label="Anotação"
                                onBlur={(e) => saveNote(e.target.value)} />
                        </div>
                    )}
                    <div style={{ display: "flex", gap: "var(--space-1)", padding: "var(--space-2)", flexWrap: "wrap", borderTop: "1px solid var(--line)" }}>
                        <Btn kind="prev" className="kx-btn-live" disabled={!stage || c.locked} onClick={() => onSend(stage)} title={c.locked ? "Telas travadas · destrave em Saídas" : "Enviar ao ar · Enter"}>{sendLabel}<kbd className="kx-kbd">Enter</kbd></Btn>
                        <Btn disabled={!sel.length} onClick={addToService}>Adicionar à setlist</Btn>
                        <Btn kind="icon" on={notesApi.isFavorite(reference)} disabled={!reference} onClick={toggleFav} title={notesApi.isFavorite(reference) ? "Tirar dos favoritos" : "Favoritar"}><Icon name="star" /></Btn>
                    </div>
                </Panel>
            </div>
        </>
    );
}
