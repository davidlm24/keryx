import React from "react";
import Icon from "../Icon";
import { Btn } from "../kx";
import { cleanSpec, bgLabel } from "@/lib/console/backgroundSpec";
import { cssFallback, GENERATORS } from "@/lib/generators";
import { useLibraryPicker } from "./libraryContext";

const GEN_NAMES = Object.fromEntries(GENERATORS.map((g) => [g.id, g.name]));

// A background as a small tile (a picture, a clip, a generated one's
// colours, a colour), for the rows that show what is chosen.
export function BgThumb({ spec }) {
    const s = cleanSpec(spec);
    if (!s) return <span className="bgchip-t is-none" />;
    if (s.kind === "image") return <span className="bgchip-t"><img src={s.value} alt="" /></span>;
    if (s.kind === "video") return <span className="bgchip-t is-video"><Icon name="film" size={14} /></span>;
    if (s.kind === "generator") return <span className="bgchip-t" style={{ background: cssFallback(s.gen) }} />;
    return <span className="bgchip-t" style={{ background: s.value }} />;
}

// What is chosen and a button that opens the background library (the one
// picker for every background). onPick(spec | null): null is "Sem fundo".
//   accept     kinds offered (default: all four)
//   noneLabel  the library's "no background" button (none when omitted)
//   empty      what the row says with nothing chosen
export default function BgChip({ value, onPick, accept, title, noneLabel, empty = "nenhum", names = {}, disabled, label = "Escolher…" }) {
    const pick = useLibraryPicker();
    const s = cleanSpec(value);
    const open = async () => {
        const r = await pick({ accept: accept || ["image", "video", "generator", "color"], value: s, title, allowNone: Boolean(noneLabel), noneLabel });
        if (r?.none) onPick(null);
        else if (r?.spec) onPick(r.spec);
    };
    return (
        <span className="bgchip">
            <BgThumb spec={s} />
            <span className="bgchip-l">{s ? names[s.value] || bgLabel(s, GEN_NAMES) : empty}</span>
            <Btn small disabled={disabled} onClick={open}>{s ? "Trocar…" : label}</Btn>
        </span>
    );
}
