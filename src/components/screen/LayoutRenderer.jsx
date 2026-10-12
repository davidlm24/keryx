import React, { useEffect, useMemo, useState } from "react";
import ScreenRenderer from "./ScreenRenderer";
import ChordedLines, { chordedOf, Transpose } from "@/components/network/ChordedLines";
import { transposeChords } from "@/utils/chordTranspose";
import { typeLabel } from "@/lib/console/setlist";
import { FONT_MAP } from "@/lib/deviceStyles";
import { layoutContext, elementVisible, elementText, elementItems, elementHasContent, layoutHasTimer, TEXT_TYPES, typeOf } from "@/lib/layouts";
import "@/components/network/net.css";
import "./layout.css";

const isUrl = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:") || v.startsWith("/"));
const FONT = { sans: FONT_MAP.sans, serif: FONT_MAP.serif, mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace' };

// A layout (src/lib/layouts.js) drawn on a screen: the Palco or Pastor
// output, a network screen, the console's Prévia rail (`embed`) and the
// editor's canvas (`ghost`: elements hidden by their rule are drawn faint,
// so they can be picked). Sized in container units from its own box, so
// every surface shows the same picture in proportion; `scale` is the
// output's Escala do texto. `children` go on top (the alert banner). A
// Projeção element draws `screenState` (the output's view of the live state,
// src/lib/outputPrefs.js prefState; the live state itself by default) with
// ScreenRenderer, playing sound when `audio`; with a timer element in the
// layout it leaves the full-screen tool layer out (the timer is in the
// element instead).
export default function LayoutRenderer({ layout, live, screenState, nowMs, logoUrl = "", upcoming = [], hasService = false, church = null, scale = 1, embed = false, ghost = false, audio = false, children }) {
    const ctx = useMemo(() => layoutContext({ live, now: nowMs, upcoming, hasService, church }), [live, nowMs, upcoming, hasService, church]);
    const base = screenState === undefined ? live : screenState;
    const screen = useMemo(() => (base?.tool && layoutHasTimer(layout) ? { ...base, tool: null } : base), [base, layout]);
    // A new song starts untransposed (the Cifra and the chorded words).
    const [transpose, setTranspose] = useState(0);
    const songKey = ctx.content?.startedAt ?? null;
    useEffect(() => { setTranspose(0); }, [songKey]);

    const bg = layout.background;
    const songImage = bg.song_image && isUrl(ctx.song?.background_image) ? ctx.song.background_image : "";
    const image = songImage || (isUrl(bg.image) ? bg.image : "");
    const style = { ...(scale !== 1 ? { "--kp-text": scale } : {}), ...(bg.color ? { background: bg.color } : {}) };
    return (
        <div className={`kl ${embed ? "kl-box" : "kl-fill"} ${ghost ? "is-ghost" : ""}`} style={style}>
            {image && <div className="kl-bg" style={{ backgroundImage: `url(${image})`, "--kl-dim": bg.dim }} />}
            {layout.elements.map((el) => {
                const shown = elementVisible(el, ctx);
                if (!shown && !ghost) return null;
                return <Element key={el.id} el={el} ctx={ctx} shown={shown} ghost={ghost} logoUrl={logoUrl} embed={embed} transpose={transpose} setTranspose={setTranspose} screen={screen} audio={audio} />;
            })}
            {children}
        </div>
    );
}

function Element({ el, ctx, shown, ghost, logoUrl, embed, transpose, setTranspose, screen, audio }) {
    // Nothing to say: nothing drawn (no empty box), unless the editor wants
    // to see where the element is.
    const has = elementHasContent(el, ctx, { logoUrl });
    if (!has && !ghost) return null;
    const body = !has ? null : TEXT_TYPES.has(el.type) ? <div className="kl-v">{elementText(el, ctx)}</div> : <Body el={el} ctx={ctx} logoUrl={logoUrl} embed={embed} transpose={transpose} setTranspose={setTranspose} screen={screen} audio={audio} />;
    const style = {
        left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
        "--s": el.size, fontFamily: FONT[el.font] || FONT.sans, fontWeight: el.weight === "bold" ? 700 : 400,
        ...(el.color ? { color: el.color } : {}),
    };
    return (
        <div className={`kl-el kl-${el.type} kl-al-${el.align} kl-va-${el.valign} ${el.box ? "is-box" : ""} ${!shown || body === null ? "is-hidden" : ""}`} style={style} data-el={el.id}>
            {el.label && <small className="kl-lab">{el.label}</small>}
            {body ?? (ghost ? <div className="kl-v kl-ghost">{typeOf(el.type)?.name}</div> : null)}
        </div>
    );
}

function Body({ el, ctx, logoUrl, embed, transpose, setTranspose, screen, audio }) {
    const song = ctx.song || {};
    switch (el.type) {
        case "screen":
            return <ScreenRenderer fill state={screen} now={ctx.now} logoUrl={logoUrl} preview={embed} motion={embed} audio={audio && !embed} />;
        case "current": {
            const chorded = el.props.chords ? chordedOf(song, ctx.index, ctx.current.text) : null;
            return (
                <>
                    <div className="kl-v">{chorded ? <ChordedLines chorded={chorded} transpose={transpose} /> : (ctx.current.text || "")}</div>
                    {chorded && !embed && <aside className="kl-trans ns-trans" aria-label="Transposição"><Transpose value={transpose} onChange={setTranspose} /></aside>}
                </>
            );
        }
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
