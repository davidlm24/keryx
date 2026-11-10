// "Marcar os tempos com uma letra…" (owner 2026-11-10): from a video or an
// audio of the Mídia, the song whose lyric times are marked with it. The
// songs that already use the file come first; then every song, by what was
// typed (no case, no accents). Pure: SongPickDialog.jsx draws it.

const key = (v) => String(v || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// A video or an audio of the computer (not a YouTube link, which does not
// play hidden under the lyrics; not a picture, a PDF, a background or a font).
export function marksWith(m) {
    if (!m || m.category === "background" || m.category === "font") return false;
    if (m.type !== "video" && m.type !== "audio") return false;
    return !/youtu\.?be/.test(String(m.file_url || ""));
}

// The songs whose video or playback is this file.
export const songsUsing = (m, songs = []) => (m?.file_url ? songs.filter((s) => s.audio_url === m.file_url) : []);

// The picker's two groups for `query`: { using, others } (others without the
// ones already using it), each by title in pt-BR order, `others` cut at `n`.
export function songPick(m, songs = [], query = "", n = 60) {
    const want = key(query);
    const fits = (s) => !want || key(s.title).includes(want) || key(s.artist).includes(want);
    const byTitle = (a, b) => String(a.title || "").localeCompare(String(b.title || ""), "pt-BR");
    const using = songsUsing(m, songs).filter(fits).sort(byTitle);
    const ids = new Set(using.map((s) => s.id));
    const others = songs.filter((s) => !ids.has(s.id) && fits(s)).sort(byTitle).slice(0, n);
    return { using, others };
}

// What the picker says beside a song: whether it has another video or
// playback (choosing it swaps), or none.
export const songMediaNote = (s, m) => (!s?.audio_url ? "" : s.audio_url === m?.file_url ? "usa este arquivo" : "tem outro vídeo ou playback");
