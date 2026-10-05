import React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Play, Pencil, Trash2, FileText, HelpCircle, Video, Image as ImageIcon, BookOpen } from "lucide-react";

const TYPE_ICONS = { slides: FileText, quiz: HelpCircle, video: Video, image: ImageIcon, text: BookOpen };
const TYPE_LABELS = { slides: "Slides", quiz: "Quiz", video: "Vídeo", image: "Imagem", text: "Texto" };
const TYPE_COLORS = { slides: "#7d8470", quiz: "#c9a86a", video: "#c9a86a", image: "#7d8470", text: "#a8a395" };

export default function MaterialList({ materials, classes, onProject, onEdit, onDelete }) {
    if (materials.length === 0) {
        return (
            <div className="text-center py-12">
                <BookOpen className="w-16 h-16 mx-auto text-white/20 mb-4" />
                <p className="text-white/50">Nenhum material criado ainda</p>
            </div>
        );
    }
    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {materials.map(m => {
                const Icon = TYPE_ICONS[m.type] || FileText;
                const color = TYPE_COLORS[m.type] || "#7d8470";
                const cls = classes.find(c => c.id === m.class_id);
                return (
                    <Card key={m.id} className="bg-white/5 border-white/10">
                        <CardContent className="p-5">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}25` }}>
                                        <Icon className="w-5 h-5" style={{ color }} />
                                    </div>
                                    <div>
                                        <h3 className="text-base font-semibold text-white leading-tight">{m.title}</h3>
                                        <span className="text-xs px-2 py-0.5 rounded" style={{ backgroundColor: `${color}25`, color }}>{TYPE_LABELS[m.type]}</span>
                                    </div>
                                </div>
                            </div>
                            {m.subject && <p className="text-xs text-white/50 mb-2">📖 {m.subject}</p>}
                            {cls && <p className="text-xs text-white/40 mb-2">Turma: {cls.name}</p>}
                            {(m.type === "slides" || m.type === "text") && m.slides?.length > 0 && (
                                <p className="text-xs text-white/40 mb-2">{m.slides.length} slide(s)</p>
                            )}
                            {m.type === "quiz" && <p className="text-xs text-white/40 mb-2">{m.quiz_questions?.length || (m.quiz_question ? 1 : 0)} pergunta(s)</p>}
                            {m.description && <p className="text-xs text-white/40 line-clamp-2 mb-3">{m.description}</p>}
                            <div className="flex gap-2 pt-2 border-t border-white/10">
                                <Button onClick={() => onProject(m)} size="sm" className="text-white flex-1" style={{ background: `linear-gradient(to right, ${color}, #c9a86a)` }}>
                                    <Play className="w-4 h-4 mr-1" /> Projetar
                                </Button>
                                <Button size="icon" variant="ghost" onClick={() => onEdit(m)} className="text-accent"><Pencil className="w-4 h-4" /></Button>
                                <Button size="icon" variant="ghost" onClick={() => onDelete(m.id)} className="text-red-400"><Trash2 className="w-4 h-4" /></Button>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}