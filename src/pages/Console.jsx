import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "@ds/tokens.css";
import "@ds/components/bundle.css";
import "@/components/console/console.css";
import { keryx } from "@/api/keryxClient";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { useConsole } from "@/components/console/useConsole";
import { useLibrary, useRundown, useOutputs, pickDefaultService } from "@/components/console/useConsoleData";
import { Panel, Split, IconBtn } from "@/components/console/kx";
import Icon from "@/components/console/Icon";
import TopBar from "@/components/console/TopBar";
import Library from "@/components/console/Library";
import SlidesPanel, { handTitle } from "@/components/console/SlidesPanel";
import CenterPanel, { captionOf } from "@/components/console/CenterPanel";
import { outputHealth, localId } from "@/lib/console/outputs";
import Rundown from "@/components/console/Rundown";
import Layers from "@/components/console/Layers";
import Timeline from "@/components/console/Timeline";
import BibleEnv from "@/components/console/BibleEnv";
import BibleQuickJump from "@/components/console/BibleQuickJump";
import VerifyView from "@/components/console/VerifyView";
import LyricsSearch from "@/components/console/LyricsSearch";
import SongEditor from "@/components/console/SongEditor";
import ServicePlanner from "@/components/console/ServicePlanner";
import MediaView from "@/components/console/MediaView";
import NoticeEditor from "@/components/console/NoticeEditor";
import SchoolView from "@/components/console/SchoolView";
import ReportsView from "@/components/console/ReportsView";
import SettingsView, { sectionIds } from "@/components/console/settings/SettingsView";
import { Menu, Shortcuts, Outputs, History, ArmDialog, EndDialog, Palette } from "@/components/console/Popovers";
import { loadLayout, saveLayout, clampSize, DEFAULT_LAYOUT, sideCol, tierFor } from "@/lib/console/layout";
import { liveAction, quickJumpKey } from "@/lib/console/keys";
import { playerLayer, playerOp } from "@/lib/console/player";
import { stageFromSong, stageFromPassage, stageFromMedia, stageFromPiece, stageFromMaterial, stageFromText, stageFromTool, stageAt, stageAirSlide, liveStageId } from "@/lib/console/stage";
import { plan, playableItems, isSection, total } from "@/lib/console/setlist";

const LOG_KEY = (serviceId) => `keryx.console.log.${serviceId}`;
const loadLog = (serviceId) => { try { return JSON.parse(localStorage.getItem(LOG_KEY(serviceId)) || "{}"); } catch { return {}; } };

