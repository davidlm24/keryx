import React, { useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Monitor, Panel } from "./kx";
import PlayerBar from "./PlayerBar";
import MultiView from "./MultiView";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { stageOp } from "@/lib/console/stage";
import { applyWithFundo } from "@/lib/console/backgroundSpec";
import { getDragStage, getDragStages, clearDragStage } from "@/lib/console/dragStage";
import { captionParts, airInPlayer } from "@/lib/console/caption";
import { OUTPUT_VIEWS } from "@/lib/network/views";
import { prefState, prefVars, outputsNotShowing, alertOf } from "@/lib/outputPrefs";
import { useOutputPref, useOutputPrefRows } from "@/hooks/useOutputPref";
import "@/components/screen/output-prefs.css";
import { usePendingMedia } from "@/hooks/usePendingMedia";
import { pendingUrls } from "@/lib/pendingMedia";
import { keyHint } from "@/lib/console/keys";
import { usePrefs } from "@/hooks/useUser";
import ClipTitle from "./ClipTitle";
import { retryPages, usePagesProgress } from "@/hooks/usePagesBackfill";
import { presentationPreviewStatus } from "@/lib/presentation";
import { sendBlock } from "@/lib/console/sendBlock";

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
    // The material's notes, and the note of the question in hand (Rodada E4:
    // content.stage.slide_notes, the Prévia's selected slide or the one on air).
    const slideNote = (list, i, slides) => (list?.[i] ? { label: slides?.[i]?.label || `Slide ${i + 1}`, text: list[i] } : null);
    const fromPrev = prev?.notes || prev?.slideNotes?.[prev.index] ? { title: prev.title, notes: prev.notes, slide: slideNote(prev.slideNotes, prev.index, prev.slides) } : null;
    const st = cur?.content?.stage;
    const air = st?.notes || st?.slide_notes?.[cur.content.index] ? { title: cur.content.title, notes: st.notes, slide: slideNote(st.slide_notes, cur.content.index, cur.content.slides) } : null;
    const n = fromPrev || air;
    if (!n) return null;
    return (
        <div className="tnotes">
            <span className="kx-section">Notas do professor <span className="kx-count">· {n.title} · só no console e no palco</span></span>
            {n.slide && <p><b>{n.slide.label}:</b> {n.slide.text}</p>}
            {n.notes && <p>{n.notes}</p>}
        </div>
    );
}

// A glyph button of the pills (24 px; the name is its aria-label and tooltip).
const btn = ({ className = "", ...props }, icon) => <button type="button" className={`kx-btn kx-btn-icon kx-t ${className}`} {...props}><Icon name={icon} /></button>;

// The Programa has no header (owner 2026-10-16, Rodada E1): its caption and
// controls are one pill in the screen's bottom-right corner, so the screen's
// top lines up with the panels beside it. A dot in the colour of the state
// (red on air, blue locked with the "Travado" word, amber when an output
// failed, grey with nothing on air), the title — only when the player does
// not name it already (owner's pick A, Rodada F1: a video or a sound playing
// there has its name in the player; `airInPlayer`) —, the slide (2/6), on
// how many screens (`where`: outputHealth's onAir), then Voltar ao anterior,
// the Camadas drawer (`camadas`, only while Camadas is in the tray),
// Multiview and the screen actions (owner's pick B: Tela preta, Logo,
// Limpar, Encerrar left the top bar for here). No "no ar há" (Rodada F1).
// On a small screen it folds once (container queries on the screen,
// console.css): first "2 telas" goes, then every button but Multiview goes
// into a "…" that opens the Programa's menu (`onMore`, the same as its
// right click), which holds every action the pill dropped. Inside the
// screen, so it rides the Multiview too.
export function ProgramaPill({ c, projectorDown, where, camadas, histOpen, onHist, multiviewOn, onMultiview, onMore, onEnd }) {
    const { cur, locked } = c;
    const { title, pos } = captionParts(cur);
    const inPlayer = airInPlayer(cur);
    const idle = title === "nada" && !inPlayer;
    const shown = idle ? "Nada no ar" : title;
    const tone = projectorDown ? "warn" : locked ? "rh" : idle ? "idle" : "air";
    const said = inPlayer ? "no ar, no player" : idle ? "nada no ar" : title;
    return (
        <div className={`prog-pill kx-pill is-${tone}`} role="group" aria-label="Programa">
            <span className={`kx-prog-cap prog-cap is-${tone}`} aria-label={`Programa · ${said}${locked ? " · travado" : ""}`}>
                <i className="pp-dot kx-pill-dot" aria-hidden="true" />
                {!inPlayer && <span className="kx-mon-t pp-title kx-pill-title" title={shown}><ClipTitle text={shown} /></span>}
                {locked && <span className="prog-locked">Travado</span>}
                {pos && <span className="kx-meta pp-pos">{pos}</span>}
            </span>
            {where && <span className={`kx-meta prog-where ${where.warn ? "kx-warn" : ""}`} title={`O Programa está ${where.text} agora · detalhes em Saídas`}>{where.short}</span>}
            <span className="pp-sep kx-pill-sep pp-full" aria-hidden="true" />
            <span className="pp-btns kx-pill-btns pp-full">
                {btn({ className: `pp-hist ${histOpen ? "is-on" : ""}`, onClick: onHist, "aria-label": "Voltar ao anterior", "aria-expanded": histOpen, title: "Voltar ao anterior · o que esteve no ar há pouco" }, "undo")}
                {camadas && btn({ className: `pp-camadas ${camadas.open ? "is-on" : ""}`, onClick: camadas.onToggle, "aria-label": "Camadas", "aria-expanded": camadas.open, title: "Camadas: tema, papel de parede, logo e sobreposições do que está no ar" }, "layers")}
            </span>
            {btn({ className: "pp-more", onClick: onMore, "aria-label": "Mais ações do Programa", "aria-haspopup": "menu", title: "Tela preta, logo, limpar, voltar ao anterior, Camadas e encerrar" }, "more")}
            {btn({ className: `mx-toggle ${multiviewOn ? "is-on" : ""}`, onClick: onMultiview, "aria-label": "Multiview", "aria-pressed": multiviewOn, title: multiviewOn ? "Voltar a ver só o Programa" : "Multiview: quatro saídas ao mesmo tempo, com o que está no ar" }, "grid")}
            <span className="pp-sep kx-pill-sep pp-full" aria-hidden="true" />
            <ScreenActions c={c} onEnd={onEnd} className="pp-full" />
        </div>
    );
}

