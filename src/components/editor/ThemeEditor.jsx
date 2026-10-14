// The theme half of the Editor de temas e layouts (src/pages/Editor.jsx):
// the ONE place a ProjectionTheme is edited (Configurações › Temas is just
// the list that opens this window; Camadas adjusts what is on air and only
// captures a theme with "Salvar como novo"). Every field of the look — the
// classics, the extras Camadas had to itself (opacity, line height, case)
// and, new, where the text sits on the screen: the lyrics box is dragged on
// the canvas (src/lib/console/themeBox.js maps it to text_align /
// text_position / text_max_width / text_nudge, "" = factory), with the 3×3
// zones as guides while dragging.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { Panel, Btn, Seg, Empty } from "../console/kx";
import { Switch } from "../console/settings/parts";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import BgChip from "../console/library/BgChip";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import Icon from "../console/Icon";
import { IconBtn } from "../console/kx";
import { THEME_FONTS, TEXT_SIZES, themeStyle, themeBackgroundArgs, defaultTheme, defaultChanges, themeName } from "@/lib/console/themes";
import { themeBoxRect, rectToTheme, MIN_WIDTH } from "@/lib/console/themeBox";
import { TRANSITIONS, TRANSITION_MS } from "@/lib/console/look";
import { bgSpec, bgFields } from "@/lib/console/backgroundSpec";
// The samples the canvas dresses (as ThemeStudio had them, folded in here
// 2026-10-13): what the theme looks like on a song, a passage and a text,
// with their own slides.
const SAMPLES = {
    lyrics: { label: "Música", args: { kind: "lyrics", title: "Grande é o Senhor", slides: [{ text: "Grande é o Senhor\ne mui digno de louvor" }, { text: "Na cidade do nosso Deus\nno seu santo monte", is_chorus: true }] } },
    bible: { label: "Bíblia", args: { kind: "bible", title: "João 3:16 · NVI", ref: { reference: "João 3:16" }, slides: [{ text: "Porque Deus amou o mundo de tal maneira que deu o seu Filho unigênito, para que todo aquele que nele crê não pereça, mas tenha a vida eterna.", ref: "João 3:16 · NVI" }] } },
    text: { label: "Texto", args: { kind: "text", title: "Avisos", slides: [{ text: "Culto de oração\nquarta-feira às 20h" }] } },
};

const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["outline", "Contorno"], ["3d", "3D"], ["neon", "Neon"], ["none", "Nenhum"]];
const BOXES = [["", "Sem"], ["band", "Faixa"], ["block", "Bloco"]];
const LINES = [["tight", "Justas"], ["", "Normais"], ["loose", "Largas"]];
const H_ALIGNS = [["left", "Esq."], ["", "Centro"], ["right", "Dir."]];
const V_POS = [["top", "Alto"], ["", "Meio"], ["bottom", "Baixo"]];
const OPACITIES = [["", "100%"], ["0.85", "85%"], ["0.7", "70%"], ["0.5", "50%"]];
const BLANK = {
    name: "", font_family: "sans", font_size: "large", text_effect: "shadow", text_color: "#ffffff", text_color_2: "",
    text_opacity: "", text_max_width: "", line_height: "", text_case: "", text_nudge: "", text_align: "", text_position: "",
    text_box: "", text_box_color: "", text_box_opacity: "", transition: "", transition_ms: "",
    background_image: "", background_fit: "", background_dim: "", background_blur: "",
};
const FIELDS = Object.keys(BLANK);
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const pick = (row) => { const out = { ...BLANK }; for (const k of FIELDS) if (row?.[k] != null) out[k] = row[k]; return { ...out, ...bgFields(bgSpec(row)) }; };

