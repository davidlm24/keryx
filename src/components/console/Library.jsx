import React, { useCallback, useEffect, useRef, useState } from "react";
import { libMediaKinds } from "@/lib/console/panelTabs";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Row, Btn, IconBtn, Field, Empty } from "./kx";
import LinesPicker from "./LinesPicker";
import { useContextMenu } from "./ContextMenu";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import AddMenu from "./AddMenu";
import { importSongFiles as importSongs } from "./importSongs";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { mediaFromYouTube } from "@/lib/mediaImport";
import { stripChords } from "@/lib/chords";
import { importMediaFiles, importSummary } from "@/lib/mediaImport";
import PagesMeta from "./PagesMeta";
import { stageFromSong, stageFromMedia, stageFromPiece, stageFromPieceList, stageFromYouTube, stageFromAudioList, liveStageId } from "@/lib/console/stage";
import { noticeLabel, noticeIcon } from "@/lib/console/notice";
import { setDragStage, clearDragStage, STAGE_MIME } from "@/lib/console/dragStage";
import { QuickAlert, ToolsPicker } from "./QuickTools";
import { TabRow } from "./TabsPanel";
import { setDragGhost, stageGhost } from "./dragGhost";
import { isVideoUrl } from "@/lib/console/content";

// A library row can be dragged onto the Prévia (prepares), the Programa
// (sends) or the Setlist (adds the item there).
// The pointer carries a card of the row's size (dragGhost.js: its icon, name
// and length), never a picture of the row with its buttons.
const dragProps = (stage, time = "") => ({
    draggable: true,
    onDragStart: (e) => { setDragStage(stage); e.dataTransfer.setData(STAGE_MIME, stage.id || "1"); e.dataTransfer.effectAllowed = "copyMove"; setDragGhost(e, { ...stageGhost(stage), time }); },
    onDragEnd: () => clearDragStage(),
});

// The picture a media row shows on hover: an image itself, a video's still
// (Media.thumbnail_url, src/lib/mediaPosterCapture.js) or a PDF's first page
// (src/lib/pdfPagesCapture.js); nothing else has one.
const peekOf = (m) => (m.missing || m.posterSyncing ? "" : m.type === "image" || m.type === "gif" ? m.file_url : m.type === "video" || m.type === "pdf" ? m.thumbnail_url || "" : "");
const PEEK_DELAY_MS = 350;
const PEEK_W = 240;

