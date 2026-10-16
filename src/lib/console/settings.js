// Configurações' sections, in the order of the left column. Pure (no React),
// so the ids and their old names are tested; SettingsView maps each id to
// its component. The name is the panel's title too (the smoke compares them).
// Shorter since 2026-10-12 (owner's request); Aparência dissolved in the
// Rodada B 2026-10-14 (F3 = A): the library button lives in Temas e fundos,
// the papel de parede fallback and the Tela ociosa in Culto › Fora do ar,
// the item's title in the Editor de temas, the YouTube bar in Telas e
// saídas.
export const SECTIONS = [
    { id: "igreja", icon: "logo", name: "Igreja" },
    { id: "telas", icon: "monitor", name: "Telas e saídas" },
    { id: "rede", icon: "wifi", name: "Telas na rede" },
    { id: "temas", icon: "palette", name: "Temas e fundos" },
    { id: "biblia", icon: "book", name: "Bíblia e músicas" },
    { id: "culto", icon: "clock", name: "Culto" },
    { id: "console", icon: "keyboard", name: "Console" },
    // Between the church's computers, through a shared folder (§8b; owner 2026-10-16).
    { id: "sincronizacao", icon: "cloud", name: "Sincronização" },
    { id: "backup", icon: "save", name: "Backup e atualizações" },
    { id: "sobre", icon: "info", name: "Sobre" },
];

// Where a section's settings live: "church" rides the database (and the
// backup), "machine" stays on this computer (settings.json, windows, the
// network). Console is mixed: its rows say it one by one.
export const SECTION_SCOPE = {
    igreja: "church", temas: "church", biblia: "church", culto: "church",
    telas: "machine", rede: "machine", sincronizacao: "machine", backup: "machine", console: "mixed",
};
export const SCOPE_LABEL = { church: "da igreja · viaja no backup", machine: "deste computador" };

// Ids of older versions, still in links (?config=), in notifications saved
// in settings.json ("settings:dados") and in muscle memory.
const ALIASES = {
    biblias: { id: "biblia" },
    // Aparência dissolved (Rodada B 2026-10-14): its wallpaper and Tela
    // ociosa live in Culto, the backgrounds' library button in Temas.
    aparencia: { id: "culto" },
    fundos: { id: "temas" },
    dados: { id: "backup" },
    letras: { id: "biblia" },
    sync: { id: "sincronizacao" },
};

// -> { id, tab }: the section to show (Telas e saídas when the id is
// unknown) and, for Telas e saídas, which tab (null: the first output).
// "aparencia/temas" (Aparência had tabs) opens Temas.
export function resolveSection(raw) {
    const s = String(raw || "");
    const cut = s.indexOf("/");
    const head = cut < 0 ? s : s.slice(0, cut);
    const sub = cut < 0 ? "" : s.slice(cut + 1);
    if (head === "aparencia" && sub === "temas") return { id: "temas", tab: null };
    const id = ALIASES[head]?.id || (SECTIONS.some((x) => x.id === head) ? head : "telas");
    // Telas e saídas lost its tabs (2026-10-13, thumbnails): an old
    // ?config=telas/<tab> link opens the section.
    return { id, tab: null };
}

export const sectionOf = (id) => SECTIONS.find((s) => s.id === id) || SECTIONS[1];

