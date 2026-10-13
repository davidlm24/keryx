import React, { useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "../console/Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty } from "../console/kx";
import { Switch } from "../console/settings/parts";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import { mainLayer } from "@shared/live-state.mjs";
import {
    ELEMENT_TYPES, ELEMENT_GROUPS, LOOK_TYPES, LAYOUT_CATEGORIES, WHEN, FONTS, ALIGNS, VALIGNS, SIZE_RANGE, MAX_ELEMENTS, typeOf,
    normalizeLayout, newLayout, newElement, duplicateLayout, findLayout, layoutFields, snapRect, resizeRect, moveRect, reorderElement,
} from "@/lib/layouts";
import { useLayoutRows } from "@/hooks/useLayout";
import { useOutputPrefRows } from "@/hooks/useOutputPref";
import { PREF_OUTPUTS, outputLook, normalizePref, prefState, prefVars } from "@/lib/outputPrefs";
import { useChurch } from "@/hooks/useChurch";
import { sampleLive, SAMPLE_ITEMS } from "../console/settings/sample";

const DIMS = [["0.5", "Pouco"], ["0.72", "Médio"], ["0.9", "Muito"]];
const COUNTS = [["1", "1"], ["2", "2"], ["3", "3"], ["5", "5"], ["8", "8"]];
const HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// The outputs a layout can be put on, from here (every page with settings
// but Transmissão), with their names (the operator's, else the factory's).
const USE_ON = [...PREF_OUTPUTS, "/StageView", "/PastorView"];

// The layout half of the Editor de temas e layouts (its own window,
// src/pages/Editor.jsx): a 16:9 canvas where the operator places the
// elements of a stage monitor or the pastor's tablet (src/lib/layouts.js)
// — drag to move, handles to resize, a magnet to the edges, the centre and
// the other elements (Alt ignores it), arrows nudge 1 % (Shift 5 %) — the
// elements and the selected one's look on the left, the canvas drawn by
// LayoutRenderer itself on the right, with what is on air or a sample.
// Saving changes the library only; "Usar em…" puts the layout on an output
// (OutputPref.layout_id), and a `forPath` (the output whose tab opened the
// editor, ?for=) is bound on the first save. Switching to another layout
// happens in the header select, without leaving the window (`onSwitch`).
export default function LayoutEditor({ say, live: liveState, now, layoutId, forPath = "", media = [], themes = [], onClose, onSaved, onSwitch }) {
    const rows = useLayoutRows();
    const prefRows = useOutputPrefRows();
    const church = useChurch();
    const isNew = layoutId === "new" || String(layoutId).startsWith("factory:");
    const [draft, setDraft] = useState(() => (layoutId === "new" ? newLayout("palco") : null));
    const [saved, setSaved] = useState(null);
    const [error, setError] = useState("");
    const [sel, setSel] = useState(null);
    const [adding, setAdding] = useState(false);
    const [confirm, setConfirm] = useState(null); // "delete" | "discard"
    const [busy, setBusy] = useState(false);
    const [source, setSource] = useState("auto"); // "auto" | "sample"
    // Ver como: which output's real context the canvas previews with — its
    // Mostrar, theme, Escala e Margens (renderer outputs, via prefState and
    // the kp-out vars), or its Escala (Palco and Pastor). "" is the bare
    // canvas, as before.
    const [viewAs, setViewAs] = useState(() => (USE_ON.includes(forPath) ? forPath : ""));
    const [guides, setGuides] = useState([]);
    const [pickImage, setPickImage] = useState(false);
    const fileRef = useRef(null);
    const screenRef = useRef(null);
    const drag = useRef(null);
    const loaded = useRef(false);

    // The row (or the factory layout, which opens as a copy of its own).
    useEffect(() => {
        if (layoutId === "new" || loaded.current) return undefined;
        if (String(layoutId).startsWith("factory:")) {
            const f = findLayout(layoutId, []);
            if (!f) { setError("Modelo não encontrado."); return undefined; }
            loaded.current = true;
            setDraft(duplicateLayout(f));
            return undefined;
        }
        let alive = true;
        keryx.entities.ScreenLayout.get(layoutId)
            .then((row) => { if (!alive) return; loaded.current = true; const l = normalizeLayout(row); setDraft(l); setSaved(l); })
            .catch((err) => { if (alive) setError(err?.message || "Layout não encontrado."); });
        return () => { alive = false; };
    }, [layoutId]);

    const dirty = useMemo(() => draft && !sameJson(layoutFields(draft), saved ? layoutFields(saved) : null), [draft, saved]);
    const set = (patch) => { setConfirm(null); setDraft((d) => ({ ...d, ...patch })); };
    const setEl = (id, patch) => setDraft((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
    const setProp = (id, k, v) => setDraft((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, props: { ...e.props, [k]: v } } : e)) }));
    const selected = draft?.elements.find((e) => e.id === sel) || null;

    const add = (type) => {
        if (draft.elements.length >= MAX_ELEMENTS) { say(`Um layout tem no máximo ${MAX_ELEMENTS} elementos.`); return; }
        const e = newElement(type);
        set({ elements: [...draft.elements, e] });
        setSel(e.id);
        setAdding(false);
    };
    const remove = (id) => { set({ elements: draft.elements.filter((e) => e.id !== id) }); if (sel === id) setSel(null); };
    const duplicateEl = (el) => {
        if (draft.elements.length >= MAX_ELEMENTS) return;
        const copy = newElement(el.type);
        const e = { ...el, id: copy.id, ...moveRect(el, 3, 3) };
        set({ elements: [...draft.elements, e] });
        setSel(e.id);
    };

    // Saves and returns the saved row (null when it could not), so Usar em…
    // and the ?for= binding work in the same breath — no remount, no stale
    // closure (the old console view remounted on save and silently lost the
    // assignment).
    const save = async () => {
        if (!draft.name.trim()) { say("Dê um nome ao layout."); return null; }
        setBusy(true);
        try {
            const first = isNew && !saved;
            const fields = layoutFields(normalizeLayout(draft));
            const row = first ? await keryx.entities.ScreenLayout.create(fields) : await keryx.entities.ScreenLayout.update(saved.id, fields);
            const l = normalizeLayout(row);
            setSaved(l);
            setDraft((d) => ({ ...d, id: l.id }));
            // Opened from an output's tab ("Novo layout no canvas", ?for=):
            // the first save puts the new layout on that output.
            if (first && forPath && USE_ON.includes(forPath)) await assignTo(forPath, l.id, l.name);
            else say("Layout salvo. As saídas que o usam já mudaram.");
            onSaved?.(row);
            setBusy(false);
            return row;
        } catch (err) { say(err?.message || "Não foi possível salvar."); }
        setBusy(false);
        return null;
    };
    const removeLayout = async () => {
        if (confirm !== "delete") { setConfirm("delete"); say(`Clique de novo para excluir "${draft.name}".`); return; }
        // The window stays open on a fresh document: deleting is not leaving.
        try { await keryx.entities.ScreenLayout.delete(saved.id); say("Layout excluído. As saídas que o usavam voltaram ao padrão."); (onSwitch || onClose)("new"); } catch (err) { say(err?.message || "Não foi possível excluir."); }
    };
    const leave = () => {
        if (dirty && confirm !== "discard") { setConfirm("discard"); say("Há mudanças não salvas · clique de novo (ou Esc) para descartar."); return; }
        onClose();
    };
    // Usar em…: this layout on that output (the row updated or created),
    // saving first when needed.
    const nameOfOutput = (path) => outputLook(path, prefRows.find((r) => r.screen_path === path) || null).name;
    const assignTo = async (path, id, name) => {
        try {
            const row = prefRows.find((r) => r.screen_path === path);
            if (row) await keryx.entities.OutputPref.update(row.id, { layout_id: id });
            else await keryx.entities.OutputPref.create({ screen_path: path, layout_id: id });
            say(`${nameOfOutput(path)} agora desenha "${name}".`);
        } catch (err) { say(err?.message || "Não foi possível mudar a saída."); }
    };
    const putOn = async (path) => {
        const row = !saved || dirty ? await save() : saved;
        const id = row?.id || saved?.id;
        if (!id) return; // save already said why
        await assignTo(path, id, draft.name);
    };
    const usedOn = USE_ON.filter((p) => saved && prefRows.some((r) => r.screen_path === p && r.layout_id === saved.id));
    // Closing the window (or navigating it to another document from outside)
    // with unsaved changes: the browser asks; in the app the first try is
    // blocked — Cancelar/Esc inside says the same thing.
    useEffect(() => {
        if (!dirty) return undefined;
        const guard = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
    }, [dirty]);
    // The header's document select: another layout, or a fresh one, without
    // leaving the window (the dirty guard asks first).
    const switchTo = (id) => {
        if (id === (saved?.id || layoutId)) return;
        if (dirty && confirm !== "discard") { setConfirm("discard"); say("Há mudanças não salvas · escolha de novo para descartar."); return; }
        onSwitch?.(id);
    };
    const others = rows.map(normalizeLayout).filter((l) => l.id).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

    // ---- The canvas: pointer moves in % of the screen box ----
    const pct = (e) => {
        const r = screenRef.current?.getBoundingClientRect();
        if (!r || !r.width) return { x: 0, y: 0 };
        return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
    };
    const startDrag = (e, el, handle = null) => {
        e.preventDefault(); e.stopPropagation();
        setSel(el.id);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { id: el.id, handle, from: pct(e), rect0: { x: el.x, y: el.y, w: el.w, h: el.h }, moved: false };
    };
    const onMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const p = pct(e);
        const dx = p.x - d.from.x, dy = p.y - d.from.y;
        if (!d.moved && Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) return;
        d.moved = true;
        const raw = d.handle ? resizeRect(d.rect0, d.handle, dx, dy) : moveRect(d.rect0, dx, dy);
        const others = draft.elements.filter((x) => x.id !== d.id);
        const snapped = e.altKey ? { rect: raw, guides: [] } : snapRect(raw, others, { resize: d.handle });
        setGuides(snapped.guides);
        setEl(d.id, snapped.rect);
    };
    const endDrag = () => { if (drag.current?.moved) setConfirm(null); drag.current = null; setGuides([]); };

    // Keys: arrows nudge the selected element, Delete removes it, Ctrl+D
    // duplicates it; Esc leaves a field, closes a picker, drops the
    // selection, then leaves the editor (asking once if there are changes);
    // Ctrl+S saves.
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (document.querySelector(".console .scrim")) return;
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); if (draft) save(); return; }
        if (e.key === "Escape") {
            e.preventDefault(); e.stopPropagation();
            if (typing) { e.target.blur(); return; }
            if (adding) { setAdding(false); return; }
            if (pickImage) { setPickImage(false); return; }
            if (sel) { setSel(null); return; }
            leave();
            return;
        }
        if (typing || !selected) return;
        const step = e.shiftKey ? 5 : 1;
        const nudge = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
        if (nudge) { e.preventDefault(); e.stopPropagation(); setConfirm(null); setEl(selected.id, moveRect(selected, nudge[0], nudge[1])); return; }
        if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); e.stopPropagation(); remove(selected.id); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); e.stopPropagation(); duplicateEl(selected); }
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    // What the canvas shows: what is on air when something is (and the
    // operator did not ask for the sample), else a sample song with a
    // service 42 minutes in and a Setlist.
    const madeAt = useRef(now);
    const sample = useMemo(() => ({ ...sampleLive(madeAt.current), session: { startedAt: madeAt.current - 42 * 60000 } }), []);
    const liveOn = liveState && mainLayer(liveState) !== "none" ? liveState : null;
    const live = source === "sample" || !liveOn ? sample : { ...liveOn, session: liveOn.session || sample.session };

    // The Ver como context: the chosen output's OutputPref (and its theme),
    // applied the way the real page applies them — prefState + the kp-out
    // vars for renderer outputs (as OutputScreen), only the Escala for Palco
    // and Pastor (their pages pass scale to LayoutRenderer).
    const ctxPref = viewAs ? normalizePref(prefRows.find((r) => r.screen_path === viewAs) || null) : null;
    const ctxRenderer = Boolean(ctxPref) && PREF_OUTPUTS.includes(viewAs);
    const ctxTheme = ctxRenderer && ctxPref.themeId ? themes.find((t) => t.id === ctxPref.themeId) || null : null;

    const upload = async (file, apply) => {
        if (!file) return;
        try { const { file_url } = await keryx.integrations.Core.UploadFile({ file }); apply(file_url); } catch (err) { say(err?.message || "Não foi possível copiar o arquivo."); }
    };
    const pictures = media.filter((m) => (m.type === "image" || m.type === "gif") && !m.missing);
    const nameOf = (url) => media.find((m) => m.file_url === url)?.title || decodeURIComponent(String(url).split("/").pop() || "imagem");

    if (error) return <div className="col center"><Panel title="Editor de layout"><Empty icon="warn" title="Não foi possível abrir">{error}</Empty><div className="pl-pad"><Btn onClick={onClose}>Fechar</Btn></div></Panel></div>;
    if (!draft) return <div className="col center"><Panel title="Editor de layout"><Empty title="Abrindo…" /></Panel></div>;

    const type = selected ? typeOf(selected.type) : null;
    const num = (el, k, v, lo, hi) => { const n = Number(v); if (Number.isFinite(n)) setEl(el.id, { [k]: Math.min(hi, Math.max(lo, n)) }); };

    return (
        <>
            <div className="col nv-l" style={{ flex: "0 1 400px", minWidth: 340 }}>
                <Panel title={<>Layout <span className="kx-count">· {draft.name || "Novo layout"}{dirty ? " · não salvo" : ""}</span></>} actions={<>
                    {/* Another layout, or a fresh one, without leaving the window. */}
                    <select className="pl-input le-use" value={saved?.id || ""} onChange={(e) => switchTo(e.target.value || "new")} aria-label="Trocar de layout" title="Editar outro layout">
                        {!saved && <option value="">{draft.name || "Novo layout"}</option>}
                        <option value="new">Novo layout…</option>
                        {others.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    {saved && <Btn small kind={confirm === "delete" ? "air" : ""} onClick={removeLayout}>{confirm === "delete" ? "Excluir mesmo" : "Excluir"}</Btn>}
                </>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => { const el = selected; upload(e.target.files?.[0], (url) => { if (el) setProp(el.id, "url", url); setPickImage(false); }); e.target.value = ""; }} />
                    <div className="nv-scroll">
                        <div className="frm nv-frm">
                            <span className="k">Nome</span><Field icon={null} value={draft.name} onChange={(v) => set({ name: v.slice(0, 60) })} placeholder="Ex.: Palco · banda" />
                            <span className="k">Categoria</span><Seg small value={draft.category} options={LAYOUT_CATEGORIES} onChange={(v) => set({ category: v })} />
                            <span className="k">Fundo</span>
                            <span className="nv-inline">
                                <input type="color" className="ed-color" value={draft.background.color || "#101014"} onChange={(e) => set({ background: { ...draft.background, color: e.target.value } })} aria-label="Cor de fundo" title="Cor de fundo" />
                                {draft.background.color && <Btn small onClick={() => set({ background: { ...draft.background, color: "" } })}>Cor padrão</Btn>}
                                <Switch on={draft.background.song_image} onChange={(on) => set({ background: { ...draft.background, song_image: on } })} label="Imagem da música no fundo" />
                                <span className="kx-meta">imagem da música</span>
                            </span>
                            {draft.background.song_image && <><span className="k">Escurecer</span><Seg small value={String(draft.background.dim)} options={DIMS} onChange={(v) => set({ background: { ...draft.background, dim: Number(v) } })} /></>}
                        </div>

                        <div className="listhead"><span className="kx-section">Elementos <span className="kx-count">· {draft.elements.length}</span></span><span style={{ flex: 1 }} /><Btn small on={adding} onClick={() => setAdding(!adding)}><Icon name="plus" />Adicionar</Btn></div>
                        {adding && (
                            <div className="nv-pick le-types">
                                {/* By what the element is about (layouts.js ELEMENT_GROUPS). */}
                                {ELEMENT_GROUPS.map(([g, label]) => (
                                    <React.Fragment key={g}>
                                        <div className="kx-menu-h"><span className="kx-section">{label}</span></div>
                                        {ELEMENT_TYPES.filter((t) => t.group === g).map((t) => <Row key={t.id} icon={t.icon} title={t.name} meta={t.hint} onClick={() => add(t.id)} />)}
                                    </React.Fragment>
                                ))}
                            </div>
                        )}
                        {!draft.elements.length && !adding && <div className="listhead"><span className="kx-meta">Nenhum elemento ainda · Adicionar põe um no meio da tela; arraste-o para onde quiser.</span></div>}
                        {draft.elements.slice().reverse().map((el) => {
                            const t = typeOf(el.type);
                            return (
                                <Row key={el.id} single icon={t.icon} title={`${t.name}${el.label && el.label !== t.label ? ` · ${el.label}` : ""}`} className={sel === el.id ? "is-selected" : ""} onClick={() => setSel(el.id)}
                                    actions={<>
                                        <IconBtn name="chevron-up" small title="Trazer para a frente" onClick={(e) => { e.stopPropagation(); set({ elements: reorderElement(draft.elements, el.id, 1) }); }} />
                                        <IconBtn name="chevron-down" small title="Enviar para trás" onClick={(e) => { e.stopPropagation(); set({ elements: reorderElement(draft.elements, el.id, -1) }); }} />
                                        <IconBtn name="x" small title="Tirar do layout" onClick={(e) => { e.stopPropagation(); remove(el.id); }} />
                                    </>} />
                            );
                        })}

                        {selected && type && (
                            <>
                                <div className="listhead"><span className="kx-section">{type.name}</span><span style={{ flex: 1 }} /><Btn small onClick={() => duplicateEl(selected)} title="Ctrl+D"><Icon name="copy" />Duplicar</Btn></div>
                                <div className="frm nv-frm">
                                    <span className="k">Posição</span>
                                    <span className="nv-inline le-nums">
                                        <label>X<input className="pl-input le-num" type="number" min={0} max={100} step={0.5} value={selected.x} onChange={(e) => num(selected, "x", e.target.value, 0, 100 - selected.w)} /></label>
                                        <label>Y<input className="pl-input le-num" type="number" min={0} max={100} step={0.5} value={selected.y} onChange={(e) => num(selected, "y", e.target.value, 0, 100 - selected.h)} /></label>
                                        <span className="kx-meta">% da tela</span>
                                    </span>
                                    <span className="k">Tamanho</span>
                                    <span className="nv-inline le-nums">
                                        <label>L<input className="pl-input le-num" type="number" min={2} max={100} step={0.5} value={selected.w} onChange={(e) => num(selected, "w", e.target.value, 2, 100 - selected.x)} /></label>
                                        <label>A<input className="pl-input le-num" type="number" min={2} max={100} step={0.5} value={selected.h} onChange={(e) => num(selected, "h", e.target.value, 2, 100 - selected.y)} /></label>
                                    </span>
                                    <span className="k">Aparece</span>
                                    <select className="pl-input" value={selected.when} onChange={(e) => setEl(selected.id, { when: e.target.value })} aria-label="Quando aparece">
                                        {WHEN.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                                    </select>
                                    {/* The text look, only for the elements that draw text
                                        (layouts.js LOOK_TYPES): Projeção, monitor, logo,
                                        imagem e progresso take none of these fields. */}
                                    {LOOK_TYPES.has(selected.type) && <>
                                        <span className="k">Rótulo</span><Field icon={null} value={selected.label} onChange={(v) => setEl(selected.id, { label: v.slice(0, 24) })} placeholder="Ex.: Próximo (opcional)" />
                                        <span className="k">Texto</span>
                                        <span className="nv-inline">
                                            <input type="range" className="le-range" min={SIZE_RANGE[0]} max={SIZE_RANGE[1]} step={0.2} value={selected.size} onChange={(e) => num(selected, "size", e.target.value, SIZE_RANGE[0], SIZE_RANGE[1])} aria-label="Tamanho do texto" />
                                            <span className="kx-meta">{selected.size}</span>
                                            <Switch on={selected.weight === "bold"} onChange={(on) => setEl(selected.id, { weight: on ? "bold" : "normal" })} label="Negrito" /><span className="kx-meta">negrito</span>
                                        </span>
                                        <span className="k">Fonte</span>
                                        <select className="pl-input" value={selected.font} onChange={(e) => setEl(selected.id, { font: e.target.value })} aria-label="Fonte">
                                            {FONTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                                        </select>
                                        <span className="k">Cor</span>
                                        <span className="nv-inline">
                                            <input type="color" className="ed-color" value={selected.color || "#ffffff"} onChange={(e) => setEl(selected.id, { color: e.target.value })} aria-label="Cor do texto" />
                                            {selected.color ? <Btn small onClick={() => setEl(selected.id, { color: "" })}>Cor padrão</Btn> : <span className="kx-meta">a cor padrão das telas</span>}
                                        </span>
                                        <span className="k">Alinhar</span><Seg small value={selected.align} options={ALIGNS} onChange={(v) => setEl(selected.id, { align: v })} />
                                        <span className="k">Vertical</span><Seg small value={selected.valign} options={VALIGNS} onChange={(v) => setEl(selected.id, { valign: v })} />
                                        <span className="k">Caixa</span>
                                        <span className="nv-inline"><Switch on={selected.box} onChange={(on) => setEl(selected.id, { box: on })} label="Caixa atrás do elemento" /><span className="kx-meta">um cartão atrás, como as fichas do Palco</span></span>
                                    </>}
                                    {(selected.type === "monitor" || selected.type === "logo" || selected.type === "image") && <>
                                        <span className="k">Alinhar</span><Seg small value={selected.align} options={ALIGNS} onChange={(v) => setEl(selected.id, { align: v })} />
                                    </>}
                                    {selected.type === "clock" && <><span className="k">Segundos</span><Switch on={selected.props.seconds} onChange={(on) => setProp(selected.id, "seconds", on)} label="Mostrar os segundos" /></>}
                                    {selected.type === "title" && <><span className="k">Artista</span><Switch on={selected.props.artist} onChange={(on) => setProp(selected.id, "artist", on)} label="Mostrar o artista" /></>}
                                    {selected.type === "current" && <><span className="k">Cifra</span><span className="nv-inline"><Switch on={selected.props.chords} onChange={(on) => setProp(selected.id, "chords", on)} label="Cifra sobre a letra" /><span className="kx-meta">os acordes sobre as sílabas, quando a letra os tem</span></span></>}
                                    {selected.type === "next_items" && <><span className="k">Quantos</span><Seg small value={String(selected.props.count)} options={COUNTS} onChange={(v) => setProp(selected.id, "count", Number(v))} /></>}
                                    {selected.type === "text" && <><span className="k">Texto</span><textarea className="ed-text nv-sub" rows={2} value={selected.props.text} onChange={(e) => setProp(selected.id, "text", e.target.value.slice(0, 400))} aria-label="Texto fixo" /></>}
                                    {selected.type === "image" && <>
                                        <span className="k">Imagem</span>
                                        <span className="nv-inline">
                                            {selected.props.url ? <span className="nv-chip" style={{ flex: 1 }}><Icon name="image" /><span>{nameOf(selected.props.url)}</span><IconBtn name="x" small title="Tirar a imagem" onClick={() => setProp(selected.id, "url", "")} /></span> : null}
                                            <Btn small on={pickImage} onClick={() => setPickImage(!pickImage)}><Icon name="image" />Escolher…</Btn>
                                        </span>
                                    </>}
                                </div>
                                {pickImage && selected.type === "image" && (
                                    <div className="nv-pick">
                                        <div className="listhead"><span className="kx-section">Imagem</span><span style={{ flex: 1 }} /><Btn small onClick={() => fileRef.current?.click()}><Icon name="folder" />Do computador…</Btn></div>
                                        {!pictures.length && <div className="listhead"><span className="kx-meta">Nada na Mídia ainda · use Do computador…</span></div>}
                                        {pictures.slice(0, 40).map((m) => <Row key={m.id} single icon="image" title={m.title} onClick={() => { setProp(selected.id, "url", m.file_url); setPickImage(false); }} />)}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                    <div className="nv-foot">
                        <Btn onClick={leave}>{confirm === "discard" ? "Descartar mudanças" : "Cancelar"}</Btn>
                        <Btn kind="brand" disabled={busy} onClick={save} title="Ctrl+S">Salvar layout</Btn>
                    </div>
                </Panel>
            </div>
            <div className="kx-gap" />
            <div className="col center">
                <Panel title={<>Tela <span className="kx-count">· 16:9</span></>} actions={<>
                    {/* Which output's real settings dress the preview. */}
                    <select className="pl-input le-use" value={viewAs} onChange={(e) => setViewAs(e.target.value)} aria-label="Ver como a saída" title="Pré-visualizar com os ajustes reais de uma saída (Mostrar, tema, escala, margens)">
                        <option value="">Ver como: tela pura</option>
                        {USE_ON.map((p) => <option key={p} value={p}>Ver como: {nameOfOutput(p)}</option>)}
                    </select>
                    <Seg small label="Mostrar com" value={source} options={[["auto", "No ar"], ["sample", "Exemplo"]]} onChange={setSource} />
                </>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="le-stage">
                        <div ref={screenRef} className="le-screen" onPointerDown={() => setSel(null)}>
                            <div className={`le-fill ${ctxRenderer ? "kp-out" : ""}`} style={ctxRenderer ? prefVars(ctxPref) || undefined : undefined}>
                                <LayoutRenderer layout={draft} live={live} screenState={ctxRenderer ? prefState(viewAs, live, ctxPref, ctxTheme) : undefined} nowMs={now} logoUrl={church.logo} upcoming={SAMPLE_ITEMS} hasService church={church} scale={!ctxRenderer && ctxPref ? ctxPref.scale : undefined} embed ghost />
                            </div>
                            <div className="le-over" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
                                {guides.map((g, i) => <i key={i} className={`le-guide ${g.axis}`} style={g.axis === "x" ? { left: `${g.at}%` } : { top: `${g.at}%` }} />)}
                                {draft.elements.map((el) => (
                                    <div key={el.id} className={`le-hit ${sel === el.id ? "is-sel" : ""}`} style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
                                        title={typeOf(el.type)?.name} onPointerDown={(e) => startDrag(e, el)} onDoubleClick={() => setSel(el.id)}>
                                        {sel === el.id && HANDLES.map((h) => <i key={h} className={`le-h ${h}`} onPointerDown={(e) => startDrag(e, el, h)} />)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    <div className="listhead nv-note">
                        <span className="kx-meta">Arraste para mover, alças para redimensionar, setas ajustam 1 % (Shift 5 %), Alt ignora o imã. Elementos escondidos agora aparecem esmaecidos.{viewAs === "/VideoProjection" ? " Com um vídeo tocando, a saída Vídeo mostra só o vídeo, sem o layout." : ""}</span>
                        <span style={{ flex: 1 }} />
                        {usedOn.length > 0 && <span className="kx-meta">Em uso: {usedOn.map(nameOfOutput).join(", ")}</span>}
                        <select className="pl-input le-use" value="" disabled={busy} onChange={(e) => { if (e.target.value) putOn(e.target.value); }} aria-label="Usar este layout numa saída" title="Salva e põe este layout na saída escolhida">
                            <option value="">Usar em…</option>
                            {USE_ON.filter((p) => !usedOn.includes(p)).map((p) => <option key={p} value={p}>{nameOfOutput(p)}</option>)}
                        </select>
                    </div>
                </Panel>
            </div>
        </>
    );
}
