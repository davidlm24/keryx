import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Row, Btn, IconBtn, Field, Empty, Seg } from "./kx";
import { useContextMenu } from "./ContextMenu";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import AddMenu from "./AddMenu";
import { songsFromFile } from "@/lib/songImport";
import { usePrefs, getPrefs, updateUser } from "@/hooks/useUser";
import { mediaFromYouTube } from "@/lib/mediaImport";
import { stripChords } from "@/lib/chords";
import { importMediaFiles } from "@/lib/mediaImport";
import { stageFromSong, stageFromMedia, stageFromPiece, stageFromPieceList, stageFromTool, stageFromYouTube, stageFromAudioList, liveStageId } from "@/lib/console/stage";
import { noticeLabel, noticeIcon, clockOf } from "@/lib/console/notice";
import { setDragStage, clearDragStage, STAGE_MIME } from "@/lib/console/dragStage";
import { cleanPreset, canKeep, presetOf, orderPresets } from "@/lib/console/alertPresets";
import { timerChoices, canKeepTimer, cleanMinutes, minutesLabel, ADJUST_STEPS } from "@/lib/console/timerPresets";
import { toolTime } from "@shared/live-state.mjs";

// A library row can be dragged onto the Prévia (prepares), the Programa
// (sends) or the Setlist (adds the item there).
const dragProps = (stage) => ({
    draggable: true,
    onDragStart: (e) => { setDragStage(stage); e.dataTransfer.setData(STAGE_MIME, stage.id || "1"); e.dataTransfer.effectAllowed = "copyMove"; },
    onDragEnd: () => clearDragStage(),
});

const MEDIA_ICON = { video: "film", image: "image", gif: "image", pdf: "film", powerpoint: "film", audio: "music" };
const MEDIA_LABEL = { video: "Vídeo", image: "Imagem", gif: "GIF", pdf: "Apresentação", powerpoint: "Apresentação", audio: "Áudio" };
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const match = (q, ...fields) => !q || fields.some((f) => String(f || "").toLowerCase().includes(q));

