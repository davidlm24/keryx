import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import CenterPanel from "@/components/console/CenterPanel";
import Rundown from "@/components/console/Rundown";
import Layers from "@/components/console/Layers";
import Timeline from "@/components/console/Timeline";
import BibleEnv from "@/components/console/BibleEnv";
import PresentView from "@/components/console/PresentView";
import VerifyView from "@/components/console/VerifyView";
import { Menu, Shortcuts, Outputs, History, ArmDialog, EndDialog, Palette } from "@/components/console/Popovers";
import { loadLayout, saveLayout, clampSize, DEFAULT_LAYOUT } from "@/lib/console/layout";
import { liveAction } from "@/lib/console/keys";
import { stageFromSong, stageFromPassage, stageFromMedia, stageFromText, stageFromTool } from "@/lib/console/stage";

const mmss = (s) => { s = Math.max(0, Math.round(s || 0)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
const LOG_KEY = (serviceId) => `keryx.console.log.${serviceId}`;
const loadLog = (serviceId) => { try { return JSON.parse(localStorage.getItem(LOG_KEY(serviceId)) || "{}"); } catch { return {}; } };

// The operator console: three views of the same service, driving the live
// state (shared/live-state.mjs) through useConsole.
//   Preparar   the full console on a local copy: the screens don't change.
//   Verificar  the readiness check before the service.
//   Apresentar Programa and Prévia large, the slide strip, a short rundown,
//              the rest behind "Mais"; Ensaio lives here.
// docs/design-system.md is the look; docs/desktop-architecture.md the plumbing.
export default function Console() {
    const c = useConsole();
    const logoUrl = useChurchLogo();
    const data = useLibrary();
    const [profile, setProfile] = useState("");
    const [view, setViewState] = useState(null);
    const [mais, setMais] = useState(false);
    const [maisTab, setMaisTab] = useState("letras");
    const [env, setEnv] = useState("culto");
    const [open, setOpen] = useState(null);
    const [libTab, setLibTab] = useState("letras");
    const [drawer, setDrawer] = useState(false);
    const [layout, setLayoutState] = useState(() => loadLayout(""));
    const [serviceId, setServiceId] = useState(null);
    const [log, setLog] = useState({});
    const [bibleRequest, setBibleRequest] = useState(null);
    const [width, setWidth] = useState(() => window.innerWidth);
    const [tries, setTries] = useState(1);
    const compact = width < 1440;

    useEffect(() => {
        keryx.auth.me().then((u) => { const p = u?.email || u?.full_name || ""; setProfile(p); setLayoutState(loadLayout(p)); }).catch(() => {});
        const onResize = () => setWidth(window.innerWidth);
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);
    // The view: Apresentar when a service is running, else Preparar.
    const { enterPrep, enterPresent } = c;
    const setView = useCallback((v) => {
        if (v === "preparar") enterPrep();
        if (v === "apresentar") enterPresent();
        if (v === "verificar") setEnv("culto");
        setMais(false);
        setOpen(null);
        setViewState(v);
    }, [enterPrep, enterPresent]);
    const hasLive = Boolean(c.live);
    const hasSession = Boolean(c.live?.session);
    useEffect(() => { if (view === null && hasLive) setView(hasSession ? "apresentar" : "preparar"); }, [view, hasLive, hasSession, setView]);
    const setLayout = useCallback((next) => { setLayoutState(next); saveLayout(profile, next); }, [profile]);
    const restoreLayout = () => { setLayout({ ...DEFAULT_LAYOUT }); c.say("Layout padrão restaurado."); };

    const { services, items } = useRundown(serviceId);
    useEffect(() => { if (!serviceId && services.length) setServiceId(pickDefaultService(services)?.id || null); }, [services, serviceId]);
    useEffect(() => { if (serviceId) setLog(loadLog(serviceId)); }, [serviceId]);
    const service = services.find((s) => s.id === serviceId) || null;
    const { outputs, network } = useOutputs();

    // The live state says where the service is; the Prévia says what is next in hand.
    const airItemId = c.cur?.session?.itemId || null;
    const prevItemId = c.prev?.args?.ref?.serviceItemId || null;
    const airIdx = items.findIndex((i) => i.id === airItemId);
    const nextItem = airIdx >= 0 ? items[airIdx + 1] || null : items[0] || null;

    // A rundown item as a stage: the row it points at, with the item's id in ref.
    const buildStage = useCallback(async (item, index) => {
        const ref = { serviceItemId: item.id, serviceItemIndex: index, serviceId };
        const type = String(item.type || "").toUpperCase();
        if (type === "SONG") return stageFromSong(await keryx.entities.Song.get(item.contentId), ref);
        if (type === "BIBLE") return stageFromPassage(await keryx.entities.BiblePassage.get(item.contentId), ref);
        if (["VIDEO", "IMAGE", "PDF", "POWERPOINT"].includes(type)) { const s = stageFromMedia(await keryx.entities.Media.get(item.contentId)); return { ...s, args: { ...s.args, ref } }; }
        if (type === "TIMER") { const s = stageFromTool("timer", { minutes: Math.max(1, Math.round((item.duration || 300) / 60)) }); return { ...s, args: { ...s.args, ref } }; }
        const s = stageFromText(item.title || "Texto", item.notes || item.title || "");
        return { ...s, args: { ...s.args, ref } };
    }, [serviceId]);

    const prepareItem = useCallback(async (item, index) => {
        try { c.setPrev(await buildStage(item, index)); } catch (err) { c.say(err?.message || "Não foi possível abrir o item."); }
    }, [buildStage, c]);

    // Sending records when the item went on air (for the timeline), in live mode only.
    const sendStage = useCallback(async (stage) => {
        const went = await c.send(stage);
        if (!went || !c.isLive) return;
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
    }, [c, serviceId]);
    const goItem = useCallback(async (item, index) => {
        try { const stage = await buildStage(item, index); c.setPrev(stage); await sendStage(stage); } catch (err) { c.say(err?.message || "Não foi possível abrir o item."); }
    }, [buildStage, c, sendStage]);

    const addSong = async (song) => {
        if (!serviceId) { c.say("Escolha um culto no menu KERYX."); return; }
        try {
            await keryx.entities.ServiceItem.create({ serviceId, type: "SONG", title: song.title, contentId: song.id, order: items.length, duration: song.duration || 240 });
            c.say(`${song.title} adicionada ao fim do Roteiro.`);
        } catch (err) { c.say(err?.message || "Não foi possível adicionar."); }
    };

    // Outputs: the projector window missing its display, or closed, is the warning.
    const projector = outputs.find((o) => o.key === "/Projection");
    // The screens are real in every view, so a failing projector is reported in every view.
    const projectorDown = Boolean(projector && projector.placement.missing);
    const [lastOkAt, setLastOkAt] = useState(null);
    useEffect(() => { if (projector && !projector.placement.missing) setLastOkAt(Date.now()); }, [projector]);
    useEffect(() => { if (!projectorDown) { setTries(1); return undefined; } const id = setInterval(() => setTries((t) => t + 1), 5000); return () => clearInterval(id); }, [projectorDown]);
    const connected = outputs.filter((o) => o.open).length + network.filter((d) => d.online).length;
    const outsLabel = projectorDown ? "Saídas · 1 com problema" : c.mode === "ensaio" ? "Saídas desarmadas" : `Saídas · ${connected} ${connected === 1 ? "conectada" : "conectadas"}`;
    const outsState = projectorDown ? "warn" : c.mode === "ensaio" ? "rh" : "";
    const openOutput = (key) => window.keryxDesktop?.displays.open(key).catch(() => {});
    const closeOutput = (key) => window.keryxDesktop?.displays.close(key).catch(() => {});

    const openReference = (ref) => { setBibleRequest({ ...ref, at: Date.now() }); if (view === "verificar") setView("preparar"); setMais(false); setEnv("biblia"); };

    // Keys (src/lib/console/keys.js): a focused control keeps its own keys.
    // Enter sends only with nothing interactive focused, Ctrl+Enter from
    // anywhere; arrows move the slide; B/L/C the screen; Esc asks before
    // ending (or closes what is open); / searches; ? lists the keys.
    useEffect(() => {
        const onKey = (e) => {
            const action = liveAction(e);
            if (!action) return;
            if (open) {
                if (action === "end") { e.preventDefault(); setOpen(null); }
                return;
            }
            // Verificar shows no Prévia and no slides: only the screen keys work there.
            if (view === "verificar" && ["send", "next", "prev", "clear", "play"].includes(action)) return;
            if (action === "end" && mais) { e.preventDefault(); setMais(false); return; }
            if (action === "send") { e.preventDefault(); sendStage(); }
            else if (action === "next") { e.preventDefault(); c.moveSlide(1); }
            else if (action === "prev") { e.preventDefault(); c.moveSlide(-1); }
            else if (action === "black") c.toggleScreen("black");
            else if (action === "logo") c.toggleScreen("logo");
            else if (action === "clear") c.clearText();
            else if (action === "end") { e.preventDefault(); if (drawer) setDrawer(false); else setOpen("encerrar"); }
            else if (action === "search") { e.preventDefault(); setOpen("palette"); }
            else if (action === "help") setOpen("atalhos");
            else if (action === "play") {
                const layer = c.cur?.video ? "video" : c.cur?.media?.playback ? "media" : null;
                if (layer) { e.preventDefault(); c.callOp("transport", { layer, action: c.cur[layer].playback.paused ? "play" : "pause" }).catch(() => {}); }
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [c, open, drawer, sendStage, view, mais]);

    const rundownProps = { service, items, airItemId, prevItemId, prepare: prepareItem, go: goItem };
    const histLeft = useMemo(() => (layout.hidden.lib ? 0 : layout.libW + 6) + (layout.hidden.slides ? 0 : layout.slidesW + 6) + 6, [layout]);
    const showRight = !compact && !(layout.hidden.camadas && layout.hidden.roteiro);
    const rightPanels = (inDrawer) => (
        <>
            {!layout.hidden.camadas && (
                <Panel title="Camadas" collapsed={!inDrawer && layout.collapsed.camadas} onToggle={inDrawer ? undefined : () => setLayout({ ...layout, collapsed: { ...layout.collapsed, camadas: !layout.collapsed.camadas } })} style={inDrawer ? { flex: "none", maxHeight: "48%" } : { flex: layout.collapsed.camadas ? "none" : `0 0 ${layout.camadasH}px` }}
                    actions={inDrawer ? <IconBtn name="x" title="Fechar" small onClick={() => setDrawer(false)} /> : null}>
                    <Layers c={c} themes={data.themes} />
                </Panel>
            )}
            {!inDrawer && !layout.hidden.camadas && !layout.hidden.roteiro && !layout.collapsed.camadas && (
                <Split horizontal size={layout.camadasH} onSize={(v) => setLayout({ ...layout, camadasH: v })} onReset={() => setLayout({ ...layout, camadasH: DEFAULT_LAYOUT.camadasH })} clamp={(v) => clampSize("camadasH", v)} />
            )}
            {!layout.hidden.roteiro && (
                <Panel title="Roteiro" count={items.length ? `${items.length} itens · ${mmss(items.reduce((a, b) => a + (b.duration || 0), 0))}` : service?.title || ""} collapsed={!inDrawer && layout.collapsed.roteiro} onToggle={inDrawer ? undefined : () => setLayout({ ...layout, collapsed: { ...layout.collapsed, roteiro: !layout.collapsed.roteiro } })}
                    actions={<IconBtn name="plus" title="Adicionar ao roteiro" small onClick={() => setOpen("palette")} />}>
                    <Rundown service={service} items={items} airItemId={airItemId} prevItemId={prevItemId} onPrepare={prepareItem} onGo={goItem} />
                </Panel>
            )}
        </>
    );

    const hhmm = (t) => (t ? new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "—");
    const present = view === "apresentar";

    return (
        <div className={`kx console ${compact ? "is-compact" : ""} ${c.isLive ? "" : "is-ensaio"} ${present ? "is-apres" : ""}`}>
            <TopBar c={c} service={service} view={view} setView={setView} env={env} setEnv={setEnv} open={open} setOpen={setOpen} outsLabel={outsLabel} outsState={outsState} compact={compact} drawerOpen={drawer} toggleDrawer={() => setDrawer((d) => !d)} mais={mais} toggleMais={() => setMais((m) => !m)} logoUrl={logoUrl} />
            {/* A failing output: one line under the top bar, in every view, never over a monitor. */}
            {projectorDown && (
                <div className="kx-banner is-warn" role="alert">
                    Projetor · Reconectando… tentativa {tries}
                    <span className="kx-sub">ATENÇÃO · última conexão boa às {hhmm(lastOkAt)} · o monitor escolhido não está ligado</span>
                    <span className="kx-spacer" />
                    <button type="button" className="kx-btn kx-t" onClick={() => c.toggleScreen("black")}>Tela preta</button>
                    <button type="button" className="kx-btn kx-t" onClick={() => c.toggleScreen("logo")}>Mostrar logo</button>
                    <button type="button" className="kx-btn kx-btn-outline kx-t" onClick={() => setOpen("outs")}>Ver saídas</button>
                </div>
            )}
            {c.mode === "ensaio" && (
                <div className="kx-banner is-rh">MODO ENSAIO — nada será enviado às saídas<span className="kx-sub">As telas continuam com o que estava no ar.</span><span className="kx-spacer" /><button type="button" className="kx-btn kx-btn-rh kx-t" onClick={() => setOpen("arm")}>Armar saídas</button></div>
            )}
            <div className="main">
                {view === null && <div className="kx-panel" style={{ flex: 1 }} />}
                {view === "verificar" && (
                    <VerifyView c={c} items={items} data={data} outputs={outputs} network={network}
                        onIdentify={() => window.keryxDesktop?.displays.identify().catch(() => {})}
                        onOpenOutput={openOutput} onGoPresent={() => setView("apresentar")} />
                )}
                {view !== "verificar" && view !== null && env === "biblia" && <BibleEnv c={c} logoUrl={logoUrl} request={bibleRequest} serviceId={serviceId} itemsCount={items.length} onPrepare={(s) => { c.setPrev(s); setEnv("culto"); }} onSend={(s) => sendStage(s)} />}
                {present && env === "culto" && (
                    <PresentView c={c} logoUrl={logoUrl} service={service} items={items} log={log} airItemId={airItemId} prevItemId={prevItemId}
                        onPrepareItem={prepareItem} onGoItem={goItem} onSend={() => sendStage()}
                        onOpenRoteiro={() => setOpen(open === "roteiro" ? null : "roteiro")} onOpenHistory={() => setOpen(open === "hist" ? null : "hist")}
                        mais={mais} setMais={setMais} maisTab={maisTab} setMaisTab={setMaisTab} data={data} onAddSong={addSong} />
                )}
                {view === "preparar" && env === "culto" && (
                    <>
                        {!layout.hidden.lib && (
                            <>
                                <div className="col" style={{ width: layout.libW, flex: "none" }}>
                                    <Panel title="Biblioteca" collapsed={layout.collapsed.lib} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, lib: !layout.collapsed.lib } })} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                        <Library c={c} data={data} rundown={rundownProps} tab={libTab} setTab={setLibTab} compact={compact} onPrepare={(s) => c.setPrev(s)} onAddSong={addSong} />
                                    </Panel>
                                </div>
                                <Split size={layout.libW} onSize={(v) => setLayout({ ...layout, libW: v })} onReset={() => setLayout({ ...layout, libW: DEFAULT_LAYOUT.libW })} clamp={(v) => clampSize("libW", v)} />
                            </>
                        )}
                        {!layout.hidden.slides && (
                            <>
                                <div className="col" style={{ width: layout.slidesW, flex: "none" }}>
                                    <Panel title="Slides" count={handTitle(c) || "—"} collapsed={layout.collapsed.slides} onToggle={() => setLayout({ ...layout, collapsed: { ...layout.collapsed, slides: !layout.collapsed.slides } })} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                        <SlidesPanel c={c} />
                                    </Panel>
                                </div>
                                <Split size={layout.slidesW} onSize={(v) => setLayout({ ...layout, slidesW: v })} onReset={() => setLayout({ ...layout, slidesW: DEFAULT_LAYOUT.slidesW })} clamp={(v) => clampSize("slidesW", v)} />
                            </>
                        )}
                        <div className="col center">
                            <Panel title={c.isLive ? "Programa" : "Programa · Ensaio"} actions={
                                <div style={{ position: "relative" }}>
                                    <button type="button" className={`kx-btn kx-t ${open === "hist" ? "is-on" : ""}`} style={{ height: 22 }} onClick={() => setOpen(open === "hist" ? null : "hist")} title="O que esteve no ar há pouco"><Icon name="undo" />Voltar ao anterior</button>
                                </div>
                            } bodyStyle={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                                <CenterPanel c={c} logoUrl={logoUrl} projectorDown={projectorDown} nextItem={nextItem} onPrepNext={() => nextItem && prepareItem(nextItem, items.indexOf(nextItem))} onSend={() => sendStage()} videoScreens={network.filter((d) => d.online && d.role === "media").map((d) => d.name).join(", ") || null} />
                            </Panel>
                        </div>
                        {showRight && (
                            <>
                                <Split size={layout.rightW} sign={-1} onSize={(v) => setLayout({ ...layout, rightW: v })} onReset={() => setLayout({ ...layout, rightW: DEFAULT_LAYOUT.rightW })} clamp={(v) => clampSize("rightW", v)} />
                                <div className="col" style={{ width: layout.rightW, flex: "none", gap: "var(--gutter)" }}>{rightPanels(false)}</div>
                            </>
                        )}
                    </>
                )}
            </div>
            {view === "preparar" && !layout.hidden.tl && (
                <div className={`kx-panel tl-panel ${layout.tlOpen ? "is-open" : ""}`}>
                    <Timeline service={service} items={items} airItemId={airItemId} prevItemId={prevItemId} log={log} now={c.now} open={layout.tlOpen} onToggle={() => setLayout({ ...layout, tlOpen: !layout.tlOpen })} onPrepare={prepareItem} />
                </div>
            )}

            {open && <div className={`scrim ${open === "palette" || open === "arm" || open === "atalhos" || open === "encerrar" ? "is-dim" : ""}`} onClick={() => setOpen(null)} />}
            <Menu open={open} setOpen={setOpen} services={services} serviceId={serviceId} setServiceId={setServiceId} layout={layout} setLayout={setLayout} restoreLayout={restoreLayout} />
            <Shortcuts open={open} setOpen={setOpen} />
            <Outputs open={open} setOpen={setOpen} outputs={outputs} network={network} isLive={c.isLive} onOpen={openOutput} onClose={closeOutput} tries={tries} />
            <History open={open} setOpen={setOpen} history={c.live?.history || []} onPick={(s) => c.setPrev(s)} left={present ? 12 : histLeft} />
            <ArmDialog open={open} setOpen={setOpen} live={c.live} onArm={c.arm} />
            <EndDialog open={open} setOpen={setOpen} mode={c.mode} onEnd={c.end} />
            {open === "roteiro" && (
                <div className="roteiro-pop">
                    <Panel title="Roteiro" count={items.length ? `${items.length} itens` : ""} actions={<IconBtn name="x" title="Fechar" small onClick={() => setOpen(null)} />}>
                        <Rundown service={service} items={items} airItemId={airItemId} prevItemId={prevItemId} onPrepare={(it, i) => { prepareItem(it, i); setOpen(null); }} onGo={(it, i) => { goItem(it, i); setOpen(null); }} canReorder={false} />
                    </Panel>
                </div>
            )}
            <Palette open={open} setOpen={setOpen} data={data} items={items} env={env} onPrepare={(s, i) => (s?.op ? c.setPrev(s) : prepareItem(s, i))} onAddSong={addSong} openReference={openReference} />
            {compact && drawer && <div className="drawer">{rightPanels(true)}</div>}
            {c.toast && <div className="toast">{c.toast}</div>}
        </div>
    );
}
