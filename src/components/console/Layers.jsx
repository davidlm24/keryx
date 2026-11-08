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
import { OVERLAY_LIMIT, overlayName, newOverlay, overlayRows, overlayPlace, placeAt, OVERLAY_ROWS, OVERLAY_COLS } from "@/lib/console/overlays";
import { bgFields, bgLabel } from "@/lib/console/backgroundSpec";
import { fundoNow } from "@/lib/console/defaultFundo";
import { GENERATORS } from "@/lib/generators";
import { useLibraryPicker, ALL_KINDS } from "./library/libraryContext";
import { openEditor } from "@/lib/editorWindow";
import { menuItem } from "@/lib/console/menuLabels";

// Camadas: what is on air as layers of the live state — Logo no canto
// (live.logo), the Sobreposições (live.overlays), Texto principal (content)
// and Fundo (live.background) — always in that order, the program's
// (LAYER_ORDER; owner 2026-10-28, K1 = A: as in ProPresenter and Holyrics the
// operator shows, hides and holds layers, never reorders them). Each row has
// its eye and, on hover, a pencil; only the Fundo has a padlock, the one that
// holds (K2 = A: the others only greyed a form on this computer). The
// settings under the list stay folded until a pencil opens them (owner
// 2026-10-14: Camadas is as tall as its list, never an empty card); the
// Fundo's pencil (and the row's right click) opens a menu that first names
// whose background the screen shows now (fundoNow) and then the wallpaper's
// two homes — Camadas › Fundo IS the papel de parede and its pencil the one
// live door since the Rodada B 2026-10-14: "Trocar o papel de parede…"
// writes today's culto's (pickServiceFundo, Console.jsx) and "Qualquer outro
// culto…" opens Configurações › Culto › Fora do ar, the fallback.
// The Logo no canto's pencil keeps only the corner (K4 = A); its look lives
// in Configurações › Igreja. The panel's + adds a NEW text overlay (`addRef`,
// Console.jsx) up to OVERLAY_LIMIT, born OFF the air with no text (K3 = A):
// Enter in its field (or its eye) puts it on. Each is its own row named by
// its text; with 2+ they join under a thin "Sobreposições · n" heading. Esc
// and Limpar never touch them; each goes out by its eye or by Excluir…
// (useConfirm). The themes are their own module, Temas (ThemeStrip.jsx),
// under Camadas. Texto principal keeps the item's title choice and, when the
// text on air looks otherwise, Restaurar / Salvar como novo.

// What a layer button acts on, said with it (C-27: "Ocultar o Fundo",
// never a bare "Ocultar"), and a row's hidden/locked state in words.
const LAYER_OF = { logo: "o Logo no canto", text: "o Texto principal", bg: "o Fundo" };
const ovOf = (name) => (name ? `a sobreposição “${name}”` : "a sobreposição");
const layerState = (hidden, locked, empty = false) => [empty ? "camada vazia" : hidden && "camada oculta", locked && "camada travada"].filter(Boolean).join(", ") || undefined;

const LAYERS = [
    { id: "logo", name: "Logo no canto", key: "logo" },
    { id: "text", name: "Texto principal", key: "content" },
    { id: "bg", name: "Fundo", key: "background" },
];
const BY_KEY = Object.fromEntries(LAYERS.map((l) => [l.key, l]));
const GEN_NAMES = Object.fromEntries(GENERATORS.map((g) => [g.id, g.name]));
const CORNERS = [["top-left", "Alto esq."], ["top-right", "Alto dir."], ["bottom-left", "Baixo esq."], ["bottom-right", "Baixo dir."]];
const NO_TEXT = "Escreva o texto da sobreposição primeiro.";

