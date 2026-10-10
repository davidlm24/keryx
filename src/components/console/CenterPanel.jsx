import React, { useMemo, useState } from "react";
import Icon from "./Icon";
import { Monitor, Btn, Row } from "./kx";
import { typeIcon } from "@/lib/console/setlist";
import PlayerBar from "./PlayerBar";
import { applyOp, emptyState, mainLayer } from "@shared/live-state.mjs";
import { stageOp } from "@/lib/console/stage";
import { getDragStage, clearDragStage } from "@/lib/console/dragStage";

// What the Prévia would look like on air: the stage applied with the live
// state's own rules to a copy of the current look (background, logo,
// overlays) — or, for another slide of what is on air, to a copy of what is
// on air. Never sent.
export function previewDoc(stage, cur, now) {
    if (!stage) return null;
    if (stage.airSlide && cur?.content) {
        // A preview, never sent: the lock (which refuses goTo) does not apply to it.
        try { return applyOp({ ...cur, locked: false }, "content.goTo", { index: stage.index }, now); } catch { return cur; }
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

// What a screen shows, as a title and its position ("2/6" or ""): the parts
// of a monitor's caption.
export const captionParts = (doc) => {
    if (!doc) return { title: "", pos: "" };
    const layer = mainLayer(doc);
    // A video-channel clip covers the screens over every layer.
    if (doc.video && layer !== "black" && layer !== "logo") return { title: doc.video.title || "Vídeo", pos: "" };
    if (layer === "black") return { title: "Tela preta", pos: "" };
    if (layer === "logo") return { title: "Logo", pos: "" };
    if (layer === "content") return { title: doc.content.title || "Texto", pos: doc.content.slides.length > 1 ? `${doc.content.index + 1}/${doc.content.slides.length}` : "" };
    if (layer === "media") return { title: doc.media.title || "Mídia", pos: "" };
    if (layer === "communication") return { title: doc.communication.item?.title || "Aviso", pos: "" };
    if (layer === "tool") return { title: { clock: "Relógio", stopwatch: "Cronômetro", timer: "Timer", freetext: "Texto livre" }[doc.tool.mode], pos: "" };
    return { title: "nada", pos: "" };
};

// The same as one line: "Programa · Canto · 2/6" (Escola bíblica, Saídas).
export const captionOf = (doc, word) => {
    if (!doc) return word;
    const { title, pos } = captionParts(doc);
    return `${word} · ${title}${pos ? ` · ${pos}` : ""}`;
};

// An Escola bíblica material's notes for the teacher: the Prévia's, else
// what is on air (content.stage.notes). Only in the console and on the
// stage screen, never on the projector.
export function TeacherNotes({ prev, cur }) {
    const fromPrev = prev?.notes ? { title: prev.title, notes: prev.notes } : null;
    const air = cur?.content?.stage?.notes ? { title: cur.content.title, notes: cur.content.stage.notes } : null;
    const n = fromPrev || air;
    if (!n) return null;
    return (
        <div className="tnotes">
            <span className="kx-section">Notas do professor <span className="kx-count">· {n.title} · só no console e no palco</span></span>
            <p>{n.notes}</p>
        </div>
    );
}

// What sending the Prévia will do, in one line, when it is not obvious from
// the monitor: which screens it reaches.
function sendNote(stage, locked) {
    if (!stage) return null;
    if (locked) return "Telas travadas: nada vai ao ar. Destrave em Saídas.";
    if (stage.kind === "video") return "Ao enviar: toca nas telas de vídeo; o projetor continua como está.";
    if (stage.kind === "audio") return "Ao enviar: toca no computador do projetor; as telas não mudam.";
    if (stage.airSlide) return `Ao enviar: o slide no ar passa para o ${stage.index + 1}.`;
    return null;
}

// The live column, one block the same at every width
// (docs/presenter-layout-proposal-2026-10-09.md, P0): the Programa (what is
// on air, or the local copy with the real screen in a PiP; an output failure
// is the banner under the top bar, never here), the Prévia docked right
// under it with its one send button, a reserved slot where the player shows
// while something plays (reserved, so the monitors never move), the next
// item and, when the Setlist has no column of its own, the items after it.
// The block is as wide as the column allows and as tall as fits (console.css,
// .liveblock); spare height goes below it, never between the monitors.
export default function CenterPanel({ c, logoUrl, projectorDown, projectorOpen, onAir, nextItem, onPrepNext, later = [], onPrepareItem, onGoItem, onSend, onDropStage, videoScreens, playerPick, setPlayerPick }) {
    const { cur, prev, now, locked } = c;
    const pdoc = useMemo(() => previewDoc(prev, cur, now), [prev, cur, now]);
    const [dropOn, setDropOn] = useState(null);
    // Locked: the screens keep this image, blue (they are not following).
    const progState = projectorDown ? "warn" : locked ? "rh" : "air";
    const progWord = locked ? "Programa · travado" : "Programa";
    const sendLabel = "Enviar ao ar";
    // Captions with their own hierarchy: the state word, the title (on air:
    // live-title, 16px; prepared: next-title, 14px) and the position (meta).
    const airParts = captionParts(cur);
    const progCap = dropOn === "air" ? { word: progWord, title: "solte para enviar", pos: "", size: "live" } : { word: progWord, ...airParts, size: "live" };
    const prevCap = dropOn === "prev" ? { word: "Prévia", title: "solte para preparar", pos: "", size: "next" }
        : { word: "Prévia", title: prev ? prev.title : "", pos: prev && prev.slides.length > 1 ? `${prev.index + 1}/${prev.slides.length}` : "", size: "next" };
    const note = sendNote(prev, locked);

    // Drops from the Biblioteca: the Prévia prepares, the Programa sends.
    // (Declared before the captions, which say "solte para…" during a drag.)
    const dropProps = (where) => ({
        onDragOver: (e) => { if (getDragStage()) { e.preventDefault(); if (dropOn !== where) setDropOn(where); } },
        onDragLeave: () => setDropOn((d) => (d === where ? null : d)),
        onDrop: (e) => { const s = getDragStage(); setDropOn(null); if (!s) return; e.preventDefault(); clearDragStage(); onDropStage?.(s, where); },
    });


    return (
        <div className="mons" data-live-keys="" tabIndex={-1}>
            <div className="liveblock">
                <Monitor className={`prog ${dropOn === "air" ? "is-dropover" : ""}`} state={progState} cap={progCap} live={cur} now={now} logoUrl={logoUrl} motion dropProps={dropProps("air")}
                    right={onAir ? <span className={`kx-meta prog-where ${onAir.warn ? "kx-warn" : ""}`} title="Quantas telas mostram o Programa agora · detalhes em Saídas">{onAir.text}</span> : null}>
                </Monitor>
                <div className="subrow">
                    <Monitor className={dropOn === "prev" ? "is-dropover" : ""} state={prev ? "prev" : ""} cap={prevCap} live={pdoc} now={now} logoUrl={logoUrl} dropProps={dropProps("prev")}>
                        {!prev && <div className="kx-screen-empty">Nada na prévia</div>}
                        {prev?.kind === "audio" && <div className="kx-screen-empty"><Icon name="music" /> Áudio · {prev.title || "sem título"} · as telas não mudam</div>}
                        {prev?.missing && <div className="kx-screen-hatch"><div>Arquivo não encontrado<small>{prev.title}</small></div></div>}
                    </Monitor>
                    <div className="side">
                        <div className="sendrow">
                            <Btn kind="prev" className="kx-btn-send" onClick={() => onSend()} disabled={!prev || locked} title={locked ? "Telas travadas · destrave em Saídas" : `${sendLabel} · Ctrl+Enter`}>
                                {sendLabel}
                            </Btn>
                            <span className="kx-meta">Ctrl+Enter</span>
                        </div>
                        {note && <div className="kx-meta sendnote">{note}</div>}
                        <TeacherNotes prev={prev} cur={cur} />
                    </div>
                </div>
                <div className="pslot">
                    <PlayerBar c={c} picked={playerPick} setPicked={setPlayerPick} videoScreens={videoScreens} projectorOpen={projectorOpen} />
                </div>
                <div className="nextline">
                    <span className="kx-section">Próximo</span>
                    <span className={`t ${nextItem ? "kx-next-title" : "kx-meta"}`}>{nextItem ? nextItem.title || "Item" : "fim da setlist"}</span>
                    {nextItem && <Btn small onClick={onPrepNext} title="Pôr o próximo item da Setlist na Prévia">Preparar</Btn>}
                </div>
                {later.length > 0 && (
                    <div className="later">
                        <div className="kx-menu-h"><span className="kx-section">Depois</span></div>
                        {later.map(({ item, index }) => (
                            <Row key={item.id} single icon={typeIcon(item.type)} title={item.title || "Item"} onClick={() => onPrepareItem?.(item, index)} onDoubleClick={() => onGoItem?.(item, index)} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
