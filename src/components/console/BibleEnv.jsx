import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Row, Seg, Empty } from "./kx";
import DockView from "./Dock";
import { useContextMenu } from "./ContextMenu";
import AddMenu from "./AddMenu";
import BibleSearchPanel, { useBibleSearch } from "./BibleSearchPanel";
import BibleCompareView from "./BibleCompareView";
import { useBibleNotes } from "./useBibleNotes";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { bibleBooks, BIBLE_VERSIONS, parseReference } from "@/lib/bibleBooks";
import { readChapter, preferredVersion, installedVersions, forgetInstalledVersions } from "@/lib/bibleText";
import { stageFromVerses } from "@/lib/console/stage";
import { SEND_LABEL, sendTip } from "@/lib/console/copy";
import { rangeLabel, groupVerses, passageOf, chapterOnAir } from "@/lib/console/bibleVerses";
import { verseNumbers } from "@/lib/verseMarks";
import { usePrefs, getPrefs, updateUser } from "@/hooks/useUser";
import { useLibraryPicker } from "./library/libraryContext";
import { useThemes } from "./useConsoleData";
import { themeForKind, themeName } from "@/lib/console/themes";

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
// Ler and Comparar are the text panel's modes; Buscar is its header field
// (owner 2026-10-14): a word searches, a reference opens the chapter.
const MODES = [["ler", "Ler"], ["comparar", "Comparar"]];
// The version the operator chose (here or in Configurações › Bíblia e músicas, one
// preference in the database); the palette prepares references in it.
export const bibleVersionWanted = () => getPrefs().bible_version;

// The Bíblia environment, Holyrics-style, in three columns (their order is
// the operator's, Ver › Editar disposição): Livro, Capítulo and Versículo
// stacked (the version, Abrev | Nomes, the install + and the view menu in
// Livros' header — the old "Versão e busca" module is gone, 2026-10-14);
// the chapter — read it (Ler) or set versions side by side (Comparar), with
// the search field in the header (a word searches the installed Bíblia,
// Buscar; a reference opens the chapter), recent chapters, favourites and
// notes on top; and what is on air, the selection, its note and the actions.
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

