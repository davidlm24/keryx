// Fundos gerados: the generators the screens can compute (names, which
// parameters each uses, the GLSL that draws it) and the presets the
// operator starts from. What the numbers mean and their ranges are
// shared/generators.mjs (the live state checks them there). Pure: the
// WebGL canvas (src/components/screen/GeneratorBackground.jsx) only
// compiles `fragmentSource(id)` and feeds it the uniforms.
import { GENERATOR_IDS, PARAM_IDS, normalizeGenerator } from "../../shared/generators.mjs";

export { GENERATOR_IDS, PARAM_IDS, normalizeGenerator };

// The sliders, in the order the panel shows them (Camadas › Fundo › Gerado).
export const PARAM_LABELS = [
    ["speed", "Velocidade", 0.01],
    ["scale", "Escala", 0.05],
    ["intensity", "Intensidade", 0.01],
    ["detail", "Detalhe", 1],
    ["spacing", "Espaçamento", 0.05],
    ["persistence", "Persistência", 0.01],
    ["contrast", "Contraste", 0.01],
];

// Each generator's own part of the shader: it reads `p` (the screen in
// pattern units, aspect-corrected), `uv` (0..1), `t` (time, already by the
// speed) and the fbm/noise helpers, and leaves `v` (0..1), which the
// palette colours.
export const GENERATORS = [
    {
        id: "fluid", name: "Fluido", hint: "veios de mármore em movimento lento (ruído de domínio deformado)",
        params: ["speed", "scale", "intensity", "detail", "spacing", "persistence", "contrast"],
        body: `
            vec2 q = vec2(fbm(p + t * 0.10), fbm(p + vec2(5.2, 1.3) + t * 0.08));
            vec2 r = vec2(fbm(p + 4.0 * q + vec2(1.7, 9.2) + t * 0.15), fbm(p + 4.0 * q + vec2(8.3, 2.8) + t * 0.126));
            float v = fbm(p + 4.0 * r);`,
    },
    {
        id: "clouds", name: "Nuvens", hint: "ruído fBm arrastando devagar — discreto, bom atrás de letra",
        params: ["speed", "scale", "intensity", "detail", "spacing", "persistence", "contrast"],
        body: `
            float v = fbm(p + vec2(t * 0.20, t * 0.05));`,
    },
    {
        id: "aurora", name: "Aurora", hint: "faixas de luz ondulando no alto da tela",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
        body: `
            float w = fbm(vec2(p.x * 0.6 + t * 0.3, t * 0.15));
            float w2 = fbm(vec2(p.x * 1.3 - t * 0.2, 7.0 + t * 0.1));
            float band = exp(-pow((uv.y - 0.45 - (w - 0.5) * 0.6) * 2.6, 2.0));
            float band2 = exp(-pow((uv.y - 0.62 - (w2 - 0.5) * 0.5) * 3.5, 2.0));
            float v = clamp(band * (0.5 + 0.5 * fbm(p * 1.5 + t * 0.4)) + 0.6 * band2 * (0.5 + 0.5 * fbm(p * 2.2 - t * 0.3)), 0.0, 1.0);`,
    },
    {
        id: "bokeh", name: "Luzes", hint: "círculos de luz suaves flutuando (bokeh)",
        params: ["speed", "scale", "intensity", "contrast"],
        body: `
            float v = 0.0;
            vec2 gi = floor(p), gf = fract(p);
            for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
                vec2 o = vec2(float(x), float(y));
                vec2 cell = gi + o;
                float h = hash(cell);
                vec2 c = o + vec2(hash(cell + 1.7), hash(cell + 3.1)) + 0.25 * vec2(sin(t * (0.5 + h) + h * 6.28), cos(t * (0.3 + h) + h * 3.14));
                float r = 0.15 + 0.35 * hash(cell + 5.3);
                v += smoothstep(r, r * 0.2, length(gf - c)) * (0.4 + 0.6 * h);
            }
            v = clamp(v, 0.0, 1.0);`,
    },
    {
        id: "gradient", name: "Degradê vivo", hint: "um degradê que gira e respira devagar",
        params: ["speed", "intensity", "contrast"],
        body: `
            float a = t * 0.25;
            vec2 d = vec2(cos(a), sin(a));
            float v = clamp(dot(uv - 0.5, d) * 0.8 + 0.5 + 0.12 * sin(t * 0.6 + uv.x * 4.0 + uv.y * 2.0), 0.0, 1.0);`,
    },
];
export const generatorOf = (id) => GENERATORS.find((g) => g.id === id) || GENERATORS[0];