// Hovering a row of Imagens or Vídeos shows its picture beside the
// Biblioteca, so the rows stay one line. The card never takes the mouse.
function usePeek() {
    const [peek, setPeek] = useState(null);
    const timer = useRef(0);
    const hide = useCallback(() => { clearTimeout(timer.current); setPeek(null); }, []);
    useEffect(() => {
        if (!peek) return undefined;
        const off = () => hide();
        window.addEventListener("mousedown", off, true);
        window.addEventListener("wheel", off, true);
        window.addEventListener("dragstart", off, true);
        window.addEventListener("keydown", off, true);
        return () => {
            window.removeEventListener("mousedown", off, true);
            window.removeEventListener("wheel", off, true);
            window.removeEventListener("dragstart", off, true);
            window.removeEventListener("keydown", off, true);
        };
    }, [peek, hide]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const rowProps = (m) => {
        const src = peekOf(m);
        if (!src) return {};
        return {
            onMouseEnter: (e) => {
                const row = e.currentTarget.getBoundingClientRect();
                const panel = (e.currentTarget.closest(".kx-panel") || e.currentTarget).getBoundingClientRect();
                clearTimeout(timer.current);
                timer.current = setTimeout(() => setPeek({ src, row, panel }), PEEK_DELAY_MS);
            },
            onMouseLeave: hide,
        };
    };
    return { peek, rowProps };
}

function MediaPeek({ peek }) {
    if (!peek) return null;
    const { row, panel } = peek;
    const h = Math.round(PEEK_W * 9 / 16);
    const gap = 8;
    // Beside the panel, on the side with room; level with the row.
    const right = panel.right + gap + PEEK_W <= window.innerWidth - gap;
    const left = right ? panel.right + gap : Math.max(gap, panel.left - gap - PEEK_W);
    const top = Math.min(Math.max(gap, row.top + row.height / 2 - h / 2), window.innerHeight - h - gap);
    return (
        <div className="media-peek" style={{ left, top, width: PEEK_W }} aria-hidden="true">
            <img src={peek.src} alt="" />
        </div>
    );
}

const MEDIA_ICON ={ video: "film", image: "image", gif: "image", pdf: "film", powerpoint: "film", audio: "music" };
const MEDIA_LABEL = { video: "Vídeo", image: "Imagem", gif: "GIF", pdf: "Apresentação", powerpoint: "Apresentação", audio: "Áudio" };
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const match = (q, ...fields) => !q || fields.some((f) => String(f || "").toLowerCase().includes(q));

// The library: Letras, Imagens, Vídeos and Avisos — the tabs the operator
// keeps (the (+) in the Biblioteca's header, Console.jsx and panelTabs.js;
// `tabs` is what shows). A click prepares the item in the Prévia; a
// double click sends it to air (onGo). The Avisos tab also holds the Aviso
// rápido and the Ferramentas where the panel beside the Prévia does not
// (`elsewhere`: what that panel shows now).
export default function Library({ c, data, tab, setTab, tabs, elsewhere = {}, onPrepare, onGo, onAddSong, onLyricsWeb, onEditSong, onOpenMedia, onEditNotice }) {
    const [q, setQ] = useState("");
    const [favOnly, setFavOnly] = useState(false);
    const [yt, setYt] = useState("");
    const { peek, rowProps } = usePeek();
    const ql =q.trim().toLowerCase();
    const airId = liveStageId(c.cur);
    const prevId = c.prev?.id;
    const state = (id) => (id === airId ? "is-air" : id === prevId ? "is-prev" : "");

    // How an imported lyric is cut into slides (a preference in the
    // database, the same one as Na internet's).
    const importCut = usePrefs().import_lines;
    const pickImportCut = (v) => { updateUser({ import_lines: v }).catch(() => c.say("Não foi possível salvar.")); };

    // "+ › Do computador": song files (cifra, ChordPro, texto, JSON exportado).
    const importSongFiles = (files) => importSongs(files, c.say);
    // "+ › Exportar todas": the songs as the JSON the import reads back.
    const exportSongs = () => {
        const songs = data.songs.map(({ id: _id, created_date: _c, updated_date: _u, created_by_id: _b, ...rest }) => rest);
        const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), app: "KERYX", count: songs.length, songs }, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `keryx_musicas_${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        c.say(`${songs.length} ${songs.length === 1 ? "música exportada" : "músicas exportadas"}.`);
    };
    const menu = useContextMenu();
    // "Excluir…" in the menus asks first (ConfirmDialog.jsx).
    const confirm = useConfirm();
    const removeRow = async (entity, row, what, name, done) => {
        if (!(await confirm(deleteQuestion(what, name)))) return;
        try { await keryx.entities[entity].delete(row.id); c.say(done); } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
    };
    const MEDIA_WORD = { image: "a imagem", video: "o vídeo", audio: "o áudio", gif: "a imagem", pdf: "o arquivo" };
    const toggleFav = (s) => keryx.entities.Song.update(s.id, { is_favorite: !s.is_favorite }).catch((err) => c.say(err?.message || "Não foi possível."));
    // "+ › Do computador" in Mídia: videos, audio, images, PDF, PowerPoint.
    const importMedia = async (files) => {
        c.say(`Copiando ${files.length} ${files.length === 1 ? "arquivo" : "arquivos"}…`);
        c.say(importSummary(await importMediaFiles(files), " à Mídia"));
    };
    // The media tabs (Imagens, Vídeos, and Áudios and Apresentações when the
    // (+) shows them): which Media types each lists (panelTabs.js).
    const shownIds = (tabs || []).map((t) => t.id);
    const mediaKinds = libMediaKinds(tab, shownIds);
    const addItems = tab === "letras"
        ? [
            { label: "Nova música…", icon: "plus", onClick: () => onEditSong?.("new") },
            { label: "Do computador…", icon: "folder", accept: ".txt,.chordpro,.cho,.crd,.pro,.json,text/plain", onFiles: importSongFiles },
            { label: "Uma pasta inteira…", icon: "folder", accept: ".txt,.chordpro,.cho,.crd,.pro,.json,text/plain", directory: true, onFiles: (files) => importSongFiles(files.filter((f) => /\.(txt|chordpro|cho|crd|pro|json)$/i.test(f.name))) },
            { label: "Na internet…", icon: "external", onClick: () => onLyricsWeb?.() },
            {
                label: "ao-importar",
                node: <><span className="kx-meta">Ao importar</span><span style={{ flex: 1 }} />
                    <LinesPicker value={importCut} onChange={pickImportCut} /></>,
            },
            { label: "Exportar todas…", icon: "save", onClick: exportSongs },
        ]
        : tab === "imagens"
            ? [
                { label: "Do computador…", icon: "folder", accept: shownIds.includes("apresentacoes") ? "image/*,.gif" : "image/*,.gif,.pdf,.ppt,.pptx", onFiles: importMedia },
                { label: "Biblioteca de mídia…", icon: "expand", onClick: () => onOpenMedia?.() },
            ]
        : tab === "audios"
            ? [
                { label: "Do computador…", icon: "folder", accept: "audio/*", onFiles: importMedia },
                { label: "Uma pasta inteira…", icon: "folder", accept: "audio/*", directory: true, onFiles: (files) => importMedia(files.filter((f) => f.type.startsWith("audio/") || /\.(mp3|wav|m4a|aac|ogg|flac|wma)$/i.test(f.name))) },
                { label: "Biblioteca de mídia…", icon: "expand", onClick: () => onOpenMedia?.() },
            ]
        : tab === "apresentacoes"
            ? [
                { label: "Do computador…", icon: "folder", accept: ".pdf,.ppt,.pptx", onFiles: importMedia },
                { label: "Biblioteca de mídia…", icon: "expand", onClick: () => onOpenMedia?.() },
            ]
        : tab === "videos"
            ? [
                { label: "Do computador…", icon: "folder", accept: shownIds.includes("audios") ? "video/*" : "video/*,audio/*", onFiles: importMedia },
                { label: "Link do YouTube", icon: "film", onClick: () => document.querySelector(".console .yt-field input")?.focus() },
                { label: "Biblioteca de mídia…", icon: "expand", onClick: () => onOpenMedia?.() },
            ]
            : [{ label: "Novo aviso…", icon: "megaphone", onClick: () => onEditNotice?.("new") }];

    return (
        <>
            <TabRow tabs={tabs} active={tab} onPick={setTab} />

            <div className="searchrow">
                <Field value={q} onChange={setQ} placeholder="Buscar…" />
                {tab === "letras" && <IconBtn name="star" on={favOnly} title={favOnly ? "Mostrar todas" : "Só favoritas"} onClick={() => setFavOnly((f) => !f)} />}
                <AddMenu title={tab === "letras" ? "Adicionar letra" : tab === "avisos" ? "Adicionar aviso" : "Adicionar mídia"} items={addItems} />
            </div>

            {tab === "letras" && (() => {
                const songs = data.songs.filter((s) => (!favOnly || s.is_favorite) && match(ql, s.title, s.artist, stripChords(s.lyrics || "")));
                return (
                    <div className="kx-acts-list" style={{ overflow: "auto", flex: 1 }}>
                        {!songs.length && <Empty icon="music" title={ql ? `Nenhuma letra com "${q}"` : "Nenhuma letra"}>{ql ? "Procure por título, artista ou um trecho, ou use + › Na internet." : "Use + para importar do computador ou procurar na internet."}</Empty>}
                        {songs.map((s) => (
                            <Row
                                key={s.id}
                                icon="music"
                                title={s.title}
                                meta={[s.artist, s.song_key, s.duration && mmss(s.duration), s.audio_url && (isVideoUrl(s.audio_url) ? "vídeo" : "playback"), (s.slides || []).some((x) => Number.isFinite(x?.start)) && "sincronizada"].filter(Boolean).join(" · ")}
                                state={state(`song:${s.id}`)}
                                onClick={() => onPrepare(stageFromSong(s, {}, data.themes))}
                                onDoubleClick={onGo && (() => onGo(stageFromSong(s, {}, data.themes)))}
                                onContextMenu={(e) => menu(e, { title: s.title, items: [
                                    { label: "Pôr na prévia", icon: "eye", onSelect: () => onPrepare(stageFromSong(s, {}, data.themes)) },
                                    onAddSong && { label: "Adicionar à setlist", icon: "plus", onSelect: () => onAddSong(s) },
                                    onEditSong && { label: "Editar", icon: "edit", onSelect: () => onEditSong(s.id) },
                                    { label: s.is_favorite ? "Tirar dos favoritos" : "Favoritar", icon: "star", onSelect: () => toggleFav(s) },
                                    { label: "Excluir…", icon: "trash", onSelect: () => removeRow("Song", s, "a música", s.title, "Música excluída.") },
                                    onGo && { label: "Enviar ao ar", icon: "play", air: true, onSelect: () => onGo(stageFromSong(s, {}, data.themes)) },
                                ] })}
                                dragProps={dragProps(stageFromSong(s, {}, data.themes), s.duration ? mmss(s.duration) : "")}
                                actions={<>
                                    <IconBtn name="star" small on={s.is_favorite} title={s.is_favorite ? "Tirar dos favoritos" : "Favoritar"} onClick={(e) => { e.stopPropagation(); toggleFav(s); }} />
                                    {onEditSong && <Btn onClick={(e) => { e.stopPropagation(); onEditSong(s.id); }} title="Abrir no editor de música" aria-label="Editar"><span className="kx-act-i"><Icon name="edit" /></span><span className="kx-act-l">Editar</span></Btn>}
                                    {onAddSong && <Btn onClick={(e) => { e.stopPropagation(); onAddSong(s); }} title="Adicionar à setlist" aria-label="Adicionar"><span className="kx-act-i"><Icon name="plus" /></span><span className="kx-act-l">Adicionar</span></Btn>}
                                </>}
                            />
                        ))}
                    </div>
                );
            })()}

            {mediaKinds && (() => {
                const media = data.media.filter((m) => mediaKinds.includes(m.type) && match(ql, m.title, m.description));
                const audios = media.filter((m) => m.type === "audio" && !m.missing);
                const ytStage = /youtu/.test(yt) ? stageFromYouTube(yt.trim()) : null;
                const saveYt = async () => {
                    if (!/youtu/.test(yt)) { c.say("Cole um link do YouTube."); return; }
                    try {
                        const row = await mediaFromYouTube(yt.trim());
                        setYt("");
                        c.say(`Salvo em Vídeos: "${row.title}" · arraste para a setlist, ou dois cliques tocam.`);
                    } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
                };
                const mediaRow = (m) => (
                    <Row
                        key={m.id}
                        icon={MEDIA_ICON[m.type] || "film"}
                        title={m.title}
                        meta={m.syncing ? `${MEDIA_LABEL[m.type] || m.type} · Baixando…` : m.missing ? "Arquivo não encontrado · Localizar… na biblioteca" : m.type === "pdf" || m.type === "powerpoint" ? <PagesMeta row={m} kind={m.type === "pdf" ? "PDF" : "PowerPoint"} /> : [MEDIA_LABEL[m.type] || m.type, m.duration && mmss(m.duration)].filter(Boolean).join(" · ")}
                        metaClass={m.missing && !m.syncing ? "kx-warn" : ""}
                        state={m.type === "audio" ? (c.cur?.audio?.id === m.id ? "is-air" : c.prev?.id === `media:${m.id}` ? "is-prev" : "") : state(`media:${m.id}`)}
                        onClick={() => onPrepare(stageFromMedia(m))}
                        onDoubleClick={onGo && (() => onGo(stageFromMedia(m)))}
                        onContextMenu={(e) => menu(e, { title: m.title, items: [
                            { label: "Pôr na prévia", icon: "eye", onSelect: () => onPrepare(stageFromMedia(m)) },
                            m.type === "video" && { label: "Pôr na prévia para as telas de vídeo", icon: "tv", onSelect: () => onPrepare(stageFromMedia(m, { toVideo: true })) },
                            onOpenMedia && { label: "Abrir a biblioteca de mídia", icon: "film", onSelect: () => onOpenMedia() },
                            { label: "Excluir…", icon: "trash", onSelect: () => removeRow("Media", m, MEDIA_WORD[m.type] || "o arquivo", m.title || "sem título", "Excluído da Mídia.") },
                            onGo && { label: "Enviar ao ar", icon: "play", air: true, onSelect: () => onGo(stageFromMedia(m)) },
                        ] })}
                        dragProps={dragProps(stageFromMedia(m), m.duration ? mmss(m.duration) : "")}
                        {...rowProps(m)}
                        actions={m.type === "video" && <Btn onClick={(e) => { e.stopPropagation(); onPrepare(stageFromMedia(m, { toVideo: true })); }} title="Pôr na prévia para as telas de vídeo" aria-label="Telas de vídeo"><span className="kx-act-i"><Icon name="tv" /></span><span className="kx-act-l">Telas de vídeo</span></Btn>}
                    />
                );
                return (
                    <>
                        {tab === "videos" && <>
                        <div className="listhead"><span className="kx-section">Link do YouTube</span></div>
                        <div style={{ padding: "0 var(--space-2) var(--space-1)", display: "flex", gap: "var(--space-1)" }} {...(ytStage ? dragProps(ytStage) : {})} title={ytStage ? "Arraste para a Prévia, o Programa ou a Setlist" : undefined}>
                            <Field icon={null} className="kx-field kx-t yt-field" value={yt} onChange={setYt} placeholder="https://youtube.com/watch?v=…" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && /youtu/.test(yt)) { onPrepare(stageFromYouTube(yt.trim())); setYt(""); } }} />
                            <Btn onClick={() => { if (/youtu/.test(yt)) { onPrepare(stageFromYouTube(yt.trim())); setYt(""); } else c.say("Cole um link do YouTube."); }} title="Pôr na prévia · toca nas telas de vídeo">Tocar</Btn>
                            <Btn onClick={saveYt} title="Salvar o link na lista de Vídeos, para a setlist e os cultos">Salvar</Btn>
                        </div>
                        </>}
                        <div className="listhead"><span className="kx-section">Arquivos <span className="kx-count">· {media.length}</span></span><span style={{ flex: 1 }} />{onOpenMedia && <Btn small onClick={onOpenMedia} title="Abrir a biblioteca de mídia: grade, categorias, envio de vários arquivos"><Icon name="expand" />Abrir a Mídia…</Btn>}</div>
                        {audios.length > 1 && (
                            <div className="listhead"><span className="kx-section">Áudios <span className="kx-count">· {audios.length}</span></span><span style={{ flex: 1 }} /><Btn small onClick={() => onPrepare(stageFromAudioList(audios))} title="Pôr na prévia os áudios desta lista, um depois do outro">Tocar todos</Btn></div>
                        )}
                        <div className="kx-acts-list" style={{ overflow: "auto", flex: 1 }}>
                            {!media.length && <Empty icon={{ imagens: "image", audios: "music" }[tab] || "film"} title={ql ? `Nada com "${q}"` : { imagens: "Nenhuma imagem", audios: "Nenhum áudio", apresentacoes: "Nenhuma apresentação" }[tab] || "Nenhum vídeo"}>{tab === "videos" ? "Use + para adicionar arquivos, ou cole um link do YouTube." : "Use + para adicionar arquivos do computador."}</Empty>}
                            {media.map(mediaRow)}
                        </div>
                    </>
                );
            })()}

            {tab === "avisos" && (() => {
                const pieces = data.pieces.filter((p) => match(ql, p.title, p.text, p.subtext));
                return (
                    <>
                        {!elsewhere.aviso && <>
                        <div className="listhead"><span className="kx-section">Aviso rápido <span className="kx-count">· vai direto às telas</span></span></div>
                        <QuickAlert c={c} data={data} />
                        </>}
                        {!elsewhere.ferramentas && <>
                        <div className="listhead"><span className="kx-section">Ferramentas</span></div>
                        <ToolsPicker c={c} data={data} onPrepare={onPrepare} onGo={onGo} />
                        </>}
                        <div className="listhead"><span className="kx-section">Todos os avisos <span className="kx-count">· {pieces.length}</span></span><span style={{ flex: 1 }} />{pieces.length > 1 && <Btn small onClick={() => onPrepare(stageFromPieceList(pieces))} title="Pôr na prévia todos os avisos desta lista, um depois do outro, em loop">Tocar todos</Btn>}</div>
                        <div className="kx-acts-list" style={{ overflow: "auto", flex: 1 }}>
                            {!pieces.length && <Empty icon="megaphone" title={ql ? `Nenhum aviso com "${q}"` : "Nenhum aviso"}>Use + › Novo aviso para criar contagens, anúncios e avisos.</Empty>}
                            {pieces.map((p) => (
                                <Row key={p.id} icon={noticeIcon(p.type)} title={p.title || p.text} meta={[noticeLabel(p.type), p.duration && mmss(p.duration)].filter(Boolean).join(" · ")} state={state(`piece:${p.id}`)} onClick={() => onPrepare(stageFromPiece(p))} onDoubleClick={onGo && (() => onGo(stageFromPiece(p)))} dragProps={dragProps(stageFromPiece(p), p.duration ? mmss(p.duration) : "")}
                                    onContextMenu={(e) => menu(e, { title: p.title || p.text, items: [
                                        { label: "Pôr na prévia", icon: "eye", onSelect: () => onPrepare(stageFromPiece(p)) },
                                        onEditNotice && { label: "Editar", icon: "edit", onSelect: () => onEditNotice(p.id) },
                                        { label: "Excluir…", icon: "trash", onSelect: () => removeRow("CommunicationVideo", p, "o aviso", p.title || p.text || "sem título", "Aviso excluído.") },
                                        onGo && { label: "Enviar ao ar", icon: "play", air: true, onSelect: () => onGo(stageFromPiece(p)) },
                                    ] })}
                                    actions={onEditNotice && <Btn onClick={(e) => { e.stopPropagation(); onEditNotice(p.id); }} title="Abrir no editor de aviso" aria-label="Editar"><span className="kx-act-i"><Icon name="edit" /></span><span className="kx-act-l">Editar</span></Btn>} />
                            ))}
                        </div>
                    </>
                );
            })()}
            {mediaKinds && <MediaPeek peek={peek} />}
        </>
    );
}
