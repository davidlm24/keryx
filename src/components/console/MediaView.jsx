import React, { useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Row, Empty, WinBar } from "./kx";
import { importMediaFiles, mediaFromYouTube } from "@/lib/mediaImport";
import { stageFromMedia, stageFromMediaList, stageFromAudioList, liveStageId } from "@/lib/console/stage";
import { SEND_LABEL, sendTip } from "@/lib/console/copy";
import { setDragStage, clearDragStage, STAGE_MIME } from "@/lib/console/dragStage";
import { useConfirm } from "./ConfirmDialog";
import { setDragGhost, stageGhost } from "./dragGhost";

const CATS = [["todas", "Todas"], ["video", "Vídeos"], ["image", "Imagens"], ["audio", "Áudios"], ["doc", "Apresentações"]];
const inCat = (m, cat) => cat === "todas" || (cat === "image" ? m.type === "image" || m.type === "gif" : cat === "doc" ? m.type === "pdf" || m.type === "powerpoint" : m.type === cat);
const KIND = { video: "Vídeo", image: "Imagem", gif: "GIF", pdf: "PDF", powerpoint: "PowerPoint", audio: "Áudio" };
const ICON = { video: "film", image: "image", gif: "image", pdf: "film", powerpoint: "film", audio: "volume" };
export const CATEGORY = [["sermon", "Pregação"], ["worship", "Louvor"], ["announcement", "Avisos"], ["testimony", "Testemunho"], ["other", "Outros"]];
const catLabel = (c) => CATEGORY.find(([k]) => k === c)?.[1] || "Outros";
const isYouTube = (m) => m.type === "video" && /youtu/.test(m.file_url || "");
// A thumbnail with a picture: the image itself, or a local video's frame.
const hasPoster = (m) => !m.missing && (m.type === "image" || m.type === "gif" || (m.type === "video" && !isYouTube(m)));
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const bytes = (n) => (n >= 1e9 ? `${(n / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} GB` : n >= 1e6 ? `${Math.round(n / 1e6)} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1e3))} KB` : "");
const match = (q, ...f) => !q || f.some((x) => String(x || "").toLowerCase().includes(q));

