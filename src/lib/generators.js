// Fundos gerados: the generators the screens can compute (names, which
// parameters each uses) and the presets the operator starts from. What the
// numbers mean and their ranges are shared/generators.mjs (the live state
// checks them there); the GLSL is src/lib/generatorShaders.js, which only
// the screens load, when they draw one. Pure; the console's (the outputs
// never import this file).
import { GENERATOR_IDS, PARAM_IDS, normalizeGenerator, BLEND_POS, BLEND_WIDTH } from "../../shared/generators.mjs";
import { cssFallback } from "./generatorLook.js";

export { GENERATOR_IDS, PARAM_IDS, normalizeGenerator, cssFallback };

// What the degradê starts with when it is switched on: a warm set (most
// looks start cool), or a cool one beside a warm look, so the change shows.
const WARM = ["#140603", "#c2501a", "#ffd9a8"];
const COOL = ["#020a1c", "#1f5fb5", "#bfe2ff"];
const warmth = (hexColor) => parseInt(hexColor.slice(1, 3), 16) - parseInt(hexColor.slice(5, 7), 16);
export const secondColors = (colors = []) => ((colors[Math.floor(colors.length / 2)] && warmth(colors[Math.floor(colors.length / 2)]) > 0) ? COOL : WARM).slice();

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

