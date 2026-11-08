// The text bar (Rodada P, P8-1 = A, owner 2026-10-22): a Word-like row of the
// text's look, fixed over the Editor de temas' form (its groups stay below)
// and over an element's settings in the Editor de telas. One component, one
// vocabulary — the theme's keys (themes.js EXTRA_KEYS): font_weight,
// font_style, text_decoration, text_case, text_align, text_justify,
// text_color, text_outline_px/_color and, with `spacing`, line_height and
// letter_spacing; the Editor de telas maps its elements' fields to them.
// `font` is the host's font control, `size` the NumBox's numbers.
// Alignment is four buttons as in Word: Esq./Centro/Dir. set text_align
// (and end the justify), Justificado sets text_justify and leaves the box
// where text_align put it.
// Everything about the text lives here (owner 2026-10-22: one place, no
// group repeating it below): the Editor de temas also passes `presets`
// (PP…GGG beside the size, writing their number), `effects` (Efeito ▾:
// text_effect), `colorMore` (the gradient's second colour, text_color_2, and
// the opacity, text_opacity, inside Cor ▾) and `spacing`.
import React, { useEffect, useRef, useState } from "react";
import { Btn, NumBox } from "../console/kx";
import { MenuButton, usePlaced } from "../console/Menu";
import Icon from "../console/Icon";
import { LINE_HEIGHTS, LINE_HEIGHT_RANGE, LETTER_SPACING_RANGE, OUTLINE_RANGE, lineHeightOf } from "@/lib/textSize";

const CASES = [["", "Normal"], ["upper", "MAIÚSCULAS"], ["capitalize", "Primeira Maiúscula"]];
const ALIGNS = [["left", "alignLeft", "Alinhar à esquerda"], ["center", "alignCenter", "Centralizar"], ["right", "alignRight", "Alinhar à direita"], ["justify", "alignJustify", "Justificar"]];
const HEX = /^#[0-9a-f]{6}$/i;

// A button with a small panel under it (Cor, Contorno, Espaçamento): not a
// menu, a few controls. A click away or Esc closes it (the console never
// sees that Esc); usePlaced keeps it inside the window.
function Pop({ label, title, button, children }) {
    const [open, setOpen] = useState(false);
    const box = useRef(null);
    const pop = useRef(null);
    usePlaced(pop, box, { open, align: "start" });
    useEffect(() => {
        if (!open) return undefined;
        const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setOpen(false); } };
        window.addEventListener("mousedown", away);
        window.addEventListener("keydown", esc, true);
        return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
    }, [open]);
    return (
        <span className="addmenu" ref={box}>
            <Btn small on={open} className="tb-drop" title={title} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{button}<Icon name="chevron-down" size={12} /></Btn>
            {open && <div ref={pop} className="kx-pop addmenu-pop tb-pop" role="dialog" aria-label={label}>{children}</div>}
        </span>
    );
}

