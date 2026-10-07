import React, { useMemo } from "react";
import Icon from "./Icon";
import { Monitor, Btn } from "./kx";
import PlayerBar from "./PlayerBar";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState, mainLayer } from "@shared/live-state.mjs";
import { stageOp } from "@/lib/console/stage";

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
function sendNote(stage, mode) {
    if (!stage) return null;
    if (mode === "prep") return "Só aqui: as telas não mudam enquanto você prepara.";
    if (mode === "ensaio") return "Só no ensaio: as telas não mudam.";
    if (stage.kind === "video") return "Ao enviar: toca nas telas de vídeo; o projetor continua como está.";
    if (stage.kind === "audio") return "Ao enviar: toca no computador do projetor; as telas não mudam.";
    if (stage.airSlide) return `Ao enviar: o slide no ar passa para o ${stage.index + 1}.`;
    return null;
}

// The player on top (whatever plays with sound), the Programa (what is on
// air, or the local copy with the real screen in a PiP; an output failure is
// the banner under the top bar, never here), the Prévia with its one send
// button and the next item.
export default function CenterPanel({ c, logoUrl, projectorDown, projectorOpen, nextItem, onPrepNext, onSend, videoScreens, playerPick, setPlayerPick }) {
    const { live, cur, prev, now, isLive, mode } = c;
    const pdoc = useMemo(() => previewDoc(prev, cur, now), [prev, cur, now]);
    const progState = projectorDown ? "warn" : isLive ? "air" : "rh";
    const progWord = isLive ? "Programa" : mode === "prep" ? "Programa · Preparação" : "Programa · Ensaio";
    const sendLabel = isLive ? "Enviar ao ar" : mode === "prep" ? "Mostrar aqui" : "Mostrar no ensaio";
    const prevCap = prev ? `Prévia · ${prev.title}${prev.slides.length > 1 ? ` · ${prev.index + 1}/${prev.slides.length}` : ""}` : "Prévia";
    const note = sendNote(prev, mode);


    return (
        <div className="mons" data-live-keys="" tabIndex={-1}>
            <PlayerBar c={c} picked={playerPick} setPicked={setPlayerPick} videoScreens={videoScreens} projectorOpen={projectorOpen} />
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
                    {prev?.kind === "audio" && <div className="kx-screen-empty"><Icon name="music" /> Áudio · {prev.title || "sem título"} · as telas não mudam</div>}
                    {prev?.missing && <div className="kx-screen-hatch"><div>Arquivo não encontrado<small>{prev.title}</small></div></div>}
                </Monitor>
                <div className="side">
                    <div className="sendrow">
                        <Btn kind={isLive ? "prev" : "rh"} className="kx-btn-send" onClick={() => onSend()} disabled={!prev} title={`${sendLabel} · Ctrl+Enter`}>
                            {sendLabel}
                        </Btn>
                        <span className="kx-meta">Ctrl+Enter</span>
                    </div>
                    {note && <div className="kx-meta sendnote">{note}</div>}
                    <div className="nextline">
                        <span className="kx-meta">Próximo:</span>
                        <span className="t">{nextItem ? nextItem.title || "Item" : "fim do roteiro"}</span>
                        {nextItem && <><span className="kx-meta">·</span><Btn small onClick={onPrepNext} title="Pôr o próximo item do Roteiro na Prévia">Preparar</Btn></>}
                    </div>
                </div>
            </div>
        </div>
    );
}
