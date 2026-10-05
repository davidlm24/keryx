import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, X, Check, Plus, Trash2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const AGE_GROUPS = {
    children: "Crianças (4-10)", teens: "Adolescentes (11-14)", youth: "Jovens (15-25)",
    adults: "Adultos", seniors: "Séniores", all: "Todas as idades"
};

const normalizeQuiz = (src) => {
    if (src?.quiz_questions?.length) return src.quiz_questions;
    if (src?.quiz_question) return [{ question: src.quiz_question, options: src.quiz_options?.length ? src.quiz_options : ["", ""], correct: src.quiz_correct ?? 0 }];
    return [];
};

export default function MaterialForm({ classes, onSave, onCancel, editing }) {
    const [form, setForm] = useState(() => {
        const base = editing || {
            title: "", type: "slides", class_id: "", class_name: "", age_group: "all",
            subject: "", slides: [], quiz_question: "", quiz_options: ["", ""], quiz_correct: 0,
            video_url: "", image_url: "", description: "", text_color: "#ffffff", background_image: "", background_color: "#0f172a"
        };
        return { ...base, quiz_questions: normalizeQuiz(editing) };
    });
    const [slideInput, setSlideInput] = useState("");
    const [uploading, setUploading] = useState(false);

    const set = (k, v) => setForm({ ...form, [k]: v });

    // ---- Multi-question quiz helpers ----
    const newQuestion = () => ({ question: "", options: ["", ""], correct: 0 });
    const addQuestion = () => set("quiz_questions", [...(form.quiz_questions || []), newQuestion()]);
    const removeQuestion = (qi) => set("quiz_questions", (form.quiz_questions || []).filter((_, idx) => idx !== qi));
    const setQField = (qi, field, v) => {
        const qs = [...(form.quiz_questions || [])];
        qs[qi] = { ...qs[qi], [field]: v };
        set("quiz_questions", qs);
    };
    const setQOption = (qi, oi, v) => {
        const qs = [...(form.quiz_questions || [])];
        const opts = [...qs[qi].options];
        opts[oi] = v;
        qs[qi] = { ...qs[qi], options: opts };
        set("quiz_questions", qs);
    };
    const addQOption = (qi) => {
        const qs = [...(form.quiz_questions || [])];
        qs[qi] = { ...qs[qi], options: [...qs[qi].options, ""] };
        set("quiz_questions", qs);
    };
    const removeQOption = (qi, oi) => {
        const qs = [...(form.quiz_questions || [])];
        const opts = qs[qi].options.filter((_, idx) => idx !== oi);
        const correct = qs[qi].correct >= opts.length ? 0 : (qs[qi].correct > oi ? qs[qi].correct - 1 : qs[qi].correct);
        qs[qi] = { ...qs[qi], options: opts, correct };
        set("quiz_questions", qs);
    };

    const addSlide = () => {
        if (slideInput.trim()) {
            set("slides", [...form.slides, { text: slideInput.trim(), image_url: "" }]);
            setSlideInput("");
        }
    };
    const setSlideImage = async (i, file) => {
        if (!file) return;
        setUploading(true);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            const slides = [...form.slides];
            slides[i] = { ...slides[i], image_url: file_url };
            set("slides", slides);
        } catch (e) { console.error(e); alert("Erro ao enviar imagem"); }
        setUploading(false);
    };
    const clearSlideImage = (i) => {
        const slides = [...form.slides];
        slides[i] = { ...slides[i], image_url: "" };
        set("slides", slides);
    };

    const setOption = (i, v) => {
        const opts = [...form.quiz_options];
        opts[i] = v;
        set("quiz_options", opts);
    };
    const addOption = () => set("quiz_options", [...form.quiz_options, ""]);
    const removeOption = (i) => set("quiz_options", form.quiz_options.filter((_, idx) => idx !== i));

    const uploadFile = async (file, field) => {
        setUploading(true);
        try {
            const { file_url } = await base44.integrations.Core.UploadFile({ file });
            set(field, file_url);
        } catch (e) { console.error(e); alert("Erro ao enviar ficheiro"); }
        setUploading(false);
    };

    const handleSubmit = () => {
        if (!form.title.trim()) { alert("Preencha o título"); return; }
        const data = { ...form };
        if (form.type === "quiz") {
            const qs = (data.quiz_questions || []).filter(q => q.question.trim());
            if (qs.length === 0) { alert("Adiciona pelo menos uma pergunta com texto."); return; }
            data.quiz_questions = qs;
            // retrocompatibilidade: espelhar a 1ª pergunta nos campos antigos
            data.quiz_question = qs[0].question;
            data.quiz_options = qs[0].options;
            data.quiz_correct = qs[0].correct ?? 0;
        }
        if (form.class_id) {
            const c = classes.find(c => c.id === form.class_id);
            if (c) { data.class_name = c.name; data.age_group = c.age_group; }
        }
        onSave(data);
    };

    return (
        <Card className="bg-white/5 border-white/10 mb-6">
            <CardHeader><CardTitle className="text-white">{editing ? "Editar Material" : "Novo Material"}</CardTitle></CardHeader>
            <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input placeholder="Título *" value={form.title} onChange={e => set("title", e.target.value)} className="bg-white/10 border-white/20 text-white" />
                    <Select value={form.type} onValueChange={v => set("type", v)}>
                        <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="slides">Slides didáticos</SelectItem>
                            <SelectItem value="quiz">Quiz / Pergunta</SelectItem>
                            <SelectItem value="video">Vídeo bíblico</SelectItem>
                            <SelectItem value="image">Imagem</SelectItem>
                            <SelectItem value="text">Texto / Versículo</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Select value={form.class_id} onValueChange={v => set("class_id", v)}>
                        <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue placeholder="Turma (opcional)" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value={null}>Sem turma específica</SelectItem>
                            {classes.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    {!form.class_id && (
                        <Select value={form.age_group} onValueChange={v => set("age_group", v)}>
                            <SelectTrigger className="bg-white/10 border-white/20 text-white"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                {Object.entries(AGE_GROUPS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                </div>
                <Input placeholder="Tópico / Lição (ex: Criação do Mundo)" value={form.subject} onChange={e => set("subject", e.target.value)} className="bg-white/10 border-white/20 text-white" />

                {(form.type === "slides" || form.type === "text") && (
                    <>
                        <div className="flex gap-2">
                            <Textarea placeholder="Escrever slide..." value={slideInput} onChange={e => setSlideInput(e.target.value)} className="bg-white/10 border-white/20 text-white" rows={2} />
                            <Button onClick={addSlide} variant="outline" className="border-white/20 text-white">+ Slide</Button>
                        </div>
                        {form.slides.length > 0 && (
                            <div className="space-y-2">
                                {form.slides.map((s, i) => (
                                    <div key={i} className="bg-white/5 rounded-lg p-2.5">
                                        <div className="flex items-start gap-2">
                                            <span className="text-xs text-white/40 mt-1">{i + 1}.</span>
                                            <span className="text-sm text-white/80 flex-1 whitespace-pre-wrap">{s.text}</span>
                                            <div className="flex flex-col gap-1 shrink-0">
                                                {s.image_url && <img src={s.image_url} alt="" className="w-14 h-14 rounded object-cover" />}
                                                <label className="cursor-pointer text-accent text-xs flex items-center gap-1" title="Adicionar imagem ao slide">
                                                    <Upload className="w-3.5 h-3.5" /> Img
                                                    <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && setSlideImage(i, e.target.files[0])} disabled={uploading} />
                                                </label>
                                                {s.image_url && <button onClick={() => clearSlideImage(i)} className="text-red-400 text-xs">Remover</button>}
                                                <button onClick={() => set("slides", form.slides.filter((_, idx) => idx !== i))} className="text-red-400"><X className="w-4 h-4" /></button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </>
                )}

                {form.type === "quiz" && (
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-white/60 text-sm">Perguntas <span className="text-white/30">({(form.quiz_questions || []).length})</span></Label>
                            <Button onClick={addQuestion} variant="outline" size="sm" className="border-white/20 text-white"><Plus className="w-4 h-4 mr-1" /> Pergunta</Button>
                        </div>
                        {(form.quiz_questions || []).length === 0 && (
                            <p className="text-sm text-white/40 italic">Ainda sem perguntas. Clica em "Pergunta" para adicionar a primeira.</p>
                        )}
                        {(form.quiz_questions || []).map((q, qi) => (
                            <div key={qi} className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-accent shrink-0">P{qi + 1}</span>
                                    <Textarea placeholder={`Pergunta ${qi + 1}...`} value={q.question} onChange={e => setQField(qi, "question", e.target.value)} className="bg-white/10 border-white/20 text-white" rows={2} />
                                    <button onClick={() => removeQuestion(qi)} title="Remover pergunta" className="text-red-400 shrink-0"><Trash2 className="w-4 h-4" /></button>
                                </div>
                                <Label className="text-white/50 text-xs">Opções <span className="text-white/30">(clica no círculo para a resposta certa)</span></Label>
                                {q.options.map((opt, oi) => (
                                    <div key={oi} className={`flex gap-2 items-center rounded-lg p-1.5 transition-colors ${q.correct === oi ? "bg-green-500/15 border border-green-500/40" : "border border-transparent"}`}>
                                        <button onClick={() => setQField(qi, "correct", oi)} title="Marcar como resposta correta" className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all ${q.correct === oi ? "bg-green-500 border-green-500 text-white" : "border-white/30 hover:border-green-400/60"}`}>
                                            {q.correct === oi && <Check className="w-3.5 h-3.5" />}
                                        </button>
                                        <Input placeholder={`Opção ${oi + 1}`} value={opt} onChange={e => setQOption(qi, oi, e.target.value)} className="bg-white/10 border-white/20 text-white" />
                                        {q.options.length > 2 && <button onClick={() => removeQOption(qi, oi)} className="text-red-400 shrink-0"><X className="w-4 h-4" /></button>}
                                    </div>
                                ))}
                                <Button onClick={() => addQOption(qi)} variant="outline" size="sm" className="border-white/20 text-white">+ Opção</Button>
                            </div>
                        ))}
                    </div>
                )}

                {form.type === "video" && (
                    <div className="space-y-2">
                        <Label className="text-white/60 text-sm">URL do vídeo (MP4/YouTube)</Label>
                        <Input placeholder="https://..." value={form.video_url} onChange={e => set("video_url", e.target.value)} className="bg-white/10 border-white/20 text-white" />
                        <p className="text-xs text-white/40">ou enviar ficheiro de vídeo:</p>
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-accent">
                            <Upload className="w-4 h-4" /> {uploading ? "A enviar..." : "Enviar vídeo"}
                            <input type="file" accept="video/*" className="hidden" onChange={e => e.target.files[0] && uploadFile(e.target.files[0], "video_url")} disabled={uploading} />
                        </label>
                    </div>
                )}

                {form.type === "image" && (
                    <div className="space-y-2">
                        <Label className="text-white/60 text-sm">Imagem</Label>
                        <Input placeholder="URL da imagem..." value={form.image_url} onChange={e => set("image_url", e.target.value)} className="bg-white/10 border-white/20 text-white" />
                        <label className="flex items-center gap-2 cursor-pointer text-sm text-accent">
                            <Upload className="w-4 h-4" /> {uploading ? "A enviar..." : "Enviar imagem"}
                            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadFile(e.target.files[0], "image_url")} disabled={uploading} />
                        </label>
                        {form.image_url && <img src={form.image_url} alt="preview" className="max-h-40 rounded" />}
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="space-y-1">
                        <Label className="text-white/60 text-sm">Cor do texto</Label>
                        <input type="color" value={form.text_color || "#ffffff"} onChange={e => set("text_color", e.target.value)} className="w-full h-10 rounded bg-white/10 border border-white/20 cursor-pointer" />
                    </div>
                    <div className="space-y-1">
                        <Label className="text-white/60 text-sm">Cor de fundo da projeção</Label>
                        <input type="color" value={form.background_color || "#0f172a"} onChange={e => set("background_color", e.target.value)} className="w-full h-10 rounded bg-white/10 border border-white/20 cursor-pointer" />
                    </div>
                </div>
                <div className="space-y-1">
                    <Label className="text-white/60 text-sm">Imagem de fundo (opcional - sobrepõe a cor)</Label>
                    <Input placeholder="URL da imagem de fundo..." value={form.background_image || ""} onChange={e => set("background_image", e.target.value)} className="bg-white/10 border-white/20 text-white" />
                    <label className="flex items-center gap-2 cursor-pointer text-sm text-accent">
                        <Upload className="w-4 h-4" /> {uploading ? "A enviar..." : "Enviar imagem de fundo"}
                        <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files[0] && uploadFile(e.target.files[0], "background_image")} disabled={uploading} />
                    </label>
                </div>

                <Textarea placeholder="Descrição / notas..." value={form.description} onChange={e => set("description", e.target.value)} className="bg-white/10 border-white/20 text-white" rows={2} />

                <div className="flex gap-2">
                    <Button onClick={handleSubmit} className="text-white flex-1" style={{ background: "linear-gradient(to right, #7d8470, #c9a86a)" }}>
                        {editing ? "Guardar" : "Criar material"}
                    </Button>
                    <Button variant="outline" onClick={onCancel} className="border-white/20 text-white">Cancelar</Button>
                </div>
            </CardContent>
        </Card>
    );
}