import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, IconBtn, Seg } from "../kx";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import BgChip from "../library/BgChip";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { THEME_FONTS, TEXT_SIZES, themeStyle, themeBackgroundArgs, defaultTheme, defaultChanges } from "@/lib/console/themes";
import { TRANSITIONS, TRANSITION_MS } from "@/lib/console/look";
import { bgSpec, bgFields } from "@/lib/console/backgroundSpec";

// The theme editor (owner's request 2026-10-13, as in SPresenter): a window
// of its own — the theme big on the left, on the sample of your choice
// (a song, a passage, a text), and its settings grouped on the right (Texto,
// Caixa, Fundo, Transição). Opened from Configurações › Temas, the console's
// Temas card (double click, right click) and "Novo tema"; Console.jsx holds
// it: openTheme(id | "new"). Unsaved edits wait per theme until Salvar or
// Cancelar (closing keeps them).
export const ThemeEditorContext = createContext(null);
const nothing = () => {};
export const useThemeEditor = () => useContext(ThemeEditorContext) || nothing;

const BLANK = { name: "", font_family: "sans", font_size: "large", text_effect: "shadow", text_color: "#ffffff", text_color_2: "", text_box: "", text_box_color: "", text_box_opacity: "", text_align: "", text_position: "", text_case: "", line_height: "", text_max_width: "", text_opacity: "", text_nudge: "", transition: "", transition_ms: "", background_image: "", background_fit: "", background_dim: "", background_blur: "" };
const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["outline", "Contorno"], ["3d", "3D"], ["neon", "Neon"], ["none", "Nenhum"]];
const drafts = new Map();

