import React, { useMemo, useState } from "react";
import Icon from "./Icon";
import { Monitor, Panel } from "./kx";
import PlayerBar from "./PlayerBar";
import MultiView from "./MultiView";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { stageOp } from "@/lib/console/stage";
import { applyWithFundo } from "@/lib/console/backgroundSpec";
import { getDragStage, clearDragStage } from "@/lib/console/dragStage";
import { captionParts, airFor } from "@/lib/console/caption";
import { OUTPUT_VIEWS } from "@/lib/network/views";
import { prefState, prefVars, stageHidden } from "@/lib/outputPrefs";
import { useOutputPref } from "@/hooks/useOutputPref";
import "@/components/screen/output-prefs.css";

// What the Prévia would look like on air: the stage applied with the live
// state's own rules to a copy of the current look (background, logo,
// overlays) — or, for another slide of what is on air, to a copy of what is
// on air. Never sent.
export function previewDoc(stage, cur, now, stamp) {
    if (!stage) return null;
    if (stage.airSlide && cur?.content) {
        // A preview, never sent: the lock (which refuses goTo) does not apply to it.
        try { return applyOp({ ...cur, locked: false }, "content.goTo", { index: stage.index }, now); } catch { return cur; }
    }
    const base = { ...emptyState(now), background: cur?.background || null, lockedLayers: cur?.lockedLayers || [], logo: cur?.logo || emptyState().logo, overlays: cur?.overlays || [] };
    try {
        if (stage.video) return applyOp(base, "content.show", { title: stage.title, slides: [{ text: "" }] }, now);
        const [op, args] = stageOp(stage);
        // As send does it: the item's background replaces the Fundo.
        return applyWithFundo(base, op, stamp ? stamp(op, args) : args, now);
    } catch {
        return base;
    }
}

export { captionParts };

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

// The Programa's caption, in its panel's header (one title, not a header and a
// caption line): the state word (red only while something is on air, amber
// for a failed output, blue when locked, grey when nothing is on air), what
// is on air at 16px and its position. Used by Console.jsx's Programa panel.
export function ProgramaCaption({ c, projectorDown }) {
    const { cur, locked } = c;
    const { title, pos } = captionParts(cur);
    // How long this item has been on air (the live clock: every window agrees).
    const since = airFor(cur, c.now);
    const idle = title === "nada";
    const tone = projectorDown ? "warn" : locked ? "rh" : idle ? "idle" : "air";
    return (
        <span className={`kx-prog-cap is-${tone}`}>
            <span className="kx-live-cap">{locked ? "Programa · travado" : "Programa"}</span>
            <span className="kx-mon-t kx-live-title" title={title}>{title}</span>
            {pos && <span className="kx-meta">{pos}</span>}
            {since && <span className="kx-meta kx-since" title="Há quanto tempo este item está no ar">no ar há {since}</span>}
        </span>
    );
}

// The player module (PlayerBar in its reserved slot): always visible,
// dimmed while idle (owner's decision 2026-10-13; it drives what is on air;
// reserved, so the monitor never moves). It rides under the Programa unless
// the console's arrangement puts it somewhere else.
export function PlayerSlot({ c, picked, setPicked, videoScreens, projectorOpen }) {
    return (
        <div className="pslot">
            <PlayerBar c={c} picked={picked} setPicked={setPicked} videoScreens={videoScreens} projectorOpen={projectorOpen} />
        </div>
    );
}

// The Programa module: what is on air (or the Multiview: four outputs at
// once, { tiles, rows, onPick }) and, right under it, `player` (PlayerSlot)
// when the player rides with the Programa. Sized by console.css
// (.liveblock): as wide as its panel allows, limited by the 16:9 of its
// height. The Prévia is its own module (PreviaPanel); the dock places both.
export default function CenterPanel({ c, logoUrl, projectorDown, onDropStage, onProgMenu, items = [], multiview = null, player = null }) {
    const { cur, now, locked } = c;
    const [dropOn, setDropOn] = useState(null);
    // Locked: the screens keep this image, blue (they are not following). On
    // air there is no frame: the red lives in the header's state word and on
    // the on-air slide and item; only a failure (amber) or a lock (blue) frames it.
    const progState = projectorDown ? "warn" : locked ? "rh" : "";
    // A drop from the Biblioteca on the Programa sends.
    const dropProps = {
        onDragOver: (e) => { if (getDragStage()) { e.preventDefault(); if (!dropOn) setDropOn(true); } },
        onDragLeave: () => setDropOn(null),
        onDrop: (e) => { const st = getDragStage(); setDropOn(null); if (!st) return; e.preventDefault(); clearDragStage(); onDropStage?.(st, "air"); },
    };
    return (
        <div className={`mons ${player ? "" : "no-player"}`} data-live-keys="" tabIndex={-1}>
            <div className="liveblock">
                {multiview ? (
                    <MultiView live={cur} now={now} logoUrl={logoUrl} tiles={multiview.tiles} rows={multiview.rows} items={items} onPick={multiview.onPick}
                        state={progState} className={dropOn ? "is-dropover" : ""} dropProps={{ ...dropProps, onContextMenu: onProgMenu }}>
                        {dropOn && <div className="kx-drop-hint">Solte para enviar ao ar</div>}
                    </MultiView>
                ) : (
                    <Monitor className={`prog ${dropOn ? "is-dropover" : ""}`} state={progState} noCap live={cur} now={now} logoUrl={logoUrl} motion dropProps={{ ...dropProps, onContextMenu: onProgMenu }}>
                        {dropOn && <div className="kx-drop-hint">Solte para enviar ao ar</div>}
                    </Monitor>
                )}
                {player}
            </div>
        </div>
    );
}

