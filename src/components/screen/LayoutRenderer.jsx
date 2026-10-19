import React, { useEffect, useMemo, useState } from "react";
import ScreenRenderer from "./ScreenRenderer";
import { useLiveNow } from "@/hooks/useLiveState";
import AlertBar from "./AlertBar";
import ChordedLines, { chordedOf, Transpose } from "@/components/network/ChordedLines";
import { transposeChords } from "@/utils/chordTranspose";
import { typeLabel } from "@/lib/console/setlist";
import { FONT_MAP } from "@/lib/deviceStyles";
import { layoutContext, elementVisible, elementText, elementItems, elementHasContent, layoutHasTimer, slidePage, TEXT_TYPES, typeOf } from "@/lib/layouts";
import "@/components/network/net.css";
import "./layout.css";

const isUrl = (v) => typeof v === "string" && (v.startsWith("http") || v.startsWith("data:") || v.startsWith("/"));
// Every family a theme offers (Rodada C, fase d2: the designs knew three).
const FONT = { ...FONT_MAP, mono: 'ui-monospace, "Cascadia Mono", Consolas, monospace' };

// A layout (src/lib/layouts.js) drawn on a screen: the Palco or Pastor
// output, a network screen, the console's Prévia rail (`embed`) and the
// editor's canvas (`ghost`: elements hidden by their rule are drawn faint,
// so they can be picked). Sized in container units from its own box, so
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
export default function LayoutRenderer({ layout, live, screenState, alert, nowMs: givenNow, logoUrl = "", upcoming = [], hasService = false, church = null, scale = 1, embed = false, ghost = false, audio = false, children }) {
    const ownNow = useLiveNow(1000, givenNow === undefined);
    const nowMs = givenNow ?? ownNow;
    const ctx = useMemo(() => layoutContext({ live, now: nowMs, upcoming, hasService, church }), [live, nowMs, upcoming, hasService, church]);
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
    return (
        <div className={`kl ${embed ? "kl-box" : "kl-fill"} ${ghost ? "is-ghost" : ""}`} style={style}>
            {image && <div className="kl-bg" style={{ backgroundImage: `url(${image})`, "--kl-dim": bg.dim }} />}
            {layout.elements.map((el) => {
                // A hidden element (its eye in the editor) is out of the
                // drawing; the editor's ghost mode keeps it faint, pickable.
                const shown = elementVisible(el, ctx) && !el.hidden;
                if (!shown && !ghost) return null;
                return <Element key={el.id} el={el} ctx={ctx} shown={shown} ghost={ghost} logoUrl={logoUrl} embed={embed} transpose={transpose} setTranspose={setTranspose} screen={screen} audio={audio} />;
            })}
            {alert && <AlertBar alert={alert} />}
            {children}
        </div>
    );
}

function Element({ el, ctx, shown, ghost, logoUrl, embed, transpose, setTranspose, screen, audio }) {
    // Nothing to say: nothing drawn (no empty box), unless the editor wants
    // to see where the element is.
    const has = elementHasContent(el, ctx, { logoUrl });
    if (!has && !ghost) return null;
    // A presentation's page in "Letra atual" / "Próximo slide" (Rodada F3): its picture.
    const page = el.type === "current" ? slidePage(ctx.current) : el.type === "next" ? slidePage(ctx.next) : "";
    const body = !has ? null : page ? <img className="kl-page" src={page} alt="" /> : TEXT_TYPES.has(el.type) ? <div className="kl-v">{elementText(el, ctx)}</div> : <Body el={el} ctx={ctx} logoUrl={logoUrl} embed={embed} transpose={transpose} setTranspose={setTranspose} screen={screen} audio={audio} />;
    const style = {
        left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%`,
        "--s": el.size, fontFamily: FONT[el.font] || FONT.sans, fontWeight: el.weight === "bold" ? 700 : 400,
        ...(el.color ? { color: el.color } : {}),
        // Its own opacity, only while it draws (hidden/ghost keep the
        // faint class's).
        ...(shown && has && Number(el.opacity) < 1 ? { opacity: el.opacity } : {}),
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
