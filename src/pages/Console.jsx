import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mediaFromYouTube } from "@/lib/mediaImport";
import "@ds/tokens.css";
import "@ds/components/bundle.css";
import "@/components/console/console.css";
import { keryx } from "@/api/keryxClient";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { usePosterBackfill } from "@/hooks/usePosterBackfill";
import { useUser, usePrefs, getPrefs, updateUser, useMigratePrefs } from "@/hooks/useUser";
import { defaultFundo, defaultFundoArgs, serviceFundo, fundoGoesOnNow } from "@/lib/console/defaultFundo";
import { serviceTheme, lookFields, lookOf } from "@/lib/console/serviceLook";
import { themeInUseSeed, defaultTheme, themeName } from "@/lib/console/themes";
import { hiddenList, hiddenMap } from "@/lib/prefs/schema";
import { useConsole, LOCKED_SAY } from "@/components/console/useConsole";
import { withBackgroundDefaults } from "@/lib/console/backgroundPrefs";
import { useAudioFeed } from "@/components/console/useAudioFeed";
import { useLibrary, useRundown, useOutputs, useShowForecast, pickDefaultService } from "@/components/console/useConsoleData";
import { Panel, IconBtn, Measure, Seg, WinCtx } from "@/components/console/kx";
import TopBar from "@/components/console/TopBar";
import { MenuBarPop } from "@/components/console/MenuBar";
import { buildMenus, songInHand } from "@/lib/console/menuBar";
import { importSongFiles, SONG_FILE } from "@/components/console/importSongs";
import { exportServiceToPdf } from "@/utils/servicePdfExport";
import { useChurch } from "@/hooks/useChurch";
import Library from "@/components/console/Library";
import SlidesPanel, { handTitle, handIsPrev } from "@/components/console/SlidesPanel";
import OnAirPanel, { onAirCount } from "@/components/console/OnAirPanel";
import CenterPanel, { PreviaPanel, PlayerSlot, captionOf, ProgramaPill } from "@/components/console/CenterPanel";
import { outputHealth, localId } from "@/lib/console/outputs";
import Rundown, { plannedTimes } from "@/components/console/Rundown";
import Layers from "@/components/console/Layers";
import PromptDialog from "@/components/console/PromptDialog";
import { timerChoices, minutesLabel } from "@/lib/console/timerPresets";
import ThemeStrip from "@/components/console/ThemeStrip";
import BibleEnv, { bibleVersionWanted } from "@/components/console/BibleEnv";
import BibleQuickJump from "@/components/console/BibleQuickJump";
import VerifyView from "@/components/console/VerifyView";
import LyricsSearch from "@/components/console/LyricsSearch";
import { winPage } from "@/components/console/WinPages";
import { openEditor, setEditorHost } from "@/lib/editorWindow";
import { relaySend, relayListen } from "@/lib/janelaRelay";
import { WinEdges, useWinState, setWinState } from "@/components/console/winLayout";
import { withSize } from "@/lib/console/winLayout";
import { PAGE_TITLES, winSize, openStack, push as winPush, pop as winPop, top as winTopOf, replaceTop as winReplaceTop, stackFromParams, detachSpec, janelaName } from "@/lib/console/nav";
import { setIdleMode } from "@/lib/console/idle";
import { resolveSection } from "@/lib/console/settings";
import { newServiceDefaults, defaultDuration } from "@/lib/console/serviceDefaults";
import { ContextMenuProvider, ContextMenuLayer, menuRequest } from "@/components/console/ContextMenu";
import BackgroundLibrary from "@/components/console/library/BackgroundLibrary";
import { LibraryContext } from "@/components/console/library/libraryContext";
import ConfirmDialog, { ConfirmContext } from "@/components/console/ConfirmDialog";
import { Menu, Shortcuts, Outputs, History, EndDialog, Palette, UpdateDialog, Notifications, WhatsNew, TabsMenu } from "@/components/console/Popovers";
import TabsPanel, { TabsPlus } from "@/components/console/TabsPanel";
import { DEFAULT_TABS, shownTabs, activeTab, toggleTab, showTab } from "@/lib/console/panelTabs";
import { useUpdates } from "@/components/console/useUpdates";
import { shouldOpenOnLaunch, hasUpdate } from "@/lib/console/updates";
import { loadLayout, saveLayout, DEFAULT_LAYOUT, MODULES as VER_LIST, tierFor, shownDensity, panelHead, restoreEnv, switchTier } from "@/lib/console/layout";
import { MODULES as DOCK_MODULES, fromArrangement, fromBibleArrangement, defaultDock, normalizeDock, fitDock, goneModules, onAirHeight, moveModules, hideModule, returnModule, isPinned, trayFlags, applyTrayFlags, canTray, leaves, pathOf , moveBand, dockMode, setDockMode } from "@/lib/console/dock";
import { pickTile } from "@/lib/console/multiview";
import { useRailViews } from "@/hooks/useOutputPref";
import { EditBanner } from "@/components/console/Arrange";
import DockView, { useDockDrag, DockHint, DockTray, DockPresetsBar, ZONE_LABEL } from "@/components/console/Dock";
import { addPreset, updatePreset, removePreset, presetOf, presetChanged, presetsFor, nameProblem } from "@/lib/console/dockPresets";
import { deleteQuestion } from "@/components/console/ConfirmDialog";
import { liveAction, quickJumpKey, escapeTarget } from "@/lib/console/keys";
import { playerLayer, playerOp } from "@/lib/console/player";
import { OVERLAY_LIMIT } from "@/lib/console/overlays";
import { stageFromVerses, stageFromSong, stageFromPassage, stageFromMedia, stageFromPiece, stageFromMaterial, stageFromText, stageFromTool, stageAt, stageAirSlide, liveStageId } from "@/lib/console/stage";
import { plan, playableItems, isSection, total } from "@/lib/console/setlist";
import { serviceTiming, serviceClock } from "@/lib/console/timeline";
import { referenceNums, passageOf } from "@/lib/console/bibleVerses";
import { readChapter } from "@/lib/bibleText";
import { formatReference, parseReference } from "@/lib/bibleBooks";
import { remoteState, remoteSay, passagePreview } from "@/lib/console/remote";

// The modules Ver (and Configurações › Console) show or hide: in the culto's
// dock, in or out of the tray, on this computer (owner 2026-10-13). The
// church's old preference (console_hidden_modules) only seeds a console
// whose arrangement was never changed.
const VER_MODULES = VER_LIST.map(([id]) => id);

const LOG_KEY = (serviceId) => `keryx.console.log.${serviceId}`;
const loadLog = (serviceId) => { try { return JSON.parse(localStorage.getItem(LOG_KEY(serviceId)) || "{}"); } catch { return {}; } };