export default function ThemeEditor({ say, now, themeId, onClose, onSaved, onSwitch, escRef = null, leaveRef = null }) {
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["editor", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    useEffect(() => keryx.entities.ProjectionTheme.subscribe(() => client.invalidateQueries({ queryKey: ["editor", "themes"] })), [client]);
    const isNew = themeId === "new";
    const [draft, setDraft] = useState(() => (isNew ? { ...BLANK } : null));
    const [saved, setSaved] = useState(null);
    const [error, setError] = useState("");
    const [confirm, setConfirm] = useState(null); // "delete" | "discard"
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
            .then((row) => { if (!alive) return; loaded.current = true; setDraft(pick(row)); setSaved(pick(row)); })
            .catch((err) => { if (alive) setError(err?.message || "Tema não encontrado."); });
        return () => { alive = false; };
    }, [themeId, isNew]);

    const savedId = useRef(isNew ? "" : themeId);
    const dirty = useMemo(() => draft && !sameJson(draft, saved ?? { ...BLANK }), [draft, saved]);
    const set = (patch) => { setConfirm(null); setDraft((d) => ({ ...d, ...patch })); };
    const bg = bgSpec(draft || {});
    const setBg = (patch) => set(bgFields(patch && bg ? { ...bg, ...patch } : patch));

    const save = async () => {
        // No name, no name: never a made-up date (owner 2026-10-14).
        const name = (draft.name || "").trim();
        const data = { ...draft, name };
        setBusy(true);
        try {
            const row = isNew && !saved ? await keryx.entities.ProjectionTheme.create(data) : await keryx.entities.ProjectionTheme.update(savedId.current, data);
            savedId.current = row.id;
            setSaved(pick(row));
            setDraft(pick(row));
            say("Tema salvo. O que já está no ar não muda; o próximo envio sai com ele.");
            onSaved?.(row);
            setBusy(false);
            return row;
        } catch (err) { say(err?.message || "Não foi possível salvar o tema."); }
        setBusy(false);
        return null;
    };
    const removeTheme = async () => {
        if (confirm !== "delete") { setConfirm("delete"); say(`Clique de novo para excluir "${draft.name || "o tema"}".`); return; }
        try { await keryx.entities.ProjectionTheme.delete(savedId.current); say("Tema excluído."); (onSwitch || onClose)("new"); } catch (err) { say(err?.message || "Não foi possível excluir."); }
    };
    const leave = () => {
        if (dirty && confirm !== "discard") { setConfirm("discard"); say("Há mudanças não salvas · clique de novo (ou Esc) para descartar."); return; }
        onClose();
    };
    const switchTo = (id) => {
        if (id === (savedId.current || themeId)) return;
        if (dirty && confirm !== "discard") { setConfirm("discard"); say("Há mudanças não salvas · escolha de novo para descartar."); return; }
        onSwitch?.(id);
    };
    useEffect(() => {
        if (!dirty) return undefined;
        const guard = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", guard);
        return () => window.removeEventListener("beforeunload", guard);
    }, [dirty]);

    // Keys: Ctrl+S saves; Esc leaves a field, then the window (asking once).
    // Hosted in the console's floating dialog (escRef set), Esc comes routed
    // from the console instead (keys.js ESC_ORDER "editor") and the dirty
    // guard still asks; leaveRef is the footer's guarded Fechar. Anything
    // over the editor (the library, a confirm) takes the keys first.
    if (escRef) escRef.current = () => leave();
    if (leaveRef) leaveRef.current = () => leave();
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        // Only what opens OVER the editor takes the keys (the library, a
        // right-click menu, a confirm); Configurações' scrim sits under the
        // floating editor and must not.
        if (document.querySelector(".console .lib-scrim, .console .ctx-scrim, .console .confirm-scrim")) return;
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); if (draft) save(); return; }
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
    const madeAt = useRef(now);
    const doc = useMemo(() => {
        if (!draft) return null;
        try {
            let st = emptyState(madeAt.current);
            const b = themeBackgroundArgs(draft);
            if (b) st = applyOp(st, "background.set", b, madeAt.current);
            const s = SAMPLES[sample].args;
            st = applyOp(st, "content.show", { ...s, style: themeStyle(draft) }, madeAt.current);
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
    const endDrag = () => { drag.current = null; setDragging(false); };

    if (error) return <div className="col center"><Panel title="Editor de tema"><Empty icon="warn" title="Não foi possível abrir">{error}</Empty><div className="pl-pad"><Btn onClick={onClose}>Fechar</Btn></div></Panel></div>;
    if (!draft) return <div className="col center"><Panel title="Editor de tema"><Empty title="Abrindo…" /></Panel></div>;

    const num = (v) => (v == null || v === "" ? "" : String(v));
    const others = [...themes].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""), "pt-BR"));
    const band = draft.text_box === "band";

    return (
        <>
            <div className="col nv-l" style={{ flex: "0 1 400px", minWidth: 340 }}>
                <Panel title={<>Tema <span className="kx-count">· {draft.name || (savedId.current ? "Tema sem nome" : "Novo tema")}{dirty ? " · não salvo" : ""}</span></>} actions={<>
                    <select className="pl-input le-use" value={savedId.current || ""} onChange={(e) => switchTo(e.target.value || "new")} aria-label="Trocar de tema" title="Editar outro tema">
                        {!savedId.current && <option value="">{draft.name || "Novo tema"}</option>}
                        <option value="new">Novo tema…</option>
                        {others.map((t) => <option key={t.id} value={t.id}>{themeName(t)}</option>)}
                    </select>
                    {Boolean(savedId.current) && <Btn small kind={confirm === "delete" ? "air" : ""} onClick={removeTheme}>{confirm === "delete" ? "Excluir mesmo" : "Excluir"}</Btn>}
                </>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="nv-scroll">
                        <div className="frm nv-frm">
                            <span className="k">Nome</span><input className="pl-input" value={draft.name} placeholder="Nome do tema" maxLength={60} onChange={(e) => set({ name: e.target.value })} aria-label="Nome do tema" />
                            <span className="k">Fonte</span>
                            <span className="nv-inline">
                                <select className="pl-input" style={{ width: "auto" }} value={draft.font_family} onChange={(e) => set({ font_family: e.target.value })} aria-label="Fonte do tema">
                                    {THEME_FONTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                                <Seg small value={draft.font_size} options={TEXT_SIZES} onChange={(v) => set({ font_size: v })} />
                            </span>
                            <span className="k">Efeito e cor</span>
                            <span className="nv-inline">
                                <select className="pl-input" style={{ width: "auto" }} value={draft.text_effect} onChange={(e) => set({ text_effect: e.target.value })} aria-label="Efeito do texto">
                                    {EFFECTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                                </select>
                                <input type="color" className="ed-color" value={/^#[0-9a-f]{6}$/i.test(draft.text_color) ? draft.text_color : "#ffffff"} onChange={(e) => set({ text_color: e.target.value })} aria-label="Cor do texto" title="Cor do texto" />
                                {draft.text_color_2
                                    ? <><input type="color" className="ed-color" value={/^#[0-9a-f]{6}$/i.test(draft.text_color_2) ? draft.text_color_2 : "#ffffff"} onChange={(e) => set({ text_color_2: e.target.value })} aria-label="Segunda cor (degradê)" title="Segunda cor (degradê)" /><Btn small onClick={() => set({ text_color_2: "" })}>Cor única</Btn></>
                                    : <Btn small onClick={() => set({ text_color_2: "#c9a25b" })} title="O texto em degradê de duas cores">Degradê</Btn>}
                            </span>
                            <span className="k">Opacidade</span>
                            <Seg small value={num(draft.text_opacity)} options={OPACITIES} onChange={(v) => set({ text_opacity: v === "" ? "" : Number(v) })} />
                            <span className="k">Entrelinhas</span>
                            <span className="nv-inline">
                                <Seg small value={draft.line_height || ""} options={LINES} onChange={(v) => set({ line_height: v })} />
                                <Switch on={draft.text_case === "upper"} onChange={(on) => set({ text_case: on ? "upper" : "" })} label="Maiúsculas" /><span className="kx-meta">Maiúsculas</span>
                            </span>
                            <span className="k">Caixa do texto</span>
                            <span className="nv-inline">
                                <Seg small value={draft.text_box || ""} options={BOXES} onChange={(v) => set({ text_box: v, ...(v ? { text_box_color: draft.text_box_color || "#000000", text_box_opacity: draft.text_box_opacity || 0.55 } : { text_box_color: "", text_box_opacity: "" }) })} />
                                {draft.text_box && <input type="color" className="ed-color" value={draft.text_box_color || "#000000"} onChange={(e) => set({ text_box_color: e.target.value })} aria-label="Cor da caixa" title="Cor da caixa" />}
                            </span>
                        </div>
                        {/* Where the text sits: the same fields the canvas box writes. */}
                        <div className="listhead"><span className="kx-section">Texto na tela</span></div>
                        <div className="frm nv-frm">
                            <span className="k">Alinhamento</span>
                            <Seg small value={draft.text_align || ""} options={H_ALIGNS} onChange={(v) => set({ text_align: v })} />
                            <span className="k">Posição</span>
                            <Seg small value={draft.text_position || ""} options={V_POS} onChange={(v) => set({ text_position: v, text_nudge: "" })} />
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
                        <div className="listhead"><span className="kx-section">Fundo e transição</span></div>
                        <div className="frm nv-frm">
                            <span className="k">Fundo</span>
                            <span className="nv-inline">
                                <BgChip value={bg} title="Fundo do tema" empty="nenhum" noneLabel="Sem fundo no tema" onPick={(spec) => set(bgFields(spec))} />
                                <span className="kx-meta">vai para a camada Fundo quando um item com este tema vai ao ar</span>
                            </span>
                            {bg && bg.kind !== "color" && bg.kind !== "generator" && <>
                                <span className="k">Ajuste do fundo</span>
                                <Seg small value={bg.fit || "cover"} options={[["cover", "Cobrir"], ["contain", "Conter"]]} onChange={(v) => setBg({ fit: v === "cover" ? undefined : v })} />
                            </>}
                            {bg && bg.kind !== "color" && <>
                                <span className="k">{bg.kind === "generator" ? "Escurecer" : "Escurecer · desfoque"}</span>
                                <span className="nv-inline">
                                    <Seg small value={num(bg.dim ?? "")} options={bg.kind === "image" ? [["", "45%"], ["0", "0"], ["0.3", "30%"], ["0.7", "70%"]] : [["", "0"], ["0.3", "30%"], ["0.7", "70%"]]} onChange={(v) => setBg({ dim: v === "" ? undefined : Number(v) })} />
                                    {bg.kind !== "generator" && <Seg small value={num(bg.blur ?? "")} options={[["", "Sem"], ["4", "Leve"], ["10", "Forte"]]} onChange={(v) => setBg({ blur: v === "" ? undefined : Number(v) })} />}
                                </span>
                            </>}
                            <span className="k">Transição</span>
                            <span className="nv-inline">
                                <Seg small value={draft.transition || ""} options={[["", "Herdar"], ...TRANSITIONS]} onChange={(v) => set({ transition: v, ...(v ? {} : { transition_ms: "" }) })} />
                                {draft.transition && draft.transition !== "cut" && <><input type="range" className="le-range" min={TRANSITION_MS[0]} max={TRANSITION_MS[1]} step={20} value={Number(draft.transition_ms) || 400} onChange={(e) => set({ transition_ms: Number(e.target.value) })} aria-label="Duração da transição do tema" /><span className="kx-meta">{Number(draft.transition_ms) || 400} ms</span></>}
                            </span>
                        </div>
                    </div>
                    <div className="nv-foot">
                        {/* Tornar padrão lives here too (as ThemeStudio had):
                            one transaction, never two defaults. */}
                        {Boolean(savedId.current) && (defaultTheme(themes)?.id === savedId.current
                            ? <span className="kx-meta" style={{ marginRight: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}><Icon name="star" size={12} />tema padrão</span>
                            : <Btn style={{ marginRight: "auto" }} onClick={async () => { try { await keryx.entities.ProjectionTheme.bulkUpdate(defaultChanges(themes, savedId.current)); say(`${draft.name || "O tema"} é o tema padrão.`); } catch (err) { say(err?.message || "Não foi possível."); } }}><Icon name="star" />Tornar padrão</Btn>)}
                        <Btn onClick={leave}>{confirm === "discard" ? "Descartar mudanças" : "Cancelar"}</Btn>
                        <Btn kind="brand" disabled={busy} onClick={save} title="Ctrl+S">Salvar tema</Btn>
                    </div>
                </Panel>
            </div>
            <div className="kx-gap" />
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
}
