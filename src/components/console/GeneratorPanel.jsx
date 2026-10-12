import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Btn, IconBtn } from "./kx";
import { GENERATORS, PARAM_LABELS, generatorOf, presetsOf, presetArgs, startArgs, matchingPreset, generatorArgs, normalizeGenerator } from "@/lib/generators";
import { GENERATOR_PARAMS, MAX_COLORS } from "@shared/generators.mjs";

// Camadas › Fundo › Gerado (src/lib/generators.js): the generators as
// tiles, and for the one on air its presets, sliders and colours. Every
// change is a background.set on the live state, at most ten a second while
// a slider moves (the outputs follow each one; the console's monitors show
// the rest). Rows of the parent's .frm grid (a `k` label, then the control).
const SEND_MS = 100;

export function GeneratorTiles({ current, disabled, op }) {
    return (
        <div className="lyr-gens" role="group" aria-label="Fundos gerados">
            {GENERATORS.map((g) => (
                <button type="button" key={g.id} disabled={disabled} className={`kx-t lyr-gen ${current?.id === g.id ? "is-on" : ""}`} title={g.hint} aria-pressed={current?.id === g.id}
                    onClick={() => op("background.set", startArgs(g.id))}>
                    <i style={{ background: `linear-gradient(135deg, ${presetsOf(g.id)[0].gen.colors.join(", ")})` }} /><span>{g.name}</span>
                </button>
            ))}
        </div>
    );
}

export default function GeneratorPanel({ background, disabled, op }) {
    const gen = background.gen;
    const g = generatorOf(gen.id);
    // The sliders move a local copy and send it, trailing, every SEND_MS.
    const [draft, setDraft] = useState(gen);
    const timer = useRef(null);
    const pending = useRef(null);
    useEffect(() => { if (!pending.current) setDraft(gen); }, [gen]);
    useEffect(() => () => clearTimeout(timer.current), []);
    const send = (next) => {
        setDraft(next);
        pending.current = next;
        if (timer.current) return;
        timer.current = setTimeout(() => {
            timer.current = null;
            const n = pending.current;
            pending.current = null;
            if (n) op("background.set", { ...background, ...generatorArgs(n, matchingPreset(n) ? `${g.name} · ${matchingPreset(n).name}` : g.name) });
        }, SEND_MS);
    };
    const set = (k, v) => send(normalizeGenerator({ ...draft, [k]: v }));
    const setColor = (i, v) => send(normalizeGenerator({ ...draft, colors: draft.colors.map((c, k) => (k === i ? v : c)) }));
    const preset = matchingPreset(draft);
    return (
        <>
            <span className="k">Presets</span>
            <div className="lyr-presets">
                {presetsOf(g.id).map((p) => <button type="button" key={p.id} disabled={disabled} className={`kx-t lyr-preset ${preset?.id === p.id ? "is-on" : ""}`} aria-pressed={preset?.id === p.id} onClick={() => op("background.set", { ...background, ...presetArgs(p) })}><i style={{ background: `linear-gradient(135deg, ${p.gen.colors.join(", ")})` }} />{p.name}</button>)}
            </div>
            {PARAM_LABELS.filter(([k]) => g.params.includes(k)).map(([k, label, step]) => (
                <React.Fragment key={k}>
                    <span className="k">{label}</span>
                    <span className="lyr-slider">
                        <input type="range" className="ap-range" disabled={disabled} min={GENERATOR_PARAMS[k][0]} max={GENERATOR_PARAMS[k][1]} step={step} value={draft[k]} onChange={(e) => set(k, Number(e.target.value))} aria-label={`${label} do fundo gerado`} />
                        <span className="kx-meta">{k === "detail" ? draft[k] : k === "intensity" || k === "contrast" || k === "persistence" ? `${Math.round(draft[k] * 100)}%` : `${draft[k]}×`}</span>
                    </span>
                </React.Fragment>
            ))}
            <span className="k">Cores</span>
            <span className="lyr-colors">
                {draft.colors.map((c, i) => (
                    <span key={i} className="lyr-color">
                        <input type="color" className="ed-color" disabled={disabled} value={c} onChange={(e) => setColor(i, e.target.value)} aria-label={`Cor ${i + 1} do fundo gerado`} title={c} />
                        {draft.colors.length > 1 && <IconBtn name="x" small title="Tirar esta cor" disabled={disabled} onClick={() => send(normalizeGenerator({ ...draft, colors: draft.colors.filter((_, k) => k !== i) }))} />}
                    </span>
                ))}
                {draft.colors.length < MAX_COLORS && <Btn small disabled={disabled} onClick={() => send(normalizeGenerator({ ...draft, colors: [...draft.colors, "#ffffff"] }))}><Icon name="plus" />Cor</Btn>}
            </span>
            <span className="k">Áudio-reativo</span>
            <span className="kx-meta">Desligado · em breve: seguir o som do programa</span>
        </>
    );
}
