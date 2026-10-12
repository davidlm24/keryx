// Configurações' sections, in the order of the left column, and the tabs of
// Aparência. Pure (no React), so the ids and their old names are tested;
// SettingsView maps each id to its component. The name is the panel's title
// too (the smoke compares them).
export const SECTIONS = [
    { id: "igreja", icon: "logo", name: "Igreja" },
    { id: "telas", icon: "monitor", name: "Telas e saídas" },
    { id: "rede", icon: "wifi", name: "Telas na rede" },
    { id: "aparencia", icon: "palette", name: "Aparência" },
    { id: "biblia", icon: "book", name: "Bíblia e músicas" },
    { id: "culto", icon: "clock", name: "Culto" },
    { id: "console", icon: "keyboard", name: "Console" },
    { id: "backup", icon: "save", name: "Backup e atualizações" },
];

export const APPEARANCE_TABS = [["geral", "Geral"], ["temas", "Temas"], ["fundos", "Fundos"]];

// Ids of older versions, still in links (?config=), in notifications saved
// in settings.json ("settings:dados") and in muscle memory.
const ALIASES = {
    biblias: { id: "biblia" },
    temas: { id: "aparencia", tab: "temas" },
    fundos: { id: "aparencia", tab: "fundos" },
    dados: { id: "backup" },
    letras: { id: "biblia" },
};

// -> { id, tab }: the section to show (Telas e saídas when the id is
// unknown) and, for Aparência, which tab (Geral unless said).
export function resolveSection(raw) {
    const [head, sub] = String(raw || "").split("/");
    const alias = ALIASES[head];
    const id = alias?.id || (SECTIONS.some((s) => s.id === head) ? head : "telas");
    if (id !== "aparencia") return { id, tab: null };
    const tab = sub || alias?.tab || "geral";
    return { id, tab: APPEARANCE_TABS.some(([k]) => k === tab) ? tab : "geral" };
}

export const sectionOf = (id) => SECTIONS.find((s) => s.id === id) || SECTIONS[1];
