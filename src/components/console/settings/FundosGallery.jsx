import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { importMediaFiles } from "@/lib/mediaImport";
import { keryx } from "@/api/keryxClient";
import { Btn, Seg } from "../kx";
import Icon from "../Icon";
import { FormRow, CfgKey } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { CATEGORY_SUGGESTIONS, DIM_PCT, BLUR_PX, categoriesOf } from "@/lib/console/backgroundPrefs";
import { useBackgrounds } from "../useConsoleData";
import { SAMPLE_SLIDES } from "./sample";

const SAMPLE = SAMPLE_SLIDES.slice(0, 1);
const ALL = "__all";
const HIDDEN = "__hidden";

// Aparência › Fundos: every background the galleries offer (the ones that
// ship with KERYX and the church's images), each with its own name, category,
// dim and blur (a starting point for the items that use it), a favourite
// mark (first in the galleries) and Ocultar (out of the galleries, still
// here). One BackgroundPref row per background, made on its first change.
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

export default function FundosGallery({ c, media, standby, onStandby }) {
    const list = useBackgrounds(media);
    const [filter, setFilter] = useState(ALL);
    const [sel, setSel] = useState(null);
    const save = useSaveBackgroundPref(c.say);

    const fileRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    // The files land in Mídia (one row each) and show up here under "Suas
    // imagens" / "Seus vídeos" — and in every other gallery.
    const upload = async (files) => {
        setUploading(true);
        try {
            const { created, failed } = await importMediaFiles(files, { category: "other" });
            c.say(`${created.length} ${created.length === 1 ? "fundo enviado" : "fundos enviados"}${failed.length ? ` · não deu: ${failed.map((x) => x.name).join(", ")}` : ""}.`);
        } catch (err) { c.say(err?.message || "Não foi possível enviar."); }
        setUploading(false);
    };
    const cats = useMemo(() => categoriesOf(list), [list]);
    const hiddenCount = list.filter((b) => b.hidden).length;
    const shown = filter === HIDDEN ? list.filter((b) => b.hidden) : list.filter((b) => !b.hidden && (filter === ALL || b.category === filter));
    const entry = list.find((b) => b.source === sel) || null;
    useEffect(() => { if (filter === HIDDEN && !hiddenCount) setFilter(ALL); }, [filter, hiddenCount]);

    const filters = [[ALL, "Todos"], ...cats.map((k) => [k, k]), ...(hiddenCount ? [[HIDDEN, `Ocultos · ${hiddenCount}`]] : [])];
    return (
        <div className="fg">
            <CfgKey k="Fundos" className="fg-h">
                <span className="kx-section">Fundos</span>
                <span className="kx-meta">toque num fundo para dar nome, categoria, escurecer e desfoque; vale nas galerias de músicas, avisos, Camadas e fundo de espera</span>
                <span style={{ flex: 1 }} />
                <Btn small disabled={uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Enviando…" : "Enviar do computador…"}</Btn>
                <input ref={fileRef} type="file" multiple hidden accept="image/*,.gif,video/mp4,video/webm" onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; if (files.length) upload(files); }} />
            </CfgKey>
            <div className="fg-filters" role="radiogroup" aria-label="Categoria">
                {filters.map(([k, label]) => (
                    <button type="button" key={k} role="radio" aria-checked={filter === k} className={`kx-t fg-chip ${filter === k ? "is-on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
                ))}
            </div>
            <div className="fg-body">
                <div className="fg-grid">
                    {shown.map((b) => (
                        <button type="button" key={b.source} className={`kx-t fg-tile ${sel === b.source ? "is-on" : ""} ${b.hidden ? "is-hidden" : ""}`} onClick={() => setSel(sel === b.source ? null : b.source)} aria-pressed={sel === b.source} title={b.name}>
                            <span className="fg-img">{b.kind === "video" ? <video src={b.url} preload="metadata" muted /> : <img src={b.url} alt="" loading="lazy" />}{b.kind === "video" && <span className="fg-kind"><Icon name="film" size={12} /></span>}</span>
                            <span className="fg-name">{b.favorite && <Icon name="star" size={12} />}{b.name}</span>
                        </button>
                    ))}
                    {!shown.length && <span className="kx-meta">Nenhum fundo nesta categoria.</span>}
                </div>
                {entry && <FundoDetail key={entry.source} b={entry} save={save} now={c.now} standby={standby} onStandby={onStandby} />}
            </div>
        </div>
    );
}

// One background's settings and a sample. Without onStandby (the library
// window) the standby wallpaper button is left out.
export function FundoDetail({ b, save, now, standby, onStandby, sample = true }) {
    const [name, setName] = useState(b.pref?.name || "");
    const [category, setCategory] = useState(b.pref?.category || "");
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
    const commitCategory = () => { if (category.trim() !== (b.pref?.category || "").trim()) keep({ category: category.trim() }); };
    // Only a real change is saved (moving through with Tab is not one, and
    // would make a row for a background nobody touched).
    const savedDim = b.dim === null ? null : Math.round(b.dim * 100);
    const commitDim = () => { if (dim !== savedDim) keep({ dim_pct: dim }); };
    const commitBlur = () => { if ((blur ?? null) !== (b.blur ?? null)) keep({ blur_px: blur }); };
    const isStandby = standby && standby === b.url;

    return (
        <div className="fg-detail frm">
            {sample && <FormRow k="">
                <div className="ap-sample fg-sample">{doc && <ScreenRenderer state={doc} now={now} preview />}</div>
            </FormRow>}
            <FormRow k="Nome">
                <input className="fg-input" value={name} placeholder={b.name} maxLength={80} onChange={(e) => setName(e.target.value)} onBlur={commitName} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="Nome do fundo" />
            </FormRow>
            <FormRow k="Categoria">
                <input className="fg-input" value={category} placeholder={b.category} maxLength={40} list="fg-cats" onChange={(e) => setCategory(e.target.value)} onBlur={commitCategory} onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }} aria-label="Categoria do fundo" />
                <datalist id="fg-cats">{CATEGORY_SUGGESTIONS.map((k) => <option key={k} value={k} />)}</datalist>
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
            <FormRow k="Nas galerias">
                <Seg small value={b.hidden ? "hidden" : b.favorite ? "fav" : "shown"} options={[["fav", "Favorito"], ["shown", "Aparece"], ["hidden", "Oculto"]]}
                    onChange={(v) => keep({ favorite: v === "fav", hidden: v === "hidden" })} />
            </FormRow>
            {onStandby && <FormRow k="">
                {b.kind !== "video" && <Btn small on={isStandby} disabled={isStandby} onClick={() => onStandby(b.url)}>{isStandby ? "É o fundo de espera padrão" : "Usar como fundo de espera padrão"}</Btn>}
                {b.kind === "video" && <span className="kx-meta">um vídeo entra pelo Camadas › Fundo; a tela de espera só aceita imagem</span>}
                <span className="kx-meta">escurecer e desfoque entram quando um item, um aviso ou o fundo de espera com este fundo vai ao ar, e quando ele é escolhido em Camadas › Fundo</span>
            </FormRow>}
        </div>
    );
}
