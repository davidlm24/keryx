import React, { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty, Monitor, WinBar } from "./kx";
import { previewDoc, captionOf, TeacherNotes } from "./CenterPanel";
import { stageFromMaterial, stageFromTool, liveStageId, stageAt } from "@/lib/console/stage";
import { SEND_LABEL, sendTip } from "@/lib/console/copy";
import { AGE_GROUPS, ageLabel, materialIcon, materialMeta, dayOf, isPresent, toggleAttendance, attendanceNote, presentCount, revealAction, revealNote } from "@/lib/console/school";
import { currentSlide, activitySteps, revealStep } from "@shared/live-state.mjs";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { LOCKED_SAY } from "./useConsole";
import { useWinCol } from "./winLayout";

const EMPTY = [];
const CLASSES = ["console", "bibleClasses"];
const MATERIALS = ["console", "bibleMaterials"];

// Escola bíblica (canvas artboard "Escola bíblica"), a view inside the
// console: turmas and their students (attendance for today), the lesson
// materials, and on the right the console's own Programa and Prévia — a
// click prepares a material, Enter or a double click sends it. An activity
// (a quiz, Verdadeiro ou falso, Complete a frase, Memorizar, Discussão;
// Rodada E4) is revealed on its own slide: the Revelar button or → (← hides
// it again), and the material's list of questions jumps to one. Materials
// are edited here; they also go into the Setlist (planner, "Setlist" here)
// and the palette.
export default function SchoolView({ c, logoUrl, media, onSend, onAddToSetlist, onClose, escRef, onEditMaterial = null }) {
    // The columns a splitter resizes, kept per page on this computer (Rodada D3).
    const colTurmas = useWinCol("school.turmas", { def: 340, min: 280, max: 600 });
    const colMaterial = useWinCol("school.material", { def: 400, min: 300, max: 700, sign: -1 });
    const client = useQueryClient();
    useEffect(() => keryx.entities.BibleSchoolClass.subscribe(() => client.invalidateQueries({ queryKey: CLASSES })), [client]);
    useEffect(() => keryx.entities.BibleMaterial.subscribe(() => client.invalidateQueries({ queryKey: MATERIALS })), [client]);
    const classes = useQuery({ queryKey: CLASSES, queryFn: () => keryx.entities.BibleSchoolClass.list("name") }).data ?? EMPTY;
    const materials = useQuery({ queryKey: MATERIALS, queryFn: () => keryx.entities.BibleMaterial.list("-created_date") }).data ?? EMPTY;
    const [classId, setClassId] = useState(() => { try { return localStorage.getItem("keryx.school.class") || null; } catch { return null; } });
    const [showForm, setShowForm] = useState(false);
    const [student, setStudent] = useState("");
    const [onlyClass, setOnlyClass] = useState(true);
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
    // "Tirar", never "Excluir" (copy rules): the student leaves this class.
    const removeStudent = async (i) => {
        const name = cls.students[i].name;
        if (!(await ask({ title: "Tirar da turma?", text: `"${name}" sai da turma ${cls.name}, com as presenças registradas.`, ok: "Tirar", danger: true }))) return;
        saveClass({ students: cls.students.filter((_, k) => k !== i) });
    };

    // -- Materials ---------------------------------------------------------------
    // Editing is the Material page of THE window (MaterialView.jsx, Rodada
    // C fase c): "Novo material" and Editar push it, "← Escola bíblica"
    // comes back here, and its unsaved guard asks there.
    const prepare = (m) => c.setPrev(stageFromMaterial(m));
    const send = (m) => { const st = stageFromMaterial(m); if (st.missing) { c.say(`"${m.title}" não tem arquivo: edite o material.`); return; } c.setPrev(st); onSend(st); };

    // Esc comes routed from the console (keys.js ESC_ORDER "window"):
    // nothing to guard here, it just leaves. Every other key is the
    // console's (Enter sends, ←/→ walk the slides, B, L, C).
    if (escRef) escRef.current = (mode) => onClose(mode === "all");

    const { cur, prev, now, locked, stamp } = c;
    // Built with a time fixed per prepared stage, never the ticking clock:
    // a new startedAt each second replayed the slide's transition (the
    // Prévia "pulsed"). A timer still counts (the renderer gets `now`).
    const madeAt = useMemo(() => Date.now(), [prev]); // eslint-disable-line react-hooks/exhaustive-deps
    const pdoc = useMemo(() => previewDoc(prev, cur, madeAt, stamp), [prev, cur, madeAt, stamp]);
    const airId = liveStageId(cur);
    const stateOf = (m) => (airId === `material:${m.id}` || (cur?.media?.id === m.id && !cur?.content) ? "is-air" : prev?.id === `material:${m.id}` ? "is-prev" : "");
    // Revelar: the activity of the slide on air, a step at a time.
    const airSlide = cur?.content ? currentSlide(cur.content) : null;
    const reveal = revealAction(airSlide?.activity, revealStep(cur?.content), activitySteps(airSlide));
    const doReveal = () => {
        if (locked) { c.say(LOCKED_SAY); return; }
        c.callOp("content.reveal", { step: reveal.to }).catch(() => {});
    };
    // The material's questions (or slides): the one on air, else the one in
    // the Prévia (a material of one slide has no list). A click goes to that
    // question on air, or picks where the Prévia starts (a double click
    // sends it from there).
    const airMaterial = cur?.content?.ref?.materialId ? cur.content : null;
    const list = airMaterial?.slides.length > 1
        ? { air: true, title: airMaterial.title, slides: airMaterial.slides, index: airMaterial.index, type: materials.find((m) => m.id === airMaterial.ref.materialId)?.type }
        : prev?.lesson && prev.slides?.length > 1 ? { air: false, title: prev.title, slides: prev.slides, index: prev.index, type: materials.find((m) => `material:${m.id}` === prev.id)?.type } : null;
    const listName = { quiz: "Perguntas", truefalse: "Afirmações", blanks: "Frases", memorize: "Versículos", discussion: "Perguntas" }[list?.type] || "Slides";
    const pickSlide = (i) => (list.air ? c.goTo(i) : c.setPrev(stageAt(prev, i)));
    const sendSlide = (i) => { if (list.air) { c.goTo(i); return; } const st = stageAt(prev, i); c.setPrev(st); onSend(st); };

    return (
        <>
            <WinBar title="Escola bíblica" />
            <div className="win-body">
            <div className="col" style={colTurmas.style}>
                <Panel title={<>Turmas <span className="kx-count">· {classes.length}</span></>} actions={<><IconBtn name="plus" small title="Nova turma" onClick={newClass} /></>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="sv-scroll">
                        {!classes.length && <Empty icon="user" title="Nenhuma turma">Crie uma turma com +. Os materiais funcionam mesmo sem turma.</Empty>}
                        {classes.map((k) => (
                            <Row key={k.id} icon="user" title={k.name} className={cls?.id === k.id ? "is-selected" : ""}
                                meta={[ageLabel(k.age_group), `${(k.students || []).length} alunos`, k.room, presentCount(k, today) ? `${presentCount(k, today)} presentes hoje` : ""].filter(Boolean).join(" · ")}
                                onClick={() => setClassId(k.id)} />
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
                                        <span className="kx-row-acts"><IconBtn name="x" small title="Tirar da turma…" onClick={(e) => { e.stopPropagation(); removeStudent(i); }} /></span>
                                    </div>
                                ))}
                                <div className="pl-pad"><Field icon="plus" value={student} onChange={setStudent} placeholder="Nome do aluno · Enter adiciona" onKeyDown={(e) => { if (e.key === "Enter") addStudent(); }} /></div>
                            </>
                        )}
                    </div>
                </Panel>
            </div>
            {colTurmas.split}
            <div className="col center sv-center">
                <Panel title={<>Materiais da lição <span className="kx-count">· {onlyClass && cls ? cls.name : "todas as turmas"}</span></>} actions={<>
                        {cls && <Seg small value={onlyClass ? "turma" : "todos"} onChange={(v) => setOnlyClass(v === "turma")} options={[["turma", "Desta turma"], ["todos", "Todos"]]} />}
                        <IconBtn name="plus" small title="Novo material" onClick={() => onEditMaterial?.(null, onlyClass ? cls?.id : "")} />
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
                                                <Btn onClick={(e) => { e.stopPropagation(); onEditMaterial?.(m.id); }}>Editar</Btn>
                                                {onAddToSetlist && <Btn onClick={(e) => { e.stopPropagation(); onAddToSetlist(m); }} title="Adicionar ao fim da setlist">Setlist</Btn>}
                                                <Btn onClick={(e) => { e.stopPropagation(); send(m); }} title="Enviar ao ar · duplo clique">Projetar</Btn>
                                            </>} />
                                    ))}
                                </React.Fragment>
                            ))}
                        </div>
                        <div className="listhead sv-hint"><span className="kx-meta">Um clique prepara na Prévia · duplo clique ou Enter envia ao ar · nas atividades, Revelar ou → mostra a resposta.</span></div>
                    </Panel>
            </div>{/* the Material page (MaterialView.jsx) opens over this, "← Escola bíblica" */}
            {colMaterial.split}
            <div className="col" style={colMaterial.style}>
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
                        <span className="kx-meta">{reveal ? "→ revela · ← volta um passo" : "Enter envia · ←→ no ar"}</span>
                    </div>
                    {reveal && (
                        <div className="sv-reveal">
                            <Btn kind={reveal.done ? "" : "brand"} className="sv-reveal-btn" disabled={locked} onClick={doReveal} title={locked ? LOCKED_SAY : reveal.done ? "Volta ao começo, no mesmo slide" : "No mesmo slide · →"}><Icon name={reveal.done ? "undo" : "eye"} />{reveal.label}</Btn>
                        </div>
                    )}
                    {list && (
                        <div className="sv-qlist">
                            <div className="listhead"><span className="kx-section">{listName} <span className="kx-count">· {list.title} · {list.air ? "no ar" : "na prévia"}</span></span></div>
                            {list.slides.map((sl, i) => {
                                const note = list.air ? revealNote(sl.activity, revealStep(airMaterial, i), activitySteps(sl)) : "";
                                const here = i === list.index;
                                return (
                                    <div key={i} className={`kx-row kx-row-1 kx-t sv-qrow ${here ? (list.air ? "is-air" : "is-prev") : ""}`} role="button" tabIndex={0} title={list.air ? "Clique vai a este no ar" : "Clique escolhe por onde a Prévia começa · duplo clique envia"}
                                        onClick={() => pickSlide(i)} onDoubleClick={() => sendSlide(i)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) { e.preventDefault(); e.stopPropagation(); pickSlide(i); } }}>
                                        <span className="sv-qn">{i + 1}</span>
                                        <div className="kx-row-main"><div className="kx-row-title">{sl.text || sl.label || "Imagem"}</div></div>
                                        {(note || (here && list.air)) && <span className="kx-meta">{[here && list.air ? "no ar" : "", note].filter(Boolean).join(" · ")}</span>}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="sv-notes"><TeacherNotes prev={prev} cur={cur} /></div>
                    <div className="kx-row kx-t sv-timer">
                        <span className="kx-glyph"><Icon name="clock" /></span>
                        <div className="kx-row-main"><div className="kx-row-title">Timer de discussão</div><div className="kx-row-meta">vai à Prévia como qualquer item</div></div>
                        <select className="pl-pick" value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} aria-label="Minutos">{[2, 3, 5, 10, 15].map((n) => <option key={n} value={n}>{n} min</option>)}</select>
                        <Btn small onClick={() => c.setPrev(stageFromTool("timer", { minutes }))}>Pôr na prévia</Btn>
                    </div>
                </Panel>
            </div>
            </div>
        </>
    );
}
