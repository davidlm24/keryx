import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import { usePrefs } from "@/hooks/useUser";
import Icon from "./Icon";
import { Btn, IconBtn, Seg } from "./kx";
import { useContextMenu } from "./ContextMenu";
import { visibleBackgrounds } from "@/lib/console/backgroundPrefs";
import { THEME_FONTS, FAMILY_SET, themeStyle, sameLook, themeBackgroundArgs, defaultTheme } from "@/lib/console/themes";
import { applyThemeOnAir } from "./ThemesCard";
import { useBackgrounds } from "./useConsoleData";
import { STYLE_KEYS, LAYER_ORDER, layerHidden, layerLocked } from "@shared/live-state.mjs";
import GeneratorPanel from "./GeneratorPanel";
import { useLibraryPicker } from "./library/libraryContext";
import { bgArgs, bgFields, bgLabel, cleanSpec } from "@/lib/console/backgroundSpec";
import { GENERATORS } from "@/lib/generators";
import { openEditor } from "@/lib/editorWindow";

const GEN_NAMES = Object.fromEntries(GENERATORS.map((g) => [g.id, g.name]));

// Camadas: the look of what is on air, as four layers of the live state —
// Logo (live.logo), Sobreposição (live.overlays), Texto principal
// (content.style) and Fundo (live.background) — and the theme they came
// from (ProjectionTheme). Changing a layer changes the live state at once
// (or the rehearsal copy); the theme marks itself "Modificado" until it is
// restored or the look is saved as a new theme.

const LAYERS = [
    { id: "logo", name: "Logo", key: "logo" },
    { id: "ov", name: "Sobreposição", key: "overlays" },
    { id: "text", name: "Texto principal", key: "content" },
    { id: "bg", name: "Fundo", key: "background" },
];
const BY_KEY = Object.fromEntries(LAYERS.map((l) => [l.key, l]));
const SIZES = [["small", "P"], ["medium", "M"], ["large", "G"]];
const TEXT_SIZES = [["small", "P"], ["medium", "M"], ["large", "G"], ["xlarge", "GG"]];
// Theme helpers live in src/lib/console/themes.js, shared with the editor
// in Configurações › Aparência › Temas.
const FONTS = THEME_FONTS;
// Seg works on strings; these settings are numbers.
const num = (v) => (v == null || v === "" ? "" : String(v));

