// The theme half of the Editor de temas e telas (a page of THE window):
// the ONE place a ProjectionTheme is edited (Configurações › Temas is just
// the list that opens this window; Camadas adjusts what is on air and only
// captures a theme with "Salvar como novo"). Every field of the look — the
// classics, the extras Camadas had to itself (opacity, line height, case)
// and, new, where the text sits on the screen: the lyrics box is dragged on
// the canvas (src/lib/console/themeBox.js maps it to text_align /
// text_position / text_max_width / text_nudge, "" = factory), with the 3×3
// zones as guides while dragging.
import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { Panel, Btn, Seg, Empty, WinBar, NumBox } from "../console/kx";
import { Switch, CfgGroup } from "../console/settings/parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import BgChip from "../console/library/BgChip";
import { useLibraryPicker, ALL_KINDS } from "../console/library/libraryContext";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import Icon from "../console/Icon";
import { IconBtn } from "../console/kx";
import { TEXT_SIZES, themeStyle, themeBackgroundArgs, defaultTheme, defaultChanges, themeName, fontSummary, colorSummary, boxSummary, placeSummary, fundoSummary, transitionSummary } from "@/lib/console/themes";
import { SIZE_RANGE, sizeCqw, sizePreset, sizeValue, lineHeightOf, LINE_HEIGHTS, LINE_HEIGHT_RANGE, LETTER_SPACING_RANGE } from "@/lib/textSize";
import FontPicker, { fontNote } from "./FontPicker";
import TextBar from "./TextBar";
import { useChurchFonts } from "../console/useConsoleData";
import { themeBoxRect, rectToTheme, MIN_WIDTH } from "@/lib/console/themeBox";
import { TRANSITIONS, TRANSITION_MS, NATURAL_MS } from "@/lib/console/look";
import { bgSpec, bgFields } from "@/lib/console/backgroundSpec";
import { ConfirmContext, deleteQuestion } from "../console/ConfirmDialog";
import { useWinCol } from "@/components/console/winLayout";
import useDraftHistory from "@/hooks/useDraftHistory";
import { historyKey, hasOwnUndo } from "@/lib/editorHistory";
import UndoRedo from "./UndoRedo";
// The samples the canvas dresses (as ThemeStudio had them, folded in here
// 2026-10-13): what the theme looks like on a song, a passage and a text,
// with their own slides.
const SAMPLES = {
    lyrics: { label: "Música", args: { kind: "lyrics", title: "Grande é o Senhor", slides: [{ text: "Grande é o Senhor\ne mui digno de louvor" }, { text: "Na cidade do nosso Deus\nno seu santo monte", is_chorus: true }] } },
    bible: { label: "Bíblia", args: { kind: "bible", title: "João 3:16 · NVI", ref: { reference: "João 3:16" }, slides: [{ text: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.", ref: "João 3:16 · NVI" }] } },
    text: { label: "Texto", args: { kind: "text", title: "Avisos", slides: [{ text: "Culto de oração\nquarta-feira às 20h" }] } },
};

// "outline" draws hollow letters: it is "Vazado" since the Rodada HF2, when the
// Contorno became its own row (a width and a colour, with any effect).
const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["3d", "3D"], ["neon", "Neon"], ["outline", "Vazado"], ["none", "Nenhum"]];
const BOXES = [["", "Sem"], ["band", "Faixa"], ["block", "Bloco"]];
const H_ALIGNS = [["left", "Esq."], ["", "Centro"], ["right", "Dir."]];
const V_POS = [["top", "Alto"], ["", "Meio"], ["bottom", "Baixo"]];
// show_item_title is the theme's since the Rodada B 2026-10-14 (it was the
// church's, Aparência): a new theme starts with it on; a theme from before
// the field opens as on and saves the choice — prefs v3 already filled the
// existing themes with the church's value, so this only meets a backup
// restored from an older KERYX.
const BLANK = {
    name: "", font_family: "sans", font_size: "large", text_effect: "shadow", text_color: "#ffffff", text_color_2: "",
    text_opacity: "", text_max_width: "", line_height: "", text_case: "", text_nudge: "", text_align: "", text_position: "", text_decoration: "", text_justify: "",
    font_weight: "", font_style: "", letter_spacing: "", text_outline_px: "", text_outline_color: "", note: "",
    text_box: "", text_box_color: "", text_box_opacity: "", transition: "", transition_ms: "", show_item_title: true,
    background_image: "", background_fit: "", background_dim: "", background_blur: "",
};
const FIELDS = Object.keys(BLANK);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pick = (row) => { const out = { ...BLANK }; for (const k of FIELDS) if (row?.[k] != null) out[k] = row[k]; return { ...out, ...bgFields(bgSpec(row)) }; };

// `hosted`: a page of THE window (Rodada C, fase d) — the editor draws its
// own WinBar (the Trocar de tema select as the bar's tool; Excluir,
// Cancelar and Salvar tema as its actions; ⧉ Destacar from the window, or
// onDetach) and no footer. Both hosts — the console's window and a detached
// /Janela — mount it hosted; unhosted it keeps the panel header and footer.
export default function ThemeEditor({ say, themeId, onClose, onSaved, onSwitch, escRef = null, leaveRef = null, active = true, hosted = false, onDetach = null }) {
    // The columns a splitter resizes, kept per page on this computer (Rodada D3).
    const colAjustes = useWinCol("theme.ajustes", { name: "Ajustes", def: 400, min: 340, max: 720 });
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["editor", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    useEffect(() => keryx.entities.ProjectionTheme.subscribe(() => client.invalidateQueries({ queryKey: ["editor", "themes"] })), [client]);
    const isNew = themeId === "new";
    const [draft, setDraft] = useState(() => (isNew ? { ...BLANK } : null));
    const [saved, setSaved] = useState(null);
    // Desfazer / Refazer over the theme (audit C-33): a load and Salvar
    // empty it; another theme remounts the editor.
    const history = useDraftHistory(draft, setDraft);
    const resetHistory = history.reset; // one identity for the editor's life
    const [error, setError] = useState("");
    const [confirm, setConfirm] = useState(null); // "delete" | "discard" (detached only)
    // Both windows (the console's, a detached /Janela) provide the
    // one-question guard; a host without one (null) gets the two-step toast.
    const askCtx = useContext(ConfirmContext);
    const churchFonts = useChurchFonts();
    const [busy, setBusy] = useState(false);
    const [dragging, setDragging] = useState(false);
    // Which sample the canvas dresses, and its slide.
    const [sample, setSample] = useState("lyrics");
    const [slide, setSlide] = useState(0);
    const loaded = useRef(false);
    const screenRef = useRef(null);
    const drag = useRef(null);

    useEffect(() => {
        if (isNew || loaded.current) return undefined;
        let alive = true;
        keryx.entities.ProjectionTheme.get(themeId)
            .then((row) => { if (!alive) return; loaded.current = true; const start = pick(row); setDraft(start); setSaved(pick(row)); resetHistory(start); })
            .catch((err) => { if (alive) setError(err?.message || "Tema não encontrado."); });
        return () => { alive = false; };
    }, [themeId, isNew, resetHistory]);

    const savedId = useRef(isNew ? "" : themeId);
    const dirty = useMemo(() => draft && !sameJson(draft, saved ?? { ...BLANK }), [draft, saved]);
    const set = (patch) => { setConfirm(null); setDraft((d) => ({ ...d, ...patch })); };
    const bg = bgSpec(draft || {});
    const setBg = (patch) => set(bgFields(patch && bg ? { ...bg, ...patch } : patch));
    // A theme is saved with a background from the library (owner 2026-10-14,
    // themeHasBackground): Salvar waits for one, an old theme without one
    // included; Ctrl+S without one opens the library.
    const pickLibrary = useLibraryPicker();
    const NEEDS_BG = "Escolha um fundo da biblioteca para salvar o tema.";
    const chooseBg = async () => {
        const r = await pickLibrary({ accept: ALL_KINDS, value: bg, title: "Fundo do tema" });
        if (r?.spec) set(bgFields(r.spec));
    };

    const save = async () => {
        // No name, no name: never a made-up date (owner 2026-10-14).
        const name = (draft.name || "").trim();
        const data = { ...draft, name };
        if (!bgSpec(data)) { say(NEEDS_BG); chooseBg(); return null; }
        setBusy(true);
        try {
            const row = isNew && !saved ? await keryx.entities.ProjectionTheme.create(data) : await keryx.entities.ProjectionTheme.update(savedId.current, data);
            savedId.current = row.id;
            setSaved(pick(row));
            const fresh = pick(row);
            setDraft(fresh);
            history.reset(fresh);
            say("Tema salvo. O que já está no ar não muda; o próximo envio sai com ele.");
            onSaved?.(row);
            setBusy(false);
            return row;
        } catch (err) { say(err?.message || "Não foi possível salvar o tema."); }
        setBusy(false);
        return null;
    };
    // The guard is the one question (Rodada C, ConfirmDialog), in the
    // console's window and in a detached /Janela alike; with no provider the
    // two-step toast (owner 2026-10-13).
    const askDiscard = async () => {
        if (!dirty) return true;
        if (askCtx) return askCtx({ title: "Descartar as mudanças?", text: `O tema "${(draft?.name || "").trim() || "sem nome"}" tem mudanças não salvas.`, ok: "Descartar" });
        return false;
    };
    const removeTheme = async () => {
        if (askCtx) { if (!(await askCtx(deleteQuestion("o tema", draft.name || "Tema sem nome")))) return; }
        else if (confirm !== "delete") { setConfirm("delete"); say(`Clique de novo para excluir "${draft.name || "o tema"}".`); return; }
        try { await keryx.entities.ProjectionTheme.delete(savedId.current); say("Tema excluído."); (onSwitch || onClose)("new"); } catch (err) { say(err?.message || "Não foi possível excluir."); }
    };
    const leave = async (all = false) => {
        if (dirty && !askCtx && confirm !== "discard") { setConfirm("discard"); say("Há mudanças não salvas · clique de novo (ou Esc) para descartar."); return; }
        if (askCtx && !(await askDiscard())) return;
        onClose(all);
    };
    const switchTo = async (id) => {
        if (id === (savedId.current || themeId)) return;
        if (dirty && !askCtx && confirm !== "discard") { setConfirm("discard"); say("Há mudanças não salvas · escolha de novo para descartar."); return; }
        if (askCtx && !(await askDiscard())) return;
        onSwitch?.(id);
    };
    useEffect(() => {
        if (!dirty) return undefined;
        const guard = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
    }, [dirty]);

    // Keys: Ctrl+S saves; Ctrl+Z undoes and Ctrl+Y / Ctrl+Shift+Z redo (a
    // text field keeps its own while it has the focus, audit C-33); Esc
    // leaves a field, then the window (asking).
    // Hosted in the console's window (escRef set), Esc comes routed from
    // the console instead (keys.js ESC_ORDER "window") and the dirty guard
    // still asks; the (x) ("all") leaves the whole stack the same way.
    // leaveRef is the detached footer's guarded Fechar. Anything over the
    // editor (the library, a confirm) takes the keys first.
    if (escRef) escRef.current = (mode) => leave(mode === "all");
    if (leaveRef) leaveRef.current = () => leave();
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (!active) return; // another page of the window covers this one
        // Only what opens OVER the editor takes the keys (the library, a
        // right-click menu, a confirm). In the detached window, Esc closes
        // the library itself (its scrim) — in the console's window the
        // console routes that (ESC_ORDER "library" before "window").
        const libScrim = document.querySelector(".console .lib-scrim");
        if (libScrim) { if (!escRef && e.key === "Escape") { e.preventDefault(); e.stopPropagation(); libScrim.click(); } return; }
        if (document.querySelector(".console .ctx-scrim, .console .confirm-scrim")) return;
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); if (draft) save(); return; }
        const hk = draft ? historyKey(e, hasOwnUndo(e.target)) : null;
        if (hk) { e.preventDefault(); e.stopPropagation(); setConfirm(null); history[hk](); return; }
        if (e.key === "Escape") {
            if (escRef) return; // the console routes it
            e.preventDefault(); e.stopPropagation();
            if (typing) { e.target.blur(); return; }
            leave();
        }
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    // The sample the canvas dresses with the draft (the real renderer on
    // real ops, as the old Configurações editor did).
    const madeAt = useRef(keryx.live.now());
    const doc = useMemo(() => {
        if (!draft) return null;
        try {
            let st = emptyState(madeAt.current);
            const b = themeBackgroundArgs(draft);
            if (b) st = applyOp(st, "background.set", b, madeAt.current);
            const s = SAMPLES[sample].args;
            st = applyOp(st, "content.show", { ...s, style: { ...themeStyle(draft), title: draft.show_item_title !== false ? "show" : "hide" } }, madeAt.current);
            return slide && st.content.slides.length > slide ? { ...st, content: { ...st.content, index: slide } } : st;
        } catch { return null; }
    }, [draft, sample, slide]);
    const slides = SAMPLES[sample].args.slides.length;

    // ---- The lyrics box on the canvas (themeBox.js) ----
    const rect = draft ? themeBoxRect(themeStyle(draft)) : null;
    const pct = (e) => {
        const r = screenRef.current?.getBoundingClientRect();
        if (!r || !r.width) return { x: 0, y: 0 };
        return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
    };
    const startDrag = (e, handle = null) => {
        e.preventDefault(); e.stopPropagation();
        e.currentTarget.setPointerCapture?.(e.pointerId);
        drag.current = { handle, from: pct(e), rect0: rect };
        history.begin(`drag:${Date.now()}`); // the whole drag is one step
        setDragging(true);
    };
    const onMove = (e) => {
        const d = drag.current;
        if (!d) return;
        const p = pct(e);
        const dx = p.x - d.from.x, dy = p.y - d.from.y;
        let r;
        if (d.handle === "e") r = { ...d.rect0, w: Math.min(100 - d.rect0.x, Math.max(MIN_WIDTH, d.rect0.w + dx)) };
        else if (d.handle === "w") { const w = Math.min(d.rect0.x + d.rect0.w, Math.max(MIN_WIDTH, d.rect0.w - dx)); r = { ...d.rect0, x: d.rect0.x + d.rect0.w - w, w }; }
        else r = { ...d.rect0, x: d.rect0.x + dx, y: d.rect0.y + dy };
        set(rectToTheme(r, { box: draft.text_box }));
    };
    const endDrag = () => { if (drag.current) history.end(); drag.current = null; setDragging(false); };

    const wrap = (inner) => (hosted ? <><WinBar title="Editor de temas" sub="" detach={onDetach} /><div className="win-body is-ed">{inner}</div></> : inner);
    if (error) return wrap(<div className="col center"><Panel noHead={hosted} title="Editor de tema"><Empty icon="warn" title="Não foi possível abrir">{error}</Empty><div className="pl-pad"><Btn onClick={() => onClose()}>Fechar</Btn></div></Panel></div>);
    if (!draft) return wrap(<div className="col center"><Panel noHead={hosted} title="Editor de tema"><Empty title="Abrindo…" /></Panel></div>);

    const num = (v) => (v == null || v === "" ? "" : String(v));
    const others = [...themes].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    const band = draft.text_box === "band";
    const themeTitle = draft.name || (savedId.current ? "Tema sem nome" : "Novo tema");
    const pickTheme = (
        <select className="pl-input le-use" value={savedId.current || ""} onChange={(e) => switchTo(e.target.value || "new")} aria-label="Trocar de tema" title="Editar outro tema">
            {!savedId.current && <option value="">{themeTitle}</option>}
            <option value="new">Novo tema…</option>
            {others.map((t) => <option key={t.id} value={t.id}>{themeName(t)}</option>)}
        </select>
    );
    const deleteBtn = Boolean(savedId.current) && <Btn small kind={confirm === "delete" ? "air" : ""} onClick={removeTheme}>{confirm === "delete" ? "Excluir mesmo" : "Excluir…"}</Btn>;

    const body = (
        <>
            <div className="col nv-l" style={colAjustes.style}>
                <Panel title={hosted ? "Tema" : <>Tema <span className="kx-count">· {themeTitle}{dirty ? " · não salvo" : ""}</span></>} actions={<>{pickTheme}{deleteBtn}</>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    {/* The text bar (Rodada P, P8-1 = A): fixed over the
                        form, the groups below — the font, the size, N I S,
                        Aa, the alignment, Cor and Contorno. */}
                    <TextBar value={draft} onChange={set}
                        font={<FontPicker value={draft.font_family} onChange={(v) => set({ font_family: v })} say={say} style={{ width: 168 }} />}
                        size={{ value: sizeCqw(draft.font_size), min: SIZE_RANGE[0], max: SIZE_RANGE[1], step: 0.1, unit: "%", onChange: (n) => set({ font_size: sizeValue(n) }) }} />
                    <div className="nv-scroll">
                        <CfgGroup id="tema.nome" k="tema.nome" title="Nome e padrão" summary={""} fold={false}>
                            <div className="frm nv-frm">
                            <span className="k">Nome</span><input className="pl-input" value={draft.name} placeholder="Nome do tema" maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-label="Nome do tema" />
                            {/* Tornar padrão lives in the form (Rodada C, fase d;
                                it was the footer's): one transaction, never two
                                defaults. */}
                            {Boolean(savedId.current) && <>
                                <span className="k">Tema padrão</span>
                                {defaultTheme(themes)?.id === savedId.current
                                    ? <span className="kx-meta" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="star" size={12} />é o tema padrão da igreja</span>
                                    : <span className="nv-inline"><Btn small onClick={async () => { try { await keryx.entities.ProjectionTheme.bulkUpdate(defaultChanges(themes, savedId.current)); say(`${draft.name || "O tema"} é o tema padrão.`); } catch (err) { say(err?.message || "Não foi possível."); } }}><Icon name="star" />Tornar padrão</Btn></span>}
                            </>}
                            {/* The theme's comment (Rodada HF2): what it is
                                for, for whoever picks it; never on air, it
                                is the theme's tooltip in Temas. */}
                            <span className="k">Comentário</span>
                            <input className="pl-input" value={draft.note || ""} placeholder="Para que serve este tema (não vai ao ar)" maxLength={500} onChange={(e) => set({ note: e.target.value })} aria-label="Comentário do tema" />
                            {/* The item's title over the slide is the theme's
                                choice (Rodada B 2026-10-14); Camadas › Texto
                                principal › Título still decides per item on
                                air. */}
                            <span className="k">Título do item</span>
                            <span className="nv-inline">
                                <Switch on={draft.show_item_title !== false} onChange={(on) => set({ show_item_title: on })} label="Mostrar o título do item sobre o slide" />
                                <span className="kx-meta">o nome da música ou do texto, no alto do slide</span>
                            </span>
                            </div>
                        </CfgGroup>
                        <CfgGroup id="tema.fonte" k="tema.fonte" title="Fonte" summary={fontSummary(draft)}>
                            <div className="frm nv-frm">
                            {/* The font (Rodada HF1) is the text bar's first
                                control — KERYX's, the church's (copied into
                                the library) or one brought from this PC or a
                                file (FontPicker.jsx); this line says where it
                                comes from. */}
                            <span className="k">Origem</span>
                            <span className="kx-meta le-font-note">{fontNote(draft.font_family, churchFonts.families)}</span>
                            {/* The size is a number, % of the screen's width
                                (Rodada HF2, owner's pick "numero_atalhos"),
                                typed in the bar; PP…GGG only write their
                                number. An old theme's name ("large") shows as
                                its number and stays until it is changed. */}
                            <span className="k">Atalhos</span>
                            <Seg small label="Atalhos de tamanho" value={sizePreset(draft.font_size)} options={TEXT_SIZES} onChange={(k) => set({ font_size: sizeValue(k) })} />
                            {/* Line and letter spacing as numbers (an old
                                theme's Justas/Largas show as 1,08/1,45); the
                                normal ones are saved as "" (the screen's own). */}
                            <span className="k">Entrelinhas</span>
                            <span className="nv-inline">
                                <NumBox label="Entrelinhas" value={draft.line_height === "" ? "" : lineHeightOf(draft.line_height)} empty={LINE_HEIGHTS.normal} min={LINE_HEIGHT_RANGE[0]} max={LINE_HEIGHT_RANGE[1]} step={0.05} onChange={(n) => set({ line_height: n === LINE_HEIGHTS.normal ? "" : n })} />
                                <span className="kx-meta">1,22 = normal</span>
                            </span>
                            <span className="k">Espaçamento</span>
                            <span className="nv-inline">
                                <NumBox label="Espaçamento entre as letras" value={draft.letter_spacing} empty={0} min={LETTER_SPACING_RANGE[0]} max={LETTER_SPACING_RANGE[1]} step={0.01} unit="em" onChange={(n) => set({ letter_spacing: n === 0 ? "" : n })} />
                                <span className="kx-meta">entre as letras</span>
                            </span>
                            </div>
                        </CfgGroup>
                        <CfgGroup id="tema.cor" k="tema.cor" title="Cor e efeito" summary={colorSummary(draft)} defaultOpen={false}>
                            <div className="frm nv-frm">
                            {/* The colour and the outline are the text bar's;
                                the effect and the gradient's second colour stay here. */}
                            <span className="k">Efeito</span>
                            <span className="nv-inline">
                                <select className="pl-input" style={{ width: "auto" }} value={draft.text_effect} onChange={(e) => set({ text_effect: e.target.value })} aria-label="Efeito do texto">
                                    {EFFECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                                {draft.text_color_2
                                    ? <><input type="color" className="ed-color" value={/^#[0-9a-f]{6}$/i.test(draft.text_color_2) ? draft.text_color_2 : "#ffffff"} onChange={(e) => set({ text_color_2: e.target.value })} aria-label="Segunda cor (degradê)" title="Segunda cor (degradê)" /><Btn small onClick={() => set({ text_color_2: "" })}>Cor única</Btn></>
                                    : <Btn small onClick={() => set({ text_color_2: "#c9a25b" })} title="O texto em degradê de duas cores">Degradê</Btn>}
                            </span>
                            <span className="k">Opacidade</span>
                            {/* Continuous (Rodada C, fase d): the model always
                                took 20–100%; the UI offered four presets. */}
                            <span className="nv-inline">
                                <input type="range" className="le-range" min={20} max={100} step={1} value={Math.round((draft.text_opacity === "" ? 1 : Number(draft.text_opacity)) * 100)} onChange={(e) => { const v = Number(e.target.value); set({ text_opacity: v >= 100 ? "" : v / 100 }); }} aria-label="Opacidade do texto" />
                                <span className="kx-meta">{Math.round((draft.text_opacity === "" ? 1 : Number(draft.text_opacity)) * 100)}%</span>
                            </span>
                            </div>
                        </CfgGroup>
                        <CfgGroup id="tema.caixa" k="tema.caixa" title="Caixa do texto" summary={boxSummary(draft)} defaultOpen={false}>
                            <div className="frm nv-frm">
                            <span className="k">Caixa do texto</span>
                            <span className="nv-inline">
                                <Seg small label="Caixa do texto" value={draft.text_box || ""} options={BOXES} onChange={(v) => set({ text_box: v, ...(v ? { text_box_color: draft.text_box_color || "#000000", text_box_opacity: draft.text_box_opacity || 0.55 } : { text_box_color: "", text_box_opacity: "" }) })} />
                                {draft.text_box && <input type="color" className="ed-color" value={draft.text_box_color || "#000000"} onChange={(e) => set({ text_box_color: e.target.value })} aria-label="Cor da caixa" title="Cor da caixa" />}
                            </span>
                            {/* The box's opacity was fixed at 55% with no
                                control (Rodada C, fase d); the renderer always
                                took 0–90%. */}
                            {draft.text_box && <>
                                <span className="k">Opacidade da caixa</span>
                                <span className="nv-inline">
                                    <input type="range" className="le-range" min={0} max={90} step={1} value={Math.round((Number(draft.text_box_opacity) || 0.55) * 100)} onChange={(e) => set({ text_box_opacity: Number(e.target.value) / 100 })} aria-label="Opacidade da caixa" />
                                    <span className="kx-meta">{Math.round((Number(draft.text_box_opacity) || 0.55) * 100)}%</span>
                                </span>
                            </>}
                            </div>
                        </CfgGroup>
                        <CfgGroup id="tema.posicao" k="tema.posicao" title="Posição" summary={placeSummary(draft)} defaultOpen={false}>
                            <div className="frm nv-frm">
                            <span className="k">Alinhamento</span>
                            <Seg small label="Alinhamento" value={draft.text_align || ""} options={H_ALIGNS} onChange={(v) => set({ text_align: v })} />
                            <span className="k">Posição</span>
                            <Seg small label="Posição" value={draft.text_position || ""} options={V_POS} onChange={(v) => set({ text_position: v, text_nudge: "" })} />
                            <span className="k">Largura</span>
                            <span className="nv-inline">
                                <input type="range" className="le-range" min={MIN_WIDTH} max={100} step={1} value={band ? 100 : Number(draft.text_max_width) || 100} disabled={band} onChange={(e) => set({ text_max_width: Number(e.target.value) >= 100 ? "" : Number(e.target.value) })} aria-label="Largura do texto" />
                                <span className="kx-meta">{band ? "a faixa vai de borda a borda" : `${Number(draft.text_max_width) || 100}%`}</span>
                            </span>
                            <span className="k">Ajuste fino</span>
                            <span className="nv-inline">
                                <input type="range" className="le-range" min={-20} max={20} step={1} value={Number(draft.text_nudge) || 0} onChange={(e) => set({ text_nudge: Number(e.target.value) === 0 ? "" : Number(e.target.value) })} aria-label="Ajuste fino vertical" />
                                <span className="kx-meta">{Number(draft.text_nudge) || 0}%</span>
                            </span>
                            </div>
                        </CfgGroup>
                        <CfgGroup id="tema.fundo" k="tema.fundo" title="Fundo" summary={fundoSummary(draft)}>
                            <div className="frm nv-frm">
                            <span className="k">Fundo</span>
                            <span className="nv-inline">
                                <BgChip value={bg} title="Fundo do tema" empty="falta escolher" className={bg ? "" : "is-missing"} onPick={(spec) => spec && set(bgFields(spec))} />
                                <span className={`kx-meta${bg ? "" : " is-warn"}`}>{bg ? "vai para a camada Fundo quando um item com este tema vai ao ar" : "obrigatório · imagem, vídeo, gerado ou cor"}</span>
                            </span>
                            {bg && bg.kind !== "color" && bg.kind !== "generator" && <>
                                <span className="k">Ajuste do fundo</span>
                                <Seg small label="Ajuste do fundo" value={bg.fit || "cover"} options={[["cover", "Cobrir"], ["contain", "Conter"]]} onChange={(v) => setBg({ fit: v === "cover" ? undefined : v })} />
                                {/* Which part of the picture stays on screen
                                    (the spec always carried it; no UI until
                                    Rodada C, fase d). */}
                                <span className="k">Posição do fundo</span>
                                <Seg small label="Posição do fundo" value={bg.position || "center"} options={[["top", "Topo"], ["center", "Centro"], ["bottom", "Base"]]} onChange={(v) => setBg({ position: v === "center" ? undefined : v })} />
                            </>}
                            {bg && bg.kind !== "color" && <>
                                <span className="k">Escurecer</span>
                                <span className="nv-inline">
                                    <input type="range" className="le-range" min={0} max={90} step={1} value={Math.round((bg.dim ?? (bg.kind === "image" ? 0.45 : 0)) * 100)} onChange={(e) => setBg({ dim: Number(e.target.value) / 100 })} aria-label="Escurecer o fundo" />
                                    <span className="kx-meta">{Math.round((bg.dim ?? (bg.kind === "image" ? 0.45 : 0)) * 100)}%</span>
                                </span>
                                {bg.kind !== "generator" && <>
                                    <span className="k">Desfoque</span>
                                    <span className="nv-inline">
                                        <input type="range" className="le-range" min={0} max={20} step={1} value={Number(bg.blur) || 0} onChange={(e) => setBg({ blur: Number(e.target.value) === 0 ? undefined : Number(e.target.value) })} aria-label="Desfoque do fundo" />
                                        <span className="kx-meta">{Number(bg.blur) ? `${bg.blur} px` : "Sem"}</span>
                                    </span>
                                </>}
                            </>}
                            </div>
                        </CfgGroup>
                        <CfgGroup id="tema.transicao" k="tema.transicao" title="Transição" summary={transitionSummary(draft)} defaultOpen={false}>
                            <div className="frm nv-frm">
                            <span className="k">Transição</span>
                            <span className="nv-inline">
                                <Seg small label="Transição" value={draft.transition || ""} options={[["", `Padrão (Esmaecer · ${NATURAL_MS.fade} ms)`], ...TRANSITIONS]} onChange={(v) => set({ transition: v, ...(v ? {} : { transition_ms: "" }) })} />
                                {draft.transition && draft.transition !== "cut" && <><input type="range" className="le-range" min={TRANSITION_MS[0]} max={TRANSITION_MS[1]} step={20} value={Number(draft.transition_ms) || 400} onChange={(e) => set({ transition_ms: Number(e.target.value) })} aria-label="Duração da transição do tema" /><span className="kx-meta">{Number(draft.transition_ms) || 400} ms</span></>}
                            </span>
                            </div>
                        </CfgGroup>
                    </div>
                    {!hosted && (
                        <div className="nv-foot">
                            {!bg && <span className="kx-meta is-warn nv-hint" style={{ marginRight: "auto" }}><Icon name="warn" size={12} />{NEEDS_BG}</span>}
                            <Btn onClick={leave}>{confirm === "discard" ? "Descartar mudanças" : "Cancelar"}</Btn>
                            <Btn kind="brand" disabled={busy || !bg} onClick={save} title={bg ? "Ctrl+S" : NEEDS_BG}>Salvar tema</Btn>
                        </div>
                    )}
                </Panel>
            </div>
            {colAjustes.split}
            <div className="col center">
                <Panel title={<>Tela <span className="kx-count">· 16:9</span></>} actions={<>
                    {/* The sample: a song, a passage or a text, with its slides. */}
                    <Seg small label="Exemplo" value={sample} options={Object.entries(SAMPLES).map(([k, s]) => [k, s.label])} onChange={(v) => { setSample(v); setSlide(0); }} />
                    {slides > 1 && <>
                        <IconBtn name="chevron-left" small title="Slide anterior do exemplo" disabled={slide === 0} onClick={() => setSlide((n) => Math.max(0, n - 1))} />
                        <span className="kx-meta">{slide + 1}/{slides}</span>
                        <IconBtn name="chevron-right" small title="Próximo slide do exemplo" disabled={slide >= slides - 1} onClick={() => setSlide((n) => Math.min(slides - 1, n + 1))} />
                    </>}
                </>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="le-stage">
                        <div ref={screenRef} className="le-screen">
                            {doc && <ScreenRenderer fill state={doc} now={madeAt.current} preview audio={false} />}
                            <div className="le-over" onPointerMove={onMove} onPointerUp={endDrag} onPointerCancel={endDrag}>
                                {/* The 3×3 zones, as guides while dragging. */}
                                {dragging && [33.3, 66.7].map((at) => <React.Fragment key={at}><i className="le-guide x" style={{ left: `${at}%` }} /><i className="le-guide y" style={{ top: `${at}%` }} /></React.Fragment>)}
                                {rect && (
                                    <div className="le-hit is-sel tb-box" style={{ left: `${rect.x}%`, top: `${rect.y}%`, width: `${rect.w}%`, height: `${rect.h}%` }}
                                        title="A caixa da letra" onPointerDown={(e) => startDrag(e)}>
                                        {!band && <><i className="le-h e" onPointerDown={(e) => startDrag(e, "e")} /><i className="le-h w" onPointerDown={(e) => startDrag(e, "w")} /></>}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div className="listhead nv-note">
                        <span className="kx-meta">A caixa é onde a letra se encaixa: arraste para as 9 posições; as alças mudam a largura. No ar, o ajuste feito em Camadas continua valendo por cima do tema.</span>
                    </div>
                </Panel>
            </div>
        </>
    );

    if (!hosted) return body;
    return (
        <>
            <WinBar title="Editor de temas" sub={`${themeTitle}${dirty ? " · não salvo" : ""}`}
                actions={<>
                    <UndoRedo history={history} />
                    <Btn small onClick={() => leave()}>Cancelar</Btn>
                    <Btn small kind="brand" disabled={busy || !bg} onClick={save} title={bg ? "Ctrl+S" : NEEDS_BG}>Salvar tema</Btn>
                </>}
                detach={onDetach} />
            <div className="win-body is-ed">{body}</div>
        </>
    );
}
