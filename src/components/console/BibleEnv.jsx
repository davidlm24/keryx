import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Seg, Empty, Measure, SrState } from "./kx";
import { OT_COUNT, BOOK_SIZES, booksFit, booksHeight, numGrid, numSize, pagesOf, pageOf, pageCells } from "@/lib/console/bibleFit";
import DockView from "./Dock";
import { bibleVersionsHome } from "@/lib/console/dock";
import { useContextMenu } from "./ContextMenu";
import AddMenu from "./AddMenu";
import { MenuButton } from "./Menu";
import BibleSearchPanel, { useBibleSearch } from "./BibleSearchPanel";
import BibleCompareView from "./BibleCompareView";
import { useBibleNotes } from "./useBibleNotes";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { bibleBooks, BIBLE_VERSIONS, parseReference } from "@/lib/bibleBooks";
import { editionCredit, editionOption, versionGroups, installableEditions } from "@/lib/bibleEditions";
import OwnBibleDialog from "./settings/OwnBibleDialog";
import { lookDefaults } from "@/lib/console/lookDefaults";
import { READ_SIZES, READ_DEFAULT, stepRead, readScale, readLabel, readStep, wheelStep } from "@/lib/console/bibleRead";
import { useBibleEditions } from "./useBibleEditions";
import { readChapter, preferredVersion, installedVersions, forgetInstalledVersions } from "@/lib/bibleText";
import { stageFromVerses, stageRebuiltOnAir } from "@/lib/console/stage";
import { SEND_LABEL, sendTip } from "@/lib/console/copy";
import { rangeLabel, groupVerses, passageOf, chapterOnAir, airPassage, airStyle } from "@/lib/console/bibleVerses";
import { verseNumbers } from "@/lib/verseMarks";
import { usePrefs, getPrefs, updateUser } from "@/hooks/useUser";
import { useLibraryPicker } from "./library/libraryContext";
import { useThemes } from "./useConsoleData";
import { themeForKind, themeName } from "@/lib/console/themes";
import { applyThemeOnAir } from "./themeActions";
import useKeepInView, { useFocusFollows } from "./useKeepInView";
import { ScreenActions } from "./CenterPanel";
import { captionParts, airInPlayer } from "@/lib/console/caption";
import { menuItem } from "@/lib/console/menuLabels";

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
//     the whole chapter starting there, so ←/→ keep walking the chapter; a
//     range picked on purpose (Shift/Ctrl+click) goes out as that passage;
//     both grouped 1/2/3/Auto per slide.
// Recentes, Favoritos and Anotações: a button with a dropdown list, side by
// side on the left (the band stays one line high). The count is inside the
// list, at its top, never on the button (owner 2026-10-16).
const countOf = (n, [one, many]) => `${n} ${n === 1 ? one : many}`;
function ListMenu({ icon, label, unit, empty, rows }) {
    const items = [
        { node: <div key="h" className="blist-h"><span className="kx-section">{label}</span><span className="kx-meta">{countOf(rows.length, unit)}</span></div> },
        ...(rows.length ? rows.map((r) => ({ label: r.title, meta: r.meta, icon: r.icon, onSelect: r.onPick })) : [{ node: <div key="e" className="be-hint kx-meta">{empty}</div> }]),
    ];
    // The console's one menu (Menu.jsx): the keyboard walks the list.
    return (
        <MenuButton label={label} items={items} popClass="blist-pop" flip={false}
            trigger={(open, toggle) => <button type="button" className={`bchip kx-t ${open ? "is-on" : ""}`} onClick={toggle} aria-expanded={open} aria-haspopup="menu"><Icon name={icon} size={12} />{label}<Icon name="chevron-down" size={12} /></button>} />
    );
}

// The version select (Rodada P, P3 = A): the sigla and the full name in
// groups (versionGroups), the closed box only the sigla — laid over the
// select, which stays the control (the keyboard, the screen reader).
// `none`: the label of an option "" (the 2ª versão's "Sem 2ª versão").
// The version band's height on top of Livros (--band, console.css): added to
// the measured books, so Livros' locked height holds both.
const VBAND_H = 36;
function VersionSelect({ value, groups, onChange, label, shown, tip, dot, none }) {
    return (
        <span className={`bver ${none && !value ? "is-none" : ""}`} title={tip}>
            <span className="bver-v" aria-hidden="true">{shown}</span>
            <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
                {none && <option value="">{none}</option>}
                {groups.map((g) => <optgroup key={g.id} label={g.label}>{g.items.map((v) => <option key={v.id} value={v.id}>{editionOption(v)}</option>)}</optgroup>)}
            </select>
            {dot && <i className="bver-dot" aria-hidden="true" />}
        </span>
    );
}

// A box's size, kept current (ResizeObserver): { w, h, ref } — the border
// box, padding included, as bibleFit.js counts it.
function useBox() {
    const [box, setBox] = useState({ w: 0, h: 0 });
    const ro = useRef(null);
    const ref = useCallback((el) => {
        ro.current?.disconnect();
        ro.current = null;
        if (!el || typeof ResizeObserver === "undefined") return;
        const read = () => setBox((b) => (b.w === el.offsetWidth && b.h === el.offsetHeight ? b : { w: el.offsetWidth, h: el.offsetHeight }));
        read();
        ro.current = new ResizeObserver(read);
        ro.current.observe(el);
    }, []);
    return { ...box, ref };
}

