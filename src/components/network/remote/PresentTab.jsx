import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { airHeader, arrowLabels, canRun, nowBarInfo, onAirNow, presentRows, setlistRows, TAG_TEXT } from "@/lib/network/remoteView";
import { Cmd } from "./parts";
import { FollowCard, SetlistStrip, TimerCard } from "./liveParts";
import AirSlides from "./AirSlides";

// Apresentar (owner 2026-10-28, M3 = A): what is on air, big — every slide
// of the item as a card with its whole text, one column, the one on air
// green and kept in view, the next with the grey ring; a tap goes to that
// slide. The controls are the dock under it (ControlDock). At the bottom the
// Setlist strip, Item anterior | Próximo item (vistoria 2026-11-07, P1 = A).
// With no slides on air (a video, an audio, a picture: P2 = A) the Setlist
// itself fills the page around the item on air: a tap picks an item and the
// strip's gold side sends it — never a send by a stray tap, as the Setlist
// tab. With nothing on air: the strip, or back to the Biblioteca.
// No ar is the Presenter (owner 2026-11-08, "mais simples" N7 = A, as in
// Holyrics): with slides on air, the slide on air big on a stage, the next
// under it, Anterior | Próximo big (the dock's arrows give way, remote.css
// .is-presenter), "Slides" for every slide as cards, then the Setlist strip.
export default function PresentTab({ live, state, caps, c, onLibrary }) {
    const [all, setAll] = useState(false);
    const content = live?.content || null;
    const rows = presentRows(content);
    const h = airHeader(live);
    const box = useRef(null);
    const at = content?.index || 0;
    const [pick, setPick] = useState(null);
    // The card on air stays in view as the slides move (from here, the
    // dock's arrows or the console).
    useEffect(() => {
        box.current?.querySelector(".rm-slide.is-air, .rm-item.is-air")?.scrollIntoView({ block: "center" });
    }, [at, content?.startedAt, state?.airItemId]);

    if (!live || !onAirNow(live)) {
        return (
            <div className="rm-main rm-pempty">
                <span className="rm-pring" aria-hidden="true"><Icon name="monitor" size={26} /></span>
                <b>Nada no ar</b>
                <span>O que for ao ar aparece aqui, com todos os slides para tocar.</span>
                <div className="rm-pstack">
                    <SetlistStrip state={state} caps={caps} c={c} />
                    {canRun(caps, "library") && <button type="button" className="rm-b" onClick={onLibrary}><Icon name="media" size={20} />Abrir a Biblioteca</button>}
                </div>
            </div>
        );
    }
    const setlist = rows.length ? [] : setlistRows(state, live);
    const picked = setlist.find((r) => r.id === pick && !r.section) || null;
    const service = typeof state?.service === "string" ? state.service : state?.service?.title || "";
    if (rows.length > 0) {
        const cur = rows.find((r) => r.state === "air") || rows[0];
        const next = rows.find((r) => r.state === "next") || null;
        const n = nowBarInfo(live);
        const label = arrowLabels(content);
        const arrows = canRun(caps, "next");
        return (
            <div className="rm-main is-split rm-presenter">
                <div className="rm-scroll" ref={box}>
                    <div className="rm-pttl">
                        <b>{content?.title || h.title}</b>
                        {rows.length > 1 && <small>{cur.i + 1}/{rows.length}</small>}
                    </div>
                    {all
                        ? <AirSlides live={live} caps={caps} c={c} />
                        : (
                            <>
                                <div className="rm-stage" aria-live="polite">
                                    <span className="rm-stage-k">{cur.label} · No ar</span>
                                    <p className="rm-stage-t">{cur.text}</p>
                                </div>
                                {next && (
                                    <div className="rm-nextc">
                                        <span className="rm-k">Próximo · {next.label}</span>
                                        <span className="rm-nextc-t">{next.text}</span>
                                    </div>
                                )}
                            </>
                        )}
                    <FollowCard content={content} caps={caps} c={c} />
                    <TimerCard live={live} caps={caps} c={c} />
                </div>
                <div className="rm-foot rm-pfoot">
                    {arrows && (
                        <div className="rm-huge">
                            <Cmd c={c} action="prev" label="Slide anterior"><Icon name="chevron-left" size={28} />{label.prev}</Cmd>
                            <Cmd c={c} action="next" className="is-go" label={n?.reveal ? "Revelar" : "Próximo slide"}>{n?.reveal ? "Revelar" : label.next}<Icon name="chevron-right" size={28} /></Cmd>
                        </div>
                    )}
                    <div className="rm-pair">
                        <button type="button" className="rm-b is-sm" aria-pressed={all} onClick={() => setAll((v) => !v)}><Icon name={all ? "monitor" : "list"} size={18} />{all ? "Slide no ar" : "Slides"}</button>
                    </div>
                    <SetlistStrip state={state} caps={caps} c={c} />
                </div>
            </div>
        );
    }
    return (
        <div className="rm-main is-split">
            <div className="rm-scroll rm-present" ref={box}>
                <div className="rm-pttl">
                    <b>{content?.title || (setlist.length ? service || "Setlist" : h.title)}</b>
                </div>
                <TimerCard live={live} caps={caps} c={c} />
                {!rows.length && setlist.length > 0 && (
                    <ul className="rm-list" role="list" aria-label="Setlist">
                        {setlist.map((r) => (r.section
                            ? <li key={r.id} className="rm-sec">{r.title}</li>
                            : (
                                <li key={r.id}>
                                    <button type="button" className={`rm-item ${r.id === pick ? "is-sel" : ""} ${r.tag === "air" ? "is-air" : ""}`} aria-pressed={r.id === pick} disabled={Boolean(r.st)} onClick={() => setPick(r.id === pick ? null : r.id)}>
                                        <Icon name={r.icon} size={18} />
                                        <span className="rm-item-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                                        {r.st ? <span className="rm-tag is-warn">{r.stText}</span> : r.tag && <span className={`rm-tag is-${r.tag}`}>{TAG_TEXT[r.tag]}</span>}
                                    </button>
                                </li>
                            )))}
                    </ul>
                )}
                {!rows.length && !setlist.length && (
                    <div className="rm-card">
                        <span className="rm-k">No ar</span>
                        <span className="rm-v">{h.title}</span>
                    </div>
                )}
                {!rows.length && setlist.length > 0 && <p className="rm-hint">{picked ? "Toque de novo para desmarcar." : "Toque num item para escolher."}</p>}
            </div>
            <div className="rm-foot">
                <SetlistStrip state={state} caps={caps} c={c} picked={picked} onSent={() => setPick(null)} />
            </div>
        </div>
    );
}
