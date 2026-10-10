// What each kind of screen draws from the live state (shared/live-state.mjs),
// as a view of it for ScreenRenderer: one renderer for every screen, each
// page only choosing which layers it shows.

// Letras (a tablet or TV with the song): the slides with their background,
// logo, overlays and alerts; not media, avisos or tools, which belong to the
// projector and the avisos screen. Tela preta and Logo still apply.
export const lyricView = (live) => (live ? { ...live, media: null, communication: null, tool: null } : live);

// A screen waiting for its own content (Vídeo with no clip): the live idle
// look (the church logo, or black, as the operator set it in Saídas), never a
// screen of its own; black while Tela preta is on.
export const standbyView = (live) => (live
    ? { ...live, screen: live.screen === "black" ? "black" : "show", content: null, media: null, communication: null, tool: null, overlays: [] }
    : live);

// The pastor's "next" in the service: the playable items after the one on
// air (the session's item, else its position `itemIndex`), at most `count`.
export function nextItems(items, session, count = 3) {
    if (!session || !Array.isArray(items) || !items.length) return [];
    const at = session.itemId ? items.findIndex((i) => i.id === session.itemId) : -1;
    const from = at >= 0 ? at + 1 : Number.isInteger(session.itemIndex) ? session.itemIndex + 1 : 0;
    return items.slice(from, from + count);
}
