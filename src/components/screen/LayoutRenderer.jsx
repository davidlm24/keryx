import React, { useEffect, useMemo, useRef, useState } from "react";
import ScreenRenderer from "./ScreenRenderer";
import { useLiveNow } from "@/hooks/useLiveState";
import AlertBar from "./AlertBar";
import ChordedLines, { chordedOf, Transpose } from "@/components/network/ChordedLines";
import { transposeChords, transposeChord } from "@/utils/chordTranspose";
import { stageLines } from "@/lib/activity";
import { typeLabel } from "@/lib/console/setlist";
import { FONT_MAP, typography } from "@/lib/deviceStyles";
import { fontStack } from "@/lib/fonts";
import { useBoxFit } from "@/hooks/useBoxFit";
import { layoutContext, elementState, elementText, elementItems, elementHasContent, elementLabel, grownRect, alertDock, layoutHasTimer, slidePage, TEXT_TYPES, typeOf } from "@/lib/layouts";
import { ALERT_DEFAULTS } from "@/lib/outputPrefs";
import "@/components/network/net.css";
import "./layout.css";

const isUrl = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:") || v.startsWith("/"));
// Every family a theme offers (Rodada C, fase d2: the designs knew three).
const FONT = { ...FONT_MAP, mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace' };

// A layout (src/lib/layouts.js) drawn on a screen: the Palco or Pastor
// output, a network screen, the console's Prévia rail (`embed`) and the
// editor's canvas (`ghost`: elements not drawn now are drawn faint, so
// they can be picked, with their cause as a class — is-off (the eye),
// is-rule (Aparece), is-empty (nothing to say); elementState, Rodada G2). Sized in container units from its own box, so
// every surface shows the same picture in proportion; `scale` is the
// output's Escala do texto. `children` go on top. A Projeção element draws
// `screenState` (the output's view of the live state, src/lib/outputPrefs.js
// prefState; the live state itself by default) with ScreenRenderer, playing
// sound when `audio`; with a timer element in the layout it leaves the
// full-screen tool layer out (the timer is in the element instead).
// `alert`: the Aviso rápido this screen draws (Rodada E3), over the whole
// drawing in the screen's look, never inside the Projeção element; left
// undefined (the Pastor), the element draws what its state has, as before.
// Without `nowMs` (the console's previews and the editor's canvas) it keeps
// its own ticking clock, so its clocks and timers count by themselves.
// `motion`: an embedded drawing plays its Projeção element (a video Fundo, a
// moving generator, the transitions) only when asked — the Multiview's
// moving tile; every other preview is a still frame (owner 2026-11-09).
export default function LayoutRenderer({ layout, live, screenState, alert, nowMs: givenNow, logoUrl = "", upcoming = [], hasService = false, church = null, scale = 1, embed = false, motion = false, ghost = false, audio = false, children }) {
    const ownNow = useLiveNow(1000, givenNow === undefined);
    const nowMs = givenNow ?? ownNow;
    // `scale` (Escala do texto) rides along so the lyrics' fit is measured again.
    const ctx = useMemo(() => ({ ...layoutContext({ live, now: nowMs, upcoming, hasService, church }), scale }), [live, nowMs, upcoming, hasService, church, scale]);
    const base = screenState === undefined ? live : screenState;
    const screen = useMemo(() => {
        let s = base?.tool && layoutHasTimer(layout) ? { ...base, tool: null } : base;
        if (alert !== undefined && s?.alert) s = { ...s, alert: null };
        return s;
    }, [base, layout, alert]);
    // A new song starts untransposed (the Cifra and the chorded words).
    const [transpose, setTranspose] = useState(0);
    const songKey = ctx.content?.startedAt ?? null;
    useEffect(() => { setTranspose(0); }, [songKey]);

    const bg = layout.background;
    const songImage = bg.song_image && isUrl(ctx.song?.background_image) ? ctx.song.background_image : "";
    const image = songImage || (isUrl(bg.image) ? bg.image : "");
    const style = { ...(scale !== 1 ? { "--kp-text": scale } : {}), ...(bg.color ? { background: bg.color } : {}) };
    // Each element's state now (elementState; a band reads its neighbours').
    const states = {};
    for (const el of layout.elements) states[el.id] = elementState(el, ctx, { logoUrl, elements: layout.elements });
    const isShown = (o) => states[o.id] === "shown";
    // The Aviso rápido beside a band at its edge (owner 2026-11-12): above
    // the Palco's bar, the lyrics making room; a pill stays in the middle.
    const look = { ...ALERT_DEFAULTS, ...(alert?.look || {}) };
    const dock = alert?.message && look.style !== "pill" ? alertDock(layout.elements, look.position, isShown) : null;
    const cut = new Set(dock?.cut || []);
    const cutSide = look.position === "bottom" ? "bottom" : "top";
    const kaH = { s: 4.6, m: 6, l: 7.8 }[look.size] || 6;
    return (
        <div className={`kl ${embed ? "kl-box" : "kl-fill"} ${ghost ? "is-ghost" : ""}`} style={style}>
            {image && <div className="kl-bg" style={{ backgroundImage: `url(${image})`, "--kl-dim": bg.dim }} />}
            {layout.elements.map((el) => {
                // An element hidden by its eye, left out by its rule or with
                // nothing to say is out of the drawing; the editor's ghost
                // mode keeps it faint, pickable.
                const state = states[el.id];
                if (state !== "shown" && !ghost) return null;
                // "Ocupa o lugar vazio": on the screen only (the editor keeps the rect it edits).
                const rect = el.grow && !ghost ? grownRect(el, layout.elements, isShown) : el;
                return <Element key={el.id} el={el} rect={rect} cut={cut.has(el.id) ? cutSide : ""} kaH={kaH} ctx={ctx} state={state} ghost={ghost} logoUrl={logoUrl} embed={embed} motion={motion} transpose={transpose} setTranspose={setTranspose} screen={screen} audio={audio} />;
            })}
            {alert && (dock && (dock.top || dock.bottom)
                ? <div className="kl-alert" style={{ top: `${dock.top}%`, bottom: `${dock.bottom}%` }}><AlertBar alert={alert} /></div>
                : <AlertBar alert={alert} />)}
            {children}
        </div>
    );
}

function Element({ el, rect = el, cut = "", kaH = 6, ctx, state, ghost, logoUrl, embed, motion, transpose, setTranspose, screen, audio }) {
    const shown = state !== "off" && state !== "rule";
    // A ghost by its eye or its rule still draws what it would say, faint.
    const has = state === "shown" || (state !== "empty" && elementHasContent(el, ctx, { logoUrl }));
    // A presentation's page in "Letra atual" / "Próximo slide" (Rodada F3): its picture.
    const page = el.type === "current" ? slidePage(ctx.current) : el.type === "next" ? slidePage(ctx.next) : "";
    const showPage = page && !(el.type === "next" && el.props.show === "text");
    const body = !has ? null : el.type === "band" ? <span className="kl-band-in" /> : showPage ? <img className="kl-page" src={page} alt="" /> : TEXT_TYPES.has(el.type) ? <TextBody el={el} ctx={ctx} transpose={transpose} /> : <Body el={el} ctx={ctx} logoUrl={logoUrl} embed={embed} motion={motion} transpose={transpose} setTranspose={setTranspose} screen={screen} audio={audio} cut={cut} />;
    const label = elementLabel(el, ctx);
    // The text bar's look (Rodada P, P8-3): italic, capitals, justify,
    // spacing and outline on the element; the underline on its body only
    // (is-u), since a decoration cannot be taken off the label under it.
    const { textDecoration, ...typo } = typography(el);
    const style = {
        ...typo,
        left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%`,
        ...(cut ? { "--ka-h": `${kaH}cqw` } : {}),
        ...(el.type === "band" && el.color ? { background: el.color } : {}),
        "--s": el.size, fontFamily: fontStack(el.font, FONT), fontWeight: el.weight === "bold" ? 700 : 400,
        ...(el.color ? { color: el.color } : {}),
        // Its own opacity, only while it draws (hidden/ghost keep the
        // faint class's).
        ...(shown && has && Number(el.opacity) < 1 ? { opacity: el.opacity } : {}),
    };
    return (
        <div className={`kl-el kl-${el.type} kl-al-${el.align} kl-va-${el.valign} ${el.box ? "is-box" : ""} ${el.inline ? "is-inline" : ""} ${cut ? `is-cut-${cut}` : ""} ${el.type === "band" ? (el.y <= 0.5 ? "is-top" : el.y + el.h >= 99.5 ? "is-bottom" : "") : ""} ${textDecoration ? "is-u" : ""} ${!shown || body === null ? `is-hidden is-${shown ? "empty" : state}` : ""}`} style={style} data-el={el.id}>
            {label && el.type !== "band" && <small className="kl-lab">{label}</small>}
            {body ?? (ghost ? <div className="kl-v kl-ghost">{typeOf(el.type)?.name}</div> : null)}
        </div>
    );
}

// A text element's string; "Rótulo ao lado" splits a two-line one (the
// title and its artist) into the line and a smaller sub, all on one line.
function TextBody({ el, ctx, transpose }) {
    let text = elementText(el, ctx);
    // The Tom as the band plays it (the Cifra's transposition).
    if (el.type === "song_key" && transpose) text = transposeChord(text, transpose);
    if (!el.inline) return <div className="kl-v">{text}</div>;
    const [head, ...rest] = String(text).split("\n");
    return <div className="kl-v">{head}{rest.length > 0 && <span className="kl-sub">{rest.join(" · ")}</span>}</div>;
}

// "Letra atual": the slide on air, shrunk until it fits its box whole
// (owner 2026-11-12: a long slide was cut at the bottom; useBoxFit); in the
// introduction its name, and an Escola question's answer under it.
function CurrentBody({ el, ctx, song, embed, transpose, setTranspose, cut = "" }) {
    const intro = Boolean(ctx.current?.intro);
    const chorded = el.props.chords && !intro ? chordedOf(song, ctx.index, ctx.current.text) : null;
    const answer = intro ? [] : stageLines(ctx.current?.activity);
    const ref = useRef(null);
    useBoxFit(ref, `${ctx.current.text || ""}:${ctx.index}:${intro}:${Boolean(chorded)}:${transpose}:${el.size}:${el.w}:${el.h}:${el.font}:${cut}:${ctx.scale}`);
    return (
        <>
            <div className="kl-v" ref={ref}>{chorded ? <ChordedLines chorded={chorded} transpose={transpose} /> : (ctx.current.text || (ctx.current.label ? <span className="ns-part">{ctx.current.label}</span> : ""))}{answer.length > 0 && <span className="ns-answer">{answer.map((l) => <span key={l} className={l.startsWith("✓") || l.startsWith("Resposta") ? "is-right" : ""}>{l}</span>)}</span>}</div>
            {chorded && !embed && <aside className="kl-trans ns-trans" aria-label="Transposição"><Transpose value={transpose} onChange={setTranspose} /></aside>}
        </>
    );
}

function Body({ el, ctx, logoUrl, embed, motion, transpose, setTranspose, screen, audio, cut }) {
    const song = ctx.song || {};
    switch (el.type) {
        case "screen":
            return <ScreenRenderer fill state={screen} now={ctx.now} logoUrl={logoUrl} preview={embed} motion={embed && motion} audio={audio && !embed} />;
        case "current":
            return <CurrentBody el={el} ctx={ctx} song={song} embed={embed} transpose={transpose} setTranspose={setTranspose} cut={cut} />;
        case "chords":
            return (
                <>
                    {!embed && <div className="kl-trans-row ns-chords-h"><Transpose value={transpose} onChange={setTranspose} /></div>}
                    <pre className="kl-pre">{transposeChords(song.chords, transpose)}</pre>
                </>
            );
        case "next_items": {
            const items = elementItems(el, ctx);
            if (!items.length) return <p className="kl-empty">{ctx.hasService ? "Fim da setlist." : "Nenhum culto escolhido no console."}</p>;
            return (
                <div className="kl-list">
                    {items.map((it, i) => (
                        <div key={it.id || i} className={`kl-item ${i === 0 ? "is-next" : ""}`}>
                            <b>{it.title || typeLabel(it.type)}</b>
                            <span>{typeLabel(it.type)}</span>
                        </div>
                    ))}
                </div>
            );
        }
        case "monitor":
            return <div className="kl-mon"><ScreenRenderer state={ctx.live} now={ctx.now} logoUrl={logoUrl} preview audio={false} /></div>;
        case "progress":
            return (
                <div className="kl-dots" aria-label={`Slide ${ctx.index + 1} de ${ctx.slides.length}`}>
                    {ctx.slides.map((_, i) => <i key={i} className={i === ctx.index ? "is-on" : i < ctx.index ? "is-done" : ""} />)}
                </div>
            );
        case "logo":
            return <img className="kl-img is-contain" src={logoUrl} alt="" />;
        case "image":
            return isUrl(el.props.url) ? <img className="kl-img" src={el.props.url} alt="" /> : null;
        default:
            return null;
    }
}
