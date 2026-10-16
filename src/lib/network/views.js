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

// Every screen shows the Aviso rápido (Rodada E3: one bar on every output,
// each in its own look; the output's Mostrar can leave it out).
const withAlert = (view, live) => (live?.alert ? { ...view, alert: live.alert } : view);

// Vídeo: the clip on the video channel while there is one (the page plays it
// full screen, whatever Tela preta says), else the idle look.
export const videoView = (live) => (live && live.video ? withAlert({ screen: "show", video: live.video, idle: live.idle, idleUrl: live.idleUrl, idleDim: live.idleDim, idleBlur: live.idleBlur }, live) : standbyView(live));

// Avisos: only the aviso on air (and the Aviso rápido); nothing (null) when
// there is neither.
export const noticeView = (live) => (live && live.communication ? withAlert({ screen: "show", communication: live.communication }, live)
    : live?.alert ? { screen: "show", alert: live.alert } : null);

// The outputs drawn by ScreenRenderer, and what each shows from a live state:
// the console's Prévia rail previews a stage "as that output will show it".
export const OUTPUT_VIEWS = [
    { key: "/Projection", name: "Projeção", icon: "projector", view: (live) => live },
    { key: "/LyricProjection", name: "Letras", icon: "tv", view: lyricView },
    { key: "/VideoProjection", name: "Vídeo", icon: "film", view: videoView },
    { key: "/CommunicationProjection", name: "Avisos", icon: "megaphone", view: noticeView },
];

export function outputView(key, live) {
    const out = OUTPUT_VIEWS.find((o) => o.key === key) || OUTPUT_VIEWS[0];
    return out.view(live);
}

// The screens with a layout of their own (not ScreenRenderer views), which the
// Prévia rail draws with the pages' own screen components.
export const SCREEN_PAGES = [
    { key: "/StageView", name: "Palco", icon: "monitor" },
    { key: "/PastorView", name: "Pastor", icon: "tablet" },
];
export const RAIL_VIEWS = [...OUTPUT_VIEWS, ...SCREEN_PAGES];

// The session the pastor's screen would see once a prepared stage goes on
// air: the live one, at the stage's Setlist item when it has one (so "Próximo"
// lists what follows it), or just that item when nothing has started.
export function previewSession(session, ref) {
    const itemId = ref?.serviceItemId || null;
    if (!session) return itemId ? { itemId, itemIndex: Number.isInteger(ref.serviceItemIndex) ? ref.serviceItemIndex : null } : null;
    return itemId ? { ...session, itemId, itemIndex: Number.isInteger(ref.serviceItemIndex) ? ref.serviceItemIndex : session.itemIndex } : session;
}
