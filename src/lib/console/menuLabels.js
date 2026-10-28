// One name, one icon and one key hint per action that appears in 2+ menus
// (owner 2026-10-20, Rodada M1: "todas as trocas"). The bar (menuBar.js), the
// Menu button's popover (the same items), Ver, the (+) menus, the row context
// menus and the Programa's menu build their shared items from here, so the
// same action reads and looks the same wherever it is offered. One-off labels
// stay where they are; only the shared actions come through this table.
//
// "…" ends a label only when the command asks for more before it acts (a
// file, a link, a confirmation); one that opens a page has none (menuBar.js,
// design audit C-52). Delete icons: every "Excluir…" is the trash, every
// "Tirar…" the x (CLAUDE.md "Copy rules"). The ⋯ glyph opens menus only.
//
// `key` names the action in keyHint (keys.js): the hint is drawn from the
// church's choice of letter keys, never typed by hand. Only an action whose
// key really does it carries one.

import { keyHint } from "./keys.js";

export const MENU_LABELS = {
    // Culto
    planejar: { label: "Planejar o culto", icon: "planner" },
    novoCulto: { label: "Novo culto", icon: "plus" },
    // Opening an editor (a page of the window: no "…")
    novaMusica: { label: "Nova música", icon: "plus" },
    novoAviso: { label: "Novo aviso", icon: "plus" },
    editar: { label: "Editar", icon: "edit" },
    editarNoPlanejador: { label: "Editar no planejador", icon: "edit" },
    // Files and links (they ask for a file or a link before acting)
    doComputador: { label: "Do computador…", icon: "folder" },
    youtube: { label: "Link do YouTube…", icon: "youtube" },
    // A YouTube link of the Mídia becomes a file (owner 2026-10-27; it acts
    // at once, the Terms question only before the very first download).
    baixarParaMidia: { label: "Baixar para a Mídia", icon: "download" },
    abrirNoYouTube: { label: "Abrir no YouTube", icon: "youtube" },
    // The KERYX package (src/lib/keryxPackage.js): Exportar… asks how (the
    // export dialog); Abrir… asks for the file.
    exportar: { label: "Exportar…", icon: "save" },
    abrirPacote: { label: "Abrir pacote do KERYX…", icon: "download" },
    // Themes and backgrounds: one name for the section ("Temas e fundos"),
    // "Fundos" for the background library alone.
    temasEFundos: { label: "Temas e fundos", icon: "palette" },
    fundos: { label: "Fundos", icon: "image" },
    // Ferramentas
    avisoRapido: { label: "Aviso rápido…", icon: "bell" },
    timers: { label: "Timers", icon: "clock" },
    // Help
    atalhos: { label: "Atalhos", icon: "keyboard", key: "help" },
    // Ajuda and Configurações › Dados › Suporte (it asks what happened first)
    relatar: { label: "Relatar um problema…", icon: "help" },
    // Rows and slides
    porNaPrevia: { label: "Pôr na prévia", icon: "prev" },
    // Starts the selection with that row marked (owner 2026-10-28, I3 = A:
    // the header's button shows only once a selection is on).
    selecionarVarios: { label: "Selecionar vários", icon: "listChecks" },
    enviarAoAr: { label: "Enviar ao ar", icon: "play", key: "send" },
    adicionarSetlist: { label: "Adicionar à setlist", icon: "plus" },
    favoritar: { label: "Favoritar", icon: "star" },
    tirarDosFavoritos: { label: "Tirar dos favoritos", icon: "star" },
    renomear: { label: "Renomear", icon: "edit", key: "rename" },
    excluir: { label: "Excluir…", icon: "trash" },
    tirar: { label: "Tirar…", icon: "x" },
    encerrar: { label: "Encerrar…", icon: "stop", key: "end" },
};

// A menu item from the table: { label, icon, kbd? } plus whatever the caller
// adds (onSelect, air, disabled, a different label, ...). `letters` is the
// church's "Teclas de uma letra", which the hints follow.
export function menuItem(id, extra = {}, letters = "on") {
    const m = MENU_LABELS[id];
    if (!m) throw new Error(`menuLabels: unknown action "${id}"`);
    const kbd = m.key ? keyHint(m.key, letters) : null;
    return { label: m.label, icon: m.icon, ...(kbd ? { kbd } : {}), ...extra };
}

export const labelOf = (id) => MENU_LABELS[id].label;
export const iconOf = (id) => MENU_LABELS[id].icon;
