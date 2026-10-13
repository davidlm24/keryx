import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { Monitor, Btn, Row, Split } from "./kx";
import { DEFAULT_LAYOUT, clampSize } from "@/lib/console/layout";
import { typeIcon } from "@/lib/console/setlist";
import PlayerBar from "./PlayerBar";
import MultiView from "./MultiView";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { stageOp } from "@/lib/console/stage";
import { applyWithFundo } from "@/lib/console/backgroundSpec";
import { getDragStage, clearDragStage } from "@/lib/console/dragStage";
import { SEND_LABEL, sendTip } from "@/lib/console/copy";
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

// The live column, one block the same at every width
// (docs/presenter-layout-proposal-2026-10-09.md, P0): the Programa (what is
// on air, or the local copy with the real screen in a PiP; an output failure
// is the banner under the top bar, never here), right under it a reserved
// slot where the player shows while something plays (it drives what is on
// air; reserved, so the monitors never move; user decision 2026-10-12), the
// Prévia with its one send button, the next item and, when the Setlist has no
// column of its own, the items after it. The block is as wide as the column
// allows and as tall as fits (console.css, .liveblock); spare height goes
// below it, never between the monitors. With `multiview` ({ tiles, rows,
// onPick }; Programa › Multiview) the Programa is four outputs at once, in
// the same place and size (MultiView.jsx).
export default function CenterPanel({ c, logoUrl, projectorDown, projectorOpen, onAir, nextItem, onPrepNext, later = [], onPrepareItem, onGoItem, onSend, onDropStage, videoScreens, playerPick, setPlayerPick, onProgMenu, onPrevMenu, items = [], multiview = null, prevPct = DEFAULT_LAYOUT.prevPct, onPrevPct = null }) {
    const { cur, prev, now, locked, stamp } = c;
    // The Prévia's width is the operator's (the splitter beside it, % of the
    // column, saved with the layout); the Programa gives way when the window
    // is short (console.css, --prev). The splitter works in pixels, so the
    // row's width is kept here.
    const subRef = useRef(null);
    const [subW, setSubW] = useState(0);
    useEffect(() => {
        const el = subRef.current;
        if (!el || typeof ResizeObserver === "undefined") return undefined;
        const ro = new ResizeObserver(([e]) => setSubW(e.contentRect.width));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const pct = clampSize("prevPct", prevPct);
    const prevPx = (subW * pct) / 100;
    const pdoc = useMemo(() => previewDoc(prev, cur, now, stamp), [prev, cur, now, stamp]);
    const [dropOn, setDropOn] = useState(null);
    // The Prévia: the prepared stage as Projeção will show it, with that
    // output's own settings (Configurações › Telas e saídas: Mostrar, theme,
    // scale). The other outputs are the Multiview's (the picker that used to
    // sit beside the Prévia went with it, 2026-10-12).
    const railOut = OUTPUT_VIEWS[0].key;
    const { pref: railPref, theme: railTheme } = useOutputPref(railOut);
    const railDoc = useMemo(() => prefState(railOut, pdoc, railPref, railTheme), [railOut, pdoc, railPref, railTheme]);
    const railVars = prefVars(railPref);
    // Locked: the screens keep this image, blue (they are not following). On
    // air there is no frame: the red lives in the header's state word and on
    // the on-air slide and item; only a failure (amber) or a lock (blue) frames it.
    const progState = projectorDown ? "warn" : locked ? "rh" : "";
    // The Prévia's caption: the state word, the title (prepared: next-title,
    // 14px) and the position (meta).
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
        <div className="mons" data-live-keys="" tabIndex={-1} style={{ "--prev": pct / 100 }}>
            <div className="liveblock">
                {multiview ? (
                    <MultiView live={cur} now={now} logoUrl={logoUrl} tiles={multiview.tiles} rows={multiview.rows} items={items} onPick={multiview.onPick}
                        state={progState} className={dropOn === "air" ? "is-dropover" : ""} dropProps={{ ...dropProps("air"), onContextMenu: onProgMenu }}>
                        {dropOn === "air" && <div className="kx-drop-hint">Solte para enviar ao ar</div>}
                    </MultiView>
                ) : (
                    <Monitor className={`prog ${dropOn === "air" ? "is-dropover" : ""}`} state={progState} noCap live={cur} now={now} logoUrl={logoUrl} motion dropProps={{ ...dropProps("air"), onContextMenu: onProgMenu }}>
                        {dropOn === "air" && <div className="kx-drop-hint">Solte para enviar ao ar</div>}
                    </Monitor>
                )}
                <div className="pslot">
                    <PlayerBar c={c} picked={playerPick} setPicked={setPlayerPick} videoScreens={videoScreens} projectorOpen={projectorOpen} />
                </div>
                <div className="subrow" ref={subRef}>
                    <Monitor className={`${dropOn === "prev" ? "is-dropover" : ""} ${railVars ? "kp-out" : ""}`} style={railVars || undefined} state={prev ? "prev" : ""} cap={prevCap} live={railDoc} now={now} logoUrl={logoUrl} dropProps={{ ...dropProps("prev"), onContextMenu: onPrevMenu }}>
                        {!prev && <div className="kx-screen-empty">Nada na prévia</div>}
                        {prev && !railDoc && <div className="kx-screen-empty">A Projeção não mostra este item</div>}
                        {prev && railDoc && stageHidden(prev.kind, railPref) && <div className="kx-screen-empty">A Projeção não mostra {stageHidden(prev.kind, railPref).toLowerCase()} (Ajustes da saída › Mostrar)</div>}
                        {prev?.kind === "audio" && <div className="kx-screen-empty"><Icon name="music" /> Áudio · {prev.title || "sem título"} · as telas não mudam</div>}
                        {prev?.missing && <div className="kx-screen-hatch"><div>Arquivo não encontrado<small>{prev.title}</small></div></div>}
                    </Monitor>
                    {onPrevPct && subW > 0 && <Split size={prevPx} sign={1} onSize={(px) => onPrevPct(clampSize("prevPct", (px / subW) * 100))} onReset={() => onPrevPct(DEFAULT_LAYOUT.prevPct)} clamp={(px) => px} />}
                    <div className="side">
                        <div className="sendrow">
                            <Btn kind="prev" className="kx-btn-send" onClick={() => onSend()} disabled={!prev || locked} title={sendTip(locked)}>
                                {SEND_LABEL}
                            </Btn>
                        </div>
                        {note && <div className="kx-meta sendnote">{note}</div>}
                        {/* Próximo: what the Setlist has next, beside the Prévia it goes into. */}
                        <div className="nextline">
                            <span className="kx-section">Próximo</span>
                            <span className={`t ${nextItem ? "kx-next-title" : "kx-meta"}`} title={nextItem?.title || ""}>{nextItem ? nextItem.title || "Item" : "fim da setlist"}</span>
                            {nextItem && <Btn small onClick={onPrepNext} title="Pôr o próximo item da Setlist na Prévia">Pôr na prévia</Btn>}
                        </div>
                        <TeacherNotes prev={prev} cur={cur} />
                    </div>
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