// The operator console, driving the live state (shared/live-state.mjs)
// through useConsole: one console, always ready, as in Holyrics. Two
// environments (KERYX: projection, Bíblia) and two modes (Ao vivo, Ensaio).
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
    // { cfg: section } Configurações, { song: id | "new" } the song editor,
    // { planner: true } the service planner, { media: true } the media
    // library, { notice: id | "new" } the aviso editor, { school: true } the
    // Escola bíblica, { reports: true } Relatórios. The old pages land here on
    // desktop: /Settings ?config=telas, /Home ?song=new, /Services
    // ?planner=<id>, /Media ?media=1, /Communication ?lib=avisos,
    // /BibleSchool ?school=1, /Analytics and /SongHistoryPage ?reports=1.
    const [view, setView] = useState(() => {
        try {
            const p = new URLSearchParams(window.location.search);
            if (p.get("config")) return { cfg: sectionIds.includes(p.get("config")) ? p.get("config") : "telas" };
            if (p.get("song")) return { song: p.get("song") };
            if (p.get("planner")) return { planner: true };
            if (p.get("media")) return { media: true };
            if (p.get("notice")) return { notice: p.get("notice") };
            if (p.get("school")) return { school: true };
            if (p.get("reports")) return { reports: true };
        } catch { /* no query */ }
        return null;
    });
    const cfg = view?.cfg || null;
    const editSong = view?.song || null;
    const planner = Boolean(view?.planner);
    const mediaView = Boolean(view?.media);
    const notice = view?.notice || null;
    const school = Boolean(view?.school);
    const reports = Boolean(view?.reports);
    const closeView = useCallback(() => setView(null), []);
    const setCfg = useCallback((section) => setView(section ? { cfg: section } : null), []);
    const setEnv = useCallback((v) => { setView(null); setEnvState(typeof v === "function" ? v(env) : v); }, [env]);
    const openSettings = useCallback((section = "telas") => { setOpen(null); setView({ cfg: section }); }, []);
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
    const [layout, setLayoutState] = useState(() => loadLayout(""));
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
    const setLayout = useCallback((next) => { setLayoutState(next); saveLayout(profile, next); }, [profile]);
    const restoreLayout = () => { setLayout({ ...DEFAULT_LAYOUT }); c.say("Layout padrão restaurado."); };

    const { services, items } = useRundown(serviceId);
    useEffect(() => { if (!serviceId && services.length) setServiceId(pickDefaultService(services)?.id || null); }, [services, serviceId]);
    useEffect(() => { if (serviceId) setLog(loadLog(serviceId)); }, [serviceId]);
    const service = services.find((s) => s.id === serviceId) || null;
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
        if (type === "SONG") return stageFromSong(await keryx.entities.Song.get(item.contentId), ref);
        if (type === "BIBLE") return stageFromPassage(await keryx.entities.BiblePassage.get(item.contentId), ref);
        if (["VIDEO", "IMAGE", "PDF", "POWERPOINT", "AUDIO"].includes(type)) { const s = stageFromMedia(await keryx.entities.Media.get(item.contentId)); return { ...s, args: { ...s.args, ref } }; }
        if (type === "TIMER") { const s = stageFromTool("timer", { minutes: Math.max(1, Math.round((item.duration || 300) / 60)) }); return { ...s, args: { ...s.args, ref } }; }
        const s = stageFromText(item.title || "Texto", item.notes || item.title || "");
        return { ...s, args: { ...s.args, ref } };
    }, [serviceId]);

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
        if (c.isLive && projector && displays && !keryx.isPreview) {
            displays.list().then((r) => {
                const p = r?.data?.outputs?.find((o) => o.key === "/Projection") || projector;
                if (!p.open) return displays.open("/Projection");
                return null;
            }).catch(() => {});
        }
        const went = await c.send(stage);
        if (!went || !c.isLive) return;
        // A song on air counts for Histórico, Estatísticas and the CCLI report.
        const sent = stage || c.prev;
        if (sent?.kind === "lyrics" && String(sent.id || "").startsWith("song:") && !sent.airSlide) {
            const songId = sent.id.slice(5);
            const song = data.songs.find((x) => x.id === songId);
            keryx.entities.SongHistory.create({ song_id: songId, song_title: sent.title, song_artist: song?.artist || "", played_at: new Date().toISOString(), operator_name: "Operador", ...(service ? { service_id: service.id, service_title: service.title } : {}) }).catch(() => {});
            if (song) keryx.entities.Song.update(songId, { play_count: (song.play_count || 0) + 1, last_played_at: new Date().toISOString() }).catch(() => {});
        }
        const itemId = stage?.args?.ref?.serviceItemId ?? c.prev?.args?.ref?.serviceItemId;
        if (!itemId || !serviceId) return;
        const now = Date.now();
        setLog((prev) => {
            const next = { ...prev };
            for (const [id, entry] of Object.entries(next)) if (!entry.end && id !== itemId) next[id] = { ...entry, end: now };
            next[itemId] = { start: now, end: null };
            try { localStorage.setItem(LOG_KEY(serviceId), JSON.stringify(next)); } catch { /* not remembered */ }
            return next;
        });
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
        const row = await keryx.entities.Service.create({ title: `Setlist de ${two(d.getDate())}/${two(d.getMonth() + 1)}`, date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, status: "DRAFT" });
        setServiceId(row.id);
        c.say("Criada a setlist de hoje · renomeie em Planejar o culto.");
        return row.id;
    }, [serviceId, c]);

    // A library item dropped on the Setlist: a ServiceItem at that position.
    const addStageToSetlist = useCallback(async (stage, index) => {
        let type = null;
        let contentId = "";
        if (stage.kind === "lyrics" && stage.id?.startsWith("song:")) { type = "SONG"; contentId = stage.id.slice(5); }
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
            // Renumber from the end first, so two rows never share an order.
            for (let i = items.length - 1; i >= at; i--) await keryx.entities.ServiceItem.update(items[i].id, { order: i + 1 });
            await keryx.entities.ServiceItem.create({ serviceId: sid, type, title: stage.title, contentId, order: at, duration: stage.args?.duration || (type === "SONG" ? 240 : 120) });
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
            await keryx.entities.ServiceItem.create({ serviceId: sid, type: "SONG", title: song.title, contentId: song.id, order: items.length, duration: song.duration || 240 });
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
    const health = useMemo(() => outputHealth({ outputs, seen, isLive: c.isLive, air: airWords, tries }), [outputs, seen, c.isLive, airWords, tries]);
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
            const d = new Date();
            const two = (n) => String(n).padStart(2, "0");
            try {
                const row = await keryx.entities.Service.create({ title: `Culto de ${two(d.getDate())}/${two(d.getMonth() + 1)}`, date: `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`, startTime: "19:00", status: "DRAFT", service_type: "culto" });
                setServiceId(row.id);
                c.say("Novo culto criado.");
            } catch (err) { c.say(err?.message || "Não foi possível criar o culto."); return; }
        } else if (id && id !== true) setServiceId(id);
        setPlannerFocus(itemId);
        setView({ planner: true });
    }, [c]);

    const openReference = (ref) => { setBibleRequest({ ...ref, at: Date.now() }); setOpen(null); setEnv("biblia"); };
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
            if (env === "biblia" && !open && quick === null && !view) {
                const ch = quickJumpKey(e);
                if (ch) { e.preventDefault(); setQuick(ch); return; }
            }
            const action = liveAction(e);
            if (!action) return;
            if (action === "blur") { e.target.blur?.(); return; }
            if (open) {
                if (action === "end") { e.preventDefault(); setOpen(null); }
                return;
            }
            // In Configurações Esc goes back to the console; it never ends the projection there.
            if (cfg && action === "end") { e.preventDefault(); setView(null); return; }
            // The song editor handles its own keys (Esc, Space while marking);
            // only the emergency keys reach the screens from there.
            // So do the planner, the media library, the aviso editor and the
            // reports (each closes itself on Esc). The Escola bíblica is a
            // projecting view: every live key works there.
            if (view && !cfg && !school && !["black", "logo"].includes(action)) return;
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
                if (drawer) { setDrawer(false); return; }
                c.end();
                c.say(c.isLive ? "Projeção encerrada · Voltar ao anterior desfaz." : "Encerrado só aqui: as telas não mudam.");
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
    }, [c, open, drawer, sendStage, env, quick, playerPick, selectSlide, view, cfg, school]);

    // A mouse click must not leave focus on the control it hit: the live keys
    // would then belong to that control (the "keys don't work" bug). Keyboard
    // activation (detail 0) keeps focus, so Tab navigation still works.
    const onMouseClick = (e) => {
        if (e.detail === 0) return;
        const t = e.target.closest?.("button, [role='button'], [role='tab'], [role='radio'], [role='menuitem'], a[href]");
        if (t && !t.closest(".dialog, .palette, .qj, .lyr, .addmenu")) setTimeout(() => t.blur?.(), 0);
    };

    const rundownProps = { service, items, airItemId, prevItemId, prepare: prepareItem, go: goItem, addStage: addStageToSetlist };
    const histLeft = useMemo(() => (layout.hidden.lib ? 0 : layout.libW + 6) + (layout.hidden.slides ? 0 : layout.slidesW + 6) + 6, [layout]);
    // Wide: the Setlist is a column of its own; otherwise it is the Biblioteca's first tab.
    const showRight = tier === "wide" && !layout.hidden.roteiro;
    useEffect(() => { if (!compact && libTab === "roteiro") setLibTab("letras"); }, [compact, libTab]);
    const setlistPanel = (
        <Panel title="Setlist" count={service ? `${service.title}${setPlan.count ? ` · ${setPlan.count} itens · ${total(setPlan.seconds)}` : ""}` : "nenhum culto"} collapsed={layout.collapsed.roteiro} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, roteiro: !layout.collapsed.roteiro } })}
            actions={<><IconBtn name="list" title="Planejar o culto" small onClick={() => openPlanner(serviceId)} /><IconBtn name="plus" title="Adicionar à setlist" small onClick={() => setOpen("palette")} /></>}>
            <Rundown service={service} items={items} airItemId={airItemId} prevItemId={prevItemId} onPrepare={prepareItem} onGo={goItem} onAddStage={addStageToSetlist} onPlan={(it) => openPlanner(serviceId, it?.id || null)} />
        </Panel>
    );
    const libraryPanel = (
        <Panel title="Biblioteca" collapsed={layout.collapsed.lib} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, lib: !layout.collapsed.lib } })} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <Library c={c} data={data} rundown={rundownProps} tab={libTab} setTab={setLibTab} compact={compact} onPrepare={(s) => c.setPrev(s)} onGo={(s) => { c.setPrev(s); sendStage(s); }} onAddSong={addSong} onLyricsWeb={() => setOpen("lyrics")} onEditSong={openSong} onOpenMedia={openMedia} onEditNotice={openNotice} />
        </Panel>
    );
    const slidesPanel = (
        <Panel title="Slides" count={handTitle(c) || "—"} collapsed={layout.collapsed.slides} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, slides: !layout.collapsed.slides } })} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <SlidesPanel c={c} onGo={(s) => sendStage(s)} />
        </Panel>
    );

    const hhmm = (t) => (t ? new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");

    return (
        <div className={`kx console is-${tier} ${c.isLive ? "" : "is-ensaio"}`} onClick={onMouseClick}>
            <TopBar c={c} env={env} setEnv={setEnv} open={open} setOpen={setOpen} outsLabel={health.status.label} outsCount={health.status.short} outsState={health.status.state} logoUrl={logoUrl} />
            {/* A failing output: one line under the top bar, in every view, never over a monitor. One at a time (outputHealth picks it). */}
            {health.banner?.kind === "reconnecting" && (
                <div className="kx-banner is-warn" role="alert">
                    {health.banner.row.key === "/Projection" ? "Projetor" : health.banner.row.name} · Reconectando… tentativa {tries}
                    <span className="kx-sub">ATENÇÃO · {health.banner.row.key === "/Projection" ? `última conexão boa às ${hhmm(lastOkAt)} · ` : ""}o monitor escolhido não está ligado</span>
                    <span className="kx-spacer" />
                    <button type="button" className="kx-btn kx-t" onClick={() => c.toggleScreen("black")}>Tela preta</button>
                    <button type="button" className="kx-btn kx-t" onClick={() => c.toggleScreen("logo")}>Mostrar logo</button>
                    <button type="button" className="kx-btn kx-btn-outline kx-t" onClick={() => setOpen("outs")}>Ver saídas</button>
                </div>
            )}
            {health.banner && health.banner.kind !== "reconnecting" && (
                <div className="kx-banner is-warn" role="alert">
                    {health.banner.title}{health.banner.more ? ` · e mais ${health.banner.more}` : ""}
                    <span className="kx-sub">{health.banner.sub}</span>
                    <span className="kx-spacer" />
                    {health.banner.kind === "closed" && <button type="button" className="kx-btn kx-btn-outline kx-t" onClick={() => openOutput(health.banner.row.key)}>Reabrir</button>}
                    <button type="button" className={`kx-btn kx-t ${health.banner.kind === "closed" ? "" : "kx-btn-outline"}`} onClick={() => setOpen("outs")}>Ver saídas</button>
                    <button type="button" className="kx-btn kx-t" onClick={() => forgetOutput(health.banner.row.id)} title="Não avisar mais sobre esta saída nesta sessão">Esquecer</button>
                </div>
            )}
            {c.mode === "ensaio" && (
                <div className="kx-banner is-rh">MODO ENSAIO — nada será enviado às saídas<span className="kx-sub">As telas continuam com o que estava no ar.</span><span className="kx-spacer" /><button type="button" className="kx-btn kx-btn-rh kx-t" onClick={() => setOpen("arm")}>Armar saídas</button></div>
            )}
            <div className="main" ref={mainRef}>
                {cfg && <SettingsView c={c} section={cfg} setSection={setCfg} onClose={closeView} />}
                {planner && <ServicePlanner c={c} services={services} serviceId={serviceId} setServiceId={setServiceId} data={data} focusId={plannerFocus} onClose={closeView} />}
                {editSong && <SongEditor key={editSong} c={c} songId={editSong} themes={data.themes} onClose={closeView} onSaved={(row) => { if (editSong === "new" && row?.id) setView({ song: row.id }); }} />}
                {school && <SchoolView c={c} logoUrl={logoUrl} media={data.media} onSend={(s) => sendStage(s)} onAddToSetlist={addMaterial} onClose={closeView} />}
                {reports && <ReportsView c={c} onClose={closeView} />}
                {mediaView && <MediaView c={c} media={data.media} onSend={(s) => { c.setPrev(s); sendStage(s); }} onClose={closeView} />}
                {notice && <NoticeEditor key={notice} c={c} noticeId={notice} logoUrl={logoUrl} media={data.media} onClose={closeView} onSaved={(row) => { if (notice === "new" && row?.id) setView({ notice: row.id }); }} />}
                {!view && env === "biblia" && <BibleEnv c={c} logoUrl={logoUrl} request={bibleRequest} stageRef={bibleStageRef} apiRef={bibleApiRef} serviceId={serviceId} itemsCount={items.length} ensureService={ensureService} onSend={(s) => sendStage(s)} />}
                {!view && env === "culto" && (
                    <>
                        {/* Narrow: Biblioteca (Setlist first among its tabs) over Slides, one column. */}
                        {tier === "narrow" && !(layout.hidden.lib && layout.hidden.slides) && (
                            <>
                                <div className="col source" style={{ ...sideCol("libW", layout.libW), gap: "var(--gutter)" }}>
                                    {!layout.hidden.lib && libraryPanel}
                                    {!layout.hidden.slides && slidesPanel}
                                </div>
                                <Split size={layout.libW} onSize={(v) => setLayout({ ...layout, libW: v })} onReset={() => setLayout({ ...layout, libW: DEFAULT_LAYOUT.libW })} clamp={(v) => clampSize("libW", v)} />
                            </>
                        )}
                        {tier !== "narrow" && !layout.hidden.lib && (
                            <>
                                <div className="col" style={sideCol("libW", layout.libW)}>{libraryPanel}</div>
                                <Split size={layout.libW} onSize={(v) => setLayout({ ...layout, libW: v })} onReset={() => setLayout({ ...layout, libW: DEFAULT_LAYOUT.libW })} clamp={(v) => clampSize("libW", v)} />
                            </>
                        )}
                        {tier !== "narrow" && !layout.hidden.slides && (
                            <>
                                <div className="col" style={sideCol("slidesW", layout.slidesW)}>{slidesPanel}</div>
                                <Split size={layout.slidesW} onSize={(v) => setLayout({ ...layout, slidesW: v })} onReset={() => setLayout({ ...layout, slidesW: DEFAULT_LAYOUT.slidesW })} clamp={(v) => clampSize("slidesW", v)} />
                            </>
                        )}
                        <div className="col center" ref={centerRef}>
                            <Panel title={c.isLive ? "Programa" : "Programa · Ensaio"} actions={
                                <div style={{ position: "relative", display: "flex", gap: 2 }}>
                                    <button type="button" className={`kx-btn kx-t ${drawer ? "is-on" : ""}`} style={{ height: 22 }} onClick={() => setDrawer((d) => !d)} aria-expanded={drawer} title="Camadas: tema, fundo, logo e sobreposições do que está no ar"><Icon name="layers" />Camadas</button>
                                    <button type="button" className={`kx-btn kx-t ${open === "hist" ? "is-on" : ""}`} style={{ height: 22 }} onClick={() => setOpen(open === "hist" ? null : "hist")} title="O que esteve no ar há pouco"><Icon name="undo" />Voltar ao anterior</button>
                                </div>
                            } bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <CenterPanel c={c} logoUrl={logoUrl} projectorDown={projectorDown} projectorOpen={Boolean(projector?.open)} playerPick={playerPick} setPlayerPick={setPlayerPick} onAir={health.onAir}
                                    nextItem={nextItem} onPrepNext={() => nextItem && prepareItem(nextItem, items.indexOf(nextItem))}
                                    later={showRight ? [] : laterItems} onPrepareItem={prepareItem} onGoItem={goItem}
                                    onSend={() => sendStage()} onDropStage={(s, where) => { c.setPrev(s); if (where === "air") sendStage(s); }} videoScreens={network.filter((d) => d.online && d.role === "media").map((d) => d.name).join(", ") || null} />
                            </Panel>
                        </div>
                        {showRight && (
                            <>
                                <Split size={layout.rightW} sign={-1} onSize={(v) => setLayout({ ...layout, rightW: v })} onReset={() => setLayout({ ...layout, rightW: DEFAULT_LAYOUT.rightW })} clamp={(v) => clampSize("rightW", v)} />
                                <div className="col" style={sideCol("rightW", layout.rightW)}>{setlistPanel}</div>
                            </>
                        )}
                    </>
                )}
            </div>
            {!view && env === "culto" && !layout.hidden.tl && (
                <div className={`kx-panel tl-panel ${layout.tlOpen ? "is-open" : ""}`}>
                    <Timeline service={service} items={playable} airItemId={airItemId} prevItemId={prevItemId} log={log} now={c.now} open={layout.tlOpen} onToggle={() => setLayout({ ...layout, tlOpen: !layout.tlOpen })} onPrepare={prepareItem} />
                </div>
            )}

            {open && <div className={`scrim ${open === "palette" || open === "arm" || open === "atalhos" || open === "encerrar" || open === "verificar" || open === "lyrics" ? "is-dim" : ""}`} onClick={() => setOpen(null)} />}
            {open === "lyrics" && <LyricsSearch c={c} onClose={() => setOpen(null)} onImported={(song) => { c.setPrev(stageFromSong(song)); openSong(song.id); }} />}
            {open === "verificar" && (
                <div className="verif-overlay">
                    <VerifyView c={c} items={playable} data={data} outputs={outputs} network={network}
                        onIdentify={() => window.keryxDesktop?.displays.identify().catch(() => {})}
                        onOpenOutput={openOutput} onClose={() => setOpen(null)} onSettings={openSettings} onOpenMedia={openMedia} />
                </div>
            )}
            <Menu open={open} setOpen={setOpen} services={services} serviceId={serviceId} setServiceId={setServiceId} layout={layout} setLayout={setLayout} restoreLayout={restoreLayout} onSettings={openSettings} onPlanner={openPlanner} onMedia={openMedia} onNotices={openNotices} onNewNotice={() => openNotice("new")} onSchool={openSchool} onReports={openReports} />
            <Shortcuts open={open} setOpen={setOpen} />
            <Outputs open={open} setOpen={setOpen} health={health} isLive={c.isLive} onOpen={openOutput} onClose={closeOutput} onForget={forgetOutput} tries={tries} idle={c.live?.idle || "logo"} onIdle={(m) => c.liveOp("idle.set", { mode: m }).catch(() => {})} onSettings={openSettings} />
            <History open={open} setOpen={setOpen} history={c.live?.history || []} onPick={(s) => c.setPrev(s)} left={histLeft} />
            <ArmDialog open={open} setOpen={setOpen} live={c.live} onArm={c.arm} />
            <EndDialog open={open} setOpen={setOpen} mode={c.mode} onEnd={c.end} />
            <Palette open={open} setOpen={setOpen} data={data} items={playable} env={env} onPrepare={(s, i) => (s?.op ? c.setPrev(s) : prepareItem(s, i))} onAddSong={addSong} openReference={openReference} onBibleSearch={searchBibleFor} />
            {drawer && !view && env === "culto" && (
                // Over the source columns, never over the Programa: up to the live column's left edge.
                <div className="drawer" style={{ width: Math.max(240, Math.min(360, (centerRef.current?.getBoundingClientRect().left ?? 372) - 12)) }}>
                    <Panel title="Camadas" actions={<IconBtn name="x" title="Fechar · Esc" small onClick={() => setDrawer(false)} />}>
                        <Layers c={c} themes={data.themes} />
                    </Panel>
                </div>
            )}
            {quick !== null && env === "biblia" && (
                <BibleQuickJump initial={quick} onCancel={() => setQuick(null)}
                    onPick={(r) => { setQuick(null); setBibleRequest({ book: r.book.name, chapter: r.chapter, verseStart: r.verseStart, verseEnd: r.verseEnd ?? r.verseStart, at: Date.now() }); }} />
            )}
            {c.toast && <div className="toast">{c.toast}</div>}
        </div>
    );
}
