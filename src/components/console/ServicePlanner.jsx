import React, { useEffect, useMemo, useRef, useState } from "react";
import { newServiceDefaults, defaultDuration, teamRole, localDate } from "@/lib/console/serviceDefaults";
import { getPrefs, usePrefs } from "@/hooks/useUser";
import { useChurch } from "@/hooks/useChurch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty, WinBar, rowKeyDown, SelectManyBtn, SelBar, RowMark } from "./kx";
import { useMultiSelect } from "./useMultiSelect";
import { pickedOf, selectionCount } from "@/lib/console/multiSelect";
import { takeOutManyQuestion } from "@/lib/console/bulkDelete";
import { keyHint } from "@/lib/console/keys";
import { menuItem } from "@/lib/console/menuLabels";
import { useContextMenu } from "./ContextMenu";
import useRowStep from "./useRowStep";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { takeOut, takeOutQuestion, takeOutMany } from "./setlistActions";
import useSortable from "./useSortable";
import { moveTo } from "@/lib/console/dropOrder";
import { parseReference, formatReference } from "@/lib/bibleBooks";
import { readChapter } from "@/lib/bibleText";
import { bibleVersionWanted } from "./BibleEnv";
import { parseDuration, formatDuration } from "@/lib/songImport";
import { exportServiceToPdf } from "@/utils/servicePdfExport";
import BgChip from "./library/BgChip";
import { CfgGroup, Switch } from "./settings/parts";
import { END_ACTIONS, END_LABEL, endChoice, GAPS, gapLabel } from "@/lib/console/autoplay";
import ThemeChip from "./library/ThemeChip";
import { lookOf, lookFields, lookForService, templateLookFields } from "@/lib/console/serviceLook";
import { plan, templateItems, itemsFor, statusOf, parseMember, clockAt, span, total, typeLabel, typeIcon, isSection, STATUS } from "@/lib/console/setlist";
import { useWinCol } from "./winLayout";
import { TabRow } from "./TabsPanel";
import { usePlaced } from "./Menu";
import { useServices } from "./useConsoleData";
import { PLANNER_TABS_KEY, NO_TABS, readTabs, pruneTabs, openTab, closeTab, tabLabel, lastService, cultosToOpen, duplicateFields } from "@/lib/console/plannerTabs";

const ADD = [
    ["SONG", "music", "Música"], ["BIBLE", "book", "Bíblia"], ["VIDEO", "film", "Vídeo"], ["AUDIO", "volume", "Áudio"],
    ["IMAGE", "image", "Imagem"], ["ANNOUNCEMENT", "megaphone", "Aviso"], ["TEXT", "text", "Texto"], ["TIMER", "clock", "Timer"], ["MATERIAL", "book", "Escola bíblica"], ["SECTION", "list", "Seção"],
];
const MEDIA_FOR = { VIDEO: ["video"], AUDIO: ["audio"], IMAGE: ["image", "gif", "pdf", "powerpoint"] };
const MEDIA_TYPE = { video: "VIDEO", audio: "AUDIO", image: "IMAGE", gif: "IMAGE", pdf: "PDF", powerpoint: "POWERPOINT" };
const match = (q, ...f) => !q || f.some((x) => String(x || "").toLowerCase().includes(q));
const today = () => localDate(new Date());

// The tabs open on this computer (plannerTabs.js); storage may refuse.
const loadTabs = () => { try { return readTabs(window.localStorage.getItem(PLANNER_TABS_KEY)); } catch { return NO_TABS; } };
const saveTabs = (tabs) => { try { window.localStorage.setItem(PLANNER_TABS_KEY, JSON.stringify(tabs)); } catch { /* this computer's convenience only */ } };