// The Prévia module: the prepared stage as Projeção will show it, the
// screen itself the box (no card, owner 2026-10-14) with its caption as a
// badge inside it; under it, what sending will do when it is not obvious and
// the teacher notes — unless the Notas tab is on screen (`notesInTab`).
// Enter, a double click on it or its right-click menu send (no button, owner
// 2026-10-14). Where it goes is the dock's (Dock.jsx).
export function PreviaPanel({ c, logoUrl, onSend, onDropStage, onPrevMenu, notesInTab = false, className = "" }) {
    const { cur, prev, now, locked, stamp } = c;
    // Built with a time fixed per prepared stage, never the ticking clock:
    // a new startedAt each second replayed the slide's transition (the
    // Prévia "pulsed"). A timer still counts (the renderer gets `now`).
    const madeAt = useMemo(() => Date.now(), [prev]); // eslint-disable-line react-hooks/exhaustive-deps
    const pdoc = useMemo(() => previewDoc(prev, cur, madeAt, stamp), [prev, cur, madeAt, stamp]);
    const [dropOn, setDropOn] = useState(null);
    // The Prévia: the prepared stage as Projeção will show it, with that
    // output's own settings (Configurações › Telas e saídas: Mostrar, theme,
    // scale). The other outputs are the Multiview's.
    const railOut = OUTPUT_VIEWS[0].key;
    const { pref: railPref, theme: railTheme } = useOutputPref(railOut);
    const railDoc = useMemo(() => prefState(railOut, pdoc, railPref, railTheme), [railOut, pdoc, railPref, railTheme]);
    const railVars = prefVars(railPref);
    // The caption is a badge in the screen's top-left corner.
    const capTitle = dropOn ? "Solte para preparar" : prev ? prev.title : "";
    const capPos = !dropOn && prev && prev.slides.length > 1 ? `${prev.index + 1}/${prev.slides.length}` : "";
    const prevCap = (
        <span className={`kx-mon-badge kx-prog-cap ${locked ? "is-rh" : prev ? "is-prevcap" : "is-idle"}`}>
            <span className="kx-live-cap">{locked ? "Prévia · travado" : "Prévia"}</span>
            <span className="kx-mon-t" title={capTitle}>{capTitle}</span>
            {capPos && <span className="kx-meta">{capPos}</span>}
        </span>
    );
    const note = sendNote(prev, locked);
    // A drop from the Biblioteca on the Prévia prepares.
    const dropProps = {
        onDragOver: (e) => { if (getDragStage()) { e.preventDefault(); if (!dropOn) setDropOn(true); } },
        onDragLeave: () => setDropOn(null),
        onDrop: (e) => { const st = getDragStage(); setDropOn(null); if (!st) return; e.preventDefault(); clearDragStage(); onDropStage?.(st, "prev"); },
    };
    return (
        <Panel bare className={`prev-panel ${className}`}>
            <Monitor className={`${dropOn ? "is-dropover" : ""} ${railVars ? "kp-out" : ""}`} style={railVars || undefined} state={locked ? "rh" : prev ? "prev" : ""} noCap live={railDoc} now={now} logoUrl={logoUrl} dropProps={{ ...dropProps, onContextMenu: onPrevMenu, onDoubleClick: () => { if (prev && !locked) onSend?.(); } }}>
                {prevCap}
                {!prev && <div className="kx-screen-empty">Nada na prévia</div>}
                {prev && !railDoc && <div className="kx-screen-empty">A Projeção não mostra este item</div>}
                {prev && railDoc && stageHidden(prev.kind, railPref) && <div className="kx-screen-empty">A Projeção não mostra {stageHidden(prev.kind, railPref).toLowerCase()} (Telas e saídas › Mostrar)</div>}
                {prev?.kind === "audio" && <div className="kx-screen-empty"><Icon name="music" /> Áudio · {prev.title || "sem título"}</div>}
                {prev?.missing && <div className="kx-screen-hatch"><div>Arquivo não encontrado<small>{prev.title}</small></div></div>}
            </Monitor>
            {note && <div className="kx-meta sendnote">{note}</div>}
            {!notesInTab && <TeacherNotes prev={prev} cur={cur} />}
        </Panel>
    );
}
