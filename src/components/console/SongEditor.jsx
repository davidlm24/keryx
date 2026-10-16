import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, Empty, WinBar, useUnloadGuard } from "./kx";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { emptyState } from "@shared/live-state.mjs";
import { songContent, isVideoUrl } from "@/lib/console/content";
import { songTheme, songParts, cleanPartThemes } from "@/lib/console/songTheme";
import { applyWithFundo, bgSpec } from "@/lib/console/backgroundSpec";
import BgChip from "./library/BgChip";
import { parseChords, slidesFromLyrics, linesLimit, withTimings, parseDuration, formatDuration } from "@/lib/songImport";
import { fitMarks } from "@/lib/console/lyricSync";
import { chordLinesToInline, hasInlineChords, isChordLine, keyChords, transposeInline, transposeChords, transposeChord } from "@/lib/chords";
import { printSong } from "@/lib/printSong";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { slideFit, stanzaAt, slideSpan } from "@/lib/console/lyricFit";
import { useContextMenu } from "./ContextMenu";
import LinesPicker from "./LinesPicker";
import { TEXT_SIZES, defaultTheme, followsTheme, themeStyle, themeName } from "@/lib/console/themes";
import { useWinCol } from "./winLayout";

const CATEGORIES = [["worship", "Adoração"], ["praise", "Louvor"], ["hymn", "Hino"], ["contemporary", "Contemporâneo"], ["other", "Outro"]];
const FONTS = [["sans", "Sem serifa"], ["serif", "Serifa"], ["mono", "Mono"], ["cursive", "Cursiva"], ["arial", "Arial"], ["georgia", "Georgia"], ["times", "Times"], ["verdana", "Verdana"]];
const SIZES = TEXT_SIZES;
const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["outline", "Contorno"], ["3d", "3D"], ["neon", "Neon"], ["none", "Nenhum"]];
const SWATCHES = [["#ffffff", "Branco"], ["#f3e6c9", "Creme"], ["#c9dcff", "Azul claro"], ["#ffe08a", "Amarelo"], ["#1a1a1a", "Preto"]];
// The slide previews' size, remembered on this computer.
const THUMBS = [["s", "P", { title: "Prévias pequenas" }], ["m", "M", { title: "Prévias médias" }], ["l", "G", { title: "Prévias grandes" }]];
const THUMBS_KEY = "keryx.console.editor.thumbs";
const readThumbs = () => { try { const v = localStorage.getItem(THUMBS_KEY); return ["s", "m", "l"].includes(v) ? v : "m"; } catch { return "m"; } };

// A song's background fields for a spec (null: none of its own); the
// picture stays in background_image too for whoever still reads only it.
const songBg = (spec) => ({ background: spec || null, background_image: spec?.kind === "image" ? spec.value : "" });

