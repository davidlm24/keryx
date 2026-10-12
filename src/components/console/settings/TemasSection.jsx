import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, Seg, Empty } from "../kx";
import { FormRow, CfgKey } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import BgChip from "../library/BgChip";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { THEME_FONTS, TEXT_SIZES, themeStyle, themeBackgroundArgs, defaultTheme, defaultChanges } from "@/lib/console/themes";
import { TRANSITIONS, TRANSITION_MS } from "@/lib/console/look";
import { bgSpec, bgFields } from "@/lib/console/backgroundSpec";
import { SAMPLE_SLIDES } from "./sample";

const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["outline", "Contorno"], ["3d", "3D"], ["neon", "Neon"], ["none", "Nenhum"]];
const BOXES = [["", "Sem"], ["band", "Faixa"], ["block", "Bloco"]];
const SIZES = TEXT_SIZES;
const SIZE = Object.fromEntries(TEXT_SIZES);
const FONT = Object.fromEntries(THEME_FONTS);
const BLANK = { name: "", font_family: "sans", font_size: "large", text_effect: "shadow", text_color: "#ffffff", text_color_2: "", text_box: "", text_box_color: "", text_box_opacity: "", transition: "", transition_ms: "", background_image: "", background_fit: "", background_dim: "", background_blur: "" };

// Unsaved edits, by theme ("new" for one being created): switching tabs or
// sections (the editor unmounts) keeps them until Salvar or Cancelar.
const drafts = new Map();

// A theme to open in the editor when this section mounts (a double click
// on the console's Temas card opens Configurações here).
let pendingEdit = null;
export const requestThemeEdit = (id) => { pendingEdit = id; };