export default function TextBar({ value, onChange, font = null, size = null, presets = null, effects = null, colorMore = false, center = "", colorReset = null, spacing = false, className = "" }) {
    const v = value || {};
    const align = v.text_justify === "justify" ? "justify" : v.text_align && v.text_align !== center ? v.text_align : "center";
    const setAlign = (a) => onChange(a === "justify" ? { text_justify: "justify" } : { text_align: a === "center" ? center : a, text_justify: "" });
    const color = HEX.test(v.text_color || "") ? v.text_color : "#ffffff";
    const outline = Number(v.text_outline_px) || 0;
    const caseName = CASES.find(([k]) => k === (v.text_case || ""))?.[1] || "Normal";
    const effectName = effects?.find(([k]) => k === (v.text_effect || effects[0][0]))?.[1] || "";
    const opacity = Math.round((v.text_opacity === "" || v.text_opacity == null ? 1 : Number(v.text_opacity)) * 100);
    return (
        <div className={`tb-bar ${className}`} role="toolbar" aria-label="Texto">
            {font}
            {size && <>
                <i className="tb-sep" />
                <NumBox label="Tamanho da fonte" value={size.value} min={size.min} max={size.max} step={size.step} unit={size.unit} onChange={size.onChange} />
                {presets && <MenuButton label="Atalhos de tamanho" flip={false}
                    trigger={(open, toggle) => <Btn small on={open} className="tb-drop tb-presets" title="Atalhos de tamanho: PP, P, M, G, GG, GGG" aria-label="Atalhos de tamanho" aria-haspopup="menu" aria-expanded={open} onClick={toggle}><Icon name="chevron-down" size={12} /></Btn>}
                    items={presets.options.map(([k, l]) => ({ label: l, checked: presets.value === k, onSelect: () => presets.onPick(k) }))} />}
            </>}
            <i className="tb-sep" />
            <Btn small on={v.font_weight === "bold"} className="le-tb" title="Negrito" aria-label="Negrito" aria-pressed={v.font_weight === "bold"} onClick={() => onChange({ font_weight: v.font_weight === "bold" ? "" : "bold" })}><b>N</b></Btn>
            <Btn small on={v.font_style === "italic"} className="le-tb" title="Itálico" aria-label="Itálico" aria-pressed={v.font_style === "italic"} onClick={() => onChange({ font_style: v.font_style === "italic" ? "" : "italic" })}><i>I</i></Btn>
            <Btn small on={v.text_decoration === "underline"} className="le-tb" title="Sublinhado" aria-label="Sublinhado" aria-pressed={v.text_decoration === "underline"} onClick={() => onChange({ text_decoration: v.text_decoration === "underline" ? "" : "underline" })}><u>S</u></Btn>
            <MenuButton label="Maiúsculas e minúsculas" flip={false}
                trigger={(open, toggle) => <Btn small on={open || Boolean(v.text_case)} className="tb-drop" title={`Maiúsculas e minúsculas: ${caseName}`} aria-label={`Maiúsculas e minúsculas: ${caseName}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>Aa<Icon name="chevron-down" size={12} /></Btn>}
                items={CASES.map(([k, l]) => ({ label: l, checked: (v.text_case || "") === k, onSelect: () => onChange({ text_case: k }) }))} />
            <i className="tb-sep" />
            <span className="tb-group" role="radiogroup" aria-label="Alinhamento">
                {ALIGNS.map(([k, icon, l]) => <Btn key={k} small on={align === k} className="le-tb" role="radio" aria-checked={align === k} title={l} aria-label={l} onClick={() => setAlign(k)}><Icon name={icon} size={14} /></Btn>)}
            </span>
            <i className="tb-sep" />
            <Pop label="Cor do texto" title={colorMore ? "Cor do texto, degradê e opacidade" : "Cor do texto"} button={<><span className="tb-swatch" style={{ background: v.text_color ? color : undefined }} />Cor</>}>
                {colorMore ? (
                    <div className="frm tb-pop-frm">
                        <span className="k">Cor</span>
                        <input type="color" className="ed-color" value={color} onChange={(e) => onChange({ text_color: e.target.value })} aria-label="Cor do texto" />
                        <span className="k">Degradê</span>
                        <span className="tb-pop-row">
                            {v.text_color_2
                                ? <><input type="color" className="ed-color" value={HEX.test(v.text_color_2) ? v.text_color_2 : "#ffffff"} onChange={(e) => onChange({ text_color_2: e.target.value })} aria-label="Segunda cor (degradê)" title="Segunda cor (degradê)" /><Btn small onClick={() => onChange({ text_color_2: "" })}>Cor única</Btn></>
                                : <Btn small onClick={() => onChange({ text_color_2: "#c9a25b" })} title="O texto em degradê de duas cores">Degradê</Btn>}
                        </span>
                        <span className="k">Opacidade</span>
                        <span className="tb-pop-row">
                            <input type="range" className="le-range" min={20} max={100} step={1} value={opacity} onChange={(e) => { const n = Number(e.target.value); onChange({ text_opacity: n >= 100 ? "" : n / 100 }); }} aria-label="Opacidade do texto" />
                            <span className="kx-meta">{opacity}%</span>
                        </span>
                    </div>
                ) : (
                    <div className="tb-pop-row">
                        <input type="color" className="ed-color" value={color} onChange={(e) => onChange({ text_color: e.target.value })} aria-label="Cor do texto" />
                        {colorReset && (v.text_color ? <Btn small onClick={() => onChange({ text_color: "" })}>{colorReset}</Btn> : <span className="kx-meta">{colorReset.toLowerCase()}</span>)}
                    </div>
                )}
            </Pop>
            <Pop label="Contorno" title="Contorno: em volta das letras, px de uma tela 1920" button={<>Contorno{outline ? ` ${outline}` : ""}</>}>
                <div className="tb-pop-row">
                    <NumBox label="Contorno" value={v.text_outline_px} empty={0} min={OUTLINE_RANGE[0]} max={OUTLINE_RANGE[1]} step={1} unit="px" onChange={(n) => onChange({ text_outline_px: n || "", text_outline_color: n ? v.text_outline_color || "#000000" : "" })} />
                    {outline > 0 && <input type="color" className="ed-color" value={HEX.test(v.text_outline_color || "") ? v.text_outline_color : "#000000"} onChange={(e) => onChange({ text_outline_color: e.target.value })} aria-label="Cor do contorno" />}
                </div>
            </Pop>
            {effects && <MenuButton label="Efeito do texto" flip={false}
                trigger={(open, toggle) => <Btn small on={open} className="tb-drop" title={`Efeito do texto: ${effectName}`} aria-label={`Efeito do texto: ${effectName}`} aria-haspopup="menu" aria-expanded={open} onClick={toggle}>Efeito<Icon name="chevron-down" size={12} /></Btn>}
                items={effects.map(([k, l]) => ({ label: l, checked: (v.text_effect || effects[0][0]) === k, onSelect: () => onChange({ text_effect: k }) }))} />}
            {spacing && (
                <Pop label="Espaçamento" title="Entrelinhas e espaço entre as letras" button="Espaçamento">
                    <div className="frm tb-pop-frm">
                        <span className="k">Entrelinhas</span>
                        <NumBox label="Entrelinhas" value={v.line_height === "" || v.line_height == null ? "" : lineHeightOf(v.line_height)} empty={LINE_HEIGHTS.normal} min={LINE_HEIGHT_RANGE[0]} max={LINE_HEIGHT_RANGE[1]} step={0.05} onChange={(n) => onChange({ line_height: n === LINE_HEIGHTS.normal ? "" : n })} />
                        <span className="k">Entre letras</span>
                        <NumBox label="Espaçamento entre as letras" value={v.letter_spacing} empty={0} min={LETTER_SPACING_RANGE[0]} max={LETTER_SPACING_RANGE[1]} step={0.01} unit="em" onChange={(n) => onChange({ letter_spacing: n === 0 ? "" : n })} />
                    </div>
                </Pop>
            )}
        </div>
    );
}
