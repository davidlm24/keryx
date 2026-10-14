import React, { useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { usePrefs } from "@/hooks/useUser";
import Icon from "./Icon";
import { Btn, Seg } from "./kx";
import { useContextMenu } from "./ContextMenu";
import { useConfirm } from "./ConfirmDialog";
import { themeStyle, sameLook, newThemeBackground, defaultTheme, themeName } from "@/lib/console/themes";
import { applyThemeOnAir } from "./themeActions";
import { STYLE_KEYS, LAYER_ORDER, layerHidden, layerLocked } from "@shared/live-state.mjs";
import { OVERLAY_LIMIT, overlayName, newOverlay, overlayRows, moveOverlayRow } from "@/lib/console/overlays";
import { bgFields, bgLabel } from "@/lib/console/backgroundSpec";
import { fundoNow } from "@/lib/console/defaultFundo";
import { GENERATORS } from "@/lib/generators";
import { useLibraryPicker, ALL_KINDS } from "./library/libraryContext";
import { openEditor } from "@/lib/editorWindow";

// Camadas: what is on air as layers of the live state — Logo (live.logo), the
// Sobreposições (live.overlays), Texto principal (content) and Fundo
// (live.background) — each with its eye, padlock, place in the order and, on
// hover, a pencil. The settings under the list stay folded until a pencil
// opens them (owner 2026-10-14: Camadas is as tall as its list, never an
// empty card); the Fundo's pencil (and the row's right click) opens a menu
// that first names whose background the screen shows now (fundoNow) and then
// the wallpaper's two homes — Camadas › Fundo IS the papel de parede and its
// pencil the one live door since the Rodada B 2026-10-14 ("Papel de parede ×
// Tema"; the Programa's header button is gone): "Trocar o papel de parede…"
// writes today's culto's (pickServiceFundo, Console.jsx) and "Qualquer outro
// culto…" opens Configurações › Culto › Fora do ar, the fallback. The
// panel's + always adds a NEW text
// overlay (`addRef`, Console.jsx; owner 2026-10-14) up to OVERLAY_LIMIT: each
// one is its own row named by its text, and with 2+ they join under a thin
// "Sobreposições · n" heading — the group's handle in the layer order, while
// dragging a row inside the group only changes who draws on top among them
// (src/lib/console/overlays.js, tested). Esc and Limpar never touch them;
// each goes out by its eye or by Excluir… (useConfirm). The themes are their
// own module, Temas (ThemeStrip.jsx, `temasPanel` in Console.jsx), under
// Camadas. Texto principal keeps the item's title choice and, when the text
// on air looks otherwise, Restaurar / Salvar como novo; Fundo has no options
// of its own.

const LAYERS = [
    { id: "logo", name: "Logo", key: "logo" },
    { id: "text", name: "Texto principal", key: "content" },
    { id: "bg", name: "Fundo", key: "background" },
];
const BY_KEY = Object.fromEntries(LAYERS.map((l) => [l.key, l]));
const GEN_NAMES = Object.fromEntries(GENERATORS.map((g) => [g.id, g.name]));
const SIZES = [["small", "P"], ["medium", "M"], ["large", "G"]];
// Seg works on strings; these settings are numbers.
const num = (v) => (v == null || v === "" ? "" : String(v));

export default function Layers({ c, themes, onSettings, onFundo, addRef }) {
    // The item's title: its own choice (style.title), else the church's.
    const showTitle = usePrefs().show_item_title;
    const { cur } = c;
    const [sel, setSel] = useState("text");
    // The layer whose settings are open under the list (its pencil); none at
    // first. "logo"/"text"/"bg", or an overlay's own id.
    const [open, setOpen] = useState(null);
    // The padlock: the Fundo's is the live state's (layers.lock: nothing
    // changes it, whoever sends); the others — overlays included — only hold
    // Camadas' controls, on this computer.
    const [localLocks, setLocalLocks] = useState({});
    const menu = useContextMenu();
    const confirm = useConfirm();
    const pickLibrary = useLibraryPicker();
    const ovInput = useRef(null);
    // Drag to reorder: the anchors (fixed layers, the Sobreposições group)
    // follow live.layerOrder (top first); rows inside the group reorder only
    // the overlays among themselves.
    const [drag, setDrag] = useState(null);
    const [over, setOver] = useState(null);
    const [ovDrag, setOvDrag] = useState(null);
    const [ovOver, setOvOver] = useState(null);
    const order = Array.isArray(cur?.layerOrder) && cur.layerOrder.length === LAYER_ORDER.length ? cur.layerOrder : LAYER_ORDER;
    const moveLayer = (fromKey, toIndex) => {
        const next = order.filter((k) => k !== fromKey);
        next.splice(Math.min(toIndex > order.indexOf(fromKey) ? toIndex - 1 : toIndex, next.length), 0, fromKey);
        if (next.join() !== order.join()) c.callOp("layers.order", { order: next }).catch(() => {});
    };

    const content = cur?.content;
    const style = content?.style || {};
    const logo = cur?.logo || { visible: false, corner: "bottom-right", size: "medium" };
    const overlays = cur?.overlays || [];
    const ovRows = overlayRows(overlays);
    const openOv = overlays.find((o) => o?.id === open) || null;
    // The theme in use (Temas, c.themeId), else the default.
    const theme = themes.find((t) => t.id === c.themeId) || defaultTheme(themes);
    const modified = Boolean(theme && content && !sameLook(style, theme));

    const visible = { logo: logo.visible, text: Boolean(content) && !layerHidden(cur, "content"), bg: Boolean(cur?.background) && !layerHidden(cur, "background") };
    const op = (name, args) => c.callOp(name, args).catch(() => {});
    const locked = { ...localLocks, bg: layerLocked(cur, "background") };
    const toggleLock = (id) => {
        if (id === "bg") op("layers.lock", { layer: "background", locked: !locked.bg });
        else setLocalLocks({ ...localLocks, [id]: !localLocks[id] });
    };
    // The item's title over the slide (style.title): its own choice, not the theme's.
    const setTitle = (title) => { if (content) op("content.update", { style: Object.fromEntries(Object.entries({ ...style, title }).filter(([k]) => STYLE_KEYS.includes(k))) }); };
    // Overlays go whole to the live state; refused (Travar telas), say why.
    const setOverlays = (list) => c.callOp("overlays.set", { overlays: list }).catch((err) => c.say(err?.message || "Não foi possível mudar as sobreposições."));

    // The overlay's text field takes the focus once it is there and enabled
    // (a new overlay arrives with the live state, a moment after the click).
    const wantFocus = useRef(false);
    const focusOverlay = () => { wantFocus.current = true; };
    useEffect(() => {
        const el = ovInput.current;
        if (!wantFocus.current || !el || el.disabled) return;
        wantFocus.current = false;
        el.focus();
        el.select();
    });
    // The + (the panel's, Console.jsx) always makes a new one, up to the limit.
    const addOverlay = () => {
        if (overlays.length >= OVERLAY_LIMIT) { c.say(`No máximo ${OVERLAY_LIMIT} sobreposições.`); return; }
        const o = newOverlay(overlays);
        setOverlays([...overlays, o]);
        setSel(o.id);
        setOpen(o.id);
        focusOverlay();
    };
    useEffect(() => {
        if (!addRef) return undefined;
        addRef.current = addOverlay;
        return () => { if (addRef.current === addOverlay) addRef.current = null; };
    });

    const toggleEye = (id) => {
        if (id === "logo") op("logo.set", { visible: !logo.visible });
        // Texto principal and Fundo: hidden on every screen, still on air
        // (the arrows walk the text; a new item shows its text again).
        if (id === "text") {
            if (!content) c.say("Nada no ar.");
            else op(layerHidden(cur, "content") ? "layers.show" : "layers.hide", { layer: "content" });
        }
        if (id === "bg") {
            if (!cur?.background) c.say("Nada no Fundo.");
            else op(layerHidden(cur, "background") ? "layers.show" : "layers.hide", { layer: "background" });
        }
    };
    const toggleOvEye = (o) => setOverlays(overlays.map((x) => (x === o ? { ...x, enabled: x.enabled === false } : x)));
    // Excluir apaga, so it always asks first (useConfirm, as everywhere).
    const removeOverlay = async (o) => {
        const name = overlayName(o);
        if (!(await confirm({ title: "Excluir a sobreposição?", text: name ? `“${name}” sai das telas e da lista.` : "Ela sai das telas e da lista." }))) return;
        if (open === o.id) setOpen(null);
        setOverlays(overlays.filter((x) => x !== o));
    };
    const removeAllOverlays = async () => {
        if (!(await confirm({ title: "Excluir todas as sobreposições?", text: "Todas saem das telas e da lista." }))) return;
        if (overlays.some((o) => o?.id === open)) setOpen(null);
        setOverlays([]);
    };

    // Salvar como novo: the look on air (the item's own, a song's "Próprio")
    // as a theme, its Fundo with it. Unnamed (owner 2026-10-14: no made-up
    // date); the toast opens it in the Editor to give it a name.
    const saveAsNew = async () => {
        try {
            // A theme is saved with a background (owner 2026-10-14): the Fundo
            // on air goes with it, any kind (a picture, a clip, a generated one
            // with its numbers and colours, a colour), else the theme in use's;
            // with neither, the library is asked, and closing it saves nothing.
            const look = Object.fromEntries(Object.entries(themeStyle({ ...theme, ...style })).filter(([, v]) => v !== ""));
            let spec = newThemeBackground(cur?.background, theme);
            if (!spec) {
                const r = await pickLibrary({ accept: ALL_KINDS, title: "Fundo do tema novo" });
                spec = r?.spec || null;
                if (!spec) { c.say("Tema não salvo: falta o fundo."); return; }
            }
            const row = await keryx.entities.ProjectionTheme.create({ name: "", ...look, ...bgFields(spec) });
            c.setThemeId(row.id);
            c.say("Tema salvo, sem nome.", { label: "Editar", run: () => { const r = openEditor({ theme: row.id }); if (r?.error) c.say(r.error); } });
        } catch (err) {
            c.say(err?.message || "Não foi possível salvar o tema.");
        }
    };

    const disabled = Boolean(locked[open]);
    const inUseName = theme ? themeName(theme, "") : "";
    const editTheme = () => {
        if (!theme) { c.say("Nenhum tema em uso."); return; }
        const r = openEditor({ theme: theme.id });
        if (r?.error) c.say(r.error);
    };
    // The pencil on each layer opens (or folds) its settings under the list;
    // the Fundo has none: its pencil opens the menu below.
    const toggleOpen = (id) => {
        const next = open === id ? null : id;
        setSel(id);
        setOpen(next);
        if (next && !LAYERS.some((l) => l.id === next)) focusOverlay();
    };
    // The Fundo's menu (Rodada B 2026-10-14): first whose background the
    // screen shows now, then the papel de parede's two homes — today's
    // culto's (the one live door) and the fallback (Configurações › Culto).
    const fundoTitle = () => {
        const now = fundoNow(cur);
        if (!now) return "Nada no Fundo";
        if (now.from === "culto") return `No Fundo: o papel de parede do culto · ${bgLabel(cur.background, GEN_NAMES)}`;
        if (now.from === "igreja") return `No Fundo: o papel de parede da igreja · ${bgLabel(cur.background, GEN_NAMES)}`;
        return now.title ? `No Fundo: fundo de “${now.title}”` : "No Fundo: o fundo do item no ar";
    };
    const fundoItems = [
        { label: "Trocar o papel de parede…", icon: "image", onSelect: () => onFundo?.() },
        { label: "Qualquer outro culto…", icon: "sliders", onSelect: () => onSettings?.("culto") },
    ];
    const EDIT = {
        logo: { title: "Ajustes do logo", run: () => toggleOpen("logo") },
        text: { title: "Ajustes do texto principal", run: () => toggleOpen("text") },
        bg: { title: "O que está no Fundo e onde trocar", run: (e) => menu(e, { title: fundoTitle(), items: fundoItems }) },
    };

    // The drag of the layer order: the fixed rows, the group's heading and
    // the single (or empty) overlay row are its anchors; oi is the key's
    // place in `order`.
    const layerDrag = (key, oi) => ({
        draggable: true,
        onDragStart: (e) => { setDrag(key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", key); },
        onDragEnd: () => { setDrag(null); setOver(null); },
        onDragOver: (e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY > r.top + r.height / 2 ? oi + 1 : oi); },
        onDrop: (e) => { e.preventDefault(); if (drag) moveLayer(drag, over ?? oi); setDrag(null); setOver(null); },
    });
    const layerDropBefore = (key) => Boolean(drag) && drag !== key && over === order.indexOf(key);
    // The drag inside the group: who draws on top among the overlays (the
    // list's own order; r is the row's place, top first).
    const ovDragProps = (o, r) => ({
        draggable: true,
        onDragStart: (e) => { setOvDrag(o.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", String(o.id)); },
        onDragEnd: () => { setOvDrag(null); setOvOver(null); },
        onDragOver: (e) => { if (!ovDrag) return; e.preventDefault(); const rect = e.currentTarget.getBoundingClientRect(); setOvOver(e.clientY > rect.top + rect.height / 2 ? r + 1 : r); },
        onDrop: (e) => { e.preventDefault(); if (ovDrag) { const next = moveOverlayRow(overlays, ovDrag, ovOver ?? r); if (next !== overlays) setOverlays(next); } setOvDrag(null); setOvOver(null); },
    });

    const fixedRow = (L) => {
        const i = order.indexOf(L.key);
        return (
            <div key={L.id} className={`kx-layer kx-t ${sel === L.id ? "is-selected" : ""} ${visible[L.id] ? "" : "is-hidden"} ${drag === L.key ? "is-dragging" : ""} ${layerDropBefore(L.key) ? "is-dropbefore" : ""}`}
                onClick={() => setSel(L.id)} role="button" tabIndex={0}
                onContextMenu={(e) => menu(e, { title: L.id === "bg" ? fundoTitle() : L.name, items: [
                    { label: visible[L.id] ? "Ocultar" : "Mostrar", icon: visible[L.id] ? "eye-off" : "eye", onSelect: () => toggleEye(L.id) },
                    { label: locked[L.id] ? "Destravar" : "Travar", icon: locked[L.id] ? "unlock" : "lock", onSelect: () => toggleLock(L.id) },
                    ...(L.id === "bg" ? fundoItems : [{ label: "Editar…", icon: "edit", onSelect: EDIT[L.id].run }]),
                    { label: "Subir", disabled: i === 0, onSelect: () => moveLayer(L.key, i - 1) },
                    { label: "Descer", disabled: i === order.length - 1, onSelect: () => moveLayer(L.key, i + 2) },
                ] })}
                {...layerDrag(L.key, i)}
                title="Arraste para mudar a ordem das camadas">
                <span className="kx-glyph" style={{ cursor: "grab" }}><Icon name="grip" /></span>
                <button type="button" className={`kx-btn kx-t ${visible[L.id] ? "" : "is-off"}`} onClick={(e) => { e.stopPropagation(); toggleEye(L.id); }} aria-label={visible[L.id] ? "Ocultar" : "Mostrar"} title={visible[L.id] ? "Ocultar" : "Mostrar"}><Icon name={visible[L.id] ? "eye" : "eye-off"} /></button>
                <button type="button" className="kx-btn kx-t" style={locked[L.id] ? { color: "var(--fg-1)" } : undefined} onClick={(e) => { e.stopPropagation(); toggleLock(L.id); }} aria-label={locked[L.id] ? "Destravar" : "Travar"} title={L.id === "bg" ? (locked.bg ? "Destravar o Fundo" : "Travar o Fundo: nada que vai ao ar troca o fundo") : locked[L.id] ? "Destravar" : "Travar"}><Icon name={locked[L.id] ? "lock" : "unlock"} /></button>
                <span className="kx-layer-name">{L.name}</span>
                <button type="button" className={`kx-btn kx-t layer-edit ${open === L.id ? "is-on" : ""}`} onClick={(e) => { e.stopPropagation(); EDIT[L.id].run(e); }} aria-label={EDIT[L.id].title} title={EDIT[L.id].title} aria-expanded={L.id === "bg" ? undefined : open === L.id} aria-haspopup={L.id === "bg" ? "menu" : undefined}><Icon name="edit" /></button>
            </div>
        );
    };

    // One overlay as a row: its text as the name, the eye (enabled), a local
    // padlock and the pencil. Alone it is also the group's anchor in the
    // layer order (`anchor`); inside the group it drags among its siblings.
    const overlayRow = (o, r, anchor) => {
        const on = o.enabled !== false;
        const name = overlayName(o);
        const oi = order.indexOf("overlays");
        const isLocked = Boolean(locked[o.id]);
        const dragProps = anchor ? layerDrag("overlays", oi) : ovDragProps(o, r);
        const dropBefore = anchor ? layerDropBefore("overlays") : Boolean(ovDrag) && ovDrag !== o.id && ovOver === r;
        return (
            <div key={o.id} className={`kx-layer kx-t ${anchor ? "" : "is-ov"} ${sel === o.id ? "is-selected" : ""} ${on ? "" : "is-hidden"} ${(anchor ? drag === "overlays" : ovDrag === o.id) ? "is-dragging" : ""} ${dropBefore ? "is-dropbefore" : ""}`}
                onClick={() => setSel(o.id)} role="button" tabIndex={0}
                onContextMenu={(e) => menu(e, { title: name || "Sobreposição", items: [
                    { label: on ? "Ocultar" : "Mostrar", icon: on ? "eye-off" : "eye", onSelect: () => toggleOvEye(o) },
                    { label: isLocked ? "Destravar" : "Travar", icon: isLocked ? "unlock" : "lock", onSelect: () => toggleLock(o.id) },
                    { label: "Editar…", icon: "edit", onSelect: () => toggleOpen(o.id) },
                    ...(anchor
                        ? [{ label: "Subir", disabled: oi === 0, onSelect: () => moveLayer("overlays", oi - 1) },
                            { label: "Descer", disabled: oi === order.length - 1, onSelect: () => moveLayer("overlays", oi + 2) }]
                        : [{ label: "Subir", disabled: r === 0, onSelect: () => { const next = moveOverlayRow(overlays, o.id, r - 1); if (next !== overlays) setOverlays(next); } },
                            { label: "Descer", disabled: r === ovRows.length - 1, onSelect: () => { const next = moveOverlayRow(overlays, o.id, r + 2); if (next !== overlays) setOverlays(next); } }]),
                    { label: "Excluir…", icon: "x", onSelect: () => removeOverlay(o) },
                ] })}
                {...dragProps}
                title={anchor ? "Arraste para mudar a ordem das camadas" : "Arraste para mudar quem fica por cima, entre as sobreposições"}>
                <span className="kx-glyph" style={{ cursor: "grab" }}><Icon name="grip" /></span>
                <button type="button" className={`kx-btn kx-t ${on ? "" : "is-off"}`} onClick={(e) => { e.stopPropagation(); toggleOvEye(o); }} aria-label={on ? "Ocultar" : "Mostrar"} title={on ? "Ocultar" : "Mostrar"}><Icon name={on ? "eye" : "eye-off"} /></button>
                <button type="button" className="kx-btn kx-t" style={isLocked ? { color: "var(--fg-1)" } : undefined} onClick={(e) => { e.stopPropagation(); toggleLock(o.id); }} aria-label={isLocked ? "Destravar" : "Travar"} title={isLocked ? "Destravar" : "Travar"}><Icon name={isLocked ? "lock" : "unlock"} /></button>
                <span className={`kx-layer-name${name ? "" : " is-ph"}`}>{name || "Sobreposição"}</span>
                <button type="button" className={`kx-btn kx-t layer-edit ${open === o.id ? "is-on" : ""}`} onClick={(e) => { e.stopPropagation(); toggleOpen(o.id); }} aria-label="Ajustes da sobreposição" title="Ajustes da sobreposição" aria-expanded={open === o.id}><Icon name="edit" /></button>
            </div>
        );
    };

    // No overlay yet: the layer's place stays, muted; the eye (or the pencil)
    // makes the first one.
    const emptyOverlayRow = () => {
        const oi = order.indexOf("overlays");
        return (
            <div key="ov-empty" className={`kx-layer kx-t is-hidden ${sel === "ov" ? "is-selected" : ""} ${drag === "overlays" ? "is-dragging" : ""} ${layerDropBefore("overlays") ? "is-dropbefore" : ""}`}
                onClick={() => setSel("ov")} role="button" tabIndex={0}
                onContextMenu={(e) => menu(e, { title: "Sobreposição", items: [
                    { label: "Mostrar", icon: "eye", onSelect: addOverlay },
                    { label: "Subir", disabled: oi === 0, onSelect: () => moveLayer("overlays", oi - 1) },
                    { label: "Descer", disabled: oi === order.length - 1, onSelect: () => moveLayer("overlays", oi + 2) },
                ] })}
                {...layerDrag("overlays", oi)}
                title="Arraste para mudar a ordem das camadas">
                <span className="kx-glyph" style={{ cursor: "grab" }}><Icon name="grip" /></span>
                <button type="button" className="kx-btn kx-t is-off" onClick={(e) => { e.stopPropagation(); addOverlay(); }} aria-label="Mostrar" title="Mostrar (cria a primeira sobreposição)"><Icon name="eye-off" /></button>
                <button type="button" className="kx-btn kx-t" onClick={(e) => e.stopPropagation()} aria-label="Travar" title="Travar"><Icon name="unlock" /></button>
                <span className="kx-layer-name is-ph">Sobreposição</span>
                <button type="button" className="kx-btn kx-t layer-edit" onClick={(e) => { e.stopPropagation(); addOverlay(); }} aria-label="Ajustes da sobreposição" title="Ajustes da sobreposição (cria a primeira)"><Icon name="edit" /></button>
            </div>
        );
    };

    // The group's thin heading, with 2+: the overlays' handle in the layer order.
    const ovHead = () => {
        const oi = order.indexOf("overlays");
        return (
            <div key="ovhead" className={`kx-ovhead kx-t ${drag === "overlays" ? "is-dragging" : ""} ${layerDropBefore("overlays") ? "is-dropbefore" : ""}`}
                onContextMenu={(e) => menu(e, { title: "Sobreposições", items: [
                    { label: "Subir", disabled: oi === 0, onSelect: () => moveLayer("overlays", oi - 1) },
                    { label: "Descer", disabled: oi === order.length - 1, onSelect: () => moveLayer("overlays", oi + 2) },
                    { label: "Excluir todas…", icon: "x", onSelect: removeAllOverlays },
                ] })}
                {...layerDrag("overlays", oi)}
                title="Arraste para mudar a ordem das camadas — o grupo inteiro">
                <span className="kx-glyph"><Icon name="grip" /></span>
                <span className="kx-section">Sobreposições<span className="kx-count"> · {ovRows.length}</span></span>
            </div>
        );
    };

    const rows = order.flatMap((k) => {
        if (k !== "overlays") { const L = BY_KEY[k]; return L ? [fixedRow(L)] : []; }
        if (ovRows.length === 0) return [emptyOverlayRow()];
        if (ovRows.length === 1) return [overlayRow(ovRows[0], 0, true)];
        return [ovHead(), ...ovRows.map((o, r) => overlayRow(o, r, false))];
    });

    const openLayer = LAYERS.find((l) => l.id === open);
    const openIsOv = Boolean(open) && !openLayer;
    const openOvName = openOv ? overlayName(openOv) : "";
    const sectionLabel = openLayer ? openLayer.name : `Sobreposição${openOvName ? ` · ${openOvName}` : ""}`;

    return (
        <>
            {rows}
            {open && <div className="layerprops">
                <span className="kx-section" style={{ gridColumn: "1 / -1", paddingTop: 2 }}>{sectionLabel}{disabled ? " · travada" : ""}</span>
                {/* Texto principal: the look is the theme's, edited only in the
                    Editor de temas (owner's review 2026-10-14); here only the
                    item's title choice, and the way back to the theme in use
                    when what is on air looks otherwise (a song's own look). */}
                {open === "text" && <span className="layeracts" style={{ gridColumn: "1 / -1" }}><Btn small onClick={editTheme} title={inUseName ? `O tema em uso (${inUseName}) no Editor de temas` : "O tema em uso no Editor de temas"}>Editar tema…</Btn></span>}
                {open === "text" && (!content ? <span className="kx-meta" style={{ gridColumn: "1 / -1" }}>Nada no ar.</span> : <>
                    <span className="k">Título</span><Seg small value={style.title || (showTitle ? "show" : "hide")} options={[["show", "Com"], ["hide", "Sem"]]} onChange={(v) => !disabled && setTitle(v)} />
                    {modified && <>
                        <span className="kx-meta" style={{ gridColumn: "1 / -1" }}>{inUseName ? <>Diferente do tema <b>{inUseName}</b></> : "Diferente do tema em uso"}</span>
                        <span className="layeracts" style={{ gridColumn: "1 / -1" }}>
                            <Btn kind="outline" small disabled={disabled} onClick={() => applyThemeOnAir(c, theme)} title="O texto no ar volta ao visual do tema em uso">Restaurar</Btn>
                            <Btn small onClick={saveAsNew} title="Guarda o visual no ar como um tema novo, sem nome">Salvar como novo</Btn>
                        </span>
                    </>}
                </>)}
                {open === "logo" && (<>
                    <span className="k">Canto</span>
                    <select value={logo.corner} disabled={disabled} onChange={(e) => op("logo.set", { corner: e.target.value })} aria-label="Canto do logo">
                        <option value="top-left">Alto esq.</option><option value="top-right">Alto dir.</option><option value="bottom-left">Baixo esq.</option><option value="bottom-right">Baixo dir.</option>
                    </select>
                    <span className="k">Tamanho</span><Seg small value={logo.width ? "" : logo.size} options={SIZES} onChange={(v) => !disabled && op("logo.set", { size: v, width: null })} />
                    <span className="k">Largura</span>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <input type="range" min={4} max={30} step={1} disabled={disabled} value={logo.width ?? ({ small: 5, medium: 8, large: 12 }[logo.size] || 8)} onChange={(e) => op("logo.set", { width: Number(e.target.value) })} aria-label="Largura do logo (% da tela)" style={{ flex: 1, minWidth: 0 }} />
                        <span className="kx-meta" style={{ width: 34, textAlign: "right" }}>{logo.width ? `${logo.width}%` : "—"}</span>
                    </span>
                    <span className="k">Opacidade</span><Seg small value={num(logo.opacity ?? 1)} options={[["1", "100%"], ["0.7", "70%"], ["0.4", "40%"]]} onChange={(v) => !disabled && op("logo.set", { opacity: v === "1" ? null : Number(v) })} />
                    <span className="k">Margem</span><Seg small value={num(logo.margin ?? 3)} options={[["1.5", "Junto"], ["3", "Normal"], ["6", "Afastado"]]} onChange={(v) => !disabled && op("logo.set", { margin: v === "3" ? null : Number(v) })} />
                    <span className="layeracts" style={{ gridColumn: "1 / -1" }}><Btn small onClick={() => onSettings?.("igreja")} title="O logo da igreja · Configurações › Igreja">Logo da igreja…</Btn></span>
                </>)}
                {openIsOv && (<>
                    <span className="k">Texto</span>
                    <input ref={ovInput} value={openOv?.content || ""} disabled={disabled || !openOv} onChange={(e) => openOv && setOverlays(overlays.map((o) => (o === openOv ? { ...o, content: e.target.value } : o)))} aria-label="Texto da sobreposição" style={{ height: 24, background: "var(--bg-2)", border: 0, borderRadius: 4, color: "var(--fg-1)", padding: "0 6px", font: "inherit", minWidth: 0 }} />
                    <span className="k">Posição</span><Seg small value={openOv ? (openOv.y > 50 ? (openOv.x > 30 ? "bc" : "bl") : "tl") : "bl"} options={[["bl", "Baixo esq."], ["bc", "Baixo centro"], ["tl", "Alto esq."]]} onChange={(v) => { if (!openOv || disabled) return; const pos = { bl: { x: 4, y: 86 }, bc: { x: 30, y: 86 }, tl: { x: 4, y: 4 } }[v]; setOverlays(overlays.map((o) => (o === openOv ? { ...o, ...pos } : o))); }} />
                    <span className="layeracts" style={{ gridColumn: "1 / -1" }}><Btn small disabled={disabled || !openOv} onClick={() => openOv && removeOverlay(openOv)} title="Apaga esta sobreposição">Excluir…</Btn></span>
                </>)}
            </div>}
        </>
    );
}
