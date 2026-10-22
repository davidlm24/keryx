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
//   askText              — PromptDialog
//   cfg, setCfg, uiLayout, setUiLayout, restoreLayout, openScreen,
//   openWhatsNew         — Configurações
//   serviceId, setServiceId, plannerFocus — Planejar o culto: the console's
//                          culto (its tab's green dot) and "Usar no console";
//                          the planner's own tabs never change it (O9 = A)
// The console runs those through its own Prévia, sendStage and log; a
// detached window sends them to the console (src/lib/janelaRelay.js).
export function winPage(entry, { active, escRef, onClose }, h) {
    const { c, data } = h;
    const p = entry.props || {};
    switch (entry.page) {
        case "config":
            return <SettingsView c={c} section={h.cfg || "igreja"} setSection={h.setCfg} onClose={onClose} escRef={escRef} active={active} layout={h.uiLayout} setLayout={h.setUiLayout} restoreLayout={h.restoreLayout} onOpenScreen={h.openScreen} onWhatsNew={h.openWhatsNew} />;
        case "planner":
            // The tab in front rides in the entry's props (keep: no remount),
            // so Destacar opens the detached window on it (nav.js detachSpec).
            return <ServicePlanner c={c} data={data} openId={p.serviceId || null} focusId={h.plannerFocus} consoleServiceId={h.serviceId} onUseOnConsole={h.setServiceId}
                active={active} onFront={(id) => { if ((id || null) !== (p.serviceId || null)) h.replaceTop(id ? { serviceId: id } : {}, { keep: true }); }}
                onClose={onClose} escRef={escRef}
                onEditSong={(id) => h.push({ page: "song", props: { id } }, "Planejar o culto")} />;
        case "media":
            return <MediaView c={c} intent={p.intent || null} media={data.media} onSend={h.sendNow} onClose={onClose} escRef={escRef} active={active} askText={h.askText} />;
        case "notice":
            return <NoticeEditor c={c} noticeId={p.id} logoUrl={h.logoUrl} media={data.media} onClose={onClose} onSaved={(row) => { if (p.id === "new" && row?.id) h.replaceTop({ id: row.id }); }} escRef={escRef} active={active} />;
        case "song":
            return <SongEditor c={c} songId={p.id} autoSync={Boolean(p.sync)} themes={data.themes} onClose={onClose} onSaved={(row) => { h.songSaved(row); if (p.id === "new" && row?.id) h.replaceTop({ id: row.id }); }} escRef={escRef} active={active}
                onEditTheme={(id) => h.push({ page: "theme", props: { id } }, "Editor de música")}
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
            return <ScreenEditor hosted screenPath={p.path} media={data.media} themes={data.themes} say={c.say} live={c.cur} onClose={onClose} onSwitch={(path) => h.replaceTop({ path: path || "/Projection" })} escRef={escRef} active={active} />;
        default:
            return null;
    }
}
