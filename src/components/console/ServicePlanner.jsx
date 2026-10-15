import React, { useEffect, useMemo, useState } from "react";
import { newServiceDefaults, defaultDuration, teamRole } from "@/lib/console/serviceDefaults";
import { getPrefs } from "@/hooks/useUser";
import { useChurch } from "@/hooks/useChurch";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty, WinBar } from "./kx";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { parseReference, formatReference } from "@/lib/bibleBooks";
import { readChapter } from "@/lib/bibleText";
import { bibleVersionWanted } from "./BibleEnv";
import { parseDuration, formatDuration } from "@/lib/songImport";
import { exportServiceToPdf } from "@/utils/servicePdfExport";
import BgChip from "./library/BgChip";
import ThemeChip from "./library/ThemeChip";
import { lookOf, lookFields, lookForService, templateLookFields } from "@/lib/console/serviceLook";
import { plan, templateItems, itemsFor, statusOf, parseMember, clockAt, span, total, typeLabel, typeIcon, isSection, STATUS } from "@/lib/console/setlist";

const ADD = [
    ["SONG", "music", "Música"], ["BIBLE", "book", "Bíblia"], ["VIDEO", "film", "Vídeo"], ["AUDIO", "volume", "Áudio"],
    ["IMAGE", "image", "Imagem"], ["ANNOUNCEMENT", "megaphone", "Aviso"], ["TEXT", "text", "Texto"], ["TIMER", "clock", "Timer"], ["MATERIAL", "book", "EBD"], ["SECTION", "list", "Seção"],
];
const MEDIA_FOR = { VIDEO: ["video"], AUDIO: ["audio"], IMAGE: ["image", "gif", "pdf", "powerpoint"] };
const MEDIA_TYPE = { video: "VIDEO", audio: "AUDIO", image: "IMAGE", gif: "IMAGE", pdf: "PDF", powerpoint: "POWERPOINT" };
const match = (q, ...f) => !q || f.some((x) => String(x || "").toLowerCase().includes(q));
const today = () => { const d = new Date(); const two = (n) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`; };

// The service planner (canvas artboard 17), inside the console: the culto
// and its team on the left, the Setlist on the right — sections (Pré-culto,
// Culto, Pós-culto), every kind of item, drag to reorder, notes and length
// per item, totals and the end time; templates (which now keep each item's
// content), duplicating the last culto, PDF. Everything saves as it changes;
// nothing here touches the screens.
export default function ServicePlanner({ c, services, serviceId, setServiceId, data, focusId = null, onClose, escRef, onEditSong = null }) {
    const church = useChurch();
    const client = useQueryClient();
    const svc = services.find((s) => s.id === serviceId) || null;
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
    const [confirm, setConfirm] = useState(null);
    const ask = useConfirm();
    const [drag, setDrag] = useState(null);
    const [over, setOver] = useState(null);
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
    const reorder = async (fromId, toIdx) => {
        const list = items.slice();
        const from = list.findIndex((i) => i.id === fromId);
        if (from < 0) return;
        const [moved] = list.splice(from, 1);
        list.splice(toIdx > from ? toIdx - 1 : toIdx, 0, moved);
        await run(renumber(list));
    };
    const updateItem = (id, patch) => run(keryx.entities.ServiceItem.update(id, patch));
    const duplicate = async (it) => {
        const at = items.findIndex((x) => x.id === it.id) + 1;
        const list = items.slice();
        const { id: _id, created_date: _c, updated_date: _u, created_by_id: _b, ...rest } = it;
        const copy = await keryx.entities.ServiceItem.create({ ...rest, title: `${it.title} (cópia)`, order: at });
        list.splice(at, 0, copy);
        await run(renumber(list), "Item duplicado.");
    };
    const removeItem = async (it) => {
        if (confirm !== `item:${it.id}`) { setConfirm(`item:${it.id}`); c.say(`Clique de novo para tirar "${it.title}" da setlist.`); return; }
        setConfirm(null);
        setSel(null);
        await run(keryx.entities.ServiceItem.delete(it.id).then(() => renumber(items.filter((x) => x.id !== it.id))), "Item removido.");
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
    const newService = async () => {
        const row = await run(keryx.entities.Service.create({ ...newServiceDefaults(getPrefs()), status: "DRAFT", service_type: "culto" }), "Novo culto criado.");
        if (row?.id) setServiceId(row.id);
    };
    const deleteService = async () => {
        if (!(await ask(deleteQuestion("o culto", svc.title, "A setlist dele sai junto.")))) return;
        for (const it of items) await keryx.entities.ServiceItem.delete(it.id).catch(() => {});
        await run(keryx.entities.Service.delete(serviceId), "Culto excluído.");
        setServiceId(null);
        onClose();
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
    // already blurred): close the adder or a popover, then leave. The
    // Voltar chip ("back") and the (x) ("all") leave at once — nothing to
    // guard, the planner saves as it goes. The console never ends the
    // projection from here.
    if (escRef) escRef.current = (mode) => { if (mode !== "esc") onClose(mode === "all"); else if (adding) setAdding(null); else if (pop) setPop(null); else onClose(); };

    // The bar: the culto picker, and the Modelos menu that gathers the
    // three template actions the setlist header used to spread out
    // (Rodada C, fase b).
    const bar = (
        <WinBar title="Planejar o culto" tools={svc && form ? <>
            <select className="cfg-select pl-pick" value={serviceId} onChange={(e) => setServiceId(e.target.value)} aria-label="Escolher culto">
                {services.map((s) => <option key={s.id} value={s.id}>{s.title}{s.date ? ` · ${s.date.split("-").reverse().slice(0, 2).join("/")}` : ""}</option>)}
            </select>
            <IconBtn name="plus" small title="Novo culto" onClick={newService} />
        </> : null} actions={svc && form ? <>
            <span className="pl-popwrap">
                <Btn small on={pop === "tpl" || pop === "saveTpl"} onClick={() => setPop(pop ? null : "tpl")}>Modelos</Btn>
                {pop === "tpl" && (
                    <div className="kx-pop pl-pop">
                        <div className="listhead"><span className="kx-section">Criar a partir de modelo</span></div>
                        {templates.length
                            ? templates.map((t) => <Row key={t.id} single icon="list" title={t.name} time={`${(t.items || []).length} itens`} onClick={() => { setPop(null); fromTemplate(t); }} />)
                            : <div className="listhead"><span className="kx-meta">Nenhum modelo ainda: use Salvar como modelo.</span></div>}
                        <div className="listhead"><span className="kx-section">Este culto</span></div>
                        <Row single icon="save" title="Salvar como modelo…" meta={!items.length ? "a setlist está vazia" : undefined} onClick={() => { if (!items.length) return; setTplName(svc.title); setPop("saveTpl"); }} />
                        <Row single icon="copy" title="Duplicar o culto anterior" meta={previous ? `copia a setlist de ${previous.title}` : "não há culto anterior"} onClick={() => { if (!previous) return; setPop(null); duplicatePrevious(); }} />
                    </div>
                )}
                {pop === "saveTpl" && <div className="kx-pop pl-pop"><div className="pl-pad"><Field icon={null} value={tplName} onChange={setTplName} placeholder="Nome do modelo" inputProps={{ autoFocus: true }} onKeyDown={(e) => { if (e.key === "Enter") saveTemplate(); }} /><Btn small kind="outline" onClick={saveTemplate}>Salvar modelo</Btn></div></div>}
            </span>
            <Btn small kind="outline" disabled={!items.length} onClick={() => run(exportServiceToPdf({ ...svc, ...form }, items, church), "PDF gerado.")}>Exportar PDF</Btn>
        </> : null} />
    );
    if (!svc || !form) {
        return (
            <>
            {bar}
            <div className="win-body">
            <div className="col center"><Panel noHead>
                <Empty icon="list" title={services.length ? "Escolha um culto" : "Nenhum culto ainda"}>Crie um culto para planejar a setlist.</Empty>
                <div className="pl-pad">
                    {services.slice(0, 12).map((s) => <Row key={s.id} single icon="list" title={s.title} time={s.date ? s.date.split("-").reverse().slice(0, 2).join("/") : ""} onClick={() => setServiceId(s.id)} />)}
                    <Btn kind="brand" onClick={newService}><Icon name="plus" />Novo culto</Btn>
                </div>
            </Panel></div>
            </div>
            </>
        );
    }

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
            {bar}
            <div className="win-body">
            <div className="col" style={{ flex: "0 1 360px", minWidth: 300, gap: "var(--gutter)" }}>
                <Panel title="Culto" style={{ flex: "none" }}>
                    <div className="frm pl-frm">
                        <span className="k">Nome</span><Field icon={null} {...f("title")} placeholder="Culto de domingo" />
                        <span className="k">Data</span><input type="date" className="pl-input" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} onBlur={() => commit("date")} aria-label="Data" />
                        <span className="k">Hora</span><input type="time" className="pl-input" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} onBlur={() => commit("startTime")} aria-label="Hora de início" />
                        <span className="k">Local</span><Field icon={null} {...f("location")} placeholder="Templo principal" />
                        <span className="k">Tipo</span><Seg small value={form.service_type} onChange={(v) => { setForm({ ...form, service_type: v }); saveSvc({ service_type: v }); }} options={[["culto", "Culto"], ["evento", "Evento"]]} />
                        {form.service_type === "evento" && <><span className="k">Evento</span><Field icon={null} {...f("event_description")} placeholder="Descrição do evento" /></>}
                        <span className="k">Status</span><Seg small value={statusOf(svc.status)} onChange={(v) => saveSvc({ status: v })} options={STATUS} />
                        <span className="k">Notas</span><Field icon={null} {...f("notes")} placeholder="Notas gerais do culto" />
                        <span className="k">Papel de parede</span>
                        <div className="pl-wall">
                            <BgChip value={look.background} title="Papel de parede do culto" empty="o de qualquer outro culto" noneLabel={look.background ? "Sem papel de parede próprio (o de qualquer outro culto)" : undefined}
                                onPick={(spec) => saveSvc(lookFields({ ...look, background: spec }), spec ? "Papel de parede do culto salvo." : "O culto volta ao papel de parede da igreja.")} />
                        </div>
                        <span className="k">Tema do culto</span>
                        <div className="pl-wall">
                            <ThemeChip value={look.theme_id} now={c.now}
                                onPick={(id) => saveSvc({ theme_id: id }, id ? "Tema do culto salvo · fica em uso ao escolher o culto." : "O culto fica sem tema próprio.")} />
                        </div>
                    </div>
                    <div className="pl-danger"><Btn small onClick={deleteService}>Excluir culto…</Btn></div>
                </Panel>
                <Panel title={<>Equipe <span className="kx-count">· {(svc.worship_team || []).length}</span></>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    {(svc.worship_team || []).map((m, i) => (
                        <Row key={`${m.member_name}${i}`} icon="user" title={m.member_name} meta={m.role}
                            actions={<IconBtn name="x" small title="Tirar da equipe" onClick={(e) => { e.stopPropagation(); saveSvc({ worship_team: svc.worship_team.filter((_, k) => k !== i) }); }} />} />
                    ))}
                    <div className="pl-pad">
                        <Field icon={null} value={member} onChange={setMember} placeholder="Nome · função (Enter adiciona)" inputProps={{ list: "pl-team" }} onKeyDown={(e) => { if (e.key === "Enter") addMember(); }} />
                        <datalist id="pl-team">{team.filter((t) => t.active !== false).map((t) => <option key={t.id} value={`${t.name} · ${teamRole(t.role)}`} />)}</datalist>
                    </div>
                </Panel>
            </div>
            <div className="kx-gap" />
            <div className="col center">
                <Panel className="pl-setlist" title={<>Setlist <span className="kx-count">· {p.count} {p.count === 1 ? "item" : "itens"} · {total(p.seconds)} · termina às {clockAt(p.ends)}</span></>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="pl-list">
                        {!items.length && <Empty icon="list" title="Setlist vazia">Use os botões abaixo, um modelo, ou duplique o culto anterior.</Empty>}
                        {p.rows.map(({ item: it, at }, i) => {
                            const dragProps = {
                                draggable: true,
                                onDragStart: (e) => { setDrag(it.id); e.dataTransfer.effectAllowed = "move"; },
                                onDragEnd: () => { setDrag(null); setOver(null); },
                                onDragOver: (e) => { if (!drag) return; e.preventDefault(); setOver(i); },
                                onDrop: (e) => { e.preventDefault(); if (drag) reorder(drag, i); setDrag(null); setOver(null); },
                            };
                            const stateCls = `${drag === it.id ? "is-dragging" : ""} ${over === i && drag && drag !== it.id ? "is-dropbefore" : ""}`;
                            if (isSection(it)) {
                                const sec = p.sections[i] || { count: 0, seconds: 0 };
                                return (
                                    <div key={it.id} className={`kx-row pl-sec ${stateCls} ${sel === it.id ? "is-selected" : ""}`} onClick={() => setSel(sel === it.id ? null : it.id)} {...dragProps}>
                                        <span className="kx-glyph" title="Arraste para reordenar"><Icon name="grip" /></span>
                                        <span className="kx-section">{it.title}</span><span className="kx-count"> · {sec.count} {sec.count === 1 ? "item" : "itens"} · {total(sec.seconds)}</span>
                                        <span style={{ flex: 1 }} />
                                        <span className="kx-row-acts"><IconBtn name="x" small title="Tirar a seção" onClick={(e) => { e.stopPropagation(); removeItem(it); }} /></span>
                                    </div>
                                );
                            }
                            const open = sel === it.id;
                            return (
                                <React.Fragment key={it.id}>
                                    <div className={`kx-row pl-item ${stateCls} ${open ? "is-selected" : ""} ${it.enabled === false ? "is-done" : ""}`} onClick={() => setSel(open ? null : it.id)} {...dragProps}>
                                        <span className="kx-glyph" title="Arraste para reordenar"><Icon name="grip" /></span>
                                        <span className="kx-glyph"><Icon name={typeIcon(it.type)} /></span>
                                        <div className="kx-row-main"><div className="kx-row-title">{it.title}</div><div className="kx-row-meta">{[typeLabel(it.type), it.enabled === false ? "desativado" : "", it.notes && it.type !== "TEXT" ? it.notes : ""].filter(Boolean).join(" · ")}</div></div>
                                        <span className="kx-row-time">{at != null ? clockAt(at) : ""}<br />{it.duration ? span(it.duration) : ""}</span>
                                    </div>
                                    {open && (
                                        <div className="pl-detail">
                                            <div className="frm pl-frm">
                                                <span className="k">Título</span><input key={`t${it.id}${it.title}`} className="pl-input" defaultValue={it.title} aria-label="Título" onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== it.title) updateItem(it.id, { title: v }); }} />
                                                <span className="k">Duração</span><input key={`d${it.id}${it.duration}`} className="pl-input pl-dur" defaultValue={formatDuration(it.duration)} placeholder="m:ss" aria-label="Duração" onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} onBlur={(e) => { const s = parseDuration(e.target.value); if (s !== null && s !== it.duration) updateItem(it.id, { duration: s }); }} />
                                                <span className="k">{it.type === "TEXT" ? "Texto" : "Notas"}</span>
                                                <textarea className="ed-text" style={{ height: 64 }} defaultValue={it.notes || ""} onBlur={(e) => { if (e.target.value !== (it.notes || "")) updateItem(it.id, { notes: e.target.value }); }} placeholder={it.type === "TEXT" ? "O texto que vai para a tela" : "Para o operador e o Palco (ex.: intro longa)"} />
                                            </div>
                                            <div className="pl-detail-acts">
                                                {it.type === "SONG" && it.contentId && onEditSong && <Btn small onClick={() => onEditSong(it.contentId)} title="Letra, dados e estilo, na mesma janela · Voltar traz o culto de volta">Editar a música…</Btn>}
                                                <Btn small onClick={() => updateItem(it.id, { enabled: it.enabled === false })}>{it.enabled === false ? "Ativar" : "Desativar"}</Btn>
                                                <Btn small onClick={() => duplicate(it)}>Duplicar</Btn>
                                                <Btn small kind={confirm === `item:${it.id}` ? "air" : ""} onClick={() => removeItem(it)}>{confirm === `item:${it.id}` ? "Tirar mesmo" : "Tirar da setlist"}</Btn>
                                            </div>
                                        </div>
                                    )}
                                </React.Fragment>
                            );
                        })}
                        {items.length > 0 && <div className={`rund-tail ${over === items.length ? "is-dropend" : ""}`} onDragOver={(e) => { if (!drag) return; e.preventDefault(); setOver(items.length); }} onDrop={(e) => { e.preventDefault(); if (drag) reorder(drag, items.length); setDrag(null); setOver(null); }} />}
                    </div>
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
                    <div className="pl-add">
                        {ADD.map(([t, icon, label]) => <Btn key={t} kind={t === "SONG" ? "outline" : ""} on={adding === t} onClick={() => { setAdding(adding === t ? null : t); setPick(""); }}><Icon name={icon} />{label}</Btn>)}
                    </div>
                </Panel>
            </div>
            </div>
        </>
    );
}