export default function Layers({ c, themes, onSettings, onFundo, addRef }) {
    // The item's title: its own choice (style.title), else the church's.
    const showTitle = usePrefs().show_item_title;
    const { cur } = c;
    const [sel, setSel] = useState("text");
    // The layer whose settings are open under the list (its pencil); none at
    // first. "logo"/"text", or an overlay's own id.
    const [open, setOpen] = useState(null);
    const menu = useContextMenu();
    const confirm = useConfirm();
    const pickLibrary = useLibraryPicker();
    const ovInput = useRef(null);

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
    // Empty (nothing in the layer) is not hidden: its own look, the name
    // muted with "vazio" and no eye-off (audit C-45). The logo always has
    // one (the church's, else KERYX's), so it is only ever hidden.
    const empty = { logo: false, text: !content, bg: !cur?.background };
    const op = (name, args) => c.callOp(name, args).catch(() => {});
    // The Fundo's padlock is the live state's (layers.lock): nothing that goes
    // on air changes the Fundo, whoever sends, until it is let go.
    const lockedBg = layerLocked(cur, "background");
    const toggleLock = () => op("layers.lock", { layer: "background", locked: !lockedBg });
    // The item's title over the slide (style.title): its own choice, not the theme's.
    const setTitle = (title) => { if (content) op("content.update", { style: Object.fromEntries(Object.entries({ ...style, title }).filter(([k]) => STYLE_KEYS.includes(k))) }); };
    // Overlays go whole to the live state; refused (Travar telas), say why.
    const setOverlays = (list) => c.callOp("overlays.set", { overlays: list }).catch((err) => c.say(err?.message || "Não foi possível mudar as sobreposições."));
    const patchOverlay = (o, patch) => setOverlays(overlays.map((x) => (x === o ? { ...x, ...patch } : x)));

    // The open overlay's text is a draft until Enter or leaving the field:
    // the screens never see it being typed (K3 = A). Enter also puts it on air.
    const [draft, setDraft] = useState(null);
    useEffect(() => { setDraft(null); }, [open]);
    const draftText = draft ?? openOv?.content ?? "";
    const commitText = (onAir) => {
        if (!openOv) return;
        const text = draftText.trim();
        setDraft(null);
        const patch = {};
        if (text !== String(openOv.content || "").trim()) patch.content = text;
        // No text never stays on air (an empty box on the screens).
        if (!text) {
            if (openOv.enabled !== false) patch.enabled = false;
            if (onAir) c.say(NO_TEXT);
        } else if (onAir && openOv.enabled === false) patch.enabled = true;
        if (Object.keys(patch).length) patchOverlay(openOv, patch);
    };

    // The overlay's text field takes the focus once it is there
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
    // The + (the panel's, Console.jsx) always makes a new one, up to the limit,
    // off the air until its text is written.
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
    // An overlay with no text never goes on air (an empty box on the screens).
    const toggleOvEye = (o) => {
        const on = o.enabled !== false;
        if (!on && !overlayName(o)) { c.say(NO_TEXT); toggleOpen(o.id); return; }
        patchOverlay(o, { enabled: !on });
    };
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

    const inUseName = theme ? themeName(theme, "") : "";
    const editTheme = () => {
        if (!theme) { c.say("Nenhum tema em uso."); return; }
        const r = openEditor({ theme: theme.id });
        if (r?.error) c.say(r.error);
    };
    // The pencil on each layer opens (or folds) its settings under the list;
    // the Fundo has none: its pencil opens the menu below.
    function toggleOpen(id) {
        const next = open === id ? null : id;
        setSel(id);
        setOpen(next);
        if (next && !LAYERS.some((l) => l.id === next)) focusOverlay();
    }
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
        logo: { title: "Canto do logo", run: () => toggleOpen("logo") },
        text: { title: "Ajustes do texto principal", run: () => toggleOpen("text") },
        bg: { title: "O que está no Fundo e onde trocar", run: (e) => menu(e, { title: fundoTitle(), items: fundoItems }) },
    };

    const fixedRow = (L) => {
        const bg = L.id === "bg";
        return (
            <div key={L.id} className={`kx-layer kx-t ${sel === L.id ? "is-selected" : ""} ${empty[L.id] ? "is-empty" : visible[L.id] ? "" : "is-hidden"}`}
                onClick={() => setSel(L.id)} role="listitem" tabIndex={0} aria-label={L.name} aria-description={layerState(!visible[L.id], bg && lockedBg, empty[L.id])}
                onContextMenu={(e) => menu(e, { title: bg ? fundoTitle() : L.name, items: [
                    { label: visible[L.id] || empty[L.id] ? "Ocultar" : "Mostrar", icon: visible[L.id] || empty[L.id] ? "eye-off" : "eye", disabled: empty[L.id], onSelect: () => toggleEye(L.id) },
                    ...(bg ? [{ label: lockedBg ? "Destravar" : "Travar", icon: lockedBg ? "unlock" : "lock", onSelect: toggleLock }, ...fundoItems]
                        : [{ label: "Editar…", icon: "edit", onSelect: EDIT[L.id].run }]),
                ] })}>
                {empty[L.id]
                    ? <button type="button" className="kx-btn kx-t is-empty" onClick={(e) => { e.stopPropagation(); toggleEye(L.id); }} aria-disabled="true" aria-label={`${L.name}: vazio`} title={bg ? "Vazio: nada no Fundo" : "Vazio: nada no ar"}><Icon name="eye" /></button>
                    : <button type="button" className={`kx-btn kx-t ${visible[L.id] ? "" : "is-off"}`} onClick={(e) => { e.stopPropagation(); toggleEye(L.id); }} aria-label={`${visible[L.id] ? "Ocultar" : "Mostrar"} ${LAYER_OF[L.id]}`} title={visible[L.id] ? "Ocultar" : "Mostrar"}><Icon name={visible[L.id] ? "eye" : "eye-off"} /></button>}
                {bg
                    ? <button type="button" className={`kx-btn kx-t ${lockedBg ? "is-locked" : ""}`} onClick={(e) => { e.stopPropagation(); toggleLock(); }} aria-pressed={lockedBg} aria-label={`${lockedBg ? "Destravar" : "Travar"} ${LAYER_OF.bg}`}
                        title={lockedBg ? "Destravar o Fundo: o que for ao ar volta a trocar o fundo" : "Travar o Fundo: nada que vai ao ar troca o fundo, nem o Esc"}><Icon name={lockedBg ? "lock" : "unlock"} /></button>
                    : <span aria-hidden="true" />}
                <span className="kx-layer-name">{L.name}{empty[L.id] && <span className="kx-layer-vazio"> · vazio</span>}</span>
                <button type="button" className={`kx-btn kx-t layer-edit ${open === L.id ? "is-on" : ""}`} onClick={(e) => { e.stopPropagation(); EDIT[L.id].run(e); }} aria-label={EDIT[L.id].title} title={EDIT[L.id].title} aria-expanded={bg ? undefined : open === L.id} aria-haspopup={bg ? "menu" : undefined}><Icon name="edit" /></button>
            </div>
        );
    };

    // One overlay as a row: its text as the name, the eye (on air or not) and
    // the pencil. Inside the group (2+) it is indented under the heading.
    const overlayRow = (o, inGroup) => {
        const on = o.enabled !== false;
        const name = overlayName(o);
        return (
            <div key={o.id} className={`kx-layer kx-t ${inGroup ? "is-ov" : ""} ${sel === o.id ? "is-selected" : ""} ${on ? "" : "is-hidden"}`}
                onClick={() => setSel(o.id)} role="listitem" tabIndex={0} aria-label={name ? `Sobreposição: ${name}` : "Sobreposição sem texto"} aria-description={layerState(!on, false)}
                onContextMenu={(e) => menu(e, { title: name || "Sobreposição", items: [
                    { label: on ? "Ocultar" : "Mostrar", icon: on ? "eye-off" : "eye", onSelect: () => toggleOvEye(o) },
                    { label: "Editar…", icon: "edit", onSelect: () => toggleOpen(o.id) },
                    menuItem("excluir", { onSelect: () => removeOverlay(o) }),
                ] })}>
                <button type="button" className={`kx-btn kx-t ${on ? "" : "is-off"}`} onClick={(e) => { e.stopPropagation(); toggleOvEye(o); }} aria-label={`${on ? "Ocultar" : "Mostrar"} ${ovOf(name)}`} title={on ? "Ocultar" : name ? "Mostrar" : NO_TEXT}><Icon name={on ? "eye" : "eye-off"} /></button>
                <span aria-hidden="true" />
                <span className={`kx-layer-name${name ? "" : " is-ph"}`}>{name || "Sobreposição"}{!name && <span className="kx-layer-vazio"> · sem texto</span>}</span>
                <button type="button" className={`kx-btn kx-t layer-edit ${open === o.id ? "is-on" : ""}`} onClick={(e) => { e.stopPropagation(); toggleOpen(o.id); }} aria-label={`Ajustes d${ovOf(name)}`} title="Ajustes da sobreposição" aria-expanded={open === o.id}><Icon name="edit" /></button>
            </div>
        );
    };

    // No overlay yet: the layer's place stays, muted; the + (or the pencil)
    // makes the first one, off the air.
    const emptyOverlayRow = () => (
        <div key="ov-empty" className={`kx-layer kx-t is-empty ${sel === "ov" ? "is-selected" : ""}`}
            onClick={() => setSel("ov")} role="listitem" tabIndex={0} aria-label="Sobreposição" aria-description="camada vazia"
            onContextMenu={(e) => menu(e, { title: "Sobreposição", items: [{ label: "Criar a primeira", icon: "plus", onSelect: addOverlay }] })}>
            <button type="button" className="kx-btn kx-t is-empty" onClick={(e) => { e.stopPropagation(); addOverlay(); }} aria-label="Criar a primeira sobreposição" title="Vazio · cria a primeira sobreposição"><Icon name="plus" /></button>
            <span aria-hidden="true" />
            <span className="kx-layer-name is-ph">Sobreposição<span className="kx-layer-vazio"> · vazio</span></span>
            <button type="button" className="kx-btn kx-t layer-edit" onClick={(e) => { e.stopPropagation(); addOverlay(); }} aria-label="Criar a primeira sobreposição" title="Cria a primeira sobreposição"><Icon name="edit" /></button>
        </div>
    );

    // With 2+, a thin heading over their rows, the screen's top first.
    const ovGroup = () => (
        <div key="ovgroup" className="kx-ovgroup" role="listitem" aria-label={`Sobreposições · ${ovRows.length}`}>
            <div className="kx-ovhead kx-t"
                onContextMenu={(e) => menu(e, { title: "Sobreposições", items: [menuItem("excluir", { label: "Excluir todas…", onSelect: removeAllOverlays })] })}>
                <span className="kx-section">Sobreposições<span className="kx-count"> · {ovRows.length}</span></span>
            </div>
            <div className="kx-ovlist" role="list">
                {ovRows.map((o) => overlayRow(o, true))}
            </div>
        </div>
    );

    const rows = LAYER_ORDER.flatMap((k) => {
        if (k !== "overlays") { const L = BY_KEY[k]; return L ? [fixedRow(L)] : []; }
        if (ovRows.length === 0) return [emptyOverlayRow()];
        if (ovRows.length === 1) return [overlayRow(ovRows[0], false)];
        return [ovGroup()];
    });

    const openLayer = LAYERS.find((l) => l.id === open);
    const openIsOv = Boolean(open) && !openLayer;
    const openOvName = openOv ? overlayName(openOv) : "";
    const sectionLabel = openLayer ? openLayer.name : `Sobreposição${openOvName ? ` · ${openOvName}` : ""}`;
    const place = openOv ? overlayPlace(openOv) : null;
    const movePlace = (row, col) => { if (openOv) patchOverlay(openOv, placeAt(row, col)); };

    return (
        <>
            <div className="kx-layers" role="list" aria-label="Camadas">{rows}</div>
            {open && <div className="layerprops">
                <span className="kx-section" style={{ gridColumn: "1 / -1", paddingTop: 2 }}>{sectionLabel}</span>
                {/* Texto principal: the look is the theme's, edited only in the
                    Editor de temas (owner's review 2026-10-14); here only the
                    item's title choice, and the way back to the theme in use
                    when what is on air looks otherwise (a song's own look). */}
                {open === "text" && <span className="layeracts" style={{ gridColumn: "1 / -1" }}><Btn small onClick={editTheme} title={inUseName ? `O tema em uso (${inUseName}) no Editor de temas` : "O tema em uso no Editor de temas"}>Editar tema…</Btn></span>}
                {open === "text" && (!content ? <span className="kx-meta" style={{ gridColumn: "1 / -1" }}>Nada no ar.</span> : <>
                    <span className="k">Título</span><Seg small label="Título" value={style.title || (showTitle ? "show" : "hide")} options={[["show", "Com"], ["hide", "Sem"]]} onChange={setTitle} />
                    {modified && <>
                        <span className="kx-meta" style={{ gridColumn: "1 / -1" }}>{inUseName ? <>Diferente do tema <b>{inUseName}</b></> : "Diferente do tema em uso"}</span>
                        <span className="layeracts" style={{ gridColumn: "1 / -1" }}>
                            <Btn kind="outline" small onClick={() => applyThemeOnAir(c, theme)} title="O texto no ar volta ao visual do tema em uso">Restaurar</Btn>
                            <Btn small onClick={saveAsNew} title="Guarda o visual no ar como um tema novo, sem nome">Salvar como novo</Btn>
                        </span>
                    </>}
                </>)}
                {/* Logo no canto (K4 = A): only the corner, to move it off
                    something now; its size, width, opacity and margin live in
                    Configurações › Igreja, the one place. */}
                {open === "logo" && (<>
                    <span className="k">Canto</span>
                    <select value={logo.corner} onChange={(e) => op("logo.set", { corner: e.target.value })} aria-label="Canto do logo">
                        {CORNERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <span className="layeracts" style={{ gridColumn: "1 / -1" }}><Btn small onClick={() => onSettings?.("igreja")} title="O logo, o tamanho, a largura, a opacidade e a margem · Configurações › Igreja">Logo da igreja…</Btn></span>
                </>)}
                {openIsOv && (<>
                    <span className="k">Texto</span>
                    <input ref={ovInput} value={draftText} disabled={!openOv} placeholder="Escreva e tecle Enter"
                        onChange={(e) => setDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); commitText(true); } }}
                        onBlur={() => commitText(false)}
                        aria-label="Texto da sobreposição" aria-describedby="ov-hint" style={{ minWidth: 0 }} />
                    <span id="ov-hint" className="kx-meta" style={{ gridColumn: "2 / -1" }}>{openOv?.enabled === false ? "Fora do ar · Enter põe no ar" : "No ar · Enter atualiza"}</span>
                    <span className="k">Altura</span><Seg small label="Altura da sobreposição" value={place?.row || "baixo"} options={OVERLAY_ROWS} onChange={(v) => movePlace(v, place?.col || "esq")} />
                    <span className="k">Lado</span><Seg small label="Lado da sobreposição" value={place?.col || "esq"} options={OVERLAY_COLS} onChange={(v) => movePlace(place?.row || "baixo", v)} />
                    <span className="layeracts" style={{ gridColumn: "1 / -1" }}><Btn small disabled={!openOv} onClick={() => openOv && removeOverlay(openOv)} title="Apaga esta sobreposição">Excluir…</Btn></span>
                </>)}
            </div>}
        </>
    );
}
