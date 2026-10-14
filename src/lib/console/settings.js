// Configurações' sections, in the order of the left column. Pure (no React),
// so the ids and their old names are tested; SettingsView maps each id to
// its component. The name is the panel's title too (the smoke compares them).
// Shorter since 2026-10-12 (owner's request): Temas is a section of its own
// (Aparência has no tabs; its backgrounds are managed in the library), and
// Telas e saídas has a vertical tab per output.
export const SECTIONS = [
    { id: "igreja", icon: "logo", name: "Igreja" },
    { id: "telas", icon: "monitor", name: "Telas e saídas" },
    { id: "rede", icon: "wifi", name: "Telas na rede" },
    { id: "aparencia", icon: "palette", name: "Aparência" },
    { id: "temas", icon: "layers", name: "Temas" },
    { id: "biblia", icon: "book", name: "Bíblia e músicas" },
    { id: "culto", icon: "clock", name: "Culto" },
    { id: "console", icon: "keyboard", name: "Console" },
    { id: "backup", icon: "save", name: "Backup e atualizações" },
    { id: "sobre", icon: "info", name: "Sobre" },
];

// Where a section's settings live: "church" rides the database (and the
// backup), "machine" stays on this computer (settings.json, windows, the
// network). Console is mixed: its rows say it one by one.
export const SECTION_SCOPE = {
    igreja: "church", aparencia: "church", temas: "church", biblia: "church", culto: "church",
    telas: "machine", rede: "machine", backup: "machine", console: "mixed",
};
export const SCOPE_LABEL = { church: "da igreja · viaja no backup", machine: "deste computador" };

// Ids of older versions, still in links (?config=), in notifications saved
// in settings.json ("settings:dados") and in muscle memory.
const ALIASES = {
    biblias: { id: "biblia" },
    fundos: { id: "aparencia" },
    dados: { id: "backup" },
    letras: { id: "biblia" },
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

