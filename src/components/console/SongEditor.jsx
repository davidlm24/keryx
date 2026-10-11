import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, Empty, BackBtn } from "./kx";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { songContent, isVideoUrl } from "@/lib/console/content";
import { visibleBackgrounds } from "@/lib/console/backgroundPrefs";
import { useBackgrounds, useLibrary } from "./useConsoleData";
import { parseChords, slidesFromLyrics, reflowLyrics, withTimings, parseDuration, formatDuration } from "@/lib/songImport";
import { chordLinesToInline, hasInlineChords, isChordLine } from "@/lib/chords";
import { printSong } from "@/lib/printSong";
import { slideFit, stanzaAt, slideSpan } from "@/lib/console/lyricFit";
import { useContextMenu } from "./ContextMenu";

const CATEGORIES = [["worship", "Adoração"], ["praise", "Louvor"], ["hymn", "Hino"], ["contemporary", "Contemporâneo"], ["other", "Outro"]];
const FONTS = [["sans", "Sem serifa"], ["serif", "Serifa"], ["mono", "Mono"], ["cursive", "Cursiva"], ["arial", "Arial"], ["georgia", "Georgia"], ["times", "Times"], ["verdana", "Verdana"]];
const SIZES = [["xsmall", "PP"], ["small", "P"], ["medium", "M"], ["large", "G"], ["xlarge", "GG"], ["xxlarge", "GGG"]];
const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["outline", "Contorno"], ["3d", "3D"], ["neon", "Neon"], ["none", "Nenhum"]];
const SWATCHES = [["#ffffff", "Branco"], ["#f3e6c9", "Creme"], ["#c9dcff", "Azul claro"], ["#ffe08a", "Amarelo"], ["#1a1a1a", "Preto"]];
const SPLITS = [["0", "Estrofe", { title: "Uma estrofe por slide · não refaz blocos já divididos" }], ["2", "2 linhas", { title: "No máximo 2 linhas por slide · reescreve a letra nesses blocos" }], ["4", "4 linhas", { title: "No máximo 4 linhas por slide · reescreve a letra nesses blocos" }]];
// The slide previews' size, remembered on this computer.
const THUMBS = [["s", "P", { title: "Prévias pequenas" }], ["m", "M", { title: "Prévias médias" }], ["l", "G", { title: "Prévias grandes" }]];
const THUMBS_KEY = "keryx.console.editor.thumbs";
const readThumbs = () => { try { const v = localStorage.getItem(THUMBS_KEY); return ["s", "m", "l"].includes(v) ? v : "m"; } catch { return "m"; } };
const splitOf = (n) => (Number(n) === 2 || Number(n) === 4 ? String(Number(n)) : "0");

