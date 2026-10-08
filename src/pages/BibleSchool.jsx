import React, { useState } from "react";
import { Navigate } from "react-router-dom";
import { keryx } from "@/api/keryxClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen, Plus, Trash2, Pencil, Users, FolderOpen, Square, ChevronLeft, ChevronRight, Eye, EyeOff, Wifi } from "lucide-react";
import PagePanel from "@/components/layout/PagePanel";
import { motion, AnimatePresence } from "framer-motion";
import { createPageUrl } from "@/utils";
import MaterialForm from "@/components/bible-school/MaterialForm";
import MaterialList from "@/components/bible-school/MaterialList";
import { useThemeColors } from "@/hooks/useThemeColors";

const AGE_GROUPS = { children: "Crianças (4-10)", teens: "Adolescentes (11-14)", youth: "Jovens (15-25)", adults: "Adultos", seniors: "Séniores" };
const AGE_COLORS = { children: "#f59e0b", teens: "#8b5cf6", youth: "#3b82f6", adults: "#10b981", seniors: "#ec4899" };

function getChannel() {
    let ch = localStorage.getItem("bible_operator_channel");
    if (!ch) { ch = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)); localStorage.setItem("bible_operator_channel", ch); }
    return ch;
}

export default function BibleSchool() {
    // Desktop: the Escola bíblica lives in the console (turmas, alunos, materiais, Projetar). The web build keeps this page for now.
    if (keryx.isDesktop) return <Navigate to="/Console?school=1" replace />;
    return <LegacyBibleSchool />;
}

