// A dock panel in a window of its own (owner 2026-11-09, mockup "Painéis em
// janela", D1–D5 = A): the Biblioteca, the Setlist, the Painel, Camadas,
// Temas or the Slides as the console draws it, under the window's bar (D3 = A: the WinBar with the
// module's name and ×, then the panel's own header with its +, eye and
// Selecionar vários). /Janela?page=panel&module=<id> (nav.js, detach.js).
//
// It works over the light `c` of /Janela: it reads the store and the live
// state itself, writes the list through the store (useSetlistWrites, the
// console's own), and what goes to the Prévia or on air goes to the console
// (janelaRelay.js), so the history, the log and the Autoplay stay there; the
// Autoplay's countdown comes back as console.autoplay. Its tabs and the
// Biblioteca's view are the console's layout (useSharedLayout). A page it
// opens (Editar música, the Mídia, Editar aviso, Planejar o culto) is a
// level of this window, "← Biblioteca". Esc clears a menu or a selection,
// and with nothing to clear it ends what is on air through the console, as
// the console's own Esc does, Desfazer in this window too (D4 = A); it never
// closes the window (the × does, and the panel goes back to the console,
// where it was: D5 = A).
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Panel, IconBtn, SelectManyBtn, WinBar } from "./kx";
import Library from "./Library";
import Rundown, { SetlistFooter } from "./Rundown";
import TabsPanel, { TabsPlus } from "./TabsPanel";
import { TabsMenu } from "./Popovers";
import LyricsSearch from "./LyricsSearch";
import ImportSongsDialog from "./ImportSongsDialog";
import { ImportSongsContext } from "./importSongs";
import { usePackages } from "./packages";
import { useContextMenu } from "./ContextMenu";
import { useConfirm } from "./ConfirmDialog";
import { useLibraryPicker } from "./library/libraryContext";
import { useActiveService } from "./useActiveService";
import { useRundown, useServiceMessages } from "./useConsoleData";
import { useSetlistWrites } from "./useSetlistWrites";
import { useBuildStage } from "./useBuildStage";
import { useSharedLayout } from "./useSharedLayout";
import { useSeenTabs } from "./usePedidos";
import { setlistHeadItems, setlistAddItems, setlistCountOf, SetlistTitle } from "./setlistMenus";
import { usePrefs } from "@/hooks/useUser";
import { relayListen, relaySend } from "@/lib/janelaRelay";
import { selections } from "@/lib/console/selectionStore";
import { panelTitle } from "@/lib/console/detach";
import { DEFAULT_TABS, shownTabs, activeTab, toggleTab } from "@/lib/console/panelTabs";
import { canGroup } from "@/lib/console/libraryFolders";
import { plan, neighbours, itemOnAir } from "@/lib/console/setlist";
import { endsByItself } from "@/lib/console/autoplay";
import { stageFromSong, stageFromMedia } from "@/lib/console/stage";
import { PACKAGE_FILE } from "@/lib/keryxPackage";
import Layers from "./Layers";
import ThemeStrip from "./ThemeStrip";
import SlidesPanel, { handTitle } from "./SlidesPanel";
import { camadasAddItems } from "./camadasMenu";
import { defaultTheme, themeName } from "@/lib/console/themes";

const SONG_LINE_KEYS = { artist: "libShowArtist", key: "libShowKey", length: "libShowLength" };

