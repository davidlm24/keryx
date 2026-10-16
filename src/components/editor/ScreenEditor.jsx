import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "../console/Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty, WinBar } from "../console/kx";
import { Switch } from "../console/settings/parts";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import OutputPrefCard from "../console/settings/OutputPrefCard";
import { mainLayer } from "@shared/live-state.mjs";
import {
    ELEMENT_TYPES, ELEMENT_GROUPS, LOOK_TYPES, WHEN, FONTS, ALIGNS, VALIGNS, SIZE_RANGE, MAX_ELEMENTS, typeOf,
    normalizeLayout, newLayout, newElement, duplicateLayout, findLayout, layoutFields, snapRect, resizeRect, moveRect, FACTORY_LAYOUTS, seedLayoutId,
} from "@/lib/layouts";
import { useOutputPrefRows } from "@/hooks/useOutputPref";
import { PREF_OUTPUTS, outputLook, normalizePref, designOf, prefState, prefVars, prefViewKey, alertOf } from "@/lib/outputPrefs";
import { useChurch } from "@/hooks/useChurch";
import { sampleLive, sampleNotice, sampleAlert, SAMPLE_ITEMS } from "../console/settings/sample";
import { ConfirmContext } from "../console/ConfirmDialog";
import useSortable from "../console/useSortable";
import { moveTo } from "@/lib/console/dropOrder";
import { useWinCol } from "@/components/console/winLayout";
import useDraftHistory from "@/hooks/useDraftHistory";
import { historyKey, hasOwnUndo } from "@/lib/editorHistory";
import UndoRedo from "./UndoRedo";

const HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
// Arrow presses this close together are one Desfazer step.
const NUDGE_WINDOW = 1000;
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// The screens the Editor edits (every page with settings; Transmissão has
// no canvas, only its settings). Each starts from its page's ready design
// (seedLayoutId in layouts.js).
export const EDITOR_SCREENS = [...PREF_OUTPUTS, "/StageView", "/PastorView", "/StreamView"];
// What a design keeps on the row: the drawing alone (no name or category —
// the screen itself is the identity; owner 2026-10-13).
const designFields = (d) => { if (!d) return null; const f = layoutFields(normalizeLayout(d)); return { elements: f.elements, background: f.background }; };
const CATEGORY = { "/StageView": "palco", "/PastorView": "pastor" };
// The page's ready design, as a fresh draft for this screen.
const seedFor = (path) => {
    const cat = CATEGORY[path] || "publico";
    const f = findLayout(seedLayoutId(path), []);
    return normalizeLayout(f ? { ...duplicateLayout(f), name: "", category: cat, factory: false } : newLayout(cat));
};

