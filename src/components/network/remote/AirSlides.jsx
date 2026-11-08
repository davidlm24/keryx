import React, { useEffect, useRef } from "react";
import { canRun, presentRows } from "@/lib/network/remoteView";
import { Cmd } from "./parts";

// The slides of the item on air as cards, the one on air green and kept in
// view, the next with the grey ring; a tap goes to that slide (owner
// 2026-11-08, "mais simples" N7 = A: the Biblioteca shows the song it sent
// right there, and No ar's Presenter opens them under "Slides").
export default function AirSlides({ live, caps, c }) {
    const content = live?.content || null;
    const rows = presentRows(content);
    const box = useRef(null);
    const at = content?.index || 0;
    useEffect(() => {
        box.current?.querySelector(".rm-slide.is-air")?.scrollIntoView({ block: "center" });
    }, [at, content?.startedAt]);
    if (!rows.length) return null;
    const goto = canRun(caps, "goto");
    return (
        <div className="rm-slides" ref={box}>
            {rows.map((r) => (
                <Cmd key={r.i} c={c} k={`goto-${r.i}`} action="goto" args={{ index: r.i }} className={`rm-slide is-${r.state || "rest"}`} disabled={!goto} pressed={r.state === "air"}>
                    <span className="rm-slide-k"><span>{r.label}</span>{r.state === "air" ? "No ar" : r.state === "next" ? "Próximo" : ""}</span>
                    <span className="rm-slide-t">{r.text}</span>
                </Cmd>
            ))}
        </div>
    );
}
