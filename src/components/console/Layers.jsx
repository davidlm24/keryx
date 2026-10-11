import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, IconBtn, Seg } from "./kx";
import { useContextMenu } from "./ContextMenu";
import { visibleBackgrounds } from "@/lib/console/backgroundPrefs";
import { THEME_FONTS, FAMILY_SET, themeStyle, sameLook, bgOf, defaultTheme } from "@/lib/console/themes";
import { useBackgrounds } from "./useConsoleData";
import { STYLE_KEYS, LAYER_ORDER } from "@shared/live-state.mjs";

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
// in Configurações › Temas.
const FONTS = THEME_FONTS;
// Seg works on strings; these settings are numbers.
const num = (v) => (v == null || v === "" ? "" : String(v));

export default function Layers({ c, themes, media = null }) {
    const backgrounds = useBackgrounds(media);
    const { cur } = c;
    const [sel, setSel] = useState("text");
    const [locked, setLocked] = useState({ bg: false });
    const menu = useContextMenu();
    const [themeId, setThemeId] = useState(null);
    const [lastBg, setLastBg] = useState(null);
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
    const theme = themes.find((t) => t.id === themeId) || defaultTheme(themes);
    const modified = Boolean(theme && content && !sameLook(style, theme));
    const fontMissing = style.font_family && !FAMILY_SET.has(style.font_family) ? style.font_family : null;

    const visible = { logo: logo.visible, ov: Boolean(textOverlay) && textOverlay.enabled !== false, text: Boolean(content), bg: Boolean(cur?.background) };
    const op = (name, args) => c.callOp(name, args).catch(() => {});
    const setStyle = (patch) => { if (content) op("content.update", { style: Object.fromEntries(Object.entries({ ...style, ...patch }).filter(([k]) => STYLE_KEYS.includes(k))) }); };
    const setOverlays = (list) => op("overlays.set", { overlays: list });

    const toggleEye = (id) => {
        if (id === "logo") op("logo.set", { visible: !logo.visible });
        if (id === "ov" && textOverlay) setOverlays(overlays.map((o) => (o === textOverlay ? { ...o, enabled: o.enabled === false } : o)));
        if (id === "ov" && !textOverlay) setOverlays([...overlays, { id: `ov-${Date.now()}`, type: "text", content: "Sobreposição", x: 4, y: 86, width: 40, enabled: true }]);
        if (id === "text") { if (content) c.say("O texto principal é o item no ar: use Limpar texto (C) para tirá-lo."); }
        if (id === "bg") {
            if (cur?.background) { setLastBg(cur.background); op("background.clear"); }
            else if (lastBg) op("background.set", lastBg);
            else c.say("Escolha um fundo na camada Fundo.");
        }
    };

    const applyTheme = (t) => {
        setThemeId(t.id);
        if (content) setStyle(themeStyle(t));
        if (t.background_image) op("background.set", { kind: "image", value: t.background_image, title: t.name, ...bgOf(t) });
    };
    const saveAsNew = async () => {
        const name = `${theme ? theme.name : "Tema"} ${new Date().toLocaleDateString("pt-BR")}`;
        try {
            const bg = cur?.background?.kind === "image" ? cur.background : null;
            const look = Object.fromEntries(Object.entries(themeStyle({ ...theme, ...style })).filter(([, v]) => v !== ""));
            const row = await keryx.entities.ProjectionTheme.create({ name, ...look, background_image: bg ? bg.value : theme?.background_image || "",
                ...(bg ? Object.fromEntries([["background_fit", bg.fit], ["background_dim", bg.dim], ["background_blur", bg.blur]].filter(([, v]) => v != null)) : {}) });
            setThemeId(row.id);
            c.say(`Tema salvo como "${name}".`);
        } catch (err) {
            c.say(err?.message || "Não foi possível salvar o tema.");
        }
    };

    const disabled = locked[sel];
    const galleryBgs = visibleBackgrounds(backgrounds).filter((b) => b.kind !== "video").slice(0, 12);
    const galleryVids = visibleBackgrounds(backgrounds).filter((b) => b.kind === "video").slice(0, 8);

    return (
        <>
            <div className="themerow">
                <span className="t">Tema: {theme ? theme.name : "nenhum"}{modified && <span> · Modificado</span>}</span>
                {themes.length > 0 && (
                    <select value={theme?.id || ""} onChange={(e) => { const t = themes.find((x) => x.id === e.target.value); if (t) applyTheme(t); }} aria-label="Tema" title="Aplica o tema no que está no ar, na hora" style={{ height: 22, background: "var(--bg-2)", color: "var(--fg-1)", border: 0, borderRadius: 4, font: "inherit", maxWidth: 150 }}>
                        {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                )}
            </div>
            {modified && (
                <div className="themeacts">
                    <Btn kind="outline" small onClick={() => applyTheme(theme)}>Restaurar</Btn>
                    <Btn small onClick={saveAsNew}>Salvar como novo</Btn>
                </div>
            )}
            {fontMissing && <div className="warnline"><Icon name="warn" /><span>Fonte "{fontMissing}" não instalada · usando a fonte padrão</span></div>}
            {rows.map((L, i) => (
                <div key={L.id} className={`kx-layer kx-t ${sel === L.id ? "is-selected" : ""} ${visible[L.id] ? "" : "is-hidden"} ${drag === L.key ? "is-dragging" : ""} ${over === i && drag && drag !== L.key ? "is-dropbefore" : ""}`}
                    onClick={() => setSel(L.id)} role="button" tabIndex={0}
                    onContextMenu={(e) => menu(e, { title: L.name, items: [
                        { label: visible[L.id] ? "Ocultar" : "Mostrar", icon: visible[L.id] ? "eye-off" : "eye", onSelect: () => toggleEye(L.id) },
                        { label: locked[L.id] ? "Desbloquear" : "Bloquear", icon: locked[L.id] ? "unlock" : "lock", onSelect: () => setLocked({ ...locked, [L.id]: !locked[L.id] }) },
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
                    <button type="button" className="kx-btn kx-t" style={locked[L.id] ? { color: "var(--fg-1)" } : undefined} onClick={(e) => { e.stopPropagation(); setLocked({ ...locked, [L.id]: !locked[L.id] }); }} aria-label={locked[L.id] ? "Desbloquear" : "Bloquear"} title={locked[L.id] ? "Desbloquear" : "Bloquear"}><Icon name={locked[L.id] ? "lock" : "unlock"} /></button>
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
                    <span className="k">Ajuste fino</span><Seg small value={num(style.text_nudge ?? 0)} options={[["-10", "↑ 10"], ["-5", "↑ 5"], ["0", "0"], ["5", "↓ 5"], ["10", "↓ 10"]]} onChange={(v) => !disabled && setStyle({ text_nudge: v === "0" ? "" : Number(v) })} />
                </>)}
                {sel === "bg" && (<>
                    <span className="k">Fundo</span><span style={{ color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur?.background ? cur.background.title || cur.background.kind : "nenhum"}</span>
                    <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                        {galleryBgs.map((b) => (
                            <button type="button" key={b.source} disabled={disabled} onClick={() => op("background.set", { kind: "image", value: b.url, title: b.name, ...(b.dim !== null ? { dim: b.dim } : {}), ...(b.blur !== null ? { blur: b.blur } : {}) })} style={{ aspectRatio: "16/10", borderRadius: 3, backgroundImage: `url(${b.url})`, backgroundSize: "cover", backgroundPosition: "center", outline: cur?.background?.value === b.url ? "2px solid var(--brand)" : "none", outlineOffset: -2 }} aria-label={b.name} title={b.name} />
                        ))}
                    </div>
                    {cur?.background && cur.background.kind !== "color" && <>
                        <span className="k">Ajuste</span><Seg small value={cur.background.fit || "cover"} options={[["cover", "Cobrir"], ["contain", "Conter"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, fit: v })} />
                        <span className="k">Posição</span><Seg small value={cur.background.position || "center"} options={[["top", "Alto"], ["center", "Centro"], ["bottom", "Baixo"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, position: v })} />
                        <span className="k">Escurecer</span><Seg small value={num(cur.background.dim ?? (cur.background.kind === "video" ? 0 : 0.45))} options={[["0", "0"], ["0.3", "30%"], ["0.45", "45%"], ["0.7", "70%"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, dim: Number(v) })} />
                        <span className="k">Desfoque</span><Seg small value={num(cur.background.blur ?? 0)} options={[["0", "Sem"], ["4", "Leve"], ["10", "Forte"]]} onChange={(v) => !disabled && op("background.set", { ...cur.background, blur: Number(v) })} />
                    </>}
                    {galleryVids.length > 0 && <>
                        <span className="k">Vídeo</span>
                        <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                            {galleryVids.map((b) => (
                                <button type="button" key={b.source} disabled={disabled} className="lyr-vtile" onClick={() => op("background.set", { kind: "video", value: b.url, title: b.name, ...(b.dim !== null ? { dim: b.dim } : {}), ...(b.blur !== null ? { blur: b.blur } : {}) })}
                                    style={{ outline: cur?.background?.value === b.url ? "2px solid var(--brand)" : "none", outlineOffset: -2 }} aria-label={b.name} title={`${b.name} · toca em loop, sem som`}>
                                    <Icon name="film" size={14} /><span>{b.name}</span>
                                </button>
                            ))}
                        </div>
                    </>}
                    <span className="k">Cor</span>
                    <div style={{ display: "flex", gap: 4 }}>
                        {["#000000", "#0f1a2e", "#1f1308", "#101f14"].map((hex) => <button type="button" key={hex} disabled={disabled} onClick={() => op("background.set", { kind: "color", value: hex, title: "Cor" })} style={{ width: 20, height: 20, borderRadius: 999, background: hex, boxShadow: "inset 0 0 0 1px rgba(255,255,255,.2)" }} aria-label={hex} />)}
                    </div>
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
