import React, { useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Row, Empty, WinBar, onTabsKey, tabStop, SelectManyBtn, SelBar, RowMark } from "./kx";
import { useMultiSelect } from "./useMultiSelect";
import { pickedOf } from "@/lib/console/multiSelect";
import { deleteSeveral } from "./bulkActions";
import { importMediaFiles, importSummary, mediaFromYouTube } from "@/lib/mediaImport";
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
import { keyHint } from "@/lib/console/keys";
import { menuItem } from "@/lib/console/menuLabels";

const CATS = [["todas", "Todas"], ["video", "Vídeos"], ["image", "Imagens"], ["audio", "Áudios"], ["doc", "Apresentações"]];
const inCat = (m, cat) => cat === "todas" || (cat === "image" ? m.type === "image" || m.type === "gif" : cat === "doc" ? m.type === "pdf" || m.type === "powerpoint" : m.type === cat);
const KIND = { video: "Vídeo", image: "Imagem", gif: "GIF", pdf: "PDF", powerpoint: "PowerPoint", audio: "Áudio" };
export const CATEGORY = [["sermon", "Pregação"], ["worship", "Louvor"], ["announcement", "Avisos"], ["testimony", "Testemunho"], ["other", "Outros"]];
const catLabel = (c) => CATEGORY.find(([k]) => k === c)?.[1] || "Outros";
const isYouTube = (m) => m.type === "video" && /youtu/.test(m.file_url || "");
// A thumbnail with a picture: the image itself, a local video's frame, or a
// PDF's first page once its pages are made (Rodada F3).
const hasPoster = (m) => !m.missing && (m.type === "image" || m.type === "gif" || (m.type === "video" && !isYouTube(m)) || (m.type === "pdf" && Boolean(m.thumbnail_url) && !m.posterSyncing));
const isDoc = (m) => m.type === "pdf" || m.type === "powerpoint";
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const bytes = (n) => (n >= 1e9 ? `${(n / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1e3))} KB` : "");
const match = (q, ...f) => !q || f.some((x) => String(x || "").toLowerCase().includes(q));

