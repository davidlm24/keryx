// What changes the culto's list and its rows, for whichever window holds
// the Setlist: the console (Console.jsx) and a Setlist, Painel or Biblioteca
// in a window of its own (PanelPage.jsx, "Painéis em janela", owner
// 2026-11-09). Every write goes through the store, so every window sees it;
// nothing here is the console's own state (its Prévia, its log, the
// Autoplay's countdown stay there).
//
// say: the window's toast. serviceId / service / services / items: the list
// on screen (useActiveService + useRundown). pickFromLibrary: the background
// library of that window (Camadas' Fundo pencil).
import { useCallback, useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { mediaFromYouTube } from "@/lib/mediaImport";
import { getPrefs } from "@/hooks/useUser";
import { serviceFundo } from "@/lib/console/defaultFundo";
import { lookFields, lookOf } from "@/lib/console/serviceLook";
import { CONSOLE_KIND, consoleSetlistOf, consoleSetlistRow, copyItems } from "@/lib/console/consoleSetlist";
import { AUTOPLAY_SAY, gapLabel } from "@/lib/console/autoplay";
import { newServiceDefaults, defaultDuration } from "@/lib/console/serviceDefaults";
import { stageItem, addedSay } from "@/lib/console/setlist";

export function useSetlistWrites({ say, serviceId, service, services, items, pickFromLibrary }) {
    // The list in hand: the active culto, else the shared Setlist, made the
    // first time anything needs it (an item, the Autoplay, the notes, a
    // pedido). The daily draft "Setlist de dd/mm" is gone (U5 = A). One
    // making at a time: what asks meanwhile waits for the same row.
    const making = useRef(null);
    useEffect(() => { if (serviceId) making.current = null; }, [serviceId]);
    const ensureService = useCallback(async () => {
        if (serviceId) return serviceId;
        making.current ||= (async () => {
            const there = consoleSetlistOf(await keryx.entities.Service.filter({ service_type: CONSOLE_KIND }));
            return there ? there.id : (await keryx.entities.Service.create(consoleSetlistRow())).id;
        })().catch((err) => { making.current = null; throw err; });
        return making.current;
    }, [serviceId]);

    // "Autoplay" (the Setlist's footer): the culto's switch.
    const setAutoplay = useCallback(async (on) => {
        try {
            const sid = serviceId || await ensureService();
            await keryx.entities.Service.update(sid, { autoplay: Boolean(on) });
            say(on ? AUTOPLAY_SAY.on : AUTOPLAY_SAY.off);
        } catch (err) { say(err?.message || "Não foi possível salvar."); }
    }, [serviceId, ensureService, say]);
    // The pause before the next item (Service.autoplay_gap; null = the
    // church's, Configurações › Culto): the footer's "5s" beside Autoplay.
    const setAutoplayGap = useCallback(async (s) => {
        try {
            const sid = serviceId || await ensureService();
            await keryx.entities.Service.update(sid, { autoplay_gap: s });
            say(s == null ? "Pausa entre itens: a de Configurações › Culto." : `Pausa entre itens: ${gapLabel(s).toLowerCase()}.`);
        } catch (err) { say(err?.message || "Não foi possível salvar."); }
    }, [serviceId, ensureService, say]);

    // Today's papel de parede, the ONE live door (Rodada B 2026-10-14,
    // "Papel de parede × Tema"): Camadas' Fundo pencil and Planejar o culto
    // call this. The library picks it, saved as the service's background;
    // the console's papel de parede effect then sends background.default —
    // and background.set with nothing on air — so the screen follows at once.
    const pickServiceFundo = useCallback(async () => {
        const before = serviceFundo(service);
        const r = await pickFromLibrary({ accept: ["image", "video", "generator", "color"], title: service ? "Papel de parede do culto" : "Papel de parede de hoje", value: before || null, allowNone: Boolean(before), noneLabel: "Sem papel de parede próprio (o de qualquer outro culto)" });
        if (!r || (!r.spec && !r.none)) return;
        try {
            const sid = serviceId || await ensureService();
            const row = services.find((x) => x.id === sid) || {};
            await keryx.entities.Service.update(sid, lookFields({ ...lookOf(row), background: r.none ? null : r.spec }));
            say(r.none ? "O culto volta ao papel de parede da igreja." : "Papel de parede do culto salvo.");
        } catch (err) { say(err?.message || "Não foi possível salvar o papel de parede."); }
    }, [service, services, serviceId, ensureService, pickFromLibrary, say]);

    // The Notas tab's free notes (Service.operator_notes). With no service the
    // first save starts the list, once: saves made while it is being created
    // wait for it.
    const notesDraft = useRef(null);
    useEffect(() => { if (serviceId) notesDraft.current = null; }, [serviceId]);
    const saveOperatorNotes = useCallback(async (text) => {
        try {
            const sid = serviceId || await (notesDraft.current ||= ensureService());
            await keryx.entities.Service.update(sid, { operator_notes: text });
        } catch (err) { say(err?.message || "Não foi possível salvar as notas."); throw err; }
    }, [serviceId, ensureService, say]);

    // Library items dropped on the Setlist: ServiceItems at that position, in
    // the order they came (several marked rows dragged together, Rodada O2),
    // the rows below renumbered once and one toast.
    // -> { added: titles, left, error? } (the controle remoto's setlist.add
    // reads it; silent: no toast, the runner says it). extra: fields every
    // item made also gets (a pedido's who sings and note, Rodada Q S13/S15);
    // a stage's own `extra` (a pedido dragged in, withPedido) goes on its item.
    const addStageToSetlist = useCallback(async (given, index, { silent = false, extra = {} } = {}) => {
        const tell = silent ? () => {} : say;
        const stages = (Array.isArray(given) ? given : [given]).filter(Boolean);
        const rows = stages.map((stage) => ({ stage, item: stageItem(stage) })).filter((r) => r.item);
        const left = stages.length - rows.length;
        if (!rows.length) { tell(addedSay([], left)); return { added: [], left }; }
        const at = Math.max(0, Math.min(items.length, index ?? items.length));
        const added = [];
        try {
            const sid = await ensureService();
            // Renumber from the end first, so two rows never share an order.
            for (let i = items.length - 1; i >= at; i--) await keryx.entities.ServiceItem.update(items[i].id, { order: i + rows.length });
            for (const { stage, item } of rows) {
                let { type, contentId } = item;
                if (type === "YT") {
                    const row = await mediaFromYouTube(stage.args?.url || stage.id.slice(3), { title: stage.title });
                    type = "VIDEO";
                    contentId = row.id;
                }
                await keryx.entities.ServiceItem.create({ serviceId: sid, type, title: stage.title, contentId, order: at + added.length, duration: stage.args?.duration || defaultDuration(type, getPrefs()), ...extra, ...(stage.extra || {}) });
                added.push(stage.title);
            }
            tell(addedSay(added, left));
            return { added, left };
        } catch (err) {
            // Stopped part way (a YouTube link that would not save): the rows
            // below close the gap the missing ones left, and the toast says
            // how many went in.
            const gap = rows.length - added.length;
            if (added.length && gap) {
                try { for (let i = at; i < items.length; i++) await keryx.entities.ServiceItem.update(items[i].id, { order: i + added.length }); } catch { /* the order keeps a gap; it still sorts */ }
            }
            const why = err?.message || "Não foi possível adicionar.";
            tell(added.length ? `${addedSay(added, left + gap)} ${why}` : why);
            return { added, left: left + gap, error: why };
        }
    }, [say, items, ensureService]);

    // Escola bíblica › Setlist: a material at the end of the setlist.
    const addMaterial = useCallback(async (m) => {
        try {
            const sid = await ensureService();
            await keryx.entities.ServiceItem.create({ serviceId: sid, type: "MATERIAL", title: m.title, contentId: m.id, order: items.length, duration: 300 });
            say(`${m.title} adicionado ao fim da setlist.`);
        } catch (err) { say(err?.message || "Não foi possível adicionar."); }
    }, [ensureService, items, say]);

    // extra: a pedido's who sings and note (pedidoItem, Rodada Q S13).
    const addSong = useCallback(async (song, extra = {}) => {
        try {
            const sid = await ensureService();
            await keryx.entities.ServiceItem.create({ serviceId: sid, type: "SONG", title: song.title, contentId: song.id, order: items.length, duration: song.duration || defaultDuration("SONG", getPrefs()), ...extra });
            say(`${song.title} adicionada ao fim da setlist.`);
        } catch (err) { say(err?.message || "Não foi possível adicionar."); }
    }, [ensureService, items, say]);

    // What the operator writes in the Chat or notes with Novo pedido (S12,
    // S14): a row of the culto through the store, never a network action.
    const writeMessage = useCallback(async (fields) => {
        const sid = await ensureService();
        return keryx.entities.ServiceMessage.create({ serviceId: sid, ...fields });
    }, [ensureService]);

    // The Setlist's + (Seção…, Texto…, Timer…): right under the item in the
    // Prévia (`afterId`), at the end with none.
    const addRowToSetlist = useCallback(async (row, afterId = null) => {
        try {
            const sid = await ensureService();
            const sel = items.findIndex((x) => x.id === afterId);
            const at = sel >= 0 ? sel + 1 : items.length;
            for (let i = items.length - 1; i >= at; i--) await keryx.entities.ServiceItem.update(items[i].id, { order: i + 1 });
            await keryx.entities.ServiceItem.create({ serviceId: sid, order: at, enabled: true, ...row });
            say(`${row.title} na setlist.`);
        } catch (err) { say(err?.message || "Não foi possível adicionar."); }
    }, [ensureService, items, say]);

    // "Guardar no culto…" (U3 = A): the shared Setlist's items copied into a
    // culto (after its own); the Setlist stays as it is.
    const saveToCulto = useCallback(async (target) => {
        try {
            const culto = target || await keryx.entities.Service.create({ ...newServiceDefaults(getPrefs()), status: "DRAFT", service_type: "culto" });
            const have = await keryx.entities.ServiceItem.filter({ serviceId: culto.id });
            await keryx.entities.ServiceItem.bulkCreate(copyItems(items, culto.id, have.length));
            say(`${items.length} ${items.length === 1 ? "item guardado" : "itens guardados"} em “${culto.title || "Culto sem nome"}”.`);
        } catch (err) { say(err?.message || "Não foi possível guardar no culto."); }
    }, [items, say]);

    return { ensureService, setAutoplay, setAutoplayGap, pickServiceFundo, saveOperatorNotes, addStageToSetlist, addMaterial, addSong, writeMessage, addRowToSetlist, saveToCulto };
}
