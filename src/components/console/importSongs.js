import { keryx } from "@/api/keryxClient";
import { songsFromFile, splitRepeated, importSummary } from "@/lib/songImport";
import { getPrefs } from "@/hooks/useUser";

// Song files from the computer (cifra, ChordPro, texto, JSON exportado,
// OpenLyrics/OpenLP): the Biblioteca's "+ › Do computador / Uma pasta
// inteira…" and the menu bar's Música › Importar uma pasta… What a file is
// comes from its content (songsFromFile); a song already in the library is
// left out. `say` tells the operator how it went.
export const SONG_FILE = /\.(txt|chordpro|cho|crd|pro|json|xml)$/i;
export const SONG_ACCEPT = ".txt,.chordpro,.cho,.crd,.pro,.json,.xml,text/plain";
export async function importSongFiles(files, say) {
    const rows = [];
    const bad = [];
    for (const file of files) {
        try {
            const found = songsFromFile(file.name, new Uint8Array(await file.arrayBuffer()), { lines: getPrefs().import_lines });
            if (found.length) rows.push(...found);
            else bad.push(file.name);
        } catch (err) { bad.push(`${file.name} (${err?.message || "falhou"})`); }
    }
    const existing = rows.length ? await keryx.entities.Song.list() : [];
    const { fresh, repeated } = splitRepeated(rows, existing);
    let made = 0;
    for (const row of fresh) {
        try { await keryx.entities.Song.create(row); made += 1; } catch (err) { bad.push(`${row.title} (${err?.message || "falhou"})`); }
    }
    say(importSummary({ made, repeated: repeated.length, bad }));
}
