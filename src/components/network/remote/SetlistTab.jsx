import React, { useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { allowed, setlistRows, TAG_TEXT } from "@/lib/network/remoteView";
import { Cmd } from "./parts";

// The Setlist (owner's pick "escolher"): a tap picks an item, then the sticky
// "Enviar ao ar · título" sends it — never a send by a stray tap. Sections
// are headers; the item on air, the next and the last sent are marked; a
// file missing, still downloading or a presentation still being prepared
// cannot be picked. The list opens on the item on air.
export default function SetlistTab({ live, state, c }) {
    const [pick, setPick] = useState(null);
    const rows = setlistRows(state, live);
    const picked = rows.find((r) => r.id === pick && !r.section) || null;
    const list = useRef(null);
    const airId = state?.airItemId || null;
    useEffect(() => {
        if (!airId) return;
        list.current?.querySelector(`[data-id="${CSS.escape(airId)}"]`)?.scrollIntoView({ block: "center" });
    }, [airId]);
    // What was picked and then left the Setlist is no longer picked.
    useEffect(() => { if (pick && !rows.some((r) => r.id === pick)) setPick(null); }, [pick, rows]);

    const service = typeof state?.service === "string" ? state.service : state?.service?.title || "";
    if (!state) return <div className="rm-main"><p className="rm-empty">Lendo a setlist…</p></div>;
    if (!rows.length) return <div className="rm-main"><p className="rm-empty">{service ? `${service}: nenhum item na setlist.` : "Nenhum culto escolhido no console."}</p></div>;
    const canPick = allowed("sendItem", { itemId: "x" }, c.flags);
    return (
        <div className="rm-main" ref={list}>
            {service && <h2 className="rm-sec is-top">{service}</h2>}
            <ul className="rm-list" role="list">
                {rows.map((r) => (r.section
                    ? <li key={r.id} className="rm-sec">{r.title}</li>
                    : (
                        <li key={r.id}>
                            <button
                                type="button"
                                data-id={r.id}
                                className={`rm-item ${r.id === pick ? "is-sel" : ""} ${r.tag === "air" ? "is-air" : ""}`}
                                aria-pressed={r.id === pick}
                                disabled={!canPick || Boolean(r.st)}
                                onClick={() => setPick(r.id === pick ? null : r.id)}
                            >
                                <Icon name={r.icon} size={18} />
                                <span className="rm-item-t"><b>{r.title}</b>{r.sub && <small>{r.sub}</small>}</span>
                                {r.st ? <span className="rm-tag is-warn">{r.stText}</span> : r.tag && <span className={`rm-tag is-${r.tag}`}>{TAG_TEXT[r.tag]}</span>}
                            </button>
                        </li>
                    )))}
            </ul>
            {state.truncated && <p className="rm-hint">A setlist continua no computador.</p>}
            <div className="rm-sticky">
                {picked
                    ? <Cmd c={c} k="sendItem" action="sendItem" args={{ itemId: picked.id }} className="is-go is-wide" then={() => setPick(null)}>Enviar ao ar · {picked.title}</Cmd>
                    : <p className="rm-hint">Toque num item para escolher.</p>}
            </div>
        </div>
    );
}
