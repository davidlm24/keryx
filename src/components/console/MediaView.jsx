import React, { useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, IconBtn, Field, Empty, WinBar, SelectManyBtn, RowMark } from "./kx";
import { useMultiSelect } from "./useMultiSelect";
import { pickedOf, selectionCount } from "@/lib/console/multiSelect";
import { deleteSeveral } from "./bulkActions";
import { usePackages } from "./packages";
import { importMediaFiles, importSummary, mediaFromYouTube, uploadFile } from "@/lib/mediaImport";
import { codecFields } from "@/lib/videoCodec";
import { playsInSequence } from "@/lib/presentation";
import PagesMeta, { PagesBar, RowBar } from "./PagesMeta";
import { useCopyingFiles } from "@/hooks/useCopyingFiles";
import { stageFromMedia, stageFromMediaList, stageFromAudioList, liveStageId } from "@/lib/console/stage";
import { SEND_LABEL, sendTip } from "@/lib/console/copy";
import { setDragStage, clearDragStage, STAGE_MIME } from "@/lib/console/dragStage";
import { useConfirm } from "./ConfirmDialog";
import { setDragGhost, stageGhost } from "./dragGhost";
import { PENDING_SAY } from "@/lib/pendingMedia";
import { useContextMenu } from "./ContextMenu";
import { gridStep, columnsOf } from "@/lib/console/gridNav";
import { mediaIcon, copyingRows } from "@/lib/console/libraryRows";
import CodecMark from "@/components/console/CodecMark";
import { keyHint } from "@/lib/console/keys";
import { menuItem } from "@/lib/console/menuLabels";
import { usePrefs } from "@/hooks/useUser";
import { mediaCategoryOf, managedMediaCategories, mediaCategoriesInUse, FALLBACK_CATEGORY } from "@/lib/console/mediaCategories";
import FilterChips from "./library/FilterChips";
import { MediaCategories } from "./library/FundoCategories";

const CATS = [["todas", "Todas"], ["video", "Vídeos"], ["image", "Imagens"], ["audio", "Áudios"], ["doc", "Apresentações"]];
const inCat = (m, cat) => cat === "todas" || (cat === "image" ? m.type === "image" || m.type === "gif" : cat === "doc" ? m.type === "pdf" || m.type === "powerpoint" : m.type === cat);
const KIND = { video: "Vídeo", image: "Imagem", gif: "GIF", pdf: "PDF", powerpoint: "PowerPoint", audio: "Áudio" };
const ALL = "__all";
const isYouTube = (m) => m.type === "video" && /youtu/.test(m.file_url || "");
// A thumbnail with a picture: the image itself, a local video's frame, or a
// PDF's first page once its pages are made (Rodada F3).
const hasPoster = (m) => !m.missing && (m.type === "image" || m.type === "gif" || (m.type === "video" && !isYouTube(m)) || (m.type === "pdf" && Boolean(m.thumbnail_url) && !m.posterSyncing));
const isDoc = (m) => m.type === "pdf" || m.type === "powerpoint";
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const bytes = (n) => (n >= 1e9 ? `${(n / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1e3))} KB` : "");
const match = (q, ...f) => !q || f.some((x) => String(x || "").toLowerCase().includes(q));

