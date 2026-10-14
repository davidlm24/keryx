import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty, Monitor, BackBtn } from "./kx";
import { previewDoc, captionOf, TeacherNotes } from "./CenterPanel";
import { stageFromMaterial, stageFromTool, liveStageId } from "@/lib/console/stage";
import { SEND_LABEL, sendTip } from "@/lib/console/copy";
import { AGE_GROUPS, ageLabel, MATERIAL_TYPES, materialIcon, materialMeta, quizQuestions, slidesFromText, textFromSlides, dayOf, isPresent, toggleAttendance, attendanceNote, presentCount } from "@/lib/console/school";
import BgChip from "./library/BgChip";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";

const EMPTY = [];
const CLASSES = ["console", "bibleClasses"];
const MATERIALS = ["console", "bibleMaterials"];
const blankMaterial = (classRow) => ({ title: "", type: "slides", subject: "", class_id: classRow?.id || "", class_name: classRow?.name || "", age_group: classRow?.age_group || "all", slides: [], quiz_questions: [], video_url: "", image_url: "", description: "", text_color: "#ffffff", background_color: "", background_image: "" });

// Escola bíblica (canvas artboard "Escola bíblica"), a view inside the
// console: turmas and their students (attendance for today), the lesson
// materials, and on the right the console's own Programa and Prévia — a
// click prepares a material, Enter or a double click sends it, a quiz's
// answer is the next slide (→). Materials are edited here; they also go
// into the Setlist (planner, "Setlist" here) and the palette.
export default function SchoolView({ c, logoUrl, media, onSend, onAddToSetlist, onClose, escRef }) {
    const client = useQueryClient();
    useEffect(() => keryx.entities.BibleSchoolClass.subscribe(() => client.invalidateQueries({ queryKey: CLASSES })), [client]);
    useEffect(() => keryx.entities.BibleMaterial.subscribe(() => client.invalidateQueries({ queryKey: MATERIALS })), [client]);
    const classes = useQuery({ queryKey: CLASSES, queryFn: () => keryx.entities.BibleSchoolClass.list("name") }).data ?? EMPTY;
    const materials = useQuery({ queryKey: MATERIALS, queryFn: () => keryx.entities.BibleMaterial.list("-created_date") }).data ?? EMPTY;
    const [classId, setClassId] = useState(() => { try { return localStorage.getItem("keryx.school.class") || null; } catch { return null; } });
    const [showForm, setShowForm] = useState(false);
    const [student, setStudent] = useState("");
    const [onlyClass, setOnlyClass] = useState(true);
    const [editing, setEditing] = useState(null); // a material draft (id or not)
    const [confirm, setConfirm] = useState(null); // "st:<i>": a student about to leave the class
    const ask = useConfirm();
    const [minutes, setMinutes] = useState(5);
    const today = dayOf();
    const refresh = () => { client.invalidateQueries({ queryKey: CLASSES }); client.invalidateQueries({ queryKey: MATERIALS }); };
    const fail = (err) => c.say(err?.message || "Não foi possível.");

    const cls = classes.find((k) => k.id === classId) || classes[0] || null;
    useEffect(() => { if (cls) try { localStorage.setItem("keryx.school.class", cls.id); } catch { /* not remembered */ } }, [cls?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const shown = useMemo(() => (onlyClass && cls ? materials.filter((m) => !m.class_id || m.class_id === cls.id) : materials), [materials, onlyClass, cls]);
    const lessons = useMemo(() => {
        const by = new Map();
        for (const m of shown) { const k = String(m.subject || "").trim() || "Sem lição"; if (!by.has(k)) by.set(k, []); by.get(k).push(m); }
        return [...by.entries()];
    }, [shown]);

    // -- Turmas and students -------------------------------------------------------
    const saveClass = (patch) => keryx.entities.BibleSchoolClass.update(cls.id, patch).then(refresh).catch(fail);
    const newClass = async () => {
        try {
            const row = await keryx.entities.BibleSchoolClass.create({ name: `Turma ${classes.length + 1}`, age_group: "adults", students: [] });
            setClassId(row.id); setShowForm(true); refresh();
            c.say("Nova turma: dê um nome e a faixa etária.");
        } catch (err) { fail(err); }
    };
    const removeClass = async () => {
        if (!(await ask(deleteQuestion("a turma", cls.name, "Os materiais ficam.")))) return;
        try { await keryx.entities.BibleSchoolClass.delete(cls.id); setClassId(null); refresh(); c.say("Turma excluída."); } catch (err) { fail(err); }
    };
    const addStudent = () => {
        const name = student.trim();
        if (!name || !cls) return;
        setStudent("");
        saveClass({ students: [...(cls.students || []), { name, age: 0, parent_phone: "", attendance: [] }] });
    };
    const togglePresence = (i) => saveClass({ students: cls.students.map((s, k) => (k === i ? toggleAttendance(s, today) : s)) });
    const removeStudent = (i) => {
        if (confirm !== `st:${i}`) { setConfirm(`st:${i}`); c.say(`Clique de novo para tirar ${cls.students[i].name} da turma.`); return; }
        setConfirm(null);
        saveClass({ students: cls.students.filter((_, k) => k !== i) });
    };

    // -- Materials ---------------------------------------------------------------
    const prepare = (m) => c.setPrev(stageFromMaterial(m));
    const send = (m) => { const st = stageFromMaterial(m); if (st.missing) { c.say(`"${m.title}" não tem arquivo: edite o material.`); return; } c.setPrev(st); onSend(st); };
    const saveMaterial = async () => {
        const d = editing;
        if (!d.title.trim()) { c.say("Dê um título ao material."); return; }
        const { id, created_date: _c, updated_date: _u, created_by_id: _b, ...row } = d;
        const klass = classes.find((k) => k.id === row.class_id);
        const data = { ...row, title: row.title.trim(), class_name: klass?.name || "", age_group: klass?.age_group || "all" };
        try {
            const saved = id ? await keryx.entities.BibleMaterial.update(id, data) : await keryx.entities.BibleMaterial.create(data);
            setEditing(null); refresh();
            c.setPrev(stageFromMaterial(saved));
            c.say("Material salvo · está na Prévia.");
        } catch (err) { fail(err); }
    };
    const removeMaterial = async () => {
        if (!(await ask(deleteQuestion("o material", editing.title)))) return;
        try { await keryx.entities.BibleMaterial.delete(editing.id); setEditing(null); refresh(); c.say("Material excluído."); } catch (err) { fail(err); }
    };

    // Esc comes routed from the console (keys.js ESC_ORDER "view", so
    // whatever is open over the view closes first, and a field's Esc
    // already blurred): close the material editor, then the view. Ctrl+S
    // saves the material being edited — the view's own key; it defers only
    // to a dialog over the view (its own scrim does not count). Every other
    // key is the console's (Enter sends, ←/→ walk the slides, B, L, C).
    if (escRef) escRef.current = () => { if (editing) setEditing(null); else onClose(); };
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (!(editing && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")) return;
        if (document.querySelector(".console .scrim:not(.view-scrim)")) return;
        e.preventDefault(); e.stopPropagation();
        saveMaterial();
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    const { cur, prev, now, locked, stamp } = c;
    // Built with a time fixed per prepared stage, never the ticking clock:
    // a new startedAt each second replayed the slide's transition (the
    // Prévia "pulsed"). A timer still counts (the renderer gets `now`).
    const madeAt = useMemo(() => Date.now(), [prev]); // eslint-disable-line react-hooks/exhaustive-deps
    const pdoc = useMemo(() => previewDoc(prev, cur, madeAt, stamp), [prev, cur, madeAt, stamp]);
    const airId = liveStageId(cur);
    const stateOf = (m) => (airId === `material:${m.id}` || (cur?.media?.id === m.id && !cur?.content) ? "is-air" : prev?.id === `material:${m.id}` ? "is-prev" : "");
    const airSlide = cur?.content?.slides?.[cur.content.index];
    const nextSlide = cur?.content?.slides?.[cur.content.index + 1];
    const reveal = cur?.content?.ref?.materialId && /^Pergunta/.test(airSlide?.label || "") && /^Resposta/.test(nextSlide?.label || "");

    return (
        <>
            <div className="col" style={{ flex: "0 1 340px", minWidth: 280 }}>
                <Panel lead={<BackBtn onClick={onClose} />} title={<>Turmas <span className="kx-count">· {classes.length}</span></>} actions={<><IconBtn name="plus" small title="Nova turma" onClick={newClass} /></>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="sv-scroll">
                        {!classes.length && <Empty icon="user" title="Nenhuma turma">Crie uma turma com +. Os materiais funcionam mesmo sem turma.</Empty>}
                        {classes.map((k) => (
                            <Row key={k.id} icon="user" title={k.name} className={cls?.id === k.id ? "is-selected" : ""}
                                meta={[ageLabel(k.age_group), `${(k.students || []).length} alunos`, k.room, presentCount(k, today) ? `${presentCount(k, today)} presentes hoje` : ""].filter(Boolean).join(" · ")}
                                onClick={() => { setClassId(k.id); setConfirm(null); }} />
                        ))}
                        {cls && (
                            <>
                                <div className="listhead"><span className="kx-section">{cls.name}</span><span style={{ flex: 1 }} /><Btn small on={showForm} onClick={() => setShowForm(!showForm)}>{showForm ? "Fechar dados" : "Dados da turma"}</Btn></div>
                                {showForm && (
                                    <div className="frm sv-frm" key={cls.id}>
                                        <span className="k">Nome</span><input className="pl-input" defaultValue={cls.name} aria-label="Nome da turma" onBlur={(e) => e.target.value.trim() && e.target.value !== cls.name && saveClass({ name: e.target.value.trim() })} />
                                        <span className="k">Faixa</span>
                                        <select className="pl-input" value={cls.age_group || "adults"} onChange={(e) => saveClass({ age_group: e.target.value })} aria-label="Faixa etária">{AGE_GROUPS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                                        {[["teacher_name", "Professor"], ["assistant_name", "Auxiliar"], ["room", "Sala"], ["meeting_time", "Horário"], ["curriculum", "Currículo"]].map(([key, label]) => (
                                            <React.Fragment key={key}><span className="k">{label}</span><input className="pl-input" defaultValue={cls[key] || ""} aria-label={label} onBlur={(e) => e.target.value !== (cls[key] || "") && saveClass({ [key]: e.target.value })} /></React.Fragment>
                                        ))}
                                        <span />
                                        <span><Btn small onClick={removeClass}>Excluir turma…</Btn></span>
                                    </div>
                                )}
                                <div className="listhead"><span className="kx-section">Alunos <span className="kx-count">· {(cls.students || []).length} · {presentCount(cls, today)} presentes hoje</span></span></div>
                                {(cls.students || []).map((s, i) => (
                                    <div key={`${s.name}${i}`} className={`kx-row kx-row-1 kx-t sv-student ${isPresent(s, today) ? "is-here" : ""}`} role="button" tabIndex={0} onClick={() => togglePresence(i)} title="Clique marca ou desmarca a presença de hoje">
                                        <span className="kx-glyph"><Icon name={isPresent(s, today) ? "check" : "dot"} /></span>
                                        <div className="kx-row-main"><div className="kx-row-title">{s.name}</div></div>
                                        <span className="kx-meta kx-hide-on-hover">{attendanceNote(s, today)}</span>
                                        <span className="kx-row-acts"><IconBtn name="x" small title={confirm === `st:${i}` ? "Clique de novo para tirar" : "Tirar da turma"} on={confirm === `st:${i}`} onClick={(e) => { e.stopPropagation(); removeStudent(i); }} /></span>
                                    </div>
                                ))}
                                <div className="pl-pad"><Field icon="plus" value={student} onChange={setStudent} placeholder="Nome do aluno · Enter adiciona" onKeyDown={(e) => { if (e.key === "Enter") addStudent(); }} /></div>
                            </>
                        )}
                    </div>
                </Panel>
            </div>
            <div className="kx-gap" />
            <div className="col center sv-center">
                {editing ? (
                    <MaterialEditor c={c} draft={editing} setDraft={setEditing} classes={classes} media={media} onSave={saveMaterial} onCancel={() => setEditing(null)} onRemove={removeMaterial} onPreview={() => c.setPrev(stageFromMaterial({ ...editing, id: editing.id || "rascunho" }))} />
                ) : (
                    <Panel title={<>Materiais da lição <span className="kx-count">· {onlyClass && cls ? cls.name : "todas as turmas"}</span></>} actions={<>
                        {cls && <Seg small value={onlyClass ? "turma" : "todos"} onChange={(v) => setOnlyClass(v === "turma")} options={[["turma", "Desta turma"], ["todos", "Todos"]]} />}
                        <IconBtn name="plus" small title="Novo material" onClick={() => setEditing(blankMaterial(onlyClass ? cls : null))} />
                    </>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                        <div className="sv-scroll">
                            {!shown.length && <Empty icon="book" title="Nenhum material">Use + para criar slides, um quiz, um texto, um vídeo ou uma imagem para a lição.</Empty>}
                            {lessons.map(([lesson, list]) => (
                                <React.Fragment key={lesson}>
                                    <div className="listhead"><span className="kx-section">{lesson}</span><span className="kx-count">&nbsp;· {list.length}</span></div>
                                    {list.map((m) => (
                                        <Row key={m.id} icon={materialIcon(m.type)} title={m.title} meta={[materialMeta(m), !onlyClass && m.class_name, m.description ? "tem notas" : ""].filter(Boolean).join(" · ")} state={stateOf(m)}
                                            onClick={() => prepare(m)} onDoubleClick={() => send(m)}
                                            actions={<>
                                                <Btn onClick={(e) => { e.stopPropagation(); setEditing({ ...blankMaterial(null), ...m, slides: m.slides || [], quiz_questions: quizQuestions(m) }); }}>Editar</Btn>
                                                {onAddToSetlist && <Btn onClick={(e) => { e.stopPropagation(); onAddToSetlist(m); }} title="Adicionar ao fim da setlist">Setlist</Btn>}
                                                <Btn onClick={(e) => { e.stopPropagation(); send(m); }} title="Enviar ao ar · duplo clique">Projetar</Btn>
                                            </>} />
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>
                        <div className="listhead sv-hint"><span className="kx-meta">Um clique prepara na Prévia · duplo clique ou Enter envia ao ar · no quiz, → revela a resposta.</span></div>
                    </Panel>
                )}
            </div>
            <div className="kx-gap" />
            <div className="col" style={{ flex: "0 1 400px", minWidth: 300 }}>
                <Panel title={<>Projetar <span className="kx-count">· o mesmo Programa e Prévia do console</span></>} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
                    <div className="sv-mons">
                        <Monitor state={locked ? "rh" : "air"} caption={captionOf(cur, locked ? "No ar · travado" : "No ar")} live={cur} now={now} logoUrl={logoUrl} motion />
                        <Monitor state={prev ? "prev" : ""} caption={prev ? `Prévia · ${prev.title}${prev.slides?.length > 1 ? ` · ${prev.index + 1}/${prev.slides.length}` : ""}` : "Prévia"} live={pdoc} now={now} logoUrl={logoUrl}>
                            {!prev && <div className="kx-screen-empty">Nada na prévia</div>}
                        </Monitor>
                    </div>
                    <div className="sv-send">
                        <Btn kind="prev" className="kx-btn-send" disabled={!prev || locked} onClick={() => onSend()} title={sendTip(locked)}>{SEND_LABEL}</Btn>
                        <IconBtn name="chevron-left" title="Slide anterior · ←" onClick={() => c.moveSlide(-1)} />
                        <IconBtn name="chevron-right" title="Próximo slide · →" onClick={() => c.moveSlide(1)} />
                        <span className="kx-meta">{reveal ? "A resposta é o próximo slide: → revela." : "Enter envia · ←→ no ar"}</span>
                    </div>
                    <div className="sv-notes"><TeacherNotes prev={prev} cur={cur} /></div>
                    <div className="kx-row kx-t sv-timer">
                        <span className="kx-glyph"><Icon name="clock" /></span>
                        <div className="kx-row-main"><div className="kx-row-title">Timer de discussão</div><div className="kx-row-meta">vai à Prévia como qualquer item</div></div>
                        <select className="pl-pick" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Minutos">{[2, 3, 5, 10, 15].map((n) => <option key={n} value={n}>{n} min</option>)}</select>
                        <Btn small onClick={() => c.setPrev(stageFromTool("timer", { minutes }))}>Pôr na prévia</Btn>
                    </div>
                </Panel>
            </div>
        </>
    );
}

// The material editor, in place of the list: the kind, title, lesson and
// class, the content of that kind, the teacher's notes and the colours.
function MaterialEditor({ c, draft, setDraft, classes, media, onSave, onCancel, onRemove, onPreview }) {
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    const [slidesText, setSlidesText] = useState(() => textFromSlides(draft.slides));
    const qs = draft.quiz_questions || [];
    const setQ = (i, patch) => set({ quiz_questions: qs.map((q, k) => (k === i ? { ...q, ...patch } : q)) });
    const files = media.filter((m) => !m.missing && (draft.type === "video" ? m.type === "video" : m.type === "image" || m.type === "gif"));
    const upload = async (file) => {
        if (!file) return;
        try { const { file_url } = await keryx.integrations.Core.UploadFile({ file }); set(draft.type === "video" ? { video_url: file_url } : { image_url: file_url }); } catch (err) { c.say(err?.message || "Não foi possível copiar o arquivo."); }
    };
    const fileRef = useRef(null);
    return (
        <Panel title={<>{draft.id ? "Editar material" : "Novo material"} <span className="kx-count">· Ctrl+S salva · Esc volta</span></>} actions={<Btn small onClick={onCancel}><Icon name="arrow-left" />Materiais</Btn>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
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
                                <textarea className="ed-text sv-slides" value={slidesText} onChange={(e) => { setSlidesText(e.target.value); set({ slides: slidesFromText(e.target.value).map((s, i) => ({ ...s, image_url: draft.slides?.[i]?.image_url || "" })) }); }} placeholder={"Cada bloco é um slide.\n\nDeixe uma linha em branco entre eles."} aria-label="Slides" />
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
            <div className="nv-foot">
                {draft.id && <Btn onClick={onRemove}>Excluir…</Btn>}
                <span style={{ flex: 1 }} />
                <Btn onClick={onPreview} title="Ver como fica, na Prévia">Pôr na prévia</Btn>
                <Btn onClick={onCancel}>Cancelar</Btn>
                <Btn kind="brand" onClick={onSave} title="Ctrl+S">Salvar material</Btn>
            </div>
        </Panel>
    );
}