// The media library as a view inside the console (canvas artboard
// "Biblioteca de mídia"): every file in a grid or a list, by kind and
// category; send several at once ("Do computador"), add a YouTube link,
// rename, recategorise, find a lost file again ("Localizar…"), take rows
// out (the files stay in the media folder). A click selects (Ctrl/Shift
// for more), a double click or Enter sends to air, "Tocar todos"
// plays the selection (or everything shown) one after the other.
export default function MediaView({ c, media, onSend, onClose, escRef, active = true, askText = null, intent = null }) {
    const [cat, setCat] = useState("todas");
    const [category, setCategory] = useState("");
    const [view, setView] = useState(() => { try { return localStorage.getItem("keryx.media.view") || "grid"; } catch { return "grid"; } });
    const [q, setQ] = useState("");
    const [adding, setAdding] = useState(false); // the Adicionar menu in the bar
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
    const shown = useMemo(() => media.filter((m) => inCat(m, cat) && (!category || (m.category || "other") === category) && match(ql, m.title, m.description, KIND[m.type])), [media, cat, category, ql]);
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
        const result = await importMediaFiles(list, { category: category || "other", onProgress: (i) => setUploads((u) => (u ? { ...u, at: i } : u)) });
        const { created } = result;
        setUploads(null);
        c.say(importSummary(result));
        if (created.length) ms.set(created.map((r) => r.id));
    };
    // Link do YouTube… (the Adicionar menu): the url comes from one question
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
            const row = await mediaFromYouTube(url, { category: category || "other" });
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
    const recategorise = (value) => Promise.all(picked.map((m) => keryx.entities.Media.update(m.id, { category: value }))).then(() => c.say(`Categoria: ${catLabel(value)}.`)).catch(fail);
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
    // A file's right-click menu (C-72), as the Biblioteca's: it acts on
    // the file under the pointer; what goes on air is last.
    const fileMenu = (m) => (e) => menu(e, { title: m.title, items: [
        !m.missing && !m.syncing && menuItem("porNaPrevia", { onSelect: () => c.setPrev(stageFromMedia(m)) }),
        !m.missing && !m.syncing && m.type === "video" && { label: "Pôr na prévia para as telas de vídeo", icon: "tv", onSelect: () => c.setPrev(stageFromMedia(m, { toVideo: true })) },
        menuItem("renomear", { onSelect: () => { ms.set([m.id]); setRenaming(m.id); } }),
        m.missing && !m.syncing && { label: "Localizar…", icon: "folder", onSelect: () => locate(m) },
        menuItem("excluir", { kbd: keyHint("delete"), onSelect: () => remove([m]) }),
        !m.missing && !m.syncing && menuItem("enviarAoAr", { air: true, onSelect: () => send(m) }),
    ] });
    const locate = (m) => { locating.current = m; locateRef.current?.click(); };
    const located = async (file) => {
        const m = locating.current;
        locating.current = null;
        if (!m || !file) return;
        try {
            const { file_url } = await keryx.integrations.Core.UploadFile({ file });
            // The old still goes with the old file: the console takes a new one.
            await keryx.entities.Media.update(m.id, { file_url, thumbnail_url: "" });
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
    if (escRef) escRef.current = (mode) => { if (mode !== "esc") onClose(mode === "all"); else if (adding) setAdding(false); else if (renaming) setRenaming(null); else if (ms.count || ms.picking) ms.clear(); else onClose(); };
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

    return (
        <>
        <WinBar title="Mídia" sub={`${media.length} ${media.length === 1 ? "arquivo" : "arquivos"}${totalSize ? ` · ${bytes(totalSize)}` : ""}`} />
        <div className="win-body">
        <div className="col center mv">
            <Panel noHead bodyStyle={{ display: "flex", flexDirection: "column" }}>
                <input ref={fileRef} type="file" multiple hidden accept="video/*,audio/*,image/*,.gif,.pdf,.ppt,.pptx" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
                <input ref={locateRef} type="file" hidden onChange={(e) => { located(e.target.files?.[0]); e.target.value = ""; }} />
                <div className="mv-bar">
                    <div className="kx-tabs mv-cats" role="tablist" aria-label="Tipo de mídia" onKeyDown={onTabsKey}>
                        {CATS.filter(([k]) => k !== "doc" || hasDocs).map(([k, label], i, shown) => <button type="button" role="tab" aria-selected={cat === k} tabIndex={tabStop(i, cat === k, shown.some(([x]) => x === cat))} key={k} className={`kx-t ${cat === k ? "is-on" : ""}`} onClick={() => setCat(k)}>{label}</button>)}
                    </div>
                    <select className="pl-pick" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
                        <option value="">Todas as categorias</option>
                        {CATEGORY.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    {/* The search and Adicionar live here, with the filters
                        (Rodada O, O7: the bar keeps only the window's). */}
                    <Field value={q} onChange={setQ} placeholder="Pesquisar na Mídia" style={{ flex: "0 1 240px", minWidth: 150 }} />
                    <span style={{ flex: 1 }} />
                    <Btn small onClick={sequence} title="Toca os selecionados (ou todos os mostrados) um após o outro">Tocar todos</Btn>
                    <SelectManyBtn on={ms.picking} onToggle={ms.setPicking} />
                    <IconBtn name="layers" small on={view === "grid"} title="Grade" onClick={() => setView("grid")} />
                    <IconBtn name="list" small on={view === "list"} title="Lista" onClick={() => setView("list")} />
                    <span className="pl-popwrap">
                        <Btn small kind="outline" on={adding} onClick={() => setAdding(!adding)}><Icon name="plus" />Adicionar</Btn>
                        {adding && <div className="kx-pop pl-pop">
                            <Row single icon="folder" title="Do computador…" onClick={() => { setAdding(false); fileRef.current?.click(); }} />
                            <Row single icon="youtube" title="Link do YouTube…" onClick={() => { setAdding(false); addLink(); }} />
                        </div>}
                    </span>
                </div>
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
                <SelBar count={picked.length} onClear={ms.clear}>
                    {picked.length === 1 && <Btn small onClick={() => c.setPrev(stageFromMedia(picked[0]))} title="Pôr na Prévia do console">Prévia</Btn>}
                    {picked.length === 1 && <Btn small onClick={() => send(picked[0])} title={sendTip(false)}>{SEND_LABEL}</Btn>}
                    {picked.length === 1 && <Btn small onClick={() => setRenaming(picked[0].id)} title="Renomear · F2">Renomear</Btn>}
                    <select className="pl-pick" value="" onChange={(e) => e.target.value && recategorise(e.target.value)} aria-label="Mudar categoria">
                        <option value="">Categoria…</option>
                        {CATEGORY.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    <Btn small onClick={() => remove()} title="Excluir da Mídia · Delete">Excluir…</Btn>
                </SelBar>
                <div className={`mv-body ${ms.picking ? "is-picking" : ""}`} onClick={(e) => { if (e.target === e.currentTarget) ms.clear(); }}>
                    {!shown.length && !copies.length && <Empty icon="media" title={media.length ? "Nada com esse filtro" : "Nenhuma mídia ainda"}>{media.length ? "Mude a busca, o tipo ou a categoria." : "Use Adicionar › Do computador… (vídeos, áudios, imagens, PDF, PowerPoint) ou Link do YouTube…."}</Empty>}
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
                                <div className={`kx-row-meta ${m.missing && !m.syncing ? "kx-warn" : ""}`}>{m.syncing ? `${KIND[m.type] || m.type} · Baixando…` : m.missing ? "Arquivo não encontrado · Localizar…" : isDoc(m) ? <PagesMeta row={m} kind={[KIND[m.type], catLabel(m.category), bytes(m.size)].filter(Boolean).join(" · ")} /> : [isYouTube(m) ? "YouTube" : KIND[m.type], catLabel(m.category), bytes(m.size)].filter(Boolean).join(" · ")}</div>
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
            </Panel>
        </div>
        </div>
        </>
    );
}