const NEW_SONG = { title: "", artist: "", lyrics: "", duration: null, category: "worship", audio_url: "", background_image: "", slides: [], font_size: "large", font_family: "sans", text_effect: "shadow", text_color: "#ffffff", bpm: null, song_key: "", chords: "", musician_notes: "", ccli_number: "", is_favorite: false };
const mmss = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// The song editor (canvas artboard 16), inside the console: song data and
// style on the left, the lyrics in the middle, the live slide split and the
// song's video or playback with lyric timing on the right. Nothing here
// changes what is on air. Opening a song keeps its saved slides; editing the
// lyrics (or the split) redoes them, keeping timings by position.
export default function SongEditor({ c, songId, themes = [], onClose, onSaved }) {
    const backgrounds = useBackgrounds(useLibrary().media);
    const [song, setSong] = useState(null);
    const [error, setError] = useState("");
    const [split, setSplit] = useState("0");
    const [thumbs, setThumbsState] = useState(readThumbs);
    const setThumbs = (v) => { setThumbsState(v); try { localStorage.setItem(THUMBS_KEY, v); } catch { /* not remembered */ } };
    const [resplit, setResplit] = useState(false);
    const [durationText, setDurationText] = useState("");
    const [sel, setSel] = useState(0);
    const [cifraOpen, setCifraOpen] = useState(false);
    const [cifraText, setCifraText] = useState("");
    const [marking, setMarking] = useState(false);
    const [starts, setStarts] = useState([]);
    const [busy, setBusy] = useState("");
    const [dirty, setDirty] = useState(false);
    const [confirm, setConfirm] = useState(null); // "close" | "delete"
    const mediaRef = useRef(null);
    const fileRef = useRef(null);
    const bgFileRef = useRef(null);
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
            setSong({ ...NEW_SONG, ...row });
            setSplit(splitOf(row.lines_per_slide));
            setDurationText(formatDuration(row.duration));
            setStarts((row.slides || []).map((s) => (Number.isFinite(s.start) ? s.start : null)));
            setResplit(!(row.slides || []).length);
        }).catch((err) => { if (alive) setError(err?.message || "Música não encontrada."); });
        return () => { alive = false; };
    }, [songId]);

    const set = (patch) => { setSong((s) => ({ ...s, ...patch })); setDirty(true); setConfirm(null); };
    const setLyrics = (lyrics) => { set({ lyrics }); setResplit(true); };

    // The slides the song will have: its saved ones until the lyrics or the
    // split change, then the live split of the lyrics.
    const slides = useMemo(() => {
        if (!song) return [];
        const base = resplit ? slidesFromLyrics(song.lyrics, { lines: Number(split) }) : (song.slides || []);
        return withTimings(base.map(({ start: _start, ...rest }) => rest), starts, mediaRef.current?.duration || song.duration || null);
    }, [song, resplit, split, starts]);

    // Choosing 2/4 linhas also rewrites the lyrics, so the text reads like
    // the slides (owner request 2026-10-11); timings are by slide index, so
    // when the count changes they are cleared rather than landing wrong.
    const pickSplit = (v) => {
        setSplit(v); setResplit(true); setDirty(true);
        const n = Number(v);
        if (!(n > 0)) return;
        const next = reflowLyrics(song.lyrics || "", n);
        if (next === (song.lyrics || "")) return;
        const before = slides.length;
        setLyrics(next);
        if (starts.some((x) => Number.isFinite(x)) && slidesFromLyrics(next, { lines: n }).length !== before) {
            setStarts([]);
            c.say(`Letra reescrita em blocos de ${n} linhas · marque os tempos de novo.`);
        } else c.say(`Letra reescrita em blocos de ${n} linhas.`);
    };

    // One rendered state, every thumbnail points at its slide.
    const doc = useMemo(() => {
        if (!song || !slides.length) return null;
        try { return applyOp(emptyState(c.now), "content.show", { ...songContent({ ...song, slides }), kind: "lyrics" }, c.now); } catch { return null; }
    }, [song, slides]); // eslint-disable-line react-hooks/exhaustive-deps

    const applyTheme = (id) => {
        const t = themes.find((x) => x.id === id);
        if (!t) return;
        set({ font_family: t.font_family || "sans", font_size: t.font_size || "large", text_effect: t.text_effect || "shadow", text_color: t.text_color || "#ffffff", ...(t.background_image ? { background_image: t.background_image } : {}) });
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
        const splitInTwo = () => {
            const at = span[0] + rows.slice(0, Math.ceil(rows.length / 2)).join("\n").length;
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
    // lyrics (only the Palco shows them); the legacy chords block empties.
    const importCifraInline = () => {
        const raw = cifraText.trim();
        if (!raw) return;
        const inline = chordLinesToInline(raw);
        if (!hasInlineChords(inline)) { c.say("Nenhum acorde sobre a letra encontrado; use Montar a letra."); return; }
        set({ lyrics: inline, chords: "" });
        setResplit(true);
        setCifraOpen(false);
        setCifraText("");
        c.say("Letra montada com a cifra nas linhas · os acordes só aparecem no Palco.");
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

    // Lyric timing: play the song's media and press Space at the start of
    // each slide. The next unmarked slide is the one Space marks.
    const nextMark = slides.findIndex((_, i) => !Number.isFinite(starts[i]));
    const toggleMarking = () => {
        const el = mediaRef.current;
        if (!el) return;
        if (marking) { setMarking(false); el.pause(); return; }
        setStarts([]);
        el.currentTime = 0;
        el.play().catch(() => {});
        setMarking(true);
        setDirty(true);
    };
    useEffect(() => {
        if (!marking) return undefined;
        const onKey = (e) => {
            if (e.key !== " " || ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) return;
            e.preventDefault();
            e.stopPropagation();
            const el = mediaRef.current;
            if (!el) return;
            setStarts((prev) => {
                const i = slides.findIndex((_, k) => !Number.isFinite(prev[k]));
                if (i < 0) return prev;
                const next = [...prev];
                next[i] = el.currentTime;
                if (i === slides.length - 1) setMarking(false);
                return next;
            });
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [marking, slides]);

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
            slides: slides.map(({ text, duration, is_chorus, start, label }) => ({ text, ...(label ? { label } : {}), ...(is_chorus ? { is_chorus } : {}), ...(Number.isFinite(start) ? { start } : {}), ...(Number.isFinite(duration) ? { duration } : {}) })),
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
        if (confirm !== "delete") { setConfirm("delete"); c.say(`Clique de novo em Excluir para apagar "${song.title}".`); return; }
        try { await keryx.entities.Song.delete(songId); c.say("Música excluída."); onClose(); } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
    };
    const close = useCallback(() => {
        if (dirty && confirm !== "close") { setConfirm("close"); c.say("Alterações não salvas · Esc ou Cancelar de novo descarta."); return; }
        onClose();
    }, [dirty, confirm, c, onClose]);

    // Esc: leaves a text field first, then closes (asking once if unsaved);
    // Ctrl+S saves. Captured here so the console never ends the projection.
    useEffect(() => {
        const onKey = (e) => {
            // Something open over the editor (a popover, Configurações) takes the keys.
            if (document.querySelector(".console .scrim")) return;
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); if (song) save(); return; }
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopPropagation();
            if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) { e.target.blur(); return; }
            if (cifraOpen) { setCifraOpen(false); return; }
            close();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [close, save, song, cifraOpen]);

    if (error) return <div className="col center"><Panel title="Editor de música"><Empty icon="warn" title="Não foi possível abrir">{error}</Empty><div style={{ padding: "var(--space-2)" }}><Btn onClick={onClose}>Voltar ao console</Btn></div></Panel></div>;
    if (!song) return <div className="col center"><Panel title="Editor de música"><Empty title="Abrindo…" /></Panel></div>;

    const media = song.audio_url;
    const video = isVideoUrl(media);
    const bg = song.background_image;
    const galleryBgs = visibleBackgrounds(backgrounds, { except: "Comunicação" }).filter((b) => b.kind !== "video");
    const marked = starts.filter((x) => Number.isFinite(x)).length;

    return (
        <>
            <div className="col song-ed-l" style={{ flex: "0 1 340px", minWidth: 280 }}>
                <Panel lead={<BackBtn onClick={close} />} title={songId === "new" ? "Nova música" : "Dados da música"} actions={<><IconBtn name="star" small on={song.is_favorite} title={song.is_favorite ? "Tirar dos favoritos" : "Favoritar"} onClick={() => set({ is_favorite: !song.is_favorite })} /></>} bodyStyle={{ overflow: "auto" }}>
                    <div className="frm">
                        <span className="k">Título</span><Field icon={null} value={song.title} onChange={(v) => set({ title: v })} placeholder="Título da música" />
                        <span className="k">Artista</span><Field icon={null} value={song.artist || ""} onChange={(v) => set({ artist: v })} placeholder="Artista ou ministério" />
                        <span className="k">Categoria</span>
                        <select className="cfg-select" value={song.category || "worship"} onChange={(e) => set({ category: e.target.value })} aria-label="Categoria">{CATEGORIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <span className="k">Duração</span><Field icon={null} value={durationText} onChange={(v) => { setDurationText(v); setDirty(true); }} placeholder="m:ss" />
                        <span className="k">BPM</span><Field icon={null} value={song.bpm ?? ""} onChange={(v) => set({ bpm: v.replace(/\D/g, "").slice(0, 3) })} placeholder="ex.: 72" />
                        <span className="k">Tom</span><Field icon={null} value={song.song_key || ""} onChange={(v) => set({ song_key: v.slice(0, 8) })} placeholder="ex.: E, Am" />
                        <span className="k">CCLI</span><Field icon={null} value={song.ccli_number || ""} onChange={(v) => set({ ccli_number: v.slice(0, 20) })} placeholder="número da licença" />
                    </div>
                    <div className="listhead"><span className="kx-section">Notas para os músicos</span></div>
                    <div className="ed-pad"><textarea className="ed-text" style={{ height: 56 }} value={song.musician_notes || ""} onChange={(e) => set({ musician_notes: e.target.value })} aria-label="Notas para os músicos" placeholder="Intro, dinâmica, finais…" /></div>
                    <div className="listhead"><span className="kx-section">Cifra <span className="kx-count">· aparece no Palco</span></span><span style={{ flex: 1 }} />{(song.chords || "").trim() && !hasInlineChords(song.lyrics || "") && <Btn small onClick={chordsToInline} title="Põe os acordes do bloco de cifra dentro da letra ([G]Deus é fiel); só o Palco os mostra">Colocar na letra</Btn>}
                        <Btn small onClick={() => setCifraOpen((o) => !o)} title="Colar uma cifra ou ChordPro: a letra é montada a partir dela">Importar cifra</Btn></div>
                    {cifraOpen && (
                        <div className="ed-pad ed-cifra">
                            <textarea className="ed-text ed-mono" style={{ height: 120 }} value={cifraText} onChange={(e) => setCifraText(e.target.value)} placeholder="Cole a cifra (acordes sobre a letra) ou ChordPro" aria-label="Cifra para importar" autoFocus />
                            <div style={{ display: "flex", gap: "var(--space-1)", justifyContent: "flex-end" }}><Btn small onClick={() => setCifraOpen(false)}>Cancelar</Btn><Btn small disabled={!cifraText.trim()} onClick={importCifraInline} title="Os acordes entram na própria letra, entre colchetes; só o Palco os mostra">Montar com cifra na letra</Btn><Btn small kind="brand" disabled={!cifraText.trim()} onClick={importCifra}>Montar a letra</Btn></div>
                        </div>
                    )}
                    <div className="ed-pad"><textarea className="ed-text ed-mono" style={{ height: 96 }} value={song.chords || ""} onChange={(e) => set({ chords: e.target.value })} aria-label="Cifra" placeholder="Acordes para o Palco (opcional)" /></div>
                    <div className="listhead" style={{ borderTop: "1px solid var(--line)" }}><span className="kx-section">Estilo desta música <span className="kx-count">· sobrepõe o tema</span></span></div>
                    <div className="frm">
                        <span className="k">Tema</span>
                        <select className="cfg-select" value="" onChange={(e) => applyTheme(e.target.value)} aria-label="Aplicar um tema" disabled={!themes.length}><option value="">{themes.length ? "Aplicar um tema…" : "Nenhum tema"}</option>{themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
                        <span className="k">Fonte</span>
                        <select className="cfg-select" value={song.font_family || "sans"} onChange={(e) => set({ font_family: e.target.value })} aria-label="Fonte">{FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                        <span className="k">Tamanho</span><Seg small value={song.font_size || "large"} onChange={(v) => set({ font_size: v })} options={SIZES} />
                        <span className="k">Cor do texto</span>
                        <div className="swatches">
                            {SWATCHES.map(([hex, name]) => <button type="button" key={hex} className={`kx-t ${(song.text_color || "#ffffff").toLowerCase() === hex ? "is-on" : ""}`} style={{ background: hex }} aria-label={name} title={name} onClick={() => set({ text_color: hex })} />)}
                            <input type="color" className="ed-color" value={song.text_color || "#ffffff"} onChange={(e) => set({ text_color: e.target.value })} aria-label="Outra cor" title="Outra cor" />
                        </div>
                        <span className="k">Efeito</span>
                        <select className="cfg-select" value={song.text_effect || "shadow"} onChange={(e) => set({ text_effect: e.target.value })} aria-label="Efeito">{EFFECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    </div>
                    <div className="listhead"><span className="kx-meta">Fundo</span><span style={{ flex: 1 }} /><Btn small disabled={busy === "background_image"} onClick={() => bgFileRef.current?.click()}>{busy === "background_image" ? "Enviando…" : "Arquivo…"}</Btn></div>
                    <div className="ed-pad"><div className="bgpick">
                        <button type="button" className={`kx-t bg-none ${!bg ? "is-on" : ""}`} onClick={() => set({ background_image: "" })} aria-label="Sem fundo próprio" title="Sem fundo próprio (usa o do tema)">Tema</button>
                        {bg && !galleryBgs.some((b) => b.url === bg) && <button type="button" className="kx-t is-on" title="Fundo deste item"><img src={bg} alt="" /></button>}
                        {galleryBgs.map((b) => <button type="button" key={b.source} className={`kx-t ${bg === b.url ? "is-on" : ""}`} onClick={() => set({ background_image: b.url })} aria-label={b.name} title={b.name}><img src={b.url} alt="" loading="lazy" /></button>)}
                    </div></div>
                    <input ref={bgFileRef} type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f, "background_image"); }} />
                </Panel>
            </div>
            <div className="kx-gap" />
            <div className="col" style={{ flex: "0 1 480px", minWidth: 300 }}>
                <Panel title={<>Letra <span className="kx-count">· uma linha vazia separa estrofes</span></>} actions={<Seg small value={split} onChange={pickSplit} options={SPLITS} />} bodyStyle={{ display: "flex", flexDirection: "column" }}>
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
                    <div className="ed-lyrics"><textarea ref={lyricsRef} className="ed-text" value={song.lyrics || ""} onChange={(e) => setLyrics(e.target.value)} aria-label="Letra" placeholder={"[Verso 1]\nPrimeira linha\nsegunda linha\n\n[Refrão]\n…"} spellCheck={false} /></div>
                    <div className="listhead"><span className="kx-meta">[G] dentro da linha é acorde — só o Palco mostra; [Refrão] sozinho na linha é o nome da seção.</span></div>
                </Panel>
            </div>
            <div className="kx-gap" />
            <div className="col center song-ed-r" style={{ gap: "var(--gutter)" }}>
                <Panel title={<>Slides <span className="kx-count">· {resplit ? "divisão ao vivo" : "slides salvos · editar a letra refaz"}</span></>} style={{ flex: 1.3 }} actions={<Seg small value={thumbs} onChange={setThumbs} options={THUMBS} />} bodyStyle={{ overflow: "auto" }}>
                    {!slides.length && <Empty icon="list" title="Nenhum slide">Escreva a letra; cada estrofe vira um slide.</Empty>}
                    <div className={"ed-thumbs is-" + thumbs}>
                        {doc && slides.map((s, i) => {
                            const fit = slideFit(s.text, song.font_size);
                            const fitTitle = fit.wraps.length
                                ? (fit.wraps.length === 1 ? "A linha " + fit.wraps[0] + " quebra" : "As linhas " + fit.wraps.join(", ") + " quebram") + " na tela neste tamanho de letra (cabem uns " + fit.limit + " caracteres por linha; a mais longa tem " + fit.longest + ")"
                                : fit.lines + (fit.lines === 1 ? " linha, " : " linhas, ") + fit.chars + " caracteres · cabe na tela";
                            return (
                            <button type="button" key={i} className={`ed-th kx-t ${i === sel ? "is-sel" : ""} ${marking && i === nextMark ? "is-next" : ""}`} onClick={() => setSel(i)} onContextMenu={(e) => slideMenu(e, i)} title={s.label || `Slide ${i + 1}`}>
                                <ScreenRenderer state={{ ...doc, content: { ...doc.content, index: i } }} now={c.now} preview />
                                <span className="n">{i + 1}{Number.isFinite(starts[i]) ? ` · ${mmss(starts[i])}` : ""}</span>
                                {s.label && (i === 0 || slides[i - 1].label !== s.label) && <span className="lab">{s.label}</span>}
                                <span className={"fit" + (fit.wraps.length ? " is-warn" : "")} title={fitTitle}>{fit.lines} l · {fit.chars} c{fit.wraps.length ? " · quebra" : ""}</span>
                            </button>
                            );
                        })}
                    </div>
                </Panel>
                <Panel className="ed-video" title="Vídeo e sincronização" style={{ flex: 1 }} actions={<>
                    {media && <Btn small kind={marking ? "rh" : "outline"} onClick={toggleMarking} title="Toca do início; Espaço marca a entrada de cada slide">{marking ? `Marcando · Espaço (${Math.min(marked + 1, slides.length)}/${slides.length})` : marked ? "Marcar de novo" : "Marcar tempos"}</Btn>}
                    <Btn small disabled={busy === "audio_url"} onClick={() => fileRef.current?.click()}>{busy === "audio_url" ? "Enviando…" : media ? "Trocar…" : "Vídeo ou playback…"}</Btn>
                    {media && <Btn small onClick={() => { set({ audio_url: "" }); setStarts([]); setMarking(false); }}>Remover</Btn>}
                </>} bodyStyle={{ display: "flex", gap: "var(--space-2)", padding: "0 var(--space-2) var(--space-2)", overflow: "hidden" }}>
                    <input ref={fileRef} type="file" accept="video/*,audio/*" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; upload(f, "audio_url"); }} />
                    {!media && <Empty icon="film" title="Sem vídeo nem playback">Um vídeo vai para as telas de vídeo junto com a letra; um playback toca no computador. Marque os tempos para a letra seguir a música.</Empty>}
                    {media && (
                        <>
                            <div className="ed-media">{video
                                ? <video ref={mediaRef} src={media} controls preload="metadata" onEnded={() => setMarking(false)} />
                                : <audio ref={mediaRef} src={media} controls preload="metadata" onEnded={() => setMarking(false)} />}
                                <span className="kx-meta">{video ? "Vídeo · vai às telas de vídeo" : "Playback · toca no computador"}</span>
                            </div>
                            <div className="ed-marks">
                                {slides.map((s, i) => (
                                    <div key={i} className={`kx-row kx-row-1 ${marking && i === nextMark ? "is-prev" : ""}`}>
                                        <span className="kx-glyph"><Icon name="music" /></span>
                                        <div className="kx-row-main"><div className="kx-row-title">Slide {i + 1}{s.label ? ` · ${s.label}` : ""}</div></div>
                                        <span className="kx-row-time">{Number.isFinite(starts[i]) ? mmss(starts[i]) : "—"}</span>
                                    </div>
                                ))}
                                {marking && nextMark >= 0 && <div className="listhead"><span className="kx-rh" style={{ fontSize: 11 }}>Tocando · Espaço marca o slide {nextMark + 1}</span></div>}
                            </div>
                        </>
                    )}
                </Panel>
                <div className="ed-acts">
                    {songId !== "new" && <Btn kind={confirm === "delete" ? "air" : ""} onClick={remove}>{confirm === "delete" ? "Excluir mesmo" : "Excluir"}</Btn>}
                    <span style={{ flex: 1 }} />
                    {dirty && <span className="kx-meta">alterações não salvas</span>}
                    <Btn onClick={() => printSong({ ...song, duration: parseDuration(durationText) }, slides)} disabled={!slides.length}>Imprimir</Btn>
                    <Btn onClick={close}>{confirm === "close" ? "Descartar" : "Cancelar"}</Btn>
                    <Btn kind="brand" disabled={busy === "save"} onClick={save} title="Salvar · Ctrl+S">{busy === "save" ? "Salvando…" : "Salvar"}</Btn>
                </div>
            </div>
        </>
    );
}
