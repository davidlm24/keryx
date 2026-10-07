import React, { useState } from "react";
import Icon from "./Icon";
import { Row, Btn, Field, Empty } from "./kx";
import Rundown from "./Rundown";
import { stageFromSong, stageFromMedia, stageFromPiece, stageFromTool, stageFromYouTube, stageFromAudioList, liveStageId } from "@/lib/console/stage";

const MEDIA_ICON = { video: "film", image: "image", gif: "image", pdf: "film", powerpoint: "film", audio: "music" };
const MEDIA_LABEL = { video: "Vídeo", image: "Imagem", gif: "GIF", pdf: "Apresentação", powerpoint: "Apresentação", audio: "Áudio" };
const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const match = (q, ...fields) => !q || fields.some((f) => String(f || "").toLowerCase().includes(q));

// The library: Letras, Mídia and Avisos (and the Roteiro on narrow screens).
// A click prepares the item in the Prévia; a double click sends it to air
// (onGo). The quick alert is the one control that bypasses the Prévia.
export default function Library({ c, data, rundown, tab, setTab, compact, onPrepare, onGo, onAddSong, hideTabs = false }) {
    const [q, setQ] = useState("");
    const [alertText, setAlertText] = useState("");
    const [yt, setYt] = useState("");
    const [tool, setTool] = useState(null);
    const [freeText, setFreeText] = useState("");
    const [minutes, setMinutes] = useState(5);
    const ql = q.trim().toLowerCase();
    const airId = liveStageId(c.cur);
    const prevId = c.prev?.id;
    const state = (id) => (id === airId ? (c.isLive ? "is-air" : "is-rh") : id === prevId ? "is-prev" : "");

    const tabs = [...(compact ? [["roteiro", "Roteiro"]] : []), ["letras", "Letras"], ["midia", "Mídia"], ["avisos", "Avisos"]];

    const showAlert = () => {
        const text = alertText.trim();
        if (!text) return;
        c.callOp("alert.show", { message: text, type: "message" }).then(() => setAlertText("")).catch(() => {});
    };
    const alert = c.cur?.alert;
    const alertElapsed = alert ? mmss((c.now - alert.since) / 1000) : "";

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
            {tab === "roteiro" && rundown && (
                <div style={{ overflow: "auto", flex: 1 }}>
                    <Rundown service={rundown.service} items={rundown.items} airItemId={rundown.airItemId} prevItemId={rundown.prevItemId} onPrepare={rundown.prepare} onGo={rundown.go} />
                </div>
            )}
            {tab !== "roteiro" && (
                <div style={{ padding: "var(--space-1) var(--space-2)" }}>
                    <Field value={q} onChange={setQ} placeholder={tab === "letras" ? "Letras" : tab === "midia" ? "Mídia" : "Avisos"} />
                </div>
            )}

            {tab === "letras" && (() => {
                const songs = data.songs.filter((s) => match(ql, s.title, s.artist, s.lyrics));
                return (
                    <div style={{ overflow: "auto", flex: 1 }}>
                        {!songs.length && <Empty icon="music" title={ql ? `Nenhuma letra com "${q}"` : "Nenhuma música"}>{ql ? "Procure por título, artista ou um trecho." : "Cadastre músicas em Músicas."}</Empty>}
                        {songs.map((s) => (
                            <Row
                                key={s.id}
                                icon="music"
                                title={s.title}
                                meta={[s.artist, s.song_key, s.duration && mmss(s.duration), s.audio_url && "playback"].filter(Boolean).join(" · ")}
                                state={state(`song:${s.id}`)}
                                onClick={() => onPrepare(stageFromSong(s))}
                                onDoubleClick={onGo && (() => onGo(stageFromSong(s)))}
                                actions={onAddSong && <Btn onClick={(e) => { e.stopPropagation(); onAddSong(s); }} title="Adicionar ao roteiro">Adicionar</Btn>}
                            />
                        ))}
                    </div>
                );
            })()}

            {tab === "midia" && (() => {
                const media = data.media.filter((m) => match(ql, m.title, m.description));
                const audios = media.filter((m) => m.type === "audio" && !m.missing);
                return (
                    <>
                        <div className="listhead"><span className="kx-section">Link do YouTube</span></div>
                        <div style={{ padding: "0 var(--space-2) var(--space-1)", display: "flex", gap: "var(--space-1)" }}>
                            <Field icon={null} value={yt} onChange={setYt} placeholder="https://youtube.com/watch?v=…" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && /youtu/.test(yt)) { onPrepare(stageFromYouTube(yt.trim())); setYt(""); } }} />
                            <Btn onClick={() => { if (/youtu/.test(yt)) { onPrepare(stageFromYouTube(yt.trim())); setYt(""); } else c.say("Cole um link do YouTube."); }} title="Pôr na prévia · toca nas telas de vídeo">Tocar</Btn>
                        </div>
                        {audios.length > 1 && (
                            <div className="listhead"><span className="kx-section">Áudios <span className="kx-count">· {audios.length}</span></span><span style={{ flex: 1 }} /><Btn small onClick={() => onPrepare(stageFromAudioList(audios))} title="Pôr na prévia os áudios desta lista, um depois do outro">Tocar em sequência</Btn></div>
                        )}
                        <div style={{ overflow: "auto", flex: 1 }}>
                            {!media.length && <Empty icon="film" title={ql ? `Nenhuma mídia com "${q}"` : "Nenhuma mídia"}>Envie arquivos em Mídia.</Empty>}
                            {media.map((m) => (
                                <Row
                                    key={m.id}
                                    icon={MEDIA_ICON[m.type] || "film"}
                                    title={m.title}
                                    meta={[MEDIA_LABEL[m.type] || m.type, m.duration && mmss(m.duration)].filter(Boolean).join(" · ")}
                                    state={m.type === "audio" ? (c.cur?.audio?.id === m.id ? (c.isLive ? "is-air" : "is-rh") : c.prev?.id === `media:${m.id}` ? "is-prev" : "") : state(`media:${m.id}`)}
                                    onClick={() => onPrepare(stageFromMedia(m))}
                                    onDoubleClick={onGo && (() => onGo(stageFromMedia(m)))}
                                    actions={m.type === "video" && <Btn onClick={(e) => { e.stopPropagation(); onPrepare(stageFromMedia(m, { toVideo: true })); }} title="Pôr na prévia para as telas de vídeo">Telas de vídeo</Btn>}
                                />
                            ))}
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
                            <Field icon={null} value={alertText} onChange={setAlertText} placeholder="Ex.: Carro placa ABC-1234 com o farol aceso" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter") showAlert(); }} />
                            <Btn onClick={showAlert} title="Mostrar nas telas agora · Enter">Mostrar</Btn>
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
                        {tool === "timer" && (
                            <div className="kx-tool-pick">
                                <span className="kx-meta">Minutos</span>
                                {[5, 10, 15].map((n) => <Btn key={n} on={minutes === n} onClick={() => setMinutes(n)}>{n}</Btn>)}
                                <input type="number" min="1" max="180" value={minutes} onChange={(e) => setMinutes(Math.max(1, Number(e.target.value) || 1))} aria-label="Minutos" style={{ width: 52, height: 24, background: "var(--bg-2)", border: 0, borderRadius: 4, color: "var(--fg-1)", padding: "0 6px", font: "inherit" }} />
                                <Btn onClick={() => { onPrepare(stageFromTool("timer", { minutes })); setTool(null); }}>Pôr na prévia</Btn>
                            </div>
                        )}
                        {tool === "freetext" && (
                            <div className="kx-tool-pick">
                                <Field icon={null} value={freeText} onChange={setFreeText} placeholder="Texto livre" style={{ flex: 1 }} onKeyDown={(e) => { if (e.key === "Enter" && freeText.trim()) { onPrepare(stageFromTool("freetext", { text: freeText.trim() })); setTool(null); } }} />
                                <Btn onClick={() => { if (freeText.trim()) { onPrepare(stageFromTool("freetext", { text: freeText.trim() })); setTool(null); } }}>Pôr na prévia</Btn>
                            </div>
                        )}
                        <div className="listhead"><span className="kx-section">Avisos</span></div>
                        <div style={{ overflow: "auto", flex: 1 }}>
                            {!pieces.length && <Empty icon="megaphone" title={ql ? `Nenhum aviso com "${q}"` : "Nenhum aviso"}>Crie avisos e contagens em Comunicação.</Empty>}
                            {pieces.map((p) => (
                                <Row key={p.id} icon="megaphone" title={p.title || p.text} meta={[p.type === "countdown" ? "Contagem regressiva" : p.type === "timer" ? "Cronômetro" : "Aviso", p.duration && mmss(p.duration)].filter(Boolean).join(" · ")} state={state(`piece:${p.id}`)} onClick={() => onPrepare(stageFromPiece(p))} onDoubleClick={onGo && (() => onGo(stageFromPiece(p)))} />
                            ))}
                        </div>
                    </>
                );
            })()}
        </>
    );
}
