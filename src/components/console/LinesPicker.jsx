import React, { useEffect, useState } from "react";
import { Seg } from "./kx";
import { MAX_LINES, linesLimit } from "@/lib/songImport";

// How lyrics become slides: Estrofe (0), 2 or 4 lines, or any other limit
// from 1 to 12 (Outro, with its number beside). The song editor's split
// and the import preference. value/onChange: a number.
const PRESETS = [0, 2, 4];
export default function LinesPicker({ value, onChange, label = "Linhas por slide", titles = {} }) {
    const n = linesLimit(value);
    const custom = !PRESETS.includes(n);
    const [text, setText] = useState(String(custom ? n : 3));
    useEffect(() => { if (custom) setText(String(n)); }, [n, custom]);
    const options = [
        ["0", "Estrofe", { title: titles.stanza || "Uma estrofe por slide" }],
        ["2", "2 linhas", { title: "No máximo 2 linhas por slide" }],
        ["4", "4 linhas", { title: "No máximo 4 linhas por slide" }],
        ["n", "Outro", { title: `Outro limite, de 1 a ${MAX_LINES} linhas por slide` }],
    ];
    const pick = (v) => onChange(v === "n" ? linesLimit(text) || 3 : Number(v));
    const type = (v) => {
        setText(v);
        const next = linesLimit(v);
        if (next) onChange(next);
    };
    return (
        <span className="lines-pick">
            <Seg small label={label} value={custom ? "n" : String(n)} onChange={pick} options={options} />
            {custom && <input type="number" min="1" max={MAX_LINES} className="qt-min" value={text} onChange={(e) => type(e.target.value)} onBlur={() => setText(String(n))} aria-label="Linhas por slide" title={`Linhas por slide (1 a ${MAX_LINES})`} />}
        </span>
    );
}