// The actions that change what the audience sees, as glyphs (names and keys
// in the tooltips; they act even with the screens locked): in the Programa's
// pill, and alone in a pill on the Bíblia's No ar monitor (Rodada E1: they
// left the top bar). Encerrar, the one that takes everything off, stands
// apart after a separator, in the air's red (Rodada DS1, d5_pilula).
export function ScreenActions({ c, onEnd, className = "" }) {
    const { live } = c;
    // The keys as the church's "Teclas de uma letra" say (keys.js keyHint).
    const letters = usePrefs().letter_keys;
    const k = (action) => { const h = keyHint(action, letters); return h ? ` · ${h}` : ""; };
    return (
        <span className={`pp-screens kx-pill-btns ${className}`} role="group" aria-label="Telas: ações que mudam o que o público vê">
            {btn({ className: live?.screen === "black" ? "is-on" : "", "aria-pressed": live?.screen === "black", "aria-label": "Tela preta", title: `Tela preta${k("black")} · nas telas, na hora`, onClick: () => c.toggleScreen("black") }, "black")}
            {btn({ className: live?.screen === "logo" ? "is-on" : "", "aria-pressed": live?.screen === "logo", "aria-label": "Mostrar logo", title: `Mostrar logo${k("logo")} · nas telas`, onClick: () => c.toggleScreen("logo") }, "logo")}
            {btn({ "aria-label": "Limpar texto", title: `Limpar texto${k("clear")}`, onClick: c.clearText }, "eraser")}
            {onEnd && <span className="pp-sep kx-pill-sep" aria-hidden="true" />}
            {onEnd && btn({ className: "pp-end kx-pill-end", "aria-label": "Encerrar a projeção", title: "Encerrar a projeção (pergunta antes) · Esc encerra na hora", onClick: onEnd }, "stop")}
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
// once, { tiles, rows, onPick }) with its `pill` (ProgramaPill) inside the
// screen and, right under it, `player` (PlayerSlot) when the player rides
// with the Programa. Sized by console.css
// (.liveblock): as wide as its panel allows, limited by the 16:9 of its
// height. The Prévia is its own module (PreviaPanel); the dock places both.
export default function CenterPanel({ c, logoUrl, projectorDown, onDropStage, onProgMenu, items = [], multiview = null, player = null, pill = null, still = false }) {
    const { cur, locked } = c;
    const [dropOn, setDropOn] = useState(null);
    // Under a floating view (owner 2026-10-14) the monitor draws one still
    // frame: no video, no ticking clock (a new `now` each second replays the
    // slide's transition, as the Prévia found) — the air itself never pauses,
    // only this preview. The frame is the moment the view opened. Otherwise
    // no `now`: the monitor keeps its own clock (ScreenRenderer, MultiView).
    const frozen = useRef(null);
    if (still) { if (frozen.current == null) frozen.current = keryx.live.now(); } else frozen.current = null;
    const shownNow = still ? frozen.current : undefined;
    // Locked: the screens keep this image, blue (they are not following). On
    // air there is no frame: the red lives in the pill's dot and title and on
    // the on-air slide and item; only a failure (amber) or a lock (blue) frames it.
    const progState = projectorDown ? "warn" : locked ? "rh" : "";
    // The Programa draws the live state raw, but the Aviso rápido in the look
    // the Projeção chose (Editor › Ajustes › Aviso rápido; Rodada E3): only
    // the look, never its rule — the Programa still shows the aviso.
    const { pref: projPref } = useOutputPref(OUTPUT_VIEWS[0].key);
    const progDoc = useMemo(() => {
        const alert = alertOf(cur, projPref && { options: projPref.options });
        return alert === (cur?.alert ?? null) ? cur : { ...cur, alert };
    }, [cur, projPref]);
    // A drop from the Biblioteca on the Programa sends.
    const dropProps = {
        onDragOver: (e) => { if (getDragStage()) { e.preventDefault(); const n = getDragStages().length; if (dropOn !== n) setDropOn(n); } },
        onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropOn(null); },
        onDrop: (e) => { const st = getDragStage(); const n = getDragStages().length; setDropOn(null); if (!st) return; e.preventDefault(); clearDragStage(); onDropStage?.(st, "air", n); },
    };
    // Several marked rows (Rodada O2): only the first, and only to the Prévia.
    const dropHint = dropOn && (dropOn > 1 ? <div className="kx-drop-hint"><span>Só o primeiro vai para a prévia</span></div> : <div className="kx-drop-hint is-air"><span>Solte para enviar ao ar</span></div>);
    return (
        <div className={`mons ${player ? "" : "no-player"}`} data-live-keys="" tabIndex={-1}>
            <div className="liveblock">
                {multiview ? (
                    <MultiView live={cur} now={shownNow} logoUrl={logoUrl} tiles={multiview.tiles} rows={multiview.rows} items={items} onPick={multiview.onPick} still={still}
                        state={progState} dropProps={{ ...dropProps, onContextMenu: onProgMenu }}>
                        {pill}
                        {dropHint}
                    </MultiView>
                ) : (
                    <Monitor className="prog" state={progState} noCap live={progDoc} now={shownNow} logoUrl={logoUrl} motion={!still} dropProps={{ ...dropProps, onContextMenu: onProgMenu }}>
                        {pill}
                        {dropHint}
                    </Monitor>
                )}
                {player}
            </div>
        </div>
    );
}

// The Prévia's pill (owner 2026-10-20, Rodada N5: "dentro, com o mesmo
// style que a pílula na tela principal"): the Programa pill's look in the
// screen's bottom-right corner, a dot in the Prévia's green (blue locked,
// grey while it cannot go) and the one button that sends, the same `onSend`
// as Enter and the double click. A theme's example only uses the theme (its
// background, never the example text: useConsole's send), so there it says
// "Usar o tema". While it cannot go the button stays (aria-disabled, so its
// tooltip still says why) and does nothing. On a narrow Prévia only the
// glyph remains (console.css, prev-screen). A double click on it is not the
// screen's: one send, never two.
function PreviaPill({ prev, block, onSend }) {
    const letters = usePrefs().letter_keys;
    const key = keyHint("send", letters);
    const label = prev.theme ? "Usar o tema" : "Enviar ao ar";
    const tone = block?.code === "locked" ? "rh" : block ? "idle" : "prev";
    const why = block ? (block.code === "locked" ? "Telas travadas" : block.message) : `${label}${key ? ` · ${key}` : ""}${prev.theme ? " · o fundo do tema, sem o texto de exemplo" : ""}`;
    return (
        <div className={`prog-pill kx-pill prev-pill is-${tone}`} role="group" aria-label="Prévia" onDoubleClick={(e) => e.stopPropagation()}>
            <i className="pp-dot kx-pill-dot" aria-hidden="true" />
            <button type="button" className="kx-btn kx-t pv-send" aria-label={label} aria-disabled={block ? true : undefined} title={why} onClick={() => { if (!block) onSend?.(); }}>
                <Icon name="play" /><span className="pv-send-l">{label}</span>
            </button>
        </div>
    );
}

// The Prévia module: the prepared stage as Projeção will show it, the
// screen itself the box (no card, owner 2026-10-14) with its caption as a
// badge inside it; under it, what sending will do when it is not obvious and
// the teacher notes — unless the Notas tab is on screen (`notesInTab`).
// An Enviar ao ar pill inside the screen, bottom-right, in the Programa
// pill's style (owner 2026-10-20, Rodada N5; PreviaPill), plus Enter, a
// double click on it or its right-click menu send. Where it goes is the
// dock's (Dock.jsx).
export function PreviaPanel({ c, logoUrl, onSend, onDropStage, onPrevMenu, notesInTab = false, className = "" }) {
    // A file the sync has not brought yet: said over the Prévia, not drawn broken.
    const pending = usePendingMedia();
    const { cur, prev, locked, stamp } = c;
    const pagesProgress = usePagesProgress(prev?.args?.id);
    // Why the Prévia cannot go now (the same checks as send: locked, a file
    // still coming or missing, a PDF whose pages are being made), or null.
    const block = prev ? sendBlock(prev, { locked, pending, progress: pagesProgress }) : null;
    const blockedMessage = presentationPreviewStatus(prev, pagesProgress);
    // Built with a time fixed per prepared stage, never the ticking clock:
    // a new startedAt each second replayed the slide's transition (the
    // Prévia "pulsed"). A timer still counts (the renderer's own clock).
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
    // Every output that normally shows the prepared kind and, by what it
    // receives (Ajustes › O que esta tela recebe), will not.
    const outputRows = useOutputPrefRows();
    const notShowing = useMemo(() => outputsNotShowing(prev, outputRows), [prev, outputRows]);
    // The caption is a badge in the screen's top-left corner.
    const capTitle = prev ? prev.title : "";
    const capPos = prev && prev.slides.length > 1 ? `${prev.index + 1}/${prev.slides.length}` : "";
    const prevCap = (
        <span className={`kx-mon-badge kx-prog-cap ${locked ? "is-rh" : prev ? "is-prevcap" : "is-idle"}`}>
            <span className="kx-live-cap">{locked ? "Prévia · travado" : "Prévia"}</span>
            <span className="kx-mon-t" title={capTitle}>{capTitle}</span>
            {capPos && <span className="kx-meta">{capPos}</span>}
        </span>
    );
    // A drop from the Biblioteca on the Prévia prepares.
    const dropProps = {
        onDragOver: (e) => { if (getDragStage()) { e.preventDefault(); const n = getDragStages().length; if (dropOn !== n) setDropOn(n); } },
        onDragLeave: (e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDropOn(null); },
        onDrop: (e) => { const st = getDragStage(); const n = getDragStages().length; setDropOn(null); if (!st) return; e.preventDefault(); clearDragStage(); onDropStage?.(st, "prev", n); },
    };
    return (
        <Panel bare className={`prev-panel ${className}`}>
            <Monitor className={railVars ? "kp-out" : ""} style={railVars || undefined} state={locked ? "rh" : prev ? "prev" : ""} noCap live={railDoc} logoUrl={logoUrl} dropProps={{ ...dropProps, onContextMenu: onPrevMenu, onDoubleClick: () => { if (prev && !locked) onSend?.(); } }}>
                {prevCap}
                {dropOn && <div className="kx-drop-hint"><span>{dropOn > 1 ? "Só o primeiro vai para a prévia" : "Solte para preparar"}</span></div>}
                {!prev && <div className="kx-screen-empty">Nada na prévia</div>}
                {prev && (
                    <div className="prev-foot">
                        {notShowing.length > 0 && (
                            <div className="kx-prev-warn" role="status">
                                {notShowing.map((o) => <span key={o.page}><Icon name="warn" size={12} />A saída <b>{o.name}</b> não vai mostrar {o.kind}</span>)}
                            </div>
                        )}
                        <PreviaPill prev={prev} block={block} onSend={onSend} />
                    </div>
                )}
                {prev?.kind === "audio" && <div className="kx-screen-empty"><Icon name="volume" /> Áudio · {prev.title || "sem título"}</div>}
                {prev?.blocked
                    ? <div className="kx-screen-hatch kx-pdf-wait"><div>{blockedMessage}<small>{prev.title}</small>{pagesProgress?.error?.retryable && <button type="button" onClick={() => retryPages(prev.args?.id)}>Tentar de novo</button>}</div></div>
                    : prev && pendingUrls(prev, pending, { skip: ["poster", "thumbnail_url"] }).length > 0
                    ? <div className="kx-screen-hatch"><div>Baixando…<small>{prev.title} · da sincronização</small></div></div>
                    : prev?.missing && <div className="kx-screen-hatch"><div>Arquivo não encontrado<small>{prev.title}</small></div></div>}
            </Monitor>
            {!notesInTab && <TeacherNotes prev={prev} cur={cur} />}
        </Panel>
    );
}