// The media library as a view inside the console (canvas artboard
// "Biblioteca de mídia"): every file in a grid or a list, by kind and
// category; send several at once ("Enviar arquivos"), add a YouTube link,
// rename, recategorise, find a lost file again ("Localizar…"), take rows
// out (the files stay in the media folder). A click selects (Ctrl/Shift
// for more), a double click or Enter sends to air, "Tocar todos"
// plays the selection (or everything shown) one after the other.
export default function MediaView({ c, media, onSend, onClose, escRef, active = true, askText = null, intent = null }) {
    const [cat, setCat] = useState("todas");
    const [category, setCategory] = useState("");
    const [view, setView] = useState(() => { try { return localStorage.getItem("keryx.media.view") || "grid"; } catch { return "grid"; } });
    const [q, setQ] = useState("");
    const [adding, setAdding] = useState(false); // the Enviar menu in the bar
    const [sel, setSel] = useState([]);
    const [anchor, setAnchor] = useState(null);
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
    const picked = shown.filter((m) => sel.includes(m.id));
    const totalSize = media.reduce((a, m) => a + (m.size || 0), 0);
    const hasDocs = media.some((m) => inCat(m, "doc"));
    useEffect(() => { setSel((s) => s.filter((id) => media.some((m) => m.id === id))); }, [media]);

    const fail = (err) => c.say(err?.message || "Não foi possível.");
    const pick = (m, e) => {
        setRenaming(null);
        if (e?.shiftKey && anchor) {
            const a = shown.findIndex((x) => x.id === anchor);
            const b = shown.findIndex((x) => x.id === m.id);
            const range = shown.slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
            setSel((s) => [...new Set([...s, ...range])]);
            return;
        }
        if (e?.ctrlKey || e?.metaKey) { setSel((s) => (s.includes(m.id) ? s.filter((x) => x !== m.id) : [...s, m.id])); setAnchor(m.id); return; }
        setSel([m.id]);
        setAnchor(m.id);
    };
    const send = (m) => {
        if (m.missing) { c.say(`Arquivo não encontrado: ${m.title}. Use Localizar… primeiro.`); return; }
        onSend(stageFromMedia(m));
    };
    const sequence = () => {
        const list = (picked.length ? picked : shown).filter((m) => !m.missing);
        const audios = list.filter((m) => m.type === "audio");
        const visual = list.filter((m) => m.type !== "audio" && m.type !== "powerpoint");
        const skipped = list.filter((m) => m.type === "powerpoint").length;
        if (!visual.length && audios.length) { onSend(stageFromAudioList(audios)); c.say(`${audios.length} áudios em sequência no canal de áudio · Esc não para a música.`); return; }
        if (!visual.length) { c.say("Nada para tocar: escolha vídeos ou imagens."); return; }
        onSend(stageFromMediaList(visual));
        c.say(`${visual.length} em sequência nas telas${audios.length ? " · os áudios ficam de fora (use Áudios)" : ""}${skipped ? ` · ${skipped} PowerPoint não toca em sequência (salve como PDF)` : ""} · Esc interrompe.`);
    };
    const upload = async (files) => {
        const list = Array.from(files || []);
        if (!list.length) return;
        setUploads({ names: list.map((f) => f.name), at: 0, failed: [] });
        const { created, failed } = await importMediaFiles(list, { category: category || "other", onProgress: (i) => setUploads((u) => (u ? { ...u, at: i } : u)) });
        setUploads(null);
        c.say(`${created.length} ${created.length === 1 ? "arquivo adicionado" : "arquivos adicionados"}${failed.length ? ` · falhou: ${failed.map((x) => x.name).join(", ")}` : ""}.`);
        if (created.length) setSel(created.map((r) => r.id));
    };
    // Link do YouTube… (the Enviar menu): the url comes from one question
    // (PromptDialog), not a field always on screen (Rodada C, fase b).
    // Opened from the menu bar (Mídia › Enviar arquivos… / Link do YouTube…):
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
            setSel([row.id]);
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
    const remove = async () => {
        if (!picked.length) return;
        const one = picked.length === 1;
        const ok = await confirm({
            title: one ? "Excluir da Mídia?" : `Excluir ${picked.length} arquivos da Mídia?`,
            text: `${one ? `"${picked[0].title}" sai` : "Eles saem"} da Mídia; ${one ? "o arquivo continua" : "os arquivos continuam"} na pasta de mídia do computador.`,
        });
        if (!ok) return;
        try {
            for (const m of picked) await keryx.entities.Media.delete(m.id);
            c.say(`${one ? "Excluído" : `${picked.length} excluídos`} da Mídia · os arquivos continuam na pasta de mídia.`);
            setSel([]);
        } catch (err) { fail(err); }
    };
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
    // Delete asks to take it out; Ctrl+A selects what is shown. They defer
    // to a dialog over the page (its own scrim does not count) and sleep
    // while another page covers this one; the console's B and L still
    // reach the screens.
    if (escRef) escRef.current = (mode) => { if (mode !== "esc") onClose(mode === "all"); else if (adding) setAdding(false); else if (renaming) setRenaming(null); else if (sel.length) setSel([]); else onClose(); };
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (e.key === "Escape" || !active) return;
        if (document.querySelector(".console .scrim:not(.win-scrim)")) return;
        const field = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
        if (field) return;
        if (e.key === "Enter" && picked.length === 1) { e.preventDefault(); e.stopPropagation(); send(picked[0]); }
        else if ((e.key === "Delete" || e.key === "Backspace") && picked.length) { e.preventDefault(); e.stopPropagation(); remove(); }
        else if (e.key === "a" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); setSel(shown.map((m) => m.id)); }
        else if (e.key === "F2" && picked.length === 1) { e.preventDefault(); setRenaming(picked[0].id); }
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
    const state = (m) => `${sel.includes(m.id) ? "is-sel" : ""} ${airId === `media:${m.id}` || c.cur?.audio?.id === m.id ? "is-air" : ""} ${m.missing ? "is-warn" : ""}`;
    const renameField = (m) => (
        <input className="mv-rename" defaultValue={m.title} autoFocus aria-label="Renomear" onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Enter") rename(m, e.currentTarget.value); if (e.key === "Escape") { e.stopPropagation(); setRenaming(null); } }} onBlur={(e) => rename(m, e.currentTarget.value)} />
    );

    return (
        <>
        <WinBar title="Mídia" sub={`${media.length} ${media.length === 1 ? "arquivo" : "arquivos"}${totalSize ? ` · ${bytes(totalSize)}` : ""}`}
            tools={<Field value={q} onChange={setQ} placeholder="Pesquisar na biblioteca" style={{ flex: "0 1 280px", minWidth: 160 }} />}
            actions={<span className="pl-popwrap">
                <Btn small kind="outline" on={adding} onClick={() => setAdding(!adding)}><Icon name="plus" />Enviar</Btn>
                {adding && <div className="kx-pop pl-pop">
                    <Row single icon="folder" title="Do computador…" onClick={() => { setAdding(false); fileRef.current?.click(); }} />
                    <Row single icon="film" title="Link do YouTube…" onClick={() => { setAdding(false); addLink(); }} />
                </div>}
            </span>} />
        <div className="win-body">
        <div className="col center mv">
            <Panel noHead bodyStyle={{ display: "flex", flexDirection: "column" }}>
                <input ref={fileRef} type="file" multiple hidden accept="video/*,audio/*,image/*,.gif,.pdf,.ppt,.pptx" onChange={(e) => { upload(e.target.files); e.target.value = ""; }} />
                <input ref={locateRef} type="file" hidden onChange={(e) => { located(e.target.files?.[0]); e.target.value = ""; }} />
                <div className="mv-bar">
                    <div className="kx-tabs mv-cats" role="tablist">
                        {CATS.filter(([k]) => k !== "doc" || hasDocs).map(([k, label]) => <button type="button" role="tab" aria-selected={cat === k} key={k} className={`kx-t ${cat === k ? "is-on" : ""}`} onClick={() => setCat(k)}>{label}</button>)}
                    </div>
                    <select className="pl-pick" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Categoria">
                        <option value="">Todas as categorias</option>
                        {CATEGORY.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                    </select>
                    <span style={{ flex: 1 }} />
                    <Btn small onClick={sequence} title="Toca os selecionados (ou todos os mostrados) um após o outro">Tocar todos</Btn>
                    <IconBtn name="layers" small on={view === "grid"} title="Grade" onClick={() => setView("grid")} />
                    <IconBtn name="list" small on={view === "list"} title="Lista" onClick={() => setView("list")} />
                </div>
                {uploads && (
                    <div className="mv-up">
                        <div className="listhead"><span className="kx-section">Enviando <span className="kx-count">· {Math.min(uploads.at + 1, uploads.names.length)} de {uploads.names.length} {uploads.names.length === 1 ? "arquivo" : "arquivos"}</span></span></div>
                        {uploads.names.map((n, i) => (
                            <div key={`${n}${i}`} className="mv-up-row">
                                <span className="kx-glyph"><Icon name={i < uploads.at ? "check" : "dot"} /></span>
                                <span className="mv-up-n">{n}</span>
                                <div className="prog2"><i className={i === uploads.at ? "is-busy" : ""} style={{ transform: `scaleX(${i < uploads.at ? 1 : i === uploads.at ? 0.6 : 0})` }} /></div>
                                <span className="kx-meta">{i < uploads.at ? "pronto" : i === uploads.at ? "copiando…" : "na fila"}</span>
                            </div>
                        ))}
                    </div>
                )}
                {picked.length > 0 && (
                    <div className="mv-selbar">
                        <span className="kx-section">{picked.length} {picked.length === 1 ? "selecionado" : "selecionados"}</span>
                        <span style={{ flex: 1 }} />
                        {picked.length === 1 && <Btn small onClick={() => c.setPrev(stageFromMedia(picked[0]))} title="Pôr na Prévia do console">Prévia</Btn>}
                        {picked.length === 1 && <Btn small onClick={() => send(picked[0])} title={sendTip(false)}>{SEND_LABEL}</Btn>}
                        {picked.length === 1 && <Btn small onClick={() => setRenaming(picked[0].id)} title="Renomear · F2">Renomear</Btn>}
                        <select className="pl-pick" value="" onChange={(e) => e.target.value && recategorise(e.target.value)} aria-label="Mudar categoria">
                            <option value="">Categoria…</option>
                            {CATEGORY.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                        </select>
                        <Btn small onClick={remove} title="Excluir da Mídia · Delete">Excluir…</Btn>
                        <IconBtn name="x" small title="Limpar seleção · Esc" onClick={() => setSel([])} />
                    </div>
                )}
                <div className="mv-body" onClick={(e) => { if (e.target === e.currentTarget) setSel([]); }}>
                    {!shown.length && <Empty icon="film" title={media.length ? "Nada com esse filtro" : "Nenhuma mídia ainda"}>{media.length ? "Mude a busca, o tipo ou a categoria." : "Use Enviar arquivos (vídeos, áudios, imagens, PDF, PowerPoint) ou adicione um link do YouTube."}</Empty>}
                    {view === "grid" && shown.length > 0 && (
                        <div className="mv-grid">
                            {shown.map((m) => (
                                <div key={m.id} className="mv-cell">
                                    <button type="button" className={`mv-th kx-t ${state(m)}`} title={m.title} onClick={(e) => pick(m, e)} onDoubleClick={() => send(m)} {...drag(m)}>
                                        {(m.type === "image" || m.type === "gif") && !m.missing && <img src={m.file_url} alt="" loading="lazy" />}
                                        {m.type === "video" && !isYouTube(m) && !m.missing && (m.thumbnail_url && m.duration > 0
                                            ? <img src={m.thumbnail_url} alt="" loading="lazy" />
                                            : <video src={`${m.file_url}#t=1`} preload="metadata" muted onLoadedMetadata={(e) => learn(m, e.currentTarget.duration)} />)}
                                        {m.type === "audio" && !m.missing && <audio src={m.file_url} preload="metadata" onLoadedMetadata={(e) => learn(m, e.currentTarget.duration)} />}
                                        {!hasPoster(m) && (
                                            <span className={`mv-th-t ${m.missing ? "is-warn" : ""}`}>{m.missing ? "Arquivo não encontrado" : <><Icon name={ICON[m.type] || "film"} size={22} />{isYouTube(m) ? "YouTube" : KIND[m.type]}</>}</span>
                                        )}
                                        <span className="mv-lab">{isYouTube(m) ? "YouTube" : KIND[m.type] || m.type}</span>
                                        {(m.duration > 0 || isYouTube(m)) && <span className="mv-n">{isYouTube(m) ? "link" : mmss(m.duration)}</span>}
                                    </button>
                                    {renaming === m.id ? renameField(m) : <span className="mv-title" onDoubleClick={() => setRenaming(m.id)}>{m.title}</span>}
                                    {m.missing && <Btn small kind="outline" onClick={() => locate(m)}>Localizar…</Btn>}
                                </div>
                            ))}
                        </div>
                    )}
                    {view === "list" && shown.map((m) => (
                        <div key={m.id} className={`kx-row kx-t mv-row ${state(m)}`} role="button" tabIndex={0} onClick={(e) => pick(m, e)} onDoubleClick={() => send(m)} {...drag(m)}>
                            <span className="kx-glyph"><Icon name={ICON[m.type] || "film"} /></span>
                            <div className="kx-row-main">
                                {renaming === m.id ? renameField(m) : <div className="kx-row-title">{m.title}</div>}
                                <div className={`kx-row-meta ${m.missing ? "kx-warn" : ""}`}>{m.missing ? "Arquivo não encontrado · Localizar…" : [isYouTube(m) ? "YouTube" : KIND[m.type], catLabel(m.category), bytes(m.size)].filter(Boolean).join(" · ")}</div>
                            </div>
                            <span className="kx-row-time kx-hide-on-hover">{m.duration ? mmss(m.duration) : ""}</span>
                            <span className="kx-row-acts">
                                {m.missing ? <Btn onClick={(e) => { e.stopPropagation(); locate(m); }}>Localizar…</Btn> : <>
                                    <Btn onClick={(e) => { e.stopPropagation(); setSel([m.id]); setRenaming(m.id); }}>Renomear</Btn>
                                    <Btn onClick={(e) => { e.stopPropagation(); send(m); }} title="Enviar ao ar">Tocar</Btn>
                                </>}
                            </span>
                        </div>
                    ))}
                </div>
            </Panel>
        </div>
        </div>
        </>
    );
}
