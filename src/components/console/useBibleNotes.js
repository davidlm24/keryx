import { useCallback, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { parseReference } from "@/lib/bibleBooks";

const KEY = ["console", "bibleNotes"];
const LOCAL = "keryx.console.bible";

// Favourites and notes of the Bíblia environment, as BibleNote rows (they
// live in the database, so a reinstall or another window keeps them):
// note_type "favorite" for a reference (a verse or a range), "note" for the
// text the operator wrote on one verse. Highlights are not offered.
export function useBibleNotes() {
    const client = useQueryClient();
    useEffect(() => keryx.entities.BibleNote.subscribe(() => client.invalidateQueries({ queryKey: KEY })), [client]);
    const rows = useQuery({ queryKey: KEY, queryFn: () => keryx.entities.BibleNote.list("-updated_date", 1000) }).data;
    const all = useMemo(() => rows || [], [rows]);
    const favorites = useMemo(() => all.filter((n) => n.note_type === "favorite"), [all]);
    const notes = useMemo(() => all.filter((n) => n.note_type === "note" && String(n.note_text || "").trim()), [all]);
    const refresh = () => client.invalidateQueries({ queryKey: KEY });

    // The favourites the console kept in this browser before: moved into
    // the database once, then forgotten locally.
    useEffect(() => {
        if (!rows) return;
        let mem;
        try { mem = JSON.parse(localStorage.getItem(LOCAL) || "{}"); } catch { return; }
        const local = Array.isArray(mem.favs) ? mem.favs : [];
        if (!local.length) return;
        const have = new Set(rows.filter((n) => n.note_type === "favorite").map((n) => n.reference));
        const missing = local.filter((ref) => !have.has(ref));
        try { localStorage.setItem(LOCAL, JSON.stringify({ ...mem, favs: [] })); } catch { /* kept for the next time */ }
        Promise.all(missing.map((reference) => {
            const r = parseReference(reference);
            return keryx.entities.BibleNote.create({ reference, note_type: "favorite", ...(r ? { book: r.book, chapter: r.chapter, verse: r.verseStart || null } : {}) });
        })).then(refresh).catch(() => {});
    }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps

    const noteOf = useCallback((book, chapter, verse) => notes.find((n) => n.book === book && Number(n.chapter) === Number(chapter) && Number(n.verse) === Number(verse)) || null, [notes]);
    const versesWithNotes = useCallback((book, chapter) => new Set(notes.filter((n) => n.book === book && Number(n.chapter) === Number(chapter)).map((n) => Number(n.verse))), [notes]);
    const isFavorite = useCallback((reference) => favorites.some((f) => f.reference === reference), [favorites]);

    const toggleFavorite = useCallback(async ({ reference, book, chapter, verse, text }) => {
        const found = favorites.find((f) => f.reference === reference);
        if (found) await keryx.entities.BibleNote.delete(found.id);
        else await keryx.entities.BibleNote.create({ reference, book, chapter, verse, verse_text: text || "", note_type: "favorite" });
        refresh();
        return !found;
    }, [favorites]); // eslint-disable-line react-hooks/exhaustive-deps

    // Writes the note of one verse; an empty text removes it. -> "saved" | "removed" | null
    const saveNote = useCallback(async ({ book, chapter, verse, text, verseText }) => {
        const t = String(text || "").trim();
        const found = all.find((n) => n.note_type === "note" && n.book === book && Number(n.chapter) === Number(chapter) && Number(n.verse) === Number(verse));
        if (!t && !found) return null;
        if (!t) { await keryx.entities.BibleNote.delete(found.id); refresh(); return "removed"; }
        if (found && found.note_text === t) return null;
        if (found) await keryx.entities.BibleNote.update(found.id, { note_text: t });
        else await keryx.entities.BibleNote.create({ reference: `${book} ${chapter}:${verse}`, book, chapter, verse, verse_text: verseText || "", note_type: "note", note_text: t });
        refresh();
        return "saved";
    }, [all]); // eslint-disable-line react-hooks/exhaustive-deps

    return { favorites, notes, noteOf, versesWithNotes, isFavorite, toggleFavorite, saveNote };
}
