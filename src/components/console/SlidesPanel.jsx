import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { Btn, Empty, IconBtn, SrState, onTabsKey } from "./kx";
import { useContextMenu } from "./ContextMenu";
import useKeepInView, { useFocusFollows } from "./useKeepInView";
import ClipTitle from "./ClipTitle";
import { stageAt, stageAirSlide, liveStageId } from "@/lib/console/stage";
import { lyricsOnAir } from "@/lib/console/dock";
import { menuItem } from "@/lib/console/menuLabels";

// The item in hand (owner 2026-10-14, as in Holyrics): the Prévia's slides
// whenever it holds an item, even one of a single slide; with nothing
// prepared, what is on air. What is on air stays in view in the No ar module
// (OnAirPanel). A click prepares (that slide goes to the Prévia); a double
// click puts that slide on air, besides "Enviar ao ar" and the arrows.
// `airTabs`: the No ar module is not on screen (the medium and narrow
// consoles, or in the tray): while lyrics are on air and another item is in
// the Prévia, the column has two tabs, No ar and Prévia (owner 2026-10-14,
// the small-screen review), so what is on air is one click away instead of a
// strip across the window. The tab only changes what the column shows; the
// keys do as always (←/→ on air, ↑/↓ the Prévia).
export const handIsPrev = (prev) => Boolean(prev && !prev.theme && prev.slides.length);

