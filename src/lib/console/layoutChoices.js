// What Ver and Configurações › Console offer: the module switches and the
// list densities. Plain data with no imports, so the church's preferences
// (src/lib/prefs/schema.js), which every output reads, never load the dock;
// layout.js re-exports both for the console.

// Camadas is a section above the Setlist in the wide tier's right column
// (owner's request, 2026-10-10; back there 2026-10-13); narrower, it is a
// drawer opened from the Programa. The Setlist is not a module: it is
// always on screen (the right column, else beside the Prévia). No ar, the
// strip of what is on air (2026-10-14), is one more switch.
export const MODULES = [
    ["lib", "Biblioteca"],
    ["slides", "Slides"],
    ["camadas", "Camadas"],
    ["temas", "Temas"],
    ["onair", "No ar"],
];

// List density (Ver › Densidade): confortável, 32 px rows with titles up to
// two lines; compacta, 28 px single lines and 28 px panel headers;
// automática (the default since 2026-10-14, the small-screen review):
// compacta when the console's grid is shorter than AUTO_COMPACT_H (a
// notebook), confortável otherwise. Saved with the layout.
export const DENSITIES = [["auto", "Automática"], ["comfortable", "Confortável"], ["compact", "Compacta"]];
