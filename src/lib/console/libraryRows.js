// What a song's row in the Biblioteca says (Rodada G1, owner's pick B):
// the title on one line, a second line with the artist, the key and the
// length, each as the header's (+) says (Mostrar o artista / o tom / a
// duração: layout.libShowArtist, off at first, libShowKey and
// libShowLength, on) — and the flags as small badges at the end of the row,
// which the hover buttons replace. The artist always rides in the tooltip.

export const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// The glyph of a Media row, the same in the Biblioteca, the Mídia and the
// search palette (Rodada G1): a YouTube link is not a film, an audio file
// is the speaker (as in the Setlist), a PDF is a presentation.
const MEDIA_GLYPH = { video: "film", image: "image", gif: "image", pdf: "presentation", powerpoint: "presentation", audio: "volume" };
export const isYouTubeMedia = (m) => m?.type === "video" && /youtu.?be/.test(m.file_url || "");
export const mediaIcon = (m) => (isYouTubeMedia(m) ? "youtube" : MEDIA_GLYPH[m?.type] || "film");

// A badge is an icon with its words (tooltip and aria-label), in this order.
export const SONG_BADGES = {
    syncing: { id: "syncing", icon: "download", label: "Baixando o playback…" },
    synced: { id: "synced", icon: "synced", label: "Sincronizada" },
    duplicate: { id: "duplicate", icon: "copy", label: "Parece repetida", warn: true },
};

const isSynced = (song) => (song?.slides || []).some((x) => Number.isFinite(x?.start));

// song: the Song row; duplicate: it looks repeated (shared/syncDuplicates.mjs);
// syncing: its playback has not arrived from the sync yet; showArtist,
// showKey, showLength: the options.
export function songRow(song, { duplicate = false, syncing = false, showArtist = false, showKey = true, showLength = true } = {}) {
    const s = song || {};
    const artist = String(s.artist || "").trim();
    const meta = [showArtist && artist, showKey && s.song_key, showLength && s.duration && mmss(s.duration)].filter(Boolean).join(" · ");
    const badges = [
        syncing && SONG_BADGES.syncing,
        isSynced(s) && SONG_BADGES.synced,
        duplicate && SONG_BADGES.duplicate,
    ].filter(Boolean);
    const title = s.title || "";
    const tip = artist ? `${title} · ${artist}` : title;
    return { meta, badges, tip };
}
