import React, { useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { usePrefs } from "@/hooks/useUser";
import Icon from "./Icon";
import { Btn, IconBtn, Seg } from "./kx";
import { useContextMenu } from "./ContextMenu";
import { themeStyle, sameLook, themeBackgroundArgs, defaultTheme, themeName } from "@/lib/console/themes";
import { applyThemeOnAir } from "./themeActions";
import { STYLE_KEYS, LAYER_ORDER, layerHidden, layerLocked } from "@shared/live-state.mjs";
import { bgFields, cleanSpec, bgLabel } from "@/lib/console/backgroundSpec";
import { fundoNow } from "@/lib/console/defaultFundo";
import { GENERATORS } from "@/lib/generators";
import { openEditor } from "@/lib/editorWindow";

// Camadas: what is on air as four layers of the live state — Logo
// (live.logo), Sobreposição (live.overlays), Texto principal (content) and
// Fundo (live.background) — each with its eye, padlock, place in the order
// and, on hover, a pencil. The settings under the list stay folded until a
// pencil opens them (owner 2026-10-14: Camadas is as tall as its list, never
// an empty card); the Fundo's pencil (and the row's right click) opens a menu
// that first names whose background the screen shows now (fundoNow) and then
// routes: "Trocar o fundo do culto…" is the Programa's same via, "Fundo
// padrão da igreja…" opens Configurações › Aparência — it no longer opens
// the library blind (owner's OK 2026-10-14, "Fundo em três vias"). The panel's + adds the text
// overlay (`addRef`, Console.jsx). The themes are their own module, Temas
// (ThemeStrip.jsx, `temasPanel` in Console.jsx), under Camadas. Texto principal keeps the item's title
// choice and, when the text on air looks otherwise, Restaurar / Salvar como
// novo; Fundo has no options of its own.

const LAYERS = [
    { id: "logo", name: "Logo", key: "logo" },
    { id: "ov", name: "Sobreposição", key: "overlays" },
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
    // The layer whose settings are open under the list (its pencil); none at first.
    const [open, setOpen] = useState(null);
    // The padlock: the Fundo's is the live state's (layers.lock: nothing
    // changes it, whoever sends); the others only hold Camadas' controls.
    const [localLocks, setLocalLocks] = useState({});
    const menu = useContextMenu();
    const ovInput = useRef(null);
    // Drag to reorder: the list follows live.layerOrder (top first).
    const [drag, setDrag] = useState(null);
    const [over, setOver] = useState(null);
    const order = Array.isArray(cur?.layerOrder) && cur.layerOrder.length === LAYER_ORDER.length ? cur.layerOrder : LAYER_ORDER;
    const rows = order.map((k) => BY_KEY[k]).filter(Boolean);
    const moveLayer = (fromKey, toIndex) => {
        const next = order.filter((k) => k !== fromKey);
        next.splice(Math.min(toIndex > order.indexOf(fromKey) ? toIndex - 1 : toIndex, next.length), 0, fromKey);
        if (next.join() !== order.join()) c.callOp("layers.order", { order: next }).catch(() => {});
    };

    const content = cur?.content;
    const style = content?.style || {};
    const logo = cur?.logo || { visible: false, corner: "bottom-right", size: "medium" };
    const overlays = cur?.overlays || [];
    const textOverlay = overlays.find((o) => o.type === "text" || o.type === "announcement") || null;
    // The theme in use (Temas, c.themeId), else the default.
    const theme = themes.find((t) => t.id === c.themeId) || defaultTheme(themes);
    const modified = Boolean(theme && content && !sameLook(style, theme));

    const visible = { logo: logo.visible, ov: Boolean(textOverlay) && textOverlay.enabled !== false, text: Boolean(content) && !layerHidden(cur, "content"), bg: Boolean(cur?.background) && !layerHidden(cur, "background") };
    const op = (name, args) => c.callOp(name, args).catch(() => {});
    const locked = { ...localLocks, bg: layerLocked(cur, "background") };
    const toggleLock = (id) => {
        if (id === "bg") op("layers.lock", { layer: "background", locked: !locked.bg });
        else setLocalLocks({ ...localLocks, [id]: !localLocks[id] });
    };
    // The item's title over the slide (style.title): its own choice, not the theme's.
    const setTitle = (title) => { if (content) op("content.update", { style: Object.fromEntries(Object.entries({ ...style, title }).filter(([k]) => STYLE_KEYS.includes(k))) }); };
    const setOverlays = (list) => op("overlays.set", { overlays: list });

    // The text overlay: a new one where there is none (the eye, the panel's +).
    const newOverlay = () => ({ id: `ov-${Date.now()}`, type: "text", content: "Sobreposição", x: 4, y: 86, width: 40, enabled: true });
    // The overlay's text field takes the focus once it is there and enabled
    // (a new overlay arrives with the live state, a moment after the click).
    const wantFocus = useRef(false);
    const focusOverlay = () => { wantFocus.current = true; };
    useEffect(() => {
        const el = ovInput.current;
        if (!wantFocus.current || open !== "ov" || !el || el.disabled) return;
        wantFocus.current = false;
        el.focus();
        el.select();
    });
    const addOverlay = () => {
        if (!textOverlay) setOverlays([...overlays, newOverlay()]);
        setSel("ov");
        setOpen("ov");
        focusOverlay();
    };
    useEffect(() => {
        if (!addRef) return undefined;
        addRef.current = addOverlay;
        return () => { if (addRef.current === addOverlay) addRef.current = null; };
    });

    const toggleEye = (id) => {
        if (id === "logo") op("logo.set", { visible: !logo.visible });
        if (id === "ov" && textOverlay) setOverlays(overlays.map((o) => (o === textOverlay ? { ...o, enabled: o.enabled === false } : o)));
        if (id === "ov" && !textOverlay) setOverlays([...overlays, newOverlay()]);
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

    // Salvar como novo: the look on air (the item's own, a song's "Próprio")
    // as a theme, its Fundo with it. Unnamed (owner 2026-10-14: no made-up
    // date); the toast opens it in the Editor to give it a name.
    const saveAsNew = async () => {
        try {
            // The Fundo on air goes with the theme, any kind (a picture, a
            // clip, a generated one with its numbers and colours, a colour);
            // with none, the theme's own stays.
            const look = Object.fromEntries(Object.entries(themeStyle({ ...theme, ...style })).filter(([, v]) => v !== ""));
            const spec = cleanSpec(cur?.background) || (theme ? cleanSpec(themeBackgroundArgs(theme)) : null);
            const row = await keryx.entities.ProjectionTheme.create({ name: "", ...look, ...bgFields(spec) });
            c.setThemeId(row.id);
            c.say("Tema salvo, sem nome.", { label: "Editar", run: () => { const r = openEditor({ theme: row.id }); if (r?.error) c.say(r.error); } });
        } catch (err) {
            c.say(err?.message || "Não foi possível salvar o tema.");
        }
    };

    const disabled = locked[open];
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
        if (next === "ov") focusOverlay();
    };
    // The Fundo's menu (owner's OK 2026-10-14, "Fundo em três vias"): first
    // whose background the screen shows now, then the two doors — the
    // culto's (the Programa's same via) and the church's (Aparência).
    const fundoTitle = () => {
        const now = fundoNow(cur);
        if (!now) return "Nada no Fundo";
        if (now.from === "culto") return `No Fundo: Fundo do culto · ${bgLabel(cur.background, GEN_NAMES)}`;
        if (now.from === "igreja") return `No Fundo: Fundo padrão (da igreja) · ${bgLabel(cur.background, GEN_NAMES)}`;
        return now.title ? `No Fundo: fundo de “${now.title}”` : "No Fundo: o fundo do item no ar";
    };
    const fundoItems = [
        { label: "Trocar o fundo do culto…", icon: "image", onSelect: () => onFundo?.() },
        { label: "Fundo padrão da igreja…", icon: "sliders", onSelect: () => onSettings?.("aparencia") },
    ];
    const EDIT = {
        logo: { title: "Ajustes do logo", run: () => toggleOpen("logo") },
        ov: { title: "Ajustes da sobreposição", run: () => toggleOpen("ov") },
        text: { title: "Ajustes do texto principal", run: () => toggleOpen("text") },
        bg: { title: "O que está no Fundo e onde trocar", run: (e) => menu(e, { title: fundoTitle(), items: fundoItems }) },
    };

    return (
        <>
            {rows.map((L, i) => (
                <div key={L.id} className={`kx-layer kx-t ${sel === L.id ? "is-selected" : ""} ${visible[L.id] ? "" : "is-hidden"} ${drag === L.key ? "is-dragging" : ""} ${over === i && drag && drag !== L.key ? "is-dropbefore" : ""}`}
                    onClick={() => setSel(L.id)} role="button" tabIndex={0}
                    onContextMenu={(e) => menu(e, { title: L.id === "bg" ? fundoTitle() : L.name, items: [
                        { label: visible[L.id] ? "Ocultar" : "Mostrar", icon: visible[L.id] ? "eye-off" : "eye", onSelect: () => toggleEye(L.id) },
                        { label: locked[L.id] ? "Destravar" : "Travar", icon: locked[L.id] ? "unlock" : "lock", onSelect: () => toggleLock(L.id) },
                        ...(L.id === "bg" ? fundoItems : [{ label: "Editar…", icon: "edit", onSelect: EDIT[L.id].run }]),
                        { label: "Subir", disabled: i === 0, onSelect: () => moveLayer(L.key, i - 1) },
                        { label: "Descer", disabled: i === rows.length - 1, onSelect: () => moveLayer(L.key, i + 2) },
                    ] })}
                    draggable
                    onDragStart={(e) => { setDrag(L.key); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", L.key); }}
                    onDragEnd={() => { setDrag(null); setOver(null); }}
                    onDragOver={(e) => { if (!drag) return; e.preventDefault(); const r = e.currentTarget.getBoundingClientRect(); setOver(e.clientY > r.top + r.height / 2 ? i + 1 : i); }}
                    onDrop={(e) => { e.preventDefault(); if (drag) moveLayer(drag, over ?? i); setDrag(null); setOver(null); }}
                    title="Arraste para mudar a ordem das camadas">
                    <span className="kx-glyph" style={{ cursor: "grab" }}><Icon name="grip" /></span>
                    <button type="button" className={`kx-btn kx-t ${visible[L.id] ? "" : "is-off"}`} onClick={(e) => { e.stopPropagation(); toggleEye(L.id); }} aria-label={visible[L.id] ? "Ocultar" : "Mostrar"} title={visible[L.id] ? "Ocultar" : "Mostrar"}><Icon name={visible[L.id] ? "eye" : "eye-off"} /></button>
                    <button type="button" className="kx-btn kx-t" style={locked[L.id] ? { color: "var(--fg-1)" } : undefined} onClick={(e) => { e.stopPropagation(); toggleLock(L.id); }} aria-label={locked[L.id] ? "Destravar" : "Travar"} title={L.id === "bg" ? (locked.bg ? "Destravar o Fundo" : "Travar o Fundo: nada que vai ao ar troca o fundo") : locked[L.id] ? "Destravar" : "Travar"}><Icon name={locked[L.id] ? "lock" : "unlock"} /></button>
                    <span className="kx-layer-name">{L.name}</span>
                    <button type="button" className={`kx-btn kx-t layer-edit ${open === L.id ? "is-on" : ""}`} onClick={(e) => { e.stopPropagation(); EDIT[L.id].run(e); }} aria-label={EDIT[L.id].title} title={EDIT[L.id].title} aria-expanded={L.id === "bg" ? undefined : open === L.id} aria-haspopup={L.id === "bg" ? "menu" : undefined}><Icon name="edit" /></button>
                </div>
            ))}
            {open && <div className="layerprops">
                <span className="kx-section" style={{ gridColumn: "1 / -1", paddingTop: 2 }}>{LAYERS.find((l) => l.id === open)?.name}{disabled ? " · travada" : ""}</span>
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
                {open === "ov" && (<>
                    <span className="k">Texto</span>
                    <input ref={ovInput} value={textOverlay?.content || ""} disabled={disabled || !textOverlay} onChange={(e) => setOverlays(overlays.map((o) => (o === textOverlay ? { ...o, content: e.target.value } : o)))} placeholder={textOverlay ? "" : "Mostre a camada para criar"} aria-label="Texto da sobreposição" style={{ height: 24, background: "var(--bg-2)", border: 0, borderRadius: 4, color: "var(--fg-1)", padding: "0 6px", font: "inherit", minWidth: 0 }} />
                    <span className="k">Posição</span><Seg small value={textOverlay ? (textOverlay.y > 50 ? (textOverlay.x > 30 ? "bc" : "bl") : "tl") : "bl"} options={[["bl", "Baixo esq."], ["bc", "Baixo centro"], ["tl", "Alto esq."]]} onChange={(v) => { if (!textOverlay || disabled) return; const pos = { bl: { x: 4, y: 86 }, bc: { x: 30, y: 86 }, tl: { x: 4, y: 4 } }[v]; setOverlays(overlays.map((o) => (o === textOverlay ? { ...o, ...pos } : o))); }} />
                    {textOverlay && <div style={{ gridColumn: "1 / -1" }}><IconBtn name="x" title="Excluir sobreposição" small onClick={() => setOverlays(overlays.filter((o) => o !== textOverlay))} /></div>}
                </>)}
            </div>}
        </>
    );
}
