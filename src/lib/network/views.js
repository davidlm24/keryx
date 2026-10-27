// What each kind of screen draws from the live state (shared/live-state.mjs),
// as a view of it for ScreenRenderer: one renderer for every screen, each
// page only choosing which layers it shows.
//
// Since Rodada H2 (owner 2026-10-19) the outputs are filtered by their content
// rule ("O que esta tela recebe", applyRule in src/lib/outputPrefs.js), whose
// starting point per page (PAGE_RULES) is what these views drew: they stay as
// the record of it and for the Prévia rail's names and icons, not as the filter.

// Every output's one factory name, the same the main process gives its
// windows (Saídas, Telas e saídas, Verificar) and the network's start page.
import OUTPUT_NAMES from "../../../shared/outputNames.json" with { type: "json" };
export { OUTPUT_NAMES };

// Letras (a tablet or TV with the song): the slides with their background,
// logo, overlays and alerts; not media, presentations (a PDF's pages go
// where pictures go), avisos or tools, which belong to the projector and the
// avisos screen. Tela preta and Logo still apply.
export const lyricView = (live) => (live
    ? { ...live, media: null, communication: null, tool: null, ...(live.content?.kind === "presentation" ? { content: null } : {}) }
    : live);

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
export const videoView = (live) => (live && live.video ? withAlert({ screen: "show", video: live.video, idle: live.idle, idleUrl: live.idleUrl, idleDim: live.idleDim, idleBlur: live.idleBlur, idleLook: live.idleLook }, live) : standbyView(live));

// Avisos: only the aviso on air (and the Aviso rápido); nothing (null) when
// there is neither. With the change it comes from (rev, updatedAt, fade), so
// the screen fades as the projector does (Rodada G5: the next aviso of a list).
const changeOf = (live) => (live.rev === undefined ? {} : { rev: live.rev, updatedAt: live.updatedAt, fade: live.fade ?? null });
export const noticeView = (live) => (live && live.communication ? withAlert({ screen: "show", communication: live.communication, ...changeOf(live) }, live)
    : live?.alert ? { screen: "show", alert: live.alert, ...changeOf(live) } : null);

// The outputs drawn by ScreenRenderer, and what each shows from a live state:
// the console's Prévia rail previews a stage "as that output will show it".
export const OUTPUT_VIEWS = [
    { key: "/Projection", name: OUTPUT_NAMES["/Projection"], icon: "projector", view: (live) => live },
    { key: "/LyricProjection", name: OUTPUT_NAMES["/LyricProjection"], icon: "tv", view: lyricView },
    { key: "/VideoProjection", name: OUTPUT_NAMES["/VideoProjection"], icon: "film", view: videoView },
    { key: "/CommunicationProjection", name: OUTPUT_NAMES["/CommunicationProjection"], icon: "megaphone", view: noticeView },
];

export function outputView(key, live) {
    const out = OUTPUT_VIEWS.find((o) => o.key === key) || OUTPUT_VIEWS[0];
    return out.view(live);
}

// The screens with a layout of their own (not ScreenRenderer views), which the
// Prévia rail draws with the pages' own screen components.
export const SCREEN_PAGES = [
    { key: "/StageView", name: OUTPUT_NAMES["/StageView"], icon: "monitor" },
    { key: "/PastorView", name: OUTPUT_NAMES["/PastorView"], icon: "tablet" },
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
