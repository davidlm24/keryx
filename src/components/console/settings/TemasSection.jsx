import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, Seg, Empty } from "../kx";
import { FormRow, CfgKey } from "./parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import BgChip from "../library/BgChip";
import { ThemeThumb } from "../library/BackgroundLibrary";
import { useContextMenu } from "../ContextMenu";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { THEME_FONTS, TEXT_SIZES, themeStyle, themeBackgroundArgs, defaultTheme, defaultChanges, themeForKind, THEME_KINDS, KIND_FIELD } from "@/lib/console/themes";
import { useLibraryPicker } from "../library/libraryContext";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { TRANSITIONS, TRANSITION_MS } from "@/lib/console/look";
import { bgSpec, bgFields } from "@/lib/console/backgroundSpec";
import { SAMPLE_SLIDES } from "./sample";

const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["outline", "Contorno"], ["3d", "3D"], ["neon", "Neon"], ["none", "Nenhum"]];
const BOXES = [["", "Sem"], ["band", "Faixa"], ["block", "Bloco"]];
const SIZES = TEXT_SIZES;
const SIZE = Object.fromEntries(TEXT_SIZES);
const FONT = Object.fromEntries(THEME_FONTS);
const BLANK = { name: "", font_family: "sans", font_size: "large", text_effect: "shadow", text_color: "#ffffff", text_color_2: "", text_box: "", text_box_color: "", text_box_opacity: "", transition: "", transition_ms: "", background_image: "", background_fit: "", background_dim: "", background_blur: "" };