// Planejar o culto in tabs, as in a browser (owner 2026-10-21, Rodada O,
// O9 = A): one culto per tab, the (+) a new tab that chooses one, the tabs
// open kept on this computer. The tabs are for planning: switching them
// never changes the console's culto — its tab has a green dot, and "Usar no
// console" (a tab's right click) is the one door. Closing a tab never
// deletes the culto (Excluir culto… stays in the Culto panel). `openId`
// opens or brings forward that culto's tab (the console's Planejar, a deep
// link ?planner=<id>); `onFront` tells the window which tab is in front, so
// "Destacar em janela" opens on it (nav.js detachSpec).
export default function ServicePlanner({ c, data, openId = null, focusId = null, consoleServiceId = null, onUseOnConsole, active = true, onFront, onClose, escRef, onEditSong = null }) {
    const { services, loaded } = useServices();
    const [tabs, setTabs] = useState(() => openTab(loadTabs(), openId));
    // The new tab's chooser in front (none of the cultos' tabs is).
    const [choosing, setChoosing] = useState(false);
    // The item the console asked for opens once, in the tab it asked for.
    const [focus, setFocus] = useState(() => (openId && focusId ? { id: openId, item: focusId } : null));
    useEffect(() => { saveTabs(tabs); }, [tabs]);
    // A culto deleted here or on another computer: its tab closes.
    useEffect(() => { if (loaded) setTabs((t) => pruneTabs(t, services.map((s) => s.id))); }, [loaded, services]);
    const front = choosing || !tabs.active ? null : tabs.active;
    const frontRef = useRef(onFront);
    frontRef.current = onFront;
    useEffect(() => { if (active) frontRef.current?.(front); }, [front, active]);
    const menu = useContextMenu();
    const byId = useMemo(() => new Map(services.map((s) => [s.id, s])), [services]);

    const show = (id) => { setChoosing(false); setTabs((t) => openTab(t, id)); };
    // A culto chosen in the new tab takes the new tab's place, at the end.
    const showNew = (id) => { setChoosing(false); setTabs((t) => openTab(t.ids.includes(id) ? t : { ...t, active: null }, id)); };
    const close = (id) => {
        if (id === "new") { setChoosing(false); return; }
        setTabs((t) => closeTab(t, id));
    };
    const takeToConsole = (id) => {
        onUseOnConsole?.(id);
        c.say(`${tabLabel(byId.get(id))} passa a ser o culto do console.`);
    };
    const create = async (fields, message) => {
        try {
            const row = await keryx.entities.Service.create({ ...newServiceDefaults(getPrefs()), status: "DRAFT", service_type: "culto", ...fields });
            c.say(message);
            return row;
        } catch (err) { c.say(err?.message || "Não foi possível criar o culto."); return null; }
    };
    const newService = async () => {
        const row = await create({}, "Novo culto criado.");
        if (row?.id) showNew(row.id);
    };
    const last = lastService(services, today());
    const duplicateLast = async () => {
        if (!last) return;
        const row = await create(duplicateFields(last, newServiceDefaults(getPrefs())), `${tabLabel(last)} duplicado.`);
        if (!row?.id) return;
        const source = (await keryx.entities.ServiceItem.filter({ serviceId: last.id }, "order").catch(() => [])) || [];
        if (source.length) await keryx.entities.ServiceItem.bulkCreate(itemsFor(row.id, source, 0)).catch((err) => c.say(err?.message || "A setlist não foi copiada."));
        showNew(row.id);
    };

    // Esc: what the culto in front has open (the adder, a popover, a
    // selection), then the new tab, then the window. The Voltar chip
    // ("back") and the (x) ("all") leave at once — nothing to guard, the
    // planner saves as it goes. The console never ends the projection here.
    const innerEsc = useRef(null);
    if (escRef) escRef.current = (mode) => {
        if (mode !== "esc") onClose(mode === "all");
        else if (innerEsc.current?.()) return;
        else if (choosing && tabs.ids.length) setChoosing(false);
        else onClose();
    };

    const tabMenu = (e, t) => {
        if (t.id === "new") return;
        const onConsole = t.id === consoleServiceId;
        menu(e, { title: tabLabel(byId.get(t.id)), items: [
            { label: onConsole ? "Já é o culto do console" : "Usar no console", icon: "check", disabled: onConsole || !onUseOnConsole, onSelect: () => takeToConsole(t.id) },
            { label: "Fechar a aba", icon: "x", onSelect: () => close(t.id) },
        ] });
    };
    const tabList = tabs.ids.filter((id) => byId.has(id) || !loaded).map((id) => {
        const label = byId.has(id) ? tabLabel(byId.get(id)) : "…";
        const here = id === consoleServiceId;
        return { id, name: label, dot: here ? "é o culto do console" : null, title: here ? `${label} · é o culto do console` : `${label} · clique direito: Usar no console` };
    });
    if (choosing || !tabs.ids.length) tabList.push({ id: "new", name: "Nova aba", title: "Abrir ou criar um culto" });

    const bar = (
        <WinBar title="Planejar o culto" tools={<span className="pl-tabs">
            <TabRow label="Cultos abertos" tabs={tabList} active={front || "new"} onPick={(id) => (id === "new" ? setChoosing(true) : show(id))} onClose={close} onMenu={tabMenu} />
            <IconBtn name="plus" small title="Nova aba: abrir ou criar um culto" onClick={() => setChoosing(true)} />
        </span>} />
    );
    return (
        <>
            {bar}
            {front && byId.has(front)
                ? <CultoPlan key={front} c={c} services={services} serviceId={front} data={data} focusId={focus?.id === front ? focus.item : null} onFocused={() => setFocus(null)}
                    escRef={innerEsc} onEditSong={onEditSong} onDeleted={(id) => { if (id === consoleServiceId) onUseOnConsole?.(null); close(id); }} />
                : <NewTab services={services} loaded={loaded} open={tabs.ids} last={last} onNew={newService} onDuplicate={duplicateLast} onOpen={showNew} />}
        </>
    );
}

