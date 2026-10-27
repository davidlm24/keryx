import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { uploadFile } from "@/lib/mediaImport";
import Icon from "../console/Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty, WinBar } from "../console/kx";
import { MenuButton } from "../console/Menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import TextBar from "./TextBar";
import { Switch } from "../console/settings/parts";
import LayoutRenderer from "@/components/screen/LayoutRenderer";
import OutputAjustes from "../console/settings/ajustes/OutputAjustes";
import { mainLayer, emptyState } from "@shared/live-state.mjs";
import {
    ELEMENT_TYPES, ELEMENT_GROUPS, LOOK_TYPES, WHEN, FONTS, ALIGNS, VALIGNS, SIZE_RANGE, MAX_ELEMENTS, typeOf,
    normalizeLayout, newLayout, newElement, duplicateLayout, findLayout, layoutFields, snapRect, resizeRect, moveRect, FACTORY_LAYOUTS, seedLayoutId,
    layoutContext, elementState, whenLabel, ghostReason,
} from "@/lib/layouts";
import {
    ELEMENT_HINTS, elementBar, barToElement, ALIGN_ACTIONS, alignElements, distributeElements, moveElements, gridRect, cleanGrid, GRID_STEPS,
    churchModels, modelFields, modelNameTaken, categoryLabel,
} from "@/lib/layoutEditor";
import { clickSelection, EMPTY_SELECTION } from "@/lib/console/multiSelect";
import { useOutputPrefRows } from "@/hooks/useOutputPref";
import { PREF_OUTPUTS, outputLook, normalizePref, designOf, prefState, prefVars, ruleOf, noticeOnly, alertOf } from "@/lib/outputPrefs";
import { useChurch } from "@/hooks/useChurch";
import { sampleLive, sampleNotice, sampleAlert, sampleTimer, SAMPLE_ITEMS } from "../console/settings/sample";
import { ConfirmContext, deleteQuestion } from "../console/ConfirmDialog";
import useSortable from "../console/useSortable";
import { moveTo } from "@/lib/console/dropOrder";
import { useWinCol } from "@/components/console/winLayout";
import useDraftHistory from "@/hooks/useDraftHistory";
import { historyKey, hasOwnUndo } from "@/lib/editorHistory";
import UndoRedo from "./UndoRedo";
import ScreensMenu, { IDLE_SCREEN } from "./ScreensMenu";
import IdleEditor from "./IdleEditor";

const HANDLES = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
// Arrow presses this close together are one Desfazer step.
const NUDGE_WINDOW = 1000;
// The optional grid (Rodada P, P8-3): this computer's, never the design's.
const GRID_KEY = "keryx.editor.grid";
const readGrid = () => { try { return cleanGrid(JSON.parse(localStorage.getItem(GRID_KEY) || "null")); } catch { return cleanGrid(null); } };
// "Mostrar com" (Rodada G2): the states the canvas can draw the screen in,
// so an element shown only without anything on air or with a timer can be
// seen where it appears. "No ar" is the real live state (else the example).
const SOURCES = [["sample", "Exemplo (letra)"], ["idle", "Sem nada no ar"], ["tool", "Timer"], ["auto", "No ar"]];
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
// real settings dressing the preview, and the screen's settings (its five
// blocks: Destino, Conteúdo, Aparência, Comportamento, Diagnóstico) live in
// the same window (OutputAjustes, Rodada H2). A screen with no design follows its page and
// opens straight into editing, the canvas seeded with that page's ready
// design (owner 2026-10-13): the seed is the baseline, so only real edits
// are "não salvo", and nothing is written until "Salvar a tela".
// `hosted`: a page of THE window (Rodada C, fase d2) — the editor draws its
// own WinBar (No ar | Exemplo as the bar's tool; Cancelar and Salvar a tela
// as its actions; ⧉ Destacar from the window, or onDetach) and no footer;
// the middle column splits into Desenho | Ajustes. Both hosts — the
// console's window and a detached /Janela — mount it hosted.
// The Editor de telas: the Tela ociosa (IdleEditor, owner 2026-10-19) or an
// output's drawing and settings; another component each, so switching remounts.
export default function ScreenEditor(props) {
    return props.screenPath === IDLE_SCREEN ? <IdleEditor {...props} screens={EDITOR_SCREENS} /> : <OutputScreenEditor {...props} />;
}