// The screens half of the Editor (a page of THE window;
// owner's decision 2026-10-13: each screen owns its design — the layout
// catalog died). A vertical menu switches between the screens; the 16:9
// canvas edits THIS screen's drawing (OutputPref.design) with the screen's
// real settings dressing the preview, and the screen's visual settings
// (content, Mostrar, theme, margins…) live in the same window
// (OutputPrefCard, inEditor). A screen with no design follows its page and
// opens straight into editing, the canvas seeded with that page's ready
// design (owner 2026-10-13): the seed is the baseline, so only real edits
// are "não salvo", and nothing is written until "Salvar a tela".
// `hosted`: a page of THE window (Rodada C, fase d2) — the editor draws its
// own WinBar (No ar | Exemplo as the bar's tool; Cancelar and Salvar a tela
// as its actions; ⧉ Destacar from the window, or onDetach) and no footer;
// the middle column splits into Desenho | Ajustes. Both hosts — the
// console's window and a detached /Janela — mount it hosted.
export default function ScreenEditor({ say, live: liveState, now, screenPath, media = [], themes = [], onClose, onSwitch, escRef = null, leaveRef = null, active = true, hosted = false, onDetach = null }) {
    // The columns a splitter resizes, kept per page on this computer (Rodada D3).
    const colTelas = useWinCol("screen.telas", { def: 190, min: 160, max: 360 });
    const colAjustes = useWinCol("screen.ajustes", { def: 400, min: 340, max: 720 });
    const prefRows = useOutputPrefRows();
    const church = useChurch();
    const path = EDITOR_SCREENS.includes(screenPath) ? screenPath : "/Projection";
    const row = prefRows.find((r) => r.screen_path === path) || null;
    const pref = useMemo(() => normalizePref(row), [row]);
    const name = outputLook(path, row).name;
    const renderer = PREF_OUTPUTS.includes(path);
    const isStream = path === "/StreamView";

    const [draft, setDraft] = useState(null);
    const [saved, setSaved] = useState(null);
    // Desfazer / Refazer over the drawing (audit C-33): a load, Salvar and
    // Voltar à página padrão empty it; another screen remounts the editor.
    const history = useDraftHistory(draft, setDraft);
    const resetHistory = history.reset; // one identity for the editor's life
    const [own, setOwn] = useState(false); // the row has a design of its own
    const [sel, setSel] = useState(null);
    const [adding, setAdding] = useState(false);
    const [confirm, setConfirm] = useState(null); // "reset" | "discard" (detached only)
    // Both windows (the console's, a detached /Janela) provide the
    // one-question guard; a host without one (null) gets the two-step toast.
    const askCtx = useContext(ConfirmContext);
    const [busy, setBusy] = useState(false);
    const [source, setSource] = useState("auto"); // "auto" | "sample"
    const [guides, setGuides] = useState([]);
    const [pickImage, setPickImage] = useState(false);
    // The middle column's two halves (Rodada C, fase d2): the drawing, and
    // the output's settings (which save at once, outside the draft).
    const [tab, setTab] = useState("desenho");
    const [starting, setStarting] = useState(null); // "model" | "copy": the pickers at the drawing's tail
    const [pickBgImage, setPickBgImage] = useState(false);
    // The element list (top first, the reverse of the drawing order): the
    // rows around make room for a lit slot (useSortable, owner 2026-10-15/16).
    const elSort = useSortable({
        keys: (draft?.elements || []).map((el) => el.id).reverse(),
        onDrop: (from, over) => setDraft((d) => ({ ...d, elements: moveTo(d.elements.slice().reverse(), from, over).slice().reverse() })),
    });
    const fileRef = useRef(null);
    const bgFileRef = useRef(null);
    const screenRef = useRef(null);
    const drag = useRef(null);
    const loaded = useRef(false);

    // The screen's design (its own, or the old layout_id's — designOf),
    // fetched once per screen: editing never fights the subscription.
    useEffect(() => {
        if (isStream || loaded.current) return undefined;
        let alive = true;
        keryx.entities.OutputPref.filter({ screen_path: path }).then(async (rows) => {
            if (!alive) return;
            const r = rows?.[0] || null;
            const legacy = r && !r.design && r.layout_id ? await keryx.entities.ScreenLayout.list().catch(() => []) : [];
            const base = designOf(normalizePref(r), legacy);
            loaded.current = true;
            const start = base ? normalizeLayout({ ...base, factory: false }) : seedFor(path);
            setDraft(start);
            setSaved(start);
            resetHistory(start);
            setOwn(Boolean(base));
        }).catch(() => { if (!alive) return; loaded.current = true; const seed = seedFor(path); setDraft(seed); setSaved(seed); resetHistory(seed); });
        return () => { alive = false; };
    }, [path, isStream, resetHistory]);

    const dirty = useMemo(() => !sameJson(designFields(draft), designFields(saved)), [draft, saved]);
    const set = (patch) => { setConfirm(null); setDraft((d) => ({ ...d, ...patch })); };
    const setEl = (id, patch) => setDraft((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
    const setProp = (id, k, v) => setDraft((d) => ({ ...d, elements: d.elements.map((e) => (e.id === id ? { ...e, props: { ...e.props, [k]: v } } : e)) }));
    const selected = draft?.elements.find((e) => e.id === sel) || null;

    const add = (type) => {
        if (draft.elements.length >= MAX_ELEMENTS) { say(`Uma tela tem no máximo ${MAX_ELEMENTS} elementos.`); return; }
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

    // Save: the design on THIS screen's OutputPref (layout_id cleared — the
    // old pointer migrates into the row the first time it is saved).
    const save = async () => {
        if (!draft) return null;
        setBusy(true);
        try {
            const fields = { design: designFields(draft), layout_id: "" };
            const next = row ? await keryx.entities.OutputPref.update(row.id, fields) : await keryx.entities.OutputPref.create({ screen_path: path, ...fields });
            setSaved(normalizeLayout({ ...draft }));
            history.reset();
            setOwn(true);
            say(`${name} salva. A janela e as telas na rede já mudaram.`);
            setBusy(false);
            return next;
        } catch (err) { say(err?.message || "Não foi possível salvar."); }
        setBusy(false);
        return null;
    };
    // Voltar à página padrão: the design goes, the page draws itself again
    // and the canvas starts over from its ready design.
    const resetToPage = async () => {
        if (askCtx) { if (!(await askCtx({ title: "Voltar à página padrão?", text: `O desenho próprio de ${name} sai; a tela volta a se desenhar sozinha.`, ok: "Voltar ao padrão", danger: true }))) return; }
        else if (confirm !== "reset") { setConfirm("reset"); say(`Clique de novo: ${name} volta ao desenho padrão da página.`); return; }
        setConfirm(null);
        try {
            if (row && own) await keryx.entities.OutputPref.update(row.id, { design: null, layout_id: "" });
            const seed = seedFor(path);
            setDraft(seed); setSaved(seed); history.reset(seed); setSel(null); setOwn(false);
            say(`${name} voltou à página padrão.`);
        } catch (err) { say(err?.message || "Não foi possível."); }
    };
    // The guard is the one question (Rodada C), in the console's window and
    // in a detached /Janela; with no provider, the two-step toast.
    const askDiscard = async () => {
        if (!dirty) return true;
        if (askCtx) return askCtx({ title: "Descartar as mudanças?", text: `O desenho de ${name} tem mudanças não salvas.`, ok: "Descartar" });
        return false;
    };
    const leave = async (all = false) => {
        if (dirty && !askCtx && confirm !== "discard") { setConfirm("discard"); say("Há mudanças não salvas · clique de novo (ou Esc) para descartar."); return; }
        if (askCtx && !(await askDiscard())) return;
        onClose(all);
    };
    // The vertical menu: another screen, the dirty guard asking first.
    const switchTo = async (p) => {
        if (p === path) return;
        if (dirty && !askCtx && confirm !== "discard") { setConfirm("discard"); say("Há mudanças não salvas · escolha de novo para descartar."); return; }
        if (askCtx && !(await askDiscard())) return;
        onSwitch?.(p);
    };
    useEffect(() => {
        if (!dirty) return undefined;
        const guard = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
    }, [dirty]);

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
        history.begin(`drag:${el.id}:${Date.now()}`); // the whole drag is one step
    };
    const onMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const p = pct(e);
        const dx = p.x - d.from.x, dy = p.y - d.from.y;
        if (!d.moved && Math.abs(dx) < 0.2 && Math.abs(dy) < 0.2) return;
        d.moved = true;
        const raw = d.handle ? resizeRect(d.rect0, d.handle, dx, dy) : moveRect(d.rect0, dx, dy);
        const rest = draft.elements.filter((x) => x.id !== d.id);
        const snapped = e.altKey ? { rect: raw, guides: [] } : snapRect(raw, rest, { resize: d.handle });
        setGuides(snapped.guides);
        setEl(d.id, snapped.rect);
    };
    const endDrag = () => { if (drag.current?.moved) setConfirm(null); if (drag.current) history.end(); drag.current = null; setGuides([]); };

    // Keys: arrows nudge, Delete removes (Backspace never does: on Windows
    // it is not a delete key, audit C-11), Ctrl+D duplicates, Ctrl+S saves,
    // Ctrl+Z undoes and Ctrl+Y / Ctrl+Shift+Z redo (a text field keeps its
    // own while it has the focus, audit C-33);
    // Esc steps out (field, picker, selection, then the window). Hosted in
    // the console's window (escRef set), Esc comes routed from the console
    // instead (keys.js ESC_ORDER "window"), stepping out the same way; the
    // (x) ("all") leaves the whole stack through the guard. leaveRef is
    // the detached footer's guarded Fechar.
    if (escRef) escRef.current = (mode) => { if (mode !== "esc") leave(mode === "all"); else if (adding) setAdding(false); else if (pickImage) setPickImage(false); else if (pickBgImage) setPickBgImage(false); else if (starting) setStarting(null); else if (sel) setSel(null); else leave(); };
    if (leaveRef) leaveRef.current = () => leave();
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (!active) return; // another page of the window covers this one
        // Only what opens OVER the editor takes the keys (the library, a
        // right-click menu, a confirm). In the detached window, Esc closes
        // the library itself (its scrim) — in the console's window the
        // console routes that (ESC_ORDER "library" before "window").
        const libScrim = document.querySelector(".console .lib-scrim");
        if (libScrim) { if (!escRef && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); libScrim.click(); } return; }
        if (document.querySelector(".console .ctx-scrim, .console .confirm-scrim")) return;
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); if (draft) save(); return; }
        const hk = draft ? historyKey(e, hasOwnUndo(e.target)) : null;
        if (hk) { e.preventDefault(); e.stopPropagation(); setConfirm(null); history[hk](); return; }
        if (e.key === "Escape") {
            if (escRef) return; // the console routes it
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
        if (nudge) { e.preventDefault(); e.stopPropagation(); setConfirm(null); history.mark(`nudge:${selected.id}`, NUDGE_WINDOW); setEl(selected.id, moveRect(selected, nudge[0], nudge[1])); return; }
        if (e.key === "Delete") { e.preventDefault(); e.stopPropagation(); remove(selected.id); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); e.stopPropagation(); duplicateEl(selected); }
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    // What the canvas shows: what is on air when something is, else a sample
    // song 42 minutes into a service with a Setlist.
    const madeAt = useRef(now);
    const sampleDoc = useMemo(() => ({ ...sampleLive(madeAt.current), session: { startedAt: madeAt.current - 42 * 60000 } }), []);
    const liveOn = liveState && mainLayer(liveState) !== "none" ? liveState : null;
    const shown = source === "sample" || !liveOn ? sampleDoc : { ...liveOn, session: liveOn.session || sampleDoc.session };
    // A screen that shows only avisos (Comunicação) gets an example aviso
    // when none is on air, as Telas e saídas' still does: a song would
    // leave it on the idle look.
    const noticeDoc = useMemo(() => sampleNotice(madeAt.current), []);
    const avisos = renderer && prefViewKey(path, pref) === "/CommunicationProjection" && !shown.communication ? { ...shown, communication: noticeDoc.communication } : shown;
    // Ajustes › Aviso rápido › Ver exemplo (Rodada E3): an example bar on
    // the canvas while the settings half is open, unless one is on air.
    const [alertSample, setAlertSample] = useState(null);
    const live = alertSample && tab === "ajustes" && !avisos.alert ? { ...avisos, alert: alertSample } : avisos;
    // On: the example shows (a fresh one when asked, so its entrance plays).
    const showAlertSample = (on, fresh = false) => setAlertSample((cur) => (on ? (cur && !fresh ? cur : sampleAlert(Date.now())) : null));
    // The preview is always THIS screen, with its real settings: prefState +
    // the kp-out vars (renderer pages), the Escala alone (Palco e Pastor).
    const ctxTheme = renderer && pref.themeId ? themes.find((t) => t.id === pref.themeId) || null : null;
    const screenState = renderer ? prefState(path, live, pref, ctxTheme) : undefined;
    // The Aviso rápido over the whole drawing, in this screen's look, as the
    // page draws it (OutputScreen, StageView); the Pastor's draws none.
    const canvasAlert = renderer ? screenState?.alert ?? null : path === "/StageView" ? (live.content ? alertOf(live, pref, path) : null) : undefined;

    const upload = async (file, apply) => {
        if (!file) return;
        try { const { file_url } = await keryx.integrations.Core.UploadFile({ file }); apply(file_url); } catch (err) { say(err?.message || "Não foi possível copiar o arquivo."); }
    };
    const pictures = media.filter((m) => (m.type === "image" || m.type === "gif") && !m.missing);
    const nameOf = (url) => media.find((m) => m.file_url === url)?.title || decodeURIComponent(String(url).split("/").pop() || "imagem");

    const type = selected ? typeOf(selected.type) : null;
    const num = (el, k, v, lo, hi) => { const n = Number(v); if (Number.isFinite(n)) setEl(el.id, { [k]: Math.min(hi, Math.max(lo, n)) }); };
    const cLike = { say, now, live: liveState };

    const screensMenu = (
        <div className="col" style={colTelas.style}>
            <Panel title="Telas" bodyStyle={{ overflow: "auto" }}>
                {EDITOR_SCREENS.map((p) => {
                    const r = prefRows.find((x) => x.screen_path === p) || null;
                    const look = outputLook(p, r);
                    return <Row key={p} single icon={look.icon} title={look.name} className={p === path ? "is-selected" : ""} onClick={() => switchTo(p)} />;
                })}
            </Panel>
        </div>
    );

    // A ready drawing in place of the current one: a factory model, or
    // another screen's own design (Rodada C, fase d2 — the catalog's one
    // useful door, without the catalog).
    const applyDesign = async (label, layout) => {
        if (dirty && askCtx && !(await askCtx({ title: "Substituir o desenho?", text: `O desenho atual de ${name} dá lugar a ${label}; nada é salvo sem "Salvar a tela".`, ok: "Substituir", danger: true }))) return;
        setDraft(normalizeLayout({ ...duplicateLayout(layout), name: "", factory: false }));
        setSel(null);
        setStarting(null);
    };
    const copySources = EDITOR_SCREENS.filter((p) => p !== path && p !== "/StreamView").map((p) => {
        const r = prefRows.find((x) => x.screen_path === p) || null;
        return { path: p, name: outputLook(p, r).name, design: designOf(normalizePref(r), []) };
    }).filter((s) => s.design);
    const tabs = isStream ? null : <Seg small value={tab} onChange={setTab} label="Metade da coluna" options={[["desenho", "Desenho"], ["ajustes", "Ajustes"]]} />;

    const body = (
        <>
            {screensMenu}
            {colTelas.split}
            <div className="col nv-l" style={colAjustes.style}>
                <Panel caption={isStream ? "Ajustes" : tabs} actions={!isStream && !hosted && <span className="kx-count">{name}{dirty ? " · não salvo" : ""}</span>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => { const el = selected; upload(e.target.files?.[0], (url) => { if (el) setProp(el.id, "url", url); setPickImage(false); }); e.target.value = ""; }} />
                    <input ref={bgFileRef} type="file" hidden accept="image/*" onChange={(e) => { upload(e.target.files?.[0], (url) => { set({ background: { ...draft.background, image: url } }); setPickBgImage(false); }); e.target.value = ""; }} />
                    <div className="nv-scroll cfg">
                        {isStream && <div className="listhead"><span className="kx-meta">A Transmissão é uma legenda sobre a live, sem canvas: só os ajustes abaixo.</span></div>}
                        {!isStream && tab === "desenho" && draft && <>
                        <div className="frm nv-frm">
                            <span className="k">Fundo</span>
                            <span className="nv-inline">
                                <input type="color" className="ed-color" value={draft.background.color || "#101014"} onChange={(e) => set({ background: { ...draft.background, color: e.target.value } })} aria-label="Cor de fundo" title="Cor de fundo" />
                                {draft.background.color && <Btn small onClick={() => set({ background: { ...draft.background, color: "" } })}>Cor padrão</Btn>}
                                <Switch on={draft.background.song_image} onChange={(on) => set({ background: { ...draft.background, song_image: on } })} label="Imagem da música no fundo" />
                            </span>
                            {/* A picture of its own behind everything — the
                                renderer always drew background.image; no UI
                                until Rodada C, fase d2. The song's picture
                                wins while one is on air. */}
                            <span className="k">Imagem no fundo</span>
                            <span className="nv-inline">
                                {draft.background.image ? <span className="nv-chip" style={{ flex: 1 }}><Icon name="image" /><span>{nameOf(draft.background.image)}</span><IconBtn name="x" small title="Tirar a imagem do fundo" onClick={() => set({ background: { ...draft.background, image: "" } })} /></span> : null}
                                <Btn small on={pickBgImage} onClick={() => setPickBgImage(!pickBgImage)}><Icon name="image" />{draft.background.image ? "Trocar…" : "Escolher…"}</Btn>
                            </span>
                            {pickBgImage && (
                                <>
                                    <span className="k" />
                                    <div className="nv-pick">
                                        <div className="listhead"><span className="kx-section">Imagem do fundo</span><span style={{ flex: 1 }} /><Btn small onClick={() => bgFileRef.current?.click()}><Icon name="folder" />Do computador…</Btn></div>
                                        {!pictures.length && <div className="listhead"><span className="kx-meta">Nada na Mídia ainda · use Do computador…</span></div>}
                                        {pictures.slice(0, 40).map((m) => <Row key={m.id} single icon="image" title={m.title} onClick={() => { set({ background: { ...draft.background, image: m.file_url } }); setPickBgImage(false); }} />)}
                                    </div>
                                </>
                            )}
                            {(draft.background.song_image || draft.background.image) && <>
                                <span className="k">Escurecer</span>
                                <span className="nv-inline">
                                    <input type="range" className="le-range" min={0} max={95} step={1} value={Math.round(draft.background.dim * 100)} onChange={(e) => set({ background: { ...draft.background, dim: Number(e.target.value) / 100 } })} aria-label="Escurecer a imagem do fundo" />
                                    <span className="kx-meta">{Math.round(draft.background.dim * 100)}%</span>
                                </span>
                            </>}
                        </div>

                        <div className="listhead"><span className="kx-section">Elementos <span className="kx-count">· {draft.elements.length}</span></span><span style={{ flex: 1 }} /><Btn small on={adding} onClick={() => setAdding(!adding)}><Icon name="plus" />Adicionar</Btn></div>
                        {adding && (
                            <div className="nv-pick le-types">
                                {ELEMENT_GROUPS.map(([g, label]) => (
                                    <React.Fragment key={g}>
                                        <div className="kx-menu-h"><span className="kx-section">{label}</span></div>
                                        {ELEMENT_TYPES.filter((t) => t.group === g).map((t) => <Row key={t.id} icon={t.icon} title={t.name} meta={t.hint} onClick={() => add(t.id)} />)}
                                    </React.Fragment>
                                ))}
                            </div>
                        )}
                        {!draft.elements.length && !adding && <div className="listhead"><span className="kx-meta">Nenhum elemento ainda · Adicionar põe um no meio da tela; arraste-o para onde quiser.</span></div>}
                        {/* Topmost first; dragging a row changes who draws on
                            top (dropOrder.js moveTo); the eye hides the element
                            without losing its place (Rodada C, fase d2). */}
                        <div className={`le-els ${elSort.sorting ? "is-sorting" : ""}`} {...elSort.listProps}>
                        {draft.elements.slice().reverse().map((el, di) => {
                            const t = typeOf(el.type);
                            return (
                                <Row key={el.id} single icon={t.icon} title={`${t.name}${el.label && el.label !== t.label ? ` · ${el.label}` : ""}`}
                                    className={`${sel === el.id ? "is-selected" : ""} ${el.hidden ? "is-dim" : ""}`}
                                    onClick={() => setSel(el.id)}
                                    dragProps={{ ...elSort.rowProps(di, { label: t.name, icon: t.icon }), style: elSort.rowStyle(di) }}
                                    actions={<>
                                        <IconBtn name={el.hidden ? "eye-off" : "eye"} small title={el.hidden ? "Mostrar o elemento" : "Esconder o elemento (ele fica no lugar)"} onClick={(e) => { e.stopPropagation(); setEl(el.id, { hidden: !el.hidden }); }} />
                                        <IconBtn name="x" small title="Tirar da tela" onClick={(e) => { e.stopPropagation(); remove(el.id); }} />
                                    </>}>
                                    <span className="kx-glyph" title="Arraste para mudar quem desenha por cima"><Icon name="grip" /></span>
                                </Row>
                            );
                        })}
                        </div>

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
                                    {/* Every element takes these (the renderer
                                        always drew the label; Rodada C d2). */}
                                    <span className="k">Rótulo</span><Field icon={null} value={selected.label} onChange={(v) => setEl(selected.id, { label: v.slice(0, 24) })} placeholder="Ex.: Próximo (opcional)" />
                                    <span className="k">Opacidade</span>
                                    <span className="nv-inline">
                                        <input type="range" className="le-range" min={10} max={100} step={1} value={Math.round((Number(selected.opacity) || 1) * 100)} onChange={(e) => setEl(selected.id, { opacity: Number(e.target.value) / 100 })} aria-label="Opacidade do elemento" />
                                        <span className="kx-meta">{Math.round((Number(selected.opacity) || 1) * 100)}%</span>
                                    </span>
                                    {LOOK_TYPES.has(selected.type) && <>
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
                                        <span className="k">Vertical</span><Seg small value={selected.valign} options={VALIGNS} onChange={(v) => setEl(selected.id, { valign: v })} />
                                    </>}
                                    {selected.type === "clock" && <><span className="k">Segundos</span><Switch on={selected.props.seconds} onChange={(on) => setProp(selected.id, "seconds", on)} label="Mostrar os segundos" /></>}
                                    {selected.type === "title" && <><span className="k">Artista</span><Switch on={selected.props.artist} onChange={(on) => setProp(selected.id, "artist", on)} label="Mostrar o artista" /></>}
                                    {selected.type === "current" && <><span className="k">Cifra</span><span className="nv-inline"><Switch on={selected.props.chords} onChange={(on) => setProp(selected.id, "chords", on)} label="Cifra sobre a letra" /><span className="kx-meta">os acordes sobre as sílabas, quando a letra os tem</span></span></>}
                                    {selected.type === "next_items" && <><span className="k">Quantos</span><span className="nv-inline le-nums"><input className="pl-input le-num" type="number" min={0} max={10} step={1} value={selected.props.count} onChange={(e) => setProp(selected.id, "count", Math.max(0, Math.min(10, Math.round(Number(e.target.value) || 0))))} aria-label="Quantos itens" /><span className="kx-meta">0 a 10 itens</span></span></>}
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
                        {/* The drawing's tail: ready starting points and the
                            way back (Rodada C, fase d2 — the factory models
                            had no door since the catalog died). */}
                        <div className="listhead le-starts">
                            <Btn small on={starting === "model"} onClick={() => setStarting(starting === "model" ? null : "model")}>Começar de um modelo…</Btn>
                            {copySources.length > 0 && <Btn small on={starting === "copy"} onClick={() => setStarting(starting === "copy" ? null : "copy")}>Copiar de outra tela…</Btn>}
                            <span style={{ flex: 1 }} />
                            {draft && (own || dirty) && <Btn small kind={confirm === "reset" ? "air" : ""} onClick={resetToPage}>{confirm === "reset" ? "Voltar mesmo" : "Voltar à página padrão…"}</Btn>}
                        </div>
                        {starting === "model" && (
                            <div className="nv-pick">
                                {FACTORY_LAYOUTS.map((l) => <Row key={l.id} single icon="layers" title={l.name} onClick={() => applyDesign(`o modelo "${l.name}"`, l)} />)}
                            </div>
                        )}
                        {starting === "copy" && (
                            <div className="nv-pick">
                                {copySources.map((s) => <Row key={s.path} single icon="monitor" title={s.name} meta="o desenho salvo dessa tela" onClick={() => applyDesign(`o desenho de ${s.name}`, s.design)} />)}
                            </div>
                        )}
                        </>}
                        {/* The output's visual settings (content, Mostrar,
                            theme, margins…): they save at once, outside the
                            drawing's draft — their own half since Rodada C. */}
                        {(isStream || tab === "ajustes") && <>
                            <div className="listhead"><span className="kx-section">Ajustes <span className="kx-count">· valem também para as telas na rede desta página</span></span></div>
                            <OutputPrefCard inEditor output={{ key: path, label: name }} row={row} themes={themes} c={cLike} alertSample={Boolean(alertSample)} onAlertSample={showAlertSample} />
                        </>}
                    </div>
                    {draft && !isStream && !hosted && (
                        <div className="nv-foot">
                            <Btn onClick={leave}>{confirm === "discard" ? "Descartar mudanças" : "Cancelar"}</Btn>
                            <Btn kind="brand" disabled={busy} onClick={save} title="Ctrl+S">Salvar a tela</Btn>
                        </div>
                    )}
                </Panel>
            </div>
            {colAjustes.split}
            <div className="col center">
                <Panel title={<>Tela <span className="kx-count">· 16:9</span></>} actions={!hosted && <>
                    <Seg small label="Mostrar com" value={source} options={[["auto", "No ar"], ["sample", "Exemplo"]]} onChange={setSource} />
                </>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    {isStream || !draft ? (
                        <Empty icon={isStream ? "text" : "monitor"} title={isStream ? "Sem canvas" : "Abrindo a tela…"}>
                            {isStream ? "A legenda da Transmissão segue os ajustes ao lado." : null}
                        </Empty>
                    ) : (
                        <div className="le-stage">
                            <div ref={screenRef} className="le-screen" onPointerDown={() => setSel(null)}>
                                <div className={`le-fill ${renderer ? "kp-out" : ""}`} style={renderer ? prefVars(pref) || undefined : undefined}>
                                    <LayoutRenderer layout={draft} live={live} screenState={screenState} alert={canvasAlert} nowMs={now} logoUrl={church.logo} upcoming={SAMPLE_ITEMS} hasService church={church} scale={!renderer ? pref.scale : undefined} embed ghost />
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
                    )}
                    {draft && !isStream && (
                        <div className="listhead nv-note">
                            <span className="kx-meta">Arraste para mover, alças para redimensionar, setas ajustam 1 % (Shift 5 %), Alt ignora o imã, Delete tira o elemento, Ctrl+Z desfaz. Elementos escondidos agora aparecem esmaecidos.{path === "/VideoProjection" ? " Com um vídeo tocando, a saída Vídeo mostra só o vídeo, sem o desenho." : ""}</span>
                        </div>
                    )}
                </Panel>
            </div>
        </>
    );

    if (!hosted) return body;
    return (
        <>
            <WinBar title="Editor da tela" sub={`${name}${dirty ? " · não salvo" : ""}`}
                tools={!isStream && <Seg small label="Mostrar com" value={source} options={[["auto", "No ar"], ["sample", "Exemplo"]]} onChange={setSource} />}
                actions={!isStream && <>
                    <UndoRedo history={history} />
                    <Btn small onClick={() => leave()}>Cancelar</Btn>
                    <Btn small kind="brand" disabled={busy || !draft} onClick={save} title="Ctrl+S">Salvar a tela</Btn>
                </>}
                detach={onDetach} />
            <div className="win-body is-ed">{body}</div>
        </>
    );
}
