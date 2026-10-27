// The one-line summaries of the five blocks of an output's Ajustes (Editor
// da tela › Ajustes, Rodada H2): what is chosen, said while the block is
// closed (CfgGroup `summary`). Pure and tested, like cfgSummaries.js; the
// rule's own line is ruleSummary (src/lib/outputPrefs.js).
import { stageOptions, pastorOptions, streamOptions } from "../outputPrefs.js";

// "Automático", "Numa janela", "Tela 2" or "tela desligada": where an output
// is told to open (the assignment of electron/outputs.cjs), short.
// `number(id)` is the display's number as Windows counts it here (0: off).
export function placementShort(assignment, number = () => 0) {
    const t = assignment?.target;
    if (!t || t === "auto") return "Automático";
    if (t === "window") return "Numa janela";
    const n = number(t.id);
    return n ? `Tela ${n}` : "tela desligada";
}

// Destino: "Palco · Tela 2 · abre ao iniciar".
export function destinoSummary({ name, assignment = null, number, network = false }) {
    if (network) return `${name} · só na rede`;
    return [name, placementShort(assignment, number), assignment?.openAtLaunch === true && "abre ao iniciar"].filter(Boolean).join(" · ");
}

// Conteúdo of the Palco and the Pastor, which list the parts of their design
// instead of the kinds: "5 de 6 partes" ("todas as partes" when all are on).
export function partsSummary(page, pref) {
    const o = page === "/StageView" ? stageOptions(pref) : pastorOptions(pref);
    const parts = page === "/StageView"
        ? [o.chords, o.labels, o.next, o.notes, o.clock]
        : [o.clock, o.next_count > 0, o.chords, o.labels];
    const on = parts.filter(Boolean).length;
    return on === parts.length ? "Todas as partes" : on === 0 ? "Nenhuma parte" : `${on} de ${parts.length} partes`;
}

// Aparência: "Tema do console · texto 100% · margens 0".
//   themeName: the output's theme ("" follows another: the console's for the
//   Projeção, "O mesmo da Projeção" for the others).
export function aparenciaSummary({ page, pref, themeName = "" }) {
    if (page === "/StreamView") {
        const o = streamOptions(pref);
        return `Faixa ${o.position === "top" ? "no alto" : o.position === "middle" ? "no meio" : "embaixo"} · texto ${{ auto: "automático", s: "P", m: "M", l: "G" }[o.size]}`;
    }
    const theme = page === "/Projection" ? "Tema do console" : themeName || "O mesmo da Projeção";
    const parts = [theme, `texto ${Math.round(pref.scale * 100)}%`];
    if (pref.margin) parts.push(`margens ${pref.margin}%`);
    else parts.push("margens 0");
    return parts.join(" · ");
}

// Comportamento: "Sem item da lista: papel de parede".
export const EMPTY_WORDS = { wall: "papel de parede", black: "tela preta", logo: "logo" };
export const comportamentoSummary = (rule) => `Sem item da lista: ${EMPTY_WORDS[rule?.empty] || EMPTY_WORDS.wall}`;

// Diagnóstico: "Aberta · 2 telas na rede". `output` is the health row of the
// output ({ open, placement }, or null: it has none, the Transmissão).
export function diagnosticoSummary({ output = null, clients = 0 }) {
    const parts = [];
    if (output) parts.push(output.placement?.missing ? "Tela desligada" : output.open ? "Aberta" : "Fechada");
    if (clients > 0) parts.push(`${clients} ${clients === 1 ? "tela" : "telas"} na rede`);
    return parts.join(" · ") || "Nenhuma tela mostra esta página";
}

// "2 telas mostram esta página" / "Nenhuma tela na rede mostra esta página".
export function netClientsLine(clients, running) {
    if (!running) return "As telas na rede estão desligadas";
    if (!clients) return "Nenhuma tela na rede mostra esta página";
    return `${clients} ${clients === 1 ? "tela mostra" : "telas mostram"} esta página`;
}

// Diagnóstico › Estado, in words: "Aberta · tela cheia na Tela 2", "Fechada" or
// "Tela desligada · a saída volta quando ela ligar". `number(id)` as above.
export function estadoText(output, number = () => 0) {
    if (!output) return "Esta página só existe na rede";
    if (output.placement?.missing) return "Tela desligada · a saída volta quando ela ligar";
    if (!output.open) return "Fechada";
    const p = output.placement || {};
    if (p.mode === "fullscreen") return p.displayId && number(p.displayId) ? `Aberta · tela cheia na Tela ${number(p.displayId)}` : "Aberta · tela cheia";
    return "Aberta · numa janela";
}

// Diagnóstico › Ajustes: "com ajustes · desenho próprio", "com ajustes",
// "desenho próprio" or "padrão".
export function ajustesLine({ defaultSettings, ownDesign }) {
    const parts = [!defaultSettings && "com ajustes", ownDesign && "desenho próprio"].filter(Boolean);
    return parts.join(" · ") || "padrão";
}

// Diagnóstico › o que a tela mostra agora, from the live state and the rule:
// "Mostrando Letras", "Nada no ar" or "Bíblia não está no que esta tela
// recebe: mostra o papel de parede". `kindOf` is ruleKindOf, `label` the kind's name.
export function showsNowText(live, rule, { kindOf, label }) {
    const layers = [["tool", live?.tool], ["communication", live?.communication], ["media", live?.media], ["content", live?.content]];
    const hit = layers.find(([, item]) => item);
    if (!hit || live?.screen === "black" || live?.screen === "logo") return live?.screen === "black" ? "Tela preta" : live?.screen === "logo" ? "Logo" : "Nada no ar";
    const kind = kindOf(hit[0], hit[1]);
    if (!kind) return "Nada no ar";
    if ((rule?.kinds || []).includes(kind)) return `Mostrando ${label(kind)}`;
    return `${label(kind)} não está no que esta tela recebe: mostra ${{ wall: "o papel de parede", black: "a tela preta", logo: "o logo" }[rule?.empty] || "o papel de parede"}`;
}
