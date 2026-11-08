// Fundos gerados (2026-10-12, as ProPresenter's generated backgrounds): a
// background the screens compute as they go — slow marble veins, drifting
// clouds, an aurora, bokeh lights, a living gradient, rising particles,
// rays of light, a starry sky, mist — described by a
// generator id and a few numbers, never a file. The live state carries it
// as `background: { kind: "generator", value: <id>, gen: {...} }`
// (live-state.mjs); the shaders and the presets are src/lib/generators.js
// (the renderer's), this module only says what the numbers are, so the
// main process can check an op without the shaders. Pure, shared.

export const GENERATOR_IDS = ["fluid", "clouds", "aurora", "bokeh", "gradient", "particles", "rays", "stars", "mist"];

// Each parameter: [min, max, default]. Not every generator uses every one
// (src/lib/generators.js says which); unused ones are kept at the default.
export const GENERATOR_PARAMS = {
    speed: [0, 2, 0.3],        // Velocidade: how fast it moves (0 freezes it)
    scale: [0.5, 8, 3],        // Escala: how many features across the screen
    intensity: [0, 1, 0.8],    // Intensidade: how much the pattern shows over the first colour
    detail: [1, 8, 5],         // Detalhe: noise octaves (integer)
    spacing: [1.5, 3.5, 2],    // Espaçamento: lacunarity, the gap between octaves
    persistence: [0.2, 0.8, 0.5], // Persistência: gain, how much each octave keeps
    contrast: [0, 1, 0.4],     // Contraste: pushes the pattern apart from its middle
};
export const PARAM_IDS = Object.keys(GENERATOR_PARAMS);
export const MAX_COLORS = 3;
export const DEFAULT_COLORS = ["#0b1a30", "#5b8fc9", "#b9d4ee"];

const HEX6 = /^#[0-9a-f]{6}$/i;
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// A generator as the screens draw it: every parameter present and in range
// (a wild value is clamped, not refused), colours valid hex, one to three.
// `id` is checked by the caller (GENERATOR_IDS).
export function normalizeGenerator(raw = {}) {
    const r = raw && typeof raw === "object" ? raw : {};
    const out = { id: GENERATOR_IDS.includes(r.id) ? r.id : GENERATOR_IDS[0] };
    for (const k of PARAM_IDS) {
        const [lo, hi, d] = GENERATOR_PARAMS[k];
        const n = Number(r[k]);
        let v = r[k] === "" || r[k] == null || !Number.isFinite(n) ? d : clamp(n, lo, hi);
        v = k === "detail" ? Math.round(v) : Math.round(v * 100) / 100;
        out[k] = v;
    }
    const colors = (Array.isArray(r.colors) ? r.colors : []).filter((c) => typeof c === "string" && HEX6.test(c)).map((c) => c.toLowerCase()).slice(0, MAX_COLORS);
    out.colors = colors.length ? colors : DEFAULT_COLORS.slice();
    // Áudio-reativo: the pattern follows the PC's sound output (the console
    // measures it and sends the level to the outputs on this computer).
    out.audio = r.audio === true;
    return out;
}