// The new tab (+): Novo culto, Duplicar the last culto, and the cultos not
// open yet (the mockup's O9 list).
function NewTab({ services, loaded, open, last, onNew, onDuplicate, onOpen }) {
    const rest = cultosToOpen(services, open, today());
    return (
        <div className="win-body">
            <div className="col center pl-newtab">
                <Panel noHead bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="kx-acts-list">
                        <Row single icon="plus" title="Novo culto" onClick={onNew} />
                        {last && <Row single icon="copy" title={`Duplicar ${tabLabel(last)}`} meta="a setlist, o papel de parede, o tema e a equipe; num dia novo" onClick={onDuplicate} />}
                    </div>
                    {rest.length > 0 && <div className="listhead"><span className="kx-section">Abrir um culto</span></div>}
                    <div className="kx-acts-list pl-newtab-list">
                        {rest.map((s) => <Row key={s.id} single icon="list" title={tabLabel(s)} onClick={() => onOpen(s.id)} />)}
                        {loaded && !services.length && <Empty icon="list" title="Nenhum culto ainda">Crie um culto para planejar a setlist.</Empty>}
                    </div>
                </Panel>
            </div>
        </div>
    );
}

// One culto's plan (canvas artboard 17), the tab in front: the culto and its
// team on the left, the Setlist on the right — sections (Pré-culto, Culto,
// Pós-culto), every kind of item, drag to reorder, notes and length per
// item, totals and the end time; templates (which keep each item's
// content), duplicating the previous culto, PDF. Everything saves as it
// changes; nothing here touches the screens.
function CultoPlan({ c, services, serviceId, data, focusId = null, onFocused, escRef, onEditSong = null, onDeleted }) {
    // The columns a splitter resizes, kept per page on this computer (Rodada D3).
    const colCulto = useWinCol("planner.culto", { name: "Culto", def: 360, min: 300, max: 640 });
    const church = useChurch();
    const client = useQueryClient();
    const svc = services.find((s) => s.id === serviceId) || null;
    useEffect(() => { if (focusId) onFocused?.(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    const prefs = usePrefs();
    const itemsKey = ["console", "serviceItems", serviceId];
    const items = (useQuery({ queryKey: itemsKey, queryFn: () => keryx.entities.ServiceItem.filter({ serviceId }, "order"), enabled: Boolean(serviceId) }).data || [])
        .slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const templates = useQuery({ queryKey: ["console", "serviceTemplates"], queryFn: () => keryx.entities.ServiceTemplate.list("name") }).data || [];
    // The culto's look (serviceLook.js, owner's review 2026-10-14): its
    // papel de parede and one theme from the library.
    const look = lookOf(svc);
    const team = useQuery({ queryKey: ["console", "worshipTeam"], queryFn: () => keryx.entities.WorshipTeam.list("name") }).data || [];
    // Configurações › Culto edits both lists while the planner stays open.
    useEffect(() => keryx.entities.ServiceTemplate.subscribe(() => client.invalidateQueries({ queryKey: ["console", "serviceTemplates"] })), [client]);
    useEffect(() => keryx.entities.WorshipTeam.subscribe(() => client.invalidateQueries({ queryKey: ["console", "worshipTeam"] })), [client]);
    const [form, setForm] = useState(null);
    const [member, setMember] = useState("");
    const [sel, setSel] = useState(focusId);
    const [adding, setAdding] = useState(null); // an ADD type
    const [pick, setPick] = useState("");
    const [pop, setPop] = useState(null); // "tpl" | "saveTpl"
    const [tplName, setTplName] = useState("");
    const ask = useConfirm();


    const [busy, setBusy] = useState("");

    useEffect(() => {
        if (!svc) return;
        setForm({ title: svc.title || "", date: svc.date || today(), startTime: svc.startTime || svc.time || "", location: svc.location || "", service_type: svc.service_type || "culto", event_description: svc.event_description || "", notes: svc.notes || "" });
    }, [svc?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const refresh = () => client.invalidateQueries({ queryKey: ["console", "serviceItems"] });
    const run = async (p, message) => {
        try { const r = await p; if (message) c.say(message); return r; } catch (err) { c.say(err?.message || "Não foi possível."); return null; } finally { refresh(); }
    };
    const saveSvc = (patch, message) => run(keryx.entities.Service.update(serviceId, patch), message);
    const commit = (key) => { if (form && (svc?.[key] ?? "") !== form[key]) saveSvc({ [key]: form[key] }); };

    const p = useMemo(() => plan({ ...svc, startTime: form?.startTime }, items), [svc, form?.startTime, items]);

    // -- Items ------------------------------------------------------------------
    const add = async (row) => {
        setAdding(null);
        setPick("");
        const created = await run(keryx.entities.ServiceItem.create({ serviceId, order: items.length, enabled: true, ...row }), `${row.title} na setlist.`);
        if (created?.id) setSel(created.id);
    };
    const renumber = async (list) => {
        for (const [i, it] of list.entries()) if (it.order !== i) await keryx.entities.ServiceItem.update(it.id, { order: i });
    };
    // A row dropped at a slot of the setlist, lit in gold while it is dragged
    // (useSortable; dropOrder.js).
    const sort = useSortable({ keys: items.map((it) => it.id), onDrop: (from, over) => { if (from >= 0) run(renumber(moveTo(items, from, over))); } });
    // Without dragging (C-16): the row's menu (Subir, Descer) and Alt+↑ /
    // Alt+↓ on a focused row; Enter or Space opens its details (Row).
    const step = useRowStep({ ids: items.map((it) => it.id), listRef: sort.listProps.ref, onMove: (from, over) => run(renumber(moveTo(items, from, over))) });
    const menu = useContextMenu();
    const updateItem = (id, patch) => run(keryx.entities.ServiceItem.update(id, patch));
    const duplicate = async (it) => {
        const at = items.findIndex((x) => x.id === it.id) + 1;
        const list = items.slice();
        const { id: _id, created_date: _c, updated_date: _u, created_by_id: _b, ...rest } = it;
        const copy = await keryx.entities.ServiceItem.create({ ...rest, title: `${it.title} (cópia)`, order: at });
        list.splice(at, 0, copy);
        await run(renumber(list), "Item duplicado.");
    };
    // Tirar da setlist: the same question and action as the console's
    // Setlist (setlistActions.js, 0.2.18).
    // Selecting several items (multiSelect.js, owner 2026-10-21): Ctrl/Shift +
    // click and "Selecionar vários" (the Setlist panel's header) mark; a plain
    // click still opens an item's details. Sections are headers: not marked.
    // A page of THE window: Esc clears it through escRef (register: false).
    const order = useMemo(() => items.filter((it) => !isSection(it)).map((it) => it.id), [items]);
    const allIds = useMemo(() => items.map((it) => it.id), [items]);
    const ms = useMultiSelect({ order, existing: allIds, mode: "air", register: false });
    const picked = pickedOf(ms.sel, items);
    const takeOutPicked = async () => {
        const rows = picked;
        if (!rows.length) return;
        if (rows.length === 1) { await removeItem(rows[0]); return; }
        if (!(await ask(takeOutManyQuestion(rows.map((it) => it.title || typeLabel(it.type)))))) return;
        setSel(null);
        ms.clear();
        await run(takeOutMany(rows), `${rows.length} itens tirados da setlist.`);
    };
    const removeItem = async (it) => {
        if (!(await ask(takeOutQuestion(it)))) return;
        setSel(null);
        await run(takeOut(it), isSection(it) ? "Seção tirada da setlist." : "Item tirado da setlist.");
    };

    // The Bible button: a reference ("Jo 3:16-21") becomes a passage item.
    const addBible = async (text) => {
        const r = parseReference(text);
        if (!r) { c.say("Referência não reconhecida. Ex.: Jo 3:16-21"); return; }
        setBusy("bible");
        try {
            // The edition chosen in the Bíblia (online when not installed, an
            // installed one when that fails).
            const got = await readChapter(bibleVersionWanted(), r.book, r.chapter);
            const version = got.version;
            const verses = r.verseStart ? got.verses.filter((v) => v.number >= r.verseStart && v.number <= (r.verseEnd || r.verseStart)) : got.verses;
            if (!verses.length) throw new Error(`${formatReference(r)} não existe na ${version}.`);
            const reference = formatReference(r);
            const row = await keryx.entities.BiblePassage.create({ reference: `${reference} · ${version}`, book: r.book, chapter: r.chapter, verses: r.verseStart ? `${r.verseStart}${r.verseEnd && r.verseEnd !== r.verseStart ? `-${r.verseEnd}` : ""}` : "", text: verses.map((v) => `${v.number} ${v.text}`).join("\n"), slides: verses.map((v) => ({ text: `${v.number} ${v.text}`, label: `v. ${v.number}` })), version });
            await add({ type: "BIBLE", title: reference, contentId: row.id, duration: Math.max(60, verses.length * 20) });
        } catch (err) { c.say(err?.message || "Não foi possível buscar a passagem."); }
        setBusy("");
    };

    // -- The whole service --------------------------------------------------------
    const fromTemplate = async (t) => {
        setPop(null);
        await run(keryx.entities.ServiceItem.bulkCreate(itemsFor(serviceId, t.items || [], items.length)), `Modelo "${t.name}" aplicado.`);
        // The template's look fills what the service has not chosen.
        const lookPatch = lookForService(svc, t);
        saveSvc({ ...(svc.templateId ? {} : { templateId: t.id }), ...(lookPatch || {}) });
    };
    const saveTemplate = async () => {
        const name = tplName.trim() || svc.title;
        setPop(null);
        await run(keryx.entities.ServiceTemplate.create({ name, items: templateItems(items), ...templateLookFields(lookOf(svc)) }), `Setlist salva como modelo "${name}".`);
    };
    const previous = services.filter((s) => s.id !== serviceId && (s.date || "") <= (svc?.date || "9999")).sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null;
    const duplicatePrevious = async () => {
        if (!previous) { c.say("Não há culto anterior para duplicar."); return; }
        const source = (await keryx.entities.ServiceItem.filter({ serviceId: previous.id }, "order")) || [];
        if (!source.length) { c.say(`${previous.title} não tem itens.`); return; }
        await run(keryx.entities.ServiceItem.bulkCreate(itemsFor(serviceId, source, items.length)), `Setlist de "${previous.title}" copiada.`);
    };
    // Its tab closes with it (and the console, when it was its culto, goes
    // back to its own choice).
    const deleteService = async () => {
        if (!(await ask(deleteQuestion("o culto", svc.title, "A setlist dele sai junto.")))) return;
        for (const it of items) await keryx.entities.ServiceItem.delete(it.id).catch(() => {});
        await run(keryx.entities.Service.delete(serviceId), "Culto excluído.");
        onDeleted?.(serviceId);
    };
    const addMember = () => {
        const m = parseMember(member);
        if (!m) return;
        const known = team.find((t) => t.name.toLowerCase() === m.member_name.toLowerCase());
        saveSvc({ worship_team: [...(svc.worship_team || []), { member_id: known?.id || "", ...m }] });
        setMember("");
    };

    // Esc comes routed from the console (keys.js ESC_ORDER "window", so
    // whatever is open over the planner closes first, and a field's Esc
    // already blurred) through the tabs' host: the adder, a popover, a
    // selection close here first (true = one did).
    if (escRef) escRef.current = () => {
        if (adding) setAdding(null);
        else if (pop) setPop(null);
        else if (ms.count || ms.picking) ms.clear();
        else return false;
        return true;
    };

    // The Culto panel's header (Rodada O, O7: what acts on the culto moves
    // from the window's bar into the page): the Modelos menu that gathers
    // the three template actions (Rodada C, fase b), and Exportar PDF.
    const popAnchor = useRef(null);
    const popRef = useRef(null);
    usePlaced(popRef, popAnchor, { open: Boolean(pop) });
    if (!svc || !form) return <div className="win-body" />;
    const cultoActions = (
        <>
            <span className="pl-popwrap" ref={popAnchor}>
                <Btn small on={pop === "tpl" || pop === "saveTpl"} onClick={() => setPop(pop ? null : "tpl")}>Modelos</Btn>
                {pop === "tpl" && (
                    <div className="kx-pop pl-pop is-placed" ref={popRef}>
                        <div className="listhead"><span className="kx-section">Criar a partir de modelo</span></div>
                        {templates.length
                            ? templates.map((t) => <Row key={t.id} single icon="list" title={t.name} time={`${(t.items || []).length} itens`} onClick={() => { setPop(null); fromTemplate(t); }} />)
                            : <div className="listhead"><span className="kx-meta">Nenhum modelo ainda: use Salvar como modelo.</span></div>}
                        <div className="listhead"><span className="kx-section">Este culto</span></div>
                        <Row single icon="save" title="Salvar como modelo…" meta={!items.length ? "a setlist está vazia" : undefined} onClick={() => { if (!items.length) return; setTplName(svc.title); setPop("saveTpl"); }} />
                        <Row single icon="copy" title="Duplicar o culto anterior" meta={previous ? `copia a setlist de ${previous.title}` : "não há culto anterior"} onClick={() => { if (!previous) return; setPop(null); duplicatePrevious(); }} />
                    </div>
                )}
                {pop === "saveTpl" && <div className="kx-pop pl-pop is-placed" ref={popRef}><div className="pl-pad"><Field icon={null} value={tplName} onChange={setTplName} placeholder="Nome do modelo" inputProps={{ autoFocus: true }} onKeyDown={(e) => { if (e.key === "Enter") saveTemplate(); }} /><Btn small kind="outline" onClick={saveTemplate}>Salvar modelo</Btn></div></div>}
            </span>
            <Btn small kind="outline" disabled={!items.length} onClick={() => run(exportServiceToPdf({ ...svc, ...form }, items, church), "PDF gerado.")}>Exportar PDF</Btn>
        </>
    );

    const f = (key) => ({ value: form[key], onChange: (v) => setForm({ ...form, [key]: v }), onBlur: () => commit(key), onKeyDown: (e) => { if (e.key === "Enter") e.currentTarget.blur(); } });
    const pickList = !adding ? [] : adding === "SONG"
        ? data.songs.filter((s) => match(pick.toLowerCase(), s.title, s.artist)).slice(0, 30).map((s) => ({ key: s.id, icon: "music", title: s.title, meta: s.artist, row: { type: "SONG", title: s.title, contentId: s.id, duration: s.duration || defaultDuration("SONG", getPrefs()) } }))
        : adding === "MATERIAL"
            ? (data.materials || []).filter((m) => match(pick.toLowerCase(), m.title, m.subject, m.class_name)).slice(0, 30).map((m) => ({ key: m.id, icon: "book", title: m.title, meta: [m.subject, m.class_name].filter(Boolean).join(" · ") || "Escola bíblica", row: { type: "MATERIAL", title: m.title, contentId: m.id, duration: 300 } }))
        : adding === "ANNOUNCEMENT"
            ? data.pieces.filter((x) => match(pick.toLowerCase(), x.title, x.text)).slice(0, 30).map((x) => ({ key: x.id, icon: "megaphone", title: x.title || x.text, meta: "Aviso", row: { type: "ANNOUNCEMENT", title: x.title || x.text || "Aviso", contentId: x.id, duration: x.duration || 60 } }))
            : MEDIA_FOR[adding]
                ? data.media.filter((m) => MEDIA_FOR[adding].includes(m.type) && match(pick.toLowerCase(), m.title)).slice(0, 30).map((m) => ({ key: m.id, icon: typeIcon(MEDIA_TYPE[m.type]), title: m.title, meta: typeLabel(MEDIA_TYPE[m.type]), row: { type: MEDIA_TYPE[m.type], title: m.title, contentId: m.id, duration: m.duration || (m.type === "video" || m.type === "audio" ? 180 : 30) } }))
                : [];
    const submitFree = () => {
        const t = pick.trim();
        if (adding === "BIBLE") return addBible(t);
        if (adding === "TEXT" && t) return add({ type: "TEXT", title: t, notes: t, duration: 60 });
        if (adding === "SECTION" && t) return add({ type: "SECTION", title: t, duration: 0 });
        if (adding === "TIMER") { const m = Math.max(1, Number(t) || 5); return add({ type: "TIMER", title: `Timer ${m} min`, duration: m * 60 }); }
        return null;
    };

    return (
        <>
            <div className="win-body">
            <div className="col" style={colCulto.style}>
                <Panel title="Culto" style={{ flex: "none" }} actions={cultoActions}>
                    <CfgGroup id="planner.culto" title="Dados" fold={false}>
                    <div className="frm pl-frm">
                        <span className="k">Nome</span><Field label="Nome" icon={null} {...f("title")} placeholder="Culto de domingo" />
                        <span className="k">Data</span><input type="date" className="pl-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} onBlur={() => commit("date")} aria-label="Data" />
                        <span className="k">Hora</span><input type="time" className="pl-input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} onBlur={() => commit("startTime")} aria-label="Hora de início" />
                        <span className="k">Local</span><Field label="Local" icon={null} {...f("location")} placeholder="Templo principal" />
                        <span className="k">Tipo</span><Seg small label="Tipo" value={form.service_type} onChange={(v) => { setForm({ ...form, service_type: v }); saveSvc({ service_type: v }); }} options={[["culto", "Culto"], ["evento", "Evento"]]} />
                        {form.service_type === "evento" && <><span className="k">Evento</span><Field label="Evento" icon={null} {...f("event_description")} placeholder="Descrição do evento" inputProps={{ spellCheck: true }} /></>}
                        <span className="k">Status</span><Seg small label="Status" value={statusOf(svc.status)} onChange={(v) => saveSvc({ status: v })} options={STATUS} />
                        <span className="k">Notas</span><Field label="Notas" icon={null} {...f("notes")} placeholder="Notas gerais do culto" inputProps={{ spellCheck: true }} />
                        {/* Setlist automática (Rodada N2): the switch of the Setlist's
                            header, and this culto's pause (none = the church's). */}
                        <span className="k">Avançar sozinho</span>
                        <div className="pl-auto">
                            <Switch on={Boolean(svc.autoplay)} label="Avançar sozinho: quando o item no ar termina, o próximo vai ao ar" onChange={(on) => saveSvc({ autoplay: on }, on ? "Avançar sozinho ligado." : "Avançar sozinho desligado.")} />
                            <select className="cfg-select pl-pick" aria-label="Pausa entre itens deste culto" title="Pausa entre itens: antes de o próximo item ir ao ar" value={svc.autoplay_gap == null ? "" : String(svc.autoplay_gap)}
                                onChange={(e) => { const v = e.target.value; saveSvc({ autoplay_gap: v === "" ? null : Number(v) }, v === "" ? "Pausa entre itens: a de Configurações › Culto." : `Pausa entre itens deste culto: ${gapLabel(Number(v)).toLowerCase()}.`); }}>
                                <option value="">Pausa padrão · {gapLabel(prefs.autoplay_gap).toLowerCase()}</option>
                                {GAPS.map((g) => <option key={g} value={String(g)}>{g ? `Pausa de ${g} s` : "Sem pausa"}</option>)}
                            </select>
                        </div>
                    </div>
                    </CfgGroup>
                    <CfgGroup id="planner.visual" title="Papel de parede e tema" summary={[look.background ? "papel de parede próprio" : "papel de parede de qualquer outro culto", look.theme_id ? "tema próprio" : "sem tema próprio"].join(" · ")}>
                    <div className="frm pl-frm">
                        <span className="k">Papel de parede</span>
                        <div className="pl-wall">
                            <BgChip value={look.background} title="Papel de parede do culto" empty="Qualquer outro culto" emptyHint="Sem papel de parede próprio: o culto usa o de qualquer outro culto (Configurações › Culto)" noneLabel={look.background ? "Sem papel de parede próprio (o de qualquer outro culto)" : undefined}
                                onPick={(spec) => saveSvc(lookFields({ ...look, background: spec }), spec ? "Papel de parede do culto salvo." : "O culto volta ao papel de parede da igreja.")} />
                        </div>
                        <span className="k">Tema do culto</span>
                        <div className="pl-wall">
                            <ThemeChip value={look.theme_id}
                                onPick={(id) => saveSvc({ theme_id: id }, id ? "Tema do culto salvo · fica em uso ao escolher o culto." : "O culto fica sem tema próprio.")} />
                        </div>
                    </div>
                    </CfgGroup>
                    <div className="pl-danger"><Btn small onClick={deleteService}>Excluir culto…</Btn></div>
                </Panel>
                <Panel title={<>Equipe <span className="kx-count">· {(svc.worship_team || []).length}</span></>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    {(svc.worship_team || []).map((m, i) => (
                        <Row key={`${m.member_name}${i}`} icon="user" title={m.member_name} meta={m.role}
                            actions={<IconBtn name="x" small title="Tirar da equipe" aria-label={`Tirar ${m.member_name} da equipe`} onClick={(e) => { e.stopPropagation(); saveSvc({ worship_team: svc.worship_team.filter((_, k) => k !== i) }); }} />} />
                    ))}
                    <div className="pl-pad">
                        <Field icon={null} value={member} onChange={setMember} placeholder="Nome · função (Enter adiciona)" inputProps={{ list: "pl-team" }} onKeyDown={(e) => { if (e.key === "Enter") addMember(); }} />
                        <datalist id="pl-team">{team.filter((t) => t.active !== false).map((t) => <option key={t.id} value={`${t.name} · ${teamRole(t.role)}`} />)}</datalist>
                    </div>
                </Panel>
            </div>
            {colCulto.split}
            <div className="col center">
                <Panel className="pl-setlist" title={<>Setlist <span className="kx-count">· {p.count} {p.count === 1 ? "item" : "itens"} · {total(p.seconds)} · termina às {clockAt(p.ends)}</span></>} actions={<SelectManyBtn on={ms.picking} onToggle={ms.setPicking} />} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className={`pl-list ${sort.sorting ? "is-sorting" : ""}`} {...sort.listProps} onKeyDown={(e) => ms.keyDown(e, { onDelete: takeOutPicked })}>
                        {!items.length && <Empty icon="list" title="Setlist vazia">Use os botões abaixo, um modelo, ou duplique o culto anterior.</Empty>}
                        {p.rows.map(({ item: it, at }, i) => {
                            // The rows around make room for a lit slot (useSortable,
                            // owner 2026-10-15); an open item drags with its details.
                            const dragProps = { ...sort.rowProps(i, { label: it.title || typeLabel(it.type), icon: isSection(it) ? "list" : typeIcon(it.type), time: isSection(it) ? (p.sections[i]?.seconds ? total(p.sections[i].seconds) : "") : it.duration ? span(it.duration) : "" }), style: sort.rowStyle(i) };
                            if (isSection(it)) {
                                const sec = p.sections[i] || { count: 0, seconds: 0 };
                                return (
                                    <div key={it.id} className={`kx-row pl-sec ${sel === it.id ? "is-selected" : ""}`} role="button" tabIndex={0} aria-label={`Seção ${it.title}`}
                                        onClick={() => setSel(sel === it.id ? null : it.id)} onKeyDown={rowKeyDown(() => setSel(sel === it.id ? null : it.id), step.onKey(i))}
                                        onContextMenu={(e) => menu(e, { title: it.title, items: [{ label: "Tirar a seção…", icon: "x", onSelect: () => removeItem(it) }, ...step.menuItems(i)] })}
                                        {...dragProps} {...step.rowAttrs(i)}>
                                        <span className="kx-glyph" title="Arraste para reordenar"><Icon name="grip" /></span>
                                        <span className="kx-section">{it.title}</span><span className="kx-count"> · {sec.count} {sec.count === 1 ? "item" : "itens"} · {total(sec.seconds)}</span>
                                        <span style={{ flex: 1 }} />
                                        <span className="kx-row-acts"><IconBtn name="x" small title="Tirar a seção…" onClick={(e) => { e.stopPropagation(); removeItem(it); }} /></span>
                                    </div>
                                );
                            }
                            const open = sel === it.id;
                            return (
                                <div key={it.id} className="pl-sortrow" {...dragProps}>
                                    <Row className={`pl-item ${it.enabled === false ? "is-done" : ""}`} state={`${open ? "is-selected" : ""} ${ms.has(it.id) ? "is-marked" : ""}`} expanded={open}
                                        lead={<>{ms.picking && <RowMark />}<span className="kx-glyph" title="Arraste para reordenar"><Icon name="grip" /></span></>}
                                        icon={typeIcon(it.type)} title={it.title}
                                        meta={[typeLabel(it.type), it.enabled === false ? "desativado" : "", endChoice(it) === "loop" ? "repete" : endChoice(it) === "stop" ? "para ao terminar" : "", it.notes && it.type !== "TEXT" ? it.notes : ""].filter(Boolean).join(" · ")}
                                        onClick={(e) => { if (!ms.click(it.id, e)) setSel(open ? null : it.id); }} onKey={step.onKey(i)} dragProps={step.rowAttrs(i)}
                                        onContextMenu={(e) => (picked.length > 1 && ms.has(it.id) ? menu(e, { title: selectionCount(picked.length), items: [
                                            menuItem("tirar", { label: `Tirar ${picked.length} da setlist…`, kbd: keyHint("delete"), onSelect: takeOutPicked }),
                                            { label: "Limpar a seleção", icon: "x", onSelect: ms.clear },
                                        ] }) : menu(e, { title: it.title, items: [
                                            { label: open ? "Fechar os detalhes" : "Abrir os detalhes", icon: "edit", onSelect: () => setSel(open ? null : it.id) },
                                            { label: it.enabled === false ? "Ativar" : "Desativar", onSelect: () => updateItem(it.id, { enabled: it.enabled === false }) },
                                            { label: "Duplicar", icon: "copy", onSelect: () => duplicate(it) },
                                            { label: "Tirar da setlist…", icon: "x", onSelect: () => removeItem(it) },
                                            ...step.menuItems(i),
                                        ] }))}>
                                        <span className="kx-row-time">{at != null ? clockAt(at) : ""}<br />{it.duration ? span(it.duration) : ""}</span>
                                    </Row>
                                    {open && (
                                        <div className="pl-detail">
                                            <div className="frm pl-frm">
                                                <span className="k">Título</span><input key={`t${it.id}${it.title}`} className="pl-input" defaultValue={it.title} aria-label="Título" onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.title) updateItem(it.id, { title: v }); }} />
                                                <span className="k">Duração</span><input key={`d${it.id}${it.duration}`} className="pl-input pl-dur" defaultValue={formatDuration(it.duration)} placeholder="m:ss" aria-label="Duração" onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} onBlur={(e) => { const s = parseDuration(e.target.value); if (s !== null && s !== it.duration) updateItem(it.id, { duration: s }); }} />
                                                <span className="k">Ao terminar</span><Seg small label="Ao terminar" value={endChoice(it)} options={END_ACTIONS.map((a) => [a, END_LABEL[a]])} onChange={(a) => updateItem(it.id, { end_action: a })} />
                                                <span className="k">{it.type === "TEXT" ? "Texto" : "Notas"}</span>
                                                <textarea className="ed-text" style={{ height: 64 }} defaultValue={it.notes || ""} onBlur={(e) => { if (e.target.value !== (it.notes || "")) updateItem(it.id, { notes: e.target.value }); }} placeholder={it.type === "TEXT" ? "O texto que vai para a tela" : "Para o operador e o Palco (ex.: intro longa)"} />
                                            </div>
                                            <div className="pl-detail-acts">
                                                {it.type === "SONG" && it.contentId && onEditSong && <Btn small onClick={() => onEditSong(it.contentId)} title="Letra, dados e estilo, na mesma janela · Voltar traz o culto de volta">Editar a música…</Btn>}
                                                <Btn small onClick={() => updateItem(it.id, { enabled: it.enabled === false })}>{it.enabled === false ? "Ativar" : "Desativar"}</Btn>
                                                <Btn small onClick={() => duplicate(it)}>Duplicar</Btn>
                                                <Btn small onClick={() => removeItem(it)}>Tirar da setlist…</Btn>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        {items.length > 0 && <div className="rund-tail" data-sort-tail="" />}
                    </div>
                    <SelBar count={picked.length} onClear={ms.clear}>
                        <Btn small onClick={takeOutPicked} title={`Tirar da setlist · ${keyHint("delete")}`}>Tirar da setlist…</Btn>
                    </SelBar>
                    {adding && (
                        <div className="pl-adder">
                            <div className="pl-adder-h">
                                <span className="kx-section">Adicionar · {ADD.find(([t]) => t === adding)?.[2]}</span>
                                <span style={{ flex: 1 }} />
                                <IconBtn name="x" small title="Fechar" onClick={() => setAdding(null)} />
                            </div>
                            <div className="pl-pad">
                                <Field value={pick} onChange={setPick} inputProps={{ autoFocus: true }} placeholder={{ BIBLE: "Referência (ex.: Jo 3:16-21) · Enter", TEXT: "O texto · Enter", SECTION: "Nome da seção (ex.: Pré-culto) · Enter", TIMER: "Minutos (ex.: 5) · Enter" }[adding] || "Buscar"} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (pickList[0]) add(pickList[0].row); else submitFree(); } }} />
                                {busy === "bible" && <span className="kx-meta">Buscando a passagem…</span>}
                            </div>
                            <div className="pl-adder-list">
                                {pickList.map((r) => <Row key={r.key} icon={r.icon} title={r.title} meta={r.meta} onClick={() => add(r.row)} />)}
                                {!["BIBLE", "TEXT", "SECTION", "TIMER"].includes(adding) && !pickList.length && <Empty title="Nada encontrado">{adding === "SONG" ? "Cadastre a música na Biblioteca › Letras." : adding === "MATERIAL" ? "Crie o material em Escola bíblica (menu KERYX)." : adding === "ANNOUNCEMENT" ? "Crie o aviso em Comunicação." : "Adicione o arquivo na Biblioteca › Mídia."}</Empty>}
                            </div>
                        </div>
                    )}
                    <div className="pl-add" role="group" aria-label="Adicionar à setlist">
                        <span className="kx-meta pl-add-k">Adicionar:</span>
                        {ADD.map(([t, icon, label]) => <Btn key={t} on={adding === t} onClick={() => { setAdding(adding === t ? null : t); setPick(""); }}><Icon name={icon} />{label}</Btn>)}
                    </div>
                </Panel>
            </div>
            </div>
        </>
    );
}
