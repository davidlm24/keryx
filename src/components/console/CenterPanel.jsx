import React, { useMemo } from "react";
import Icon from "./Icon";
import { Monitor, Btn, IconBtn } from "./kx";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState, livePosition, mainLayer } from "@shared/live-state.mjs";
import { stageOp } from "@/lib/console/stage";

const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const hhmm = (t) => (t ? new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

// What the Prévia would look like on air: the stage applied with the live
// state's own rules to a copy of the current look (background, logo,
// overlays) — or, for another slide of what is on air, to a copy of what is
// on air. Never sent.
function previewDoc(stage, cur, now) {
    if (!stage) return null;
    if (stage.airSlide && cur?.content) {
        try { return applyOp(cur, "content.goTo", { index: stage.index }, now); } catch { return cur; }
    }
    const base = { ...emptyState(now), background: cur?.background || null, logo: cur?.logo || emptyState().logo, overlays: cur?.overlays || [] };
    try {
        if (stage.video) return applyOp(base, "content.show", { title: stage.title, slides: [{ text: "" }] }, now);
        const [op, args] = stageOp(stage);
        return applyOp(base, op, args, now);
    } catch {
        return base;
    }
}

const captionOf = (doc, word) => {
    if (!doc) return word;
    const layer = mainLayer(doc);
    if (layer === "black") return `${word} · Tela preta`;
    if (layer === "logo") return `${word} · Logo`;
    if (layer === "content") return `${word} · ${doc.content.title || "Texto"}${doc.content.slides.length > 1 ? ` · ${doc.content.index + 1}/${doc.content.slides.length}` : ""}`;
    if (layer === "media") return `${word} · ${doc.media.title || "Mídia"}`;
    if (layer === "communication") return `${word} · ${doc.communication.item?.title || "Aviso"}`;
    if (layer === "tool") return `${word} · ${{ clock: "Relógio", stopwatch: "Cronômetro", timer: "Timer", freetext: "Texto livre" }[doc.tool.mode]}`;
    return `${word} · nada`;
};

// What sending the Prévia will do, in one line, when it is not obvious from
// the monitor: which screens it reaches.
function sendNote(stage, isLive) {
    if (!stage) return null;
    if (!isLive) return "Só no ensaio: as telas não mudam.";
    if (stage.kind === "video") return "Ao enviar: toca nas telas de vídeo; o projetor continua como está.";
    if (stage.airSlide) return `Ao enviar: o slide no ar passa para o ${stage.index + 1}.`;
    return null;
}

// Programa (what is on air, or the rehearsal copy with the real screen in a
// PiP), a slim warning line when an output fails (never over the monitor),
// the Prévia with its one send button, the next item, and the transport of
// a video or media file while one plays.
export default function CenterPanel({ c, logoUrl, projectorDown, tries, lastOkAt, nextItem, onPrepNext, onSend, onOpenOutputs, videoScreens }) {
    const { live, cur, prev, now, isLive } = c;
    const pdoc = useMemo(() => previewDoc(prev, cur, now), [prev, cur, now]);
    const progState = projectorDown ? "warn" : isLive ? "air" : "rh";
    const progWord = isLive ? "Programa" : "Programa · Ensaio";
    const prevCap = prev ? `Prévia · ${prev.title}${prev.slides.length > 1 ? ` · ${prev.index + 1}/${prev.slides.length}` : ""}` : "Prévia";
    const note = sendNote(prev, isLive);

    // The transport drives the video channel first, else the media layer.
    const layer = cur?.video ? "video" : cur?.media && (cur.media.kind === "video" || cur.media.kind === "youtube" || cur.media.kind === "audio") ? "media" : null;
    const pb = layer ? cur[layer].playback : null;
    const pos = pb ? livePosition(pb, now) : 0;
    const duration = layer ? cur[layer].duration : null;
    const transport = (action, extra = {}) => c.callOp("transport", { layer, action, ...extra }).catch(() => {});

    return (
        <div className="mons" data-live-keys="" tabIndex={-1}>
            {projectorDown && (
                <div className="kx-warnbar" role="alert">
                    <Icon name="warn" />
                    <span className="t"><b>Projetor</b> · Reconectando… tentativa {tries} · última conexão {hhmm(lastOkAt)}</span>
                    <span className="spacer" />
                    <Btn small onClick={() => c.toggleScreen("black")} title="Tela preta · B">Tela preta</Btn>
                    <Btn small onClick={() => c.toggleScreen("logo")} title="Mostrar logo · L">Mostrar logo</Btn>
                    <Btn small onClick={onOpenOutputs}>Ver saídas</Btn>
                </div>
            )}
            <Monitor className="prog" state={progState} caption={captionOf(cur, progWord)} live={cur} now={now} logoUrl={logoUrl}>
                {!isLive && (
                    <div className="pipwrap">
                        <span className="kx-pip-cap">NO AR AGORA</span>
                        <ScreenRenderer state={live} now={now} logoUrl={logoUrl} preview />
                    </div>
                )}
            </Monitor>
            <div className="subrow">
                <Monitor state={prev ? "prev" : ""} caption={prevCap} live={pdoc} now={now} logoUrl={logoUrl}>
                    {!prev && <div className="kx-screen-empty">Nada na prévia</div>}
                    {prev?.missing && <div className="kx-screen-hatch"><div>Arquivo não encontrado<small>{prev.title}</small></div></div>}
                </Monitor>
                <div className="side">
                    <div className="sendrow">
                        <Btn kind={isLive ? "prev" : "rh"} className="kx-btn-send" onClick={() => onSend()} disabled={!prev} title={isLive ? "Enviar ao ar · Ctrl+Enter" : "Mostrar no ensaio · Ctrl+Enter"}>
                            {isLive ? "Enviar ao ar" : "Mostrar no ensaio"}
                        </Btn>
                        <span className="kx-meta">Ctrl+Enter</span>
                    </div>
                    {note && <div className="kx-meta sendnote">{note}</div>}
                    <div className="nextline">
                        <span className="kx-meta">Próximo:</span>
                        <span className="t">{nextItem ? nextItem.title || "Item" : "fim do roteiro"}</span>
                        {nextItem && <><span className="kx-meta">·</span><Btn small onClick={onPrepNext} title="Pôr o próximo item do Roteiro na Prévia">Preparar</Btn></>}
                    </div>
                    {layer && pb && (
                        <div className="kx-transport" style={{ background: "var(--bg-2)", borderRadius: "var(--radius-control)" }}>
                            <IconBtn name={pb.paused ? "play" : "pause"} title={pb.paused ? "Tocar · Espaço" : "Pausar · Espaço"} onClick={() => transport(pb.paused ? "play" : "pause")} />
                            <span className="kx-time">{mmss(pos)}{duration ? ` / ${mmss(duration)}` : ""}</span>
                            <span className="kx-seek" onClick={(e) => { if (!duration) return; const r = e.currentTarget.getBoundingClientRect(); transport("seek", { time: Math.max(0, Math.min(duration, ((e.clientX - r.left) / r.width) * duration)) }); }} role="slider" aria-label="Posição" aria-valuenow={Math.round(pos)}>
                                {duration ? <><i style={{ width: `${Math.min(100, (pos / duration) * 100)}%` }} /><b style={{ left: `${Math.min(100, (pos / duration) * 100)}%` }} /></> : null}
                            </span>
                            <IconBtn name={pb.volume === 0 ? "volume-off" : "volume"} title={pb.volume === 0 ? "Som" : "Mudo"} onClick={() => transport("volume", { volume: pb.volume === 0 ? 1 : 0 })} />
                            <span className="kx-meta toca" title="Onde este áudio/vídeo toca">
                                <Icon name="tv" /><span className="lbl">Toca em · {layer === "video" ? videoScreens || "telas de vídeo" : "Projetor"}</span>
                            </span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