// The operator console, driving the live state (shared/live-state.mjs)
// through useConsole: one console, always ready, as in Holyrics. Two
// environments (KERYX: projection, Bíblia); rehearsing is "Travar telas" (Saídas).
// Preparing is safe while live — a click or a drag only fills the Prévia;
// only Enter, a double click or "Enviar ao ar" change the screens. The
// readiness check (VerifyView) opens on demand from the Saídas popover.
// docs/design-system.md is the look; docs/desktop-architecture.md the plumbing.
export default function Console() {
    const c = useConsole();
    // A generated background following the sound: the console feeds the level.
    useAudioFeed(c.live);
    const logoUrl = useChurchLogo();
    const data = useLibrary();
    // Every video's still (Media.thumbnail_url), the background library's too.
    const allMedia = useMemo(() => [...data.media, ...data.backgroundMedia], [data.media, data.backgroundMedia]);
    usePosterBackfill(allMedia);
    const [profile, setProfile] = useState("");
    const [quick, setQuick] = useState(null);
    // The layer the player controls when several play (null: the newest).
    const [playerPick, setPlayerPick] = useState(null);
    // The Bible environment's selection, as a stage: what Enter sends there.
    const bibleStageRef = useRef(null);
    // Camadas' + (its panel header): adds a NEW text overlay, up to
    // OVERLAY_LIMIT (Layers.jsx; owner 2026-10-14).
    const addOverlayRef = useRef(null);
    // Temas' + and library (its panel header): the strip's own menu (ThemeStrip.jsx).
    const themeMenuRef = useRef(null);
    // The Bible environment's selection cursor (↑/↓ from the console's keys).
    const bibleApiRef = useRef(null);
    // ?env=biblia (the old /Bible page on desktop) opens the Bíblia environment.
    const [env, setEnvState] = useState(() => {
        try { return new URLSearchParams(window.location.search).get("env") === "biblia" ? "biblia" : "culto"; } catch { return "culto"; }
    });
    // THE window (Rodada C, owner 2026-10-14: "uma janela, com Voltar"):
    // Configurações, the six views and the two editors are pages of one
    // floating window, stacked by src/lib/console/nav.js. Opening from
    // inside pushes a level ("← de onde veio"); Esc, the Voltar chip and
    // the scrim pop one level (the first closes); the (x) closes the whole
    // stack. Every exit goes through the TOP page's registered request
    // (its escRef below), so an unsaved guard can ask instead of leaving.
    // The old pages land here on desktop: /Settings ?config=telas, /Home
    // ?song=new, /Services ?planner=<id>, /Media ?media=1, /Communication
    // ?lib=avisos, /BibleSchool ?school=1, /Analytics ?reports=1.
    const [win, setWin] = useState(() => {
        try { return stackFromParams(new URLSearchParams(window.location.search)) || []; } catch { return []; }
    });
    const winStateRef = useRef(win);
    winStateRef.current = win;
    const winTop = winTopOf(win);
    const winOpen = win.length > 0;
    // The window stretches by its edges and corners (owner 2026-10-15,
    // Rodada D3): one size per kind (Padrão, Editor) kept on this computer
    // (winLayout.js); where it was dragged to holds until the kind changes,
    // the window closes or the console is resized. A double click on the
    // bar's empty area brings the default size back.
    const winKind = winOpen ? winSize(win) : null;
    const winDialogRef = useRef(null);
    const [winRect, setWinRect] = useState(null);
    useEffect(() => { setWinRect(null); }, [winKind]);
    useEffect(() => {
        const off = () => setWinRect(null);
        window.addEventListener("resize", off);
        return () => window.removeEventListener("resize", off);
    }, []);
    const winSaved = useWinState().sizes[winKind];
    const winStyle = winRect ? { left: winRect.x, top: winRect.y, width: winRect.w, height: winRect.h, transform: "none" }
        : winSaved ? { "--win-w": `${winSaved.w}px`, "--win-h": `${winSaved.h}px` } : undefined;
    const resetWinSize = () => { setWinRect(null); setWinState((st) => withSize(st, winKind, null)); };
    // One escRef per stack entry: pages under the top stay mounted (Voltar
    // finds them as they were), so each keeps its own request.
    const winRefs = useRef(new Map());
    const winRef = (k) => { if (!winRefs.current.has(k)) winRefs.current.set(k, { current: null }); return winRefs.current.get(k); };
    useEffect(() => {
        const keys = new Set(win.map((e) => e.key));
        for (const k of [...winRefs.current.keys()]) if (!keys.has(k)) winRefs.current.delete(k);
    }, [win]);
    // ⧉ Destacar em janela (Rodada F5, owner 2026-10-16: every page): a
    // detach under way — the levels still to leave (top last) and where they
    // go (nav.js detachSpec). Each level leaves through its own guard
    // (winCloser below); a "Continuar" anywhere drops it.
    const detaching = useRef(null);
    // What a page's guard calls once leaving is allowed: pop (or close, at
    // the first level); all = the (x), the whole stack.
    const leaveTop = useCallback((all = false) => setWin((s) => (all || s.length <= 1 ? [] : winPop(s))), []);
    // Esc, the scrim, the Voltar chip and the (x) all go through the top
    // page's request; a page that registered none just leaves.
    const winEsc = useCallback((mode = "esc") => {
        const t = winTopOf(winStateRef.current);
        if (!t) return;
        if (mode !== "detach") detaching.current = null;
        const fn = winRefs.current.get(t.key)?.current;
        if (fn) fn(mode); else leaveTop(mode === "all");
    }, [leaveTop]);
    const setEnv = useCallback((v) => { setWin([]); setEnvState(typeof v === "function" ? v(env) : v); }, [env]);
    // Configurações: a window over whatever is on screen (the console or a
    // view), with its section (and Aparência's tab); ?config=<section> opens
    // it at launch. Old ids still work (resolveSection).
    const [cfgAt, setCfgAt] = useState(() => {
        try {
            const s = new URLSearchParams(window.location.search).get("config");
            return s ? resolveSection(s) : null;
        } catch { return null; }
    });
    const cfg = cfgAt?.id || null;
    const setCfg = useCallback((id, tab) => setCfgAt(id ? resolveSection(tab ? `${id}/${tab}` : id) : null), []);
    // The section only lives while the window holds the Configurações page.
    useEffect(() => { if (!win.some((e) => e.page === "config")) setCfgAt(null); }, [win]);
    // The background library (library/BackgroundLibrary.jsx): one window
    // that every background or theme picker opens and awaits.
    const [libReq, setLibReq] = useState(null);
    const pickFromLibrary = useCallback((opts = {}) => new Promise((resolve) => {
        setLibReq((prev) => { prev?.resolve(null); return { ...opts, resolve }; });
    }), []);
    const closeLibrary = useCallback((result = null) => setLibReq((prev) => { prev?.resolve(result); return null; }), []);
    // "Excluir…" asks first (ConfirmDialog.jsx): one question at a time.
    const [confirmReq, setConfirmReq] = useState(null);
    // A text question from a panel's + menu (PromptDialog): the text, or null.
    const [ask, setAsk] = useState(null);
    const askText = useCallback((spec) => new Promise((resolve) => setAsk({ ...spec, resolve })), []);
    const answerAsk = useCallback((value) => setAsk((prev) => { prev?.resolve(value ?? null); return null; }), []);
    const askConfirm = useCallback((opts) => new Promise((resolve) => setConfirmReq((prev) => { prev?.resolve(false); return { ...opts, resolve }; })), []);
    const answerConfirm = useCallback((yes) => {
        // "Continuar" to an unsaved guard: a detach under way stays here.
        if (!yes) detaching.current = null;
        setConfirmReq((prev) => { prev?.resolve(Boolean(yes)); return null; });
    }, []);
    // The right-click menu open now (ContextMenu.jsx), first in the Esc order.
    const [ctxMenu, setCtxMenu] = useState(null);
    const openMenu = useCallback((e, spec) => { e.preventDefault(); e.stopPropagation(); setCtxMenu(menuRequest(e, spec)); }, []);
    const closeMenu = useCallback(() => setCtxMenu(null), []);
    const openSettings = useCallback((section = "telas") => {
        setOpen(null);
        setCfg(section);
        setWin((s) => (winTopOf(s)?.page === "config" ? s : openStack({ page: "config" })));
    }, [setCfg]);
    const openSong = useCallback((id, more = {}) => { setOpen(null); setWin(openStack({ page: "song", props: { id, ...more } })); }, []);
    const openMedia = useCallback((intent = null) => { setOpen(null); setWin(openStack({ page: "media", props: intent ? { intent } : {} })); }, []);
    const openNotice = useCallback((id) => { setOpen(null); setWin(openStack({ page: "notice", props: { id: id || "new" } })); }, []);
    // The Editor de temas e telas: every openEditor call lands in the
    // window — with `from` (the title of the page it came from) it pushes
    // a level IN the window on screen ("← Temas", "← Telas e saídas"), and
    // without one it opens as a window of its own. "Destacar em janela"
    // goes back through openEditor with detached: true. Each screen owns
    // its design (2026-10-13), so the Editor opens on a screen, never a
    // catalog layout.
    const openScreen = useCallback((path) => {
        const r = openEditor({ screen: path || "/Projection", from: "Telas e saídas" });
        if (r?.error) c.say(r.error);
    }, [c]);
    useEffect(() => setEditorHost(({ theme, screen, from }) => {
        const spec = theme ? { page: "theme", props: { id: theme } } : { page: "screen", props: { path: screen || "/Projection" } };
        setOpen(null);
        closeLibrary(null);
        setWin((s) => (from && s.length ? winPush(s, spec, from) : openStack(spec)));
        return true;
    }), [closeLibrary]);
    // The Escola bíblica sends through the KERYX environment's Prévia.
    const openSchool = useCallback(() => { setOpen(null); setEnvState("culto"); setWin(openStack({ page: "school" })); }, []);
    const openReports = useCallback(() => { setOpen(null); setWin(openStack({ page: "reports" })); }, []);
    const [plannerFocus, setPlannerFocus] = useState(null);
    const [open, setOpen] = useState(null);
    const [libTab, setLibTab] = useState(() => {
        try { return new URLSearchParams(window.location.search).get("lib") === "avisos" ? "avisos" : "letras"; } catch { return "letras"; }
    });
    // The tab in front of the panel beside the Prévia (its tabs: layout.tabs).
    const [panelTab, setPanelTab] = useState("notas");
    const [drawer, setDrawer] = useState(false);
    // Ver › Editar layout: moving the columns and stacked cards (arrange.js).
    // A window page (the planner, an editor, ...) covers the grid: editing ends.
    const [editing, setEditing] = useState(false);
    // The layout: sizes, collapsed cards and the arrangement are this
    // computer's (localStorage, per profile); which modules show and the
    // density are the church's preferences, in the database (usePrefs), so
    // they ride backups and another computer.
    const [localLayout, setLayoutState] = useState(() => loadLayout(""));
    const prefs = usePrefs();
    useMigratePrefs();
    const layout = useMemo(() => ({ ...localLayout, density: prefs.console_density, hidden: hiddenMap(prefs.console_hidden_modules) }),
        [localLayout, prefs.console_density, prefs.console_hidden_modules]);
    // ?planner=<id> (the old /Services/:id) opens on that culto.
    const [serviceId, setServiceId] = useState(() => {
        try { const v = new URLSearchParams(window.location.search).get("planner"); return v && v !== "1" && v !== "new" ? v : null; } catch { return null; }
    });
    const [log, setLog] = useState({});
    const [bibleRequest, setBibleRequest] = useState(null);
    const [tries, setTries] = useState(1);
    // The width tier of the console's grid (src/lib/console/layout.js): wide,
    // medium or narrow. Measured on .main, so banners and the window frame
    // count, not the window.
    const mainRef = useRef(null);
    // The grid's size too: the dock (Editar disposição) fits the culto
    // environment's modules into it.
    const [mainSize, setMainSize] = useState(() => ({ w: window.innerWidth - 12, h: window.innerHeight - 64 }));
    const tier = tierFor(mainSize.w);

    useEffect(() => {
        keryx.auth.me().then((u) => { const p = u?.email || u?.full_name || ""; setProfile(p); setLayoutState(loadLayout(p)); }).catch(() => {});
    }, []);
    useEffect(() => {
        const el = mainRef.current;
        if (!el) return undefined;
        const measure = (w, h) => setMainSize((s) => (Math.abs(s.w - w) < 1 && Math.abs(s.h - h) < 1 ? s : { w, h }));
        measure(el.clientWidth, el.clientHeight);
        if (typeof ResizeObserver === "undefined") return undefined;
        const ro = new ResizeObserver(([entry]) => measure(entry.contentRect.width, entry.contentRect.height));
        ro.observe(el);
        return () => ro.disconnect();
    }, []);
    const say = c.say;
    const setLayout = useCallback((next) => {
        setLayoutState(next);
        saveLayout(profile, next);
        const patch = {};
        if (next.density !== prefs.console_density) patch.console_density = next.density;
        const hidden = hiddenList(next.hidden);
        if (hidden.join() !== hiddenList(hiddenMap(prefs.console_hidden_modules)).join()) patch.console_hidden_modules = hidden;
        if (Object.keys(patch).length) updateUser(patch).catch(() => say("Não foi possível salvar o layout."));
    }, [profile, prefs.console_density, prefs.console_hidden_modules, say]);
    // Everything back to the console's own (the density too; every module on
    // screen), but the named arrangements stay and the church's old hidden
    // modules are not rewritten.
    // One culto arrangement per width tier (switchTier): a new tier brings
    // its own back, the one on screen is kept for when the screen grows again.
    useEffect(() => {
        const next = switchTier(layout, tier);
        if (next !== layout) setLayout(next);
    }, [tier, layout.dockTier]); // eslint-disable-line react-hooks/exhaustive-deps
    const restoreLayout = () => { setLayout({ ...DEFAULT_LAYOUT, hidden: layout.hidden, trayFromChurch: false, dockPresets: layout.dockPresets || [] }); c.say("Layout padrão restaurado."); };
    // The trimmable tab rows (panelTabs.js): what each shows, the (+) list.
    const tabLists = layout.tabs || DEFAULT_TABS;
    const setTabList = (row, list) => setLayout({ ...layout, tabs: { ...tabLists, [row]: list } });
    const toggleTabIn = (row, id) => {
        const next = toggleTab(row, tabLists[row], id);
        if (next.length === tabLists[row].length && next.every((x, i) => x === tabLists[row][i])) { c.say("Pelo menos uma aba fica à vista."); return; }
        setTabList(row, next);
    };
    const libTabNow = activeTab("lib", tabLists.lib, libTab);
    const panelTabNow = activeTab("panel", tabLists.panel, panelTab);
    // KERYX › Avisos: the Biblioteca on its Avisos tab, shown again if it was unchecked.
    const openNotices = () => {
        setOpen(null); setWin([]); setEnvState("culto"); setLibTab("avisos");
        if (!tabLists.lib.includes("avisos")) setTabList("lib", showTab("lib", tabLists.lib, "avisos"));
    };

    const { services, items } = useRundown(serviceId);
    useEffect(() => { if (!serviceId && services.length) setServiceId(pickDefaultService(services)?.id || null); }, [services, serviceId]);
    useEffect(() => { if (serviceId) setLog(loadLog(serviceId)); }, [serviceId]);
    const service = services.find((s) => s.id === serviceId) || null;
    // Papel de parede (owner's decisions 2026-10-12/14, src/lib/console/defaultFundo.js):
    // the service's background, else the church's ("Qualquer outro culto").
    // The live state keeps it (background.default) so Esc puts it back, whoever sends;
    // and when it changes (KERYX opens, a service is chosen, the church edits
    // it) with nothing on air (under Tela preta too) it goes on the Fundo now —
    // never past Travar telas or the padlock (fundoGoesOnNow).
    // The theme in use (owner's review 2026-10-14): choosing a culto with a
    // theme of its own (Service.theme_id, Planejar o culto or "Usar neste
    // culto") makes that one the theme in use, and so does changing it; a
    // culto with none leaves the one the operator clicked (themeInUseSeed) —
    // it used to fall back to the default when the services loaded, and the
    // song went out over the Fundo do culto. The culto KERYX opens on is not
    // a choice: the theme last clicked on this computer stays (owner
    // 2026-10-14, "the last click wins").
    const cultoTheme = serviceTheme(service);
    const openingCulto = useRef(undefined);
    useEffect(() => {
        if (!serviceId) return;
        const reopening = openingCulto.current === undefined;
        if (reopening) openingCulto.current = serviceId;
        const seed = themeInUseSeed(cultoTheme, { reopening, inUse: c.themeId });
        if (seed !== undefined) c.setThemeId(seed);
    }, [serviceId, cultoTheme]); // eslint-disable-line react-hooks/exhaustive-deps
    const churchRow = useUser();
    // The papel de parede with its own look from the library (dim, blur, fit,
    // position): the settings load after the console, so the look is part of
    // the key — when they arrive or change, Esc's copy follows (0.2.18: Esc
    // used to bring it back at the renderer's 45 % fallback).
    const fundoPadrao = useMemo(() => withBackgroundDefaults("background.set", defaultFundoArgs(defaultFundo({ service, user: churchRow })), c.bgPrefs), [service, churchRow, c.bgPrefs]);
    const padraoKey = JSON.stringify(fundoPadrao);
    const padraoSent = useRef(undefined);
    const liveReady = Boolean(c.live);
    useEffect(() => {
        if (!liveReady || padraoSent.current === padraoKey) return;
        padraoSent.current = padraoKey;
        c.liveOp("background.default", { background: fundoPadrao }).catch(() => {});
        const live = c.live;
        if (fundoPadrao && fundoGoesOnNow(live)) c.liveOp("background.set", fundoPadrao).catch(() => {});
    }, [liveReady, padraoKey]); // eslint-disable-line react-hooks/exhaustive-deps
    const { outputs, network, seen, forgetOutput } = useOutputs();
    // Outputs: the projector window missing its display, or closed, is the warning.
    const projector = outputs.find((o) => o.key === "/Projection");

    // The live state says where the service is; the Prévia says what is next in hand.
    const airItemId = c.cur?.session?.itemId || null;
    const prevItemId = c.prev?.args?.ref?.serviceItemId || null;
    const airIdx = items.findIndex((i) => i.id === airItemId);
    // Sections (Pré-culto, Culto…) are headers: never prepared, never next.
    const playable = useMemo(() => playableItems(items), [items]);
    const nextItem = (airIdx >= 0 ? items.slice(airIdx + 1) : items).find((i) => !isSection(i)) || null;
    const setPlan = useMemo(() => plan(service, items), [service, items]);

    // A rundown item as a stage: the row it points at, with the item's id in ref.
    const buildStage = useCallback(async (item, index) => {
        const ref = { serviceItemId: item.id, serviceItemIndex: index, serviceId };
        const type = String(item.type || "").toUpperCase();
        if (type === "SECTION") throw new Error(`"${item.title}" é uma seção da setlist.`);
        if (type === "MATERIAL") { const s = stageFromMaterial(await keryx.entities.BibleMaterial.get(item.contentId)); return { ...s, args: { ...s.args, ref: { ...(s.args.ref || {}), ...ref } } }; }
        if (type === "ANNOUNCEMENT" && item.contentId) { const s = stageFromPiece(await keryx.entities.CommunicationVideo.get(item.contentId)); return { ...s, args: { ...s.args, ref } }; }
        if (type === "SONG") return stageFromSong(await keryx.entities.Song.get(item.contentId), ref, data.themes);
        if (type === "BIBLE") return stageFromPassage(await keryx.entities.BiblePassage.get(item.contentId), ref);
        if (["VIDEO", "IMAGE", "PDF", "POWERPOINT", "AUDIO"].includes(type)) { const s = stageFromMedia(await keryx.entities.Media.get(item.contentId)); return { ...s, args: { ...s.args, ref } }; }
        if (type === "TIMER") { const s = stageFromTool("timer", { minutes: Math.max(1, Math.round((item.duration || 300) / 60)) }); return { ...s, args: { ...s.args, ref } }; }
        const s = stageFromText(item.title || "Texto", item.notes || item.title || "");
        return { ...s, args: { ...s.args, ref } };
    }, [serviceId, data.themes]);

    // A song saved in the editor: the Prévia and the screens take its new
    // slides at once (the split chosen there, everywhere), each where it was.
    const songSaved = useCallback(async (row) => {
        if (!row?.id) return;
        const prev = c.prev;
        if (prev?.id === `song:${row.id}`) {
            const s = stageFromSong(row, prev.args?.ref || {}, data.themes);
            c.setPrev({ ...s, index: Math.min(prev.index || 0, Math.max(0, s.slides.length - 1)) });
        }
        const on = c.cur?.content;
        if (on?.kind !== "lyrics" || on.ref?.songId !== row.id) return;
        if (c.locked) { c.say("Telas travadas · a música no ar muda quando for enviada de novo."); return; }
        const s = stageFromSong(row, on.ref, data.themes);
        try { await c.callOp("content.update", { slides: s.args.slides, stage: s.args.stage, follow: s.args.follow ?? null }); } catch { /* callOp said why */ }
    }, [c, data.themes]);

    const prepareItem = useCallback(async (item, index) => {
        try { c.setPrev(await buildStage(item, index)); } catch (err) { c.say(err?.message || "Não foi possível abrir o item."); }
    }, [buildStage, c]);

    // Sending records when the item went on air (for the timeline), in live mode only.
    // With no stage given: the Bible selection in the Bible environment, else the Prévia.
    const sendStage = useCallback(async (given) => {
        const stage = given || (env === "biblia" && bibleStageRef.current) || undefined;
        if (!stage && env === "biblia") { c.say("Selecione versículos ou digite a referência."); return; }
        // The projector is the main output: sending live (re)opens it if the
        // window is closed, without taking the keyboard from the console. The
        // outputs poll can be seconds old, so ask now (beside the send, which
        // never waits for it).
        // (The browser preview opens outputs as tabs only when asked, from
        // Saídas: a send must not take the tab away from the console.)
        const displays = window.keryxDesktop?.displays;
        if (!c.locked && projector && displays && !keryx.isPreview) {
            displays.list().then((r) => {
                const p = r?.data?.outputs?.find((o) => o.key === "/Projection") || projector;
                if (!p.open) return displays.open("/Projection");
                return null;
            }).catch(() => {});
        }
        const went = await c.send(stage);
        if (!went) return false;
        // A song on air counts for Histórico, Estatísticas and the CCLI report.
        const sent = stage || c.prev;
        if (sent?.kind === "lyrics" && String(sent.id || "").startsWith("song:") && !sent.airSlide) {
            const songId = sent.id.slice(5);
            const song = data.songs.find((x) => x.id === songId);
            keryx.entities.SongHistory.create({ song_id: songId, song_title: sent.title, song_artist: song?.artist || "", played_at: new Date().toISOString(), operator_name: "Operador", ...(service ? { service_id: service.id, service_title: service.title } : {}) }).catch(() => {});
            if (song) keryx.entities.Song.update(songId, { play_count: (song.play_count || 0) + 1, last_played_at: new Date().toISOString() }).catch(() => {});
        }
        const itemId = stage?.args?.ref?.serviceItemId ?? c.prev?.args?.ref?.serviceItemId;
        if (!itemId || !serviceId) return true;
        const now = Date.now();
        setLog((prev) => {
            const next = { ...prev };
            for (const [id, entry] of Object.entries(next)) if (!entry.end && id !== itemId) next[id] = { ...entry, end: now };
            next[itemId] = { start: now, end: null };
            try { localStorage.setItem(LOG_KEY(serviceId), JSON.stringify(next)); } catch { /* not remembered */ }
            return next;
        });
        return true;
    }, [c, serviceId, env, projector, data.songs, service]);
    const goItem = useCallback(async (item, index) => {
        try { const stage = await buildStage(item, index); c.setPrev(stage); await sendStage(stage); } catch (err) { c.say(err?.message || "Não foi possível abrir o item."); }
    }, [buildStage, c, sendStage]);

    // No service chosen: the first item added starts today's setlist, a draft
    // service the operator can rename later in Cultos.
    const ensureService = useCallback(async () => {
        if (serviceId) return serviceId;
        const d = new Date();
        const two = (n) => String(n).padStart(2, "0");
        // Today, at the church's usual time when it has one (Configurações › Culto).
        const start = getPrefs().service_start_time;
        const at = start ? { startTime: start } : {};
        const row = await keryx.entities.Service.create({ title: `Setlist de ${two(d.getDate())}/${two(d.getMonth() + 1)}`, date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, status: "DRAFT", ...at });
        setServiceId(row.id);
        c.say("Criada a setlist de hoje · renomeie em Planejar o culto.");
        return row.id;
    }, [serviceId, c]);

    // Today's papel de parede, the ONE live door (Rodada B 2026-10-14,
    // "Papel de parede × Tema": the Programa's header button is gone):
    // Camadas' Fundo pencil and Planejar o culto call this. The library
    // picks it, saved as the service's background (with no service, today's
    // draft starts). The papel de parede effect below then sends
    // background.default — and background.set with nothing on air — so the
    // screen follows at once; Esc keeps showing it after a song with a
    // background of its own.
    const pickServiceFundo = useCallback(async () => {
        const before = serviceFundo(service);
        const r = await pickFromLibrary({ accept: ["image", "video", "generator", "color"], title: service ? "Papel de parede do culto" : "Papel de parede de hoje", value: before || null, allowNone: Boolean(before), noneLabel: "Sem papel de parede próprio (o de qualquer outro culto)" });
        if (!r || (!r.spec && !r.none)) return;
        try {
            const sid = serviceId || await ensureService();
            const row = services.find((x) => x.id === sid) || {};
            await keryx.entities.Service.update(sid, lookFields({ ...lookOf(row), background: r.none ? null : r.spec }));
            c.say(r.none ? "O culto volta ao papel de parede da igreja." : "Papel de parede do culto salvo.");
        } catch (err) { c.say(err?.message || "Não foi possível salvar o papel de parede."); }
    }, [service, services, serviceId, ensureService, pickFromLibrary, c]);

    // The Notas tab's free notes (Service.operator_notes). With no service the
    // first save starts the day's draft, once: saves made while it is being
    // created wait for it.
    const notesDraft = useRef(null);
    useEffect(() => { if (serviceId) notesDraft.current = null; }, [serviceId]);
    const saveOperatorNotes = useCallback(async (text) => {
        try {
            const sid = serviceId || await (notesDraft.current ||= ensureService());
            await keryx.entities.Service.update(sid, { operator_notes: text });
        } catch (err) { c.say(err?.message || "Não foi possível salvar as notas."); throw err; }
    }, [serviceId, ensureService, c]);

    // A library item dropped on the Setlist: a ServiceItem at that position.
    const addStageToSetlist = useCallback(async (stage, index) => {
        let type = null;
        let contentId = "";
        if (stage.kind === "lyrics" && stage.id?.startsWith("song:")) { type = "SONG"; contentId = stage.id.slice(5); }
        else if (stage.id?.startsWith("yt:")) type = "YT"; // resolved to a Media row below
        else if (stage.id?.startsWith("material:")) { type = "MATERIAL"; contentId = stage.id.slice(9); }
        else if (stage.id?.startsWith("media:")) {
            contentId = stage.id.slice(6);
            const k = stage.args?.kind;
            type = k === "video" || k === "youtube" ? "VIDEO" : k === "audio" ? "AUDIO" : k === "pdf" ? "PDF" : k === "powerpoint" ? "POWERPOINT" : "IMAGE";
        }
        if (!type) { c.say("Esse item ainda não entra na setlist; arraste para a Prévia ou o Programa."); return; }
        const at = Math.max(0, Math.min(items.length, index ?? items.length));
        try {
            const sid = await ensureService();
            if (type === "YT") {
                const row = await mediaFromYouTube(stage.args?.url || stage.id.slice(3));
                type = "VIDEO";
                contentId = row.id;
            }
            // Renumber from the end first, so two rows never share an order.
            for (let i = items.length - 1; i >= at; i--) await keryx.entities.ServiceItem.update(items[i].id, { order: i + 1 });
            await keryx.entities.ServiceItem.create({ serviceId: sid, type, title: stage.title, contentId, order: at, duration: stage.args?.duration || defaultDuration(type, getPrefs()) });
            c.say(`${stage.title} na setlist.`);
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    }, [c, items, ensureService]);

    // Escola bíblica › Setlist: a material at the end of the setlist.
    const addMaterial = async (m) => {
        try {
            const sid = await ensureService();
            await keryx.entities.ServiceItem.create({ serviceId: sid, type: "MATERIAL", title: m.title, contentId: m.id, order: items.length, duration: 300 });
            c.say(`${m.title} adicionado ao fim da setlist.`);
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    };

    const addSong = async (song) => {
        try {
            const sid = await ensureService();
            await keryx.entities.ServiceItem.create({ serviceId: sid, type: "SONG", title: song.title, contentId: song.id, order: items.length, duration: song.duration || defaultDuration("SONG", getPrefs()) });
            c.say(`${song.title} adicionada ao fim da setlist.`);
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    };

    const projectorDown = Boolean(projector && projector.placement.missing);
    const [lastOkAt, setLastOkAt] = useState(null);
    useEffect(() => { if (projector && !projector.placement.missing) setLastOkAt(Date.now()); }, [projector]);
    useEffect(() => { if (!projectorDown) { setTries(1); return undefined; } const id = setInterval(() => setTries((t) => t + 1), 5000); return () => clearInterval(id); }, [projectorDown]);
    // Output health (src/lib/console/outputs.js): the status in the top bar,
    // the rows of Saídas, "em N telas" beside the Programa and the banner.
    const airWords = captionOf(c.cur, "No ar").replace(/^No ar · /, "");
    const health = useMemo(() => outputHealth({ outputs, seen, locked: c.locked, air: airWords, tries }), [outputs, seen, c.locked, airWords, tries]);

    // Updates (electron/updater.cjs): with Atualizar automaticamente a version
    // found right after opening shows its popup by itself, once; later it only
    // rings the bell. "Atualizar agora" (menu, bell) opens it any time.
    const upd = useUpdates();
    const mountedAt = useRef(Date.now());
    const [updDismissed, setUpdDismissed] = useState(false);
    const lastOpen = useRef(open);
    useEffect(() => {
        if (lastOpen.current === "update" && open !== "update") setUpdDismissed(true);
        lastOpen.current = open;
    }, [open]);
    useEffect(() => {
        if (open || winOpen) return;
        if (shouldOpenOnLaunch({ update: upd.update, sinceMountMs: Date.now() - mountedAt.current, dismissed: updDismissed })) setOpen("update");
    }, [upd.update, open, winOpen, updDismissed]);
    const updateNow = useCallback(() => {
        const u = upd.update;
        if (!hasUpdate(u)) return;
        if (u.status === "available" || u.status === "error") upd.call("updateDownload").catch((err) => c.say(err.message));
        setOpen("update");
    }, [upd.update, upd.call, c]); // eslint-disable-line react-hooks/exhaustive-deps
    // Opening the bell reads what is in it.
    const { unread: updUnread, call: updCall } = upd;
    useEffect(() => {
        if (open !== "notifs" || !updUnread) return undefined;
        const id = setTimeout(() => updCall("notificationsRead").catch(() => {}), 800);
        return () => clearTimeout(id);
    }, [open, updUnread, updCall]);
    // Novidades: once after an update (every version since), and from the
    // menu or the bell (every version up to this one).
    const [whatsNew, setWhatsNew] = useState(null);
    const sysRef = useRef(window.keryxDesktop?.system || null);
    useEffect(() => {
        sysRef.current?.call("whatsNew").then((res) => {
            const d = res?.data;
            if (!d) return;
            if (d.pending?.to) { setWhatsNew({ ...d.pending, seen: false }); setOpen((o) => o || "novidades"); }
            else setWhatsNew({ from: null, to: d.version, all: true, seen: true });
        }).catch(() => {});
    }, []);
    const openWhatsNew = useCallback(() => {
        setWhatsNew((w) => (w?.from && !w.seen ? w : { from: null, to: w?.to || null, all: true, seen: true }));
        setOpen("novidades");
    }, []);
    const whatsNewSeen = () => {
        if (whatsNew && !whatsNew.seen) sysRef.current?.call("whatsNewSeen").catch(() => {});
        setWhatsNew((w) => (w ? { from: null, to: w.to, all: true, seen: true } : w));
    };
    const noteAction = (action) => {
        if (action === "update") updateNow();
        else if (action === "whatsnew") openWhatsNew();
        else if (action.startsWith("settings:")) openSettings(action.slice("settings:".length));
    };
    const openOutput = (key) => window.keryxDesktop?.displays.open(key).catch(() => {});
    // Closed here on purpose: forgotten, so it is not reported as a problem.
    const closeOutput = (key) => window.keryxDesktop?.displays.close(key).then(() => forgetOutput(localId(key))).catch(() => {});
    // Adicionar saída (the Saídas popover): back on the list with the same
    // screen, "Abrir ao iniciar" and Ajustes it had.
    const restoreOutput = (key) => window.keryxDesktop?.displays.set(key, { removed: false }).catch((err) => c.say(err?.message || "Não foi possível adicionar a saída."));
    const removedOutputs = useMemo(() => outputs.filter((o) => o.removed), [outputs]);

    // ↑/↓ in the KERYX environment: the selection walks the slides of the
    // item in hand, as the Slides column shows it (the Prévia's own, even a
    // single slide, else the ones on air); Enter sends it.
    const selectSlide = useCallback((d) => {
        const p = c.prev;
        const air = c.cur?.content;
        if (handIsPrev(p) && !p.airSlide) { c.setPrev(stageAt(p, p.index + d)); return; }
        if (air && air.slides.length) {
            const from = p?.airSlide ? p.index : air.index;
            c.setPrev(stageAirSlide(air, Math.max(0, Math.min(air.slides.length - 1, from + d)), liveStageId(c.cur)));
        }
    }, [c]);

    // The planner: for the culto in hand (or a given one), "new" creates one.
    const openPlanner = useCallback(async (id, itemId = null) => {
        setOpen(null);
        if (id === "new") {
            try {
                const row = await keryx.entities.Service.create({ ...newServiceDefaults(getPrefs()), status: "DRAFT", service_type: "culto" });
                setServiceId(row.id);
                c.say("Novo culto criado.");
            } catch (err) { c.say(err?.message || "Não foi possível criar o culto."); return; }
        } else if (id && id !== true) setServiceId(id);
        setPlannerFocus(itemId);
        setWin(openStack({ page: "planner" }));
    }, [c]);

    const openReference = (ref) => { setBibleRequest({ ...ref, at: Date.now() }); setOpen(null); setEnv("biblia"); };
    // A reference from the palette, without leaving the console, in the
    // version chosen in the Bíblia (readChapter: online when not installed,
    // an installed one when that fails; said so).
    const referenceVerses = async (ref) => {
        const wanted = bibleVersionWanted();
        const { verses, version, fellBack } = await readChapter(wanted, ref.book, ref.chapter);
        if (fellBack) c.say(`${fellBack} sem internet · usando a ${version}.`);
        else if (version !== wanted) c.say(`${wanted} não está instalada · usando a ${version}.`);
        return { version, verses };
    };
    // Its verses in the Prévia (one verse: its chapter from there, as in the Bíblia).
    const prepareReference = async (ref) => {
        try {
            const { version, verses } = await referenceVerses(ref);
            const onAir = c.cur?.content?.kind === "bible" ? c.cur.content : null;
            const st = stageFromVerses({ verses, nums: referenceNums(ref), how: prefs.bible_verses_per_slide, version, book: ref.book, chapter: ref.chapter, onAir });
            if (!st) { c.say(`${formatReference(ref)} não existe na ${version}.`); return; }
            c.setPrev(st);
        } catch (err) { c.say(err?.message || "Não foi possível abrir a passagem."); }
    };
    // Or as a passage at the end of the Setlist (never the whole chapter).
    const addReference = async (ref) => {
        try {
            const { version, verses } = await referenceVerses(ref);
            const passage = passageOf({ verses, nums: referenceNums(ref), how: prefs.bible_verses_per_slide, version, book: ref.book, chapter: ref.chapter });
            if (!passage) { c.say(`${formatReference(ref)} não existe na ${version}.`); return; }
            const sid = await ensureService();
            const row = await keryx.entities.BiblePassage.create(passage);
            const title = `${ref.book} ${ref.chapter}:${passage.verses}`;
            await keryx.entities.ServiceItem.create({ serviceId: sid, type: "BIBLE", title, contentId: row.id, order: items.length, duration: defaultDuration("BIBLE", getPrefs()) });
            c.say(`${title} adicionado ao fim da setlist.`);
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    };
    // Controle remoto (a phone, electron/lan.cjs): each command runs what the
    // console's own key or palette does, so Travar telas, themes and the
    // Desfazer of Encerrar hold; the answer goes back to the phone, and the
    // console says what the phone did. Read through a ref: the latest state.
    const remoteRun = async ({ action, args = {} }) => {
        const refuse = (message, status = 409) => ({ ok: false, message, status });
        const putsOnAir = ["next", "prev", "sendNext", "sendItem", "bibleSend", "play"].includes(action);
        if (putsOnAir && c.locked) return refuse(LOCKED_SAY, 423);
        const sendOne = async (stage, said) => ((await sendStage(stage)) ? { ok: true, message: remoteSay(action, said) } : refuse("Não foi para o ar."));
        const reference = async () => {
            const ref = parseReference(args.ref);
            if (!ref) return { error: refuse(`Não entendi "${args.ref}". Escreva como jo 3 16.`, 400) };
            const { version, verses } = await referenceVerses(ref);
            return { ref, version, verses, nums: referenceNums(ref) };
        };
        switch (action) {
            case "state":
                return { ok: true, data: remoteState({ service, items, airItemId, nextItemId: nextItem?.id || null, live: c.cur }) };
            case "next": case "prev":
                if (!c.cur?.content) return refuse("Nada com slides no ar.");
                await c.callOp(action === "next" ? "content.next" : "content.prev");
                return { ok: true, message: remoteSay(action) };
            case "black": case "logo": {
                const turningOn = c.cur?.screen !== action;
                await c.liveOp("screen.set", { mode: turningOn ? action : "show" });
                return { ok: true, message: remoteSay(action, `${action === "black" ? "Tela preta" : "Logo"} ${turningOn ? "ligado" : "desligado"}`) };
            }
            case "clear":
                await c.clearText();
                return { ok: true, message: remoteSay(action) };
            case "play": {
                const op = playerOp(c.cur, playerLayer(c.cur, playerPick), "toggle");
                if (!op) return refuse("Nada tocando.");
                await c.callOp(op[0], op[1]);
                return { ok: true, message: remoteSay(action) };
            }
            case "end": {
                // As the Esc: everything off, with Desfazer on the console.
                const before = c.cur;
                await c.callOp("clear");
                c.say("Celular: projeção encerrada.", { label: "Desfazer", run: () => c.undoEnd(before) });
                return { ok: true, message: "Projeção encerrada." };
            }
            case "sendNext":
                if (!nextItem) return refuse("Não há próximo item na setlist.");
                return sendOne(await buildStage(nextItem, items.indexOf(nextItem)), `enviou "${nextItem.title}"`);
            case "sendItem": {
                const index = items.findIndex((i) => i.id === args.itemId);
                if (index < 0) return refuse("Esse item não está na setlist.", 404);
                if (isSection(items[index])) return refuse("Uma seção não vai ao ar.");
                return sendOne(await buildStage(items[index], index), `enviou "${items[index].title}"`);
            }
            case "bibleFind": {
                const r = await reference();
                if (r.error) return r.error;
                if (r.nums.length && !r.verses.some((v) => r.nums.includes(v.number))) return refuse(`${formatReference(r.ref)} não existe na ${r.version}.`, 404);
                return { ok: true, data: passagePreview(`${formatReference(r.ref)} · ${r.version}`, r.verses, r.nums) };
            }
            case "bibleSend": {
                const r = await reference();
                if (r.error) return r.error;
                const onAir = c.cur?.content?.kind === "bible" ? c.cur.content : null;
                const st = stageFromVerses({ verses: r.verses, nums: r.nums, how: prefs.bible_verses_per_slide, version: r.version, book: r.ref.book, chapter: r.ref.chapter, onAir });
                if (!st) return refuse(`${formatReference(r.ref)} não existe na ${r.version}.`, 404);
                return sendOne(st, `enviou ${formatReference(r.ref)}`);
            }
            default:
                return refuse("Comando desconhecido.", 400);
        }
    };
    const remoteRef = useRef(remoteRun);
    remoteRef.current = remoteRun;
    useEffect(() => {
        const remote = window.keryxDesktop?.remote;
        if (!remote?.onCommand) return undefined;
        return remote.onCommand(async (command) => {
            let answer;
            try { answer = await remoteRef.current(command); } catch (err) { answer = { ok: false, message: err?.message || "Não foi possível.", status: err?.status || 500 }; }
            // What the phone did shows here too (Encerrar says it with its Desfazer).
            if (answer.ok && answer.message && command.action !== "end") c.say(answer.message);
            remote.reply(command.id, answer);
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const searchBibleFor = (text) => { setBibleRequest({ search: text, at: Date.now() }); setOpen(null); setEnv("biblia"); };

    // Keys (src/lib/console/keys.js). A mouse click never leaves focus on a
    // control (see onMouseClick), so after clicking a song Enter sends it, as
    // in Holyrics; a control focused with Tab keeps its own Enter/Space.
    // Arrows move the slide or verse on air; B/L/C the screen; Esc takes the
    // projection down at once (after closing whatever is open; in a text field
    // it first leaves the field); / searches; ? lists the keys. In the Bible
    // environment a letter or digit opens the quick jump.
    useEffect(() => {
        const onKey = (e) => {
            if (env === "biblia" && !open && quick === null && !winOpen) {
                const ch = quickJumpKey(e);
                if (ch) { e.preventDefault(); setQuick(ch); return; }
            }
            const action = liveAction(e);
            if (!action) return;
            if (action === "blur") { e.target.blur?.(); return; }
            // Esc closes the topmost thing open (src/lib/console/keys.js,
            // escapeTarget); only with nothing open does it end the projection.
            if (action === "end") {
                // "window": Esc goes to the TOP page's registered request
                // (nav.js), which pops one level — "← Voltar" — or, at the
                // first, closes; an unsaved guard may ask instead.
                const top = escapeTarget({ menu: ctxMenu, confirm: confirmReq || ask, library: libReq, popover: open, window: winOpen, drawer, edit: editing });
                if (top !== "end") {
                    e.preventDefault();
                    if (top === "menu") setCtxMenu(null);
                    else if (top === "confirm") { if (ask) answerAsk(null); else answerConfirm(false); }
                    else if (top === "library") closeLibrary(null);
                    else if (top === "popover") setOpen(null);
                    else if (top === "window") winEsc("esc");
                    else if (top === "drawer") setDrawer(false);
                    else if (top === "edit") setEditing(false);
                    return;
                }
            }
            // With a menu open only Tela preta and Logo reach the screens.
            if (ctxMenu && !["black", "logo"].includes(action)) return;
            if (open) return;
            // The library is a window over everything: only the emergency keys pass.
            if ((libReq || confirmReq) && !["black", "logo"].includes(action)) return;
            // Behind the window only the emergency keys (Tela preta, Logo)
            // act; a page's own keys (Mídia's Enter and Delete, the editors'
            // Ctrl+S, Space while marking timings) are its own listeners.
            // The Escola bíblica is the projecting page: every live key
            // works there.
            if (winOpen && winTop?.page !== "school" && !["black", "logo"].includes(action)) return;
            if (action === "send") { e.preventDefault(); sendStage(); }
            else if (action === "next") { e.preventDefault(); c.moveSlide(1); }
            else if (action === "prev") { e.preventDefault(); c.moveSlide(-1); }
            else if (action === "selUp" || action === "selDown") {
                e.preventDefault();
                const d = action === "selDown" ? 1 : -1;
                if (env === "biblia") bibleApiRef.current?.move(d);
                else selectSlide(d);
            }
            else if (action === "black") c.toggleScreen("black");
            else if (action === "logo") c.toggleScreen("logo");
            else if (action === "clear") c.clearText();
            else if (action === "end") {
                e.preventDefault();
                c.end(); // nothing open (escapeTarget above); its toast offers Desfazer
            }
            else if (action === "search") { e.preventDefault(); setOpen("palette"); }
            else if (action === "help") setOpen("atalhos");
            else if (action === "play") {
                // Space: the player's Tocar/Pausar, for the layer it shows.
                const op = playerOp(c.cur, playerLayer(c.cur, playerPick), "toggle");
                if (op) { e.preventDefault(); c.callOp(op[0], op[1]).catch(() => {}); }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [c, ctxMenu, open, drawer, editing, sendStage, env, quick, playerPick, selectSlide, winOpen, winTop, winEsc, libReq, closeLibrary, confirmReq, answerConfirm]);
    useEffect(() => { if (winOpen) setEditing(false); }, [winOpen]);

    // A mouse click must not leave focus on the control it hit: the live keys
    // would then belong to that control (the "keys don't work" bug). Keyboard
    // activation (detail 0) keeps focus, so Tab navigation still works.
    const onMouseClick = (e) => {
        if (e.detail === 0) return;
        const t = e.target.closest?.("button, [role='button'], [role='tab'], [role='radio'], [role='menuitem'], a[href]");
        if (t && !t.closest(".dialog, .palette, .qj, .lyr, .addmenu")) setTimeout(() => t.blur?.(), 0);
    };

    // Where the culto environment's modules go (Ver › Editar disposição;
    // src/lib/console/dock.js): the operator's tree, or, until they change
    // it, the one the old columns make (fromArrangement; the modules the
    // church's old preference hid start in the tray).
    // Until then it follows the width, as the console's tiers did (wide,
    // medium, narrow: fromArrangement).
    const dockOpts = { width: mainSize.w, height: mainSize.h, tier, onairSpan: layout.onairSpan };
    const dock = useMemo(() => (layout.dock ? normalizeDock(layout.dock) : fromArrangement(layout.trayFromChurch === false ? { ...layout, hidden: {} } : layout, dockOpts)),
        [layout.dock, layout.order, layout.stacks, layout.libW, layout.slidesW, layout.rightW, layout.camadasH, layout.prevPct, layout.hidden, layout.trayFromChurch, layout.onairSpan, mainSize.w, mainSize.h]); // eslint-disable-line react-hooks/exhaustive-deps
    // Editar disposição › No ar: the strip's band (dock.js moveBand); a dock
    // never edited follows through fromArrangement.
    const setOnairSpan = (v) => setLayout({ ...layout, onairSpan: v, dock: layout.dock ? moveBand(layout.dock, v) : null });
    // The No ar strip only while lyrics are on air (owner 2026-10-14): it folds
    // away otherwise, wherever it is placed alone; while editing it stays, to be moved.
    const gone = editing ? "" : goneModules(c.cur).join();
    // Heights the console decides, never a splitter (owner 2026-10-14): the
    // No ar strip as tall as the slide on air with the most lines (the song's
    // editor decides them), Camadas as tall as what it holds (Measure).
    // The density on screen (Automática: Compacta on a short grid) and the
    // panel header it gives (28 or 32 px).
    const density = shownDensity(layout, mainSize.h);
    const PANEL_HEAD = panelHead(density);
    // Minimized (its header's chevron, as Holyrics' strip): only its header.
    const onAirH = layout.onairMin ? PANEL_HEAD : onAirHeight(c.cur?.content?.slides, PANEL_HEAD);
    const [camadasFitH, setCamadasFitH] = useState(0);
    const [temasFitH, setTemasFitH] = useState(0);
    const dockFrame = useMemo(() => fitDock(dock, mainSize.w, mainSize.h, {
        gone: gone ? gone.split(",") : [],
        locked: { onair: onAirH, ...(camadasFitH ? { camadas: PANEL_HEAD + camadasFitH } : {}), ...(temasFitH ? { temas: PANEL_HEAD + temasFitH } : {}) },
    }), [dock, mainSize.w, mainSize.h, gone, onAirH, camadasFitH, temasFitH]);
    const onScreen = (id) => Boolean(pathOf(dock.tree, id));
    const playerDocked = !onScreen("player");
    const setDock = (next) => setLayout({ ...layout, dock: next });
    // Ver's and Configurações' module switches: the culto's tray on this
    // computer. They see the layout with the tray as `hidden`; a switch
    // moves the module out (to the tray) or back (to its default place).
    const uiLayout = { ...layout, hidden: trayFlags(dock, VER_MODULES) };
    const setUiLayout = (next) => {
        const d = applyTrayFlags(dock, next.hidden, VER_MODULES, dockOpts);
        setLayout({ ...next, hidden: layout.hidden, dock: d === dock ? next.dock : d });
    };
    // The Bíblia's own dock (BibleEnv.jsx draws its modules), the same way.
    const bibleDock = useMemo(() => (layout.bibleDock ? normalizeDock({ ...layout.bibleDock, env: "biblia" }) : fromBibleArrangement(layout)),
        [layout.bibleDock, layout.order, layout.stacks, layout.bibleSelW, layout.bibleAirW]); // eslint-disable-line react-hooks/exhaustive-deps
    const bibleFrame = useMemo(() => fitDock(bibleDock, mainSize.w, mainSize.h), [bibleDock, mainSize.w, mainSize.h]);
    const setBibleDock = (next) => setLayout({ ...layout, bibleDock: next });
    // Editing moves the modules of the environment on screen.
    const envDock = env === "biblia" ? bibleDock : dock;
    const setEnvDock = env === "biblia" ? setBibleDock : setDock;
    const dockDrag = useDockDrag({ dock: envDock, onDock: setEnvDock });
    // Editar disposição › Tamanhos: Livre | Por % (dock.js setDockMode), the
    // environment on screen; what is drawn stays as it is.
    const setEnvMode = (m) => setEnvDock(setDockMode(envDock, m, mainSize.w, mainSize.h));
    // Named arrangements (Ver › Disposição; src/lib/console/dockPresets.js),
    // each environment its own: the list, the one in use, Padrão.
    const allPresets = layout.dockPresets || [];
    const presetKey = env === "biblia" ? "bibleDockPreset" : "dockPreset";
    const dockKey = env === "biblia" ? "bibleDock" : "dock";
    const presets = presetsFor(allPresets, env);
    const preset = presetOf(presets, layout[presetKey]);
    // Changed: from its preset, or (Padrão) from the environment's own.
    const padraoDock = useMemo(() => defaultDock(dockOpts), [mainSize.w, mainSize.h]); // eslint-disable-line react-hooks/exhaustive-deps
    const biblePadrao = useMemo(() => defaultDock({ env: "biblia" }), []);
    const presetDirty = presetChanged(preset || { dock: env === "biblia" ? biblePadrao : padraoDock }, envDock);
    // The environment on screen back to its own (Padrão, Restaurar posições):
    // the culto follows the width again, with every module it has there.
    const restoreHere = () => restoreEnv(layout, env);
    const pickPreset = (id) => {
        const p = presetOf(presets, id);
        if (!p) { setLayout(restoreHere()); c.say("Disposição padrão."); return; }
        setLayout({ ...layout, [dockKey]: p.dock, [presetKey]: p.id });
        c.say(`Disposição “${p.name}”.`);
    };
    const savePresetAs = (name) => {
        const id = globalThis.crypto?.randomUUID?.() || `d${Date.now()}`;
        const r = addPreset(allPresets, name, envDock, id);
        if (!r.id) return;
        setLayout({ ...layout, [dockKey]: envDock, dockPresets: r.list, [presetKey]: r.id });
        c.say(`Disposição “${r.list.at(-1).name}” salva. Troque em Ver.`);
    };
    const savePreset = () => {
        if (!preset) return;
        setLayout({ ...layout, dockPresets: updatePreset(allPresets, preset.id, envDock) });
        c.say(`“${preset.name}” salva.`);
    };
    const deletePreset = async () => {
        if (!preset || !(await askConfirm(deleteQuestion("a disposição", preset.name, "O console fica como está agora.")))) return;
        setLayout({ ...layout, [dockKey]: envDock, dockPresets: removePreset(allPresets, preset.id), [presetKey]: null });
    };
    // "Mover para…" (a click on a module's name while editing, or on it in
    // the tray): which module to go beside, then on which side or as a tab.
    const moveMenu = (e, id) => {
        const r = e.currentTarget?.getBoundingClientRect?.();
        const at = { clientX: e.clientX || r?.left || 0, clientY: e.clientY || r?.bottom || 0, preventDefault() {}, stopPropagation() {} };
        const name = DOCK_MODULES[id].name;
        const d = envDock;
        // The No ar strip never moves (dock.js `pinned`): only the tray and back.
        if (isPinned(id)) {
            openMenu(e, { title: `${name} · fica sempre embaixo`, items: [pathOf(d.tree, id)
                ? { label: "Tirar para a bandeja", icon: "x", onSelect: () => setEnvDock(hideModule(d, id)) }
                : { label: "Voltar para a faixa embaixo", icon: "undo", onSelect: () => setEnvDock(returnModule(d, id)) }] });
            return;
        }
        const others = leaves(d.tree).filter((m) => m !== id && !isPinned(m));
        const besideOf = (other) => openMenu(at, { title: `${name} · em relação a ${DOCK_MODULES[other].name}`, items: Object.entries(ZONE_LABEL).map(([zone, label]) => ({
            label, icon: zone === "center" ? "layers" : "grip",
            onSelect: () => setEnvDock(moveModules(d, [id], { kind: "group", path: pathOf(d.tree, other), zone })),
        })) });
        openMenu(e, { title: `Mover ${name} para perto de…`, items: [
            ...others.map((other) => ({ label: DOCK_MODULES[other].name, onSelect: () => besideOf(other) })),
            ...(id === "player" && !playerDocked ? ["sep", { label: "Voltar para baixo do Programa", icon: "undo", onSelect: () => setEnvDock(moveModules(d, ["player"], { kind: "home" })) }] : []),
            ...(canTray(id) && pathOf(d.tree, id) ? ["sep", { label: "Tirar para a bandeja", icon: "x", onSelect: () => setEnvDock(hideModule(d, id)) }] : []),
        ] });
    };
    // The Programa's box on screen: the Camadas drawer opens beside it,
    // wherever the dock puts it.
    const programaBox = () => mainRef.current?.querySelector('[data-dock-mods~="programa"]')?.getBoundingClientRect() || null;
    // "Voltar ao anterior" opens above the Programa's pill (its button, or
    // the "…" when the pill is folded), its right edge on the pill's.
    const histAnchor = open === "hist" ? mainRef.current?.querySelector(".prog-pill")?.getBoundingClientRect() || null : null;
    const camadasOn = onScreen("camadas");
    // Camadas on screen: no drawer left open behind it (Esc would close that first).
    useEffect(() => { if (camadasOn) setDrawer(false); }, [camadasOn]);
    // The Setlist: its header (title, count, Planejar, +) and the whole
    // rundown, scrolled to the item in hand (Rundown).
    // A second menu where the first was (the timers): the first's place.
    const menuAt = (e) => ({ clientX: e.clientX, clientY: e.clientY, preventDefault() {}, stopPropagation() {} });
    const timersMenu = (at, title, onPick) => openMenu(at, { title, items: timerChoices(data.timerPresets).map((t) => ({ label: minutesLabel(t.minutes), icon: "clock", onSelect: () => onPick(t.minutes) })) });
    // The Setlist's + (owner 2026-10-14, the "Menus (+)" proposal): the
    // palette first, then what only Planejar made — a section, a text, a
    // timer — right under the item in the Prévia (at the end with none).
    const addRowToSetlist = async (row) => {
        try {
            const sid = await ensureService();
            const sel = items.findIndex((x) => x.id === prevItemId);
            const at = sel >= 0 ? sel + 1 : items.length;
            for (let i = items.length - 1; i >= at; i--) await keryx.entities.ServiceItem.update(items[i].id, { order: i + 1 });
            await keryx.entities.ServiceItem.create({ serviceId: sid, order: at, enabled: true, ...row });
            c.say(`${row.title} na setlist.`);
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    };
    const setlistMenu = (e) => {
        const at = menuAt(e);
        openMenu(e, { title: "Adicionar à setlist", items: [
            { label: "Buscar música, versículo, mídia…", icon: "search", kbd: "/", onSelect: () => setOpen("palette") },
            "sep",
            { label: "Seção…", icon: "list", onSelect: async () => { const t = await askText({ title: "Seção da setlist", placeholder: "Pré-culto, Louvor, Palavra…", ok: "Adicionar" }); if (t) addRowToSetlist({ type: "SECTION", title: t, duration: 0 }); } },
            { label: "Texto…", icon: "text", onSelect: async () => { const t = await askText({ title: "Texto na setlist", placeholder: "O texto que vai às telas", ok: "Adicionar", multiline: true, hint: "Ctrl+Enter adiciona" }); if (t) addRowToSetlist({ type: "TEXT", title: t.split("\n")[0].slice(0, 60), notes: t, duration: 60 }); } },
            { label: "Timer…", icon: "clock", onSelect: () => timersMenu(at, "Timer na setlist", (m) => addRowToSetlist({ type: "TIMER", title: `Timer ${m} min`, duration: m * 60 })) },
            "sep",
            { label: "Planejar o culto…", icon: "list", onSelect: () => openPlanner(serviceId) },
        ] });
    };
    const setlistPanel = (
        <Panel title="Setlist" count={service ? `${service.title}${setPlan.count ? ` · ${setPlan.count} itens · ${total(setPlan.seconds)}` : ""}` : "nenhum culto"}
            actions={<><IconBtn name="list" title="Planejar o culto" small onClick={() => openPlanner(serviceId)} /><IconBtn name="plus" title="Adicionar à setlist: buscar, seção, texto, timer" small onClick={setlistMenu} /></>}>
            <Rundown service={service} items={items} airItemId={airItemId} prevItemId={prevItemId} onPrepare={prepareItem} onGo={goItem} onAddStage={addStageToSetlist} onPlan={(it) => openPlanner(serviceId, it?.id || null)} onSay={c.say} />
        </Panel>
    );
    // Temas: its own module under Camadas (owner 2026-10-14); a click makes
    // one the theme in use, named in the header. With the module off screen
    // (the tray) the themes ride at the end of Camadas, card or drawer, so
    // they are never out of reach.
    const themeInUse = data.themes.find((t) => t.id === c.themeId) || defaultTheme(data.themes);
    const themeInUseName = themeInUse ? themeName(themeInUse, "") : "";
    const themeStrip = <ThemeStrip c={c} themes={data.themes} songs={data.songs} service={service} ensureService={ensureService} menuRef={themeMenuRef} view={{ thumb: layout.temasThumb, names: layout.temasNames }} setView={(v) => setLayout({ ...layout, ...v })} onSettings={openSettings} />;
    // The header: the library (where the 9 slots are pinned) and the + menu
    // (owner 2026-10-14: the body is only the thumbnails); as tall as its
    // slots (Measure → locked.temas), like Camadas.
    const temasBtns = <><IconBtn name="grid" title="Biblioteca de temas… · o clique direito fixa um tema no console" small onClick={() => themeMenuRef.current?.library()} /><IconBtn name="plus" title="Temas: novo, configurações, para a música, visualização" small onClick={(e) => themeMenuRef.current?.menu(e)} /></>;
    const temasPanel = <Panel title="Temas" count={themeInUseName ? `em uso: ${themeInUseName}` : ""} className="temas-panel" actions={temasBtns}><Measure onHeight={setTemasFitH}>{themeStrip}</Measure></Panel>;
    const temasOn = onScreen("temas");
    const layers = (
        <>
            <Layers c={c} themes={data.themes} onSettings={openSettings} onFundo={pickServiceFundo} addRef={addOverlayRef} />
            {!temasOn && <div className="layer-temas"><div className="listhead"><span className="kx-section">Temas{themeInUseName && <span className="kx-count"> · em uso: {themeInUseName}</span>}</span>{temasBtns}</div>{themeStrip}</div>}
        </>
    );
    // Camadas' + (owner 2026-10-14, "Frente 2 = A"): only what goes over the
    // projection and is in no theme, the text overlay and the logo. Clock,
    // stopwatch, timer, free text and Aviso rápido live in the tabs panel
    // (Ferramentas, Timers, Aviso rápido) and the Setlist's +.
    const camadasMenu = (e) => {
        const logoOn = Boolean(c.cur?.logo?.visible);
        const ovFull = (c.cur?.overlays?.length || 0) >= OVERLAY_LIMIT;
        openMenu(e, { title: "Adicionar camada", items: [
            { label: ovFull ? `Sobreposição de texto · máx. ${OVERLAY_LIMIT}` : "Sobreposição de texto", icon: "text", disabled: ovFull, onSelect: () => addOverlayRef.current?.() },
            { label: logoOn ? "Logo da igreja · no ar" : "Logo da igreja", icon: "logo", disabled: logoOn, onSelect: () => c.callOp("logo.set", { visible: true }).catch((err) => c.say(err?.message || "Não foi possível mostrar o logo.")) },
        ] });
    };
    const camadasPanel = (
        <Panel title="Camadas" count="o que está no ar" actions={<IconBtn name="plus" title="Adicionar: sobreposição de texto, logo da igreja" small onClick={camadasMenu} />}>
            <Measure onHeight={setCamadasFitH}>{layers}</Measure>
        </Panel>
    );
    // The tabs panel: the tabs the operator checked in its (+) (Notas, Aviso
    // rápido, Timers, Ferramentas, Esteve no ar).
    const panelTabsShown = shownTabs("panel", tabLists.panel);
    const panelOnScreen = onScreen("abas");
    const panelHas = panelOnScreen ? Object.fromEntries(tabLists.panel.map((id) => [id, true])) : {};
    const prepare = (s) => c.setPrev(s);
    const prepareAndSend = (s) => { c.setPrev(s); sendStage(s); };
    const tabsPanel = (
        <TabsPanel c={c} data={data} tabs={panelTabsShown} active={panelTabNow} setActive={setPanelTab} onMenu={() => setOpen(open === "tabs:panel" ? null : "tabs:panel")} menuOpen={open === "tabs:panel"}
            items={items} prevItemId={prevItemId} airItemId={airItemId} service={service} onSaveNotes={saveOperatorNotes} onPrepare={prepare} onGo={prepareAndSend} />
    );
    const libraryPanel = (
        <Panel title="Biblioteca" actions={<TabsPlus row="lib" onMenu={() => setOpen(open === "tabs:lib" ? null : "tabs:lib")} menuOpen={open === "tabs:lib"} />} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Library c={c} data={data} tab={libTabNow} setTab={setLibTab} tabs={shownTabs("lib", tabLists.lib)} elsewhere={panelHas}
                onPrepare={prepare} onGo={prepareAndSend} onAddSong={addSong} onLyricsWeb={() => setOpen("lyrics")} onEditSong={openSong} onOpenMedia={openMedia} onEditNotice={openNotice} />
        </Panel>
    );
    const slidesPanel = (
        <Panel title="Slides" count={handTitle(c) || "—"} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SlidesPanel c={c} onGo={(s) => sendStage(s)} airTabs={!onScreen("onair")} />
        </Panel>
    );
    // What is on air, slide by slide, whatever the Slides column holds.
    const onAirPanel = (
        <Panel title="No ar" count={onAirCount(c, layout.onairMin) || "—"} className="onair-panel" bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}
            collapsed={Boolean(layout.onairMin)} onToggle={() => setLayout({ ...layout, onairMin: !layout.onairMin })}>
            <OnAirPanel c={c} />
        </Panel>
    );

    // Multiview (Programa › Multiview; src/lib/console/multiview.js): the
    // Programa as four outputs at once; a quadrant's label picks its output.
    const railViews = useRailViews();
    const toggleMultiview = () => setLayout({ ...layout, multiview: !layout.multiview });
    const pickQuadrant = (e, index) => openMenu(e, { title: `Quadro ${index + 1} · mostrar a saída`, items: [
        ...railViews.map((v) => ({ label: v.name, icon: layout.mvTiles[index] === v.key ? "check" : v.icon, onSelect: () => setLayout({ ...layout, mvTiles: pickTile(layout.mvTiles, index, v.key) }) })),
        "sep",
        { label: "Ajustes das saídas…", icon: "sliders", onSelect: () => openSettings("telas") },
    ] });
    const multiview = layout.multiview ? { tiles: layout.mvTiles, rows: health.rows, onPick: pickQuadrant } : null;

    // The player (always visible): under the Programa until the dock places it.
    const playerSlot = (
        <PlayerSlot c={c} picked={playerPick} setPicked={setPlayerPick} projectorOpen={Boolean(projector?.open)}
            videoScreens={network.filter((d) => d.online && d.role === "media").map((d) => d.name).join(", ") || null} />
    );
    // The Programa's menu: its right click and the pill's "…" (which holds
    // what a folded pill leaves out, Camadas included while in the tray).
    const progMenu = (e) => openMenu(e, { title: "Programa", items: [
        { label: c.cur?.screen === "black" ? "Tirar a tela preta" : "Tela preta", icon: "black", kbd: "B", onSelect: () => c.toggleScreen("black") },
        { label: c.cur?.screen === "logo" ? "Tirar o logo" : "Mostrar logo", icon: "logo", kbd: "L", onSelect: () => c.toggleScreen("logo") },
        { label: "Limpar texto", icon: "eraser", kbd: "C", onSelect: c.clearText },
        { label: "Voltar ao anterior…", icon: "undo", onSelect: () => setOpen("hist") },
        !camadasOn && { label: drawer ? "Fechar Camadas" : "Camadas…", icon: "layers", onSelect: () => setDrawer((d) => !d) },
        { label: layout.multiview ? "Ver só o Programa" : "Multiview: quatro saídas", icon: "grid", onSelect: toggleMultiview },
        { label: "Encerrar…", icon: "stop", air: true, onSelect: () => setOpen("encerrar") },
    ] });
    // The Programa has no header (Rodada E1): the screen's top lines up with
    // the panels beside it, and its caption and controls are the pill inside
    // the screen (ProgramaPill). The papel de parede's one live door is
    // Camadas' Fundo pencil (Rodada B 2026-10-14); with Camadas in the tray
    // the pill's Camadas button opens the drawer that keeps it a click away.
    const programaPill = (
        <ProgramaPill c={c} projectorDown={projectorDown} where={health.onAir}
            camadas={camadasOn ? null : { open: drawer, onToggle: () => setDrawer((d) => !d) }}
            histOpen={open === "hist"} onHist={() => setOpen(open === "hist" ? null : "hist")}
            multiviewOn={Boolean(layout.multiview)} onMultiview={toggleMultiview} onMore={progMenu} onEnd={() => setOpen("encerrar")} />
    );
    const livePanel = (
        <Panel bare className="prog-panel" bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <CenterPanel c={c} logoUrl={logoUrl} projectorDown={projectorDown} player={playerDocked ? playerSlot : null}
                items={playable} multiview={multiview} still={winOpen} pill={programaPill}
                onDropStage={(s, where) => { c.setPrev(s); if (where === "air") sendStage(s); }}
                onProgMenu={progMenu} />
        </Panel>
    );
    // The Prévia: its screen, then the teacher notes (unless the Notas tab
    // is on screen). Enter, a double click or its menu send it.
    const previaPanel = (
        <PreviaPanel c={c} logoUrl={logoUrl} notesInTab={panelOnScreen && tabLists.panel.includes("notas")}
            onSend={() => sendStage()} onDropStage={(s, where) => { c.setPrev(s); if (where === "air") sendStage(s); }}
            onPrevMenu={(e) => openMenu(e, { title: "Prévia", items: [
                { label: "Limpar a prévia", icon: "x", disabled: !c.prev, onSelect: () => c.setPrev(null) },
                { label: "Enviar ao ar", icon: "play", kbd: "Enter", air: true, disabled: !c.prev || c.locked, onSelect: () => sendStage() },
            ] })} />
    );
    // Every module of the culto environment, each built apart from where it
    // goes (the ids are src/lib/console/dock.js's MODULES); the dock places
    // them. The player rides inside the Programa until it is placed.
    const modulePanels = {
        lib: libraryPanel, slides: slidesPanel, programa: livePanel, previa: previaPanel, abas: tabsPanel, setlist: setlistPanel, camadas: camadasPanel, temas: temasPanel, onair: onAirPanel,
        player: <Panel title="Player" className="player-panel">{playerSlot}</Panel>,
    };
    const renderModule = (id) => (modulePanels[id] ? React.cloneElement(modulePanels[id], { key: id }) : null);

    // The service clock in the top bar, and how late the item on air runs.
    const playAirIdx = playable.findIndex((i) => i.id === airItemId);
    const late = service ? serviceTiming({ items: playable, times: plannedTimes(service, playable), airIdx: playAirIdx, startedAt: playAirIdx >= 0 ? log[airItemId]?.start : null, now: c.now }).late : 0;
    const showForecast = useShowForecast();
    const svc = serviceClock({ service, seconds: setPlan.seconds, late, now: c.now, forecast: showForecast, compact: true });

    // The palette opens centred (owner decision 2026-10-11); the dimmed scrim
    // keeps the console readable behind it.

    const hhmm = (t) => (t ? new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

    // The menu bar (owner 2026-10-15, Rodada D4, "Menus novos" = A;
    // src/lib/console/menuBar.js): Culto, Música, Mídia, Ferramentas after
    // KERYX | Bíblia (Ver is the eye, Ajuda the logo's menu: O topo; no Telas
    // menu, Rodada E0); every item is something the console already does.
    // Música › Importar uma pasta… uses this hidden picker.
    const church = useChurch();
    const folderRef = useRef(null);
    const barLayer = playerLayer(c.cur);
    const menus = buildMenus({
        services, serviceId, itemsCount: items.length, locked: c.locked,
        songId: songInHand(c.prev, c.cur), follow: c.cur?.content?.follow || null,
        playerOn: Boolean(barLayer), playing: Boolean(barLayer && !c.cur[barLayer]?.playback?.paused),
        timers: timerChoices(data.timerPresets).map((t) => ({ minutes: t.minutes, label: minutesLabel(t.minutes) })),
        act: {
            pickService: (id) => setServiceId(id),
            planner: (id) => openPlanner(id),
            settings: (section) => openSettings(section),
            exportPdf: () => { if (service) exportServiceToPdf(service, items, church).then(() => c.say("PDF gerado.")).catch((err) => c.say(err?.message || "Não foi possível gerar o PDF.")); },
            newSong: () => openSong("new"),
            lyricsSearch: () => setOpen("lyrics"),
            importFolder: () => folderRef.current?.click(),
            syncSong: (id) => openSong(id, { sync: true }),
            follow: (action) => c.callOp("content.follow", { action }).catch(() => {}),
            media: (intent) => openMedia(intent),
            playerToggle: () => { const op = playerOp(c.cur, barLayer, "toggle"); if (op) c.callOp(op[0], op[1]).catch(() => {}); },
            notices: () => openNotices(),
            newNotice: () => openNotice("new"),
            quickAlert: async () => {
                const t = await askText({ title: "Aviso rápido", placeholder: "Carro placa ABC-1234, procure a recepção", ok: "Enviar às telas", hint: "Vai direto às telas" });
                if (t) c.callOp("alert.show", { message: t, type: "message" }).catch(() => {});
            },
            timer: (minutes) => { c.setPrev(stageFromTool("timer", { minutes })); c.say(`Timer de ${minutesLabel(minutes)} na Prévia · Enter envia.`); },
            school: () => openSchool(),
            reports: () => openReports(),
        },
    });

    // What the window's pages get from the console (WinPages.jsx): the same
    // props a detached page's window gives them, through the relay there.
    const winHost = {
        c, data, logoUrl, askText,
        push: (spec, from) => setWin((s) => winPush(s, spec, from)),
        replaceTop: (props, opts) => setWin((s) => winReplaceTop(s, props, opts)),
        sendNow: (s) => { c.setPrev(s); sendStage(s); },
        sendStage: (s) => sendStage(s),
        songSaved, addMaterial,
        cfg, setCfg, uiLayout, setUiLayout, restoreLayout, openScreen, openWhatsNew,
        services, serviceId, setServiceId, plannerFocus,
    };
    // A page's guard calls this once leaving is allowed. While a detach is
    // under way, the level leaves (pop) and the next one asks; after the
    // last, the page opens in its own window (/Janela) — only after every
    // guard said yes, so "Descartar as mudanças?" comes first (it used to
    // detach the editors without asking).
    const winCloser = (entry) => (all = false) => {
        const d = detaching.current;
        if (d && d.keys[d.keys.length - 1] === entry.key) {
            d.keys.pop();
            leaveTop(false);
            if (d.keys.length) { leaveVia(d.keys[d.keys.length - 1]); return; }
            detaching.current = null;
            const w = window.open(`${window.location.origin}/Janela?${d.spec.query}`, janelaName(d.spec.page), "width=1280,height=820");
            if (!w) { c.say("O navegador bloqueou a janela: permita pop-ups para destacar a página."); return; }
            try { w.focus(); } catch { /* another window may refuse focus */ }
            return;
        }
        detaching.current = null;
        leaveTop(Boolean(all));
    };
    // One level leaves through its own request (mode "detach": the page's
    // guard asks, then calls its onClose, winCloser above).
    const leaveVia = (key) => {
        const fn = winRefs.current.get(key)?.current;
        if (fn) fn("detach");
        else { const e = win.find((x) => x.key === key); if (e) winCloser(e)(false); }
    };
    const detachTop = () => {
        const spec = detachSpec(win, { section: cfg, serviceId });
        if (!spec) return;
        detaching.current = { spec, keys: win.slice(-spec.pop).map((e) => e.key) };
        leaveVia(detaching.current.keys[detaching.current.keys.length - 1]);
    };

    // The detached pages (Rodada F5, src/lib/janelaRelay.js): what they put
    // in the Prévia or on air runs here, through the console's own Prévia,
    // sendStage (the history, the log) and songSaved; read through a ref,
    // the latest state. They hear what the Prévia holds now.
    const relayRun = (m) => {
        switch (m.type) {
            case "prev.set": c.setPrev(m.stage); break;
            case "stage.send": c.setPrev(m.stage); sendStage(m.stage); break;
            case "prev.send": if (c.prev) sendStage(c.prev); else c.say("Nada na prévia."); break;
            case "prev.step": selectSlide(m.d); break;
            case "song.saved": songSaved(m.song); break;
            case "setlist.material": addMaterial(m.material); break;
            case "console.open": if (m.what === "novidades") openWhatsNew(); else openSettings(m.section || "console"); break;
            case "console.hello": tellPrev(c.prev); break;
            default: break;
        }
    };
    const relayRef = useRef(relayRun);
    relayRef.current = relayRun;
    useEffect(() => relayListen("console", (m) => relayRef.current(m)), []);
    // A Prévia the list cannot carry (a theme's example) reads as empty there.
    const tellPrev = (stage) => { if (!relaySend("console", "console.prev", { stage: stage || null })) relaySend("console", "console.prev", { stage: null }); };
    useEffect(() => { tellPrev(c.prev); }, [c.prev]);

    return (
        <ContextMenuProvider value={openMenu}>
        <LibraryContext.Provider value={pickFromLibrary}>
        <ConfirmContext.Provider value={askConfirm}>
        <div className={`kx console is-${tier} is-${density} ${c.locked ? "is-locked" : ""} ${editing ? "is-editing" : ""}`} onClick={onMouseClick}>
            <div className="winbar" aria-hidden="true">KERYX</div>
            <TopBar c={c} menus={menus} env={env} setEnv={setEnv} open={open} setOpen={setOpen} outsLabel={health.status.label} outsCompact={health.status.compact} outsState={health.status.state} logoUrl={logoUrl} unread={upd.unread} svc={svc} onPlanner={() => openPlanner(serviceId)} />

            {/* A failing output: one line under the top bar, in every view, never over a monitor. One at a time (outputHealth picks it). */}
            {health.banner?.kind === "reconnecting" && (
                <div className="kx-banner is-warn" role="alert">
                    <span className="kx-alert-title">{health.banner.row.key === "/Projection" ? "Projetor" : health.banner.row.name} · Reconectando… tentativa {tries}</span>
                    <span className="kx-sub">ATENÇÃO · {health.banner.row.key === "/Projection" ? `última conexão boa às ${hhmm(lastOkAt)} · ` : ""}o monitor escolhido não está ligado</span>
                    <span className="kx-spacer" />
                    <button type="button" className="kx-btn kx-t" onClick={() => c.toggleScreen("black")}>Tela preta</button>
                    <button type="button" className="kx-btn kx-t" onClick={() => c.toggleScreen("logo")}>Mostrar logo</button>
                    <button type="button" className="kx-btn kx-btn-outline kx-t" onClick={() => setOpen("outs")}>Ver saídas</button>
                </div>
            )}
            {health.banner && health.banner.kind !== "reconnecting" && (
                <div className="kx-banner is-warn" role="alert">
                    <span className="kx-alert-title">{health.banner.title}{health.banner.more ? ` · e mais ${health.banner.more}` : ""}</span>
                    <span className="kx-sub">{health.banner.sub}</span>
                    <span className="kx-spacer" />
                    {health.banner.kind === "closed" && <button type="button" className="kx-btn kx-btn-outline kx-t" onClick={() => openOutput(health.banner.row.key)}>Reabrir</button>}
                    <button type="button" className={`kx-btn kx-t ${health.banner.kind === "closed" ? "" : "kx-btn-outline"}`} onClick={() => setOpen("outs")}>Ver saídas</button>
                    <button type="button" className="kx-btn kx-t" onClick={() => forgetOutput(health.banner.row.id)} title="Não avisar mais sobre esta saída nesta sessão">Esquecer</button>
                </div>
            )}
            {/* Travar telas: the console prepares, the screens keep what they show. */}
            {editing && (
                <EditBanner onRestore={() => { setLayout(restoreHere()); c.say(env === "biblia" ? "A Bíblia voltou à disposição padrão." : "Posições e larguras padrão restauradas."); }} onDone={() => setEditing(false)}>
                    {!winOpen && <DockTray dock={envDock} dnd={dockDrag} onChipMenu={moveMenu} />}
                    {!winOpen && env === "culto" && <span className="dock-presets dock-span"><span className="kx-meta">No ar:</span><Seg small value={layout.onairSpan} onChange={setOnairSpan} options={[["columns", "Sob as colunas", { title: "A faixa sob a Biblioteca, os Slides e o Programa; o Setlist desce até embaixo" }], ["window", "Janela toda", { title: "A faixa de ponta a ponta, sob todas as colunas" }]]} /></span>}
                    {!winOpen && <span className="dock-presets dock-span"><span className="kx-meta">Tamanhos:</span><Seg small value={dockMode(envDock)} onChange={setEnvMode} options={[["free", "Livre", { title: "Os divisores param onde você soltar; os tamanhos ficam em pixels" }], ["pct", "Por %", { title: "Os divisores encaixam de 5 em 5 %; numa tela menor ou maior, as proporções se mantêm" }]]} /></span>}
                    {!winOpen && <DockPresetsBar preset={preset} changed={presetDirty} onSave={savePreset} onSaveAs={savePresetAs} onDelete={deletePreset} problemOf={(name) => nameProblem(presets, name)} />}
                </EditBanner>
            )}
            {c.locked && (
                <div className="kx-banner is-rh" role="status"><span className="kx-alert-title">TELAS TRAVADAS — nada novo vai às telas</span><span className="kx-sub">Prepare à vontade; Tela preta, Logo, Limpar e Esc continuam valendo.</span><span className="kx-spacer" /><button type="button" className="kx-btn kx-btn-rh kx-t" onClick={() => c.setLocked(false)}>Destravar</button></div>
            )}
            <div className="main" ref={mainRef}>
                {env === "biblia" && <BibleEnv c={c} logoUrl={logoUrl} request={bibleRequest} stageRef={bibleStageRef} apiRef={bibleApiRef} serviceId={serviceId} itemsCount={items.length} ensureService={ensureService} onSend={(s) => sendStage(s)} onEnd={() => setOpen("encerrar")}
                    grid={layout.bibleGrid} setGrid={(v) => setLayout({ ...layout, bibleGrid: v })}
                    dockProps={{ frame: bibleFrame, dock: bibleDock, onDock: setBibleDock, editing, dnd: dockDrag, onChipMenu: moveMenu }} />}
                {env === "culto" && <DockView frame={dockFrame} dock={dock} onDock={setDock} render={renderModule} editing={editing} dnd={dockDrag} onChipMenu={moveMenu} playerDocked={playerDocked} />}
            </div>
            {dockDrag.drag && <DockHint drag={dockDrag.drag} />}

            {/* THE window (Rodada C): one dialog, its pages stacked by
                nav.js — all mounted, only the top shown, so Voltar finds
                the page below as it was. The scrim click asks the top page
                to leave, exactly as Esc does; the bar's (x) closes all. */}
            {winOpen && <div className="scrim is-dim win-scrim" onClick={() => winEsc("esc")} />}
            {winOpen && (
                <div ref={winDialogRef} style={winStyle} className={`win-dialog ${winKind === "editor" ? "is-editor" : ""} ${winRect ? "is-sized" : ""}`} role="dialog" aria-modal="true" aria-label={PAGE_TITLES[winTop.page]}>
                    <WinEdges dialogRef={winDialogRef} onRect={setWinRect} onDone={(r) => setWinState((st) => withSize(st, winKind, { w: r.w, h: r.h }))} />
                    {win.map((entry, i) => {
                        const active = i === win.length - 1;
                        const page = winPage(entry, { active, escRef: winRef(entry.key), onClose: winCloser(entry) }, winHost);
                        // ⧉ Destacar em janela: on the page on top, when it can stand alone (nav.js detachSpec).
                        const canDetach = active && Boolean(detachSpec(win, { section: cfg, serviceId }));
                        return (
                            <WinCtx.Provider key={entry.key} value={{ back: entry.back, onBack: () => winEsc("back"), onCloseAll: () => winEsc("all"), onResetSize: resetWinSize, onDetach: canDetach ? detachTop : null }}>
                                <div className="win-page" hidden={!active}>{page}</div>
                            </WinCtx.Provider>
                        );
                    })}
                </div>
            )}
            {libReq && <BackgroundLibrary c={c} request={libReq} onDone={closeLibrary} />}
            {confirmReq && <ConfirmDialog request={confirmReq} onAnswer={answerConfirm} />}
            {open && <div className={`scrim ${winOpen ? "over-win" : ""} ${open === "palette" || open === "atalhos" || open === "encerrar" || open === "verificar" || open === "lyrics" || open === "update" || open === "novidades" ? "is-dim" : ""}`} onClick={() => setOpen(null)} />}
            {open === "lyrics" && <LyricsSearch c={c} onClose={() => setOpen(null)} onImported={(song) => { c.setPrev(stageFromSong(song, {}, data.themes)); openSong(song.id); }} />}
            {open === "verificar" && (
                <div className="verif-overlay">
                    <VerifyView c={c} items={playable} data={data} outputs={outputs.filter((o) => !o.removed)} network={network}
                        onIdentify={() => window.keryxDesktop?.displays.identify().catch(() => {})}
                        onOpenOutput={openOutput} onClose={() => setOpen(null)} onSettings={openSettings} onOpenMedia={openMedia} />
                </div>
            )}
            <MenuBarPop menus={menus} open={open} setOpen={setOpen} />
            <input ref={folderRef} type="file" multiple hidden webkitdirectory="" accept=".txt,.chordpro,.cho,.crd,.pro,.json,text/plain"
                onChange={(e) => { const files = [...(e.target.files || [])].filter((f) => SONG_FILE.test(f.name)); e.target.value = ""; if (files.length) importSongFiles(files, c.say); else c.say("Nenhum arquivo de letra nessa pasta."); }} />
            <Menu open={open} setOpen={setOpen} services={services} serviceId={serviceId} setServiceId={setServiceId} layout={uiLayout} setLayout={setUiLayout} restoreLayout={restoreLayout} presets={presets} presetId={preset?.id || null} presetDirty={presetDirty} onPickPreset={(id) => { pickPreset(id); setOpen(null); }} editing={editing} onEditLayout={() => { setEditing((v) => !v); setOpen(null); }} onSettings={openSettings} onPlanner={openPlanner} onMedia={openMedia} onNotices={openNotices} onNewNotice={() => openNotice("new")} onSchool={openSchool} onReports={openReports} update={upd.update} onUpdateNow={updateNow} onWhatsNew={openWhatsNew} />
            <WhatsNew open={open} setOpen={setOpen} range={whatsNew} onSeen={whatsNewSeen} />
            <UpdateDialog open={open} setOpen={setOpen} update={upd.update} live={c.live} call={upd.call} />
            <Notifications open={open} setOpen={setOpen} notes={upd.notes} update={upd.update} onAction={noteAction} onDismiss={(id) => upd.call("notificationDismiss", { id }).catch(() => {})} onClear={() => upd.call("notificationsClear").catch(() => {})} />
            <Shortcuts open={open} setOpen={setOpen} />
            <Outputs open={open} setOpen={setOpen} health={health} locked={c.locked} onLock={c.setLocked} onOpen={openOutput} onClose={closeOutput} onForget={forgetOutput} removed={removedOutputs} onRestore={restoreOutput} idle={c.live?.idle || "logo"} onIdle={(m) => setIdleMode(c, m)} onSettings={openSettings} />
            <TabsMenu open={open} list={tabLists[open?.slice(5)]} onToggle={toggleTabIn} onRestore={(row) => setTabList(row, DEFAULT_TABS[row])} />
            <History open={open} setOpen={setOpen} history={c.live?.history || []} onPick={(s) => c.setPrev(s)} anchor={histAnchor} />
            <EndDialog open={open} setOpen={setOpen} onEnd={c.end} />
            <PromptDialog ask={ask} onAnswer={answerAsk} />
            <Palette open={open} setOpen={setOpen} data={data} items={playable} env={env} onPrepare={(s, i) => (s?.op ? c.setPrev(s) : prepareItem(s, i))} onAddSong={addSong} openReference={openReference} onPrepareReference={prepareReference} onAddReference={addReference} onBibleSearch={searchBibleFor} />
            {drawer && !camadasOn && !winOpen && env === "culto" && (() => {
                // Never over the Programa: on the side of it with more room
                // (the dock can put it anywhere), up to its edge.
                const r = programaBox();
                const roomL = r ? r.left - 12 : 360;
                const roomR = r ? window.innerWidth - r.right - 12 : 0;
                const right = roomR > roomL;
                return (
                <div className={`drawer ${right ? "is-right" : ""}`} style={{ width: Math.max(240, Math.min(360, right ? roomR : roomL)) }}>
                    <Panel title="Camadas" actions={<><IconBtn name="plus" title="Adicionar: sobreposição de texto, logo da igreja" small onClick={camadasMenu} /><IconBtn name="x" title="Fechar · Esc" small onClick={() => setDrawer(false)} /></>}>
                        {layers}
                    </Panel>
                </div>
                );
            })()}
            {quick !== null && env === "biblia" && (
                <BibleQuickJump initial={quick} onCancel={() => setQuick(null)}
                    onPick={(r) => { setQuick(null); setBibleRequest({ book: r.book.name, chapter: r.chapter, verseStart: r.verseStart, verseEnd: r.verseEnd ?? r.verseStart, at: Date.now() }); }} />
            )}
            {c.toast && (
                <div className="toast" role="status">
                    <span className="toast-t">{c.toast}</span>
                    {c.toastAction && <button type="button" className="kx-btn kx-t toast-act" onClick={() => c.toastAction.run()}>{c.toastAction.label}</button>}
                </div>
            )}
            <ContextMenuLayer menu={ctxMenu} onClose={closeMenu} />
        </div>
        </ConfirmContext.Provider>
        </LibraryContext.Provider>
        </ContextMenuProvider>
    );
}