// The media library as a page of THE window, a library window like the
// backgrounds' (owner 2026-10-22, "Bibliotecas" B3): the kinds as tabs in
// the bar, Do computador… and Link do YouTube… on its right; flat on the
// window, the church's categories as chips (edited in "Categorias…",
// mediaCategories.js) with the search and the list's buttons, the grid or
// the list, and on the right, always, the file chosen (MediaDetail): what
// it is, its category, what can be done with it — or the marked ones and
// what can be done with them all. Find a lost file again ("Localizar…"),
// take rows out (the files stay in the media folder). A click selects
// (Ctrl/Shift for more), a double click or Enter sends to air, "Tocar
// todos" plays the selection (or everything shown) one after the other.
export default function MediaView({ c, media, onSend, onClose, escRef, active = true, askText = null, intent = null }) {
    const [cat, setCat] = useState("todas");
    const [category, setCategory] = useState(ALL);
    const [editCats, setEditCats] = useState(false);
    const storedCats = usePrefs().media_categories;
    const [view, setView] = useState(() => { try { return localStorage.getItem("keryx.media.view") || "grid"; } catch { return "grid"; } });
    const [q, setQ] = useState("");
    const menu = useContextMenu();
    const gridRef = useRef(null);
    const [renaming, setRenaming] = useState(null);
    const confirm = useConfirm();
    const [uploads, setUploads] = useState(null); // { names, at, failed }
    const fileRef = useRef(null);
    const locateRef = useRef(null);
    const locating = useRef(null);
    const ql = q.trim().toLowerCase();
    const airId = liveStageId(c.cur);

    useEffect(() => { try { localStorage.setItem("keryx.media.view", view); } catch { /* not remembered */ } }, [view]);
    const shown = useMemo(() => media.filter((m) => inCat(m, cat) && (category === ALL || mediaCategoryOf(m) === category) && match(ql, m.title, m.description, KIND[m.type])), [media, cat, category, ql]);
    // The selection (src/lib/console/multiSelect.js, the model every list
    // shares since 2026-10-21; it began here). A page of THE window: Esc
    // clears it through escRef, not the console's (register: false).
    const shownIds = useMemo(() => shown.map((m) => m.id), [shown]);
    const mediaIds = useMemo(() => media.map((m) => m.id), [media]);
    const ms = useMultiSelect({ order: shownIds, existing: mediaIds, mode: "gallery", register: false });
    const picked = pickedOf(ms.sel, shown);
    // The files being copied: a row (a card in the grid) each, "Copiando o
    // arquivo…", until the real row takes its place (Rodada H, HB). The
    // upload list above stays: it says the queue and what failed.
    const copyingFiles = useCopyingFiles();
    const CAT_KINDS = { video: ["video"], image: ["image", "gif"], audio: ["audio"], doc: ["pdf", "powerpoint"] };
    const copies = copyingRows(copyingFiles, media, { kinds: CAT_KINDS[cat] || null, q: ql });
    const totalSize = media.reduce((a, m) => a + (m.size || 0), 0);
    const hasDocs = media.some((m) => inCat(m, "doc"));
    // The chips: the categories that have a file; one that empties (a rename,
    // the last file out) leaves its filter: back to Todos.
    const chips = useMemo(() => mediaCategoriesInUse(storedCats, media), [storedCats, media]);
    const allCats = useMemo(() => managedMediaCategories(storedCats, media), [storedCats, media]);
    useEffect(() => { if (category !== ALL && !chips.includes(category)) setCategory(ALL); }, [category, chips]);
    // Files sent or linked with a chip on go in that category.
    const into = category === ALL ? FALLBACK_CATEGORY : category;

    const fail = (err) => c.say(err?.message || "Não foi possível.");
    // A click picks one; Ctrl/Shift mark more; with Selecionar vários on a
    // click marks or unmarks (multiSelect.js clickSelection).
    const pick = (m, e) => {
        setRenaming(null);
        ms.click(m.id, e);
    };
    // The arrows move the selection (C-72): ↑/↓ in the list; in the grid
    // ←/→ a card and ↑/↓ a row; Home/End; Shift extends from the anchor.
    // The card or row moved to stays in view.
    const step = (e) => {
        const cols = view === "grid" ? columnsOf([...(gridRef.current?.children || [])].map((el) => el.offsetTop)) : 1;
        const from = ms.lead;
        const to = gridStep(from, e.key, shown.length, cols);
        if (to === null || to === from) return to !== null;
        const m = shown[to];
        ms.step(to, e);
        setRenaming(null);
        requestAnimationFrame(() => document.querySelector(`[data-media-id="${CSS.escape(m.id)}"]`)?.scrollIntoView({ block: "nearest" }));
        return true;
    };
    const send = (m) => {
        if (m.syncing) { c.say(PENDING_SAY); return; }
        if (m.missing) { c.say(`Arquivo não encontrado: ${m.title}. Use Localizar… primeiro.`); return; }
        onSend(stageFromMedia(m));
    };
    const sequence = () => {
        const list = (picked.length ? picked : shown).filter((m) => !m.missing);
        const audios = list.filter((m) => m.type === "audio");
        // A PDF goes on air by itself, page by page; a PowerPoint not at all (presentation.js).
        const visual = list.filter(playsInSequence);
        const skipped = list.filter(isDoc).length;
        if (!visual.length && audios.length) { onSend(stageFromAudioList(audios)); c.say(`${audios.length} áudios em sequência no canal de áudio · Esc para a música.`); return; }
        if (!visual.length) { c.say(skipped ? "Apresentações não tocam em sequência: envie uma por vez." : "Nada para tocar: escolha vídeos ou imagens."); return; }
        onSend(stageFromMediaList(visual));
        c.say(`${visual.length} em sequência nas telas${audios.length ? " · os áudios ficam de fora (use Áudios)" : ""}${skipped ? ` · ${skipped === 1 ? "a apresentação fica" : "as apresentações ficam"} de fora (envie uma por vez)` : ""} · Esc interrompe.`);
    };
    const upload = async (files) => {
        const list = Array.from(files || []);
        if (!list.length) return;
        setUploads({ names: list.map((f) => f.name), at: 0, failed: [] });
        const result = await importMediaFiles(list, { category: into, onProgress: (i) => setUploads((u) => (u ? { ...u, at: i } : u)) });
        const { created } = result;
        setUploads(null);
        c.say(importSummary(result));
        if (created.length) ms.set(created.map((r) => r.id));
    };
    // Link do YouTube… (the bar): the url comes from one question
    // (PromptDialog), not a field always on screen (Rodada C, fase b).
    // Opened from the menu bar (Mídia › Do computador… / Link do YouTube…):
    // the page opens on that step, once.
    const didIntent = useRef(false);
    useEffect(() => {
        if (didIntent.current || !intent) return;
        didIntent.current = true;
        if (intent === "upload") fileRef.current?.click();
        else if (intent === "youtube") addLink();
    });
    const addLink = async () => {
        const url = ((await askText?.({ title: "Link do YouTube", placeholder: "https://youtube.com/watch?v=…", ok: "Adicionar" })) || "").trim();
        if (!url) return;
        if (!/youtu\.?be/.test(url)) { c.say("Isso não parece um link do YouTube."); return; }
        try {
            const row = await mediaFromYouTube(url, { category: into });
            ms.set([row.id]);
            setRenaming(row.id);
            c.say('Link adicionado como "Vídeo do YouTube" · dê um nome.');
        } catch (err) { fail(err); }
    };
    const rename = (m, title) => {
        setRenaming(null);
        const t = title.trim();
        if (t && t !== m.title) keryx.entities.Media.update(m.id, { title: t }).catch(fail);
    };
    const recategorise = (value, rows = picked) => Promise.all(rows.map((m) => keryx.entities.Media.update(m.id, { category: value }))).then(() => c.say(`Categoria: ${value}.`)).catch(fail);
    // Excluir asks first (useConfirm, as every Excluir does); the files stay
    // in the media folder.
    // One question for one file or many (bulkActions.js, M5 = A): it names
    // them, warns about the setlists that use them (their items leave too),
    // and opens on Cancelar. The deleted rows leave the selection by
    // themselves (useMultiSelect prunes).
    const remove = (rows = picked) => deleteSeveral({
        confirm, say: c.say, entity: "Media", kind: "media", rows,
        text: rows.length === 1 ? "O arquivo continua na pasta de mídia do computador." : "Os arquivos continuam na pasta de mídia do computador.",
        after: rows.length === 1 ? "O arquivo continua na pasta de mídia." : "Os arquivos continuam na pasta de mídia.",
    }).catch(fail);
    // Exportar…: a KERYX package with the files (packages.js).
    const { exportItems } = usePackages();
    const exportRows = (rows = picked) => exportItems("media", rows);
    // A file's right-click menu (C-72), as the Biblioteca's: it acts on
    // the file under the pointer (on all the marked ones when it is one of
    // several, M7); what goes on air is last.
    const fileMenu = (m) => (e) => (picked.length > 1 && ms.has(m.id) ? menu(e, { title: selectionCount(picked.length), items: [
        menuItem("exportar", { label: `Exportar ${picked.length}…`, onSelect: () => exportRows(picked) }),
        menuItem("excluir", { label: `Excluir ${picked.length}…`, kbd: keyHint("delete"), onSelect: () => remove(picked) }),
        { label: "Limpar a seleção", icon: "x", onSelect: ms.clear },
    ] }) : menu(e, { title: m.title, items: [
        !m.missing && !m.syncing && menuItem("porNaPrevia", { onSelect: () => c.setPrev(stageFromMedia(m)) }),
        !m.missing && !m.syncing && m.type === "video" && { label: "Pôr na prévia para as telas de vídeo", icon: "tv", onSelect: () => c.setPrev(stageFromMedia(m, { toVideo: true })) },
        menuItem("renomear", { onSelect: () => { ms.set([m.id]); setRenaming(m.id); } }),
        m.missing && !m.syncing && { label: "Localizar…", icon: "folder", onSelect: () => locate(m) },
        !m.missing && menuItem("exportar", { onSelect: () => exportRows([m]) }),
        menuItem("excluir", { kbd: keyHint("delete"), onSelect: () => remove([m]) }),
        !m.missing && !m.syncing && menuItem("enviarAoAr", { air: true, onSelect: () => send(m) }),
    ] }));
    const locate = (m) => { locating.current = m; locateRef.current?.click(); };
    const located = async (file) => {
        const m = locating.current;
        locating.current = null;
        if (!m || !file) return;
        try {
            // A video that may freeze is refused here too (uploadFile).
            const { file_url, codec } = await uploadFile(file);
            // The old still and codec go with the old file: the console takes
            // a new still, and the codec is the new file's (read now, else
            // cleared for the backfill).
            await keryx.entities.Media.update(m.id, { file_url, thumbnail_url: "", video_codec: null, video_bit_depth: null, video_chroma: null, ...codecFields(codec) });
            c.say(`${m.title}: arquivo encontrado.`);
        } catch (err) { fail(err); }
    };
    // A file's length, read once from the file itself when the row has none.
    const learn = (m, seconds) => { if (!m.duration && Number.isFinite(seconds) && seconds > 0) keryx.entities.Media.update(m.id, { duration: Math.round(seconds) }).catch(() => {}); };

    // Esc comes routed from the console (keys.js ESC_ORDER "window", so
    // whatever is open over the page closes first, and a field's Esc
    // already blurred): close renaming, then the selection, then leave.
    // The Voltar chip ("back") and the (x) ("all") leave at once — nothing
    // to guard, the Mídia saves as it goes.
    // The other keys stay the page's own: Enter sends one selected file;
    // Delete asks to take it out (Backspace never does: on Windows it is
    // not a delete key, audit C-11); Ctrl+A selects what is shown. They defer
    // to a dialog over the page (its own scrim does not count) and sleep
    // while another page covers this one; the console's B and L still
    // reach the screens.
    if (escRef) escRef.current = (mode) => { if (mode !== "esc") onClose(mode === "all"); else if (editCats) setEditCats(false); else if (renaming) setRenaming(null); else if (ms.count || ms.picking) ms.clear(); else onClose(); };
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (e.key === "Escape" || !active) return;
        if (document.querySelector(".console .scrim:not(.win-scrim)")) return;
        const field = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
        if (field) return;
        if (e.key === "Enter" && picked.length === 1) { e.preventDefault(); e.stopPropagation(); send(picked[0]); }
        else if (e.key === "Delete" && picked.length) { e.preventDefault(); e.stopPropagation(); remove(); }
        else if (e.key === "a" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); ms.all(); }
        else if (e.key === "F2" && picked.length === 1) { e.preventDefault(); setRenaming(picked[0].id); }
        else if (!e.ctrlKey && !e.metaKey && !e.altKey && ["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key) && step(e)) { e.preventDefault(); e.stopPropagation(); }
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    const drag = (m) => ({
        draggable: true,
        onDragStart: (e) => { const s = stageFromMedia(m); setDragStage(s); e.dataTransfer.setData(STAGE_MIME, s.id); e.dataTransfer.effectAllowed = "copyMove"; setDragGhost(e, stageGhost(s)); },
        onDragEnd: () => clearDragStage(),
    });
    const state = (m) => `${ms.has(m.id) ? "is-sel is-marked" : ""} ${airId === `media:${m.id}` || c.cur?.audio?.id === m.id ? "is-air" : ""} ${m.missing && !m.syncing ? "is-warn" : ""}`;
    const renameField = (m) => (
        <input className="mv-rename" defaultValue={m.title} autoFocus aria-label="Renomear" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Enter") rename(m, e.currentTarget.value); if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} onBlur={(e) => rename(m, e.currentTarget.value)} />
    );

    const kinds = CATS.filter(([k]) => k !== "doc" || hasDocs);
    return (
        <>
        <WinBar title="Mídia" sub={`${media.length} ${media.length === 1 ? "arquivo" : "arquivos"}${totalSize ? ` · ${bytes(totalSize)}` : ""}`}
            tabs={{ label: "Tipo de mídia", options: kinds, value: cat, onChange: setCat }}
            actions={<>
                <Btn small onClick={() => fileRef.current?.click()} title="Vídeos, áudios, imagens, PDF"><Icon name="download" />Do computador…</Btn>
                <Btn small onClick={addLink}><Icon name="youtube" />Link do YouTube…</Btn>
            </>} />
        <div className="win-body mv">
            <input ref={fileRef} type="file" multiple hidden accept="video/*,audio/*,image/*,.gif,.pdf,.ppt,.pptx" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
            <input ref={locateRef} type="file" hidden onChange={(e) => { located(e.target.files?.[0]); e.target.value = ""; }} />
            <div className="mv-main">
                {editCats ? <div className="mv-cats-edit"><MediaCategories c={c} media={media} onDone={() => setEditCats(false)} /></div> : <>
                <FilterChips options={[[ALL, "Todos"], ...chips.map((k) => [k, k])]} value={category} onChange={setCategory} onEdit={() => setEditCats(true)}>
                    {/* The search and the list's buttons, with the filters
                        (the bar keeps the window's: the kinds, adding). */}
                    <span className="mv-tools">
                        <Field value={q} onChange={setQ} placeholder="Pesquisar na Mídia" style={{ width: 200 }} />
                        <Btn small onClick={sequence} title="Toca os selecionados (ou todos os mostrados) um após o outro">Tocar todos</Btn>
                        <SelectManyBtn on={ms.picking} onToggle={ms.setPicking} />
                        <IconBtn name="layers" small on={view === "grid"} title="Grade" onClick={() => setView("grid")} />
                        <IconBtn name="list" small on={view === "list"} title="Lista" onClick={() => setView("list")} />
                    </span>
                </FilterChips>
                {uploads && (
                    <div className="mv-up">
                        <div className="listhead"><span className="kx-section">Enviando <span className="kx-count">· {Math.min(uploads.at + 1, uploads.names.length)} de {uploads.names.length} {uploads.names.length === 1 ? "arquivo" : "arquivos"}</span></span></div>
                        {uploads.names.map((n, i) => (
                            <div key={`${n}${i}`} className="mv-up-row">
                                <span className="kx-glyph"><Icon name={i < uploads.at ? "check" : "dot"} /></span>
                                <span className="mv-up-n">{n}</span>
                                <div className="prog2"><i className={i === uploads.at ? "is-busy" : ""} style={{ transform: `scaleX(${i < uploads.at ? 1 : i === uploads.at ? 1 : 0})` }} /></div>
                                <span className="kx-meta">{i < uploads.at ? "pronto" : i === uploads.at ? "copiando o arquivo…" : "na fila"}</span>
                            </div>
                        ))}
                    </div>
                )}
                <div className={`mv-body ${ms.picking ? "is-picking" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) ms.clear(); }}>
                    {!shown.length && !copies.length && <Empty icon="media" title={media.length ? "Nada com esse filtro" : "Nenhuma mídia ainda"}>{media.length ? "Mude a busca, o tipo ou a categoria." : "Use Do computador… (vídeos, áudios, imagens, PDF) ou Link do YouTube…, na barra."}</Empty>}
                    {view === "grid" && (shown.length > 0 || copies.length > 0) && (
                        <div className="mv-grid" ref={gridRef}>
                            {copies.map((p) => (
                                <div key={p.key} className="mv-cell is-copying">
                                    <span className="mv-th kx-t">
                                        <span className="mv-th-t"><Icon name={mediaIcon(p)} size={22} />{p.meta}</span>
                                        <span className="mv-lab">{KIND[p.type] || p.type}</span>
                                        <RowBar />
                                    </span>
                                    <span className="mv-title" title={p.title}>{p.title}</span>
                                </div>
                            ))}
                            {shown.map((m) => (
                                <div key={m.id} className="mv-cell" data-media-id={m.id} onContextMenu={fileMenu(m)}>
                                    <button type="button" className={`mv-th kx-t ${state(m)}`} title={m.title} onClick={(e) => pick(m, e)} onDoubleClick={() => { if (!ms.picking) send(m); }} {...drag(m)}>
                                        {(m.type === "image" || m.type === "gif") && !m.missing && <img src={m.file_url} alt="" loading="lazy" />}
                                        {m.type === "video" && !isYouTube(m) && !m.missing && (m.thumbnail_url && m.duration > 0 && !m.posterSyncing
                                            ? <img src={m.thumbnail_url} alt="" loading="lazy" />
                                            : <video src={`${m.file_url}#t=1`} preload="metadata" muted onLoadedMetadata={(e) => learn(m, e.currentTarget.duration)} />)}
                                        {m.type === "audio" && !m.missing && <audio src={m.file_url} preload="metadata" onLoadedMetadata={(e) => learn(m, e.currentTarget.duration)} />}
                                        {m.type === "pdf" && !m.missing && m.thumbnail_url && !m.posterSyncing && <img src={m.thumbnail_url} alt="" loading="lazy" />}
                                        {!hasPoster(m) && (
                                            <span className={`mv-th-t ${m.missing && !m.syncing ? "is-warn" : ""}`}>{m.syncing ? <><Icon name="download" size={22} />Baixando…</> : m.missing ? "Arquivo não encontrado" : <><Icon name={mediaIcon(m)} size={22} />{isYouTube(m) ? "YouTube" : KIND[m.type]}</>}</span>
                                        )}
                                        <span className="mv-lab">{isYouTube(m) ? "YouTube" : KIND[m.type] || m.type}</span>
                                        {ms.picking && <RowMark />}
                                        {(m.duration > 0 || isYouTube(m)) && <span className="mv-n">{isYouTube(m) ? "link" : mmss(m.duration)}</span>}
                                        {m.type === "pdf" && <PagesBar id={m.id} />}
                                    </button>
                                    {renaming === m.id ? renameField(m) : <span className="mv-title" onDoubleClick={() => setRenaming(m.id)}>{m.title}</span>}
                                    {isDoc(m) && !m.missing && <span className="kx-meta mv-sub"><PagesMeta row={m} /></span>}
                                    {m.type === "video" && <CodecMark row={m} />}
                                    {m.missing && !m.syncing && <Btn small kind="outline" onClick={() => locate(m)}>Localizar…</Btn>}
                                </div>
                            ))}
                        </div>
                    )}
                    {view === "list" && copies.map((p) => (
                        <div key={p.key} className="kx-row kx-t mv-row is-copying">
                            <span className="kx-glyph"><Icon name={mediaIcon(p)} /></span>
                            <div className="kx-row-main">
                                <div className="kx-row-title" title={p.title}>{p.title}</div>
                                <div className="kx-row-meta">{[KIND[p.type], p.meta].filter(Boolean).join(" · ")}</div>
                            </div>
                            <RowBar />
                        </div>
                    ))}
                    {view === "list" && shown.map((m) => (
                        <div key={m.id} className={`kx-row kx-t mv-row ${state(m)}`} role="button" tabIndex={0} data-media-id={m.id} onClick={(e) => pick(m, e)} onDoubleClick={() => { if (!ms.picking) send(m); }} onContextMenu={fileMenu(m)} {...drag(m)}>
                            {ms.picking && <RowMark />}
                            <span className="kx-glyph"><Icon name={mediaIcon(m)} /></span>
                            <div className="kx-row-main">
                                {renaming === m.id ? renameField(m) : <div className="kx-row-title" title={m.title}>{m.title}</div>}
                                <div className={`kx-row-meta ${m.missing && !m.syncing ? "kx-warn" : ""}`}>{m.syncing ? `${KIND[m.type] || m.type} · Baixando…` : m.missing ? "Arquivo não encontrado · Localizar…" : isDoc(m) ? <PagesMeta row={m} kind={[KIND[m.type], mediaCategoryOf(m), bytes(m.size)].filter(Boolean).join(" · ")} /> : <>{[isYouTube(m) ? "YouTube" : KIND[m.type], mediaCategoryOf(m), bytes(m.size)].filter(Boolean).join(" · ")}{m.type === "video" && <> <CodecMark row={m} /></>}</>}</div>
                            </div>
                            <span className="kx-row-time kx-hide-on-hover">{m.duration ? mmss(m.duration) : ""}</span>
                            <span className="kx-row-acts">
                                {m.syncing ? null : m.missing ? <Btn onClick={(e) => { e.stopPropagation(); locate(m); }} title="Localizar o arquivo…" aria-label={`Localizar o arquivo de ${m.title}`}><span className="kx-act-i"><Icon name="folder" /></span><span className="kx-act-l">Localizar…</span></Btn> : <>
                                    <Btn onClick={(e) => { e.stopPropagation(); ms.set([m.id]); setRenaming(m.id); }} title="Renomear · F2" aria-label={`Renomear ${m.title}`}><span className="kx-act-i"><Icon name="edit" /></span><span className="kx-act-l">Renomear</span></Btn>
                                    <Btn onClick={(e) => { e.stopPropagation(); send(m); }} title={sendTip(false)} aria-label={`${SEND_LABEL}: ${m.title}`}><span className="kx-act-i"><Icon name="play" /></span><span className="kx-act-l">Tocar</span></Btn>
                                </>}
                            </span>
                            {m.type === "pdf" && <PagesBar id={m.id} />}
                        </div>
                    ))}
                </div>
                </>}
            </div>
            <MediaDetail picked={picked} categories={allCats} kind={(m) => (isYouTube(m) ? "YouTube" : KIND[m.type] || m.type)} length={mmss} size={bytes}
                onPrev={(m) => c.setPrev(stageFromMedia(m))} onSend={send} onRename={(m) => { ms.set([m.id]); setRenaming(m.id); }} onLocate={locate}
                onCategory={recategorise} onExport={exportRows} onRemove={remove} onPlay={sequence} onClear={ms.clear} />
        </div>
        </>
    );
}

