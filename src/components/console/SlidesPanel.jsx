import React, { useEffect, useMemo, useRef } from "react";
import Icon from "./Icon";
import { Btn, Empty } from "./kx";
import { useContextMenu } from "./ContextMenu";
import { stageAt, stageAirSlide, liveStageId } from "@/lib/console/stage";

// The item in hand (owner 2026-10-14, as in Holyrics): the Prévia's slides
// whenever it holds an item, even one of a single slide; with nothing
// prepared, what is on air. What is on air stays in view in the No ar module
// (OnAirPanel). A click prepares (that slide goes to the Prévia); a double
// click puts that slide on air, besides "Enviar ao ar" and the arrows.
export const handIsPrev = (prev) => Boolean(prev && !prev.theme && prev.slides.length);

export default function SlidesPanel({ c, onGo }) {
    const menu = useContextMenu();
    const { cur, prev } = c;
    const air = cur?.content;
    const airId = liveStageId(cur);
    const fromPrev = handIsPrev(prev);
    const slides = useMemo(() => (fromPrev ? prev.slides : air ? air.slides : []), [fromPrev, prev, air]);
    const index = fromPrev ? prev.index : air ? air.index : -1;
    // The Prévia holds the item that is on air (another slide of it): mark both.
    const airIndex = fromPrev && air && (prev.airSlide || prev.id === airId) ? air.index : -1;
    const listRef = useRef(null);

    useEffect(() => {
        const el = listRef.current?.querySelector(".is-prev, .is-air");
        el?.scrollIntoView({ block: "nearest" });
    }, [index, slides]);

    const airWord = "is-air";
    const pos = slides.length ? `${fromPrev ? "prévia" : "no ar"} ${index + 1}/${slides.length}` : "";
    const pick = (i) => {
        if (fromPrev) c.setPrev(stageAt(prev, i));
        else if (air && i !== air.index) c.setPrev(stageAirSlide(air, i, airId));
    };
    const go = (i) => {
        if (fromPrev) onGo?.(stageAt(prev, i));
        else if (air) c.goTo(i);
    };

    return (
        <>
            {!slides.length && <Empty icon="list" title="Nenhum item em mãos">Clique num item da Setlist ou da Biblioteca.</Empty>}
            <div ref={listRef} className="kx-cards" style={{ overflow: "auto", flex: 1 }}>
                {slides.map((sl, i) => {
                    let cls = "";
                    if (fromPrev) cls = [i === index && "is-prev", i === airIndex && airWord].filter(Boolean).join(" ");
                    else cls = i === index ? airWord : i === index + 1 ? "is-next" : "";
                    const onAir = cls.includes(airWord);
                    return (
                        <button type="button" key={i} className={`kx-slide kx-t ${cls}`} onClick={() => pick(i)} onDoubleClick={() => go(i)}
                            onContextMenu={(e) => menu(e, { title: `Slide ${i + 1}`, items: [
                                { label: "Pôr na prévia", icon: "eye", disabled: !fromPrev && i === index, onSelect: () => pick(i) },
                                { label: "Enviar ao ar", icon: "play", air: true, onSelect: () => go(i) },
                            ] })} title={`${onAir ? "No ar" : "Pôr na prévia · 2 cliques enviam"}\n\n${sl.text || ""}`}>
                            <span className="kx-slide-n">{i + 1}</span>
                            <SlideText slide={sl} />
                        </button>
                    );
                })}
            </div>
            <div className="slidesnav">
                <Btn className="kx-btn-live" onClick={() => c.moveSlide(-1)} title="Slide anterior no ar · ←"><Icon name="skip-back" />Anterior</Btn>
                <Btn className="kx-btn-live" onClick={() => c.moveSlide(1)} title="Próximo slide no ar · →">Próximo<Icon name="skip-fwd" /></Btn>
                <span style={{ flex: 1 }} />
                <span className="kx-meta">{pos}</span>
            </div>
        </>
    );
}

// A slide's label and its lines as the editor made them: each line stays one
// line and ends in "…" when the column is too narrow (owner 2026-10-14; the
// whole text is in the card's tooltip and in the Prévia).
export function SlideText({ slide }) {
    const label = slide.label || (slide.is_chorus ? "Refrão" : "");
    return (
        <span className="kx-slide-body">
            {label && <span className="kx-slide-lab">{label}</span>}
            {String(slide.text || "").split("\n").map((line, i) => <span key={i} className="kx-ln">{line || " "}</span>)}
        </span>
    );
}

// The title the Slides module shows in its header.
export function handTitle(c) {
    return handIsPrev(c.prev) ? c.prev.title : c.cur?.content?.title || "";
}