// A page cell of Capítulos or Versículos (mockup R6, B3 = A): "›" ends
// every page but the last, "‹" starts every page but the first; the
// numbers it goes to in its tooltip.
function PageCell({ cell, what, onGo, label = (n) => n }) {
    const [a, b] = cell.next || cell.prev;
    const range = `${label(a)}–${label(b)}`;
    return (
        <button type="button" className="kx-t bpage" onClick={onGo} title={cell.next ? `Próximos: ${range}` : `Anteriores: ${range}`}
            aria-label={cell.next ? `Próximos ${what}: ${range}` : `${what[0].toUpperCase()}${what.slice(1)} anteriores: ${range}`}>
            <Icon name={cell.next ? "chevron-right" : "chevron-left"} />
        </button>
    );
}

export default function BibleEnv({ c, logoUrl, request, stageRef, apiRef, serviceId, itemsCount, ensureService, onSend, onEnd, dockProps, grid = "medium", setGrid, onChaptersH, onBooksH, onVersesH, booksRoom = 0, readSize = READ_DEFAULT, setReadSize, onSettings }) {
    const [mem, setMem] = useState(load);
    const [version, setVersion] = useState(null);
    const [book, setBook] = useState(mem.book || "João");
    const [chapter, setChapter] = useState(mem.chapter || 3);
    const [sel, setSel] = useState([]);
    // Versículos por slide: the church's choice (Configurações › Bíblia e
    // músicas), changed here too.
    const how = usePrefs().bible_verses_per_slide;
    const setHow = (v) => { updateUser({ bible_verses_per_slide: v }).catch(() => c.say("Não foi possível salvar.")); rebuildAir({ bible_verses_per_slide: v }); };
    const [verses, setVerses] = useState([]);
    const [error, setError] = useState("");
    const [anchor, setAnchor] = useState(null);
    const [mode, setMode] = useState("ler");
    const modeRef = useRef(mode);
    modeRef.current = mode;
    const readingRef = useRef(null);
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
    // chosen in the background library, in theme mode. "O mesmo das
    // músicas" is the theme in use (c.themeId), as stamp() sends it — not
    // the default theme (note 11, Rodada P).
    const themes = useThemes();
    const bibleTheme = themeForKind(themes, "bible", prefs.bible_theme_id, c.themeId);
    const pickTheme = useLibraryPicker();
    const chooseTheme = async () => {
        const r = await pickTheme({ accept: "theme", value: prefs.bible_theme_id || bibleTheme?.id || null, title: "Tema da Bíblia", allowNone: true, noneLabel: "O mesmo das músicas", useLabel: "Usar na Bíblia" });
        const id = r?.theme ? r.theme.id : r?.none ? "" : null;
        if (id === null) return;
        updateUser({ bible_theme_id: id }).then(() => c.say(id ? `Bíblia: tema ${themeName(r.theme)}.` : "Bíblia: o mesmo tema das músicas.")).catch(() => c.say("Não foi possível salvar o tema da Bíblia."));
        // On the passage on air at once: its look and its Fundo (padlock
        // respected), never the songs' theme in use.
        const theme = r?.theme || themeForKind(themes, "bible", "", c.themeId);
        if (theme && canTouchAir()) applyThemeOnAir(c, theme, { inUse: false });
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
    // computer), "online" (bolls.life, needs internet) or null.
    const [source, setSource] = useState(null);
    // The edition of the chapter on screen (`ver`): the chosen one, or the
    // installed one it fell back to (`fellBack`: the one that failed).
    const [chapterVersion, setChapterVersion] = useState(null);
    const [fellBack, setFellBack] = useState(null);
    const ver = chapterVersion || version;
    const search = useBibleSearch(version || wanted, book);

    // A reference from the palette or the quick jump; or a word search from
    // the palette ({ search }): the Bíblia has no search field of its own
    // (owner 2026-10-16, the console's search covers it).
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

    // The 2ª versão (User.bible_version_2, Rodada P, P2-2 = C): the same
    // chapter in a second edition, which each slide carries (bibleVerses.js
    // pair) and the screens draw beside or under the first (User.bible_pair,
    // stamped by look.js). One that cannot be read now (not installed and
    // not online, or no internet) is left out, and the bar says so: never
    // the first edition twice.
    const want2 = prefs.bible_version_2;
    const second = want2 && want2 !== ver ? want2 : "";
    const pairKey = `${second}|${book}|${chapter}`;
    const [pairRead, setPairRead] = useState(null); // { key, version, verses } | { key, failed }
    useEffect(() => {
        if (!second || !ver) return undefined;
        let alive = true;
        readChapter(second, book, chapter).then((r) => {
            if (alive) setPairRead(r.version === second ? { key: pairKey, version: second, verses: r.verses } : { key: pairKey, failed: true });
        }).catch(() => { if (alive) setPairRead({ key: pairKey, failed: true }); });
        return () => { alive = false; };
    }, [second, book, chapter, ver, installRev]); // eslint-disable-line react-hooks/exhaustive-deps
    const pair = second && pairRead?.key === pairKey && !pairRead.failed ? pairRead : null;
    const pairFailed = Boolean(second && pairRead?.key === pairKey && pairRead.failed);

    // What is on air, when it is this chapter (whatever second edition and
    // grouping it has).
    const onAir = c.cur?.content?.kind === "bible" ? c.cur.content : null;
    const airIsChapter = chapterOnAir(onAir, { book, chapter, version: ver, version2: onAir?.ref?.version2, how: onAir?.ref?.how });
    // The church's display now (Ref., Lado a lado | Empilhadas): a chapter on
    // air shown otherwise is sent again, never only moved (bibleVerses.js).
    const look = useMemo(() => lookDefaults(prefs).bible, [prefs]);
    const airHere = Boolean(onAir && (airIsChapter || String(onAir.ref?.reference || onAir.title).startsWith(`${book} ${chapter}:`)));
    const airSlideText = onAir ? String(onAir.slides[onAir.index]?.text || "") : "";
    const airVerseNums = useMemo(() => verseNumbers(airSlideText), [airSlideText]);
    // The verse on air follows ←/→ in the list and in the grid (0.2.18): the
    // list moves at the next-to-last verse, as the Slides column does
    // (useKeepInView; several verses on one slide count as one span).
    const cellsRef = useRef(null);
    const airKey = airHere ? `${book} ${chapter}:${airVerseNums.join(",")}` : "";
    useKeepInView(readingRef, ".kx-verse.is-air", [airKey, mode]);
    // A verse (row or cell) focused with Tab follows the green selection
    // (↑/↓), so Enter acts on the one highlighted.
    const selKey = sel.join(",");
    useFocusFollows(readingRef, ".kx-verse", ".kx-verse.is-prev", [selKey, mode]);
    useFocusFollows(cellsRef, "button", "button.is-prev", [selKey]);

    const stageFor = useCallback((nums) => stageFromVerses({ verses, nums, how, version: ver, book, chapter, onAir, pair, look }), [verses, how, ver, book, chapter, onAir, pair, look]);
    const verseStage = useCallback((n) => stageFor([n]), [stageFor]);
    const picked = verses.filter((v) => sel.includes(v.number));
    // A chapter that cannot load has nothing selected (C-48), whatever was asked.
    const reference = sel.length && !error ? `${book} ${chapter}:${rangeLabel(sel)}` : "";
    const stage = useMemo(() => stageFor(sel), [stageFor, sel]);
    // Selecionado: the slides that go out — a range's, or one verse's slide
    // of its chapter, grouped as the bar says (1/2/3/Auto).
    const slides = useMemo(() => (sel.length > 1 ? groupVerses(picked, how, pair) : stage?.slides?.[stage.index] ? [stage.slides[stage.index]] : []), [picked, how, sel.length, pair, stage]);
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
            // The 2ª versão of that chapter too, when it can be read.
            const two = want2 && want2 !== got.version ? await readChapter(want2, r.book, r.chapter).catch(() => null) : null;
            const st = stageFromVerses({ verses: got.verses, nums: [r.verse], how, version: got.version, book: r.book, chapter: r.chapter, onAir, look, pair: two?.version === want2 ? { version: want2, verses: two.verses } : null });
            if (st) onSend(st);
        } catch (err) { c.say(err?.message || "Não foi possível abrir o capítulo."); }
    }, [pickResult, version, want2, how, onAir, look, onSend, c]);

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
    const goRef = (text) => { const r = parseReference(text); if (!r) { c.say("Referência não reconhecida. Ex.: Jo 3:16-21"); return false; } setBook(r.book); setChapter(r.chapter); setSel(r.verseStart ? Array.from({ length: r.verseEnd - r.verseStart + 1 }, (_, i) => r.verseStart + i) : []); setAnchor(r.verseStart || null); return true; };
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
        const passage = passageOf({ verses, nums: sel, how, version: ver, book, chapter, pair });
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
    // The 2ª versão rides too (none when it is that version).
    const sendVersion = (v, vs) => {
        const st = stageFromVerses({ verses: vs, nums: sel, how, version: v, book, chapter, onAir, pair, look });
        if (st) onSend(st);
    };
    const switchVersion = (v) => { chooseVersion(v); c.say(`Bíblia na ${v}.`); };

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
    // The edition, only when something is off (owner 2026-10-16: no line of
    // text under Livros): from the internet, missing, or the preview's
    // samples — an amber dot on the version select, the words in its tooltip.
    // Installed here says nothing.
    const canInstall = (v) => Boolean(BIBLE_VERSIONS.find((x) => x.id === v)?.install) && !installed.includes(v);
    const badge = error ? { text: `${ver || wanted} · não disponível` }
        : keryx.isPreview && source ? { text: `${ver} · texto de exemplo (prévia). Na prévia de desenvolvimento os versículos são de exemplo; no aplicativo vêm da Bíblia instalada.` }
            : source === "online" ? { text: `${ver} · pela internet.${fellBack ? "" : ` Sem internet, os capítulos ainda não lidos vêm de uma versão instalada.${canInstall(ver) ? " Instale-a pelo + para usar sem internet." : ""}`}` }
                : null;
    const others = installed.filter((v) => v !== (version || wanted));
    // The list and the church's own editions; an open one's credit is the
    // select's tooltip (owner 2026-10-20, b3 = sobre: Sobre says it too).
    const editions = useBibleEditions();
    const credit = editionCredit(editions.find((v) => v.id === (ver || wanted)));
    // The version list (P3): Instaladas, Ler pela internet, Da igreja; the
    // 2ª versão's the same, without the first edition.
    const groups = useMemo(() => versionGroups(editions, installed, wanted), [editions, installed, wanted]);
    const groups2 = useMemo(() => versionGroups(editions, installed, want2).map((g) => ({ ...g, items: g.items.filter((v) => v.id !== wanted || v.id === want2) })).filter((g) => g.items.length), [editions, installed, want2, wanted]);
    // The (+): only what is missing here (note 5), then the church's own
    // file (the BKJ 1611's door, note 1) and Configurações.
    const [ownOpen, setOwnOpen] = useState(false);
    const bibleBridge = useRef(typeof window === "undefined" ? null : window.keryxDesktop?.bible);
    const openOwn = () => { if (bibleBridge.current) setOwnOpen(true); else c.say("Instalar Bíblias funciona no KERYX do computador."); };
    const toInstall = installableEditions(editions, installed);
    const installItems = [
        { head: "Instalar neste computador" },
        ...(toInstall.length
            ? toInstall.map((v) => ({ label: `${editionOption(v)}${installHint}`, icon: "book", onClick: () => installVersion(v.id) }))
            : [{ label: "Todas as versões da lista estão instaladas", icon: "check", disabled: true }]),
        "sep",
        { label: "Instalar uma edição própria…", icon: "plus", title: "Uma Bíblia que a igreja tem em arquivo (a BKJ 1611 e outras)", onClick: openOwn },
        { label: "Bíblias instaladas…", icon: "sliders", title: "Configurações › Bíblia e músicas", onClick: () => onSettings?.("biblia") },
    ];
    // The line above the No ar screen (Q5) and the version band on Livros
    // (Rodada R, R2b = C): what the screens show of a
    // passage, saved for the church (User), stamped at send (lookDefaults.js).
    const savePref = (patch, said) => { updateUser(patch).then(() => { if (said) c.say(said); }).catch(() => c.say("Não foi possível salvar.")); };
    const chooseVersion = (v) => { setWanted(v); rebuildAir({ bible_version: v }); };
    const showRef = prefs.bible_show_reference !== false;
    const themeLabel = bibleTheme ? themeName(bibleTheme) : "estilo de fábrica";
    const pairTip = !want2 ? "Uma segunda versão nas telas, junto da primeira"
        : pairFailed ? `A ${want2} não pôde ser lida agora (sem internet ou não instalada): as telas mostram só a ${ver || wanted}.`
            : want2 === (ver || wanted) ? `A ${want2} já é a primeira versão: as telas mostram uma só.` : `2ª versão nas telas: ${want2}`;
    // The reading text's size (P5 = A): this computer's, never the screens'.
    const readNow = readStep(readSize);
    const zoomRead = useRef(null);
    zoomRead.current = (d) => setReadSize?.(stepRead(readNow, d));
    // Ctrl + the wheel over the text: a listener that is not passive, so it
    // never zooms the whole console; a callback ref, since the dock may
    // mount the panel again elsewhere.
    const wheelOff = useRef(null);
    const readRef = useCallback((el) => {
        wheelOff.current?.();
        wheelOff.current = null;
        if (!el) return;
        const onWheel = (e) => { const d = wheelStep(e); if (d === null) return; e.preventDefault(); zoomRead.current?.(d); };
        el.addEventListener("wheel", onWheel, { passive: false });
        wheelOff.current = () => el.removeEventListener("wheel", onWheel);
    }, []);

    // The bar's changes reach what is on air at once (owner 2026-10-22, as
    // in Holyrics: the Bíblia has no Prévia, the screen above the bar is No
    // ar), when it is a passage and the screens are not locked: the theme
    // through applyThemeOnAir (chooseTheme), Ref. and Lado a lado |
    // Empilhadas on its style, and the grouping, the version and the 2ª
    // versão rebuild it (stageRebuiltOnAir: a whole chapter, or a range the
    // Bíblia sent), the verse on air still on screen, in ONE change. A
    // passage of the Setlist keeps its slides. Locked, the next send carries
    // them (chapterOnAir sends the chapter again).
    const live = useRef(null);
    live.current = { c, prefs };
    const bibleOnAir = () => { const on = live.current.c.cur?.content; return on?.kind === "bible" ? on : null; };
    const canTouchAir = () => {
        if (!bibleOnAir()) return false;
        if (live.current.c.locked) { live.current.c.say("Telas travadas · a passagem no ar muda quando for enviada de novo."); return false; }
        return true;
    };
    const restyleAir = (patch) => {
        if (!canTouchAir()) return;
        const on = bibleOnAir();
        const now = lookDefaults({ ...live.current.prefs, ...patch }).bible;
        live.current.c.callOp("content.update", { style: airStyle(on.style, now, on.slides.some((x) => x.pair)) }).catch(() => { /* callOp said why */ });
    };
    const rebuildAir = async (patch) => {
        if (!canTouchAir()) return;
        const on = bibleOnAir();
        const t = airPassage(on);
        if (!t) return;
        const next = { ...live.current.prefs, ...patch };
        try {
            const got = await readChapter(next.bible_version, t.book, t.chapter);
            const w2 = next.bible_version_2;
            const two = w2 && w2 !== got.version ? await readChapter(w2, t.book, t.chapter).catch(() => null) : null;
            const st = stageRebuiltOnAir(on, { verses: got.verses, version: got.version, how: next.bible_verses_per_slide, pair: two?.version === w2 ? { version: w2, verses: two.verses } : null });
            // Something else went on air meanwhile, or the screens locked: leave it.
            const cc = live.current.c;
            if (!st || bibleOnAir()?.startedAt !== on.startedAt || cc.locked) return;
            const args = cc.stamp("content.show", { ...st.args, index: st.index });
            await cc.callOp("content.update", { title: args.title, slides: args.slides, style: args.style, ref: args.ref, index: st.index });
        } catch (err) { if (err?.message) live.current.c.say(err.message); }
    };

    // What the No ar pill's dot says (the Programa's tones, ProgramaPill).
    const airCap = captionParts(c.cur).title;
    const airIdle = airCap === "nada" && !airInPlayer(c.cur);
    const airTone = c.locked ? "rh" : airIdle ? "idle" : "air";
    const airSaid = `${airIdle ? "Nada no ar" : `No ar: ${airCap}`}${c.locked ? " · travado" : ""}`;
    const searchSel = sel.length === 1 ? { book, chapter, verse: sel[0] } : null;

    // The version, the 2ª versão and where it goes (Rodada R, owner
    // 2026-10-29, R2b = C): a band on top of Livros; with Livros in the tray,
    // back in the line above the No ar screen (bibleVersionsHome, dock.js).
    const versionsHome = bibleVersionsHome(dockProps?.dock);
    const versionControls = (
        <>
            <VersionSelect value={wanted} groups={groups} onChange={chooseVersion} shown={wanted} dot={Boolean(badge)}
                label={badge ? `Versão: ${badge.text}` : "Versão"} tip={[badge?.text, credit].filter(Boolean).join(" · ") || "Versão da Bíblia"} />
            <VersionSelect value={want2} groups={groups2} none="Sem 2ª versão" onChange={(v) => { savePref({ bible_version_2: v }, v ? `2ª versão nas telas: ${v}.` : "Uma versão só nas telas."); rebuildAir({ bible_version_2: v }); }}
                shown={want2 ? <><span className="bb-2l">2ª:{" "}</span>{want2}</> : <>+ 2ª<span className="bb-2l">{" "}versão</span></>} dot={pairFailed || Boolean(want2 && want2 === (ver || wanted))} label={`Segunda versão nas telas · ${want2 || "nenhuma"}`} tip={pairTip} />
            {want2 && <Seg small className="bb-pair" label="Onde fica a 2ª versão" value={prefs.bible_pair} onChange={(v) => { savePref({ bible_pair: v }); restyleAir({ bible_pair: v }); }}
                options={[["side", <Icon name="cols" />, { title: "Lado a lado: as duas versões lado a lado", "aria-label": "Lado a lado" }], ["stack", <Icon name="rows" />, { title: "Empilhadas: a 2ª versão embaixo da primeira, um pouco menor", "aria-label": "Empilhadas" }]]} />}
        </>
    );

    // Livros, Capítulos and Versículos fit their cells (owner 2026-10-29,
    // mockup R6; bibleFit.js): each body is measured and what all of its
    // cells would take is reported to the console (bibleLocks, dock.js).
    // The books step down in size to fit the room the default column
    // leaves them (`booksRoom`), else the box they are given.
    const [warnH, setWarnH] = useState(0);
    const booksBox = useBox();
    const booksExtra = (versionsHome === "books" ? VBAND_H : 0) + (ver && ver !== wanted ? warnH : 0);
    const booksSize = booksFit({ width: booksBox.w, height: booksRoom > 0 ? booksRoom - booksExtra : booksBox.h, pref: grid });
    const booksReport = booksBox.w ? (booksRoom > 0 ? booksSize.height : booksHeight(BOOK_SIZES.find((s) => s.id === grid) || BOOK_SIZES[1], booksBox.w)) + booksExtra : 0;
    useEffect(() => { onBooksH?.(booksReport); }, [booksReport, onBooksH]);
    // Capítulos: one page when the cells fit, else pages; the page shows
    // the chapter chosen.
    const chBox = useBox();
    const chGrid = numGrid({ total: bookRow.chapters, width: chBox.w, height: chBox.h, size: numSize(grid, "chapters") });
    const chReport = chBox.w ? chGrid.natural : 0;
    useEffect(() => { onChaptersH?.(chReport); }, [chReport, onChaptersH]);
    const chPages = useMemo(() => pagesOf(bookRow.chapters, chGrid.perPage), [bookRow.chapters, chGrid.perPage]);
    const [chPage, setChPage] = useState(0);
    useEffect(() => { setChPage(pageOf(chPages, chapter)); }, [chPages, chapter, book]);
    const chPageAt = Math.min(chPage, Math.max(0, chPages.length - 1));
    // Versículos: the page follows what moved last — the verse on air (←/→)
    // or the verse selected (↑/↓ turn it at the edge); a new chapter opens
    // on the selection's page, else the air's, else page 1.
    const vBox = useBox();
    const vGrid = numGrid({ total: verses.length, width: vBox.w, height: vBox.h, size: numSize(grid, "verses") });
    const vReport = vBox.w && !error ? vGrid.natural : 0;
    useEffect(() => { onVersesH?.(vReport); }, [vReport, onVersesH]);
    const vPages = useMemo(() => pagesOf(verses.length, vGrid.perPage), [verses.length, vGrid.perPage]);
    const [vPage, setVPage] = useState(0);
    const selFocus = sel.length ? (sel.includes(anchor) ? anchor : sel[sel.length - 1]) : null;
    const airFocus = airHere ? airVerseNums[0] ?? null : null;
    const lastFocus = useRef({});
    useEffect(() => {
        const was = lastFocus.current;
        lastFocus.current = { air: airFocus };
        const n = airFocus != null && airFocus !== was.air ? airFocus : selFocus ?? airFocus;
        const i = n == null ? -1 : verses.findIndex((v) => v.number === n);
        setVPage(i >= 0 ? pageOf(vPages, i + 1) : 0);
    }, [selFocus, airFocus, vPages, verses, book, chapter]);
    const vPageAt = Math.min(vPage, Math.max(0, vPages.length - 1));

    // The Bíblia's modules (owner layout 2026-10-12: Livro · Capítulo ·
    // Versículo stacked on the left under the version and search, the
    // chosen text in the middle, what is on air on the right). Where they go
    // is the Bíblia's dock (Ver › Editar disposição; src/lib/console/dock.js,
    // Console.jsx keeps it): each is built here apart from its place.
    const modules = {
        books: (
            <Panel className="bpick-books" title="Livros" actions={<>
                <AddMenu title="Instalar uma versão da Bíblia" items={installItems} />
                <IconBtn name="more" small title="Mais: tema da Bíblia, tamanho das células" onClick={(e) => menu(e, { title: "Bíblia", items: [
                    { label: `Tema da Bíblia… · ${themeLabel}${prefs.bible_theme_id ? "" : " (o mesmo das músicas)"}`, icon: "star", onSelect: chooseTheme },
                    "sep",
                    { label: "Células pequenas", icon: grid === "small" ? "check" : undefined, onSelect: () => setGrid?.("small") },
                    { label: "Células médias", icon: grid === "medium" ? "check" : undefined, onSelect: () => setGrid?.("medium") },
                    { label: "Células grandes", icon: grid === "large" ? "check" : undefined, onSelect: () => setGrid?.("large") },
                ] })} />
            </>}>
                {versionsHome === "books" && <div className="bver-band" role="group" aria-label="Versão da Bíblia nas telas">{versionControls}</div>}
                {ver && ver !== wanted && (
                    <Measure onHeight={setWarnH}><div className="warnline"><Icon name="warn" /><span>{fellBack ? `${wanted} sem internet · ${book} ${chapter} na ${ver}` : `${wanted} não instalada · mostrando ${ver}`}</span>
                        {canInstall(wanted) && <Btn small kind="outline" disabled={!online} onClick={() => installVersion(wanted)} title={online ? `Baixar a ${wanted} para usar sem internet` : "Sem internet agora: conecte o computador para baixar"}>Instalar {wanted}{installHint}</Btn>}
                    </div></Measure>
                )}
                {/* The 66 books always whole (owner 2026-10-29, mockup R6):
                    Antigo and Novo Testamento apart (B1 = A), the cell
                    stepping down until they fit, the names last (B4 = A;
                    bibleFit.js); the rows share what is left. */}
                <div className="bbooks" ref={booksBox.ref}>
                    {[["Antigo Testamento", bibleBooks.slice(0, OT_COUNT), 0], ["Novo Testamento", bibleBooks.slice(OT_COUNT), OT_COUNT]].map(([label, list, from]) => (
                        <React.Fragment key={label}>
                            <div className="bt-head"><span className="kx-section">{label}<span className="kx-count"> · {list.length}</span></span></div>
                            <div className={`bgrid is-${booksSize.id}`} role="group" aria-label={label}
                                style={{ gridTemplateColumns: `repeat(${booksSize.cols}, minmax(0, 1fr))`, gridAutoRows: `minmax(${booksSize.h}px, 1fr)`, flexGrow: Math.ceil(list.length / booksSize.cols) }}>
                                {list.map((b, i) => <button type="button" key={b.name} className={`kx-book kx-t ${b.name === book ? "is-selected" : ""}`} style={{ "--group": groupColor(from + i) }} title={b.name} aria-label={b.name} aria-current={b.name === book ? "true" : undefined} onClick={() => { setBook(b.name); setChapter(1); setSel([]); }}><b className="kx-book-a" aria-hidden="true">{b.short}</b>{booksSize.names && <small className="kx-book-n" aria-hidden="true">{b.name}</small>}</button>)}
                            </div>
                        </React.Fragment>
                    ))}
                </div>
            </Panel>
        ),
        chapters: (
            <Panel className="bpick-chapters" title="Capítulos" count={`${bookRow.name} · ${bookRow.chapters}`}>
                {/* As tall as its cells (Console.jsx locks the height, capped);
                    past that, in pages (B3 = A). */}
                <div className="bchap" ref={chBox.ref}>
                    <div className={`chapters is-${grid}`} style={{ gridTemplateColumns: `repeat(${chGrid.cols}, minmax(0, 1fr))` }}>
                        {pageCells(chPages, chPageAt).map((cell) => (cell.n
                            ? <button type="button" key={cell.n} className={`kx-t ${cell.n === chapter ? "is-on" : ""}`} aria-current={cell.n === chapter ? "true" : undefined} onClick={() => { setChapter(cell.n); setSel([]); }}>{cell.n}</button>
                            : <PageCell key={cell.next ? "next" : "prev"} cell={cell} what="capítulos" onGo={() => setChPage(chPageAt + (cell.next ? 1 : -1))} />))}
                    </div>
                </div>
            </Panel>
        ),
        verses: (
            <Panel className="bpick-verses" title="Versículos" count={`${book} ${chapter}`}>
                {/* As tall as its cells too (P4-3 = A); past that, in pages. */}
                <div className="bverses" ref={vBox.ref}>
                    {!error && verses.length > 0 && (
                        <div ref={cellsRef} className={`verse-cells is-${grid}`} role="group" aria-label={`Versículos de ${book} ${chapter}`} style={{ gridTemplateColumns: `repeat(${vGrid.cols}, minmax(0, 1fr))` }}>
                            {pageCells(vPages, vPageAt).map((cell) => {
                                if (!cell.n) return <PageCell key={cell.next ? "next" : "prev"} cell={cell} what="versículos" label={(n) => verses[n - 1]?.number ?? n} onGo={() => setVPage(vPageAt + (cell.next ? 1 : -1))} />;
                                const v = verses[cell.n - 1];
                                const state = `${sel.includes(v.number) ? "is-prev" : ""} ${airHere && airVerseNums.includes(v.number) ? "is-air" : ""}`;
                                return (
                                    <button type="button" key={v.number} className={`kx-t ${state}`}
                                        aria-current={airHere && airVerseNums.includes(v.number) ? "true" : undefined}
                                        onClick={(e) => pickCell(v.number, e)} onDoubleClick={() => sendCell(v.number)}
                                        title={`${book} ${chapter}:${v.number} · clique seleciona · 2 cliques projetam`}>{v.number}<SrState cls={state} /></button>
                                );
                            })}
                        </div>
                    )}
                </div>
            </Panel>
        ),
        reading: (

            <Panel className="bread bible-center" title={mode === "buscar" ? "Buscar na Bíblia" : `${book} ${chapter}`}
                actions={<>
                    {mode === "ler" && <><IconBtn small name="checks" className="bread-sel" title="Selecionar todos" onClick={() => setSel(verses.map((v) => v.number))} /><IconBtn small name="x" className="bread-sel" title="Limpar a seleção" onClick={() => setSel([])} /></>}
                    <div className="kx-seg is-small bread-size" role="group" aria-label={`Tamanho do texto da leitura · ${readLabel(readNow)}`}>
                        <button type="button" className="kx-t" disabled={readNow === 0} onClick={() => zoomRead.current(-1)} title="Letra menor na leitura · Ctrl + roda do mouse">A−</button>
                        <button type="button" className={`kx-t ${readNow === READ_DEFAULT ? "is-on" : ""}`} aria-pressed={readNow === READ_DEFAULT} onClick={() => setReadSize?.(READ_DEFAULT)} title={`Letra da leitura: ${readLabel(readNow)} · A volta ao M · não muda as telas`}>A</button>
                        <button type="button" className="kx-t" disabled={readNow === READ_SIZES.length - 1} onClick={() => zoomRead.current(1)} title="Letra maior na leitura · Ctrl + roda do mouse">A+</button>
                    </div>
                    <Seg small label="Modo do texto" value={mode} onChange={setMode} options={MODES} />
                </>}>
                <div className="bband-lists">
                    <ListMenu icon="history" label="Recentes" unit={["capítulo", "capítulos"]} empty="Os capítulos que você abrir aparecem aqui."
                        rows={(mem.recent || []).map(([b, ch]) => ({ key: `${b}${ch}`, icon: "history", title: `${b} ${ch}`, onPick: () => { setBook(b); setChapter(ch); setSel([]); setMode("ler"); } }))} />
                    <ListMenu icon="star" label="Favoritos" unit={["favorito", "favoritos"]} empty="Selecione versículos e use a estrela."
                        rows={notesApi.favorites.map((fv) => ({ key: fv.id, icon: "star", title: fv.reference, onPick: () => { if (goRef(fv.reference)) setMode("ler"); } }))} />
                    <ListMenu icon="text" label="Anotações" unit={["anotação", "anotações"]} empty="Selecione um versículo e escreva à direita."
                        rows={notesApi.notes.map((n) => ({ key: n.id, icon: "text", title: n.reference, meta: n.note_text, onPick: () => { if (goRef(n.reference)) setMode("ler"); } }))} />
                </div>
                <div className={`bread-b ${readNow === READ_DEFAULT ? "" : "is-sized"}`} ref={readRef} style={{ "--bread-k": readScale(readNow) }}>
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
                                        aria-current={airHere && airVerseNums.includes(v.number) ? "true" : undefined}
                                        onClick={(e) => pick(v.number, e)}
                                        onDoubleClick={() => { const st = verseStage(v.number); if (st) { setSel([v.number]); setAnchor(v.number); onSend(st); } }}
                                        onContextMenu={(e) => menu(e, { title: `${book} ${chapter}:${v.number}`, items: [
                                            menuItem("porNaPrevia", { onSelect: () => pick(v.number) }),
                                            { label: "Copiar o texto", icon: "text", onSelect: () => copyVerse(v) },
                                            menuItem("enviarAoAr", { air: true, onSelect: () => sendCell(v.number) }),
                                        ] })}
                                        title={marked.has(v.number) ? `Anotação: ${notesApi.noteOf(book, chapter, v.number)?.note_text || ""}` : "Clique seleciona · 2 cliques projetam a partir deste versículo"}>
                                        <span className="kx-verse-n">{v.number}</span><SrState cls={`${sel.includes(v.number) ? "is-prev" : ""} ${airHere && airVerseNums.includes(v.number) ? "is-air" : ""}`} /><span>{v.text}{marked.has(v.number) && <span className="be-notemark" aria-label="tem anotação"><Icon name="text" size={12} /></span>}</span>
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
            <Panel className="bible-air-col" noHead bodyStyle={{ display: "flex", flexDirection: "column" }}>
                <div className={`bbar ${versionsHome === "air" ? "has-versions" : ""}`} role="group" aria-label="Como a Bíblia aparece nas telas">
                    <Btn small kind="icon" onClick={chooseTheme} aria-label="Tema da Bíblia…" title={`Tema da Bíblia… · ${themeLabel}${prefs.bible_theme_id ? "" : " (o mesmo das músicas)"}`}><Icon name="palette" /></Btn>
                    <Btn small on={showRef} onClick={() => { savePref({ bible_show_reference: !showRef }, showRef ? "Telas sem a referência." : "Telas com a referência."); restyleAir({ bible_show_reference: !showRef }); }} title={showRef ? "A referência (João 3:16) aparece nas telas · clique para tirar" : "Sem a referência nas telas · clique para mostrar"}>Ref.</Btn>
                    <div className="kx-seg is-small" role="group" aria-label="Versículos por slide">
                        {[["1", "1"], ["2", "2"], ["3", "3"], ["auto", "Auto"]].map(([v, l]) => <button type="button" key={v} className={`kx-t ${how === v ? "is-on" : ""}`} aria-pressed={how === v} aria-label={v === "auto" ? "Auto" : undefined} onClick={() => setHow(v)} title={v === "auto" ? "Versículos por slide: pelo tamanho do texto" : `${v} versículo${v === "1" ? "" : "s"} por slide`}>{v === "auto" ? <><span className="bb-full">Auto</span><span className="bb-short" aria-hidden="true">A</span></> : l}</button>)}
                    </div>
                    {versionsHome === "air" && versionControls}
                </div>
                <div className="bible-air">
                    {/* No header (owner 2026-10-16): the screen sits on top, and
                        its pill is the Programa's with icons only — the state's
                        dot and the screen actions (they left the top bar, Rodada E1). */}
                    <div className={`kx-mon ${c.locked ? "is-rh" : airIdle ? "" : "is-air"}`}><div className="kx-mon-screen"><ScreenRenderer state={c.cur} logoUrl={logoUrl} preview />
                        <div className={`prog-pill kx-pill scr-pill is-${airTone}`} role="group" aria-label={`No ar · ${airSaid}`} title={airSaid}><i className="pp-dot kx-pill-dot" aria-hidden="true" /><ScreenActions c={c} onEnd={onEnd} /></div>
                    </div></div>
                </div>
                <div className="kx-panel-h" style={{ borderTop: "1px solid var(--line)" }}>
                    <span className="kx-section">Selecionado <span className="kx-count">· {error ? `${book} ${chapter} indisponível nesta versão` : sel.length ? `${reference}${sel.length > 1 ? ` · ${slides.length} ${slides.length === 1 ? "slide" : "slides"}` : " · capítulo a partir daqui"}` : "nenhum"}</span></span>

                </div>
                <div className="vgroup" style={{ overflow: "auto", flex: 1, minHeight: 0 }}>
                    {!slides.length && <Empty title="Nenhum versículo selecionado">{error ? null : "Clique num versículo ou use ↑ ↓. Enter projeta."}</Empty>}
                    {slides.map((s, i) => <div key={i} className="vslide"><b>{i + 1}</b><span>{s.text}{s.pair && <small className="vslide-2"><b>{s.pair.version}</b> {s.pair.text}</small>}</span></div>)}
                </div>
                {oneVerse && (
                    <div className="be-note">
                        <div className="listhead"><span className="kx-section">Anotação <span className="kx-count">· {book} {chapter}:{oneVerse.number} · só no console</span></span></div>
                        <textarea key={`${book}:${chapter}:${oneVerse.number}:${note?.id || "novo"}`} className="ed-text" rows={3} defaultValue={note?.note_text || ""} placeholder="Uma nota sobre este versículo (não vai para as telas)" aria-label="Anotação"
                            onBlur={(e) => saveNote(e.target.value)} />
                    </div>
                )}
                <div style={{ display: "flex", gap: "var(--space-1)", padding: "var(--space-1)", flexWrap: "wrap", borderTop: "1px solid var(--line)" }}>
                    <Btn kind="prev" className="kx-btn-live" disabled={!stage || c.locked} onClick={() => onSend(stage)} title={sendTip(c.locked)}>{SEND_LABEL}</Btn>
                    <Btn disabled={!reference} onClick={addToService}>Adicionar à setlist</Btn>
                    <Btn kind="icon" on={notesApi.isFavorite(reference)} disabled={!reference} onClick={toggleFav} title={notesApi.isFavorite(reference) ? "Tirar dos favoritos" : "Favoritar"}><Icon name="star" /></Btn>
                </div>
            </Panel>
        ),
    };

    return dockProps ? (
        <>
            <DockView {...dockProps} render={(id, fold) => (modules[id] ? React.cloneElement(modules[id], { key: id, fold }) : null)} playerDocked={false} />
            {/* Instalar uma edição própria… from the (+): the dialog of Configurações › Bíblia e músicas. */}
            <OwnBibleDialog open={ownOpen} taken={editions.map((v) => v.id)} bible={bibleBridge.current} say={c.say}
                onInstalled={() => { forgetInstalledVersions(); setInstallRev((n) => n + 1); }} onClose={() => setOwnOpen(false)} />
        </>
    ) : null;

}
