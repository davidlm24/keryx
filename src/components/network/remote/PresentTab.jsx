import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { airHeader, canRun, onAirNow, presentRows, setlistRows, TAG_TEXT } from "@/lib/network/remoteView";
import { Cmd } from "./parts";
import { FollowCard, SetlistStrip, TimerCard } from "./liveParts";

// Apresentar (owner 2026-10-28, M3 = A): what is on air, big — every slide
// of the item as a card with its whole text, one column, the one on air
// green and kept in view, the next with the grey ring; a tap goes to that
// slide. The controls are the dock under it (ControlDock). At the bottom the
// Setlist strip, Item anterior | Próximo item (vistoria 2026-11-07, P1 = A).
// With no slides on air (a video, an audio, a picture: P2 = A) the Setlist
// itself fills the page around the item on air: a tap picks an item and the
// strip's gold side sends it — never a send by a stray tap, as the Setlist
// tab. With nothing on air: the strip, or back to the Biblioteca.
export default function PresentTab({ live, state, caps, c, onLibrary }) {
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
    const goto = canRun(caps, "goto");
    const setlist = rows.length ? [] : setlistRows(state, live);
    const picked = setlist.find((r) => r.id === pick && !r.section) || null;
    const service = typeof state?.service === "string" ? state.service : state?.service?.title || "";
    return (
        <div className="rm-main is-split">
            <div className="rm-scroll rm-present" ref={box}>
                <div className="rm-pttl">
                    <b>{content?.title || (setlist.length ? service || "Setlist" : h.title)}</b>
                    {rows.length > 1 && <small>{rows.length} slides</small>}
                </div>
                <FollowCard content={content} caps={caps} c={c} />
                <TimerCard live={live} caps={caps} c={c} />
                {rows.length > 0 && (
                    <div className="rm-slides">
                        {rows.map((r) => (
                            <Cmd key={r.i} c={c} k={`goto-${r.i}`} action="goto" args={{ index: r.i }} className={`rm-slide is-${r.state || "rest"}`} disabled={!goto} pressed={r.state === "air"}>
                                <span className="rm-slide-k"><span>{r.label}</span>{r.state === "air" ? "No ar" : r.state === "next" ? "Próximo" : ""}</span>
                                <span className="rm-slide-t">{r.text}</span>
                            </Cmd>
                        ))}
                    </div>
                )}
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