export default function SlidesPanel({ c, onGo, airTabs = false }) {
    const menu = useContextMenu();
    const { cur, prev } = c;
    const air = cur?.content;
    const airId = liveStageId(cur);
    const fromPrev = handIsPrev(prev);
    // Another item in the Prévia while lyrics are on air: the two tabs.
    const twoItems = airTabs && fromPrev && lyricsOnAir(cur) && !(prev.airSlide || prev.id === airId);
    const [side, setSide] = useState("prev");
    // A new item prepared shows itself; the No ar tab is a click away.
    useEffect(() => { setSide("prev"); }, [prev?.id]);
    const showAir = twoItems && side === "air";
    const hand = fromPrev && !showAir;
    const slides = useMemo(() => (hand ? prev.slides : air ? air.slides : []), [hand, prev, air]);
    const index = hand ? prev.index : air ? air.index : -1;
    // The Prévia holds the item that is on air (another slide of it): mark both.
    const airIndex = hand && air && (prev.airSlide || prev.id === airId) ? air.index : -1;
    const listRef = useRef(null);

    // The slide in hand (or on air) and its neighbours stay in view: the
    // column moves at the next-to-last card (0.2.18, useKeepInView).
    useKeepInView(listRef, hand ? ".is-prev" : ".is-air", [index, slides, hand]);
    // A slide focused with Tab follows the green selection (↑/↓), so Enter
    // prepares the one highlighted.
    useFocusFollows(listRef, ".kx-slide", hand ? ".kx-slide.is-prev" : ".kx-slide.is-air", [index, hand]);

    const airWord = "is-air";
    const pos = slides.length ? `${hand ? "prévia" : "no ar"} ${index + 1}/${slides.length}` : "";
    // Where the air is: the footer's arrows move it, whatever the column shows.
    const airPos = air?.slides?.length ? `${air.index + 1}/${air.slides.length}` : "";
    const pick = (i) => {
        if (hand) c.setPrev(stageAt(prev, i));
        else if (air && i !== air.index) c.setPrev(stageAirSlide(air, i, airId));
    };
    const go = (i) => {
        if (hand) onGo?.(stageAt(prev, i));
        else if (air) c.goTo(i);
    };

    return (
        <>
            {twoItems && (
                <div className="dock-tabs slides-tabs" role="tablist" aria-label="O que a coluna mostra" onKeyDown={onTabsKey}>
                    <button type="button" role="tab" aria-selected={showAir} tabIndex={showAir ? 0 : -1} className={`dock-tab ${showAir ? "is-on" : ""}`} onClick={() => setSide("air")} title={`No ar: ${air.title || "Sem título"} · ${air.index + 1}/${air.slides.length}`} aria-label={`No ar: ${air.title || "Sem título"}, slide ${air.index + 1} de ${air.slides.length}`}>
                        <span className="slides-dot is-air" aria-hidden="true" /><span className="slides-tab-w" aria-hidden="true">No ar</span><ClipTitle className="slides-tab-t" text={air.title || "Sem título"} /><span className="slides-tab-n">{air.index + 1}/{air.slides.length}</span>
                    </button>
                    <button type="button" role="tab" aria-selected={!showAir} tabIndex={showAir ? -1 : 0} className={`dock-tab ${showAir ? "" : "is-on"}`} onClick={() => setSide("prev")} title={`Na prévia: ${prev.title || "Sem título"}`} aria-label={`Na prévia: ${prev.title || "Sem título"}`}>
                        <span className="slides-dot is-prev" aria-hidden="true" /><span className="slides-tab-w" aria-hidden="true">Prévia</span><ClipTitle className="slides-tab-t" text={prev.title || "Sem título"} />
                    </button>
                </div>
            )}
            {!slides.length && <Empty icon="list" title="Nenhum item em mãos">Clique num item da Setlist ou da Biblioteca.</Empty>}
            <div ref={listRef} className="kx-cards" style={{ overflow: "auto", flex: 1 }}>
                {slides.map((sl, i) => {
                    let cls = "";
                    if (hand) cls = [i === index && "is-prev", i === airIndex && airWord].filter(Boolean).join(" ");
                    else cls = i === index ? airWord : i === index + 1 ? "is-next" : "";
                    const onAir = cls.includes(airWord);
                    return (
                        <button type="button" key={i} className={`kx-slide kx-t ${cls}`} aria-current={onAir ? "true" : undefined} onClick={() => pick(i)} onDoubleClick={() => go(i)}
                            onContextMenu={(e) => menu(e, { title: `Slide ${i + 1}`, items: [
                                menuItem("porNaPrevia", { disabled: !hand && i === index, onSelect: () => pick(i) }),
                                menuItem("enviarAoAr", { air: true, onSelect: () => go(i) }),
                            ] })} title={`${onAir ? "No ar" : "Pôr na prévia · 2 cliques enviam"}\n\n${sl.text || sl.label || ""}`}>
                            <span className="kx-slide-n">{i + 1}</span><SrState cls={cls} />
                            <SlideText slide={sl} />
                        </button>
                    );
                })}
            </div>
            {/* The footer's arrows always move what is on air (←/→). Under the
                Prévia's slides they say so — "No ar", the air's own n/m — apart
                from the column's "prévia n/m", and go away with nothing on air
                (the design audit, C-06): a click meant for the prepared item
                must not read as stepping it. ↑/↓ walk the Prévia. */}
            <div className="slidesnav">
                {hand ? airPos && (
                    <span className="slidesnav-air" role="group" aria-label="Slide no ar">
                        <span className="slidesnav-lab"><span className="slides-dot is-air" aria-hidden="true" />No ar</span>
                        <IconBtn name="skip-back" className="kx-btn-live" onClick={() => c.moveSlide(-1)} title="Slide anterior no ar · ←" />
                        <IconBtn name="skip-fwd" className="kx-btn-live" onClick={() => c.moveSlide(1)} title="Próximo slide no ar · →" />
                        <span className="kx-meta" title={`Slide ${air.index + 1} de ${air.slides.length} no ar`}>{airPos}</span>
                    </span>
                ) : (
                    <>
                        <Btn className="kx-btn-live" disabled={!airPos} onClick={() => c.moveSlide(-1)} title="Slide anterior no ar · ←"><Icon name="skip-back" />Anterior</Btn>
                        <Btn className="kx-btn-live" disabled={!airPos} onClick={() => c.moveSlide(1)} title="Próximo slide no ar · →">Próximo<Icon name="skip-fwd" /></Btn>
                    </>
                )}
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
    // A presentation's page (Rodada F3): its picture and its name.
    if (!slide.text && slide.image_url) {
        return (
            <span className="kx-slide-body is-page">
                <img className="kx-slide-page" src={slide.image_url} alt="" loading="lazy" draggable={false} />
                {label && <span className="kx-slide-lab">{label}</span>}
            </span>
        );
    }
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
