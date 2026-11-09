import React from "react";
import SongEditor from "./SongEditor";
import SyncView from "./SyncView";
import ServicePlanner from "./ServicePlanner";
import MediaView from "./MediaView";
import NoticeEditor from "./NoticeEditor";
import SchoolView from "./SchoolView";
import MaterialView from "./MaterialView";
import ReportsView from "./ReportsView";
import SettingsView from "./settings/SettingsView";
import ThemeEditor from "@/components/editor/ThemeEditor";
import ScreenEditor from "@/components/editor/ScreenEditor";
import PanelPage from "./PanelPage";
import { keryx } from "@/api/keryxClient";
import { noticeItem } from "@/lib/console/setlist";

// Novo aviso… from the Setlist's + or the planner (2026-11-09): the aviso,
// once saved, becomes an item there. addTo "setlist" = the Setlist on screen,
// under the Prévia's item (the host's noticeToSetlist); { serviceId } = the
// end of that culto (Planejar o culto).
async function addNoticeTo(row, addTo, h) {
    if (addTo === "setlist") return h.noticeToSetlist?.(row);
    if (!addTo?.serviceId) return undefined;
    try {
        const have = await keryx.entities.ServiceItem.filter({ serviceId: addTo.serviceId });
        await keryx.entities.ServiceItem.create({ serviceId: addTo.serviceId, order: have.length, enabled: true, ...noticeItem(row) });
        h.c.say(`${noticeItem(row).title} no culto.`);
    } catch (err) { h.c.say(err?.message || "Não foi possível pôr o aviso no culto."); }
    return undefined;
}

// The pages of THE window (Rodada C, src/lib/console/nav.js), one switch for
// both of its hosts: the console's floating window (Console.jsx) and a
// detached page's own window (/Janela, src/pages/Janela.jsx; Rodada F5,
// "Destacar em janela"). The page gets the same props in both; what differs
// comes in `h`:
//   c, data, logoUrl     — the console (or the detached window's light `c`)
//   push(spec, from)     — a new level in the same window ("← from")
//   replaceTop(props, o) — the same page with other props (nav.replaceTop)
//   sendNow(stage)       — the Mídia's Enviar ao ar: the Prévia and the air
//   sendStage(stage)     — the Escola bíblica's: on air (it fills the Prévia itself)
//   songSaved(row)       — the Prévia and the song on air take its new slides
//   addMaterial(m)       — Escola bíblica › Setlist
//   noticeToSetlist(row) — Novo aviso… from the Setlist's + (addNoticeTo)
//   askText              — PromptDialog
//   cfg, setCfg, uiLayout, setUiLayout, restoreLayout, openScreen,
//   openWhatsNew         — Configurações
//   plannerFocus         — Planejar o culto: the item to open; the active
//                          culto is the church's (useActiveService)
//   openSettings(id)     — a dock panel in a window of its own (/Janela only):
//                          Configurações opens in the console
// The console runs those through its own Prévia, sendStage and log; a
// detached window sends them to the console (src/lib/janelaRelay.js).
export function winPage(entry, { active, escRef, onClose }, h) {
    const { c, data } = h;
    const p = entry.props || {};
    switch (entry.page) {
        case "config":
            return <SettingsView c={c} section={h.cfg || "igreja"} setSection={h.setCfg} onClose={onClose} escRef={escRef} active={active} layout={h.uiLayout} setLayout={h.setUiLayout} restoreLayout={h.restoreLayout} onOpenScreen={h.openScreen} onWhatsNew={h.openWhatsNew} askText={h.askText} />;
        case "planner":
            // The tab in front rides in the entry's props (keep: no remount),
            // so Destacar opens the detached window on it (nav.js detachSpec).
            return <ServicePlanner c={c} data={data} openId={p.serviceId || null} focusId={h.plannerFocus}
                active={active} onFront={(id) => { if ((id || null) !== (p.serviceId || null)) h.replaceTop(id ? { serviceId: id } : {}, { keep: true }); }}
                onClose={onClose} escRef={escRef}
                onEditSong={(id) => h.push({ page: "song", props: { id } }, "Planejar o culto")}
                onNewNotice={(serviceId) => h.push({ page: "notice", props: { id: "new", addTo: { serviceId } } }, "Planejar o culto")} />;
        case "media":
            return <MediaView c={c} intent={p.intent || null} media={data.media} onSend={h.sendNow} onClose={onClose} escRef={escRef} active={active} askText={h.askText} />;
        case "notice":
            return <NoticeEditor c={c} noticeId={p.id} logoUrl={h.logoUrl} media={data.media} onClose={onClose} onSaved={(row) => { if (p.id === "new" && row?.id) { if (p.addTo) addNoticeTo(row, p.addTo, h); h.replaceTop({ id: row.id }); } }} escRef={escRef} active={active} />;
        case "song":
            return <SongEditor c={c} songId={p.id} autoSync={Boolean(p.sync)} themes={data.themes} onClose={onClose} onSaved={(row) => { h.songSaved(row); if (p.id === "new" && row?.id) h.replaceTop({ id: row.id }); }} escRef={escRef} active={active}
                onSync={(props) => h.push({ page: "sync", props }, "Editor de música")} />;
        case "sync":
            return <SyncView {...p} onClose={onClose} escRef={escRef} active={active} />;
        case "school":
            return <SchoolView c={c} logoUrl={h.logoUrl} media={data.media} onSend={h.sendStage} onAddToSetlist={h.addMaterial} onClose={onClose} escRef={escRef} askText={h.askText}
                onEditMaterial={(id, kid) => h.push({ page: "material", props: { id: id || null, classId: kid || "" } }, "Escola bíblica")} />;
        case "material":
            return <MaterialView c={c} materialId={p.id} classId={p.classId} media={data.media} onClose={onClose} escRef={escRef} active={active} />;
        case "reports":
            return <ReportsView c={c} onClose={onClose} escRef={escRef} />;
        case "theme":
            return <ThemeEditor hosted themeId={p.id} say={c.say} onClose={onClose} onSaved={(row) => { if (row?.id && p.id !== row.id) h.replaceTop({ id: row.id }, { keep: true }); }} onSwitch={(id) => h.replaceTop({ id: id || "new" })} escRef={escRef} active={active} />;
        case "screen":
            return <ScreenEditor hosted screenPath={p.path} media={data.media} themes={data.themes} say={c.say} live={c.cur} onClose={onClose} onSwitch={(path) => h.replaceTop({ path: path || "/Projection" })} escRef={escRef} active={active} askText={h.askText} />;
        // A dock panel in a window of its own (Painéis em janela): /Janela only.
        case "panel":
            return <PanelPage module={p.module} h={h} escRef={escRef} active={active} onClose={onClose} />;
        default:
            return null;
    }
}
