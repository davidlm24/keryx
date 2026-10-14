import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, WinBar } from "./kx";
import { stageFromMaterial } from "@/lib/console/stage";
import { MATERIAL_TYPES, quizQuestions, slidesFromText, textFromSlides, blankMaterial } from "@/lib/console/school";
import BgChip from "./library/BgChip";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";

const EMPTY = [];
const CLASSES = ["console", "bibleClasses"];
const MATERIALS = ["console", "bibleMaterials"];

// A material of the Escola bíblica, as a page of THE window (Rodada C,
// fase c: it used to swap the Escola's middle column and Esc dropped the
// draft in silence): "← Escola bíblica" goes back to the list, the bar
// holds Salvar/Cancelar/Excluir, and leaving with changes asks. The kind,
// title, lesson and class, the content of that kind, the teacher's notes
// and the colours; saving puts it in the Prévia and goes back.
export default function MaterialView({ c, materialId = null, classId = "", media, onClose, escRef, active = true }) {
    const client = useQueryClient();
    useEffect(() => keryx.entities.BibleSchoolClass.subscribe(() => client.invalidateQueries({ queryKey: CLASSES })), [client]);
    useEffect(() => keryx.entities.BibleMaterial.subscribe(() => client.invalidateQueries({ queryKey: MATERIALS })), [client]);
    const fileRef = useRef(null);
    const classes = useQuery({ queryKey: CLASSES, queryFn: () => keryx.entities.BibleSchoolClass.list("name") }).data ?? EMPTY;
    const materials = useQuery({ queryKey: MATERIALS, queryFn: () => keryx.entities.BibleMaterial.list("-created_date") }).data ?? EMPTY;
    const ask = useConfirm();
    const isNew = !materialId;
    const [draft, setDraft] = useState(() => (isNew ? blankMaterial(null) : null));
    const orig = useRef(isNew ? JSON.stringify(blankMaterial(null)) : null);
    // A new material seeded with the class it came from, once the classes load.
    useEffect(() => {
        if (!isNew || !classId || draft?.class_id) return;
        const k = classes.find((x) => x.id === classId);
        if (!k) return;
        const d = blankMaterial(k);
        setDraft(d);
        orig.current = JSON.stringify(d);
    }, [classes, classId, isNew]); // eslint-disable-line react-hooks/exhaustive-deps
    // An existing one: the row as the list has it (realtime keeps it fresh).
    useEffect(() => {
        if (isNew || draft) return;
        const m = materials.find((x) => x.id === materialId);
        if (!m) return;
        const d = { ...blankMaterial(null), ...m, slides: m.slides || [], quiz_questions: quizQuestions(m) };
        setDraft(d);
        orig.current = JSON.stringify(d);
    }, [materials, materialId, isNew, draft]);
    const dirty = useMemo(() => draft && JSON.stringify(draft) !== orig.current, [draft]);
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    const [slidesText, setSlidesText] = useState(null);
    useEffect(() => { if (draft && slidesText === null) setSlidesText(textFromSlides(draft.slides)); }, [draft, slidesText]);

    const save = async () => {
        if (!draft.title.trim()) { c.say("Dê um título ao material."); return; }
        const { id, created_date: _c, updated_date: _u, created_by_id: _b, ...row } = draft;
        const klass = classes.find((k) => k.id === row.class_id);
        const data = { ...row, title: row.title.trim(), class_name: klass?.name || "", age_group: klass?.age_group || "all" };
        try {
            const saved = id ? await keryx.entities.BibleMaterial.update(id, data) : await keryx.entities.BibleMaterial.create(data);
            client.invalidateQueries({ queryKey: MATERIALS });
            c.setPrev(stageFromMaterial(saved));
            c.say("Material salvo · está na Prévia.");
            orig.current = JSON.stringify(draft);
            onClose();
        } catch (err) { c.say(err?.message || "Não foi possível."); }
    };
    const remove = async () => {
        if (!(await ask(deleteQuestion("o material", draft.title || "Novo material")))) return;
        try { await keryx.entities.BibleMaterial.delete(draft.id); client.invalidateQueries({ queryKey: MATERIALS }); c.say("Material excluído."); onClose(); } catch (err) { c.say(err?.message || "Não foi possível."); }
    };
    const leave = async (all = false) => {
        if (dirty && !(await ask({ title: "Descartar as mudanças?", text: `O material "${draft.title?.trim() || "Novo material"}" tem mudanças não salvas.`, ok: "Descartar" }))) return;
        onClose(all);
    };

    // Esc comes routed from the console (keys.js ESC_ORDER "window"): leave,
    // asking if it changed; the (x) leaves the whole stack the same way.
    // Ctrl+S saves — the page's own key; it defers to a dialog over the
    // page and sleeps while another page covers this one.
    if (escRef) escRef.current = (mode) => leave(mode === "all");
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (!(draft && active && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")) return;
        if (document.querySelector(".console .scrim:not(.win-scrim)")) return;
        e.preventDefault(); e.stopPropagation();
        save();
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    const bar = (title) => (
        <WinBar title="Material" sub={title} actions={draft ? <>
            {draft.id && <Btn small onClick={remove}>Excluir…</Btn>}
            <Btn small onClick={() => c.setPrev(stageFromMaterial({ ...draft, id: draft.id || "rascunho" }))} title="Ver como fica, na Prévia do console">Pôr na prévia</Btn>
            <Btn small onClick={() => leave()}>Cancelar</Btn>
            <Btn small kind="brand" onClick={save} title="Ctrl+S">Salvar material</Btn>
        </> : null} />
    );
    if (!draft) return <>{bar("Abrindo…")}<div className="win-body" /></>;

    const qs = draft.quiz_questions || [];
    const setQ = (i, patch) => set({ quiz_questions: qs.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
    const files = media.filter((m) => !m.missing && (draft.type === "video" ? m.type === "video" : m.type === "image" || m.type === "gif"));
    const upload = async (file) => {
        if (!file) return;
        try { const { file_url } = await keryx.integrations.Core.UploadFile({ file }); set(draft.type === "video" ? { video_url: file_url } : { image_url: file_url }); } catch (err) { c.say(err?.message || "Não foi possível copiar o arquivo."); }
    };

    return (
        <>
            {bar(`${draft.id ? draft.title || "Material" : "Novo material"}${dirty ? " · não salvo" : ""}`)}
            <div className="win-body">
            <div className="col" style={{ flex: "1 1 auto", maxWidth: 760, minWidth: 0, margin: "0 auto" }}>
                <Panel noHead bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="sv-scroll">
                        <div className="frm sv-frm sv-ed">
                            <span className="k">Tipo</span><Seg small value={draft.type} onChange={(v) => set({ type: v })} options={MATERIAL_TYPES.map(([k, l]) => [k, l])} />
                            <span className="k">Título</span><Field icon={null} value={draft.title} onChange={(v) => set({ title: v })} placeholder="Ex.: Pergunta · o filho pródigo" inputProps={{ autoFocus: !draft.id }} />
                            <span className="k">Lição</span><Field icon={null} value={draft.subject || ""} onChange={(v) => set({ subject: v })} placeholder="Ex.: Lição 12 · Parábolas" />
                            <span className="k">Turma</span>
                            <select className="pl-input" value={draft.class_id || ""} onChange={(e) => set({ class_id: e.target.value })} aria-label="Turma"><option value="">Todas as turmas</option>{classes.map((k) => <option key={k.id} value={k.id}>{k.name}</option>)}</select>
                            {(draft.type === "slides" || draft.type === "text") && (
                                <>
                                    <span className="k">{draft.type === "text" ? "Texto" : "Slides"}</span>
                                    <div>
                                        <textarea className="ed-text sv-slides" value={slidesText ?? ""} onChange={(e) => { setSlidesText(e.target.value); set({ slides: slidesFromText(e.target.value).map((s, i) => ({ ...s, image_url: draft.slides?.[i]?.image_url || "" })) }); }} placeholder={"Cada bloco é um slide.\n\nDeixe uma linha em branco entre eles."} aria-label="Slides" />
                                        <span className="kx-meta">{(draft.slides || []).length} {(draft.slides || []).length === 1 ? "slide" : "slides"} · uma linha em branco separa os slides</span>
                                    </div>
                                </>
                            )}
                            {draft.type === "quiz" && (
                                <>
                                    <span className="k">Perguntas</span>
                                    <div className="sv-quiz">
                                        {qs.map((q, i) => (
                                            <div key={i} className="sv-q">
                                                <div className="nv-inline"><b className="kx-meta">{i + 1}.</b><Field icon={null} value={q.question || ""} onChange={(v) => setQ(i, { question: v })} placeholder="A pergunta" style={{ flex: 1 }} /><IconBtn name="x" small title="Tirar a pergunta" onClick={() => set({ quiz_questions: qs.filter((_, k) => k !== i) })} /></div>
                                                {[0, 1, 2, 3].map((k) => (
                                                    <div key={k} className="nv-inline sv-opt">
                                                        <button type="button" className={`sv-right kx-t ${Number(q.correct) === k ? "is-on" : ""}`} onClick={() => setQ(i, { correct: k })} title="Marcar como a resposta certa">{"ABCD"[k]}</button>
                                                        <Field icon={null} value={(q.options || [])[k] || ""} onChange={(v) => { const o = [...(q.options || [])]; o[k] = v; while (o.length && !o[o.length - 1]) o.pop(); setQ(i, { options: o }); }} placeholder={k < 2 ? `Opção ${"ABCD"[k]}` : `Opção ${"ABCD"[k]} (opcional)`} style={{ flex: 1 }} />
                                                    </div>
                                                ))}
                                            </div>
                                        ))}
                                        <Btn small onClick={() => set({ quiz_questions: [...qs, { question: "", options: [], correct: 0 }] })}><Icon name="plus" />Pergunta</Btn>
                                        <span className="kx-meta">Cada pergunta vira dois slides: a pergunta e, logo depois, a resposta certa (→ revela).</span>
                                    </div>
                                </>
                            )}
                            {(draft.type === "video" || draft.type === "image") && (
                                <>
                                    <span className="k">{draft.type === "video" ? "Vídeo" : "Imagem"}</span>
                                    <div className="sv-file">
                                        <select className="pl-input" value={(draft.type === "video" ? draft.video_url : draft.image_url) || ""} onChange={(e) => set(draft.type === "video" ? { video_url: e.target.value } : { image_url: e.target.value })} aria-label="Arquivo">
                                            <option value="">Escolha da Mídia…</option>
                                            {files.map((m) => <option key={m.id} value={m.file_url}>{m.title}</option>)}
                                            {(draft.type === "video" ? draft.video_url : draft.image_url) && !files.some((m) => m.file_url === (draft.type === "video" ? draft.video_url : draft.image_url)) && <option value={draft.type === "video" ? draft.video_url : draft.image_url}>Arquivo atual</option>}
                                        </select>
                                        <Btn small onClick={() => fileRef.current?.click()}><Icon name="folder" />Do computador…</Btn>
                                        <input ref={fileRef} type="file" hidden accept={draft.type === "video" ? "video/*" : "image/*"} onChange={(e) => { upload(e.target.files?.[0]); e.target.value = ""; }} />
                                    </div>
                                </>
                            )}
                            <span className="k">Notas</span>
                            <textarea className="ed-text" rows={3} value={draft.description || ""} onChange={(e) => set({ description: e.target.value })} placeholder="Para o professor: só no console e no palco, nunca no telão" aria-label="Notas do professor" />
                            {draft.type !== "video" && draft.type !== "image" && (
                                <>
                                    <span className="k">Cores</span>
                                    <span className="nv-inline">
                                        <label className="nv-color">Texto<input type="color" className="ed-color" value={draft.text_color || "#ffffff"} onChange={(e) => set({ text_color: e.target.value })} /></label>
                                    </span>
                                    <span className="k">Fundo</span>
                                    <span className="nv-inline">
                                        <BgChip accept={["image", "color"]} title="Fundo do material" empty="o do tema"
                                            value={draft.background_image ? { kind: "image", value: draft.background_image } : /^#[0-9a-f]{6}$/i.test(draft.background_color || "") ? { kind: "color", value: draft.background_color } : null}
                                            noneLabel={draft.background_image || draft.background_color ? "Fundo do tema" : undefined}
                                            onPick={(spec) => set(spec?.kind === "image" ? { background_image: spec.value, background_color: "" } : spec?.kind === "color" ? { background_color: spec.value, background_image: "" } : { background_image: "", background_color: "" })} />
                                    </span>
                                </>
                            )}
                        </div>
                    </div>
                </Panel>
            </div>
            </div>
        </>
    );
}