function OutputScreenEditor({ say, live: liveState, screenPath, media = [], themes = [], onClose, onSwitch, escRef = null, leaveRef = null, active = true, hosted = false, onDetach = null, askText = null }) {
    // The columns a splitter resizes, kept per page on this computer (Rodada D3).
    const colAjustes = useWinCol("screen.ajustes", { name: "Ajustes", def: 400, min: 340, max: 720 });
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
    // The elements marked (Rodada P, P8-3; multiSelect.js, the console's one
    // model): a click picks one, Ctrl + click adds or takes one, Shift + click
    // a range of the list. `sel` is the one the form edits (the last picked).
    const [ms, setMs] = useState(EMPTY_SELECTION);
    const sel = ms.lead !== null && ms.ids.includes(ms.lead) ? ms.lead : ms.ids[ms.ids.length - 1] ?? null;
    const marked = ms.ids;
    const many = marked.length > 1;
    const setSel = (id) => setMs(id ? { ids: [id], anchor: id, lead: id } : EMPTY_SELECTION);
    const [grid, setGridState] = useState(readGrid);
    const setGrid = (patch) => setGridState((g) => { const next = cleanGrid({ ...g, ...patch }); try { localStorage.setItem(GRID_KEY, JSON.stringify(next)); } catch { /* this computer only */ } return next; });
    const [adding, setAdding] = useState(false);
    const [confirm, setConfirm] = useState(null); // "reset" | "discard" (detached only)
    // Both windows (the console's, a detached /Janela) provide the
    // one-question guard; a host without one (null) gets the two-step toast.
    const askCtx = useContext(ConfirmContext);
    const [busy, setBusy] = useState(false);
    const [source, setSource] = useState("auto"); // SOURCES: "sample" | "idle" | "tool" | "auto"
    const [guides, setGuides] = useState([]);
    const [pickImage, setPickImage] = useState(false);
    // The middle column's two halves (Rodada C, fase d2): the drawing, and
    // the output's settings (which save at once, outside the draft). It opens
    // on the settings (owner 2026-10-27, T1 = A: what the operator changes
    // each week); a click on the canvas goes to the drawing.
    const [tab, setTab] = useState("ajustes");
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
    // The list's order (top first) is where a Shift range runs.
    const order = (draft?.elements || []).map((e) => e.id).reverse();
    const pickEl = (id, e) => setMs((s) => clickSelection(s, order, id, e || {}).sel);
    const markedEls = draft ? draft.elements.filter((e) => marked.includes(e.id)) : [];
    // The text bar dresses every marked element that draws text.
    const lookEls = markedEls.filter((e) => LOOK_TYPES.has(e.type));
    const lookIds = lookEls.map((e) => e.id);
    const setLook = (patch) => { setConfirm(null); setDraft((d) => ({ ...d, elements: d.elements.map((e) => (lookIds.includes(e.id) ? { ...e, ...patch } : e)) })); };
    const onElements = (fn) => { setConfirm(null); setDraft((d) => ({ ...d, elements: fn(d.elements) })); };

    const add = (type) => {
        if (draft.elements.length >= MAX_ELEMENTS) { say(`Uma tela tem no máximo ${MAX_ELEMENTS} elementos.`); return; }
        const e = newElement(type);
        set({ elements: [...draft.elements, e] });
        setSel(e.id);
        setAdding(false);
    };
    const remove = (id) => { set({ elements: draft.elements.filter((e) => e.id !== id) }); if (marked.includes(id)) setMs((s) => ({ ids: s.ids.filter((x) => x !== id), anchor: null, lead: null })); };
    const removeMarked = () => { set({ elements: draft.elements.filter((e) => !marked.includes(e.id)) }); setSel(null); };
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
        setTab("desenho");
        if (!handle && (e.ctrlKey || e.metaKey || e.shiftKey)) { pickEl(el.id, e); return; }
        const group = !handle && many && marked.includes(el.id) ? { ids: marked, start: draft.elements } : null;
        if (!group) setSel(el.id);
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { id: el.id, handle, group, from: pct(e), rect0: { x: el.x, y: el.y, w: el.w, h: el.h }, moved: false };
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
        // The grid, when on, takes the magnet's place (Alt ignores both).
        const rest = draft.elements.filter((x) => x.id !== d.id && !d.group?.ids.includes(x.id));
        const snapped = e.altKey ? { rect: raw, guides: [] } : grid.on ? { rect: gridRect(raw, grid.step, d.handle), guides: [] } : snapRect(raw, rest, { resize: d.handle });
        setGuides(snapped.guides);
        // Several marked move as one, by the step the grabbed one took.
        if (d.group) setDraft((dr) => ({ ...dr, elements: moveElements(d.group.start, d.group.ids, snapped.rect.x - d.rect0.x, snapped.rect.y - d.rect0.y) }));
        else setEl(d.id, snapped.rect);
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
        if (nudge) { e.preventDefault(); e.stopPropagation(); setConfirm(null); history.mark(`nudge:${marked.join(",")}`, NUDGE_WINDOW); onElements((els) => moveElements(els, marked, nudge[0], nudge[1])); return; }
        if (e.key === "Delete") { e.preventDefault(); e.stopPropagation(); removeMarked(); return; }
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") { e.preventDefault(); e.stopPropagation(); duplicateEl(selected); }
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    // What the canvas shows ("Mostrar com", Rodada G2): a sample song 42
    // minutes into a service with a Setlist, nothing on air, a timer on air,
    // or what is on air when something is (else the sample song) — so every
    // element can be seen in the state its Aparece rule shows it.
    const madeAt = useRef(keryx.live.now());
    const sampleDoc = useMemo(() => {
        const session = { startedAt: madeAt.current - 42 * 60000 };
        return { sample: { ...sampleLive(madeAt.current), session }, idle: { ...emptyState(madeAt.current), session } };
    }, []);
    // The timer starts again each time "Timer" is picked, so it never sits
    // at 00:00:00 in an editor left open.
    const [toolAt, setToolAt] = useState(() => keryx.live.now());
    const toolDoc = useMemo(() => ({ ...sampleTimer(toolAt), session: sampleDoc.idle.session }), [toolAt, sampleDoc]);
    const pickSource = (v) => { if (v === "tool") setToolAt(keryx.live.now()); setSource(v); };
    const liveOn = liveState && mainLayer(liveState) !== "none" ? liveState : null;
    const shown = source === "tool" ? toolDoc : source === "idle" ? sampleDoc.idle : source === "sample" || !liveOn ? sampleDoc.sample : { ...liveOn, session: liveOn.session || sampleDoc.sample.session };
    // A screen that shows only avisos (Comunicação) gets an example aviso
    // when none is on air, as Telas e saídas' still does: a song would
    // leave it on the idle look. "Sem nada no ar" and "Timer" mean just that.
    const noticeDoc = useMemo(() => sampleNotice(madeAt.current), []);
    const avisos = renderer && noticeOnly(ruleOf(pref, path)) && !shown.communication && (source === "sample" || source === "auto") ? { ...shown, communication: noticeDoc.communication } : shown;
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
    // Why each element is drawn or faint in this state (elementState: the
    // eye, the Aparece rule, nothing to say), as the canvas computes it.
    // The rules read no clock: the time now is enough (the canvas ticks its own).
    const elCtx = layoutContext({ live, now: keryx.live.now(), upcoming: SAMPLE_ITEMS, hasService: true, church });
    const stateOf = (el) => elementState(el, elCtx, { logoUrl: church.logo });
    const selState = selected ? stateOf(selected) : "shown";

    const upload = async (file, apply) => {
        if (!file) return;
        try { const { file_url } = await uploadFile(file); apply(file_url); } catch (err) { say(err?.message || "Não foi possível copiar o arquivo."); }
    };
    const pictures = media.filter((m) => (m.type === "image" || m.type === "gif") && !m.missing);
    const nameOf = (url) => media.find((m) => m.file_url === url)?.title || decodeURIComponent(String(url).split("/").pop() || "imagem");

    const type = selected ? typeOf(selected.type) : null;
    const num = (el, k, v, lo, hi) => { const n = Number(v); if (Number.isFinite(n)) setEl(el.id, { [k]: Math.min(hi, Math.max(lo, n)) }); };
    const cLike = { say, live: liveState };
    // The element the text bar shows: the one the form edits, else the first marked that draws text.
    const barEl = lookEls.find((e) => e.id === sel) || lookEls[0] || null;

    const screensMenu = <ScreensMenu path={path} screens={EDITOR_SCREENS} onPick={switchTo} />;

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
    // The church's models (Rodada P, P8-3; layoutEditor.js): ScreenLayout
    // rows, synced between the church's computers, listed beside the
    // factory ones; "Salvar como modelo" names one and never overwrites.
    const client = useQueryClient();
    const modelRows = useQuery({ queryKey: ["editor", "screenModels"], queryFn: () => keryx.entities.ScreenLayout.list() }).data;
    useEffect(() => keryx.entities.ScreenLayout.subscribe(() => client.invalidateQueries({ queryKey: ["editor", "screenModels"] })), [client]);
    const models = useMemo(() => churchModels(modelRows), [modelRows]);
    const saveModel = async () => {
        if (!draft?.elements.length) { say("Ponha ao menos um elemento na tela antes de salvar como modelo."); return; }
        const typed = askText ? await askText({ title: "Salvar como modelo", placeholder: "Nome do modelo", ok: "Salvar modelo", hint: "Fica em “Começar de um modelo…”, para esta e as outras telas, em todos os computadores da igreja." }) : `${name} · modelo`;
        const label = (typed || "").trim().slice(0, 60);
        if (!label) return;
        if (modelNameTaken(models, label)) { say(`Já existe um modelo "${label}". Escolha outro nome.`); return; }
        try { await keryx.entities.ScreenLayout.create(modelFields(draft, label, path)); say(`Modelo "${label}" salvo. Está em “Começar de um modelo…”.`); } catch (err) { say(err?.message || "Não foi possível salvar o modelo."); }
    };
    const deleteModel = async (m) => {
        if (askCtx && !(await askCtx(deleteQuestion("o modelo", m.name)))) return;
        try { await keryx.entities.ScreenLayout.delete(m.id); say(`Modelo "${m.name}" excluído. As telas que começaram dele não mudam.`); } catch (err) { say(err?.message || "Não foi possível excluir o modelo."); }
    };
    const tabs = isStream ? null : <Seg small value={tab} onChange={setTab} label="Metade da coluna" options={[["desenho", "Desenho"], ["ajustes", "Ajustes"]]} />;

    const body = (
        <>
            {screensMenu}
            <div className="col nv-l" style={colAjustes.style}>
                <Panel caption={isStream ? "Ajustes" : tabs} actions={!isStream && !hosted && <span className="kx-count">{name}{dirty ? " · não salvo" : ""}</span>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <input ref={fileRef} type="file" hidden accept="image/*" onChange={(e) => { const el = selected; upload(e.target.files?.[0], (url) => { if (el) setProp(el.id, "url", url); setPickImage(false); }); e.target.value = ""; }} />
                    <input ref={bgFileRef} type="file" hidden accept="image/*" onChange={(e) => { upload(e.target.files?.[0], (url) => { set({ background: { ...draft.background, image: url } }); setPickBgImage(false); }); e.target.value = ""; }} />
                    {/* The text bar (Rodada P, P8-3 = A), fixed over the
                        column while an element that draws text is marked;
                        with several marked it dresses them all. */}
                    {!isStream && tab === "desenho" && barEl && (
                        <TextBar value={elementBar(barEl)} onChange={(p) => setLook(barToElement(p))} center="center" colorReset="Cor padrão" spacing
                            font={<select className="pl-input" style={{ width: "auto" }} value={barEl.font} onChange={(e) => setLook({ font: e.target.value })} aria-label="Fonte">{FONTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}</select>}
                            size={{ value: barEl.size, min: SIZE_RANGE[0], max: SIZE_RANGE[1], step: 0.1, unit: "", onChange: (n) => setLook({ size: n }) }} />
                    )}
                    <div className="nv-scroll cfg">
                        {isStream && <div className="listhead"><span className="kx-meta">A Transmissão é uma legenda sobre a transmissão ao vivo, sem canvas: só os ajustes abaixo.</span></div>}
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
                                        {ELEMENT_TYPES.filter((t) => t.group === g).map((t) => <Row key={t.id} icon={t.icon} title={t.name} meta={ELEMENT_HINTS[t.id]} onClick={() => add(t.id)} />)}
                                    </React.Fragment>
                                ))}
                            </div>
                        )}
                        {!draft.elements.length && !adding && <div className="listhead"><span className="kx-meta">Nenhum elemento ainda · Adicionar põe um no meio da tela; arraste-o para onde quiser.</span></div>}
                        {/* Topmost first; dragging a row changes who draws on
                            top (dropOrder.js moveTo); the eye hides the element
                            without losing its place (Rodada C, fase d2). */}
                        <div className={`le-els ${elSort.sorting ? "is-sorting" : ""}`} role="list" aria-label="Elementos da tela" {...elSort.listProps}>
                        {draft.elements.slice().reverse().map((el, di) => {
                            const t = typeOf(el.type);
                            // Its rule as a chip (none for Sempre); dimmed, with
                            // a dashed eye, while it is not drawn in this state.
                            const st = stateOf(el);
                            const rule = whenLabel(el.when);
                            return (
                                <Row key={el.id} single icon={t.icon} title={`${t.name}${el.label && el.label !== t.label ? ` · ${el.label}` : ""}`}
                                    className={`${marked.includes(el.id) ? (many ? "is-marked" : "is-selected") : ""} ${st !== "shown" ? "is-dim" : ""}`}
                                    onClick={(e) => pickEl(el.id, e)}
                                    dragProps={{ ...elSort.rowProps(di, { label: t.name, icon: t.icon }), style: elSort.rowStyle(di) }}
                                    actions={<>
                                        <IconBtn name={el.hidden ? "eye-off" : "eye"} small className={st === "rule" || st === "empty" ? "le-eye-ghost" : ""} title={el.hidden ? "Mostrar o elemento" : st === "shown" ? "Esconder o elemento (ele fica no lugar)" : `${ghostReason(el, st)} O olho esconde o elemento.`} aria-label={`${el.hidden ? "Mostrar" : "Esconder"} ${t.name}`} onClick={(e) => { e.stopPropagation(); setEl(el.id, { hidden: !el.hidden }); }} />
                                        <IconBtn name="x" small title="Tirar da tela" aria-label={`Tirar ${t.name} da tela`} onClick={(e) => { e.stopPropagation(); remove(el.id); }} />
                                    </>}>
                                    {rule && <span className={`le-rule ${st === "rule" ? "is-out" : ""}`} title={`Aparece: ${rule}`}>{rule}</span>}
                                    <span className="kx-glyph" title="Arraste para mudar quem desenha por cima"><Icon name="grip" /></span>
                                </Row>
                            );
                        })}
                        </div>

                        {many && (
                            <>
                                <div className="listhead"><span className="kx-section">{marked.length} elementos marcados</span><span style={{ flex: 1 }} /><Btn small onClick={removeMarked} title="Delete"><Icon name="x" />Tirar da tela</Btn></div>
                                <div className="frm nv-frm">
                                    <span className="k">Alinhar</span>
                                    <span className="nv-inline">
                                        <MenuButton label="Alinhar os elementos marcados" flip={false} trigger={(open, toggle) => <Btn small on={open} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>Alinhar<Icon name="chevron-down" size={12} /></Btn>}
                                            items={ALIGN_ACTIONS.map(([how, label]) => ({ label, onSelect: () => onElements((els) => alignElements(els, marked, how)) }))} />
                                        <span className="kx-meta">pela caixa em volta deles</span>
                                    </span>
                                    <span className="k">Distribuir</span>
                                    <span className="nv-inline">
                                        <Btn small disabled={marked.length < 3} title={marked.length < 3 ? "Marque três ou mais" : "Espaços iguais entre eles, da esquerda para a direita"} onClick={() => onElements((els) => distributeElements(els, marked, "x"))}>Na horizontal</Btn>
                                        <Btn small disabled={marked.length < 3} title={marked.length < 3 ? "Marque três ou mais" : "Espaços iguais entre eles, de cima para baixo"} onClick={() => onElements((els) => distributeElements(els, marked, "y"))}>Na vertical</Btn>
                                    </span>
                                    <span className="k" />
                                    <span className="kx-meta">Arraste um deles para mover todos; as setas também. Ctrl + clique tira um da marcação.</span>
                                </div>
                            </>
                        )}
                        {!many && selected && type && (
                            <>
                                <div className="listhead"><span className="kx-section">{type.name}</span><span style={{ flex: 1 }} />
                                    <MenuButton label="Alinhar na tela" flip={false} trigger={(open, toggle) => <Btn small on={open} aria-haspopup="menu" aria-expanded={open} title="Alinhar este elemento na tela · Ctrl + clique marca outros para alinhar entre eles" onClick={toggle}>Alinhar<Icon name="chevron-down" size={12} /></Btn>}
                                        items={ALIGN_ACTIONS.map(([how, label]) => ({ label, onSelect: () => onElements((els) => alignElements(els, [selected.id], how)) }))} />
                                    <Btn small onClick={() => duplicateEl(selected)} title="Ctrl+D"><Icon name="copy" />Duplicar</Btn></div>
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
                                    <span className="k">Rótulo</span><Field label="Rótulo" icon={null} value={selected.label} onChange={(v) => setEl(selected.id, { label: v.slice(0, 24) })} placeholder="Ex.: Próximo (opcional)" />
                                    <span className="k">Opacidade</span>
                                    <span className="nv-inline">
                                        <input type="range" className="le-range" min={10} max={100} step={1} value={Math.round((Number(selected.opacity) || 1) * 100)} onChange={(e) => setEl(selected.id, { opacity: Number(e.target.value) / 100 })} aria-label="Opacidade do elemento" />
                                        <span className="kx-meta">{Math.round((Number(selected.opacity) || 1) * 100)}%</span>
                                    </span>
                                    {/* The font, size, N I S, Aa, alignment, colour,
                                        outline and spacing are the text bar's, over
                                        the column (Rodada P, P8-3). */}
                                    {LOOK_TYPES.has(selected.type) && <>
                                        <span className="k">Vertical</span><Seg small label="Vertical" value={selected.valign} options={VALIGNS} onChange={(v) => setEl(selected.id, { valign: v })} />
                                        <span className="k">Caixa</span>
                                        <span className="nv-inline"><Switch on={selected.box} onChange={(on) => setEl(selected.id, { box: on })} label="Caixa atrás do elemento" /><span className="kx-meta">um cartão atrás, como as fichas do Palco</span></span>
                                    </>}
                                    {(selected.type === "monitor" || selected.type === "logo" || selected.type === "image") && <>
                                        <span className="k">Alinhar</span><Seg small label="Alinhar" value={selected.align} options={ALIGNS} onChange={(v) => setEl(selected.id, { align: v })} />
                                        <span className="k">Vertical</span><Seg small label="Vertical" value={selected.valign} options={VALIGNS} onChange={(v) => setEl(selected.id, { valign: v })} />
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
                            <Btn small disabled={!draft?.elements.length} onClick={saveModel} title="Guarda este desenho como um modelo da igreja, para começar outras telas dele">Salvar como modelo…</Btn>
                            <span style={{ flex: 1 }} />
                            {draft && (own || dirty) && <Btn small kind={confirm === "reset" ? "air" : ""} onClick={resetToPage}>{confirm === "reset" ? "Voltar mesmo" : "Voltar à página padrão…"}</Btn>}
                        </div>
                        {starting === "model" && (
                            <div className="nv-pick">
                                <div className="kx-menu-h"><span className="kx-section">De fábrica</span></div>
                                {FACTORY_LAYOUTS.map((l) => <Row key={l.id} single icon="layers" title={l.name} onClick={() => applyDesign(`o modelo "${l.name}"`, l)} />)}
                                <div className="kx-menu-h"><span className="kx-section">Da igreja</span></div>
                                {!models.length && <div className="listhead"><span className="kx-meta">Nenhum ainda · “Salvar como modelo…” guarda o desenho de uma tela aqui.</span></div>}
                                {models.map((m) => <Row key={m.id} single icon="layers" title={m.name} meta={categoryLabel(m.category)} onClick={() => applyDesign(`o modelo "${m.name}"`, m)}
                                    actions={<IconBtn name="trash" small title="Excluir o modelo…" aria-label={`Excluir o modelo ${m.name}`} onClick={(e) => { e.stopPropagation(); deleteModel(m); }} />} />)}
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
                        {(isStream || tab === "ajustes") && <OutputAjustes output={{ key: path, label: name }} row={row} themes={themes} c={cLike} alertSample={Boolean(alertSample)} onAlertSample={showAlertSample} />}
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
                <Panel className="is-head-wrap" title={<>Tela <span className="kx-count">· 16:9</span></>} actions={!isStream && <>
                    {/* The optional grid (Rodada P, P8-3): moves and resizes land on it. */}
                    <Btn small on={grid.on} aria-pressed={grid.on} title="Grade: mover e redimensionar caem nas linhas (Alt ignora)" onClick={() => setGrid({ on: !grid.on })}>Grade</Btn>
                    {grid.on && <Seg small label="Passo da grade" value={String(grid.step)} options={GRID_STEPS} onChange={(v) => setGrid({ step: Number(v) })} />}
                    <Seg small label="Mostrar com" value={source} options={SOURCES} onChange={pickSource} />
                </>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    {isStream || !draft ? (
                        <Empty icon={isStream ? "text" : "monitor"} title={isStream ? "Sem canvas" : "Abrindo a tela…"}>
                            {isStream ? "A legenda da Transmissão segue os ajustes ao lado." : null}
                        </Empty>
                    ) : (
                        <div className="le-stage">
                            <div ref={screenRef} className="le-screen" onPointerDown={() => setSel(null)}>
                                <div className={`le-fill ${renderer ? "kp-out" : ""}`} style={renderer ? prefVars(pref) || undefined : undefined}>
                                    <LayoutRenderer layout={draft} live={live} screenState={screenState} alert={canvasAlert} logoUrl={church.logo} upcoming={SAMPLE_ITEMS} hasService church={church} scale={!renderer ? pref.scale : undefined} embed ghost />
                                </div>
                                <div className={`le-over ${grid.on ? "has-grid" : ""}`} style={grid.on ? { "--le-grid": `${grid.step}%` } : undefined} onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
                                    {guides.map((g, i) => <i key={i} className={`le-guide ${g.axis}`} style={g.axis === "x" ? { left: `${g.at}%` } : { top: `${g.at}%` }} />)}
                                    {draft.elements.map((el) => (
                                        <div key={el.id} className={`le-hit ${marked.includes(el.id) ? "is-sel" : ""}`} style={{ left: `${el.x}%`, top: `${el.y}%`, width: `${el.w}%`, height: `${el.h}%` }}
                                            title={[typeOf(el.type)?.name, ghostReason(el, stateOf(el))].filter(Boolean).join(" · ")} onPointerDown={(e) => startDrag(e, el)} onDoubleClick={() => setSel(el.id)}>
                                            {!many && sel === el.id && HANDLES.map((h) => <i key={h} className={`le-h ${h}`} onPointerDown={(e) => startDrag(e, el, h)} />)}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                    {draft && !isStream && (
                        <div className="listhead nv-note">
                            {/* The selected element's state in words (the G2 mockup's line). */}
                            <span className="kx-meta le-why" aria-live="polite">
                                {!selected ? "Clique num elemento da lista ou da tela." : selState !== "shown"
                                    ? <><b>{typeOf(selected.type)?.name}</b> está {ghostReason(selected, selState).replace(/^E/, "e")}</>
                                    : <><b>{typeOf(selected.type)?.name}</b> aparece agora ({(whenLabel(selected.when) || "Sempre").toLowerCase()}).</>}
                            </span>
                            <span className="kx-meta">Arraste para mover, alças para redimensionar, setas ajustam 1 % (Shift 5 %), Alt ignora o imã e a grade, Ctrl ou Shift + clique marca vários, Delete tira o elemento, Ctrl+Z desfaz. Esmaecido = não aparece neste estado: tracejado pela regra Aparece ou por falta do que mostrar, pontilhado pelo olho; Mostrar com troca o estado.{path === "/VideoProjection" ? " Com um vídeo tocando, a saída Vídeo mostra só o vídeo, sem o desenho." : ""}</span>
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