export default function Layers({ c, themes, media = null }) {
    // The item's title: its own choice (style.title), else the church's.
    const showTitle = usePrefs().show_item_title;
    const backgrounds = useBackgrounds(media);
    const { cur } = c;
    const [sel, setSel] = useState("text");
    // The padlock: the Fundo's is the live state's (layers.lock: nothing
    // changes it, whoever sends); the others only hold Camadas' controls.
    const [localLocks, setLocalLocks] = useState({});
    const pick = useLibraryPicker();
    const menu = useContextMenu();
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
    // The theme last applied from the Temas card (c.themeId), else the default.
    const theme = themes.find((t) => t.id === c.themeId) || defaultTheme(themes);
    const modified = Boolean(theme && content && !sameLook(style, theme));
    const fontMissing = style.font_family && !FAMILY_SET.has(style.font_family) ? style.font_family : null;

    const visible = { logo: logo.visible, ov: Boolean(textOverlay) && textOverlay.enabled !== false, text: Boolean(content) && !layerHidden(cur, "content"), bg: Boolean(cur?.background) && !layerHidden(cur, "background") };
    const op = (name, args) => c.callOp(name, args).catch(() => {});
    const locked = { ...localLocks, bg: layerLocked(cur, "background") };
    const toggleLock = (id) => {
        if (id === "bg") op("layers.lock", { layer: "background", locked: !locked.bg });
        else setLocalLocks({ ...localLocks, [id]: !localLocks[id] });
    };
    // A background from the library (Temas, Imagens, Vídeos, Gerados, Cor).
    // It is the Fundo on air: "Ao vivo" can send each choice at once
    // (Editar fundo… opens with it on, for the generated one on air).
    const openLibrary = async (startLive = false) => {
        const r = await pick({ accept: ["image", "video", "generator", "color"], value: cur?.background || null, title: startLive ? "Editar fundo" : "Fundo", allowNone: Boolean(cur?.background), noneLabel: "Tirar o fundo", live: true, startLive });
        if (r?.none) op("background.clear");
        else if (r?.spec) op("background.set", bgArgs(r.spec, r.spec.kind === "generator" ? GEN_NAMES[r.spec.value] : backgrounds.find((b) => b.url === r.spec.value)?.name || bgLabel(r.spec, GEN_NAMES)));
    };
    const setStyle = (patch) => { if (content) op("content.update", { style: Object.fromEntries(Object.entries({ ...style, ...patch }).filter(([k]) => STYLE_KEYS.includes(k))) }); };
    const setOverlays = (list) => op("overlays.set", { overlays: list });

    const toggleEye = (id) => {
        if (id === "logo") op("logo.set", { visible: !logo.visible });
        if (id === "ov" && textOverlay) setOverlays(overlays.map((o) => (o === textOverlay ? { ...o, enabled: o.enabled === false } : o)));
        if (id === "ov" && !textOverlay) setOverlays([...overlays, { id: `ov-${Date.now()}`, type: "text", content: "Sobreposição", x: 4, y: 86, width: 40, enabled: true }]);
        // Texto principal and Fundo: hidden on every screen, still on air
        // (the arrows walk the text; a new item shows its text again).
        if (id === "text") {
            if (!content) c.say("Nenhum texto no ar.");
            else op(layerHidden(cur, "content") ? "layers.show" : "layers.hide", { layer: "content" });
        }
        if (id === "bg") {
            if (!cur?.background) c.say("Escolha um fundo na camada Fundo.");
            else op(layerHidden(cur, "background") ? "layers.show" : "layers.hide", { layer: "background" });
        }
    };

    const saveAsNew = async () => {
        const name = `${theme ? theme.name : "Tema"} ${new Date().toLocaleDateString("pt-BR")}`;
        try {
            // The Fundo on air goes with the theme, any kind (a picture, a
            // clip, a generated one with its numbers and colours, a colour);
            // with none, the theme's own stays.
            const look = Object.fromEntries(Object.entries(themeStyle({ ...theme, ...style })).filter(([, v]) => v !== ""));
            const spec = cleanSpec(cur?.background) || (theme ? cleanSpec(themeBackgroundArgs(theme)) : null);
            const row = await keryx.entities.ProjectionTheme.create({ name, ...look, ...bgFields(spec) });
            c.setThemeId(row.id);
            c.say(`Tema salvo como "${name}".`);
        } catch (err) {
            c.say(err?.message || "Não foi possível salvar o tema.");
        }
    };

    const disabled = locked[sel];
    // A short strip of pictures (favourites first) for one click; the whole
    // library is one button away.
    const quickBgs = visibleBackgrounds(backgrounds).filter((b) => b.kind === "image").slice(0, 8);

    return (
        <>
            <div className="themerow">
                <span className="t" title="Escolha o tema no card Temas">Tema: {theme ? theme.name : "nenhum"}{modified && <span> · Modificado</span>}</span>
                <span style={{ flex: 1 }} />
                {/* Editing lives in the Editor de temas e layouts (its window);
                    here the operator only adjusts what is on air. */}
                {theme && <Btn small onClick={() => { const r = openEditor({ theme: theme.id }); if (r?.error) c.say(r.error); }} title="Abrir este tema no Editor de temas e layouts">Editar tema…</Btn>}
            </div>
            {modified && (
                <div className="themeacts">
                    <Btn kind="outline" small onClick={() => applyThemeOnAir(c, theme)}>Restaurar</Btn>
                    <Btn small onClick={saveAsNew}>Salvar como novo</Btn>
                </div>
            )}
            {fontMissing && <div className="warnline"><Icon name="warn" /><span>Fonte "{fontMissing}" não instalada · usando a fonte padrão</span></div>}
            {rows.map((L, i) => (
                <div key={L.id} className={`kx-layer kx-t ${sel === L.id ? "is-selected" : ""} ${visible[L.id] ? "" : "is-hidden"} ${drag === L.key ? "is-dragging" : ""} ${over === i && drag && drag !== L.key ? "is-dropbefore" : ""}`}
                    onClick={() => setSel(L.id)} role="button" tabIndex={0}
                    onContextMenu={(e) => menu(e, { title: L.name, items: [
                        { label: visible[L.id] ? "Ocultar" : "Mostrar", icon: visible[L.id] ? "eye-off" : "eye", onSelect: () => toggleEye(L.id) },
                        { label: locked[L.id] ? "Desbloquear" : "Bloquear", icon: locked[L.id] ? "unlock" : "lock", onSelect: () => toggleLock(L.id) },
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
                    <button type="button" className="kx-btn kx-t" style={locked[L.id] ? { color: "var(--fg-1)" } : undefined} onClick={(e) => { e.stopPropagation(); toggleLock(L.id); }} aria-label={locked[L.id] ? "Desbloquear" : "Bloquear"} title={L.id === "bg" ? (locked.bg ? "Destravar o Fundo" : "Travar o Fundo: nada que vai ao ar troca o fundo") : locked[L.id] ? "Desbloquear" : "Bloquear"}><Icon name={locked[L.id] ? "lock" : "unlock"} /></button>
                    <span className="kx-layer-name">{L.name}</span>
                </div>
            ))}
            <div className="layerprops">
                <span className="kx-section" style={{ gridColumn: "1 / -1", paddingTop: 2 }}>{LAYERS.find((l) => l.id === sel)?.name}{disabled ? " · bloqueada" : ""}</span>
                {sel === "text" && (!content ? <span className="kx-meta" style={{ gridColumn: "1 / -1" }}>Nada no ar.</span> : <>
                    <span className="k">Fonte</span>
                    <select value={style.font_family || "sans"} disabled={disabled} onChange={(e) => setStyle({ font_family: e.target.value })} aria-label="Fonte">{FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
                    <span className="k">Tamanho</span><Seg small value={style.font_size || "large"} options={TEXT_SIZES} onChange={(v) => !disabled && setStyle({ font_size: v })} />
                    <span className="k">Alinhamento</span><Seg small value={style.text_align || "center"} options={[["left", "Esq."], ["center", "Centro"], ["right", "Dir."]]} onChange={(v) => !disabled && setStyle({ text_align: v })} />
                    <span className="k">Posição</span><Seg small value={style.text_position || "middle"} options={[["top", "Alto"], ["middle", "Meio"], ["bottom", "Baixo"]]} onChange={(v) => !disabled && setStyle({ text_position: v })} />
                    <span className="k">Sombra</span><Seg small value={style.text_effect === "none" ? "none" : "shadow"} options={[["shadow", "Com"], ["none", "Sem"]]} onChange={(v) => !disabled && setStyle({ text_effect: v })} />
                    <span className="k">Transição</span><Seg small value={style.transition || "fade"} options={[["fade", "Esmaecer"], ["slide", "Deslizar"], ["cut", "Corte"]]} onChange={(v) => !disabled && setStyle({ transition: v })} />
                    <span className="k">Opacidade</span><Seg small value={num(style.text_opacity ?? 1)} options={[["1", "100%"], ["0.8", "80%"], ["0.6", "60%"]]} onChange={(v) => !disabled && setStyle({ text_opacity: v === "1" ? "" : Number(v) })} />
                    <span className="k">Largura</span><Seg small value={num(style.text_max_width ?? 100)} options={[["100", "Toda"], ["80", "80%"], ["60", "60%"]]} onChange={(v) => !disabled && setStyle({ text_max_width: v === "100" ? "" : Number(v) })} />
                    <span className="k">Entrelinhas</span><Seg small value={style.line_height || "normal"} options={[["tight", "Justa"], ["normal", "Normal"], ["loose", "Solta"]]} onChange={(v) => !disabled && setStyle({ line_height: v === "normal" ? "" : v })} />
                    <span className="k">Maiúsculas</span><Seg small value={style.text_case || "none"} options={[["none", "Não"], ["upper", "Sim"]]} onChange={(v) => !disabled && setStyle({ text_case: v === "none" ? "" : v })} />
                    <span className="k">Caixa</span><Seg small value={style.text_box || "none"} options={[["none", "Nenhuma"], ["band", "Faixa"], ["block", "Bloco"]]} onChange={(v) => !disabled && setStyle({ text_box: v === "none" ? "" : v })} />
                    {style.text_box && style.text_box !== "none" && <>
                        <span className="k">Cor da caixa</span>
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <input type="color" className="ed-color" disabled={disabled} value={style.text_box_color || "#000000"} onChange={(e) => setStyle({ text_box_color: e.target.value })} aria-label="Cor da caixa" />
                            <Seg small value={num(style.text_box_opacity ?? 0.55)} options={[["0.35", "35%"], ["0.55", "55%"], ["0.75", "75%"]]} onChange={(v) => !disabled && setStyle({ text_box_opacity: Number(v) })} />
                        </span>
                    </>}
                    <span className="k">Título</span><Seg small value={style.title || (showTitle ? "show" : "hide")} options={[["show", "Com"], ["hide", "Sem"]]} onChange={(v) => !disabled && setStyle({ title: v })} />
                    <span className="k">Ajuste fino</span><Seg small value={num(style.text_nudge ?? 0)} options={[["-10", "↑ 10"], ["-5", "↑ 5"], ["0", "0"], ["5", "↓ 5"], ["10", "↓ 10"]]} onChange={(v) => !disabled && setStyle({ text_nudge: v === "0" ? "" : Number(v) })} />
                </>)}
                {sel === "bg" && (<>
                    <span className="k">Fundo</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                        <span style={{ flex: 1, color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur?.background ? cur.background.title || bgLabel(cur.background, GEN_NAMES) : "nenhum"}</span>
                        {cur?.background?.kind === "generator" && <Btn small disabled={disabled} onClick={() => openLibrary(true)} title="Abre o fundo gerado grande, numa janela; cada ajuste vai às telas na hora">Editar fundo…</Btn>}
                        <Btn small disabled={disabled} onClick={() => openLibrary(false)} title="Temas, imagens, vídeos, fundos gerados e cores">Biblioteca…</Btn>
                    </span>
                    {disabled && <span className="kx-meta" style={{ gridColumn: "1 / -1" }}>Travado: nada que vai ao ar troca o fundo, e o fundo próprio das músicas não aparece.</span>}
                    <div className="lyr-quick" style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                        {quickBgs.map((b) => (
                            <button type="button" key={b.source} disabled={disabled} onClick={() => op("background.set", { kind: "image", value: b.url, title: b.name, ...(b.dim !== null ? { dim: b.dim } : {}), ...(b.blur !== null ? { blur: b.blur } : {}) })} style={{ aspectRatio: "16/10", borderRadius: 3, backgroundImage: `url(${b.url})`, backgroundSize: "cover", backgroundPosition: "center", outline: cur?.background?.value === b.url ? "2px solid var(--brand)" : "none", outlineOffset: -2 }} aria-label={b.name} title={b.name} />
                        ))}
                    </div>
                    {cur?.background && (cur.background.kind === "image" || cur.background.kind === "video") && <>
                        <span className="k">Ajuste</span><Seg small value={cur.background.fit || "cover"} options={[["cover", "Cobrir"], ["contain", "Conter"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, fit: v })} />
                        <span className="k">Posição</span><Seg small value={cur.background.position || "center"} options={[["top", "Alto"], ["center", "Centro"], ["bottom", "Baixo"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, position: v })} />
                        <span className="k">Escurecer</span><Seg small value={num(cur.background.dim ?? (cur.background.kind === "video" ? 0 : 0.45))} options={[["0", "0"], ["0.3", "30%"], ["0.45", "45%"], ["0.7", "70%"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, dim: Number(v) })} />
                        <span className="k">Desfoque</span><Seg small value={num(cur.background.blur ?? 0)} options={[["0", "Sem"], ["4", "Leve"], ["10", "Forte"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, blur: Number(v) })} />
                    </>}
                    {/* The generated Fundo on air: its presets, sliders and colours, live. */}
                    {cur?.background?.kind === "generator" && cur.background.gen && <>
                        <GeneratorPanel background={cur.background} disabled={disabled} op={op} />
                        <span className="k">Escurecer</span><Seg small value={num(cur.background.dim ?? 0)} options={[["0", "0"], ["0.3", "30%"], ["0.45", "45%"], ["0.7", "70%"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, dim: Number(v) })} />
                    </>}
                </>)}
                {sel === "logo" && (<>
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
                </>)}
                {sel === "ov" && (<>
                    <span className="k">Texto</span>
                    <input value={textOverlay?.content || ""} disabled={disabled || !textOverlay} onChange={(e) => setOverlays(overlays.map((o) => (o === textOverlay ? { ...o, content: e.target.value } : o)))} placeholder={textOverlay ? "" : "Mostre a camada para criar"} aria-label="Texto da sobreposição" style={{ height: 24, background: "var(--bg-2)", border: 0, borderRadius: 4, color: "var(--fg-1)", padding: "0 6px", font: "inherit", minWidth: 0 }} />
                    <span className="k">Posição</span><Seg small value={textOverlay ? (textOverlay.y > 50 ? (textOverlay.x > 30 ? "bc" : "bl") : "tl") : "bl"} options={[["bl", "Baixo esq."], ["bc", "Baixo centro"], ["tl", "Alto esq."]]} onChange={(v) => { if (!textOverlay || disabled) return; const pos = { bl: { x: 4, y: 86 }, bc: { x: 30, y: 86 }, tl: { x: 4, y: 4 } }[v]; setOverlays(overlays.map((o) => (o === textOverlay ? { ...o, ...pos } : o))); }} />
                    {textOverlay && <div style={{ gridColumn: "1 / -1" }}><IconBtn name="x" title="Excluir sobreposição" small onClick={() => setOverlays(overlays.filter((o) => o !== textOverlay))} /></div>}
                </>)}
            </div>
        </>
    );
}
