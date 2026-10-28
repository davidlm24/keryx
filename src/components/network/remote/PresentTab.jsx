import React, { useEffect, useRef } from "react";
import Icon from "@/components/console/Icon";
import { airHeader, canRun, onAirNow, presentRows } from "@/lib/network/remoteView";
import { Cmd } from "./parts";
import { FollowCard, SendNext, TimerCard } from "./liveParts";

// Apresentar (owner 2026-10-28, M3 = A): what is on air, big — every slide
// of the item as a card with its whole text, one column, the one on air
// green and kept in view, the next with the grey ring; a tap goes to that
// slide. The controls are the dock under it (ControlDock, open here). With
// nothing on air: Enviar o próximo da setlist, or back to the Biblioteca.
export default function PresentTab({ live, state, caps, c, onLibrary }) {
    const content = live?.content || null;
    const rows = presentRows(content);
    const h = airHeader(live);
    const box = useRef(null);
    const at = content?.index || 0;
    // The card on air stays in view as the slides move (from here, the
    // dock's arrows or the console).
    useEffect(() => {
        box.current?.querySelector(".rm-slide.is-air")?.scrollIntoView({ block: "center" });
    }, [at, content?.startedAt]);

    if (!live || !onAirNow(live)) {
        return (
            <div className="rm-main rm-pempty">
                <span className="rm-pring" aria-hidden="true"><Icon name="monitor" size={26} /></span>
                <b>Nada no ar</b>
                <span>O que for ao ar aparece aqui, com todos os slides para tocar.</span>
                <div className="rm-pstack">
                    <SendNext state={state} caps={caps} c={c} />
                    {canRun(caps, "library") && <button type="button" className="rm-b" onClick={onLibrary}><Icon name="media" size={20} />Abrir a Biblioteca</button>}
                </div>
            </div>
        );
    }
    const goto = canRun(caps, "goto");
    return (
        <div className="rm-main rm-present" ref={box}>
            <div className="rm-pttl">
                <b>{content?.title || h.title}</b>
                {rows.length > 1 && <small>{rows.length} slides</small>}
            </div>
            <FollowCard content={content} caps={caps} c={c} />
            <TimerCard live={live} caps={caps} c={c} />
            {rows.length > 0
                ? (
                    <div className="rm-slides">
                        {rows.map((r) => (
                            <Cmd key={r.i} c={c} k={`goto-${r.i}`} action="goto" args={{ index: r.i }} className={`rm-slide is-${r.state || "rest"}`} quiet disabled={!goto} pressed={r.state === "air"}>
                                <span className="rm-slide-k"><span>{r.label}</span>{r.state === "air" ? "No ar" : r.state === "next" ? "Próximo" : ""}</span>
                                <span className="rm-slide-t">{r.text}</span>
                            </Cmd>
                        ))}
                    </div>
                )
                : (
                    <div className="rm-card">
                        <span className="rm-k">No ar</span>
                        <span className="rm-v">{h.title}</span>
                    </div>
                )}
            <SendNext state={state} caps={caps} c={c} />
        </div>
    );
}
