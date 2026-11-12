import React, { useEffect, useRef, useState } from "react";
import { Btn, IconBtn } from "./kx";
import { usePlaced } from "./Menu";

const HEX = /^#[0-9a-f]{6}$/i;

// O seletor de cores (owner 2026-11-12, mockup "Fundos gerados · revisão
// 12/11", G3 = A): a swatch button that opens a pop with the colour's hex
// (type or paste one), the conta-gotas (Chromium's EyeDropper: any colour on
// the screen, a photo's included), a grid of ready swatches the caller gives
// (the palettes' colours, the ones in use) and "Roda de cores…", which opens
// the native wheel to fine-tune. It replaces a raw input[type=color]; the
// generated backgrounds use it first, the other ed-color spots migrate as
// they are touched.
export default function ColorPop({ value, onChange, label, swatches = [], disabled = false }) {
    const [open, setOpen] = useState(false);
    const [typed, setTyped] = useState(null);
    const box = useRef(null);
    const pop = useRef(null);
    const wheel = useRef(null);
    usePlaced(pop, box, { open, align: "start" });
    useEffect(() => {
        if (!open) return undefined;
        const away = (e) => { if (!box.current?.contains(e.target)) setOpen(false); };
        const esc = (e) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); setOpen(false); } };
        window.addEventListener("mousedown", away);
        window.addEventListener("keydown", esc, true);
        return () => { window.removeEventListener("mousedown", away); window.removeEventListener("keydown", esc, true); };
    }, [open]);
    const commit = (t) => {
        const v = t.trim().startsWith("#") ? t.trim() : `#${t.trim()}`;
        if (HEX.test(v)) onChange(v.toLowerCase());
        setTyped(null);
    };
    // The conta-gotas: cancelling (Esc) resolves to nothing and changes nothing.
    const dropper = typeof window !== "undefined" && "EyeDropper" in window;
    const pick = async () => { try { const r = await new window.EyeDropper().open(); if (HEX.test(r?.sRGBHex || "")) onChange(r.sRGBHex.toLowerCase()); } catch { /* cancelled */ } };
    const shown = [...new Set(swatches.map((c) => String(c).toLowerCase()).filter((c) => HEX.test(c)))].slice(0, 24);
    return (
        <span className="addmenu cp" ref={box}>
            <button type="button" className="kx-t cp-swatch" disabled={disabled} style={{ background: value }} title={`${label}: ${value}`} aria-label={`${label}: ${value}`} aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)} />
            {open && (
                <div ref={pop} className="kx-pop addmenu-pop cp-pop" role="dialog" aria-label={label}>
                    <div className="cp-row">
                        <span className="cp-big" style={{ background: value }} aria-hidden="true" />
                        <input className="fg-input cp-hex" value={typed ?? value} onChange={(e) => setTyped(e.target.value)} onBlur={() => { if (typed !== null) commit(typed); }} onKeyDown={(e) => { if (e.key === "Enter") commit(e.currentTarget.value); }} aria-label={`${label} em hexadecimal`} spellCheck={false} />
                        {dropper && <IconBtn name="dropper" title="Conta-gotas: pegar qualquer cor da tela" onClick={pick} />}
                    </div>
                    {shown.length > 0 && (
                        <div className="cp-grid" role="group" aria-label="Cores prontas">
                            {shown.map((c) => <button type="button" key={c} className={`kx-t cp-cell ${c === String(value).toLowerCase() ? "is-on" : ""}`} style={{ background: c }} title={c} aria-label={c} onClick={() => onChange(c)} />)}
                        </div>
                    )}
                    <Btn small onClick={() => wheel.current?.click()} title="Afinar a cor na roda do sistema">Roda de cores…</Btn>
                    <input ref={wheel} type="color" className="cp-wheel" value={HEX.test(value || "") ? value : "#000000"} onChange={(e) => onChange(e.target.value)} aria-hidden="true" tabIndex={-1} />
                </div>
            )}
        </span>
    );
}
