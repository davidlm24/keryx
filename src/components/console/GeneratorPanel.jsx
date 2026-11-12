import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "./Icon";
import { Btn, IconBtn, Seg } from "./kx";
import { Switch } from "./settings/parts";
import ColorPop from "./ColorPop";
import GeneratorBackground from "@/components/screen/GeneratorBackground";
import { GENERATORS, PARAM_LABELS, generatorOf, presetsOf, presetArgs, startArgs, matchingPreset, generatorArgs, normalizeGenerator, presetSwatch, secondColors } from "@/lib/generators";
import { GENERATOR_PARAMS, MAX_COLORS, BLEND_POS, BLEND_WIDTH } from "@shared/generators.mjs";

// Degradê pela tela: where the first colours turn into the second.
// Short words (the panel's column is narrow), the whole one in the tooltip.
const BLEND_OPTIONS = [["h", "Horiz.", { title: "Horizontal: da esquerda para a direita" }], ["v", "Vert.", { title: "Vertical: de cima para baixo" }], ["d", "Diag.", { title: "Diagonal" }], ["move", "Mover", { title: "Em movimento: duas manchas que se movem devagar" }]];

// Camadas › Fundo › Gerado (src/lib/generators.js): the generators as
// tiles, and for the one on air its presets (round dots, as colourways),
// sliders, colours (one to five) and the degradê pela tela (a second set
// of colours, its direction, and where the turn sits: Posição e Largura,
// G4 = A — hidden for Mover, which keeps its own drifting window). Every
// change is a background.set on the live state, at most ten a second while
// a slider moves (the outputs follow each one; the console's monitors show
// the rest). The band is two rows (owner 2026-11-12, G1 = A): the colours
// beside the wide sliders, then the toggles below — `extra` is the host's
// own toggle for that line (the library's Escurecer). Each colour chip
// opens the ColorPop and moves by its grip (drag, or ← → on it) or the
// hover arrows (G2 = A): the order runs dark → light along the pattern.
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
    const draftRef = useRef(draft);
    draftRef.current = draft;
    const set = (k, v) => send(normalizeGenerator({ ...draftRef.current, [k]: v }));
    const setList = (key, list) => send(normalizeGenerator({ ...draftRef.current, [key]: list }));
    const move = (key, from, to) => {
        const list = draftRef.current[key] || [];
        if (to < 0 || to >= list.length || from === to) return;
        const next = list.slice();
        const [c] = next.splice(from, 1);
        next.splice(to, 0, c);
        setList(key, next);
    };
    // Drag a chip's grip to reorder (G2): the colour follows the pointer,
    // swapping with the chip whose middle is nearest.
    const gripDown = (key, start) => (e) => {
        if (disabled || e.button !== 0) return;
        e.preventDefault();
        const row = e.currentTarget.closest(".lyr-colors");
        let at = start;
        const onMove = (ev) => {
            const centers = [...row.querySelectorAll(".cp-chip")].map((el) => { const r = el.getBoundingClientRect(); return r.left + r.width / 2; });
            let to = at, best = Infinity;
            centers.forEach((x, k) => { const d = Math.abs(ev.clientX - x); if (d < best) { best = d; to = k; } });
            if (to !== at) { move(key, at, to); at = to; }
        };
        const onUp = () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); };
        window.addEventListener("pointermove", onMove);
        window.addEventListener("pointerup", onUp);
    };
    const preset = matchingPreset(draft);
    const presets = presetsOf(g.id);
    // The ColorPop's ready swatches: this look's palettes and the colours in use.
    const palette = useMemo(() => [...presets.flatMap((p) => [...(p.gen.colors || []), ...(p.gen.colors2 || [])]), ...(draft.colors || []), ...(draft.colors2 || [])], [presets, draft]);
    const colorRow = (key, list, what) => (
        <span className="lyr-colors">
            {list.map((c, i) => (
                <span key={i} className="cp-chip">
                    <button type="button" className="kx-t cp-grip" disabled={disabled} title="Arraste para mudar a cor de lugar (ou ← e →)" aria-label={`Mover ${what.toLowerCase()} ${i + 1}`} onPointerDown={gripDown(key, i)}
                        onKeyDown={(e) => { if (e.key === "ArrowLeft") { e.preventDefault(); move(key, i, i - 1); } else if (e.key === "ArrowRight") { e.preventDefault(); move(key, i, i + 1); } }}><Icon name="grip" size={12} /></button>
                    <ColorPop value={c} disabled={disabled} label={`${what} ${i + 1} do fundo gerado`} swatches={palette} onChange={(v) => setList(key, (draftRef.current[key] || []).map((x, k) => (k === i ? v : x)))} />
                    <span className="cp-arr">
                        <IconBtn name="chevron-left" small title="Para a esquerda" disabled={disabled || i === 0} onClick={() => move(key, i, i - 1)} />
                        <IconBtn name="chevron-right" small title="Para a direita" disabled={disabled || i === list.length - 1} onClick={() => move(key, i, i + 1)} />
                    </span>
                    {list.length > 1 && <IconBtn name="x" small title="Tirar esta cor" disabled={disabled} onClick={() => setList(key, list.filter((_, k) => k !== i))} />}
                </span>
            ))}
            {list.length < MAX_COLORS && <Btn small disabled={disabled} onClick={() => setList(key, [...list, list[list.length - 1] || "#ffffff"])}><Icon name="plus" />Cor</Btn>}
        </span>
    );
    // The full-width band (G1 = A): the colours beside the wide sliders,
    // then the toggles (Áudio-reativo + the host's extra) on their own line.
    return (
        <div className="lib-gen-ctl">
          <div className="lib-gen-row1">
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
                {draft.colors2 && draft.blend !== "move" && <>
                    <span className="k">Posição</span>
                    <span className="lyr-slider" title="Onde o degradê vira, ao longo da direção">
                        <input type="range" className="ap-range" disabled={disabled} min={BLEND_POS[0]} max={BLEND_POS[1]} step={0.01} value={draft.blendPos ?? BLEND_POS[2]} onChange={(e) => set("blendPos", Number(e.target.value))} aria-label="Posição do degradê" />
                        <span className="kx-meta">{Math.round((draft.blendPos ?? BLEND_POS[2]) * 100)}%</span>
                    </span>
                    <span className="k">Largura</span>
                    <span className="lyr-slider" title="O quão suave é a passagem entre as cores">
                        <input type="range" className="ap-range" disabled={disabled} min={BLEND_WIDTH[0]} max={BLEND_WIDTH[1]} step={0.01} value={draft.blendWidth ?? BLEND_WIDTH[2]} onChange={(e) => set("blendWidth", Number(e.target.value))} aria-label="Largura do degradê" />
                        <span className="kx-meta">{Math.round((draft.blendWidth ?? BLEND_WIDTH[2]) * 100)}%</span>
                    </span>
                </>}
            </div>
            <div className="layerprops lib-gen-col lib-gen-sl">
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
          </div>
          <div className="lib-gen-row2">
            <span className="lib-gen-tog" title="Segue o som que sai do computador (o dos medidores); só nas saídas deste computador, não nas telas na rede">
                <span className="k">Áudio-reativo</span>
                <Switch on={draft.audio} disabled={disabled} onChange={(on) => send(normalizeGenerator({ ...draft, audio: on }))} label="Seguir o som que sai do computador" />
                <span className="kx-meta">{draft.audio ? "segue o som" : "desligado"}</span>
            </span>
            {extra}
          </div>
        </div>
    );
}
