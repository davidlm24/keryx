import { createContext, useContext } from "react";
import { keryx } from "@/api/keryxClient";
import { readSongFile, importPlan } from "@/lib/songImport";
import { getPrefs } from "@/hooks/useUser";

// Song files from the computer (cifra, ChordPro, texto, JSON exportado,
// OpenLyrics/OpenLP, the Holyrics JSON export): the Biblioteca's "+ › Do
// computador / Uma pasta inteira…" and the menu bar's Música › Importar uma
// pasta… pick the files, then ImportSongsDialog shows what will come in
// before anything is written (owner's marks 2026-10-20, the "Importar
// músicas" mockup). What a file is comes from its content (readSongFile).
export const SONG_FILE = /\.(txt|chordpro|cho|crd|pro|json|xml)$/i;
export const SONG_ACCEPT = ".txt,.chordpro,.cho,.crd,.pro,.json,.xml,text/plain";

// The console's door to the dialog: useImportSongs()(files).
export const ImportSongsContext = createContext(null);
const nobody = () => {};
export const useImportSongs = () => useContext(ImportSongsContext) || nobody;

// The folder a "Uma pasta inteira…" pick came from ("" for loose files).
export const pickedFolder = (files) => String(files[0]?.webkitRelativePath || "").split("/").slice(0, -1)[0] || "";

// Every file read, against the library as it is now. -> { files, plan }
export async function readImport(files) {
    const lines = getPrefs().import_lines;
    const read = [];
    for (const file of files) {
        try { read.push({ name: file.name, ...readSongFile(file.name, new Uint8Array(await file.arrayBuffer()), { lines }) }); }
        catch (err) { read.push({ name: file.name, error: err?.message || "falhou" }); }
    }
    const existing = read.some((f) => f.rows?.length) ? await keryx.entities.Song.list() : [];
    return { files: read, plan: importPlan(read, existing) };
}

// The chosen rows into the library, 100 at a time: one transaction and one
// change event each (store.cjs bulkCreate), so a 2,000-song library does
// not redraw the console 2,000 times. A batch that fails is retried one by
// one to name the songs that did not go in.
// -> { made, failed: ["title (reason)"] }
const BATCH = 100;
export async function createSongs(rows, onProgress) {
    let made = 0;
    const failed = [];
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        try { await keryx.entities.Song.bulkCreate(batch); made += batch.length; }
        catch {
            for (const row of batch) {
                try { await keryx.entities.Song.create(row); made += 1; } catch (err) { failed.push(`${row.title} (${err?.message || "falhou"})`); }
            }
        }
        onProgress?.(Math.min(rows.length, i + BATCH));
    }
    return { made, failed };
}
