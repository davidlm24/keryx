import { keryx } from "@/api/keryxClient";
import { songsFromFile } from "@/lib/songImport";
import { getPrefs } from "@/hooks/useUser";

// Song files from the computer (cifra, ChordPro, texto, JSON exportado):
// the Biblioteca's "+ › Do computador / Uma pasta inteira…" and the menu
// bar's Música › Importar uma pasta… `say` tells the operator how it went.
export const SONG_FILE = /\.(txt|chordpro|cho|crd|pro|json)$/i;
export async function importSongFiles(files, say) {
    let made = 0;
    const bad = [];
    for (const file of files) {
        try {
            const rows = songsFromFile(file.name, await file.text(), { lines: getPrefs().import_lines });
            for (const row of rows) { await keryx.entities.Song.create(row); made += 1; }
            if (!rows.length) bad.push(file.name);
        } catch (err) { bad.push(`${file.name} (${err?.message || "falhou"})`); }
    }
    say(made ? `${made} ${made === 1 ? "música importada" : "músicas importadas"}${bad.length ? ` · não deu: ${bad.join(", ")}` : ""}.` : `Nenhuma letra encontrada em ${bad.join(", ") || "nenhum arquivo"}.`);
}
