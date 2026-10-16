import React, { useCallback, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn, IconBtn, Seg } from "../kx";
import Icon from "../Icon";
import { FormRow } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { DIM_PCT, BLUR_PX } from "@/lib/console/backgroundPrefs";
import { SAMPLE_SLIDES } from "./sample";

const SAMPLE = SAMPLE_SLIDES.slice(0, 1);

// A background's own settings (BackgroundPref): its name, category, dim and
// blur (a starting point for the items that use it), fit and position, and
// a favourite mark (first in the library). Leaving the library is the
// tile's right click (Excluir…; the old Oculto is the Excluídos chip now,
// owner 2026-10-16). Drawn by the background library
// (library/BackgroundLibrary.jsx); its door in Configurações is Temas e fundos.

// One change to a background's settings (BackgroundPref): the row is
// created the first time (once, even when two changes race), updated after.
// Shared with the background library (library/BackgroundLibrary.jsx).
export function useSaveBackgroundPref(say) {
    const creating = useRef(new Map());
    return useCallback(async (b, patch, message) => {
        try {
            const pending = creating.current.get(b.source);
            if (b.pref?.id) await keryx.entities.BackgroundPref.update(b.pref.id, patch);
            else if (pending) await keryx.entities.BackgroundPref.update((await pending).id, patch);
            else {
                const made = keryx.entities.BackgroundPref.create({ source: b.source, ...patch });
                creating.current.set(b.source, made);
                // A failed create is forgotten: the next change tries again.
                made.catch(() => { if (creating.current.get(b.source) === made) creating.current.delete(b.source); });
                await made;
            }
            if (message) say(message);
        } catch (err) { say(err?.message || "Não foi possível salvar o fundo."); }
    }, [say]);
}

// One background's settings and a sample. (The library window.) Its
// category is one of the church's (`categories`; a free name made a
// category the editor did not list), the editor one click away.
export function FundoDetail({ b, save, now, sample = true, categories = [], onCategories, onRestore }) {
    const cats = categories.includes(b.category) ? categories : [...categories, b.category];
    const [name, setName] = useState(b.pref?.name || "");
    const [dim, setDim] = useState(b.dim === null ? null : Math.round(b.dim * 100));
    const [blur, setBlur] = useState(b.blur);

    // The sample: the real renderer, as this background shows on air — a
    // picture as an item's own background, a clip as the Fundo layer.
    const doc = useMemo(() => {
        try {
            if (b.kind === "video") {
                const st = applyOp(emptyState(now), "background.set", { kind: "video", value: b.url, title: b.name, ...(dim !== null ? { dim: dim / 100 } : {}), ...(blur ? { blur } : {}) }, now);
                return applyOp(st, "content.show", { kind: "lyrics", title: b.name, slides: SAMPLE, style: {} }, now);
            }
            const style = { background_image: b.url, ...(dim !== null ? { background_dim: dim / 100 } : {}), ...(blur ? { background_blur: blur } : {}) };
            return applyOp(emptyState(now), "content.show", { kind: "lyrics", title: b.name, slides: SAMPLE, style }, now);
        } catch { return null; }
    }, [b.url, b.kind, b.name, dim, blur]); // eslint-disable-line react-hooks/exhaustive-deps

    const keep = (patch) => save(b, patch);
    const commitName = () => { if (name.trim() !== (b.pref?.name || "").trim()) keep({ name: name.trim() }); };
    // Only a real change is saved (moving through with Tab is not one, and
    // would make a row for a background nobody touched).
    const savedDim = b.dim === null ? null : Math.round(b.dim * 100);
    const commitDim = () => { if (dim !== savedDim) keep({ dim_pct: dim }); };
    const commitBlur = () => { if ((blur ?? null) !== (b.blur ?? null)) keep({ blur_px: blur }); };

    return (
        <div className="fg-detail frm">
            {sample && <FormRow k="">
                <div className="ap-sample fg-sample">{doc && <ScreenRenderer state={doc} now={now} preview />}</div>
            </FormRow>}
            <FormRow k="Nome">
                <input className="fg-input" value={name} placeholder={b.name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="Nome do fundo" />
            </FormRow>
            {b.hidden && <FormRow k="">
                <span className="kx-meta">Excluído: fora da biblioteca.</span>
                {onRestore && <Btn small onClick={onRestore}><Icon name="undo" size={14} />Restaurar</Btn>}
            </FormRow>}
            <FormRow k="Categoria">
                <select className="fg-input" value={b.category} onChange={(e) => keep({ category: e.target.value })} aria-label="Categoria do fundo">
                    {cats.map((k) => <option key={k} value={k}>{k}</option>)}
                </select>
                {onCategories && <IconBtn small name="edit" title="Editar as categorias" onClick={onCategories} />}
            </FormRow>
            <FormRow k="Escurecer">
                <input type="range" className="ap-range" min={DIM_PCT[0]} max={DIM_PCT[1]} step={5} value={dim ?? 45} onChange={(e) => setDim(Number(e.target.value))}
                    onPointerUp={commitDim} onKeyUp={commitDim} aria-label="Escurecer o fundo" />
                <span className="kx-content ap-ms">{dim === null ? "padrão · 45%" : `${dim}%`}</span>
            </FormRow>
            <FormRow k="Desfoque">
                <input type="range" className="ap-range" min={BLUR_PX[0]} max={BLUR_PX[1]} step={1} value={blur ?? 0} onChange={(e) => setBlur(Number(e.target.value))}
                    onPointerUp={commitBlur} onKeyUp={commitBlur} aria-label="Desfoque do fundo" />
                <span className="kx-content ap-ms">{blur ? `${blur} px` : "sem"}</span>
                {(dim !== null || blur !== null) && <Btn small onClick={() => { setDim(null); setBlur(null); keep({ dim_pct: null, blur_px: null }); }} title="Volta ao escurecer de sempre e sem desfoque">Restaurar</Btn>}
            </FormRow>
            <FormRow k="Ajuste">
                <Seg small value={b.pref?.fit || "cover"} options={[["cover", "Cobrir"], ["contain", "Conter"]]} onChange={(v) => keep({ fit: v === "cover" ? "" : v })} />
            </FormRow>
            <FormRow k="Posição">
                <Seg small value={b.pref?.position || "center"} options={[["top", "Alto"], ["center", "Centro"], ["bottom", "Baixo"]]} onChange={(v) => keep({ position: v === "center" ? "" : v })} />
            </FormRow>
            {!b.hidden && <FormRow k="Ordem">
                <Seg small value={b.favorite ? "fav" : "shown"} options={[["fav", "Favorito · primeiro"], ["shown", "Normal"]]}
                    onChange={(v) => keep({ favorite: v === "fav" })} />
            </FormRow>}
        </div>
    );
}
