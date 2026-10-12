import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { mediaFromYouTube } from "@/lib/mediaImport";
import "@ds/tokens.css";
import "@ds/components/bundle.css";
import "@/components/console/console.css";
import { keryx } from "@/api/keryxClient";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { useUser, usePrefs, getPrefs, updateUser, useMigratePrefs } from "@/hooks/useUser";
import { hiddenList, hiddenMap } from "@/lib/prefs/schema";
import { useConsole, LOCKED_SAY } from "@/components/console/useConsole";
import { useLibrary, useRundown, useOutputs, useShowForecast, pickDefaultService } from "@/components/console/useConsoleData";
import { Panel, Split, IconBtn } from "@/components/console/kx";
import Icon from "@/components/console/Icon";
import TopBar from "@/components/console/TopBar";
import Library from "@/components/console/Library";
import SlidesPanel, { handTitle } from "@/components/console/SlidesPanel";
import CenterPanel, { captionOf, ProgramaCaption } from "@/components/console/CenterPanel";
import { outputHealth, localId } from "@/lib/console/outputs";
import Rundown, { plannedTimes } from "@/components/console/Rundown";
import Layers from "@/components/console/Layers";
import Timeline from "@/components/console/Timeline";
import BibleEnv, { bibleVersionWanted } from "@/components/console/BibleEnv";
import BibleQuickJump from "@/components/console/BibleQuickJump";
import VerifyView from "@/components/console/VerifyView";
import LyricsSearch from "@/components/console/LyricsSearch";
import SongEditor from "@/components/console/SongEditor";
import ServicePlanner from "@/components/console/ServicePlanner";
import MediaView from "@/components/console/MediaView";
import NoticeEditor from "@/components/console/NoticeEditor";
import SchoolView from "@/components/console/SchoolView";
import ReportsView from "@/components/console/ReportsView";
import SettingsView from "@/components/console/settings/SettingsView";
import { resolveSection } from "@/lib/console/settings";
import { newServiceDefaults, defaultDuration } from "@/lib/console/serviceDefaults";
import { ContextMenuProvider, ContextMenuLayer, menuRequest } from "@/components/console/ContextMenu";
import { Menu, Shortcuts, Outputs, History, EndDialog, Palette, UpdateDialog, Notifications, WhatsNew } from "@/components/console/Popovers";
import { useUpdates } from "@/components/console/useUpdates";
import { shouldOpenOnLaunch, hasUpdate } from "@/lib/console/updates";
import { loadLayout, saveLayout, clampSize, DEFAULT_LAYOUT, sideCol, tierFor, densityOf, restoreArrangement } from "@/lib/console/layout";
import { cultoColumns, withSplits, stackSplit, moveColumn, moveTo, CARD_NAMES } from "@/lib/console/arrange";
import { pickTile } from "@/lib/console/multiview";
import { useRailViews } from "@/hooks/useOutputPref";
import { ColumnBar, StackLead, EditBanner, DropLine, usePointerReorder } from "@/components/console/Arrange";
import { liveAction, quickJumpKey, escapeTarget } from "@/lib/console/keys";
import { playerLayer, playerOp } from "@/lib/console/player";
import { stageFromVerses, stageFromSong, stageFromPassage, stageFromMedia, stageFromPiece, stageFromMaterial, stageFromText, stageFromTool, stageAt, stageAirSlide, liveStageId } from "@/lib/console/stage";
import { plan, playableItems, isSection, total } from "@/lib/console/setlist";
import { serviceTiming, serviceClock } from "@/lib/console/timeline";
import { referenceNums, passageOf } from "@/lib/console/bibleVerses";
import { readChapter } from "@/lib/bibleText";
import { formatReference, parseReference } from "@/lib/bibleBooks";
import { remoteState, remoteSay, passagePreview } from "@/lib/console/remote";

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
    const logoUrl = useChurchLogo();
    const data = useLibrary();
    const [profile, setProfile] = useState("");
    const [quick, setQuick] = useState(null);
    // The layer the player controls when several play (null: the newest).
    const [playerPick, setPlayerPick] = useState(null);
    // The Bible environment's selection, as a stage: what Enter sends there.
    const bibleStageRef = useRef(null);
    // The Bible environment's selection cursor (↑/↓ from the console's keys).
    const bibleApiRef = useRef(null);
    // ?env=biblia (the old /Bible page on desktop) opens the Bíblia environment.
    const [env, setEnvState] = useState(() => {
        try { return new URLSearchParams(window.location.search).get("env") === "biblia" ? "biblia" : "culto"; } catch { return "culto"; }
    });
    // The views inside the console, one at a time (null: the console itself):
    // { song: id | "new" } the song editor,
    // { planner: true } the service planner, { media: true } the media
    // library, { notice: id | "new" } the aviso editor, { school: true } the
    // Escola bíblica, { reports: true } Relatórios. The old pages land here on
    // desktop: /Settings ?config=telas, /Home ?song=new, /Services
    // ?planner=<id>, /Media ?media=1, /Communication ?lib=avisos,
    // /BibleSchool ?school=1, /Analytics and /SongHistoryPage ?reports=1.
    const [view, setView] = useState(() => {
        try {
            const p = new URLSearchParams(window.location.search);
            if (p.get("song")) return { song: p.get("song") };
            if (p.get("planner")) return { planner: true };
            if (p.get("media")) return { media: true };
            if (p.get("notice")) return { notice: p.get("notice") };
            if (p.get("school")) return { school: true };
            if (p.get("reports")) return { reports: true };
        } catch { /* no query */ }
        return null;
    });
    const editSong = view?.song || null;
    const planner = Boolean(view?.planner);
    const mediaView = Boolean(view?.media);
    const notice = view?.notice || null;
    const school = Boolean(view?.school);
    const reports = Boolean(view?.reports);
    const closeView = useCallback(() => setView(null), []);
    const setEnv = useCallback((v) => { setView(null); setEnvState(typeof v === "function" ? v(env) : v); }, [env]);
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
    const closeSettings = useCallback(() => setCfgAt(null), []);
    // The right-click menu open now (ContextMenu.jsx), first in the Esc order.
    const [ctxMenu, setCtxMenu] = useState(null);
    const openMenu = useCallback((e, spec) => { e.preventDefault(); e.stopPropagation(); setCtxMenu(menuRequest(e, spec)); }, []);
    const closeMenu = useCallback(() => setCtxMenu(null), []);
    const openSettings = useCallback((section = "telas") => { setOpen(null); setCfg(section); }, [setCfg]);
    const openSong = useCallback((id) => { setOpen(null); setView({ song: id }); }, []);
    const openMedia = useCallback(() => { setOpen(null); setView({ media: true }); }, []);
    const openNotice = useCallback((id) => { setOpen(null); setView({ notice: id || "new" }); }, []);
    // The Escola bíblica sends through the KERYX environment's Prévia.
    const openSchool = useCallback(() => { setOpen(null); setEnvState("culto"); setView({ school: true }); }, []);
    const openReports = useCallback(() => { setOpen(null); setView({ reports: true }); }, []);
    const [plannerFocus, setPlannerFocus] = useState(null);
    const [open, setOpen] = useState(null);
    const [libTab, setLibTab] = useState(() => {
        try { return new URLSearchParams(window.location.search).get("lib") === "avisos" ? "avisos" : "letras"; } catch { return "letras"; }
    });
    const openNotices = useCallback(() => { setOpen(null); setView(null); setEnvState("culto"); setLibTab("avisos"); }, []);
    const [drawer, setDrawer] = useState(false);
    // Ver › Editar layout: moving the columns and stacked cards (arrange.js).
    // A view (editor, planner, ...) takes the whole grid: editing ends.
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
    const centerRef = useRef(null);
    const [tier, setTier] = useState(() => tierFor(window.innerWidth - 12));
    const compact = tier !== "wide";

    useEffect(() => {
        keryx.auth.me().then((u) => { const p = u?.email || u?.full_name || ""; setProfile(p); setLayoutState(loadLayout(p)); }).catch(() => {});
    }, []);
    useEffect(() => {
        const el = mainRef.current;
        if (!el || typeof ResizeObserver === "undefined") return undefined;
        const ro = new ResizeObserver(([entry]) => setTier(tierFor(entry.contentRect.width)));
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
    const restoreLayout = () => { setLayout({ ...DEFAULT_LAYOUT }); c.say("Layout padrão restaurado."); };

    const { services, items } = useRundown(serviceId);
    useEffect(() => { if (!serviceId && services.length) setServiceId(pickDefaultService(services)?.id || null); }, [services, serviceId]);
    useEffect(() => { if (serviceId) setLog(loadLog(serviceId)); }, [serviceId]);
    const service = services.find((s) => s.id === serviceId) || null;
    // Fundo de espera: picking a service applies its wallpaper, else the
    // church's default (User.standby_background); with neither the idle look
    // stays as the operator left it. A choice in Saídas wins until the next
    // service is picked (docs/next-version-plan-2026-10-10.md, C6).
    const globalWall = useUser((u) => u?.standby_background || null);
    const wantWall = service?.standby_background || globalWall || null;
    const appliedWall = useRef(null);
    useEffect(() => {
        if (!serviceId) return;
        if (!wantWall) {
            // The default was cleared (or the service has none now): a
            // wallpaper put up here goes back to the logo; one the operator
            // chose in Saídas stays.
            const was = appliedWall.current;
            appliedWall.current = null;
            if (was && c.live?.idle === "background" && c.live?.idleUrl === was.url) c.liveOp("idle.set", { mode: "logo" }).catch(() => {});
            return;
        }
        const key = `${serviceId}|${wantWall}`;
        if (appliedWall.current?.key === key) return;
        appliedWall.current = { key, url: wantWall };
        if (c.live?.idle === "background" && c.live?.idleUrl === wantWall) return;
        c.liveOp("idle.set", { mode: "background", url: wantWall }).catch(() => {});
    }, [serviceId, wantWall]); // eslint-disable-line react-hooks/exhaustive-deps
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
    // After the next one, for the live column when the Setlist has no column of its own.
    const laterItems = useMemo(() => {
        if (!nextItem) return [];
        const from = items.indexOf(nextItem) + 1;
        return items.slice(from).map((item, k) => ({ item, index: from + k })).filter(({ item }) => !isSection(item)).slice(0, 8);
    }, [items, nextItem]);
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
        if (open || view) return;
        if (shouldOpenOnLaunch({ update: upd.update, sinceMountMs: Date.now() - mountedAt.current, dismissed: updDismissed })) setOpen("update");
    }, [upd.update, open, view, updDismissed]);
    const updateNow = useCallback(() => {
        const u = upd.update;
        if (!hasUpdate(u)) return;
        if (u.status === "available" || u.status === "error") upd.call("updateDownload").catch((err) => c.say(err.message));
        setView(null);
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
        setView(null);
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

    // ↑/↓ in the KERYX environment: the selection walks the slides of the
    // item in hand (the Prévia's own, else the ones on air); Enter sends it.
    const selectSlide = useCallback((d) => {
        const p = c.prev;
        const air = c.cur?.content;
        if (p && p.slides.length > 1 && !p.airSlide) { c.setPrev(stageAt(p, p.index + d)); return; }
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
        setView({ planner: true });
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
            if (env === "biblia" && !open && !cfg && quick === null && !view) {
                const ch = quickJumpKey(e);
                if (ch) { e.preventDefault(); setQuick(ch); return; }
            }
            const action = liveAction(e);
            if (!action) return;
            if (action === "blur") { e.target.blur?.(); return; }
            // Esc closes the topmost thing open (src/lib/console/keys.js,
            // escapeTarget); only with nothing open does it end the projection.
            if (action === "end") {
                const top = escapeTarget({ menu: ctxMenu, popover: open, settings: cfg, drawer, edit: editing });
                if (top !== "end") {
                    e.preventDefault();
                    if (top === "menu") setCtxMenu(null);
                    else if (top === "popover") setOpen(null);
                    else if (top === "settings") setCfgAt(null);
                    else if (top === "drawer") setDrawer(false);
                    else if (top === "edit") setEditing(false);
                    return;
                }
            }
            // With a menu open only Tela preta and Logo reach the screens.
            if (ctxMenu && !["black", "logo"].includes(action)) return;
            if (open) return;
            // The song editor handles its own keys (Esc, Space while marking);
            // only the emergency keys reach the screens from there.
            // So do the planner, the media library, the aviso editor and the
            // reports (each closes itself on Esc). The Escola bíblica is a
            // projecting view: every live key works there.
            // Configurações is a window over the console: behind it, as behind
            // the views, only the emergency keys (Tela preta, Logo) act.
            if ((cfg || (view && !school)) && !["black", "logo"].includes(action)) return;
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
    }, [c, ctxMenu, open, drawer, editing, sendStage, env, quick, playerPick, selectSlide, view, cfg, school]);
    useEffect(() => { if (view) setEditing(false); }, [view]);

    // A mouse click must not leave focus on the control it hit: the live keys
    // would then belong to that control (the "keys don't work" bug). Keyboard
    // activation (detail 0) keeps focus, so Tab navigation still works.
    const onMouseClick = (e) => {
        if (e.detail === 0) return;
        const t = e.target.closest?.("button, [role='button'], [role='tab'], [role='radio'], [role='menuitem'], a[href]");
        if (t && !t.closest(".dialog, .palette, .qj, .lyr, .addmenu")) setTimeout(() => t.blur?.(), 0);
    };

    const rundownProps = { service, items, airItemId, prevItemId, prepare: prepareItem, go: goItem, addStage: addStageToSetlist };
    // "Voltar ao anterior" opens over the Programa, wherever its column is.
    const histLeft = open === "hist" ? Math.round(centerRef.current?.getBoundingClientRect().left ?? 6) : 0;
    // The columns on screen come from the layout's order (Ver › Editar
    // layout; src/lib/console/arrange.js): wide, a column with Camadas and
    // the Setlist stacked (each can be hidden in Ver); narrower, the Setlist
    // is the Biblioteca's first tab and Camadas a drawer opened from the
    // Programa; narrow, Biblioteca and Slides share one column.
    const cols = cultoColumns({ tier, hidden: layout.hidden, order: layout.order.culto, stacks: layout.stacks });
    const sideCards = cols.find((col) => col.id === "side")?.cards || [];
    const setlistRight = sideCards.includes("roteiro");
    const camadasRight = sideCards.includes("camadas");
    const sideSplit = stackSplit(sideCards, "camadas", layout.collapsed);
    // Camadas on screen: no drawer left open behind it (Esc would close that first).
    useEffect(() => { if (camadasRight) setDrawer(false); }, [camadasRight]);
    useEffect(() => { if (!compact && libTab === "roteiro") setLibTab("letras"); }, [compact, libTab]);
    // Editing: each column's bar moves it (◀ ▶ or a drag); stacked cards
    // move up and down from their header.
    const moveCol = (id, to) => setLayout({ ...layout, order: { ...layout.order, culto: moveColumn(layout.order.culto, cols, id, to) } });
    const colDrag = usePointerReorder({ axis: "x", ids: cols.map((col) => col.id), find: (id) => mainRef.current?.querySelector(`:scope > [data-col="${id}"]`), onDrop: moveCol });
    const moveCard = (stack, id, to) => setLayout({ ...layout, stacks: { ...layout.stacks, [stack]: moveTo(layout.stacks[stack], id, to) } });
    const stackCards = { side: sideCards, source: cols.find((col) => col.id === "source")?.cards || [] };
    const sideDrag = usePointerReorder({ axis: "y", ids: stackCards.side, find: (id) => mainRef.current?.querySelector(`[data-col="side"] > .arr-card-${id}`), onDrop: (id, at) => moveCard("side", id, at) });
    const sourceDrag = usePointerReorder({ axis: "y", ids: stackCards.source, find: (id) => mainRef.current?.querySelector(`[data-col="source"] > .arr-card-${id}`), onDrop: (id, at) => moveCard("source", id, at) });
    const stackDrag = { side: sideDrag, source: sourceDrag };
    // The grip and ▲ ▼ of a card stacked with others, while editing.
    const leadOf = (stack, id) => {
        const list = stackCards[stack] || [];
        if (!editing || !list.includes(id) || list.length < 2) return null;
        const i = list.indexOf(id);
        return <StackLead name={CARD_NAMES[id]} index={i} count={list.length} onMove={(d) => moveCard(stack, id, i + d)} handle={stackDrag[stack].handleProps(id)} />;
    };
    const stackOf = (id) => (stackCards.side.includes(id) ? "side" : stackCards.source.includes(id) ? "source" : null);
    const setlistPanel = (
        <Panel title="Setlist" lead={leadOf("side", "roteiro")} count={service ? `${service.title}${setPlan.count ? ` · ${setPlan.count} itens · ${total(setPlan.seconds)}` : ""}` : "nenhum culto"} collapsed={layout.collapsed.roteiro} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, roteiro: !layout.collapsed.roteiro } })}
            actions={<><IconBtn name="list" title="Planejar o culto" small onClick={() => openPlanner(serviceId)} /><IconBtn name="plus" title="Adicionar à setlist" small onClick={() => setOpen("palette")} /></>}>
            <Rundown service={service} items={items} airItemId={airItemId} prevItemId={prevItemId} onPrepare={prepareItem} onGo={goItem} onAddStage={addStageToSetlist} onPlan={(it) => openPlanner(serviceId, it?.id || null)} />
        </Panel>
    );
    const camadasPanel = (
        <Panel title="Camadas" lead={leadOf("side", "camadas")} count="o que está no ar" collapsed={layout.collapsed.camadas} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, camadas: !layout.collapsed.camadas } })}
            style={sideSplit ? { flex: `0 0 ${layout.camadasH}px` } : undefined}>
            <Layers c={c} themes={data.themes} media={data.media} />
        </Panel>
    );
    const libraryPanel = (
        <Panel title="Biblioteca" lead={leadOf(stackOf("lib"), "lib")} collapsed={layout.collapsed.lib} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, lib: !layout.collapsed.lib } })} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Library c={c} data={data} rundown={rundownProps} tab={libTab} setTab={setLibTab} compact={compact} onPrepare={(s) => c.setPrev(s)} onGo={(s) => { c.setPrev(s); sendStage(s); }} onAddSong={addSong} onLyricsWeb={() => setOpen("lyrics")} onEditSong={openSong} onOpenMedia={openMedia} onEditNotice={openNotice} />
        </Panel>
    );
    const slidesPanel = (
        <Panel title="Slides" lead={leadOf(stackOf("slides"), "slides")} count={handTitle(c) || "—"} collapsed={layout.collapsed.slides} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, slides: !layout.collapsed.slides } })} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SlidesPanel c={c} onGo={(s) => sendStage(s)} />
        </Panel>
    );
    const cardPanel = { lib: libraryPanel, slides: slidesPanel, camadas: camadasPanel, roteiro: setlistPanel };
    const splitFor = (key, sign = 1, horizontal = false, id = key) => (
        <Split key={`split-${id}`} horizontal={horizontal} size={layout[key]} sign={sign} onSize={(v) => setLayout({ ...layout, [key]: v })} onReset={() => setLayout({ ...layout, [key]: DEFAULT_LAYOUT[key] })} clamp={(v) => clampSize(key, v)} />
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

    // The Programa column: its caption, Camadas (when it is a drawer), Voltar
    // ao anterior, Multiview, and the live column (CenterPanel).
    const livePanel = (
        <Panel className="prog-panel" caption={<ProgramaCaption c={c} projectorDown={projectorDown} />} actions={
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 2 }}>
                {health.onAir && <span className={`kx-meta prog-where ${health.onAir.warn ? "kx-warn" : ""}`} title="Quantas telas mostram o Programa agora · detalhes em Saídas">{health.onAir.text}</span>}
                {!camadasRight && <button type="button" className={`kx-btn kx-t ${drawer ? "is-on" : ""}`} style={{ height: 24 }} onClick={() => setDrawer((d) => !d)} aria-expanded={drawer} title="Camadas: tema, fundo, logo e sobreposições do que está no ar"><Icon name="layers" />Camadas</button>}
                <button type="button" className={`kx-btn kx-t ${open === "hist" ? "is-on" : ""}`} style={{ height: 24 }} onClick={() => setOpen(open === "hist" ? null : "hist")} title="O que esteve no ar há pouco" aria-label="Voltar ao anterior"><Icon name="undo" /><span className="hist-lbl">Voltar ao anterior</span></button>
                <button type="button" className={`kx-btn kx-t mx-toggle ${layout.multiview ? "is-on" : ""}`} style={{ height: 24 }} onClick={toggleMultiview} aria-pressed={layout.multiview} title={layout.multiview ? "Voltar a ver só o Programa" : "Multiview: quatro saídas ao mesmo tempo, com o que está no ar"} aria-label="Multiview"><Icon name="grid" /><span className="hist-lbl">Multiview</span></button>
            </div>
        } bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <CenterPanel c={c} logoUrl={logoUrl} projectorDown={projectorDown} projectorOpen={Boolean(projector?.open)} playerPick={playerPick} setPlayerPick={setPlayerPick} onAir={health.onAir}
                nextItem={nextItem} onPrepNext={() => nextItem && prepareItem(nextItem, items.indexOf(nextItem))}
                later={setlistRight ? [] : laterItems} items={playable} multiview={multiview} onPrepareItem={prepareItem} onGoItem={goItem}
                onSend={() => sendStage()} onDropStage={(s, where) => { c.setPrev(s); if (where === "air") sendStage(s); }}
                onProgMenu={(e) => openMenu(e, { title: "Programa", items: [
                    { label: c.cur?.screen === "black" ? "Tirar a tela preta" : "Tela preta", icon: "black", kbd: "B", onSelect: () => c.toggleScreen("black") },
                    { label: c.cur?.screen === "logo" ? "Tirar o logo" : "Mostrar logo", icon: "logo", kbd: "L", onSelect: () => c.toggleScreen("logo") },
                    { label: "Limpar texto", icon: "eraser", kbd: "C", onSelect: c.clearText },
                    { label: "Voltar ao anterior…", icon: "undo", onSelect: () => setOpen("hist") },
                    { label: layout.multiview ? "Ver só o Programa" : "Multiview: quatro saídas", icon: "grid", onSelect: toggleMultiview },
                    { label: "Encerrar…", icon: "stop", air: true, onSelect: () => setOpen("encerrar") },
                ] })}
                onPrevMenu={(e) => openMenu(e, { title: "Prévia", items: [
                    { label: "Limpar a prévia", icon: "x", disabled: !c.prev, onSelect: () => c.setPrev(null) },
                    { label: "Enviar ao ar", icon: "play", kbd: "Enter", air: true, disabled: !c.prev || c.locked, onSelect: () => sendStage() },
                ] })} videoScreens={network.filter((d) => d.online && d.role === "media").map((d) => d.name).join(", ") || null} />
        </Panel>
    );

    // One column on screen. While editing, a bar on top moves it.
    const renderCol = (col) => {
        const i = cols.indexOf(col);
        const bar = editing ? <ColumnBar name={col.name} index={i} count={cols.length} onMove={(d) => moveCol(col.id, i + d)} handle={colDrag.handleProps(col.id)} moving={colDrag.drag?.id === col.id} /> : null;
        const moving = colDrag.drag?.id === col.id ? "is-moving" : "";
        if (col.id === "live") return <div key="live" data-col="live" className={`col center ${moving}`} ref={centerRef}>{bar}{livePanel}</div>;
        // A stack (Camadas and the Setlist; narrow: Biblioteca and Slides): the
        // cards in their order, Camadas' height splitter between them.
        if (col.id === "side" || col.id === "source") {
            const style = { ...sideCol(col.widthKey, layout[col.widthKey]), gap: col.id === "side" && sideSplit ? 0 : "var(--gutter)" };
            const cards = col.cards.map((id) => React.cloneElement(cardPanel[id], { key: id, className: `arr-card arr-card-${id}` }));
            if (col.id === "side" && sideSplit) cards.splice(1, 0, splitFor("camadasH", sideSplit.sign, true));
            return <div key={col.id} data-col={col.id} className={`col ${col.id === "source" ? "source" : ""} ${moving}`} style={style}>{bar}{cards}</div>;
        }
        return <div key={col.id} data-col={col.id} className={`col ${moving}`} style={sideCol(col.widthKey, layout[col.widthKey])}>{bar}{cardPanel[col.id]}</div>;
    };

    // The service clock in the top bar, late as the Linha do tempo counts it.
    const playAirIdx = playable.findIndex((i) => i.id === airItemId);
    const late = service ? serviceTiming({ items: playable, times: plannedTimes(service, playable), airIdx: playAirIdx, startedAt: playAirIdx >= 0 ? log[airItemId]?.start : null, now: c.now }).late : 0;
    const showForecast = useShowForecast();
    const svc = serviceClock({ service, seconds: setPlan.seconds, late, now: c.now, forecast: showForecast });

    // The palette opens centred (owner decision 2026-10-11); the dimmed scrim
    // keeps the console readable behind it.

    const hhmm = (t) => (t ? new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

    return (
        <ContextMenuProvider value={openMenu}>
        <div className={`kx console is-${tier} is-${densityOf(layout)} ${c.locked ? "is-locked" : ""} ${editing ? "is-editing" : ""}`} onClick={onMouseClick}>
            <div className="winbar" aria-hidden="true">KERYX</div>
            <TopBar c={c} env={env} setEnv={setEnv} open={open} setOpen={setOpen} outsLabel={health.status.label} outsCount={health.status.short} outsState={health.status.state} logoUrl={logoUrl} unread={upd.unread} svc={svc} onPlanner={() => openPlanner(serviceId)} />

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
            {editing && <EditBanner onRestore={() => { setLayout(restoreArrangement(layout)); c.say("Posições e larguras padrão restauradas."); }} onDone={() => setEditing(false)} />}
            {c.locked && (
                <div className="kx-banner is-rh" role="status"><span className="kx-alert-title">TELAS TRAVADAS — nada novo vai às telas</span><span className="kx-sub">Prepare à vontade; Tela preta, Logo, Limpar e Esc continuam valendo.</span><span className="kx-spacer" /><button type="button" className="kx-btn kx-btn-rh kx-t" onClick={() => c.setLocked(false)}>Destravar</button></div>
            )}
            <div className="main" ref={mainRef}>
                {planner && <ServicePlanner c={c} services={services} serviceId={serviceId} setServiceId={setServiceId} data={data} focusId={plannerFocus} onClose={closeView} />}
                {editSong && <SongEditor key={editSong} c={c} songId={editSong} themes={data.themes} onClose={closeView} onSaved={(row) => { if (editSong === "new" && row?.id) setView({ song: row.id }); }} />}
                {school && <SchoolView c={c} logoUrl={logoUrl} media={data.media} onSend={(s) => sendStage(s)} onAddToSetlist={addMaterial} onClose={closeView} />}
                {reports && <ReportsView c={c} onClose={closeView} />}
                {mediaView && <MediaView c={c} media={data.media} onSend={(s) => { c.setPrev(s); sendStage(s); }} onClose={closeView} />}
                {notice && <NoticeEditor key={notice} c={c} noticeId={notice} logoUrl={logoUrl} media={data.media} onClose={closeView} onSaved={(row) => { if (notice === "new" && row?.id) setView({ notice: row.id }); }} />}
                {!view && env === "biblia" && <BibleEnv c={c} logoUrl={logoUrl} request={bibleRequest} stageRef={bibleStageRef} apiRef={bibleApiRef} serviceId={serviceId} itemsCount={items.length} ensureService={ensureService} onSend={(s) => sendStage(s)} layout={layout} setLayout={setLayout} editing={editing} />}
                {!view && env === "culto" && withSplits(cols).map((it) => (it.type === "split" ? splitFor(it.key, it.sign, false, it.col) : renderCol(it.col)))}
            </div>
            {editing && <DropLine drag={colDrag.drag} axis="x" />}
            {editing && <DropLine drag={sideDrag.drag} axis="y" />}
            {editing && <DropLine drag={sourceDrag.drag} axis="y" />}
            {!view && env === "culto" && !layout.hidden.tl && (
                <div className={`kx-panel tl-panel ${layout.tlOpen ? "is-open" : ""}`}>
                    <Timeline service={service} items={playable} airItemId={airItemId} prevItemId={prevItemId} log={log} now={c.now} forecast={showForecast} open={layout.tlOpen} onToggle={() => setLayout({ ...layout, tlOpen: !layout.tlOpen })} onPrepare={prepareItem} />
                </div>
            )}

            {/* Configurações: a window over the console or the view behind it. */}
            {cfg && <div className="scrim is-dim cfg-scrim" onClick={closeSettings} />}
            {cfg && <SettingsView c={c} section={cfg} tab={cfgAt.tab} setSection={setCfg} onClose={closeSettings} layout={layout} setLayout={setLayout} restoreLayout={restoreLayout} />}
            {open && <div className={`scrim ${cfg ? "over-cfg" : ""} ${open === "palette" || open === "atalhos" || open === "encerrar" || open === "verificar" || open === "lyrics" || open === "update" || open === "novidades" ? "is-dim" : ""}`} onClick={() => setOpen(null)} />}
            {open === "lyrics" && <LyricsSearch c={c} onClose={() => setOpen(null)} onImported={(song) => { c.setPrev(stageFromSong(song, {}, data.themes)); openSong(song.id); }} />}
            {open === "verificar" && (
                <div className="verif-overlay">
                    <VerifyView c={c} items={playable} data={data} outputs={outputs} network={network}
                        onIdentify={() => window.keryxDesktop?.displays.identify().catch(() => {})}
                        onOpenOutput={openOutput} onClose={() => setOpen(null)} onSettings={openSettings} onOpenMedia={openMedia} />
                </div>
            )}
            <Menu open={open} setOpen={setOpen} services={services} serviceId={serviceId} setServiceId={setServiceId} layout={layout} setLayout={setLayout} restoreLayout={restoreLayout} editing={editing} onEditLayout={() => { setEditing((v) => !v); setOpen(null); }} onSettings={openSettings} onPlanner={openPlanner} onMedia={openMedia} onNotices={openNotices} onNewNotice={() => openNotice("new")} onSchool={openSchool} onReports={openReports} update={upd.update} onUpdateNow={updateNow} onWhatsNew={openWhatsNew} />
            <WhatsNew open={open} setOpen={setOpen} range={whatsNew} onSeen={whatsNewSeen} />
            <UpdateDialog open={open} setOpen={setOpen} update={upd.update} live={c.live} call={upd.call} />
            <Notifications open={open} setOpen={setOpen} notes={upd.notes} update={upd.update} onAction={noteAction} onDismiss={(id) => upd.call("notificationDismiss", { id }).catch(() => {})} onClear={() => upd.call("notificationsClear").catch(() => {})} />
            <Shortcuts open={open} setOpen={setOpen} />
            <Outputs open={open} setOpen={setOpen} health={health} locked={c.locked} onLock={c.setLocked} onOpen={openOutput} onClose={closeOutput} onForget={forgetOutput} tries={tries} idle={c.live?.idle || "logo"} idleUrl={c.live?.idleUrl || null} media={data.media} onIdle={(m, url) => c.liveOp("idle.set", url ? { mode: m, url } : { mode: m }).catch((err) => c.say(err?.message || "Não foi possível mudar a tela ociosa."))} onSettings={openSettings} />
            <History open={open} setOpen={setOpen} history={c.live?.history || []} onPick={(s) => c.setPrev(s)} left={histLeft} />
            <EndDialog open={open} setOpen={setOpen} onEnd={c.end} />
            <Palette open={open} setOpen={setOpen} data={data} items={playable} env={env} onPrepare={(s, i) => (s?.op ? c.setPrev(s) : prepareItem(s, i))} onAddSong={addSong} openReference={openReference} onPrepareReference={prepareReference} onAddReference={addReference} onBibleSearch={searchBibleFor} />
            {drawer && !camadasRight && !view && env === "culto" && (() => {
                // Over the source columns, never over the Programa: on the side
                // of the live column with more room (it can be anywhere since
                // Editar layout), up to its edge.
                const r = centerRef.current?.getBoundingClientRect();
                const roomL = r ? r.left - 12 : 360;
                const roomR = r ? window.innerWidth - r.right - 12 : 0;
                const right = roomR > roomL;
                return (
                <div className={`drawer ${right ? "is-right" : ""}`} style={{ width: Math.max(240, Math.min(360, right ? roomR : roomL)) }}>
                    <Panel title="Camadas" actions={<IconBtn name="x" title="Fechar · Esc" small onClick={() => setDrawer(false)} />}>
                        <Layers c={c} themes={data.themes} media={data.media} />
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
        </ContextMenuProvider>
    );
}