// Temas padrão (owner's decision 2026-10-13, as in SPresenter): one theme per
// kind of content — Música (the theme marked padrão), Bíblia, Texto and
// Timer (on the profile; empty = the same as Música) — each a small screen;
// a click chooses it in the library, in theme mode. What is on air does not
// change: the theme dresses what is sent from then on.
function KindThemes({ c, themes, setDefault }) {
    const prefs = usePrefs();
    const pick = useLibraryPicker();
    const ids = { bible: prefs.bible_theme_id, text: prefs.text_theme_id, tool: prefs.timer_theme_id };
    const def = defaultTheme(themes);
    const choose = async (kind, name) => {
        const field = KIND_FIELD[kind];
        const own = field ? ids[kind] : def?.id || "";
        const r = await pick({ accept: "theme", title: `Tema padrão · ${name}`, value: own && own !== "none" ? own : null, allowNone: true, noneLabel: field ? "O mesmo das músicas" : "Estilo de fábrica (sem tema)" });
        if (!r || (!r.theme && !r.none)) return;
        if (!field) { setDefault(r.theme ? r.theme.id : null); return; }
        updateUser({ [field]: r.theme ? r.theme.id : "" })
            .then(() => c.say(r.theme ? `${name}: tema ${r.theme.name}.` : `${name}: o mesmo tema das músicas.`))
            .catch(() => c.say("Não foi possível salvar o tema."));
    };
    return (
        <>
            <CfgKey k="Temas padrão" className="listhead"><span className="kx-section">Temas padrão <span className="kx-count">· o tema com que cada tipo de conteúdo sem estilo próprio vai ao ar · o que já está no ar não muda</span></span></CfgKey>
            <div className="tmg tmg-kinds">
                {THEME_KINDS.map(([kind, name]) => {
                    const field = KIND_FIELD[kind];
                    const t = themeForKind(themes, kind, ids);
                    const same = field && !ids[kind];
                    const what = t ? t.name : "Estilo de fábrica";
                    return (
                        <button type="button" key={kind} className="kx-t fg-tile tmg-tile" onClick={() => choose(kind, name)} aria-label={`Tema padrão de ${name}: ${what}`} title={`${name} · clique para escolher o tema`}>
                            <span className="tmg-kind">{name}</span>
                            <span className="fg-img">{t ? <ThemeThumb theme={t} now={c.now} /> : <span className="tmg-plus">Estilo de fábrica</span>}</span>
                            <span className="fg-name">{what}</span>
                            <span className="kx-meta tmg-meta">{same ? "o mesmo das músicas" : kind === "lyrics" ? "o tema padrão" : "próprio"}</span>
                        </button>
                    );
                })}
            </div>
        </>
    );
}

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
// still works). The backgrounds are managed in the library (Aparência › Fundos).
export default function TemasSection({ c }) {
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["settings", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    useEffect(() => keryx.entities.ProjectionTheme.subscribe(() => client.invalidateQueries({ queryKey: ["settings", "themes"] })), [client]);
    const [editing, setEditing] = useState(() => { const id = pendingEdit; pendingEdit = null; return id; }); // "new" | theme id | null
    const reload = () => client.invalidateQueries({ queryKey: ["settings", "themes"] });
    const run = async (p, message) => {
        try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível."); }
        reload();
    };
    // One transaction: never two defaults, never none in between.
    const setDefault = (id) => {
        const rows = defaultChanges(themes, id);
        if (!rows.length) return;
        const t = themes.find((x) => x.id === id);
        run(keryx.entities.ProjectionTheme.bulkUpdate(rows), t ? `${t.name} é o tema padrão: músicas e passagens sem estilo próprio vão ao ar com ele.` : "Sem tema padrão: vale o estilo de fábrica.");
    };
    const makeDefault = (t) => setDefault(t.id);
    // Excluir asks first (ConfirmDialog.jsx), as in the console's menus.
    const confirm = useConfirm();
    const remove = async (t) => {
        if (!(await confirm(deleteQuestion("o tema", t.name, "Músicas e saídas que usam este tema voltam ao padrão.")))) return;
        if (editing === t.id) setEditing(null);
        run(keryx.entities.ProjectionTheme.delete(t.id), "Tema excluído.");
    };
    const menu = useContextMenu();
    const themeMenu = (e, t) => menu(e, { title: t.name, items: [
        { label: "Editar", icon: "edit", onSelect: () => setEditing(t.id) },
        { label: t.is_default ? "É o tema padrão" : "Tornar padrão", icon: "star", disabled: Boolean(t.is_default), onSelect: () => makeDefault(t) },
        { label: "Excluir…", icon: "trash", onSelect: () => remove(t) },
    ] });
    const editingRow = themes.find((t) => t.id === editing) || null;

    return (
        <>
            <KindThemes c={c} themes={themes} setDefault={setDefault} />
            <CfgKey k="Temas" className="listhead"><span className="kx-section">Temas <span className="kx-count">· clique para editar · botão direito: mais opções</span></span><span style={{ flex: 1 }} /><Btn small kind="brand" onClick={() => setEditing("new")}>Novo tema…</Btn></CfgKey>
            {/* The themes as small screens, as in the library (owner's request
                2026-10-13); the one being edited opens below the grid. */}
            <div className="tmg" role="list" aria-label="Temas">
                {themes.map((t) => (
                    <button type="button" key={t.id} role="listitem" className={`kx-t fg-tile tmg-tile ${editing === t.id ? "is-on" : ""}`} aria-pressed={editing === t.id} aria-label={t.name}
                        title={`${t.name} · clique para editar · botão direito: mais opções`} onClick={() => setEditing(editing === t.id ? null : t.id)} onContextMenu={(e) => themeMenu(e, t)}>
                        <span className="fg-img"><ThemeThumb theme={t} now={c.now} /></span>
                        <span className="fg-name">{t.is_default && <Icon name="star" size={12} />}{t.name}</span>
                        <span className="kx-meta tmg-meta">{[FONT[t.font_family] || t.font_family || "Sem serifa", SIZE[t.font_size] || "G", t.is_default ? "padrão" : ""].filter(Boolean).join(" · ")}</span>
                    </button>
                ))}
                <button type="button" className={`kx-t fg-tile tmg-tile tmg-new ${editing === "new" ? "is-on" : ""}`} onClick={() => setEditing("new")} aria-label="Novo tema">
                    <span className="fg-img"><span className="tmg-plus"><Icon name="plus" />Novo tema</span></span>
                </button>
            </div>
            {!themes.length && editing !== "new" && <Empty icon="palette" title="Nenhum tema ainda">Crie um em "Novo tema…", ou ajuste o texto em Camadas e use "Salvar como novo".</Empty>}
            {editing === "new" && <ThemeEditor row={null} c={c} onDone={(saved) => { setEditing(null); if (saved) reload(); }} />}
            {editingRow && (
                <>
                    <div className="listhead tmg-edit-h">
                        <span className="kx-section">Editando · {editingRow.name}</span>
                        <span style={{ flex: 1 }} />
                        {editingRow.is_default ? <span className="kx-meta">tema padrão</span> : <Btn small onClick={() => makeDefault(editingRow)}>Tornar padrão</Btn>}
                        <Btn small onClick={() => remove(editingRow)}><Icon name="trash" />Excluir…</Btn>
                    </div>
                    <ThemeEditor key={editingRow.id} row={editingRow} c={c} onDone={(saved) => { setEditing(null); if (saved) reload(); }} />
                </>
            )}
        </>
    );
}