export default function BibleEnv({ c, logoUrl, request, stageRef, apiRef, serviceId, itemsCount, ensureService, onSend, dockProps, grid = "compact", setGrid }) {
    const [mem, setMem] = useState(load);
    const [version, setVersion] = useState(null);
    const [book, setBook] = useState(mem.book || "João");
    const [chapter, setChapter] = useState(mem.chapter || 3);
    const [sel, setSel] = useState([]);
    // Versículos por slide: the church's choice (Configurações › Bíblia e
    // músicas), changed here too.
    const how = usePrefs().bible_verses_per_slide;
    const setHow = (v) => { updateUser({ bible_verses_per_slide: v }).catch(() => c.say("Não foi possível salvar.")); };
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
    const notesApi = useBibleNotes();

    // The version the operator chose and the one shown (editionPlan in
    // bibleBooks.js): an edition not installed is read from the internet;
    // when a chapter cannot be fetched, or the edition exists only as an
    // install (AA), an installed one is shown instead — and said so, never
    // swapped silently.
    const prefs = usePrefs();
    const wanted = prefs.bible_version;
    const setWanted = (v) => { updateUser({ bible_version: v }).catch(() => c.say("Não foi possível salvar a versão escolhida.")); };
    // The Bíblia's own theme (User.bible_theme_id; themes.js themeForKind):
    // chosen in the background library, in theme mode.
    const themes = useThemes();
    const bibleTheme = themeForKind(themes, "bible", prefs.bible_theme_id);
    const pickTheme = useLibraryPicker();
    const chooseTheme = async () => {
        const r = await pickTheme({ accept: "theme", value: prefs.bible_theme_id || bibleTheme?.id || null, title: "Tema da Bíblia", allowNone: true, noneLabel: "O mesmo das músicas", useLabel: "Usar na Bíblia" });
        const id = r?.theme ? r.theme.id : r?.none ? "" : null;
        if (id === null) return;
        updateUser({ bible_theme_id: id }).then(() => c.say(id ? `As passagens vão ao ar com o tema ${themeName(r.theme)}.` : "A Bíblia segue o tema das músicas.")).catch(() => c.say("Não foi possível salvar o tema da Bíblia."));
    };
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
    // The edition of the chapter on screen (`ver`): the chosen one, or the
    // installed one it fell back to (`fellBack`: the one that failed).
    const [chapterVersion, setChapterVersion] = useState(null);
    const [fellBack, setFellBack] = useState(null);
    const ver = chapterVersion || version;
    const search = useBibleSearch(version || wanted, book);

    // A reference from the palette, the quick jump or the top field; or a
    // word search from the palette ({ search }).
    useEffect(() => {
        if (!request) return;
        if (request.search) {
            setMode("buscar");
            setQ(request.search);
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
        setError(""); setVerses([]); setSource(null); setChapterVersion(null); setFellBack(null);
        readChapter(version, book, chapter).then((r) => {
            if (!alive) return;
            setVerses(r.verses); setSource(r.source || null); setChapterVersion(r.version); setFellBack(r.fellBack);
            if (r.fellBack) c.say(`${r.fellBack} sem internet: ${book} ${chapter} veio da ${r.version}.`);
        }).catch((err) => { if (alive) setError(err?.message || "Não foi possível carregar o capítulo."); });
        // Walking search results does not fill "Recentes".
        const recent = modeRef.current === "buscar" ? (mem.recent || []) : [[book, chapter], ...(mem.recent || []).filter(([b, ch]) => !(b === book && ch === chapter))].slice(0, 6);
        const { version: _v, bookNames: _n, ...kept } = mem;
        const next = { ...kept, book, chapter, recent };
        setMem(next); save(next);
        return () => { alive = false; };
    }, [version, book, chapter, installRev]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (mode === "buscar") setTimeout(() => searchInputRef.current?.focus(), 0); }, [mode]);

    // What is on air, when it is this chapter.
    const onAir = c.cur?.content?.kind === "bible" ? c.cur.content : null;
    const airIsChapter = chapterOnAir(onAir, { book, chapter, version: ver });
    const airHere = Boolean(onAir && (airIsChapter || String(onAir.ref?.reference || onAir.title).startsWith(`${book} ${chapter}:`)));
    const airSlideText = onAir ? String(onAir.slides[onAir.index]?.text || "") : "";
    const airVerseNums = useMemo(() => verseNumbers(airSlideText), [airSlideText]);

    const verseStage = useCallback((n) => stageFromVerses({ verses, nums: [n], version: ver, book, chapter, onAir }), [verses, ver, book, chapter, onAir]);
    const stageFor = useCallback((nums) => stageFromVerses({ verses, nums, how, version: ver, book, chapter, onAir }), [verses, how, ver, book, chapter, onAir]);
    const picked = verses.filter((v) => sel.includes(v.number));
    const slides = useMemo(() => (sel.length > 1 ? groupVerses(picked, how) : picked.map((v) => ({ text: `${v.number} ${v.text}` }))), [picked, how, sel.length]);
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
            const got = await readChapter(version, r.book, r.chapter);
            const st = stageFromVerses({ verses: got.verses, nums: [r.verse], version: got.version, book: r.book, chapter: r.chapter, onAir });
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
    // The text panel's field: a reference opens it; anything else searches by
    // word (the term stays in the field while the results show).
    const submitTop = () => {
        const text = q.trim();
        if (!text) return;
        if (parseReference(text)) { goRef(text); setMode("ler"); return; }
        setMode("buscar"); search.setQ(text); search.run(text);
    };
    // Installing downloads the edition: without internet the buttons say so
    // instead of failing after a click.
    const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    }, []);
    // "+": install a version for use without internet (electron/bible.cjs).
    const installVersion = async (v) => {
        const bible = window.keryxDesktop?.bible;
        if (!bible) { c.say("Instalar Bíblias funciona no KERYX do computador."); return; }
        if (!online) { c.say("Sem internet: conecte o computador para baixar a Bíblia."); return; }
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
        const passage = passageOf({ verses, nums: sel, how, version: ver, book, chapter });
        if (!passage) { c.say("Selecione versículos do capítulo."); return; }
        try {
            const sid = serviceId || await ensureService?.();
            if (!sid) return;
            const row = await keryx.entities.BiblePassage.create({ ...passage, text: passage.slides.map((s) => s.text).join("\n") });
            await keryx.entities.ServiceItem.create({ serviceId: sid, type: "BIBLE", title: reference, contentId: row.id, order: itemsCount, duration: 120 });
            c.say("Adicionado ao fim da setlist.");
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    };
    // Comparar › Enviar: the selection in that version (one verse: its
    // chapter from there, as in Ler).
    const sendVersion = (v, vs) => {
        const st = stageFromVerses({ verses: vs, nums: sel, how, version: v, book, chapter, onAir });
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
    // The 66 books: the Livros card of the left column.
    const gridRef = useRef(null);
    // Abrev | Nomes: the books as short codes (default) or full names, remembered.
    const fullNames = prefs.bible_book_names === "full";
    const setBookNames = (v) => { updateUser({ bible_book_names: v }).catch(() => c.say("Não foi possível salvar.")); };
    // The verse row in the band: the same selection as clicking the text
    // (Ctrl adds, Shift makes a range, a double click projects), and it
    // brings the verse into view in the reading.
    const pickCell = (n, e) => {
        if (mode !== "ler") setMode("ler");
        pick(n, e);
        requestAnimationFrame(() => readingRef.current?.querySelector(`[data-verse="${n}"]`)?.scrollIntoView({ block: "nearest" }));
    };
    const sendCell = (n) => { const st = verseStage(n); if (st) { setSel([n]); setAnchor(n); onSend(st); } };
    // Right-click on a verse (ContextMenu.jsx): select it, copy it, send it.
    const menu = useContextMenu();
    const copyVerse = (v) => {
        const text = `${v.text} (${book} ${chapter}:${v.number}${version ? ` ${version}` : ""})`;
        Promise.resolve(navigator.clipboard?.writeText(text)).then(() => c.say("Versículo copiado."), () => c.say("Não foi possível copiar o versículo."));
    };
    const installHint = online ? "" : " · sem internet";
    // The edition, said plainly: installed here, from the internet, or missing.
    // (The browser preview's verses are samples, never a real edition: said so.)
    const canInstall = (v) => Boolean(BIBLE_VERSIONS.find((x) => x.id === v)?.install) && !installed.includes(v);
    const badge = error ? { text: `${ver || wanted} · não disponível`, warn: true }
        : keryx.isPreview && source ? { text: `${ver} · texto de exemplo (prévia)`, warn: true, title: "Na prévia de desenvolvimento os versículos são de exemplo; no aplicativo vêm da Bíblia instalada." }
        : source === "local" ? { text: `${ver} · instalada neste computador`, warn: false }
            : source === "online" ? { text: `${ver} · pela internet`, warn: true, title: fellBack ? undefined : `Sem internet, os capítulos ainda não lidos vêm de uma versão instalada.${canInstall(ver) ? " Instale-a pelo + para usar sem internet." : ""}` }
                : null;
    const others = installed.filter((v) => v !== (version || wanted));
    const airTitle = c.cur?.content ? c.cur.content.title : c.cur?.media ? c.cur.media.title : "nada";
    const searchSel = sel.length === 1 ? { book, chapter, verse: sel[0] } : null;

    // The Bíblia's modules (owner layout 2026-10-12: Livro · Capítulo ·
    // Versículo stacked on the left under the version and search, the
    // chosen text in the middle, what is on air on the right). Where they go
    // is the Bíblia's dock (Ver › Editar disposição; src/lib/console/dock.js,
    // Console.jsx keeps it): each is built here apart from its place.
    const modules = {
        books: (
            <Panel className={`bpick-books ${fullNames ? "names-full" : ""}`} title="Livros" actions={<>
                <select value={wanted} onChange={(e) => setWanted(e.target.value)} aria-label="Versão" title="Versão da Bíblia" style={{ height: 22, background: "var(--bg-2)", color: "var(--fg-1)", border: 0, borderRadius: "var(--radius-control)", font: "inherit" }}>{BIBLE_VERSIONS.map((v) => <option key={v.id} value={v.id}>{v.id}</option>)}</select>
                <Seg small value={fullNames ? "full" : "short"} onChange={setBookNames} options={[["short", "Abrev", { title: "Livros abreviados (Gn, Ex…)" }], ["full", "Nomes", { title: "Livros com o nome inteiro" }]]} />
                <AddMenu title="Instalar uma versão da Bíblia" items={BIBLE_VERSIONS.filter((v) => v.install).map((v) => ({ label: `Instalar ${v.id}${v.name ? ` · ${v.name}` : ""}${installHint}`, icon: "book", onClick: () => installVersion(v.id) }))} />
                <IconBtn name="grid" small title="Mais: tema da Bíblia, tamanho das células" onClick={(e) => menu(e, { title: "Bíblia", items: [
                    { label: `Tema da Bíblia… · ${bibleTheme ? themeName(bibleTheme) : "estilo de fábrica"}${prefs.bible_theme_id ? "" : " (o mesmo das músicas)"}`, icon: "star", onSelect: chooseTheme },
                    "sep",
                    { label: "Células compactas", icon: grid === "compact" ? "check" : undefined, onSelect: () => setGrid?.("compact") },
                    { label: "Células grandes", icon: grid === "large" ? "check" : undefined, onSelect: () => setGrid?.("large") },
                ] })} />
            </>}>
                {badge && <div className={`bsrc ${badge.warn ? "kx-warn" : ""}`} title={badge.title || badge.text}><Icon name={badge.warn ? "warn" : "check"} size={12} /><span>{badge.text}</span></div>}
                {ver && ver !== wanted && (
                    <div className="warnline"><Icon name="warn" /><span>{fellBack ? `${wanted} sem internet · ${book} ${chapter} na ${ver}` : `${wanted} não instalada · mostrando ${ver}`}</span>
                        {canInstall(wanted) && <Btn small kind="outline" disabled={!online} onClick={() => installVersion(wanted)} title={online ? `Baixar a ${wanted} para usar sem internet` : "Sem internet agora: conecte o computador para baixar"}>Instalar {wanted}{installHint}</Btn>}
                    </div>
                )}
                <div className={`bgrid is-${grid}`} ref={gridRef}>
                    {bibleBooks.map((b, i) => <button type="button" key={b.name} className={`kx-book kx-t ${b.name === book ? "is-selected" : ""}`} style={{ "--group": groupColor(i) }} title={b.name} onClick={() => { setBook(b.name); setChapter(1); setSel([]); }}>{fullNames ? b.name : b.short}</button>)}
                </div>
            </Panel>
        ),
        chapters: (
            <Panel className="bpick-chapters" title="Capítulos" count={`${bookRow.name} · ${bookRow.chapters}`}>
                <div className="bchap">
                    <div className={`chapters is-${grid}`}>
                        {Array.from({ length: bookRow.chapters }, (_, i) => i + 1).map((n) => <button type="button" key={n} className={`kx-t ${n === chapter ? "is-on" : ""}`} onClick={() => { setChapter(n); setSel([]); }}>{n}</button>)}
                    </div>
                </div>
            </Panel>
        ),
        verses: (
            <Panel className="bpick-verses" title="Versículos" count={`${book} ${chapter}`}>
                {!error && verses.length > 0 && (
                    <div className="bverses"><div className={`verse-cells is-${grid}`} role="group" aria-label={`Versículos de ${book} ${chapter}`}>
                        {verses.map((v) => (
                            <button type="button" key={v.number}
                                className={`kx-t ${sel.includes(v.number) ? "is-prev" : ""} ${airHere && airVerseNums.includes(v.number) ? "is-air" : ""}`}
                                onClick={(e) => pickCell(v.number, e)} onDoubleClick={() => sendCell(v.number)}
                                title={`${book} ${chapter}:${v.number} · clique seleciona · 2 cliques projetam`}>{v.number}</button>
                        ))}
                    </div></div>
                )}
            </Panel>
        ),
        reading: (
            <Panel className="bread bible-center" title={mode === "buscar" ? "Buscar na Bíblia" : `${book} ${chapter}${ver ? ` · ${ver}` : ""}`}
                count={mode === "ler" ? "clique ou ↑↓ seleciona · Enter ou 2 cliques projeta · ←→ no ar" : mode === "buscar" ? "↑↓ percorre os resultados · Enter ou 2 cliques projeta" : "versões lado a lado"}
                actions={<>
                    {mode === "ler" && <><Btn small onClick={() => setSel(verses.map((v) => v.number))}>Selecionar todos</Btn><Btn small onClick={() => setSel([])}>Limpar</Btn></>}
                    <Seg small value={mode} onChange={setMode} options={MODES} />
                    <span className="bread-search"><Field inputRef={searchInputRef} value={q} onChange={setQ} placeholder="Buscar: Jo 3:16 ou palavra" kbd="Enter"
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submitTop(); } else if (e.key === "Escape" && mode === "buscar") { e.stopPropagation(); setMode("ler"); } }} /></span>
                </>}>
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
                <div className="bread-b">
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
                                            {canInstall(version || wanted) && <Btn kind="outline" disabled={!online} onClick={() => installVersion(version || wanted)} title={online ? undefined : "Sem internet agora: conecte o computador para baixar"}>Instalar {version || wanted}{installHint}</Btn>}
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
                                        onContextMenu={(e) => menu(e, { title: `${book} ${chapter}:${v.number}`, items: [
                                            { label: "Selecionar", icon: "check", onSelect: () => pick(v.number) },
                                            { label: "Copiar o texto", icon: "text", onSelect: () => copyVerse(v) },
                                            { label: "Enviar ao ar", icon: "play", air: true, onSelect: () => sendCell(v.number) },
                                        ] })}
                                        title={marked.has(v.number) ? `Anotação: ${notesApi.noteOf(book, chapter, v.number)?.note_text || ""}` : "Clique seleciona · 2 cliques projetam a partir deste versículo"}>
                                        <span className="kx-verse-n">{v.number}</span><span>{v.text}{marked.has(v.number) && <span className="be-notemark" aria-label="tem anotação"><Icon name="text" size={12} /></span>}</span>
                                    </button>
                                ))}
                            </div>
                        </>
                    )}
                    {mode === "buscar" && <BibleSearchPanel search={search} selected={searchSel} onPick={pickResult} onSend={sendResult} />}
                    {mode === "comparar" && <BibleCompareView book={book} chapter={chapter} version={version || wanted} sel={sel} onSelect={pick} onSendVersion={sendVersion} onUseVersion={switchVersion} />}
                </div>
            </Panel>
        ),
        air: (
            <Panel className="bible-air-col" title={<span className={c.locked ? "kx-rh" : "kx-air"}>{c.locked ? "No ar · travado" : "No ar agora"}</span>} count={airTitle} bodyStyle={{ display: "flex", flexDirection: "column" }}>
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
                    <Btn kind="prev" className="kx-btn-live" disabled={!stage || c.locked} onClick={() => onSend(stage)} title={sendTip(c.locked)}>{SEND_LABEL}</Btn>
                    <Btn disabled={!sel.length} onClick={addToService}>Adicionar à setlist</Btn>
                    <Btn kind="icon" on={notesApi.isFavorite(reference)} disabled={!reference} onClick={toggleFav} title={notesApi.isFavorite(reference) ? "Tirar dos favoritos" : "Favoritar"}><Icon name="star" /></Btn>
                </div>
            </Panel>
        ),
    };

    return dockProps ? <DockView {...dockProps} render={(id) => (modules[id] ? React.cloneElement(modules[id], { key: id }) : null)} playerDocked={false} /> : null;
}