// One theme being created or edited: every field, a live sample beside them
// (the real renderer on real ops), saved as a ProjectionTheme row.
function ThemeEditor({ row, c, onDone }) {
    const key = row?.id || "new";
    const [restored] = useState(() => drafts.has(key));
    // The background is one spec (backgroundSpec.js) in `background`; the old
    // fields are written beside it on every change.
    const [draft, setDraft] = useState(() => drafts.get(key) || { ...BLANK, ...(row || {}), ...bgFields(bgSpec(row)) });
    useEffect(() => { drafts.set(key, draft); }, [key, draft]);
    const done = (saved) => { drafts.delete(key); onDone(saved); };
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    const bg = bgSpec(draft);
    const setBg = (patch) => set(bgFields(patch && bg ? { ...bg, ...patch } : patch));
    const doc = useMemo(() => {
        try {
            let st = emptyState(c.now);
            const bg = themeBackgroundArgs(draft);
            if (bg) st = applyOp(st, "background.set", bg, c.now);
            return applyOp(st, "content.show", { kind: "lyrics", title: "Exemplo", slides: SAMPLE_SLIDES, style: themeStyle(draft) }, c.now);
        } catch { return null; }
    }, [draft]); // eslint-disable-line react-hooks/exhaustive-deps
    const save = async () => {
        const name = draft.name.trim() || `Tema ${new Date().toLocaleDateString("pt-BR")}`;
        const data = { ...draft, name };
        // is_default belongs to Tornar padrão (the editor's copy may be stale).
        for (const k of ["id", "created_date", "updated_date", "created_by_id", "elements", "is_default"]) delete data[k];
        try {
            if (row?.id) await keryx.entities.ProjectionTheme.update(row.id, data);
            else await keryx.entities.ProjectionTheme.create(data);
            c.say(row?.id ? "Tema salvo." : `Tema "${name}" criado.`);
            done(true);
        } catch (err) { c.say(err?.message || "Não foi possível salvar o tema."); }
    };
    const num = (v) => (v == null || v === "" ? "" : String(v));
    return (
        <div className="cfg-outprefs" role="group" aria-label={row?.id ? `Editar o tema ${row.name}` : "Novo tema"}>
            <div className="frm cfg-outprefs-form">
                <FormRow k="Nome">
                    <input className="fg-input" value={draft.name} placeholder="Nome do tema" maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-label="Nome do tema" />
                </FormRow>
                <FormRow k="Fonte">
                    <select className="cfg-select" value={draft.font_family} onChange={(e) => set({ font_family: e.target.value })} aria-label="Fonte do tema">
                        {THEME_FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <Seg small value={draft.font_size} options={SIZES} onChange={(v) => set({ font_size: v })} />
                </FormRow>
                <FormRow k="Efeito e cor">
                    <select className="cfg-select" value={draft.text_effect} onChange={(e) => set({ text_effect: e.target.value })} aria-label="Efeito do texto">
                        {EFFECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                    <input type="color" className="ed-color" value={/^#[0-9a-f]{6}$/i.test(draft.text_color) ? draft.text_color : "#ffffff"} onChange={(e) => set({ text_color: e.target.value })} aria-label="Cor do texto" title="Cor do texto" />
                </FormRow>
                <FormRow k="Caixa do texto">
                    <Seg small value={draft.text_box || ""} options={BOXES} onChange={(v) => set({ text_box: v, ...(v ? { text_box_color: draft.text_box_color || "#000000", text_box_opacity: draft.text_box_opacity || 0.55 } : { text_box_color: "", text_box_opacity: "" }) })} />
                    {draft.text_box && <input type="color" className="ed-color" value={draft.text_box_color || "#000000"} onChange={(e) => set({ text_box_color: e.target.value })} aria-label="Cor da caixa" title="Cor da caixa" />}
                </FormRow>
                <FormRow k="Transição">
                    <Seg small value={draft.transition || ""} options={[["", "Herdar"], ...TRANSITIONS]} onChange={(v) => set({ transition: v, ...(v ? {} : { transition_ms: "" }) })} />
                    {draft.transition && <><input type="range" className="ap-range" min={TRANSITION_MS[0]} max={TRANSITION_MS[1]} step={20} value={Number(draft.transition_ms) || 400} onChange={(e) => set({ transition_ms: Number(e.target.value) })} aria-label="Duração da transição do tema" /><span className="kx-content ap-ms">{Number(draft.transition_ms) || 400} ms</span></>}
                </FormRow>
                <FormRow k="Fundo">
                    <BgChip value={bg} title="Fundo do tema" empty="nenhum" noneLabel="Sem fundo no tema" onPick={(spec) => set(bgFields(spec))} />
                    <span className="kx-meta">imagem, vídeo, fundo gerado ou cor · vai para a camada Fundo quando um item com este tema vai ao ar</span>
                </FormRow>
                {bg && bg.kind !== "color" && <>
                    {bg.kind !== "generator" && <FormRow k="Ajuste do fundo">
                        <Seg small value={bg.fit || "cover"} options={[["cover", "Cobrir"], ["contain", "Conter"]]} onChange={(v) => setBg({ fit: v === "cover" ? undefined : v })} />
                    </FormRow>}
                    <FormRow k={bg.kind === "generator" ? "Escurecer" : "Escurecer · desfoque"}>
                        <Seg small value={num(bg.dim ?? "")} options={bg.kind === "image" ? [["", "45%"], ["0", "0"], ["0.3", "30%"], ["0.7", "70%"]] : [["", "0"], ["0.3", "30%"], ["0.7", "70%"]]} onChange={(v) => setBg({ dim: v === "" ? undefined : Number(v) })} />
                        {bg.kind !== "generator" && <Seg small value={num(bg.blur ?? "")} options={[["", "Sem"], ["4", "Leve"], ["10", "Forte"]]} onChange={(v) => setBg({ blur: v === "" ? undefined : Number(v) })} />}
                    </FormRow>
                </>}
                <FormRow k="">
                    <Btn small kind="brand" onClick={save}>Salvar tema</Btn>
                    <Btn small onClick={() => done(false)}>Cancelar</Btn>
                    {restored && <span className="kx-meta">rascunho que não tinha sido salvo</span>}
                </FormRow>
            </div>
            <div className="cfg-prevcol">
                <div className="cfg-prev"><div className="cfg-prev-fill">{doc && <ScreenRenderer fill state={doc} now={c.now} preview audio={false} />}</div></div>
                <span className="kx-meta">Exemplo · a amostra segue cada ajuste</span>
            </div>
        </div>
    );
}

// Aparência › Temas: the projection presets — each one text + background,
// created and edited here with a live sample (Camadas' "Salvar como novo"
// still works). The Fundos library is the next tab (FundosGallery).
export default function TemasSection({ c }) {
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["settings", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    useEffect(() => keryx.entities.ProjectionTheme.subscribe(() => client.invalidateQueries({ queryKey: ["settings", "themes"] })), [client]);
    const [editing, setEditing] = useState(() => { const id = pendingEdit; pendingEdit = null; return id; }); // "new" | theme id | null
    const [confirmDel, setConfirmDel] = useState(null);
    const reload = () => client.invalidateQueries({ queryKey: ["settings", "themes"] });
    const run = async (p, message) => {
        try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível."); }
        reload();
    };
    // One transaction: never two defaults, never none in between.
    const def = defaultTheme(themes);
    const setDefault = (id) => {
        const rows = defaultChanges(themes, id);
        if (!rows.length) return;
        const t = themes.find((x) => x.id === id);
        run(keryx.entities.ProjectionTheme.bulkUpdate(rows), t ? `${t.name} é o tema padrão: músicas e passagens sem estilo próprio vão ao ar com ele.` : "Sem tema padrão: vale o estilo de fábrica.");
    };
    const makeDefault = (t) => setDefault(t.id);
    const remove = (t) => {
        if (confirmDel !== t.id) { setConfirmDel(t.id); c.say(`Clique de novo em Excluir para apagar "${t.name}".`); return; }
        setConfirmDel(null);
        if (editing === t.id) setEditing(null);
        run(keryx.entities.ProjectionTheme.delete(t.id), "Tema excluído.");
    };

    return (
        <>
            <div className="frm">
                <FormRow k="Estilo padrão do texto">
                    <select className="cfg-select" value={def?.id || ""} onChange={(e) => setDefault(e.target.value || null)} aria-label="Tema padrão">
                        <option value="">Estilo de fábrica (sem tema)</option>
                        {themes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                    <span className="kx-meta">músicas e passagens sem estilo próprio vão ao ar com ele · o que já está no ar não muda</span>
                </FormRow>
            </div>
            <CfgKey k="Temas" className="listhead"><span className="kx-section">Temas <span className="kx-count">· texto e fundo prontos, aplicados na hora em Camadas</span></span><span style={{ flex: 1 }} /><Btn small kind="brand" onClick={() => setEditing("new")}>Novo tema…</Btn></CfgKey>
            {editing === "new" && <ThemeEditor row={null} c={c} onDone={(saved) => { setEditing(null); if (saved) reload(); }} />}
            {!themes.length && editing !== "new" && <Empty icon="palette" title="Nenhum tema ainda">Crie um em "Novo tema…", ou ajuste o texto em Camadas e use "Salvar como novo".</Empty>}
            {themes.map((t) => (
                <React.Fragment key={t.id}>
                <div className={`kx-row ${t.is_default ? "is-selected" : ""}`}>
                    <span className="kx-glyph"><Icon name="palette" /></span>
                    <div className="kx-row-main">
                        <div className="kx-row-title">{t.name}</div>
                        <div className="kx-row-meta">{[FONT[t.font_family] || t.font_family || "Sem serifa", SIZE[t.font_size] || "G", t.text_effect && t.text_effect !== "none" ? t.text_effect : "", t.transition ? `transição ${t.transition}` : "", t.background_image ? "com fundo" : ""].filter(Boolean).join(" · ")}</div>
                    </div>
                    <span className="cfg-acts">
                        {t.is_default ? <span className="kx-meta">padrão</span> : <Btn onClick={() => makeDefault(t)}>Tornar padrão</Btn>}
                        <Btn on={editing === t.id} onClick={() => setEditing(editing === t.id ? null : t.id)}>Editar</Btn>
                        <Btn kind={confirmDel === t.id ? "air" : ""} onClick={() => remove(t)}>{confirmDel === t.id ? "Excluir mesmo" : "Excluir"}</Btn>
                    </span>
                </div>
                {editing === t.id && <ThemeEditor row={t} c={c} onDone={(saved) => { setEditing(null); if (saved) reload(); }} />}
                </React.Fragment>
            ))}
        </>
    );
}