// The samples: what the theme looks like on a song, a passage and a text.
const SAMPLES = {
    lyrics: { label: "Música", args: { kind: "lyrics", title: "Grande é o Senhor", slides: [{ text: "Grande é o Senhor\ne mui digno de louvor" }, { text: "Na cidade do nosso Deus\nno seu santo monte", is_chorus: true }] } },
    bible: { label: "Bíblia", args: { kind: "bible", title: "João 3:16 · NVI", ref: { reference: "João 3:16" }, slides: [{ text: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.", ref: "João 3:16 · NVI" }] } },
    text: { label: "Texto", args: { kind: "text", title: "Avisos", slides: [{ text: "Culto de oração\nquarta-feira às 20h" }] } },
};

const num = (v) => (v == null || v === "" ? "" : String(v));
const hex = (v, fallback) => (/^#[0-9a-f]{6}$/i.test(v || "") ? v : fallback);

function Group({ title, children }) {
    return (
        <section className="te-group">
            <div className="kx-section te-group-h">{title}</div>
            <div className="te-rows">{children}</div>
        </section>
    );
}
const Row = ({ k, children }) => <><span className="k">{k}</span><span className="te-v">{children}</span></>;

export default function ThemeStudio({ c, id, themes, onClose }) {
    const row = id && id !== "new" ? themes.find((t) => t.id === id) || null : null;
    const key = row?.id || "new";
    const [restored] = useState(() => drafts.has(key));
    // The background is one spec (backgroundSpec.js) in `background`; the old
    // fields are written beside it on every change.
    const [draft, setDraft] = useState(() => drafts.get(key) || { ...BLANK, ...(row || {}), ...bgFields(bgSpec(row)) });
    useEffect(() => { drafts.set(key, draft); }, [key, draft]);
    const [sample, setSample] = useState("lyrics");
    const [slide, setSlide] = useState(0);
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    const bg = bgSpec(draft);
    const setBg = (patch) => set(bgFields(patch && bg ? { ...bg, ...patch } : patch));
    const confirm = useConfirm();
    const def = defaultTheme(themes);

    const doc = useMemo(() => {
        try {
            let st = emptyState(c.now);
            const bgArgs = themeBackgroundArgs(draft);
            if (bgArgs) st = applyOp(st, "background.set", bgArgs, c.now);
            const s = SAMPLES[sample].args;
            st = applyOp(st, "content.show", { ...s, style: themeStyle(draft) }, c.now);
            return slide && st.content.slides.length > slide ? { ...st, content: { ...st.content, index: slide } } : st;
        } catch { return null; }
    }, [draft, sample, slide]); // eslint-disable-line react-hooks/exhaustive-deps
    const slides = SAMPLES[sample].args.slides.length;

    const close = (discard) => { if (discard) drafts.delete(key); onClose(); };
    const save = async () => {
        const name = draft.name.trim() || `Tema ${new Date().toLocaleDateString("pt-BR")}`;
        const data = { ...draft, name };
        // is_default belongs to Tornar padrão (the editor's copy may be stale).
        for (const k of ["id", "created_date", "updated_date", "created_by_id", "elements", "is_default"]) delete data[k];
        try {
            if (row?.id) await keryx.entities.ProjectionTheme.update(row.id, data);
            else await keryx.entities.ProjectionTheme.create(data);
            c.say(row?.id ? "Tema salvo." : `Tema "${name}" criado.`);
            close(true);
        } catch (err) { c.say(err?.message || "Não foi possível salvar o tema."); }
    };
    const makeDefault = async () => {
        try { await keryx.entities.ProjectionTheme.bulkUpdate(defaultChanges(themes, row.id)); c.say(`${row.name} é o tema padrão das músicas.`); } catch (err) { c.say(err?.message || "Não foi possível."); }
    };
    const remove = async () => {
        if (!(await confirm(deleteQuestion("o tema", row.name, "Músicas, cultos e saídas que usam este tema voltam ao padrão.")))) return;
        try { await keryx.entities.ProjectionTheme.delete(row.id); c.say("Tema excluído."); close(true); } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
    };
    const title = row ? "Editar tema" : "Novo tema";

    return (
        <>
            <div className="scrim is-dim te-scrim" onClick={() => close(false)} />
            <div className="te-dialog" role="dialog" aria-label={row ? `Editar o tema ${row.name}` : "Novo tema"}>
                <div className="cfg-dialog-h">
                    <span className="kx-section">{title}</span>
                    <input className="te-name" value={draft.name} placeholder="Nome do tema" maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-label="Nome do tema" />
                    {row && (row.id === def?.id ? <span className="kx-meta te-default"><Icon name="star" size={12} />tema padrão</span> : null)}
                    <span className="cfg-h-gap" />
                    <IconBtn name="x" title="Fechar · Esc (o rascunho fica guardado)" onClick={() => close(false)} />
                </div>
                <div className="te-body">
                    <div className="te-stage">
                        <div className="te-samples">
                            <Seg small value={sample} options={Object.entries(SAMPLES).map(([k, s]) => [k, s.label])} onChange={(v) => { setSample(v); setSlide(0); }} label="Amostra" />
                            <span style={{ flex: 1 }} />
                            {slides > 1 && <>
                                <IconBtn name="chevron-left" small title="Slide anterior da amostra" disabled={slide === 0} onClick={() => setSlide((n) => Math.max(0, n - 1))} />
                                <span className="kx-meta">{slide + 1}/{slides}</span>
                                <IconBtn name="chevron-right" small title="Próximo slide da amostra" disabled={slide >= slides - 1} onClick={() => setSlide((n) => Math.min(slides - 1, n + 1))} />
                            </>}
                        </div>
                        <div className="ap-sample te-screen">{doc && <ScreenRenderer state={doc} now={c.now} preview motion audio={false} />}</div>
                        <span className="kx-meta">Exemplo · a amostra segue cada ajuste · o que já está no ar não muda</span>
                    </div>
                    <div className="te-panel">
                        <Group title="Texto">
                            <Row k="Fonte">
                                <select className="cfg-select" value={draft.font_family} onChange={(e) => set({ font_family: e.target.value })} aria-label="Fonte do tema">
                                    {THEME_FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                            </Row>
                            <Row k="Tamanho"><Seg small value={draft.font_size} options={TEXT_SIZES} onChange={(v) => set({ font_size: v })} /></Row>
                            <Row k="Cor">
                                <input type="color" className="ed-color" value={hex(draft.text_color, "#ffffff")} onChange={(e) => set({ text_color: e.target.value })} aria-label="Cor do texto" title="Cor do texto" />
                                {draft.text_color_2
                                    ? <><input type="color" className="ed-color" value={hex(draft.text_color_2, "#ffffff")} onChange={(e) => set({ text_color_2: e.target.value })} aria-label="Segunda cor (degradê)" title="Segunda cor (degradê)" /><Btn small onClick={() => set({ text_color_2: "" })}>Cor única</Btn></>
                                    : <Btn small onClick={() => set({ text_color_2: "#c9a25b" })} title="O texto em degradê de duas cores">Degradê</Btn>}
                            </Row>
                            <Row k="Efeito">
                                <select className="cfg-select" value={draft.text_effect} onChange={(e) => set({ text_effect: e.target.value })} aria-label="Efeito do texto">
                                    {EFFECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                            </Row>
                            <Row k="Alinhamento"><Seg small value={draft.text_align || "center"} options={[["left", "Esq."], ["center", "Centro"], ["right", "Dir."]]} onChange={(v) => set({ text_align: v === "center" ? "" : v })} /></Row>
                            <Row k="Posição"><Seg small value={draft.text_position || "middle"} options={[["top", "Alto"], ["middle", "Meio"], ["bottom", "Baixo"]]} onChange={(v) => set({ text_position: v === "middle" ? "" : v })} /></Row>
                            <Row k="Ajuste fino"><Seg small value={num(draft.text_nudge || 0)} options={[["-10", "↑ 10"], ["-5", "↑ 5"], ["0", "0"], ["5", "↓ 5"], ["10", "↓ 10"]]} onChange={(v) => set({ text_nudge: v === "0" ? "" : Number(v) })} /></Row>
                            <Row k="Maiúsculas"><Seg small value={draft.text_case || "none"} options={[["none", "Não"], ["upper", "Sim"]]} onChange={(v) => set({ text_case: v === "none" ? "" : v })} /></Row>
                            <Row k="Entrelinhas"><Seg small value={draft.line_height || "normal"} options={[["tight", "Justa"], ["normal", "Normal"], ["loose", "Solta"]]} onChange={(v) => set({ line_height: v === "normal" ? "" : v })} /></Row>
                            <Row k="Largura"><Seg small value={num(draft.text_max_width || 100)} options={[["100", "Toda"], ["80", "80%"], ["60", "60%"]]} onChange={(v) => set({ text_max_width: v === "100" ? "" : Number(v) })} /></Row>
                            <Row k="Opacidade"><Seg small value={num(draft.text_opacity || 1)} options={[["1", "100%"], ["0.8", "80%"], ["0.6", "60%"]]} onChange={(v) => set({ text_opacity: v === "1" ? "" : Number(v) })} /></Row>
                        </Group>
                        <Group title="Caixa do texto">
                            <Row k="Caixa"><Seg small value={draft.text_box || ""} options={[["", "Sem"], ["band", "Faixa"], ["block", "Bloco"]]} onChange={(v) => set({ text_box: v, ...(v ? { text_box_color: draft.text_box_color || "#000000", text_box_opacity: draft.text_box_opacity || 0.55 } : { text_box_color: "", text_box_opacity: "" }) })} /></Row>
                            {draft.text_box && <>
                                <Row k="Cor"><input type="color" className="ed-color" value={hex(draft.text_box_color, "#000000")} onChange={(e) => set({ text_box_color: e.target.value })} aria-label="Cor da caixa" title="Cor da caixa" /></Row>
                                <Row k="Opacidade"><Seg small value={num(draft.text_box_opacity || 0.55)} options={[["0.35", "35%"], ["0.55", "55%"], ["0.75", "75%"], ["1", "100%"]]} onChange={(v) => set({ text_box_opacity: Number(v) })} /></Row>
                            </>}
                        </Group>
                        <Group title="Fundo">
                            <Row k="Fundo"><BgChip value={bg} title="Fundo do tema" empty="nenhum" noneLabel="Sem fundo no tema" onPick={(spec) => set(bgFields(spec))} /></Row>
                            {bg && bg.kind !== "color" && <>
                                {bg.kind !== "generator" && <Row k="Ajuste"><Seg small value={bg.fit || "cover"} options={[["cover", "Cobrir"], ["contain", "Conter"]]} onChange={(v) => setBg({ fit: v === "cover" ? undefined : v })} /></Row>}
                                <Row k="Escurecer"><Seg small value={num(bg.dim ?? "")} options={bg.kind === "image" ? [["", "45%"], ["0", "0"], ["0.3", "30%"], ["0.7", "70%"]] : [["", "0"], ["0.3", "30%"], ["0.7", "70%"]]} onChange={(v) => setBg({ dim: v === "" ? undefined : Number(v) })} /></Row>
                                {bg.kind !== "generator" && <Row k="Desfoque"><Seg small value={num(bg.blur ?? "")} options={[["", "Sem"], ["4", "Leve"], ["10", "Forte"]]} onChange={(v) => setBg({ blur: v === "" ? undefined : Number(v) })} /></Row>}
                            </>}
                            <span className="kx-meta te-note">vai para a camada Fundo quando um item com este tema vai ao ar</span>
                        </Group>
                        <Group title="Transição">
                            <Row k="Tipo"><Seg small value={draft.transition || ""} options={[["", "Herdar"], ...TRANSITIONS]} onChange={(v) => set({ transition: v, ...(v ? {} : { transition_ms: "" }) })} /></Row>
                            {draft.transition && draft.transition !== "cut" && <Row k="Duração">
                                <input type="range" className="ap-range" min={TRANSITION_MS[0]} max={TRANSITION_MS[1]} step={20} value={Number(draft.transition_ms) || 400} onChange={(e) => set({ transition_ms: Number(e.target.value) })} aria-label="Duração da transição do tema" />
                                <span className="kx-meta">{Number(draft.transition_ms) || 400} ms</span>
                            </Row>}
                        </Group>
                    </div>
                </div>
                <div className="lib-foot">
                    {row && row.id !== def?.id && <Btn small onClick={makeDefault}><Icon name="star" />Tornar padrão</Btn>}
                    {row && <Btn small onClick={remove}><Icon name="trash" />Excluir…</Btn>}
                    {restored && <span className="kx-meta">rascunho que não tinha sido salvo</span>}
                    <span style={{ flex: 1 }} />
                    <Btn small onClick={() => close(true)}>Cancelar</Btn>
                    <Btn small kind="brand" onClick={save}>Salvar tema</Btn>
                </div>
            </div>
        </>
    );
}
