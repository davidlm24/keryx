// The Setlist's header — its title, which switches the culto every console
// shows, and its (+) — for whichever window holds it: the console and a
// Setlist in a window of its own (PanelPage.jsx, "Painéis em janela").
import React from "react";
import Icon from "./Icon";
import { cultosOf, setlistTitle } from "@/lib/console/consoleSetlist";
import { statusOf, total } from "@/lib/console/setlist";
import { menuItem } from "@/lib/console/menuLabels";
import { timerChoices, minutesLabel } from "@/lib/console/timerPresets";

// The planned cultos the Setlist's title offers (U2 = A): not done, by
// date, the active one always among them.
export const cultoChoicesOf = (services, activeId) => cultosOf(services)
    .filter((s) => s.id === activeId || statusOf(s.status) !== "COMPLETED")
    .sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")))
    .slice(-8);
const dm = (d) => (d ? d.split("-").reverse().slice(0, 2).join("/") : "");

// The title's menu: the shared Setlist or a culto, for every computer;
// Encerrar o culto… or Guardar no culto…; Planejar o culto.
export function setlistHeadItems({ view, service, services, active, items, saveToCulto, onPlan }) {
    const choices = cultoChoicesOf(services, active.activeId);
    return [
        { head: "No console · todos os computadores" },
        { label: "Setlist", icon: "list", checked: !view.active, title: "A setlist compartilhada, quando nenhum culto está ativo", onSelect: () => active.activate(null) },
        ...choices.map((s) => ({ label: s.title || "Culto sem nome", kbd: dm(s.date), checked: s.id === active.activeId, title: "Ativar este culto em todos os computadores", onSelect: () => active.activate(s) })),
        "sep",
        view.active
            ? { label: "Encerrar o culto…", icon: "check", title: "Marca o culto como feito e todos voltam à Setlist", onSelect: () => active.endService(service) }
            : { label: "Guardar no culto…", icon: "copy", disabled: !items.length, title: items.length ? "Copia estes itens para um culto planejado" : "A setlist está vazia", sub: [
                ...choices.map((s) => ({ label: s.title || "Culto sem nome", kbd: dm(s.date), onSelect: () => saveToCulto(s) })),
                ...(choices.length ? ["sep"] : []),
                menuItem("novoCulto", { onSelect: () => saveToCulto(null) }),
            ] },
        menuItem("planejar", { onSelect: onPlan }),
    ];
}

// The (+) (owner 2026-10-14, the "Menus (+)" proposal): the palette first
// (the console only: `palette`), then what only Planejar made — a section, a
// text, a timer — right under the item in the Prévia (addRow decides where).
// openMenu opens the timers where the first menu was.
export function setlistAddItems({ e, openMenu, askText, addRow, timerPresets, palette = null }) {
    const at = { clientX: e.clientX, clientY: e.clientY, preventDefault() {}, stopPropagation() {} };
    const timers = () => openMenu(at, { title: "Timer na setlist", items: timerChoices(timerPresets).map((t) => ({ label: minutesLabel(t.minutes), icon: "clock", onSelect: () => addRow({ type: "TIMER", title: `Timer ${t.minutes} min`, duration: t.minutes * 60 }) })) });
    return [
        ...(palette ? [{ label: "Buscar música, versículo, mídia…", icon: "search", kbd: palette.kbd, onSelect: palette.onSelect }, "sep"] : []),
        { label: "Seção…", icon: "list", onSelect: async () => { const t = await askText({ title: "Seção da setlist", placeholder: "Pré-culto, Louvor, Palavra…", ok: "Adicionar" }); if (t) addRow({ type: "SECTION", title: t, duration: 0 }); } },
        { label: "Texto…", icon: "text", onSelect: async () => { const t = await askText({ title: "Texto na setlist", placeholder: "O texto que vai às telas", ok: "Adicionar", multiline: true, hint: "Ctrl+Enter adiciona" }); if (t) addRow({ type: "TEXT", title: t.split("\n")[0].slice(0, 60), notes: t, duration: 60 }); } },
        { label: "Timer…", icon: "clock", onSelect: timers },
    ];
}

// "n itens · 0:42" for the footer.
export const setlistCountOf = (p) => (p.count ? `${p.count} ${p.count === 1 ? "item" : "itens"} · ${total(p.seconds)}` : "");

// The title: "Setlist" or the active culto's name with its green dot; a
// click opens setlistHeadItems.
export function SetlistTitle({ view, service, onClick }) {
    return (
        <button type="button" className="kx-section setlist-head" aria-haspopup="menu" onClick={onClick}
            title={view.active ? `${service?.title || "Culto sem nome"} · ativo em todos os computadores · clique para trocar` : "A setlist compartilhada por todos os computadores · clique para ativar um culto"}>
            {view.active && <span className="setlist-head-dot" aria-label="ativo" />}
            <span className="setlist-head-t">{setlistTitle(view)}</span>
            <Icon name="chevron-down" />
        </button>
    );
}