// WebGL 1 (GLSL ES 1.0), so an old church PC's integrated GPU draws it.
const PRELUDE = `
precision highp float;
uniform vec2 u_res;
uniform float u_time, u_speed, u_scale, u_intensity, u_spacing, u_persistence, u_contrast, u_audio;
uniform int u_detail, u_ncol;
uniform vec3 u_c0, u_c1, u_c2;
float hash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 q) {
    vec2 i = floor(q), f = fract(q);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 q) {
    float v = 0.0, a = 0.5, amp = 0.0;
    for (int i = 0; i < 8; i++) {
        if (i >= u_detail) break;
        v += a * noise(q); amp += a;
        q *= u_spacing; a *= u_persistence;
    }
    return amp > 0.0 ? v / amp : 0.0;
}
vec3 palette(float s) {
    s = clamp(s, 0.0, 1.0);
    if (u_ncol < 2) return u_c0;
    if (u_ncol == 2) return mix(u_c0, u_c1, s);
    return s < 0.5 ? mix(u_c0, u_c1, s * 2.0) : mix(u_c1, u_c2, (s - 0.5) * 2.0);
}
void main() {
    vec2 uv = gl_FragCoord.xy / u_res;
    vec2 p = vec2(uv.x * u_res.x / u_res.y, uv.y) * u_scale;
    float t = u_time * u_speed;
`;
const CODA = `
    // Áudio-reativo: the sound's level (0..1, smoothed on the screen) pushes
    // the pattern out and brightens it.
    float s = (mix(0.5, v, min(1.0, u_intensity * (1.0 + u_audio * 0.7))) - 0.5) * (1.0 + u_contrast * 3.0) + 0.5 + u_audio * 0.18;
    gl_FragColor = vec4(palette(s), 1.0);
}
`;
export const VERTEX_SOURCE = "attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }";
export const fragmentSource = (id) => PRELUDE + generatorOf(id).body + CODA;

// Ready looks, per generator: the panel's Presets. Each is a generator
// description; the first of a generator is what "Gerado › <name>" starts
// with. Colours run dark → mid → light, the way the palette reads them.
export const PRESETS = [
    { id: "lava", name: "Lava", gen: { id: "fluid", speed: 0.16, scale: 3.3, intensity: 0.86, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.34, colors: ["#3f0000", "#ff7600", "#5b0000"] } },
    { id: "oceano", name: "Oceano", gen: { id: "fluid", speed: 0.2, scale: 2.5, intensity: 0.8, detail: 5, spacing: 2.1, persistence: 0.5, contrast: 0.3, colors: ["#031a2e", "#0a5c8c", "#8fd3ff"] } },
    { id: "marmore", name: "Mármore", gen: { id: "fluid", speed: 0.08, scale: 2, intensity: 0.9, detail: 6, spacing: 2.2, persistence: 0.55, contrast: 0.5, colors: ["#101010", "#6b6b6b", "#f0ede6"] } },
    { id: "nuvem-azul", name: "Nuvem azul", gen: { id: "clouds", speed: 0.3, scale: 3, intensity: 0.8, detail: 6, spacing: 2, persistence: 0.5, contrast: 0.2, colors: ["#0b1a30", "#5b8fc9", "#b9d4ee"] } },
    { id: "nevoa", name: "Névoa", gen: { id: "clouds", speed: 0.2, scale: 2.5, intensity: 0.6, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.1, colors: ["#101014", "#3a3a44", "#8a8a96"] } },
    { id: "por-do-sol", name: "Pôr do sol", gen: { id: "clouds", speed: 0.25, scale: 2.2, intensity: 0.85, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.3, colors: ["#2a0a2e", "#ff6a3d", "#ffd36e"] } },
    { id: "aurora-verde", name: "Aurora verde", gen: { id: "aurora", speed: 0.4, scale: 3, intensity: 1, detail: 4, spacing: 2, persistence: 0.5, contrast: 0.3, colors: ["#020b14", "#1ac98a", "#7cf0ff"] } },
    { id: "aurora-roxa", name: "Aurora roxa", gen: { id: "aurora", speed: 0.35, scale: 2.5, intensity: 1, detail: 4, spacing: 2, persistence: 0.5, contrast: 0.35, colors: ["#0a0414", "#7b3fd6", "#ff8ad8"] } },
    { id: "luzes-douradas", name: "Luzes douradas", gen: { id: "bokeh", speed: 0.3, scale: 4, intensity: 1, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.2, colors: ["#1a1206", "#c19959", "#fff2c7"] } },
    { id: "luzes-frias", name: "Luzes frias", gen: { id: "bokeh", speed: 0.25, scale: 5, intensity: 0.9, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.2, colors: ["#06101c", "#3a7bd5", "#dff3ff"] } },
    { id: "roxo-azul", name: "Roxo e azul", gen: { id: "gradient", speed: 0.5, scale: 3, intensity: 1, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.1, colors: ["#1e0b3a", "#2a3f8f", "#0b1a30"] } },
    { id: "verde-escuro", name: "Verde escuro", gen: { id: "gradient", speed: 0.4, scale: 3, intensity: 1, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.15, colors: ["#07140d", "#145a32", "#0b2a1a"] } },
].map((p) => ({ ...p, gen: normalizeGenerator(p.gen) }));
export const presetsOf = (id) => PRESETS.filter((p) => p.gen.id === id);

// The background.set args for a generator (its first preset) or a preset.
export const generatorArgs = (gen, title = "") => ({ kind: "generator", value: gen.id, title: title || generatorOf(gen.id).name, gen });
export const presetArgs = (preset) => generatorArgs(preset.gen, `${generatorOf(preset.gen.id).name} · ${preset.name}`);
export const startArgs = (id) => presetArgs(presetsOf(id)[0]);

// The preset a generator currently matches (every number and colour), or null.
export const matchingPreset = (gen) => PRESETS.find((p) => p.gen.id === gen?.id && PARAM_IDS.every((k) => p.gen[k] === gen[k]) && p.gen.colors.join() === (gen.colors || []).join()) || null;

// What a surface without WebGL shows instead: a still gradient of the colours.
export const cssFallback = (gen) => `linear-gradient(160deg, ${(gen?.colors || ["#000"]).join(", ")})`;
