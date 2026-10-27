// The one-line summaries Configurações' groups show while closed (CfgGroup,
// settings/parts.jsx; Rodada H1, owner 2026-10-19): what is chosen, computed
// from the section's own values so it is never stale. State lives here, never
// in a header hint. Pure (tested); `outputsSummary` is in outputs.js,
// `transitionsSummary` in transitions.js.
import { linesLimit } from "../songImport.js";

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The aviso chime's volumes, [value, label] as Seg takes them.
export const CHIME_VOLUMES = [["20", "Baixo"], ["35", "Médio"], ["60", "Alto"], ["100", "Máximo"]];

// Telas e saídas › Som e YouTube: "Sino Médio · YouTube sem título".
export function somSummary(prefs) {
    if (!prefs) return "";
    const label = (CHIME_VOLUMES.find(([v]) => v === String(prefs.chime_volume)) || CHIME_VOLUMES[1])[1];
    return `${prefs.chime_on ? `Sino ${label}` : "Sino desligado"} · ${prefs.youtube_hide_title ? "YouTube sem título" : "YouTube com título"}`;
}

// Telas e saídas › Arquivo de ajustes: nothing to state, only what it does.
export const ARQUIVO_SUMMARY = "Exportar e importar a tela e os ajustes de cada saída";

// Telas na rede. `info` is the network's answer ({ enabled, running, urls, screens,
// clients, remote }).
export function enderecosSummary(info) {
    if (!info?.running) return "Desligado";
    return `${count((info.urls || []).length, "endereço", "endereços")} · ${count((info.screens || []).length, "tela", "telas")}`;
}
export function remoteSummary(remote, phones = 0) {
    if (!remote?.enabled) return "Desligado";
    return phones ? `Ligado · ${count(phones, "celular conectado", "celulares conectados")}` : "Ligado · nenhum celular agora";
}
export function connectedSummary(clients, running) {
    const n = (clients || []).length;
    if (!n) return running ? "Nenhuma agora" : "Desligado";
    return count(n, "conectada", "conectadas");
}

// Temas e fundos.
export function themesSummary(themes) {
    const n = (themes || []).length;
    if (!n) return "Nenhum tema ainda";
    const def = themes.find((t) => t.is_default);
    return `${count(n, "tema", "temas")}${def?.name ? ` · padrão ${def.name}` : def ? " · com tema padrão" : ""}`;
}
export function fundosSummary(categories) {
    const n = (categories || []).length;
    return n ? `${count(n, "categoria", "categorias")}: ${categories.join(" · ")}` : "Imagens, vídeos, gerados e cores";
}
// The look is the live one (or true for "with settings"); a file of the
// library says its name (Rodada Q6).
export const idleSummary = (idle, look) => {
    if (idle === "black") return `Preto${look ? " · com ajustes" : ""}`;
    const file = look && typeof look === "object" && look.bg === "media" ? look.media : null;
    if (file) return `Logo da igreja · Da biblioteca${file.name ? ` · ${file.name}` : ""}`;
    return `Logo da igreja${look ? " · com ajustes" : ""}`;
};
export const fontsSummary = (n) => (n ? count(n, "fonte", "fontes") : "Nenhuma ainda");

// Bíblia e músicas.
const LINES = (n) => (n ? `${n} ${n === 1 ? "linha" : "linhas"} por slide` : "uma estrofe por slide");
export function booksSummary(prefs) {
    if (!prefs) return "";
    return `${prefs.bible_book_names === "full" ? "Nome inteiro" : "Livros abreviados"} · letras: ${LINES(linesLimit(prefs.import_lines))}`;
}
export function biblesSummary(version, installed) {
    const n = installed || 0;
    return `${version ? `${version} em uso · ` : ""}${n ? count(n, "instalada neste computador", "instaladas neste computador") : "nenhuma instalada"}`;
}

// Culto.
export const wallpaperSummary = (has) => (has ? "Papel de parede da igreja" : "Tela ociosa");
export const templatesSummary = (n) => (n ? count(n, "modelo", "modelos") : "Nenhum ainda");
export function teamSummary(team) {
    const n = (team || []).length;
    if (!n) return "Ninguém ainda";
    const on = team.filter((m) => m.active !== false).length;
    return `${count(n, "pessoa", "pessoas")}${on === n ? "" : ` · ${count(on, "ativa", "ativas")}`}`;
}

// Console.
const LETTERS = { on: "ligadas", shift: "com Shift", off: "desligadas" };
export const shortcutsSummary = (letters) => `Teclas de uma letra ${LETTERS[letters] || LETTERS.on}`;
export function machineSummary(machine) {
    if (!machine) return "";
    const bits = [];
    if (machine.zoom !== undefined) bits.push(`Zoom ${Math.round(machine.zoom * 100)} %`);
    bits.push(machine.confirmClose === false ? "fecha sem perguntar" : "pergunta ao fechar");
    if (machine.login?.on) bits.push("abre com o Windows");
    return bits.join(" · ");
}

// Backup e atualizações. `bytes`: the data folder's size, already formatted.
export const dataSummary = (bytes) => `Pasta de dados${bytes ? ` ${bytes}` : ""} · exportar e importar · suporte`;
export function updatesSummary(info) {
    const update = info?.update || {};
    if (update.status === "disabled") return `KERYX ${info?.version || ""} · atualização indisponível`.trim();
    return `KERYX ${info?.version || ""} · ${update.auto ? "atualiza sozinho" : "atualização manual"}`.trim();
}
