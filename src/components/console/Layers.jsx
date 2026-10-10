import React, { useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, IconBtn, Seg } from "./kx";
import { useContextMenu } from "./ContextMenu";
import { BACKGROUNDS, backgroundUrl } from "@/lib/backgrounds";
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
const FONTS = [["sans", "Sem serifa"], ["serif", "Serifa"], ["mono", "Mono"], ["georgia", "Georgia"], ["verdana", "Verdana"]];
const FAMILY_SET = new Set(FONTS.map(([v]) => v));

const themeStyle = (t) => ({ font_size: t.font_size || "large", font_family: t.font_family || "sans", text_effect: t.text_effect || "shadow", text_color: t.text_color || "#ffffff", text_color_2: t.text_color_2 || "" });
const sameLook = (style, t) => Object.entries(themeStyle(t)).every(([k, v]) => (style?.[k] || (k === "text_color_2" ? "" : undefined) || v) === v);

export default function Layers({ c, themes }) {
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
    const theme = themes.find((t) => t.id === themeId) || themes[0] || null;
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
        if (t.background_image) op("background.set", { kind: "image", value: t.background_image, title: t.name });
    };
    const saveAsNew = async () => {
        const name = `${theme ? theme.name : "Tema"} ${new Date().toLocaleDateString("pt-BR")}`;
        try {
            const row = await keryx.entities.ProjectionTheme.create({ name, ...themeStyle({ ...theme, ...style }), background_image: cur?.background?.kind === "image" ? cur.background.value : theme?.background_image || "" });
            setThemeId(row.id);
            c.say(`Tema salvo como "${name}".`);
        } catch (err) {
            c.say(err?.message || "Não foi possível salvar o tema.");
        }
    };

    const disabled = locked[sel];
    const bgIds = Object.values(BACKGROUNDS).flat().filter((v, i, a) => a.indexOf(v) === i);

    return (
        <>
            <div className="themerow">
                <span className="t">Tema: {theme ? theme.name : "nenhum"}{modified && <span> · Modificado</span>}</span>
                {themes.length > 1 && (
                    <select value={theme?.id || ""} onChange={(e) => { const t = themes.find((x) => x.id === e.target.value); if (t) applyTheme(t); }} aria-label="Tema" style={{ height: 22, background: "var(--bg-2)", color: "var(--fg-1)", border: 0, borderRadius: 4, font: "inherit", maxWidth: 110 }}>
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
                </>)}
                {sel === "bg" && (<>
                    <span className="k">Fundo</span><span style={{ color: "var(--fg-1)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cur?.background ? cur.background.title || cur.background.kind : "nenhum"}</span>
                    <div style={{ gridColumn: "1 / -1", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 4 }}>
                        {bgIds.slice(0, 12).map((id) => (
                            <button type="button" key={id} disabled={disabled} onClick={() => op("background.set", { kind: "image", value: backgroundUrl(id), title: "Fundo" })} style={{ aspectRatio: "16/10", borderRadius: 3, backgroundImage: `url(${backgroundUrl(id)})`, backgroundSize: "cover", backgroundPosition: "center", outline: cur?.background?.value === backgroundUrl(id) ? "2px solid var(--brand)" : "none", outlineOffset: -2 }} aria-label="Fundo" />
                        ))}
                    </div>
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
                    <span className="k">Tamanho</span><Seg small value={logo.size} options={SIZES} onChange={(v) => !disabled && op("logo.set", { size: v })} />
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
