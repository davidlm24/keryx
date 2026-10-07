import React, { useEffect, useMemo, useRef } from "react";
import Icon from "./Icon";
import { Btn, Empty } from "./kx";
import { stageAt, stageAirSlide, liveStageId } from "@/lib/console/stage";

// The slides of the item in hand: the Prévia when it has slides, else what
// is on air. A click prepares (that slide goes to the Prévia); a double
// click puts that slide on air, besides "Enviar ao ar" and the arrows.
export default function SlidesPanel({ c, onGo }) {
    const { cur, prev, isLive } = c;
    const air = cur?.content;
    const airId = liveStageId(cur);
    const handIsPrev = Boolean(prev && prev.slides.length > 1);
    const slides = useMemo(() => (handIsPrev ? prev.slides : air ? air.slides : []), [handIsPrev, prev, air]);
    const index = handIsPrev ? prev.index : air ? air.index : -1;
    // The Prévia holds the item that is on air (another slide of it): mark both.
    const airIndex = handIsPrev && air && (prev.airSlide || prev.id === airId) ? air.index : -1;
    const listRef = useRef(null);

    useEffect(() => {
        const el = listRef.current?.querySelector(".is-prev, .is-air, .is-rh");
        el?.scrollIntoView({ block: "nearest" });
    }, [index, slides]);

    const airWord = isLive ? "is-air" : "is-rh";
    const pos = slides.length ? `${handIsPrev ? "prévia" : isLive ? "no ar" : "ensaio"} ${index + 1}/${slides.length}` : "";
    const pick = (i) => {
        if (handIsPrev) c.setPrev(stageAt(prev, i));
        else if (air && i !== air.index) c.setPrev(stageAirSlide(air, i, airId));
    };
    const go = (i) => {
        if (handIsPrev) onGo?.(stageAt(prev, i));
        else if (air) c.goTo(i);
    };

    return (
        <>
            {!slides.length && <Empty icon="list" title="Nenhum item em mãos">Clique num item do Roteiro ou da Biblioteca.</Empty>}
            <div ref={listRef} style={{ overflow: "auto", flex: 1 }}>
                {slides.map((sl, i) => {
                    let cls = "";
                    if (handIsPrev) cls = i === index ? "is-prev" : i === airIndex ? airWord : "";
                    else cls = i === index ? airWord : i === index + 1 ? "is-next" : "";
                    return (
                        <button type="button" key={i} className={`kx-slide kx-t ${cls}`} onClick={() => pick(i)} onDoubleClick={() => go(i)} title={cls === airWord ? "No ar" : "Pôr na prévia · 2 cliques enviam"}>
                            <span className="kx-slide-n">{i + 1}</span>
                            <span>
                                {sl.label && <span className="kx-slide-lab" style={{ display: "block" }}>{sl.label}</span>}
                                {!sl.label && sl.is_chorus && <span className="kx-slide-lab" style={{ display: "block" }}>Refrão</span>}
                                {sl.text}
                            </span>
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

// The title the Slides module shows in its header.
export function handTitle(c) {
    const handIsPrev = Boolean(c.prev && c.prev.slides.length > 1);
    return handIsPrev ? c.prev.title : c.cur?.content?.title || "";
}