// The Mídia's right side, always on screen (owner 2026-10-22, "Bibliotecas"
// B3-2 = C): the file chosen — its picture, what it is, its length and size,
// its category, and what can be done with it —; with several marked, how
// many and what can be done with them all; with none, where to start.
function MediaDetail({ picked, categories, kind, length, size, onPrev, onSend, onRename, onLocate, onCategory, onExport, onRemove, onPlay, onClear }) {
    const catSelect = (value, rows) => (
        <select className="pl-pick" value={value} onChange={(e) => e.target.value && onCategory(e.target.value, rows)} aria-label="Categoria">
            {!value && <option value="">Mudar para…</option>}
            {categories.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
    );
    if (!picked.length) {
        return <aside className="mv-side is-empty" aria-label="Arquivo escolhido"><Empty icon="media" title="Escolha um arquivo para ver aqui">Um clique escolhe; Ctrl ou Shift marcam vários.</Empty></aside>;
    }
    if (picked.length > 1) {
        return (
            <aside className="mv-side" aria-label="Arquivos marcados">
                <div className="mv-side-t">{selectionCount(picked.length)}</div>
                <div className="mv-meta"><span className="k">Categoria</span>{catSelect("", picked)}</div>
                <div className="mv-side-acts">
                    <Btn small onClick={onPlay} title="Um após o outro">Tocar em sequência</Btn>
                    <Btn small onClick={() => onExport(picked)} title="Exportar num pacote do KERYX, com os arquivos">Exportar…</Btn>
                    <Btn small onClick={() => onRemove(picked)} title="Excluir da Mídia · Delete"><Icon name="trash" />Excluir…</Btn>
                    <Btn small onClick={onClear} title="Esc"><Icon name="x" />Limpar a seleção</Btn>
                </div>
            </aside>
        );
    }
    const m = picked[0];
    const ok = !m.missing && !m.syncing;
    const yt = m.type === "video" && /youtu/.test(m.file_url || "");
    const still = m.missing ? null : (m.type === "image" || m.type === "gif") ? m.file_url : (m.type === "video" || m.type === "pdf") && m.thumbnail_url && !m.posterSyncing ? m.thumbnail_url : null;
    return (
        <aside className="mv-side" aria-label="Arquivo escolhido">
            <div className="mv-side-screen">
                {still ? <img src={still} alt="" />
                    : m.type === "video" && !yt && !m.missing ? <video src={`${m.file_url}#t=1`} preload="metadata" muted />
                    : <span className="mv-th-t"><Icon name={m.syncing ? "download" : mediaIcon(m)} size={28} />{m.syncing ? "Baixando…" : m.missing ? "Arquivo não encontrado" : kind(m)}</span>}
            </div>
            <div className="mv-side-t" title={m.title}>{m.title}</div>
            <div className="mv-meta">
                <span className="k">Tipo</span><span>{kind(m)}{m.type === "video" && <> <CodecMark row={m} /></>}</span>
                {m.duration > 0 && <><span className="k">Duração</span><span>{length(m.duration)}</span></>}
                {size(m.size) && <><span className="k">Tamanho</span><span>{size(m.size)}</span></>}
                {(m.type === "pdf" || m.type === "powerpoint") && !m.missing && <><span className="k">Páginas</span><span><PagesMeta row={m} /></span></>}
                <span className="k">Categoria</span>{catSelect(mediaCategoryOf(m), [m])}
            </div>
            <div className="mv-side-acts">
                {ok && <Btn small onClick={() => onPrev(m)} title="Pôr na Prévia do console">Pôr na prévia</Btn>}
                {ok && <Btn small onClick={() => onSend(m)} title={sendTip(false)}>{SEND_LABEL}</Btn>}
                {m.missing && !m.syncing && <Btn small kind="outline" onClick={() => onLocate(m)}><Icon name="folder" />Localizar…</Btn>}
                <Btn small onClick={() => onRename(m)} title="F2"><Icon name="edit" />Renomear</Btn>
                <Btn small onClick={() => onRemove([m])} title="Excluir da Mídia · Delete"><Icon name="trash" />Excluir…</Btn>
            </div>
        </aside>
    );
}