// The library: Letras, Mídia and Avisos (and the Setlist on narrow screens).
// A click prepares the item in the Prévia; a double click sends it to air
// (onGo). The quick alert is the one control that bypasses the Prévia.
export default function Library({ c, data, tab, setTab, compact, onPrepare, onGo, onAddSong, onLyricsWeb, onEditSong, onOpenMedia, onEditNotice, hideTabs = false }) {
    const [q, setQ] = useState("");
    const [favOnly, setFavOnly] = useState(false);
    const [alertText, setAlertText] = useState("");
    const [yt, setYt] = useState("");
    const [tool, setTool] = useState(null);
    const [freeText, setFreeText] = useState("");
    const [minutes, setMinutes] = useState(5);
    const ql = q.trim().toLowerCase();
    const airId = liveStageId(c.cur);
    const prevId = c.prev?.id;
    const state = (id) => (id === airId ? "is-air" : id === prevId ? "is-prev" : "");

    // Mídia split into Imagens (what projects as a still: fotos, GIF, PDF,
    // apresentações) and Vídeos (what plays: clipes, YouTube, áudios) —
    // owner request 2026-10-11.
    const tabs = [["letras", "Letras"], ["imagens", "Imagens"], ["videos", "Vídeos"], ["avisos", "Avisos"]];

    const showAlert = () => {
        const text = alertText.trim();
        if (!text) return;
        c.callOp("alert.show", { message: text, type: "message" }).then(() => setAlertText("")).catch(() => {});
    };
    // Mensagens prontas (AlertPreset, src/lib/console/alertPresets.js): a
    // click puts one in the field to complete it, a double click shows it
    // at once; Guardar keeps what is in the field.
    const presets = orderPresets(data.alertPresets);
    const kept = presetOf(alertText, presets);
    const keep = canKeep(alertText, presets);
    const keepAlert = () => {
        if (!keep.ok) { c.say(keep.why); return; }
        keryx.entities.AlertPreset.create({ message: cleanPreset(alertText) }).then(() => c.say("Mensagem guardada.")).catch((err) => c.say(err?.message || "Não foi possível guardar a mensagem."));
    };
    const dropPreset = (p) => keryx.entities.AlertPreset.delete(p.id).catch((err) => c.say(err?.message || "Não foi possível excluir a mensagem."));
    // Timers prontos (TimerPreset, src/lib/console/timerPresets.js): the five
    // that always come and the church's own. A click prepares the timer, a
    // double click sends it; the star keeps the minutes in the field.
    const timers = timerChoices(data.timerPresets);
    const keepTimer = canKeepTimer(minutes, data.timerPresets);
    const keepTimerNow = () => {
        if (!keepTimer.ok) { c.say(keepTimer.why); return; }
        keryx.entities.TimerPreset.create({ minutes: cleanMinutes(minutes) }).then(() => c.say(`${minutesLabel(cleanMinutes(minutes))} guardado.`)).catch((err) => c.say(err?.message || "Não foi possível guardar o tempo."));
    };
    const dropTimer = (t) => keryx.entities.TimerPreset.delete(t.id).catch((err) => c.say(err?.message || "Não foi possível excluir o tempo."));
    const timerStage = (m) => stageFromTool("timer", { minutes: m });
    // A timer on air: give or take time (tool.adjust).
    const onAirTimer = c.cur?.tool?.mode === "timer" ? c.cur.tool : null;
    const sendPreset = (p) => c.callOp("alert.show", { message: p.message, type: "message" }).catch(() => {});
    const alert = c.cur?.alert;
    const alertElapsed = alert ? mmss((c.now - alert.since) / 1000) : "";

    // How an imported lyric is cut into slides (a preference in the
    // database, the same one as Na internet's).
    const importCut = String(usePrefs().import_lines);
    const pickImportCut = (v) => { updateUser({ import_lines: Number(v) }).catch(() => c.say("Não foi possível salvar.")); };

    // "+ › Do computador": song files (cifra, ChordPro, texto, JSON exportado).
    const importSongFiles = async (files) => {
        let made = 0;
        const bad = [];
        for (const file of files) {
            try {
                const rows = songsFromFile(file.name, await file.text(), { lines: getPrefs().import_lines });
                for (const row of rows) { await keryx.entities.Song.create(row); made += 1; }
                if (!rows.length) bad.push(file.name);
            } catch (err) { bad.push(`${file.name} (${err?.message || "falhou"})`); }
        }
        c.say(made ? `${made} ${made === 1 ? "música importada" : "músicas importadas"}${bad.length ? ` · não deu: ${bad.join(", ")}` : ""}.` : `Nenhuma letra encontrada em ${bad.join(", ")}.`);
    };
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
        const { created, failed } = await importMediaFiles(files);
        c.say(`${created.length} ${created.length === 1 ? "arquivo adicionado" : "arquivos adicionados"} à Mídia${failed.length ? ` · falhou: ${failed.map((x) => x.name).join(", ")}` : ""}.`);
    };
    const addItems = tab === "letras"
        ? [
            { label: "Nova música…", icon: "plus", onClick: () => onEditSong?.("new") },
            { label: "Do computador…", icon: "folder", accept: ".txt,.chordpro,.cho,.crd,.pro,.json,text/plain", onFiles: importSongFiles },
            { label: "Na internet…", icon: "external", onClick: () => onLyricsWeb?.() },
            {
                label: "ao-importar",
                node: <><span className="kx-meta">Ao importar</span><span style={{ flex: 1 }} />
                    <Seg small value={importCut} onChange={pickImportCut} options={[["0", "Estrofe"], ["2", "2 linhas"], ["4", "4 linhas"]]} /></>,
            },
            { label: "Exportar todas…", icon: "save", onClick: exportSongs },
        ]
        : tab === "imagens"
            ? [
                { label: "Do computador…", icon: "folder", accept: "image/*,.gif,.pdf,.ppt,.pptx", onFiles: importMedia },
                { label: "Biblioteca de mídia…", icon: "expand", onClick: () => onOpenMedia?.() },
            ]
        : tab === "videos"
            ? [
                { label: "Do computador…", icon: "folder", accept: "video/*,audio/*", onFiles: importMedia },
                { label: "Link do YouTube", icon: "film", onClick: () => document.querySelector(".console .yt-field input")?.focus() },
                { label: "Biblioteca de mídia…", icon: "expand", onClick: () => onOpenMedia?.() },
            ]
            : [{ label: "Novo aviso…", icon: "megaphone", onClick: () => onEditNotice?.("new") }];

    const pickTool = (mode) => {
        if (mode === "clock" || mode === "stopwatch") { onPrepare(stageFromTool(mode)); setTool(null); return; }
        setTool(tool === mode ? null : mode);
    };

    return (
        <>
            {!hideTabs && (
                <div className="kx-tabs" role="tablist">
                    {tabs.map(([k, label]) => <button type="button" role="tab" aria-selected={tab === k} key={k} className={`kx-t ${tab === k ? "is-on" : ""}`} onClick={() => setTab(k)}>{label}</button>)}
                </div>
            )}
            <div className="searchrow">
                <Field value={q} onChange={setQ} placeholder={tab === "letras" ? "Letras" : tab === "imagens" ? "Imagens" : tab === "videos" ? "Vídeos e áudios" : "Avisos"} />
                {tab === "letras" && <IconBtn name="star" on={favOnly} title={favOnly ? "Mostrar todas" : "Só favoritas"} onClick={() => setFavOnly((f) => !f)} />}
                <AddMenu title={tab === "letras" ? "Adicionar letra" : tab === "avisos" ? "Adicionar aviso" : "Adicionar mídia"} items={addItems} />
            </div>

            {tab === "letras" && (() => {
                const songs = data.songs.filter((s) => (!favOnly || s.is_favorite) && match(ql, s.title, s.artist, stripChords(s.lyrics || "")));
                return (
                    <div className="kx-acts-list" style={{ overflow: "auto", flex: 1 }}>
                        {!songs.length && <Empty icon="music" title={ql ? `Nenhuma letra com "${q}"` : "Nenhuma música"}>{ql ? "Procure por título, artista ou um trecho, ou use + › Na internet." : "Use + para importar do computador ou procurar na internet."}</Empty>}
                        {songs.map((s) => (
                            <Row
                                key={s.id}
                                icon="music"
                                title={s.title}
                                meta={[s.artist, s.song_key, s.duration && mmss(s.duration), s.audio_url && "playback"].filter(Boolean).join(" · ")}
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
                                dragProps={dragProps(stageFromSong(s, {}, data.themes))}
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

            {(tab === "imagens" || tab === "videos") && (() => {
                const kinds = tab === "imagens" ? ["image", "gif", "pdf", "powerpoint"] : ["video", "audio"];
                const media = data.media.filter((m) => kinds.includes(m.type) && match(ql, m.title, m.description));
                const audios = media.filter((m) => m.type === "audio" && !m.missing);
                const ytStage = /youtu/.test(yt) ? stageFromYouTube(yt.trim()) : null;
                const saveYt = async () => {
                    if (!/youtu/.test(yt)) { c.say("Cole um link do YouTube."); return; }
                    try {
                        const row = await mediaFromYouTube(yt.trim());
                        setYt("");
                        c.say(`Guardado em Vídeos: "${row.title}" · arraste para a setlist, ou dois cliques tocam.`);
                    } catch (err) { c.say(err?.message || "Não foi possível guardar."); }
                };
                const mediaRow = (m) => (
                    <Row
                        key={m.id}
                        icon={MEDIA_ICON[m.type] || "film"}
                        title={m.title}
                        meta={m.missing ? "Arquivo não encontrado · Localizar… na biblioteca" : [MEDIA_LABEL[m.type] || m.type, m.duration && mmss(m.duration)].filter(Boolean).join(" · ")}
                        metaClass={m.missing ? "kx-warn" : ""}
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
                        dragProps={dragProps(stageFromMedia(m))}
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
                            <Btn onClick={saveYt} title="Guardar o link na lista de Vídeos, para a setlist e os cultos">Guardar</Btn>
                        </div>
                        </>}
                        <div className="listhead"><span className="kx-section">Arquivos <span className="kx-count">· {media.length}</span></span><span style={{ flex: 1 }} />{onOpenMedia && <Btn small onClick={onOpenMedia} title="Abrir a biblioteca de mídia: grade, categorias, envio de vários arquivos"><Icon name="expand" />Abrir biblioteca</Btn>}</div>
                        {audios.length > 1 && (
                            <div className="listhead"><span className="kx-section">Áudios <span className="kx-count">· {audios.length}</span></span><span style={{ flex: 1 }} /><Btn small onClick={() => onPrepare(stageFromAudioList(audios))} title="Pôr na prévia os áudios desta lista, um depois do outro">Tocar em sequência</Btn></div>
                        )}
                        <div className="kx-acts-list" style={{ overflow: "auto", flex: 1 }}>
                            {!media.length && <Empty icon={tab === "imagens" ? "image" : "film"} title={ql ? `Nada com "${q}"` : tab === "imagens" ? "Nenhuma imagem" : "Nenhum vídeo"}>{tab === "videos" ? "Use + para adicionar arquivos, ou cole um link do YouTube." : "Use + para adicionar arquivos do computador."}</Empty>}
                            {media.map(mediaRow)}
                        </div>
                    </>
                );
            })()}

            {tab === "avisos" && (() => {
                const pieces = data.pieces.filter((p) => match(ql, p.title, p.text, p.subtext));
                return (
                    <>
                        <div className="listhead"><span className="kx-section">Alerta rápido <span className="kx-count">· vai direto às telas</span></span></div>
                        <div style={{ display: "flex", gap: "var(--space-1)", padding: "0 var(--space-2) var(--space-1)" }}>
                            <Field icon={null} value={alertText} onChange={setAlertText} placeholder="Aviso para as telas" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") showAlert(); }} />
                            <Btn onClick={showAlert} title="Mostrar nas telas agora · Enter">Mostrar</Btn>
                            <IconBtn name="star" on={Boolean(kept)} disabled={!kept && !alertText.trim()} title={kept ? "Esta mensagem já está guardada" : "Guardar esta mensagem como pronta"} onClick={keepAlert} />
                        </div>
                        <div className="kx-presets" role="list" aria-label="Mensagens prontas">
                            {!presets.length && <span className="kx-meta kx-presets-empty">Escreva um aviso e use a estrela para guardá-lo como mensagem pronta. Ex.: Chamar pessoa, Kids, Carro.</span>}
                            {presets.map((p) => (
                                <span key={p.id} role="listitem" className={`kx-preset ${kept?.id === p.id ? "is-on" : ""}`}>
                                    <button type="button" className="kx-t kx-preset-t" title={`${p.message}
Clique coloca no campo · dois cliques mostram nas telas`} onClick={() => setAlertText(p.message)} onDoubleClick={() => sendPreset(p)}>{p.message}</button>
                                    <button type="button" className="kx-t kx-preset-x" aria-label={`Excluir a mensagem: ${p.message}`} title="Excluir esta mensagem pronta" onClick={() => dropPreset(p)}><Icon name="x" size={12} /></button>
                                </span>
                            ))}
                        </div>
                        {alert && (
                            <div className="kx-alert">
                                <span className="kx-alert-t">{alert.message}</span>
                                <span className="kx-meta">{alertElapsed}</span>
                                <Btn onClick={() => c.callOp("alert.clear").catch(() => {})}>Tirar</Btn>
                            </div>
                        )}
                        <div className="listhead"><span className="kx-section">Ferramentas</span></div>
                        <div className="kx-tools">
                            {[["clock", "Relógio"], ["stopwatch", "Cronômetro"], ["timer", "Timer"], ["freetext", "Texto livre"]].map(([mode, label]) => (
                                <button type="button" key={mode} className={`kx-tool kx-t ${tool === mode || c.cur?.tool?.mode === mode ? "is-on" : ""}`} onClick={() => pickTool(mode)}>
                                    <Icon name={mode === "clock" ? "clock" : mode === "freetext" ? "text" : "clock"} />{label}
                                </button>
                            ))}
                        </div>
                        {onAirTimer && (
                            <div className="kx-tool-pick kx-timer-air" role="group" aria-label="Timer no ar">
                                <span className="kx-meta">No ar</span>
                                <span className="kx-timer-left">{clockOf(toolTime(onAirTimer, c.now))}</span>
                                {ADJUST_STEPS.map(([ms, label]) => <Btn key={ms} small onClick={() => c.callOp("tool.adjust", { deltaMs: ms }).catch((err) => c.say(err?.message || "Não foi possível mudar o tempo."))} title={ms < 0 ? "Tira um minuto do timer no ar" : `Dá ${label.slice(1)} ao timer no ar`}>{label}</Btn>)}
                                <Btn small onClick={() => c.callOp("tool.clear").catch(() => {})}>Tirar</Btn>
                            </div>
                        )}
                        {tool === "timer" && (
                            <>
                            <div className="kx-timer-presets" role="group" aria-label="Timers prontos">
                                {timers.map((t) => (
                                    <span key={t.minutes} className={`kx-preset kx-timer-chip ${minutes === t.minutes ? "is-on" : ""}`}>
                                        <button type="button" className="kx-t kx-preset-t" title={`${minutesLabel(t.minutes)} · clique põe na prévia · dois cliques mostram nas telas`}
                                            onClick={() => { setMinutes(t.minutes); onPrepare(timerStage(t.minutes)); }}
                                            onDoubleClick={() => { setMinutes(t.minutes); onGo ? onGo(timerStage(t.minutes)) : onPrepare(timerStage(t.minutes)); }}>{minutesLabel(t.minutes)}</button>
                                        {t.id && <button type="button" className="kx-t kx-preset-x" aria-label={`Excluir o tempo ${minutesLabel(t.minutes)}`} title="Excluir este tempo guardado" onClick={() => dropTimer(t)}><Icon name="x" size={12} /></button>}
                                    </span>
                                ))}
                            </div>
                            <div className="kx-tool-pick">
                                <span className="kx-meta">Minutos</span>
                                <input type="number" min="1" max="180" value={minutes} onChange={(e) => setMinutes(Math.max(1, Math.min(180, Number(e.target.value) || 1)))} aria-label="Minutos" style={{ width: 52, height: 24, background: "var(--bg-2)", border: 0, borderRadius: 4, color: "var(--fg-1)", padding: "0 6px", font: "inherit" }} />
                                <IconBtn name="star" small disabled={!keepTimer.ok} title={keepTimer.ok ? "Guardar este tempo na lista" : keepTimer.why} onClick={keepTimerNow} />
                                <Btn onClick={() => { onPrepare(timerStage(minutes)); setTool(null); }}>Pôr na prévia</Btn>
                            </div>
                            </>
                        )}
                        {tool === "freetext" && (
                            <div className="kx-tool-pick">
                                <Field icon={null} value={freeText} onChange={setFreeText} placeholder="Texto livre" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && freeText.trim()) { onPrepare(stageFromTool("freetext", { text: freeText.trim() })); setTool(null); } }} />
                                <Btn onClick={() => { if (freeText.trim()) { onPrepare(stageFromTool("freetext", { text: freeText.trim() })); setTool(null); } }}>Pôr na prévia</Btn>
                            </div>
                        )}
                        <div className="listhead"><span className="kx-section">Avisos <span className="kx-count">· {pieces.length}</span></span><span style={{ flex: 1 }} />{pieces.length > 1 && <Btn small onClick={() => onPrepare(stageFromPieceList(pieces))} title="Pôr na prévia todos os avisos desta lista, um depois do outro, em loop">Tocar todos</Btn>}</div>
                        <div className="kx-acts-list" style={{ overflow: "auto", flex: 1 }}>
                            {!pieces.length && <Empty icon="megaphone" title={ql ? `Nenhum aviso com "${q}"` : "Nenhum aviso"}>Use + › Novo aviso para criar contagens, anúncios e avisos.</Empty>}
                            {pieces.map((p) => (
                                <Row key={p.id} icon={noticeIcon(p.type)} title={p.title || p.text} meta={[noticeLabel(p.type), p.duration && mmss(p.duration)].filter(Boolean).join(" · ")} state={state(`piece:${p.id}`)} onClick={() => onPrepare(stageFromPiece(p))} onDoubleClick={onGo && (() => onGo(stageFromPiece(p)))} dragProps={dragProps(stageFromPiece(p))}
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
        </>
    );
}
