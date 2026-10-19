// What a song's row in the Biblioteca says (Rodada G1, owner's pick B):
// the title on one line, a second line with only the key and the length —
// the artist first when "Mostrar o artista" is on (layout.libShowArtist,
// the header's (+)) — and the flags as small badges at the end of the row,
// which the hover buttons replace. The artist always rides in the tooltip.

export const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

// A badge is an icon with its words (tooltip and aria-label), in this order.
export const SONG_BADGES = {
    syncing: { id: "syncing", icon: "download", label: "Baixando o playback…" },
    synced: { id: "synced", icon: "clock", label: "Sincronizada" },
    duplicate: { id: "duplicate", icon: "copy", label: "Parece repetida", warn: true },
};

const isSynced = (song) => (song?.slides || []).some((x) => Number.isFinite(x?.start));

// song: the Song row; duplicate: it looks repeated (shared/syncDuplicates.mjs);
// syncing: its playback has not arrived from the sync yet; showArtist: the option.
export function songRow(song, { duplicate = false, syncing = false, showArtist = false } = {}) {
    const s = song || {};
    const artist = String(s.artist || "").trim();
    const meta = [showArtist && artist, s.song_key, s.duration && mmss(s.duration)].filter(Boolean).join(" · ");
    const badges = [
        syncing && SONG_BADGES.syncing,
        isSynced(s) && SONG_BADGES.synced,
        duplicate && SONG_BADGES.duplicate,
    ].filter(Boolean);
    const title = s.title || "";
    const tip = artist ? `${title} · ${artist}` : title;
    return { meta, badges, tip };
}