const NEW_SONG = { title: "", artist: "", lyrics: "", duration: null, category: "worship", audio_url: "", background_image: "", theme_id: "", part_themes: {}, slides: [], font_size: "large", font_family: "sans", text_effect: "shadow", text_color: "#ffffff", bpm: null, song_key: "", chords: "", musician_notes: "", ccli_number: "", is_favorite: false };
const unCR = (t) => String(t ?? "").replace(/\r\n?/g, "\n");
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// The song editor (canvas artboard 16), inside the console: song data and
// style on the left, the lyrics in the middle, the live slide split and the
// song's video or playback with lyric timing on the right. Nothing here
// changes what is on air. Opening a song keeps its saved slides; editing the
// lyrics (or the split) redoes them, keeping timings by position.
export default function SongEditor({ c, songId, themes = [], onClose, onSaved, escRef, active = true, onEditTheme = null, onSync = null, autoSync = false }) {
    // The columns a splitter resizes, kept per page on this computer (Rodada D3).
    const colDados = useWinCol("song.dados", { def: 340, min: 280, max: 560 });
    const colLetra = useWinCol("song.letra", { def: 480, min: 300, max: 900 });
    const rowSlides = useWinCol("song.slides", { def: 380, min: 140, max: 1200, horizontal: true });
    const [song, setSong] = useState(null);
    const [error, setError] = useState("");
    const [split, setSplit] = useState(0); // lines per slide, 0 = Estrofe
    const [showChords, setShowChords] = useState(false); // the thumbs as the Palco reads them
    const [thumbs, setThumbsState] = useState(readThumbs);
    const setThumbs = (v) => { setThumbsState(v); try { localStorage.setItem(THUMBS_KEY, v); } catch { /* not remembered */ } };
    const [resplit, setResplit] = useState(false);
    const [durationText, setDurationText] = useState("");
    const [sel, setSel] = useState(0);
    const [cifraOpen, setCifraOpen] = useState(false);
    const [cifraText, setCifraText] = useState("");
    const [starts, setStarts] = useState([]);
    const [busy, setBusy] = useState("");
    const [dirty, setDirty] = useState(false);
    // Detached (/Janela), unsaved changes hold the window: closing it asks.
    useUnloadGuard(dirty);
    const ask = useConfirm();
    // The notebook fold (Rodada C, owner's pick A): with the window too
    // narrow for the three columns, Dados becomes a tab beside Letra (the
    // Seg in the bar); Slides e Vídeo keep their column.
    const bodyRef = useRef(null);
    const [narrow, setNarrow] = useState(false);
    const [fold, setFold] = useState("letra");
    useEffect(() => {
        const el = bodyRef.current;
        if (!el || typeof ResizeObserver === "undefined") return undefined;
        const ro = new ResizeObserver(([entry]) => setNarrow(entry.contentRect.width < 1000));
        ro.observe(el);
        return () => ro.disconnect();
    }, [Boolean(song)]); // the body only exists once the song loaded
    const mediaRef = useRef(null);
    const fileRef = useRef(null);
    const lyricsRef = useRef(null);

    useEffect(() => {
        let alive = true;
        if (songId === "new") {
            setSong({ ...NEW_SONG });
            setResplit(true);
            setDurationText("");
            return undefined;
        }
        keryx.entities.Song.get(songId).then((row) => {
            if (!alive) return;
            setSong({ ...NEW_SONG, ...row, lyrics: unCR(row.lyrics) });
            setSplit(linesLimit(row.lines_per_slide));
            setDurationText(formatDuration(row.duration));
            setStarts((row.slides || []).map((s) => (Number.isFinite(s.start) ? s.start : null)));
            setResplit(!(row.slides || []).length);
        }).catch((err) => { if (alive) setError(err?.message || "Música não encontrada."); });
        return () => { alive = false; };
    }, [songId]);

    const set = (patch) => { setSong((s) => ({ ...s, ...patch })); setDirty(true); };
    // One kind of line break, so every offset (the cursor, slideSpan) means
    // the same place in the text.
    const setLyrics = (lyrics) => { set({ lyrics: unCR(lyrics) }); setResplit(true); };

    // The slides the song will have: its saved ones until the lyrics or the
    // split change, then the live split of the lyrics (each with its chorded
    // twin, saved for the screens that show chords).
    const slides = useMemo(() => {
        if (!song) return [];
        const base = resplit ? slidesFromLyrics(song.lyrics, { lines: split, chorded: true }) : (song.slides || []);
        return withTimings(base.map(({ start: _start, ...rest }) => rest), starts, mediaRef.current?.duration || song.duration || null);
    }, [song, resplit, split, starts]);

    // The split is the song's setting, never a rewrite of the lyrics (owner
    // 2026-10-14; before, 2/4 linhas rewrote the text and could not be
    // undone): any choice, any order, the slides follow. Timings are by
    // slide index, so when the count changes they are cleared.
    const pickSplit = (n) => {
        const lines = linesLimit(n);
        if (lines === split && resplit) return;
        const count = slidesFromLyrics(song.lyrics, { lines }).length;
        setSplit(lines); setResplit(true); setDirty(true);
        if (starts.some((x) => Number.isFinite(x)) && count !== slides.length) {
            setStarts([]);
            c.say(`${count} ${count === 1 ? "slide" : "slides"} · marque os tempos de novo.`);
        }
    };
    // Chords at the cursor: "[]" with the caret inside, or one chord of the key.
    const insertChord = (chord = "") => {
        const el = lyricsRef.current;
        const text = song.lyrics || "";
        const a = el ? el.selectionStart : text.length;
        const b = el ? el.selectionEnd : a;
        const token = `[${chord}]`;
        setLyrics(text.slice(0, a) + token + text.slice(b));
        const p = a + (chord ? token.length : 1);
        setTimeout(() => { if (el) { el.focus(); el.setSelectionRange(p, p); } }, 0);
    };
    // Tom − / +: the whole song a semitone down or up (the chords in the
    // lyrics, the old chords block and the key).
    const transpose = (steps) => {
        const lyrics = transposeInline(song.lyrics || "", steps);
        const chords = transposeChords(song.chords || "", steps);
        const key = song.song_key ? transposeChord(song.song_key.trim(), steps) : "";
        if (lyrics === (song.lyrics || "") && chords === (song.chords || "") && !key) { c.say("Sem acordes para transpor: escreva-os na letra, [G]Deus é fiel."); return; }
        set({ lyrics, chords, song_key: key });
        setResplit(true);
    };

    // One rendered state, every thumbnail points at its slide.
    const doc = useMemo(() => {
        if (!song || !slides.length) return null;
        // Stamped like a send: the default theme dresses it when it follows.
        try { return applyWithFundo(emptyState(c.now), "content.show", c.stamp("content.show", { ...songContent({ ...song, slides }, {}, themes), kind: "lyrics" }), c.now); } catch { return null; }
    }, [song, slides, themes, c.stamp]); // eslint-disable-line react-hooks/exhaustive-deps

    // Seguir o tema padrão, or this song's own look. While it follows, the
    // controls show the theme's look; touching one makes the look its own,
    // starting from what it showed.
    const def = defaultTheme(themes);
    const following = followsTheme(song);
    const lookOf = (t) => { const s = themeStyle(t); return { font_family: s.font_family, font_size: s.font_size, text_effect: s.text_effect, text_color: s.text_color, text_color_2: s.text_color_2 }; };
    const shown = following && def ? { ...song, ...lookOf(def) } : song;
    const setLook = (patch) => set({ ...(following && def ? lookOf(def) : {}), ...patch, style_mode: "own" });
    const applyTheme = (id) => {
        const t = themes.find((x) => x.id === id);
        if (!t) return;
        const spec = bgSpec(t);
        setLook({ ...lookOf(t), ...(spec ? songBg(spec) : {}) });
    };
    const addMarker = (label) => {
        const el = lyricsRef.current;
        const text = song.lyrics || "";
        const at = el ? el.selectionStart : text.length;
        const before = text.slice(0, at).replace(/\s*$/, "");
        const insert = `${before ? "\n\n" : ""}[${label}]\n`;
        setLyrics(before + insert + text.slice(at).replace(/^\s*/, ""));
        setTimeout(() => { if (el) { const p = (before + insert).length; el.focus(); el.setSelectionRange(p, p); } }, 0);
    };
    // Dividir aqui: a blank line at the cursor, so the stanza becomes two slides.
    const splitHere = () => {
        const el = lyricsRef.current;
        const text = song.lyrics || "";
        const at = el ? el.selectionStart : text.length;
        const before = text.slice(0, at).replace(/\s*$/, "");
        const after = text.slice(at).replace(/^\s*/, "");
        if (!before || !after) { c.say("Ponha o cursor no meio de uma estrofe para dividir."); return; }
        setLyrics(before + "\n\n" + after);
        setTimeout(() => { if (el) { const p = before.length + 2; el.focus(); el.setSelectionRange(p, p); } }, 0);
    };
    // Duplicar estrofe: the stanza under the cursor (or at `at`, a slide's
    // place in the lyrics), again right after it.
    const duplicateStanza = (at) => {
        const el = lyricsRef.current;
        const text = song.lyrics || "";
        const [a, b] = stanzaAt(text, at ?? (el ? el.selectionStart : text.length));
        const stanza = text.slice(a, b);
        if (!stanza.trim()) { c.say("Ponha o cursor numa estrofe para duplicar."); return; }
        setLyrics(text.slice(0, b) + "\n\n" + stanza + text.slice(b));
        setTimeout(() => { if (el) { const p = b + 2; el.focus(); el.setSelectionRange(p, p + stanza.length); } }, 0);
        c.say("Estrofe duplicada logo abaixo.");
    };
    // A slide's right-click menu: it acts on the slide's own lines in the
    // lyrics (slideSpan). Editing only: nothing here touches the screens.
    const menu = useContextMenu();
    const slideMenu = (e, i) => {
        const text = song.lyrics || "";
        const span = slideSpan(text, slides, i);
        const rows = span ? text.slice(span[0], span[1]).split("\n") : [];
        const showInLyrics = () => {
            const el = lyricsRef.current;
            if (!el || !span) return;
            setTimeout(() => { el.focus(); el.setSelectionRange(span[0], span[1]); }, 0);
        };
        // Cut at the line break after the first half: the blank line goes
        // there, never in the middle of a line.
        const splitInTwo = () => {
            const at = span[0] + rows.slice(0, Math.ceil(rows.length / 2)).join("\n").length;
            if (text[at] !== "\n") return;
            setLyrics(text.slice(0, at) + "\n\n" + text.slice(at + 1));
            c.say("Slide dividido em dois.");
        };
        menu(e, { title: slides[i]?.label || `Slide ${i + 1}`, items: [
            { label: "Mostrar na letra", icon: "text", disabled: !span, onSelect: showInLyrics },
            { label: "Duplicar estrofe", icon: "plus", disabled: !span, onSelect: () => duplicateStanza(span[0]) },
            { label: "Dividir em dois", icon: "minus", disabled: !span || rows.length < 2, onSelect: splitInTwo },
        ] });
    };
    const importCifra = () => {
        const raw = cifraText.trim();
        if (!raw) return;
        const sections = parseChords(raw);
        const lyrics = sections.map((s) => (s.section && !/^Parte \d+$/.test(s.section) ? `[${s.section}]\n${s.text}` : s.text)).join("\n\n");
        set({ chords: raw, lyrics });
        setResplit(true);
        setCifraOpen(false);
        setCifraText("");
        c.say(`${sections.length} ${sections.length === 1 ? "estrofe importada" : "estrofes importadas"} da cifra.`);
    };
    // Cifra-over-letra -> inline [G]Deus é [D]fiel: the chords land in the
    // lyrics (the screens with Cifra on show them); the legacy chords block empties.
    const importCifraInline = () => {
        const raw = cifraText.trim();
        if (!raw) return;
        const inline = chordLinesToInline(raw);
        if (!hasInlineChords(inline)) { c.say("Nenhum acorde sobre a letra encontrado; use Montar a letra."); return; }
        set({ lyrics: inline, chords: "" });
        setResplit(true);
        setCifraOpen(false);
        setCifraText("");
        c.say("Letra montada com a cifra nas linhas · os acordes aparecem nas telas com cifra ligada.");
    };
    // The legacy chords block merged into the lyrics as inline chords.
    const chordsToInline = () => {
        const raw = (song.chords || "").trim();
        if (!raw) return;
        const hasLyricLines = raw.split("\n").some((l) => l.trim() && !isChordLine(l));
        if (!hasLyricLines) { c.say("Essa cifra só tem acordes; escreva a letra e use colchetes: [G]Deus é fiel."); return; }
        setLyrics(chordLinesToInline(raw));
        c.say("Letra refeita com os acordes nas linhas · confira e salve.");
    };
    const upload = async (file, field) => {
        if (!file) return;
        setBusy(field);
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            set({ [field]: file_url });
            if (field === "audio_url") setStarts([]);
        } catch (err) { c.say(err?.message || "Não foi possível enviar o arquivo."); }
        setBusy("");
    };

    // Lyric timing (Rodada D4): the marks are made in Sincronizar, a page of
    // the window pushed from here ("← Editor de música"); Aplicar brings them
    // back to this draft, Salvar keeps them. The same marks follow the video,
    // the playback or — no media — the live clock on air (content.follow).
    // Música › Sincronizar a música… (the menu bar): the editor opens with
    // Sincronizar on top of it, once the song is read.
    const didAutoSync = useRef(false);
    useEffect(() => {
        if (!autoSync || didAutoSync.current || !song || !slides.length) return;
        didAutoSync.current = true;
        openSync();
    });
    const openSync = () => onSync?.({
        title: song.title || "Música",
        slides: slides.map(({ text, label }) => ({ text, ...(label ? { label } : {}) })),
        media,
        duration: mediaRef.current?.duration || parseDuration(durationText) || song.duration || null,
        starts: fitMarks(starts, slides.length),
        onApply: (next) => { setStarts(next); setDirty(true); },
    });

    const save = useCallback(async () => {
        if (!song.title.trim()) { c.say("Dê um título à música."); return; }
        if (!song.lyrics.trim()) { c.say("A letra está vazia."); return; }
        setBusy("save");
        const data = {
            ...song,
            title: song.title.trim(),
            duration: parseDuration(durationText) ?? song.duration ?? null,
            bpm: song.bpm ? Number(song.bpm) || null : null,
            lines_per_slide: Number(split),
            // Each slide keeps its chorded twin (the lyrics' [G] chords) for
            // the screens that show chords; before, saving lost them.
            slides: slides.map(({ text, chorded, duration, is_chorus, start, label }) => ({ text, ...(chorded && chorded !== text && hasInlineChords(chorded) ? { chorded } : {}), ...(label ? { label } : {}), ...(is_chorus ? { is_chorus } : {}), ...(Number.isFinite(start) ? { start } : {}), ...(Number.isFinite(duration) ? { duration } : {}) })),
        };
        for (const k of ["id", "created_date", "updated_date", "created_by_id"]) delete data[k];
        try {
            const row = songId === "new" ? await keryx.entities.Song.create(data) : await keryx.entities.Song.update(songId, data);
            setDirty(false);
            c.say(songId === "new" ? `${data.title} criada.` : "Música salva.");
            onSaved?.(row);
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
        setBusy("");
    }, [song, slides, durationText, songId, split, c, onSaved]);

    const remove = async () => {
        if (!(await ask(deleteQuestion("a música", song.title)))) return;
        try { await keryx.entities.Song.delete(songId); c.say("Música excluída."); onClose(); } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
    };
    // Leaving with changes asks (Rodada C: the one guard; Esc answers
    // "continuar").
    const close = useCallback(async (all = false) => {
        if (dirty && !(await ask({ title: "Descartar as mudanças?", text: `"${song?.title || "Nova música"}" tem mudanças não salvas.`, ok: "Descartar" }))) return;
        onClose(all);
    }, [dirty, ask, song?.title, onClose]);

    // Esc comes routed from the console (keys.js ESC_ORDER "window", so
    // whatever is open over the editor closes first, and a field's Esc
    // already blurred): close the Cifra panel, then leave (asking if
    // unsaved); the (x) leaves the whole window the same way. Ctrl+S saves
    // — the editor's own key; it defers to a dialog over the editor (its
    // own scrim does not count) and sleeps while another page covers this.
    if (escRef) escRef.current = (mode) => { if (mode === "esc" && cifraOpen) setCifraOpen(false); else close(mode === "all"); };
    useEffect(() => {
        const onKey = (e) => {
            if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") || !active) return;
            if (document.querySelector(".console .scrim:not(.win-scrim)")) return;
            e.preventDefault(); e.stopPropagation();
            if (song) save();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [save, song, active]);

    if (error) return <><WinBar title="Editor de música" /><div className="win-body"><div className="col center"><Panel noHead><Empty icon="warn" title="Não foi possível abrir">{error}</Empty><div style={{ padding: "var(--space-2)" }}><Btn onClick={() => onClose()}>Fechar</Btn></div></Panel></div></div></>;
    if (!song) return <><WinBar title="Editor de música" /><div className="win-body"><div className="col center"><Panel noHead><Empty title="Abrindo…" /></Panel></div></div></>;

    // The song's theme (songTheme.js): a theme it follows hides the look
    // controls; each labelled part of the lyrics can follow another.
    const look = songTheme(song, themes);
    const parts = songParts(slides);
    const partThemes = cleanPartThemes(song.part_themes);
    const media = song.audio_url;
    const video = isVideoUrl(media);
    const marked = starts.filter((x) => Number.isFinite(x)).length;

    return (
        <>
            <WinBar title="Editor de música" sub={`${songId === "new" ? "Nova música" : song.title || "Música"}${dirty ? " · não salvo" : ""}`}
                tools={<>
                    <IconBtn name="star" small on={song.is_favorite} title={song.is_favorite ? "Tirar dos favoritos" : "Favoritar"} onClick={() => set({ is_favorite: !song.is_favorite })} />
                    {narrow && <Seg small value={fold} onChange={setFold} label="O que a coluna mostra" options={[["dados", "Dados"], ["letra", "Letra"]]} />}
                    {/* At the left, apart from Cancelar and Salvar (audit C-40). */}
                    {songId !== "new" && <Btn small onClick={remove} title="Excluir esta música · pergunta antes">Excluir…</Btn>}
                </>}
                actions={<>
                    <Btn small onClick={() => printSong({ ...song, duration: parseDuration(durationText) }, slides)} disabled={!slides.length}>Imprimir</Btn>
                    <Btn small onClick={() => close()}>Cancelar</Btn>
                    <Btn small kind="brand" disabled={busy === "save"} onClick={save} title="Salvar · Ctrl+S">{busy === "save" ? "Salvando…" : "Salvar"}</Btn>
                </>} />
            <div className="win-body" ref={bodyRef}>
            {(!narrow || fold === "dados") && (
            <div className="col song-ed-l" style={narrow ? { flex: 1, minWidth: 0 } : colDados.style}>
                <Panel title="Dados da música" bodyStyle={{ overflow: "auto" }}>
                    <div className="frm">
                        <span className="k">Título</span><Field icon={null} value={song.title} onChange={(v) => set({ title: v })} placeholder="Título da música" />
                        <span className="k">Artista</span><Field icon={null} value={song.artist || ""} onChange={(v) => set({ artist: v })} placeholder="Artista ou ministério" />
                        <span className="k">Categoria</span>
                        <select className="cfg-select" value={song.category || "worship"} onChange={(e) => set({ category: e.target.value })} aria-label="Categoria">{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <span className="k">Duração</span><Field icon={null} value={durationText} onChange={(v) => { setDurationText(v); setDirty(true); }} placeholder="m:ss" />
                        <span className="k">BPM</span><Field icon={null} value={song.bpm ?? ""} onChange={(v) => set({ bpm: v.replace(/\D/g, "").slice(0, 3) })} placeholder="ex.: 72" />
                        <span className="k">Tom</span>
                        <div className="ed-key">
                            <Field icon={null} value={song.song_key || ""} onChange={(v) => set({ song_key: v.slice(0, 8) })} placeholder="ex.: E, Am" />
                            <IconBtn name="minus" small title="Transpor meio tom abaixo · os acordes da letra, a cifra e o tom" onClick={() => transpose(-1)} />
                            <IconBtn name="plus" small title="Transpor meio tom acima · os acordes da letra, a cifra e o tom" onClick={() => transpose(1)} />
                        </div>
                        <span className="k">CCLI</span><Field icon={null} value={song.ccli_number || ""} onChange={(v) => set({ ccli_number: v.slice(0, 20) })} placeholder="número da licença" />
                    </div>
                    <div className="listhead"><span className="kx-section">Notas para os músicos</span></div>
                    <div className="ed-pad"><textarea className="ed-text" style={{ height: 56 }} value={song.musician_notes || ""} onChange={(e) => set({ musician_notes: e.target.value })} aria-label="Notas para os músicos" placeholder="Intro, dinâmica, finais…" /></div>
                    <div className="listhead"><span className="kx-section">Cifra <span className="kx-count">· nas telas com cifra ligada</span></span><span style={{ flex: 1 }} />{(song.chords || "").trim() && !hasInlineChords(song.lyrics || "") && <Btn small onClick={chordsToInline} title="Põe os acordes do bloco de cifra dentro da letra ([G]Deus é fiel), sobre as sílabas">Colocar na letra</Btn>}
                        <Btn small onClick={() => setCifraOpen((o) => !o)} title="Colar uma cifra ou ChordPro: a letra é montada a partir dela">Importar cifra</Btn></div>
                    {cifraOpen && (
                        <div className="ed-pad ed-cifra">
                            <textarea className="ed-text ed-mono" style={{ height: 120 }} value={cifraText} onChange={(e) => setCifraText(e.target.value)} placeholder="Cole a cifra (acordes sobre a letra) ou ChordPro" aria-label="Cifra para importar" autoFocus />
                            <div style={{ display: "flex", gap: "var(--space-1)", justifyContent: "flex-end" }}><Btn small onClick={() => setCifraOpen(false)}>Cancelar</Btn><Btn small disabled={!cifraText.trim()} onClick={importCifraInline} title="Os acordes entram na própria letra, entre colchetes, sobre as sílabas">Montar com cifra na letra</Btn><Btn small kind="brand" disabled={!cifraText.trim()} onClick={importCifra}>Montar a letra</Btn></div>
                        </div>
                    )}
                    <div className="ed-pad"><textarea className="ed-text ed-mono" style={{ height: 96 }} value={song.chords || ""} onChange={(e) => set({ chords: e.target.value })} aria-label="Cifra" placeholder="Acordes para o Palco (opcional)" /></div>
                    <div className="listhead" style={{ borderTop: "1px solid var(--line)" }}><span className="kx-section">Tema desta música</span></div>
                    <div className="frm">
                        <span className="k">Tema</span>
                        <select className="cfg-select" aria-label="Tema desta música"
                            value={look.theme || look.missing ? `t:${song.theme_id}` : following ? "default" : "own"}
                            onChange={(e) => { const v = e.target.value; if (v.startsWith("t:")) set({ theme_id: v.slice(2) }); else if (v === "default") set({ theme_id: "", style_mode: "theme" }); else setLook({ theme_id: "" }); }}
                            title="O mesmo das músicas: vai ao ar com o tema das músicas (Configurações › Temas e fundos). Um tema: a música segue esse tema inteiro. Só desta música: a fonte, as cores e o fundo abaixo">
                            <option value="default">{def ? `O mesmo das músicas · ${themeName(def)}` : "O mesmo das músicas"}</option>
                            {themes.filter((t) => !def || t.id !== def.id).map((t) => <option key={t.id} value={`t:${t.id}`}>{themeName(t)}</option>)}
                            {def && <option value={`t:${def.id}`}>{themeName(def)} (sempre este)</option>}
                            {look.missing && <option value={`t:${song.theme_id}`} disabled>(tema excluído)</option>}
                            <option value="own">Só desta música</option>
                        </select>
                    </div>
                    {look.theme && (
                        <div className="ed-pad ed-linked">
                            <span className="kx-meta">Segue o tema <b>{themeName(look.theme)}</b>: mudar o tema muda esta música.</span>
                            {onEditTheme && <Btn small onClick={() => onEditTheme(look.theme.id)} title="Abrir este tema no Editor de temas, na mesma janela · Voltar traz a música de volta">Editar tema…</Btn>}
                            <Btn small onClick={() => { applyTheme(look.theme.id); set({ theme_id: "" }); }} title="Traz a fonte, as cores e o fundo do tema para esta música (Só desta música), para ajustar aqui">Ajustar só nesta música</Btn>
                        </div>
                    )}
                    {look.missing && <div className="ed-pad"><span className="kx-meta kx-warn">O tema desta música foi excluído: ela vai ao ar só com o tema dela, abaixo.</span></div>}
                    {!look.theme && <>
                    <div className="frm">
                        <span className="k">Fonte</span>
                        <select className="cfg-select" value={shown.font_family || "sans"} onChange={(e) => setLook({ font_family: e.target.value })} aria-label="Fonte">{FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <span className="k">Tamanho</span><Seg small value={shown.font_size || "large"} onChange={(v) => setLook({ font_size: v })} options={SIZES} />
                        <span className="k">Cor do texto</span>
                        <div className="swatches">
                            {SWATCHES.map(([hex, name]) => <button type="button" key={hex} className={`kx-t ${(shown.text_color || "#ffffff").toLowerCase() === hex ? "is-on" : ""}`} style={{ background: hex }} aria-label={name} title={name} onClick={() => setLook({ text_color: hex })} />)}
                            <input type="color" className="ed-color" value={shown.text_color || "#ffffff"} onChange={(e) => setLook({ text_color: e.target.value })} aria-label="Outra cor" title="Outra cor" />
                        </div>
                        <span className="k">Efeito</span>
                        <select className="cfg-select" value={shown.text_effect || "shadow"} onChange={(e) => setLook({ text_effect: e.target.value })} aria-label="Efeito">{EFFECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    </div>
                    {/* The song's own background, any kind, from the library;
                        it goes to the Fundo layer when the song goes on air. */}
                    <div className="frm">
                        <span className="k">Fundo</span>
                        <BgChip value={bgSpec(song)} title="Fundo da música" empty="o do tema" noneLabel="Sem fundo próprio (usa o do tema)" onPick={(spec) => set(songBg(spec))} />
                    </div>
                    </>}
                    <div className="listhead" style={{ borderTop: "1px solid var(--line)" }}><span className="kx-section">Tema por parte <span className="kx-count">· o refrão com outro fundo, por exemplo</span></span></div>
                    {!parts.length && <div className="ed-pad"><span className="kx-meta">Marque as partes na letra com [Refrão], [Ponte]… (os botões acima da letra) para dar um tema a cada uma.</span></div>}
                    {parts.length > 0 && (
                        <div className="frm">
                            {parts.map((p) => {
                                const id = partThemes[p.key] || "";
                                const gone = id && !themes.some((t) => t.id === id);
                                return (
                                    <React.Fragment key={p.key}>
                                        <span className="k" title={`${p.slides} ${p.slides === 1 ? "slide" : "slides"}`}>{p.name}</span>
                                        <select className="cfg-select" value={id} aria-label={`Tema de ${p.name}`}
                                            onChange={(e) => { const next = { ...partThemes }; if (e.target.value) next[p.key] = e.target.value; else delete next[p.key]; set({ part_themes: next }); }}>
                                            <option value="">Como a música</option>
                                            {themes.map((t) => <option key={t.id} value={t.id}>{themeName(t)}</option>)}
                                            {gone && <option value={id} disabled>(tema excluído)</option>}
                                        </select>
                                    </React.Fragment>
                                );
                            })}
                        </div>
                    )}
                </Panel>
            </div>
            )}
            {(!narrow || fold === "letra") && <>
            {!narrow && colDados.split}
            <div className="col" style={narrow ? { flex: 1, minWidth: 0 } : colLetra.style}>
                <Panel title={<>Letra <span className="kx-count">· uma linha vazia separa estrofes</span></>} actions={<LinesPicker value={split} onChange={pickSplit} titles={{ stanza: "Uma estrofe por slide · a letra não muda, só os slides" }} />} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="ed-tools">
                        <Btn small kind="outline" onClick={() => addMarker("Verso")}>[Verso]</Btn>
                        <Btn small kind="outline" onClick={() => addMarker("Refrão")}>[Refrão]</Btn>
                        <Btn small kind="outline" onClick={() => addMarker("Ponte")}>[Ponte]</Btn>
                        <Btn small kind="outline" onClick={() => addMarker("Instrumental")}>[Instrumental]</Btn>
                        <Btn small kind="outline" onClick={() => addMarker("Final")}>[Final]</Btn>
                        <Btn small onClick={splitHere} title="Uma linha vazia no cursor: a estrofe vira dois slides">Dividir aqui</Btn>
                        <Btn small onClick={() => duplicateStanza()} title="Repete a estrofe onde está o cursor, logo abaixo">Duplicar estrofe</Btn>
                        <span style={{ flex: 1 }} />
                        <span className="kx-meta">{slides.length} {slides.length === 1 ? "slide" : "slides"}</span>
                    </div>
                    <div className="ed-tools ed-chords">
                        <Btn small onClick={() => insertChord()} title="Põe [ ] no cursor: escreva o acorde dentro, antes da sílaba em que ele entra">Acorde</Btn>
                        {keyChords(song.song_key).map((ch) => <Btn key={ch} small kind="outline" className="ed-chip" onClick={() => insertChord(ch)} title={`Põe [${ch}] no cursor`}>{ch}</Btn>)}
                        {!keyChords(song.song_key).length && <span className="kx-meta">Preencha o Tom para ter os acordes dele aqui.</span>}
                    </div>
                    <p className="kx-meta ed-help">[G] dentro da linha é acorde; [Refrão] sozinho na linha é o nome da parte. Cada tela mostra a cifra e o nome da parte se estiverem ligados nela (Configurações › Telas e saídas); o Palco já vem com os dois.</p>
                    <div className="ed-lyrics"><textarea ref={lyricsRef} className="ed-text" value={song.lyrics || ""} onChange={(e) => setLyrics(e.target.value)} aria-label="Letra" placeholder={"[Verso 1]\nPrimeira linha\nsegunda linha\n\n[Refrão]\n…"} spellCheck={false} /></div>
                </Panel>
            </div>
            </>}
            {narrow ? <div className="kx-gap" /> : colLetra.split}
            <div className="col center song-ed-r">
                <Panel title={<>Slides <span className="kx-count">· {resplit ? "divisão ao vivo" : "slides salvos · editar a letra refaz"}</span></>} style={rowSlides.style} actions={<><Btn small on={showChords} onClick={() => setShowChords((v) => !v)} title="Mostra nos slides abaixo a cifra e o nome da parte, como o Palco os mostra (só aqui; as telas seguem os ajustes de cada uma)">Cifra e partes</Btn><Seg small value={thumbs} onChange={setThumbs} options={THUMBS} /></>} bodyStyle={{ overflow: "auto" }}>
                    {!slides.length && <Empty icon="list" title="Nenhum slide">Escreva a letra; cada estrofe vira um slide.</Empty>}
                    <div className={"ed-thumbs is-" + thumbs}>
                        {doc && slides.map((s, i) => {
                            const fit = slideFit(s.text, song.font_size);
                            const fitTitle = fit.wraps.length
                                ? (fit.wraps.length === 1 ? "A linha " + fit.wraps[0] + " é longa" : "As linhas " + fit.wraps.join(", ") + " são longas") + " para este tamanho de letra (cabem uns " + fit.limit + " caracteres por linha; a mais longa tem " + fit.longest + "): a fonte deste slide diminui para cada linha caber numa linha da tela"
                                : fit.lines + (fit.lines === 1 ? " linha, " : " linhas, ") + fit.chars + " caracteres · cabe na tela";
                            return (
                            <button type="button" key={i} className={`ed-th kx-t ${i === sel ? "is-sel" : ""}`} onClick={() => setSel(i)} onContextMenu={(e) => slideMenu(e, i)} title={s.label || `Slide ${i + 1}`}>
                                <ScreenRenderer state={{ ...doc, content: { ...doc.content, index: i, ...(showChords ? { show: { chords: true, labels: true } } : {}) } }} now={c.now} preview />
                                <span className="n">{i + 1}{Number.isFinite(starts[i]) ? ` · ${mmss(starts[i])}` : ""}</span>
                                {s.label && (i === 0 || slides[i - 1].label !== s.label) && <span className="lab">{s.label}</span>}
                                <span className={"fit" + (fit.wraps.length ? " is-warn" : "")} title={fitTitle}>{fit.lines} l · {fit.chars} c{fit.wraps.length ? " · fonte menor" : ""}</span>
                            </button>
                            );
                        })}
                    </div>
                </Panel>
                {rowSlides.split}
                <Panel className="ed-video" title="Vídeo e sincronização" style={{ flex: 1, minHeight: 120 }} actions={<>
                    {onSync && <Btn small kind="outline" disabled={!slides.length} onClick={openSync} title="Marcar onde cada slide entra: com o vídeo, o playback ou, sem mídia, um relógio (para os músicos ao vivo)">Sincronizar…</Btn>}
                    <Btn small disabled={busy === "audio_url"} onClick={() => fileRef.current?.click()}>{busy === "audio_url" ? "Enviando…" : media ? "Trocar…" : "Vídeo ou playback…"}</Btn>
                    {media && <Btn small onClick={() => set({ audio_url: "" })} title="As marcas ficam: sem mídia, a letra segue o relógio ao vivo">Remover</Btn>}
                </>} bodyStyle={{ display: "flex", flexDirection: media ? "row" : "column", gap: "var(--space-2)", padding: "0 var(--space-2) var(--space-2)", overflow: "hidden" }}>
                    <input ref={fileRef} type="file" accept="video/*,audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f, "audio_url"); }} />
                    {!media && <Empty icon="film" title="Sem vídeo nem playback">Um vídeo vai para as telas de vídeo junto com a letra; um playback toca no canal de áudio. Sem mídia, a letra pode seguir os músicos: marque em Sincronizar… e, no ar, aperte Iniciar letra automática.</Empty>}
                    {media && (
                        <div className="ed-media">{video
                            ? <video ref={mediaRef} src={media} controls preload="metadata" />
                            : <audio ref={mediaRef} src={media} controls preload="metadata" />}
                            <span className="kx-meta">{video ? "Vídeo · vai às telas de vídeo" : "Playback · toca no canal de áudio"}</span>
                        </div>
                    )}
                    <div className="ed-syncstat">
                        <span className={`ed-syncn ${marked ? "is-on" : ""}`}><Icon name={media ? "music" : "clock"} />{marked}/{slides.length} marcados</span>
                        <span className="kx-meta">{!marked ? "Sem marcas: a letra não avança sozinha."
                            : !media ? "No ar: Iniciar letra automática no player, na introdução."
                            : video ? "No ar, a letra segue o vídeo." : "No ar, a letra segue o playback."}</span>
                        {marked > 0 && resplit && <span className="kx-meta kx-warn">A letra mudou: confira as marcas em Sincronizar…</span>}
                    </div>
                </Panel>
            </div>
            </div>
        </>
    );
}