function LegacyBibleSchool() {
    const colors = useThemeColors();
    const [tab, setTab] = useState("classes");
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [formData, setFormData] = useState({ name: "", age_group: "children", teacher_name: "", assistant_name: "", room: "", meeting_time: "", curriculum: "", notes: "" });
    const [studentInput, setStudentInput] = useState("");
    const [students, setStudents] = useState([]);
    const queryClient = useQueryClient();

    // Material
    const [showMaterialForm, setShowMaterialForm] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [projWindow, setProjWindow] = useState(null);
    const [activeMaterial, setActiveMaterial] = useState(null);
    const [projSlideIndex, setProjSlideIndex] = useState(0);
    const [quizReveal, setQuizReveal] = useState(false);
    const [projQuizIndex, setProjQuizIndex] = useState(0);

    const materialQuizQuestions = (m) => m?.quiz_questions?.length ? m.quiz_questions : (m?.quiz_question ? [{ question: m.quiz_question, options: m.quiz_options, correct: m.quiz_correct }] : []);
    const channel = getChannel();

    const { data: classes } = useQuery({ queryKey: ["bibleClasses"], queryFn: () => keryx.entities.BibleSchoolClass.list("-created_date"), initialData: [] });
    const { data: materials } = useQuery({ queryKey: ["bibleMaterials"], queryFn: () => keryx.entities.BibleMaterial.list("-created_date"), initialData: [] });

    const resetForm = () => { setFormData({ name: "", age_group: "children", teacher_name: "", assistant_name: "", room: "", meeting_time: "", curriculum: "", notes: "" }); setStudents([]); setEditingId(null); setShowForm(false); };
    const createM = useMutation({
        mutationFn: (d) => keryx.entities.BibleSchoolClass.create({ ...d, students }),
        onMutate: async (d) => {
            await queryClient.cancelQueries({ queryKey: ["bibleClasses"] });
            const previous = queryClient.getQueryData(["bibleClasses"]);
            queryClient.setQueryData(["bibleClasses"], (old) => [...old, { ...d, students, id: `temp-${Date.now()}` }]);
            setShowForm(false);
            return { previous };
        },
        onError: (_err, _vars, ctx) => { ctx?.previous && queryClient.setQueryData(["bibleClasses"], ctx.previous); setShowForm(true); },
        onSuccess: () => resetForm(),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["bibleClasses"] }),
    });
    const updateM = useMutation({
        mutationFn: ({ id, data }) => keryx.entities.BibleSchoolClass.update(id, { ...data, students }),
        onMutate: async ({ id, data }) => {
            await queryClient.cancelQueries({ queryKey: ["bibleClasses"] });
            const previous = queryClient.getQueryData(["bibleClasses"]);
            queryClient.setQueryData(["bibleClasses"], (old) => old.map((c) => (c.id === id ? { ...c, ...data, students } : c)));
            setShowForm(false);
            return { previous };
        },
        onError: (_err, _vars, ctx) => { ctx?.previous && queryClient.setQueryData(["bibleClasses"], ctx.previous); setShowForm(true); },
        onSuccess: () => resetForm(),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["bibleClasses"] }),
    });
    const deleteM = useMutation({
        mutationFn: (id) => keryx.entities.BibleSchoolClass.delete(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ["bibleClasses"] });
            const previous = queryClient.getQueryData(["bibleClasses"]);
            queryClient.setQueryData(["bibleClasses"], (old) => old.filter((c) => c.id !== id));
            return { previous };
        },
        onError: (_err, _vars, ctx) => ctx?.previous && queryClient.setQueryData(["bibleClasses"], ctx.previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["bibleClasses"] }),
    });

    const createMaterialM = useMutation({ mutationFn: (d) => keryx.entities.BibleMaterial.create(d), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bibleMaterials"] }); setShowMaterialForm(false); setEditingMaterial(null); } });
    const updateMaterialM = useMutation({ mutationFn: ({ id, data }) => keryx.entities.BibleMaterial.update(id, data), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["bibleMaterials"] }); setShowMaterialForm(false); setEditingMaterial(null); } });
    const deleteMaterialM = useMutation({ mutationFn: (id) => keryx.entities.BibleMaterial.delete(id), onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bibleMaterials"] }) });

    const addStudent = () => { if (studentInput.trim()) { setStudents([...students, { name: studentInput.trim(), age: 0, parent_phone: "", attendance: [] }]); setStudentInput(""); } };

    const editClass = (c) => {
        setEditingId(c.id);
        setFormData({ name: c.name || "", age_group: c.age_group || "children", teacher_name: c.teacher_name || "", assistant_name: c.assistant_name || "", room: c.room || "", meeting_time: c.meeting_time || "", curriculum: c.curriculum || "", notes: c.notes || "" });
        setStudents(c.students || []); setStudentInput(""); setShowForm(true);
    };

    const submitForm = () => { if (editingId) updateM.mutate({ id: editingId, data: formData }); else createM.mutate(formData); };

    const submitMaterial = (data) => {
        if (editingMaterial) updateMaterialM.mutate({ id: editingMaterial.id, data });
        else createMaterialM.mutate(data);
    };

    // ---- Projeção isolada por canal ----
    const sendSync = (payload) => keryx.entities.BibleProjectionSync.create({ channel, timestamp: Date.now(), ...payload }).catch(e => console.error(e));

    const projectMaterial = (m) => {
        const slides = (m.type === "slides" || m.type === "text") ? (m.slides || []) : null;
        const payload = { action: "project", title: m.title, content_type: m.type === "text" ? "slides" : m.type, timestamp: Date.now() };
        if (slides) payload.slides = slides;
        if (m.type === "quiz") {
            const qs = materialQuizQuestions(m);
            payload.quiz_questions = qs; payload.quiz_index = 0;
            payload.quiz_question = qs[0]?.question || ""; payload.quiz_options = qs[0]?.options || []; payload.quiz_correct = qs[0]?.correct ?? 0;
            payload.quiz_reveal = false; payload.content_type = "quiz";
        }
        if (m.type === "video") payload.media_url = m.video_url;
        if (m.type === "image") payload.media_url = m.image_url;
        if (m.text_color) payload.text_color = m.text_color;
        if (m.background_image) payload.background_image = m.background_image;
        if (m.background_color) payload.background_color = m.background_color;

        const url = `${createPageUrl("BibleMaterialProjection")}?channel=${channel}`;
        if (!projWindow || projWindow.closed) {
            const w = window.open(url, "bibleProjection", "width=1280,height=720,menubar=no,toolbar=no,location=no");
            setProjWindow(w);
            // esperar a janela carregar e enviar primeiro registro
            setTimeout(() => sendSync(payload), 1500);
        } else {
            projWindow.focus();
            sendSync(payload);
        }
        setActiveMaterial(m);
        setProjSlideIndex(0);
        setQuizReveal(false);
        setProjQuizIndex(0);
    };

    const changeQuizQuestion = (dir) => {
        if (!activeMaterial) return;
        const qs = materialQuizQuestions(activeMaterial);
        if (qs.length === 0) return;
        const next = Math.max(0, Math.min(projQuizIndex + dir, qs.length - 1));
        setProjQuizIndex(next);
        setQuizReveal(false);
        sendSync({ action: "project", content_type: "quiz", title: activeMaterial.title, quiz_questions: qs, quiz_index: next, quiz_question: qs[next]?.question, quiz_options: qs[next]?.options, quiz_correct: qs[next]?.correct, quiz_reveal: false });
    };

    const stopMaterialProjection = () => {
        sendSync({ action: "stop", content_type: "blank" });
        setActiveMaterial(null);
        setQuizReveal(false);
    };

    const changeSlide = (dir) => {
        if (!activeMaterial) return;
        const slides = activeMaterial.slides || [];
        const next = Math.max(0, Math.min(projSlideIndex + dir, slides.length - 1));
        setProjSlideIndex(next);
        sendSync({ action: "slide", slide_index: next });
    };

    const toggleQuizReveal = () => {
        const v = !quizReveal;
        setQuizReveal(v);
        const qs = materialQuizQuestions(activeMaterial);
        const qi = Math.min(projQuizIndex, qs.length - 1);
        sendSync({ action: "project", content_type: "quiz", title: activeMaterial.title, quiz_questions: qs, quiz_index: qi, quiz_question: qs[qi]?.question, quiz_options: qs[qi]?.options, quiz_correct: qs[qi]?.correct, quiz_reveal: v });
    };

    return (
        <PagePanel
            title="Escola Bíblica"
            toplineExtra={
                <span className="flex items-center gap-2 text-[11px]" style={{ color: "#a9ad9a" }}>
                    {classes.length} turmas • {materials.length} materiais
                    <span className="text-[10px] px-2 py-0.5 rounded bg-white/10 flex items-center gap-1"><Wifi className="w-3 h-3" /> Canal: {channel.slice(0, 6)}</span>
                </span>
            }
            actions={
                <button
                    type="button"
                    className="mc-control mc-primary"
                    onClick={() => tab === "classes" ? (resetForm(), setShowForm(!showForm)) : (setEditingMaterial(null), setShowMaterialForm(!showMaterialForm))}
                >
                    <Plus />
                    {tab === "classes" ? "Nova Turma" : "Novo Material"}
                </button>
            }
        >

                {/* Painel de projeção ativa */}
                {activeMaterial && (
                    <Card className="bg-white/5 border-border">
                        <CardContent className="p-4 flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                                <span className="text-white font-medium">Projetando: {activeMaterial.title}</span>
                            </div>
                            <div className="flex items-center gap-2 flex-wrap">
                                {(activeMaterial.type === "slides" || activeMaterial.type === "text") && (
                                    <>
                                        <span className="text-white/50 text-sm">{projSlideIndex + 1}/{activeMaterial.slides?.length || 1}</span>
                                        <Button size="icon" variant="outline" onClick={() => changeSlide(-1)} className="border-white/20 text-white"><ChevronLeft className="w-4 h-4" /></Button>
                                        <Button size="icon" variant="outline" onClick={() => changeSlide(1)} className="border-white/20 text-white"><ChevronRight className="w-4 h-4" /></Button>
                                    </>
                                )}
                                {activeMaterial.type === "quiz" && (
                                    <>
                                        <span className="text-white/50 text-sm">{projQuizIndex + 1}/{materialQuizQuestions(activeMaterial).length || 1}</span>
                                        <Button size="icon" variant="outline" onClick={() => changeQuizQuestion(-1)} disabled={projQuizIndex === 0} className="border-white/20 text-white"><ChevronLeft className="w-4 h-4" /></Button>
                                        <Button size="icon" variant="outline" onClick={() => changeQuizQuestion(1)} disabled={projQuizIndex >= materialQuizQuestions(activeMaterial).length - 1} className="border-white/20 text-white"><ChevronRight className="w-4 h-4" /></Button>
                                        <Button size="sm" variant="outline" onClick={toggleQuizReveal} className="border-white/20 text-white">
                                            {quizReveal ? <><EyeOff className="w-4 h-4 mr-1" /> Esconder</> : <><Eye className="w-4 h-4 mr-1" /> Revelar</>}
                                        </Button>
                                    </>
                                )}
                                <Button size="sm" variant="destructive" onClick={stopMaterialProjection}><Square className="w-4 h-4 mr-1" /> Parar</Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Tabs */}
                <div className="mc-filters">
                    <button type="button" className={`mc-chip ${tab === "classes" ? "mc-active" : ""}`} onClick={() => setTab("classes")}>
                        <Users /> Turmas
                    </button>
                    <button type="button" className={`mc-chip ${tab === "material" ? "mc-active" : ""}`} onClick={() => setTab("material")}>
                        <FolderOpen /> Material Didático
                    </button>
                </div>
                <div className="mc-divider"></div>

                {tab === "material" && (
                    <>
                        <AnimatePresence>
                            {showMaterialForm && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                                    <MaterialForm classes={classes} editing={editingMaterial} onSave={submitMaterial} onCancel={() => { setShowMaterialForm(false); setEditingMaterial(null); }} />
                                </motion.div>
                            )}
                        </AnimatePresence>
                        <MaterialList materials={materials} classes={classes} onProject={projectMaterial} onEdit={(m) => { setEditingMaterial(m); setShowMaterialForm(true); }} onDelete={(id) => { if (confirm("Excluir este material?")) deleteMaterialM.mutate(id); }} />
                    </>
                )}

                {tab === "classes" && (
                    <>
                        <AnimatePresence>
                            {showForm && (
                                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
                                    <Card className="bg-white/5 border-white/10 mb-6">
                                        <CardHeader><CardTitle className="text-white">{editingId ? "Editar Turma" : "Nova Turma"}</CardTitle></CardHeader>
                                        <CardContent className="space-y-3">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                <Input placeholder="Nome da turma *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="bg-white/10 border-white/20 text-white" />
                                                <Select value={formData.age_group} onValueChange={(v) => setFormData({ ...formData, age_group: v })}>
                                                    <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger>
                                                    <SelectContent>{Object.entries(AGE_GROUPS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                                                </Select>
                                                <Input placeholder="Professor(a)" value={formData.teacher_name} onChange={(e) => setFormData({ ...formData, teacher_name: e.target.value })} className="bg-white/10 border-white/20 text-white" />
                                                <Input placeholder="Auxiliar" value={formData.assistant_name} onChange={(e) => setFormData({ ...formData, assistant_name: e.target.value })} className="bg-white/10 border-white/20 text-white" />
                                                <Input placeholder="Sala" value={formData.room} onChange={(e) => setFormData({ ...formData, room: e.target.value })} className="bg-white/10 border-white/20 text-white" />
                                                <Input placeholder="Horário (ex: Dom 10h)" value={formData.meeting_time} onChange={(e) => setFormData({ ...formData, meeting_time: e.target.value })} className="bg-white/10 border-white/20 text-white" />
                                            </div>
                                            <Input placeholder="Currículo/Tópico atual" value={formData.curriculum} onChange={(e) => setFormData({ ...formData, curriculum: e.target.value })} className="bg-white/10 border-white/20 text-white" />
                                            <div className="flex gap-2">
                                                <Input placeholder="Adicionar aluno..." value={studentInput} onChange={(e) => setStudentInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStudent())} className="bg-white/10 border-white/20 text-white" />
                                                <Button onClick={addStudent} variant="outline" className="border-white/20 text-white"><Plus className="w-4 h-4" /></Button>
                                            </div>
                                            {students.length > 0 && (<div className="flex flex-wrap gap-1.5">{students.map((s, i) => <span key={i} className="text-xs px-2 py-1 rounded bg-white/10 text-white/70">{s.name}</span>)}</div>)}
                                            <div className="flex gap-2">
                                                <Button onClick={submitForm} disabled={!formData.name.trim()} className="text-white flex-1" style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}>
                                                    {editingId ? "Salvar alterações" : "Criar turma"}
                                                </Button>
                                                <Button variant="outline" onClick={resetForm} className="border-white/20 text-white">Cancelar</Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="grid gap-4 md:grid-cols-2">
                            {classes.map(c => (
                                <Card key={c.id} className="bg-white/5 border-white/10">
                                    <CardContent className="p-5">
                                        <div className="flex justify-between items-start mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-1 h-12 rounded-full" style={{ backgroundColor: AGE_COLORS[c.age_group] }} />
                                                <div>
                                                    <h3 className="text-lg font-semibold text-white">{c.name}</h3>
                                                    <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${AGE_COLORS[c.age_group]}30`, color: AGE_COLORS[c.age_group] }}>{AGE_GROUPS[c.age_group]}</span>
                                                </div>
                                            </div>
                                            <div className="flex gap-1">
                                                <Button size="icon" variant="ghost" onClick={() => editClass(c)} className="text-muted-foreground"><Pencil className="w-4 h-4" /></Button>
                                                <Button size="icon" variant="ghost" onClick={() => deleteM.mutate(c.id)} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
                                            </div>
                                        </div>
                                        <div className="space-y-1 text-sm text-white/60">
                                            {c.teacher_name && <p>👨‍🏫 Professor: {c.teacher_name}</p>}
                                            {c.assistant_name && <p>🤝 Auxiliar: {c.assistant_name}</p>}
                                            {c.meeting_time && <p>🕐 {c.meeting_time}</p>}
                                            {c.room && <p>📍 Sala: {c.room}</p>}
                                            {c.curriculum && <p>📖 {c.curriculum}</p>}
                                        </div>
                                        {c.students?.length > 0 && (
                                            <div className="mt-3 pt-3 border-t border-white/10">
                                                <p className="text-xs text-white/50 mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> {c.students.length} alunos:</p>
                                                <div className="flex flex-wrap gap-1.5">{c.students.map((s, i) => <span key={i} className="text-xs px-2 py-1 rounded bg-white/10 text-white/70">{s.name}</span>)}</div>
                                            </div>
                                        )}
                                    </CardContent>
                                </Card>
                            ))}
                        </div>
                        {classes.length === 0 && (<div className="text-center py-12"><BookOpen className="w-16 h-16 mx-auto text-white/20 mb-4" /><p className="text-white/50">Nenhuma turma criada ainda</p></div>)}
                    </>
                )}
        </PagePanel>
    );
}