export default function PanelPage({ module, h, escRef, active, onClose }) {
    const { c, data, askText } = h;
    const say = c.say;
    const title = panelTitle(module);
    const [layout, patch] = useSharedLayout(say);
    const prefs = usePrefs();
    const openMenu = useContextMenu();
    const confirm = useConfirm();
    const pickFromLibrary = useLibraryPicker();

    // The list every console shows: the church's active culto, else the shared Setlist.
    const activeSvc = useActiveService(say, confirm);
    const { services, view, items, loaded } = useRundown(activeSvc.activeId);
    const service = view.service;
    const serviceId = service?.id || null;
    const writes = useSetlistWrites({ say, serviceId, service, services, items, pickFromLibrary });
    const buildStage = useBuildStage({ serviceId, themes: data.themes, fitFor: c.fitFor });
    const messages = useServiceMessages(module === "abas" ? serviceId : null);

    const airItemId = c.cur?.session?.itemId || null;
    const airNow = itemOnAir(c.cur, items);
    const prevItemId = c.prev?.args?.ref?.serviceItemId || null;

    // What only the console has: Enviar ao ar (its Prévia, its log), the
    // Autoplay. A toast here when it does not answer.
    const toConsole = useCallback((type, payload = {}) => {
        if (relaySend("janela", type, payload)) return true;
        say("O console não recebeu: ele está aberto?");
        return false;
    }, [say]);

    // The console's answers: the Autoplay's countdown, Ver › Painel from a
    // pedido's toast, and the panel going back to the console (its window closes).
    const [pending, setPending] = useState(null);
    const [panelTab, setPanelTab] = useState("notas");
    // The modules the console has placed (null until it says): Camadas shows
    // the themes when Temas is in the tray, the Slides their No ar · Prévia
    // tabs when No ar is.
    const [placed, setPlaced] = useState(null);
    useEffect(() => relayListen("janela", (m) => {
        if (m.type === "console.autoplay") setPending(m.pending);
        else if (m.type === "console.panels") setPlaced(m.placed);
        // Esc from here ended the air (air.end): Desfazer here too.
        else if (m.type === "console.ended") say("Projeção encerrada.", m.undo ? { label: "Desfazer", undo: true, run: () => relaySend("janela", "air.undo") } : null);
        else if (m.type === "panel.focus" && m.module === module) { if (m.tab) setPanelTab(m.tab); try { window.focus(); } catch { /* the system decides */ } }
        else if (m.type === "panel.close" && m.module === module) onClose(true);
    }), [module, onClose, say]);
    // In the browser preview there is no main process to say the window
    // closed: the page says it as it goes (the desktop's main says it itself).
    useEffect(() => {
        if (window.keryxDesktop?.janela) return undefined;
        const bye = () => relaySend("janela", "panel.closed", { module });
        window.addEventListener("pagehide", bye);
        return () => window.removeEventListener("pagehide", bye);
    }, [module]);

    // The tab chooser (the eye), the lyrics search and the song import, as the console has them.
    const [menu, setMenu] = useState(null);
    const [lyrics, setLyrics] = useState(null);
    const [importReq, setImportReq] = useState(null);
    const { openPackage } = usePackages();
    const openImport = useCallback((files) => {
        const list = [...files];
        const box = list.find((f) => PACKAGE_FILE.test(f.name));
        if (box) openPackage(box); else setImportReq({ files: list, busy: false });
    }, [openPackage]);
    const [picking, setPicking] = useState(false);
    const [addSlot, setAddSlot] = useState(null);

    // Its × (and Voltar on the first level): the panel goes back to the
    // console, where it was. The page says so (on the desktop main says it
    // too, as the window closes: the console takes it once).
    const leave = useCallback(() => { relaySend("janela", "panel.closed", { module }); onClose(true); }, [module, onClose]);
    // Esc: a menu or the lyrics search, then a selection; never the window.
    useEffect(() => {
        if (!escRef) return undefined;
        escRef.current = (mode) => {
            if (mode === "all" || mode === "back") { leave(); return; }
            if (lyrics) { setLyrics(null); return; }
            if (menu) { setMenu(null); return; }
            if (selections.clearTop()) return;
            toConsole("air.end");
        };
        return () => { escRef.current = null; };
    }, [escRef, leave, lyrics, menu, toConsole]);

    const tabLists = layout.tabs || DEFAULT_TABS;
    const setTabList = (row, list) => patch({ tabs: { ...tabLists, [row]: list } });
    const toggleTabIn = (row, id) => {
        const next = toggleTab(row, tabLists[row], id);
        if (next.length === tabLists[row].length && next.every((x, i) => x === tabLists[row][i])) { say("Pelo menos uma aba fica à vista."); return; }
        setTabList(row, next);
    };
    const songLine = { artist: layout.libShowArtist, key: layout.libShowKey, length: layout.libShowLength };
    const setLibGroup = (tab, on) => { const { [tab]: _was, ...rest } = layout.libGroup || {}; patch({ libGroup: on ? { ...rest, [tab]: true } : rest }); };
    const [libTab, setLibTab] = useState("letras");
    const libTabNow = activeTab("lib", tabLists.lib, libTab);
    const panelTabNow = activeTab("panel", tabLists.panel, panelTab);

    // The pages it opens: a level of this window.
    const from = title;
    const openSong = (id, more = {}) => h.push({ page: "song", props: { id, ...more } }, from);
    const openMedia = (intent = null) => h.push({ page: "media", props: intent ? { intent } : {} }, from);
    const openNotice = (id, addTo = null) => h.push({ page: "notice", props: { id: id || "new", ...(addTo ? { addTo } : {}) } }, from);
    const openPlanner = (id) => h.push({ page: "planner", props: id ? { serviceId: id } : {} }, from);

    const coveredBy = c.cur?.screen === "black" ? "Tela preta" : c.cur?.screen === "logo" ? "Logo" : "";
    const coverTag = coveredBy ? <span className="kx-covered" title={`As telas mostram ${coveredBy === "Logo" ? "o logo" : "a tela preta"}: o que está no ar fica coberto`}>coberto · {coveredBy}</span> : null;

    // The Painel's dots: a row read here clears it in the console too (useSeenTabs).
    const unread = useSeenTabs({ messages, open: module === "abas" ? { pedidos: active && panelTabNow === "pedidos", chat: active && panelTabNow === "chat" } : {} });

    // Temas (in its own panel, or riding at the end of Camadas while its
    // module is in the tray, as in the console).
    const themeMenuRef = useRef(null);
    const addOverlayRef = useRef(null);
    const inUse = data.themes.find((t) => t.id === c.themeId) || defaultTheme(data.themes);
    const inUseName = inUse ? themeName(inUse, "") : "";
    const temasBtns = <><IconBtn name="palette" title="Biblioteca de temas… · o clique direito fixa um tema no console" small onClick={() => themeMenuRef.current?.library()} /><IconBtn name="plus" title="Temas: novo, configurações, visualização" small onClick={(e) => themeMenuRef.current?.menu(e)} /></>;
    const themeStrip = (module === "temas" || module === "camadas") && <ThemeStrip c={c} themes={data.themes} songs={data.songs} service={service} ensureService={writes.ensureService} menuRef={themeMenuRef} view={{ thumb: layout.temasThumb, names: layout.temasNames }} setView={(v) => patch(v)} onSettings={h.openSettings} />;

    let body = null;
    if (module === "camadas") {
        const temasPlaced = !placed || placed.includes("temas");
        body = (
            <Panel title="Camadas" actions={<IconBtn name="plus" title="Adicionar: sobreposição de texto, logo no canto" small onClick={(e) => openMenu(e, { title: "Adicionar camada", items: camadasAddItems(c, () => addOverlayRef.current?.()) })} />}>
                <Layers c={c} themes={data.themes} onSettings={h.openSettings} onFundo={writes.pickServiceFundo} addRef={addOverlayRef} />
                {!temasPlaced && <div className="layer-temas"><div className="listhead"><span className="kx-section" title={inUseName ? `Em uso: ${inUseName}` : undefined}>Temas</span>{temasBtns}</div>{themeStrip}</div>}
            </Panel>
        );
    } else if (module === "temas") {
        body = <Panel title="Temas" tip={inUseName ? `Em uso: ${inUseName}` : ""} className="temas-panel" actions={temasBtns}>{themeStrip}</Panel>;
    } else if (module === "slides") {
        body = (
            <Panel title="Slides" noHead={!coverTag} className={coveredBy ? "is-covered" : ""} actions={coverTag} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <SlidesPanel c={c} onGo={(st) => h.sendNow(st)} airTabs={Boolean(placed) && !placed.includes("onair")} onSongSaved={h.songSaved} onOpenSong={openSong} />
            </Panel>
        );
    } else if (module === "setlist") {
        const prepareItem = async (item, index) => { try { c.setPrev(await buildStage(item, index)); } catch (err) { say(err?.message || "Não foi possível abrir o item."); } };
        const goItem = async (item, index) => { try { h.sendNow(await buildStage(item, index)); } catch (err) { say(err?.message || "Não foi possível abrir o item."); } };
        // Item anterior / Próximo item: on air as the console's footer does, its Prévia untouched.
        const stepSetlist = async (item) => { try { toConsole("stage.send", { stage: await buildStage(item, items.indexOf(item)), keepPrev: true }); } catch (err) { say(err?.message || "Não foi possível abrir o item."); } };
        const nb = neighbours(items, airItemId);
        const endsAlone = (it) => endsByItself(it, String(it.type || "").toUpperCase() === "SONG" ? data.songs.find((x) => x.id === it.contentId) : null);
        const headMenu = (e) => openMenu(e, { title: "Setlist", items: setlistHeadItems({ view, service, services, active: activeSvc, items, saveToCulto: writes.saveToCulto, onPlan: () => openPlanner(view.active ? serviceId : null) }) });
        const addMenu = (e) => openMenu(e, { title: "Adicionar à setlist", items: setlistAddItems({ e, openMenu, askText, addRow: (row) => writes.addRowToSetlist(row, prevItemId), timerPresets: data.timerPresets, pieces: data.pieces || [], onNewNotice: () => openNotice("new", "setlist") }) });
        const on = Boolean(service?.autoplay);
        body = (
            <Panel title="Setlist" caption={<SetlistTitle view={view} service={service} onClick={headMenu} />} className={`setlist-panel ${coveredBy ? "is-covered" : ""}`}
                actions={<>{coverTag}{picking && <SelectManyBtn on onToggle={setPicking} />}<IconBtn name="planner" title="Planejar o culto" small onClick={() => openPlanner(view.active ? serviceId : null)} /><IconBtn name="plus" title="Adicionar à setlist: seção, texto, timer" small onClick={addMenu} /></>}>
                <Rundown service={service} items={items} media={data.media} askText={askText} onOpenMedia={openMedia} loaded={loaded} airItemId={airItemId} airNow={airNow} prevItemId={prevItemId}
                    onPrepare={prepareItem} onGo={goItem} onAddStage={writes.addStageToSetlist} onPlan={view.active ? () => openPlanner(serviceId) : null} onSay={say}
                    autoplay={{ on, pending, cancel: () => toConsole("autoplay.cancel"), endsAlone }} picking={picking} setPicking={setPicking} />
                <SetlistFooter count={setlistCountOf(plan(service, items))} autoplay={{ on, onChange: writes.setAutoplay, gap: { service, onChange: writes.setAutoplayGap } }} prev={nb.prev} next={nb.next} onStep={stepSetlist} />
            </Panel>
        );
    } else if (module === "lib") {
        const folders = {
            group: layout.libGroup, open: layout.libFoldersOpen, categories: prefs.media_categories, onGroup: setLibGroup,
            onOpen: (tab, key, isOpen) => patch({ libFoldersOpen: { ...layout.libFoldersOpen, [tab]: { ...layout.libFoldersOpen?.[tab], [key]: isOpen } } }),
        };
        body = (
            <ImportSongsContext.Provider value={openImport}>
                <Panel title="Biblioteca" actions={<>
                    {picking && <SelectManyBtn on onToggle={setPicking} />}
                    <IconBtn name="media" small title="Abrir a Biblioteca de mídia" aria-label="Abrir a Biblioteca de mídia" onClick={() => openMedia()} />
                    <span className="lib-add-slot" ref={setAddSlot} />
                    <TabsPlus row="lib" onMenu={() => setMenu(menu === "tabs:lib" ? null : "tabs:lib")} menuOpen={menu === "tabs:lib"} />
                </>} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <Library c={c} data={data} askText={askText} tab={libTabNow} setTab={setLibTab} tabs={shownTabs("lib", tabLists.lib)}
                        onPrepare={(s) => c.setPrev(s)} onGo={(s) => h.sendNow(s)} onAddSong={writes.addSong} onLyricsWeb={() => setLyrics({ q: "" })} onEditSong={openSong} onOpenMedia={openMedia}
                        dupIds={null} onDuplicates={() => h.openSettings("sincronizacao")} songLine={songLine} picking={picking} setPicking={setPicking} addSlot={addSlot} folders={folders} />
                </Panel>
            </ImportSongsContext.Provider>
        );
    } else if (module === "abas") {
        const tabs = shownTabs("panel", tabLists.panel).map((t) => (unread[t.id] ? { ...t, dot: "novos" } : t));
        body = (
            <TabsPanel c={c} data={data} tabs={tabs} active={panelTabNow} setActive={setPanelTab} onMenu={() => setMenu(menu === "tabs:panel" ? null : "tabs:panel")} menuOpen={menu === "tabs:panel"}
                items={items} prevItemId={prevItemId} airItemId={airNow ? airItemId : null} service={service} onSaveNotes={writes.saveOperatorNotes} onPrepare={(s) => c.setPrev(s)} onGo={(s) => h.sendNow(s)}
                messages={messages} onAddSong={writes.addSong} onAddMedia={(m, extra) => writes.addStageToSetlist(stageFromMedia(m), undefined, { extra })} onAddStage={(s) => writes.addStageToSetlist(s)}
                onLyricsSearch={(q) => setLyrics({ q })} onWriteMessage={writes.writeMessage} onEditNotice={openNotice} />
        );
    }

    return (
        <>
            <WinBar title={title} sub={module === "slides" ? handTitle(c) || undefined : undefined} />
            <div className="win-body panel-page" data-panel-page={module}>{body}</div>
            {menu && <div className="scrim" onClick={() => setMenu(null)} />}
            <TabsMenu open={menu} list={tabLists[menu?.slice(5)]} onToggle={toggleTabIn} onRestore={(row) => setTabList(row, DEFAULT_TABS[row])} onClose={() => setMenu(null)}
                songLine={songLine} onSongLine={(k, v) => patch({ [SONG_LINE_KEYS[k]]: v })}
                group={canGroup(libTabNow) ? layout.libGroup?.[libTabNow] === true : null} onGroup={(on) => setLibGroup(libTabNow, on)} />
            {lyrics && <div className="scrim is-dim" onClick={() => setLyrics(null)} />}
            {lyrics && <LyricsSearch c={c} initial={lyrics.q} onClose={() => setLyrics(null)} onImported={(song) => { setLyrics(null); c.setPrev(stageFromSong(song, {}, data.themes)); openSong(song.id); }} />}
            <ImportSongsDialog request={importReq} onClose={() => setImportReq((r) => (r?.busy ? r : null))} onBusy={(busy) => setImportReq((r) => (r ? { ...r, busy } : r))} say={say} />
        </>
    );
}
