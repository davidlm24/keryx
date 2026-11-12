import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Btn, IconBtn, Seg } from "./kx";
import { Switch } from "./settings/parts";
import GeneratorBackground from "@/components/screen/GeneratorBackground";
import { GENERATORS, PARAM_LABELS, generatorOf, presetsOf, presetArgs, startArgs, matchingPreset, generatorArgs, normalizeGenerator, presetSwatch, secondColors } from "@/lib/generators";
import { GENERATOR_PARAMS, MAX_COLORS } from "@shared/generators.mjs";

// Degradê pela tela: where the first colours turn into the second.
// Short words (the panel's column is narrow), the whole one in the tooltip.
const BLEND_OPTIONS = [["h", "Horiz.", { title: "Horizontal: da esquerda para a direita" }], ["v", "Vert.", { title: "Vertical: de cima para baixo" }], ["d", "Diag.", { title: "Diagonal" }], ["move", "Mover", { title: "Em movimento: duas manchas que se movem devagar" }]];

// Camadas › Fundo › Gerado (src/lib/generators.js): the generators as
// tiles, and for the one on air its presets (round dots, as colourways),
// sliders, colours (one to five) and the degradê pela tela (a second set
// of colours and its direction). Every
// change is a background.set on the live state, at most ten a second while
// a slider moves (the outputs follow each one; the console's monitors show
// the rest). Three columns of `k` label / control rows (`.lib-gen-ctl`);
// `extra` is the host's own rows for the last one (the library's Escurecer).
const SEND_MS = 100;

export function GeneratorTiles({ current, disabled, op }) {
    return (
        <div className="lyr-gens" role="group" aria-label="Fundos gerados">
            {GENERATORS.map((g) => (
                <button type="button" key={g.id} disabled={disabled} className={`kx-t lyr-gen ${current?.id === g.id ? "is-on" : ""}`} title={g.hint} aria-pressed={current?.id === g.id}
                    onClick={() => op("background.set", startArgs(g.id))}>
                    {/* A still frame of the look itself (its first colours), not a gradient of them. */}
                    <i><GeneratorBackground gen={presetsOf(g.id)[0].gen} animate={false} /></i><span>{g.name}</span>
                </button>
            ))}
        </div>
    );
}

export default function GeneratorPanel({ background, disabled, op, extra = null }) {
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
    const setList = (key, list) => send(normalizeGenerator({ ...draft, [key]: list }));
    const preset = matchingPreset(draft);
    const presets = presetsOf(g.id);
    const colorRow = (key, list, what) => (
        <span className="lyr-colors">
            {list.map((c, i) => (
                <span key={i} className="lyr-color">
                    <input type="color" className="ed-color" disabled={disabled} value={c} onChange={(e) => setList(key, list.map((x, k) => (k === i ? e.target.value : x)))} aria-label={`${what} ${i + 1} do fundo gerado`} title={c} />
                    {list.length > 1 && <IconBtn name="x" small title="Tirar esta cor" disabled={disabled} onClick={() => setList(key, list.filter((_, k) => k !== i))} />}
                </span>
            ))}
            {list.length < MAX_COLORS && <Btn small disabled={disabled} onClick={() => setList(key, [...list, list[list.length - 1] || "#ffffff"])}><Icon name="plus" />Cor</Btn>}
        </span>
    );
    // Three columns under the big sample, always on screen (owner
    // 2026-11-12): the colours, the movement, the rest (+ the host's extra).
    return (
        <div className="lib-gen-ctl">
            <div className="layerprops lib-gen-col">
                <span className="k">Cores prontas</span>
                <span className="lyr-dotrow">
                    <span className="lyr-dots" role="group" aria-label="Cores prontas">
                        {presets.map((p) => <button type="button" key={p.id} disabled={disabled} className={`lyr-dot ${preset?.id === p.id ? "is-on" : ""}`} aria-pressed={preset?.id === p.id} title={p.name} aria-label={p.name} style={{ background: presetSwatch(p.gen) }} onClick={() => op("background.set", { ...background, ...presetArgs(p) })} />)}
                    </span>
                    <span className="kx-meta">{preset ? preset.name : "Personalizado"}</span>
                </span>
                <span className="k">Cores</span>
                {colorRow("colors", draft.colors, "Cor")}
                <span className="k">Degradê</span>
                <span className="lyr-slider">
                    <Switch on={Boolean(draft.colors2)} disabled={disabled} onChange={(on) => send(normalizeGenerator({ ...draft, colors2: on ? secondColors(draft.colors) : [] }))} label="Degradê pela tela" />
                    {draft.colors2
                        ? <Seg small label="Direção do degradê" value={draft.blend} options={BLEND_OPTIONS} onChange={(v) => send(normalizeGenerator({ ...draft, blend: v }))} />
                        : <span className="kx-meta">desligado</span>}
                </span>
                {draft.colors2 && <>
                    <span className="k">Segundas cores</span>
                    {colorRow("colors2", draft.colors2, "Segunda cor")}
                </>}
            </div>
            <div className="layerprops lib-gen-col">
                {PARAM_LABELS.filter(([k]) => g.params.includes(k)).map(([k, label, step]) => (
                    <React.Fragment key={k}>
                        <span className="k">{label}</span>
                        <span className="lyr-slider">
                            <input type="range" className="ap-range" disabled={disabled} min={GENERATOR_PARAMS[k][0]} max={GENERATOR_PARAMS[k][1]} step={step} value={draft[k]} onChange={(e) => set(k, Number(e.target.value))} aria-label={`${label} do fundo gerado`} />
                            <span className="kx-meta">{k === "detail" ? draft[k] : k === "intensity" || k === "contrast" || k === "persistence" ? `${Math.round(draft[k] * 100)}%` : `${draft[k]}×`}</span>
                        </span>
                    </React.Fragment>
                ))}
            </div>
            <div className="layerprops lib-gen-col">
                <span className="k">Áudio-reativo</span>
                <span className="lyr-slider" title="Segue o som que sai do computador (o dos medidores); só nas saídas deste computador, não nas telas na rede">
                    <Switch on={draft.audio} disabled={disabled} onChange={(on) => send(normalizeGenerator({ ...draft, audio: on }))} label="Seguir o som que sai do computador" />
                    <span className="kx-meta">{draft.audio ? "segue o som" : "desligado"}</span>
                </span>
                {extra}
            </div>
        </div>
    );
}