// Each generator: its name, what it looks like and the sliders it reads
// (its shader is BODIES[id] in generatorShaders.js).
export const GENERATORS = [
    {
        id: "fluid", name: "Fluido", hint: "veios de mármore em movimento lento (ruído de domínio deformado)",
        params: ["speed", "scale", "intensity", "detail", "spacing", "persistence", "contrast"],
    },
    {
        id: "aurora", name: "Aurora", hint: "faixas de luz ondulando no alto da tela",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "gradient", name: "Degradê vivo", hint: "um degradê que gira e respira devagar",
        params: ["speed", "intensity", "contrast"],
    },
    // The four below keep the current ones' cost: one cell per layer (no
    // neighbour loop, each point stays inside its cell), at most two fbm.
    {
        id: "stars", name: "Céu estrelado", hint: "estrelas piscando, quase paradas, num céu que mal se move",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "mist", name: "Névoa em movimento", hint: "fumaça escura em camadas, bem lenta — discreta sob a letra",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    // The worship loops (owner's mockup "Fundos em loop", 2026-11-12).
    {
        id: "tunnel", name: "Túnel de luz", hint: "riscos de luz que correm para o horizonte, como uma viagem pela luz",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "beams", name: "Feixes desfocados", hint: "faixas de luz fora de foco que vão e voltam, quase paradas. Discreto",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "lines", name: "Linhas em movimento", hint: "listras verticais de larguras diferentes, com as cores escorrendo por elas",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "columns", name: "Colunas", hint: "colunas escuras com uma luz quente subindo do chão, mais forte no meio",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "horizon", name: "Horizonte", hint: "um céu em degradê, do alto escuro ao horizonte claro, respirando devagar",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "room", name: "Sala de luz", hint: "uma sala vazia e clara vista de frente, com luz macia se mexendo nas paredes",
        params: ["speed", "intensity", "detail", "contrast"],
    },
    {
        id: "refraction", name: "Refração", hint: "manchas de luz fora de foco, macias, com um fio claro na borda, como luz passando por um cristal",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "reflections", name: "Reflexos", hint: "riscos longos de luz em diagonal, como o reflexo de um cristal numa parede",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "fluted", name: "Vidro canelado", hint: "frisos finos e iguais, com uma faixa de luz no meio que cada friso desloca um pouco",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "wideglass", name: "Vidro largo", hint: "frisos largos, a cor subindo em degradê por trás e um brilho em cada friso",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "watercolor", name: "Aquarela", hint: "três camadas de tinta que se sobrepõem, com sangrado macio e grão de papel",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "mosaic", name: "Mosaico", hint: "fileiras finas, cada uma um degradê em degraus que desliza para um lado",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "blocks", name: "Blocos", hint: "blocos maiores de borda macia, com a cor passando por eles em duas direções",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "silk", name: "Seda", hint: "dobras de cetim que se mexem devagar, com brilho nas cristas. Bom atrás de letra",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "dunes", name: "Ondas", hint: "camadas de dunas ou montanhas ao longe, cada uma ondulando no seu ritmo",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "lightrain", name: "Chuva de luz", hint: "riscos finos de luz caindo em três profundidades, como chuva iluminada",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "prism", name: "Prisma", hint: "vazamentos de luz entrando pelos cantos, como sol numa lente",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "ink", name: "Tinta na água", hint: "nuvens de tinta subindo e se enrolando na água, mais fortes no centro",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
    {
        id: "stainedglass", name: "Vitral", hint: "pedaços de vidro colorido separados por chumbo, cada um acendendo e apagando",
        params: ["speed", "scale", "intensity", "contrast"],
    },
    {
        id: "lightgrid", name: "Grade de luz", hint: "um piso de linhas de luz correndo até o horizonte, com um clarão ao fundo",
        params: ["speed", "scale", "intensity", "detail", "contrast"],
    },
];
export const generatorOf = (id) => GENERATORS.find((g) => g.id === id) || GENERATORS[0];

// Ready looks, per generator: the panel's Presets. Each is a generator
// description; the first of a generator is what "Gerado › <name>" starts
// with. Colours run dark → mid → light, the way the palette reads them.
export const PRESETS = [
    { id: "lava", name: "Lava", gen: { id: "fluid", speed: 0.16, scale: 3.3, intensity: 0.86, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.34, colors: ["#3f0000", "#ff7600", "#5b0000"] } },
    { id: "oceano", name: "Oceano", gen: { id: "fluid", speed: 0.2, scale: 2.5, intensity: 0.8, detail: 5, spacing: 2.1, persistence: 0.5, contrast: 0.3, colors: ["#031a2e", "#0a5c8c", "#8fd3ff"] } },
    { id: "marmore", name: "Mármore", gen: { id: "fluid", speed: 0.08, scale: 2, intensity: 0.9, detail: 6, spacing: 2.2, persistence: 0.55, contrast: 0.5, colors: ["#101010", "#6b6b6b", "#f0ede6"] } },
    { id: "aurora-verde", name: "Aurora verde", gen: { id: "aurora", speed: 0.4, scale: 3, intensity: 1, detail: 4, spacing: 2, persistence: 0.5, contrast: 0.3, colors: ["#020b14", "#1ac98a", "#7cf0ff"] } },
    { id: "aurora-roxa", name: "Aurora roxa", gen: { id: "aurora", speed: 0.35, scale: 2.5, intensity: 1, detail: 4, spacing: 2, persistence: 0.5, contrast: 0.35, colors: ["#0a0414", "#7b3fd6", "#ff8ad8"] } },
    { id: "roxo-azul", name: "Roxo e azul", gen: { id: "gradient", speed: 0.5, scale: 3, intensity: 1, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.1, colors: ["#1e0b3a", "#2a3f8f", "#0b1a30"] } },
    { id: "verde-escuro", name: "Verde escuro", gen: { id: "gradient", speed: 0.4, scale: 3, intensity: 1, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.15, colors: ["#07140d", "#145a32", "#0b2a1a"] } },
    { id: "noite-azul", name: "Noite azul", gen: { id: "stars", speed: 0.3, scale: 3, intensity: 1, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.2, colors: ["#020610", "#3d5a8a", "#f4f8ff"] } },
    { id: "noite-roxa", name: "Noite roxa", gen: { id: "stars", speed: 0.25, scale: 3.5, intensity: 1, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.2, colors: ["#08040f", "#5b3d8a", "#fbefff"] } },
    { id: "fumaca", name: "Fumaça", gen: { id: "mist", speed: 0.2, scale: 2, intensity: 0.7, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.1, colors: ["#060607", "#26272c", "#55565e"] } },
    { id: "nevoa-azul", name: "Névoa azul", gen: { id: "mist", speed: 0.18, scale: 2, intensity: 0.7, detail: 5, spacing: 2, persistence: 0.5, contrast: 0.1, colors: ["#03060b", "#15263d", "#3e5878"] } },
].map((p) => ({ ...p, gen: normalizeGenerator(p.gen) }));

// The worship loops' colours, as the owner approved them in the mockup: per
// look its numbers and its colourways — the look's own, then a ramp of four
// or five colours and two degradês ([name, colors, colors2, blend]). The
// first is what "Gerado › <name>" starts with.
const LOOP_PRESETS = {
    tunnel: {
        start: { speed: 0.26, scale: 1.9, intensity: 1, detail: 4, contrast: 0.2 },
        ways: [
            ["Azul elétrico", ["#04051a", "#3a3fd6", "#f1e6ff"]],
            ["Cobre", ["#140604", "#a8442a", "#ffd9b8"]],
            ["Petróleo", ["#02100f", "#1b6f6a", "#d8fff6"]],
            ["Ameixa", ["#10040e", "#7a2f6a", "#ffd0ee"]],
            ["Rosa e azul", ["#0a0814", "#c25b7a", "#9fd8ff"]],
            ["Prata", ["#050505", "#6d6d74", "#f4f4f6"]],
            ["Oceano e areia", ["#02101c", "#0f5a7a", "#3fa8a0", "#e6c88a", "#fff2d6"]],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
        ],
    },
    beams: {
        start: { speed: 0.15, scale: 2, intensity: 1, detail: 3, contrast: 0.1 },
        ways: [
            ["Prata", ["#030303", "#4a4a4e", "#f2f2f2"]],
            ["Noite", ["#000000", "#1b1b22", "#bfc3d6"]],
            ["Fumê", ["#050505", "#2e2e33", "#a6a6ad"]],
            ["Azul grafite", ["#03050a", "#26303f", "#c7d3e6"]],
            ["Dourado", ["#060402", "#4a3820", "#f2dcae"]],
            ["Floresta", ["#03100a", "#1a5a3a", "#6a9a3a", "#e6d26a"]],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
        ],
    },
    lines: {
        start: { speed: 0.28, scale: 4.95, intensity: 0.46, detail: 3, contrast: 0.56 },
        ways: [
            ["Ferrugem", ["#140603", "#b5401c", "#f7d7b5"]],
            ["Laranja e azul", ["#04101e", "#2a7fc0", "#f07a2a"]],
            ["Oceano", ["#020a18", "#1b5fa8", "#a9d8f2"]],
            ["Ameixa", ["#0b0410", "#5a2c7a", "#e98bb0"]],
            ["Rubi e azul", ["#0a0412", "#c0213f", "#3b6fd1"]],
            ["Cinza", ["#0a0a0b", "#555559", "#e6e6e8"]],
            ["Aurora", ["#05061a", "#2a2f9a", "#8a3fb5", "#f06a8a", "#ffd9a0"]],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
        ],
    },
    columns: {
        start: { speed: 1.39, scale: 3, intensity: 1, detail: 3, contrast: 0.2 },
        ways: [
            ["Brasa", ["#0a0101", "#6e0e06", "#f08a4b"]],
            ["Cobalto", ["#01020c", "#0b2a8a", "#7fa6ff"]],
            ["Púrpura", ["#06010c", "#4a0f7a", "#d08cff"]],
            ["Esmeralda", ["#010806", "#0b5a4a", "#7fe6c8"]],
            ["Grafite", ["#040404", "#2e2e30", "#c9c9cc"]],
            ["Rubi e azul", ["#06030c", "#7a1530", "#5a7bd6"]],
            ["Pôr do sol", ["#12051a", "#6a1f6a", "#d6453a", "#f59a3a", "#ffe6b0"]],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
        ],
    },
    horizon: {
        start: { speed: 1.03, scale: 2, intensity: 1, detail: 4, contrast: 0 },
        ways: [
            ["Brasa", ["#1a0505", "#8a2a10", "#ffb070"]],
            ["Amanhecer", ["#08214f", "#3f74b8", "#ffb347"]],
            ["Rosa", ["#1f2a4a", "#8a7aa8", "#f2a090"]],
            ["Uva", ["#120a26", "#5a2f6a", "#e96a8a"]],
            ["Noite", ["#020812", "#1c3550", "#7aa3c7"]],
            ["Areia", ["#2a2e33", "#8a8a8a", "#e8d2b0"]],
            ["Grafite", ["#050505", "#2e2e2e", "#9a9a9a"]],
            ["Oceano e areia", ["#02101c", "#0f5a7a", "#3fa8a0", "#e6c88a", "#fff2d6"]],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
        ],
    },
    room: {
        start: { speed: 1.17, scale: 2.5, intensity: 1, detail: 4, contrast: 0 },
        ways: [
            ["Água", ["#0e3f55", "#4fa3b8", "#e2f7f7"]],
            ["Areia", ["#3a2a1a", "#a8865a", "#f7ead2"]],
            ["Neblina", ["#202226", "#6d727b", "#e6e8ec"]],
            ["Âmbar", ["#2a1406", "#b5671e", "#ffe0a8"]],
            ["Lavanda", ["#2a2140", "#7d6fb0", "#ece6fa"]],
            ["Noite", ["#04070d", "#1b2d45", "#7f9ec4"]],
            ["Floresta", ["#03100a", "#1a5a3a", "#6a9a3a", "#e6d26a"]],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
        ],
    },
    refraction: {
        start: { speed: 1.08, scale: 2, intensity: 1, detail: 3, contrast: 0.15 },
        ways: [
            ["Ardósia", ["#05070c", "#2b3446", "#c9d6f2"]],
            ["Bronze", ["#0b0605", "#5a3328", "#f0c9b0"]],
            ["Grafite", ["#060606", "#333336", "#e8e8ea"]],
            ["Rubi", ["#080305", "#3a1016", "#ff9aa0"]],
            ["Gelo", ["#03080c", "#1f4a5a", "#d6f4ff"]],
            ["Aurora", ["#05061a", "#2a2f9a", "#8a3fb5", "#f06a8a", "#ffd9a0"]],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
        ],
    },
    reflections: {
        start: { speed: 0.71, scale: 2.5, intensity: 1, detail: 4, contrast: 0.2 },
        ways: [
            ["Ardósia", ["#05070c", "#2b3446", "#c9d6f2"]],
            ["Bronze", ["#0b0605", "#5a3328", "#f0c9b0"]],
            ["Grafite", ["#060606", "#333336", "#e8e8ea"]],
            ["Rubi", ["#080305", "#3a1016", "#ff9aa0"]],
            ["Gelo", ["#03080c", "#1f4a5a", "#d6f4ff"]],
            ["Pôr do sol", ["#12051a", "#6a1f6a", "#d6453a", "#f59a3a", "#ffe6b0"]],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
        ],
    },
    fluted: {
        start: { speed: 1.48, scale: 3.45, intensity: 0.28, detail: 3, contrast: 1 },
        ways: [
            ["Cobalto", ["#010414", "#0b3aa8", "#7fb2ff"]],
            ["Âmbar", ["#120600", "#c2560a", "#ffcc4a"]],
            ["Petróleo", ["#020a0f", "#11506a", "#9fe6ff"]],
            ["Vinho", ["#0e0310", "#6a1f4f", "#ff8a6a"]],
            ["Grafite", ["#070707", "#3b3b3e", "#cfcfd4"]],
            ["Oceano e areia", ["#02101c", "#0f5a7a", "#3fa8a0", "#e6c88a", "#fff2d6"]],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
        ],
    },
    wideglass: {
        start: { speed: 1.3, scale: 3.65, intensity: 1, detail: 4, contrast: 0.2 },
        ways: [
            ["Vinho", ["#0e0310", "#6a1f4f", "#ff8a6a"]],
            ["Âmbar", ["#120600", "#c2560a", "#ffcc4a"]],
            ["Petróleo", ["#020a0f", "#11506a", "#9fe6ff"]],
            ["Cobalto", ["#010414", "#0b3aa8", "#7fb2ff"]],
            ["Grafite", ["#070707", "#3b3b3e", "#cfcfd4"]],
            ["Floresta", ["#03100a", "#1a5a3a", "#6a9a3a", "#e6d26a"]],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
        ],
    },
    watercolor: {
        start: { speed: 0.1, scale: 2.4, intensity: 1, detail: 5, contrast: 0.15 },
        ways: [
            ["Brasa", ["#050302", "#c2410c", "#f4d6c0"]],
            ["Mar", ["#020507", "#0e6f95", "#d6efff"]],
            ["Musgo", ["#030504", "#11685a", "#cdeee2"]],
            ["Crepúsculo", ["#04030a", "#3653a8", "#f1a0b0"]],
            ["Uva", ["#050208", "#6a2a8a", "#f6b26b"]],
            ["Aurora", ["#05061a", "#2a2f9a", "#8a3fb5", "#f06a8a", "#ffd9a0"]],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
        ],
    },
    mosaic: {
        start: { speed: 0.48, scale: 0.5, intensity: 0.56, detail: 3, contrast: 1 },
        ways: [
            ["Fogo e gelo", ["#0b1d3a", "#e8e1d4", "#d4501a"]],
            ["Cobre", ["#1a0703", "#c4521f", "#f3dcc0"]],
            ["Mar", ["#02142a", "#2f7fbf", "#d8ecf5"]],
            ["Lilás", ["#120a22", "#7a4fa8", "#efd8f2"]],
            ["Vinho", ["#16040a", "#9a1f3a", "#f0b8a8"]],
            ["Cinza", ["#0c0c0d", "#5c5c60", "#e9e9eb"]],
            ["Pôr do sol", ["#12051a", "#6a1f6a", "#d6453a", "#f59a3a", "#ffe6b0"]],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
        ],
    },
    blocks: {
        start: { speed: 0.95, scale: 2.8, intensity: 1, detail: 3, contrast: 0.25 },
        ways: [
            ["Vinho", ["#16040a", "#9a1f3a", "#f0b8a8"]],
            ["Fogo e gelo", ["#0b1d3a", "#e8e1d4", "#d4501a"]],
            ["Cobre", ["#1a0703", "#c4521f", "#f3dcc0"]],
            ["Mar", ["#02142a", "#2f7fbf", "#d8ecf5"]],
            ["Lilás", ["#120a22", "#7a4fa8", "#efd8f2"]],
            ["Cinza", ["#0c0c0d", "#5c5c60", "#e9e9eb"]],
            ["Oceano e areia", ["#02101c", "#0f5a7a", "#3fa8a0", "#e6c88a", "#fff2d6"]],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
        ],
    },
    silk: {
        start: { speed: 0.3, scale: 3, intensity: 1, detail: 3, contrast: 0.1 },
        ways: [
            ["Vinho", ["#1a0410", "#8a1f45", "#f2a7b8"]],
            ["Ouro", ["#140c02", "#8a6420", "#f5dfa0"]],
            ["Safira", ["#020a1c", "#1f4fa0", "#a9c8f5"]],
            ["Esmeralda", ["#02120c", "#17705a", "#a8ecd0"]],
            ["Pérola", ["#2a2a2e", "#8d8d96", "#f2f2f4"]],
            ["Ameixa", ["#0d0416", "#5a2a86", "#d9b0f5"]],
            ["Floresta", ["#03100a", "#1a5a3a", "#6a9a3a", "#e6d26a"]],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
        ],
    },
    dunes: {
        start: { speed: 1.04, scale: 2.35, intensity: 0.68, detail: 3, contrast: 0.58 },
        ways: [
            ["Deserto", ["#2a1206", "#b5622a", "#f6d9a8"]],
            ["Mar", ["#041a2a", "#2a6f95", "#cfe9f2"]],
            ["Crepúsculo", ["#1a0f2e", "#7a4a8a", "#f2b6a0"]],
            ["Floresta", ["#06140c", "#2f6a45", "#d6ecc0"]],
            ["Cinza", ["#101114", "#55585f", "#dcdde0"]],
            ["Aurora", ["#05061a", "#2a2f9a", "#8a3fb5", "#f06a8a", "#ffd9a0"]],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
        ],
    },
    lightrain: {
        start: { speed: 0.4, scale: 3, intensity: 1, detail: 3, contrast: 0.2 },
        ways: [
            ["Ouro", ["#060401", "#8a6420", "#fff0c2"]],
            ["Azul", ["#01040c", "#1f4fa0", "#d6ecff"]],
            ["Branca", ["#040404", "#3a3a40", "#ffffff"]],
            ["Verde", ["#010804", "#1a7a4a", "#d2ffe2"]],
            ["Rosa", ["#0a0206", "#a02f6a", "#ffd6e6"]],
            ["Pôr do sol", ["#12051a", "#6a1f6a", "#d6453a", "#f59a3a", "#ffe6b0"]],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
        ],
    },
    prism: {
        start: { speed: 0.54, scale: 1.25, intensity: 0.91, detail: 3, contrast: 0.18 },
        ways: [
            ["Quente", ["#0a0402", "#c2501a", "#ffe2a8"]],
            ["Frio", ["#02060e", "#2a6ac2", "#d2f0ff"]],
            ["Rosa", ["#0c0308", "#c23a7a", "#ffd6c2"]],
            ["Verde-água", ["#020a0a", "#1a9a8a", "#e2fff2"]],
            ["Lavanda", ["#07040e", "#6a4ac2", "#f2d6ff"]],
            ["Oceano e areia", ["#02101c", "#0f5a7a", "#3fa8a0", "#e6c88a", "#fff2d6"]],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
        ],
    },
    ink: {
        start: { speed: 0.3, scale: 3, intensity: 1, detail: 5, contrast: 0.2 },
        ways: [
            ["Índigo", ["#03030a", "#2a2a9a", "#c2c8ff"]],
            ["Carmim", ["#0a0203", "#9a1a2a", "#ffb8a8"]],
            ["Jade", ["#020806", "#1a7a5a", "#c2f2dc"]],
            ["Sépia", ["#0a0603", "#6a4520", "#f0d8b0"]],
            ["Fumaça", ["#050506", "#3a3a42", "#d2d2da"]],
            ["Floresta", ["#03100a", "#1a5a3a", "#6a9a3a", "#e6d26a"]],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
        ],
    },
    stainedglass: {
        start: { speed: 0.51, scale: 4.45, intensity: 0.76, detail: 3, contrast: 0 },
        ways: [
            ["Azul", ["#020514", "#1a3fa8", "#8fd2ff"]],
            ["Catedral", ["#06030f", "#7a1f6a", "#f2b23a"]],
            ["Rubi", ["#0a0204", "#a81f2f", "#ffb07a"]],
            ["Esmeralda", ["#020a06", "#1a7a4f", "#c8f29a"]],
            ["Âmbar", ["#0a0502", "#a8641a", "#ffe6a0"]],
            ["Aurora", ["#05061a", "#2a2f9a", "#8a3fb5", "#f06a8a", "#ffd9a0"]],
            ["Fogo e gelo em degradê", ["#140603", "#c2501a", "#ffd9a8"], ["#020a1c", "#1f5fb5", "#bfe2ff"], "h"],
            ["Ouro e vinho em degradê", ["#120a02", "#b5801a", "#ffe8a8"], ["#14030a", "#8a1f45", "#f5a8c0"], "move"],
        ],
    },
    lightgrid: {
        start: { speed: 0.3, scale: 3, intensity: 0.44, detail: 3, contrast: 0.15 },
        ways: [
            ["Neon", ["#05020f", "#7a1fa8", "#ff8ad6"]],
            ["Ciano", ["#01060f", "#0f5a9a", "#8ff2ff"]],
            ["Âmbar", ["#0a0501", "#9a5a0f", "#ffe08f"]],
            ["Verde", ["#010a04", "#0f8a4a", "#a8ffc8"]],
            ["Branca", ["#050506", "#4a4a55", "#ffffff"]],
            ["Pôr do sol", ["#12051a", "#6a1f6a", "#d6453a", "#f59a3a", "#ffe6b0"]],
            ["Rosa e azul em degradê", ["#16041a", "#c23a8a", "#ffc2e0"], ["#020a24", "#2a4fd6", "#b8d2ff"], "d"],
            ["Verde e violeta em degradê", ["#02100c", "#1a8a6a", "#b8ffe0"], ["#0a0418", "#6a2fc2", "#e0c2ff"], "v"],
        ],
    },
};
const slug = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
for (const [id, { start, ways }] of Object.entries(LOOP_PRESETS)) {
    for (const [name, colors, colors2, blend] of ways) {
        PRESETS.push({ id: `${id}-${slug(name)}`, name, gen: normalizeGenerator({ id, ...start, colors, ...(colors2 ? { colors2, blend } : {}) }) });
    }
}
export const presetsOf = (id) => PRESETS.filter((p) => p.gen.id === id);

// The background.set args for a generator (its first preset) or a preset.
export const generatorArgs = (gen, title = "") => ({ kind: "generator", value: gen.id, title: title || generatorOf(gen.id).name, gen });
export const presetArgs = (preset) => generatorArgs(preset.gen, `${generatorOf(preset.gen.id).name} · ${preset.name}`);
export const startArgs = (id) => presetArgs(presetsOf(id)[0]);

// The preset a generator currently matches (every number, colour and the
// degradê), or null.
const sameColors = (a, b) => (a || []).join() === (b || []).join();
export const matchingPreset = (gen) => PRESETS.find((p) => p.gen.id === gen?.id && PARAM_IDS.every((k) => p.gen[k] === gen[k])
    && sameColors(p.gen.colors, gen.colors) && sameColors(p.gen.colors2, gen.colors2) && (p.gen.blend || "") === (gen.blend || "")
    && (p.gen.blendPos ?? BLEND_POS[2]) === (gen?.blendPos ?? BLEND_POS[2]) && (p.gen.blendWidth ?? BLEND_WIDTH[2]) === (gen?.blendWidth ?? BLEND_WIDTH[2])) || null;


// A preset's dot: its colours in hard diagonal bands, light first; a
// degradê's two sets side by side, each its own soft ramp.
export const presetSwatch = (gen) => {
    const cs = gen?.colors?.length ? gen.colors : ["#000"];
    const soft = (list) => `linear-gradient(180deg, ${list.slice().reverse().join(", ")})`;
    if (gen?.colors2?.length) return `${soft(cs)} left / 50% 100% no-repeat, ${soft(gen.colors2)} right / 50% 100% no-repeat`;
    const r = cs.slice().reverse();
    const at = (i) => Math.round((i * 100) / r.length);
    return `linear-gradient(135deg, ${r.map((c, i) => `${c} ${at(i)}% ${at(i + 1)}%`).join(", ")})`;
};
