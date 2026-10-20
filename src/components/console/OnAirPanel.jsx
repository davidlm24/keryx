import React, { useRef } from "react";
import { Empty, SrState } from "./kx";
import { useContextMenu } from "./ContextMenu";
import useKeepInView from "./useKeepInView";
import { SlideText } from "./SlidesPanel";
import { stageAirSlide, liveStageId } from "@/lib/console/stage";
import { menuItem } from "@/lib/console/menuLabels";

// The No ar module (owner 2026-10-14, the strip under Holyrics' console):
// the slides of what is on air, whatever the Slides column holds, so the
// operator never loses the place while preparing the next item. A strip of
// cards when the module is wide and low (the band across the bottom of the
// window), a list in a column (console.css). It exists only while lyrics are
// on air: otherwise the dock folds it away (fitDock's gone, dock.js).
// A click prepares that slide (the Prévia), a double click puts it on air,
// as everywhere; ←/→ move it.
export default function OnAirPanel({ c }) {
    const menu = useContextMenu();
    const { cur, prev } = c;
    const air = cur?.content;
    const airId = liveStageId(cur);
    const slides = air?.slides || [];
    const index = air ? air.index : -1;
    // A slide of this item waiting in the Prévia.
    const prevIndex = air && prev && (prev.airSlide || prev.id === airId) ? prev.index : -1;
    const listRef = useRef(null);

    // The card on air and its neighbours stay in view, across or down
    // (0.2.18, useKeepInView): the strip moves at the next-to-last card.
    useKeepInView(listRef, ".is-air", [index, slides]);

    const pick = (i) => { if (air && i !== index) c.setPrev(stageAirSlide(air, i, airId)); };
    const go = (i) => { if (air) c.goTo(i); };

    if (!slides.length) return <Empty icon="list" title="Nenhum slide no ar">O que for ao ar aparece aqui, slide por slide.</Empty>;
    return (
        <div className="onair-b">
            <div ref={listRef} className="kx-cards onair-list">
                {slides.map((sl, i) => {
                    const cls = [i === index && "is-air", i === index + 1 && i !== prevIndex && "is-next", i === prevIndex && "is-prev"].filter(Boolean).join(" ");
                    return (
                        <button type="button" key={i} className={`onair-card kx-t ${cls}`} aria-current={i === index ? "true" : undefined} onClick={() => pick(i)} onDoubleClick={() => go(i)}
                            onContextMenu={(e) => menu(e, { title: `Slide ${i + 1}`, items: [
                                menuItem("porNaPrevia", { disabled: i === index, onSelect: () => pick(i) }),
                                menuItem("enviarAoAr", { air: true, onSelect: () => go(i) }),
                            ] })} title={`${i === index ? "No ar" : "Pôr na prévia · 2 cliques enviam"}\n\n${sl.text || sl.label || ""}`}>
                            <span className="kx-slide-n">{i + 1}</span><SrState cls={cls} />
                            <SlideText slide={sl} />
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// The module's header: the item on air and the slide it is at; minimized,
// also that slide's part (Verso, Refrão…), as Holyrics' folded strip.
export function onAirCount(c, min = false) {
    const air = c.cur?.content;
    if (!air?.slides?.length) return "";
    const sl = air.slides[air.index] || {};
    const label = min ? sl.label || (sl.is_chorus ? "Refrão" : "") : "";
    return `${air.title || "Sem título"} · ${air.index + 1}/${air.slides.length}${label ? ` · ${label}` : ""}`;
}
