import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Star, Highlighter, StickyNote, Trash2, BookOpen, Loader2 } from "lucide-react";
import moment from "moment";
import { useThemeColors } from "@/hooks/useThemeColors";
import { getBibleProjectionStyle } from "@/utils/bibleProjectionStyle";
import AddToServiceButton from "@/components/service/AddToServiceButton";

const TABS = [
    { key: "favorite", label: "Favoritos", icon: Star, color: "amber" },
    { key: "highlight", label: "Destaques", icon: Highlighter, color: "yellow" },
    { key: "note", label: "Anotações", icon: StickyNote, color: "blue" },
];

export default function BibleFavorites({ onProjectVerse }) {
    const colors = useThemeColors();
    const [activeTab, setActiveTab] = useState("favorite");
    const queryClient = useQueryClient();
    const [newNote, setNewNote] = useState({ reference: "", text: "", note_text: "" });
    const [savingNote, setSavingNote] = useState(false);

    const { data: notes, isLoading } = useQuery({
        queryKey: ["bibleNotes"],
        queryFn: () => keryx.entities.BibleNote.list("-updated_date", 200),
        initialData: [],
    });

    const deleteMutation = useMutation({
        mutationFn: (id) => keryx.entities.BibleNote.delete(id),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["bibleNotes"] }),
    });

    const filtered = notes.filter(n => n.note_type === activeTab);

    const handleProject = (n) => {
        if (!onProjectVerse) return;
        const style = getBibleProjectionStyle();
        onProjectVerse({
            reference: n.reference,
            book: n.book,
            chapter: n.chapter,
            verses: String(n.verse),
            text: `${n.verse} ${n.verse_text || ""}`,
            version: style.version || "NVI",
            slides: [{ text: `${n.verse} ${n.verse_text || ""}`, duration: 12 }],
            text_color: style.text_color,
            background_image: style.background_image,
            font_size: style.font_size,
            font_family: style.font_family,
        });
    };

    const handleSaveNote = async () => {
        if (!newNote.reference.trim() || !newNote.text.trim()) return;
        setSavingNote(true);
        try {
            // Tenta fazer parse da referência
            const refMatch = newNote.reference.match(/^(.+?)\s+(\d+):(\d+)$/);
            const book = refMatch ? refMatch[1] : newNote.reference;
            const chapter = refMatch ? parseInt(refMatch[2]) : 0;
            const verse = refMatch ? parseInt(refMatch[3]) : 0;

            await keryx.entities.BibleNote.create({
                reference: newNote.reference,
                book,
                chapter,
                verse,
                verse_text: newNote.text,
                note_type: "note",
                note_text: newNote.note_text,
            });
            setNewNote({ reference: "", text: "", note_text: "" });
            queryClient.invalidateQueries({ queryKey: ["bibleNotes"] });
        } catch (err) {
            console.error("Erro ao salvar anotação:", err);
        } finally {
            setSavingNote(false);
        }
    };

    const activeTabInfo = TABS.find(t => t.key === activeTab);

    return (
        <Card className="border" style={{ background: `linear-gradient(to bottom right, ${colors.primary}20, ${colors.secondary}20)`, borderColor: `${colors.primary}50` }}>
            <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2" style={{ color: colors.primary }}>
                    <Star className="w-5 h-5" />
                    Favoritos, Destaques e Anotações
                </CardTitle>
                <div className="flex gap-1 mt-2">
                    {TABS.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.key;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveTab(tab.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                                    isActive
                                        ? `bg-${tab.color}-500/30 text-${tab.color}-200 border border-${tab.color}-500/50`
                                        : "text-gray-400 hover:bg-white/10 border border-transparent"
                                }`}
                                style={isActive ? {
                                    background: tab.key === "favorite" ? "rgba(251,191,36,0.2)" : tab.key === "highlight" ? "rgba(250,204,21,0.2)" : "rgba(96,165,250,0.2)",
                                    color: tab.key === "favorite" ? "#fcd34d" : tab.key === "highlight" ? "#fde047" : "#93c5fd",
                                    borderColor: tab.key === "favorite" ? "rgba(251,191,36,0.4)" : tab.key === "highlight" ? "rgba(250,204,21,0.4)" : "rgba(96,165,250,0.4)",
                                } : {}}
                            >
                                <Icon className="w-4 h-4" />
                                {tab.label}
                                <span className="text-xs opacity-60">({notes.filter(n => n.note_type === tab.key).length})</span>
                            </button>
                        );
                    })}
                </div>
            </CardHeader>
            <CardContent className="space-y-3">
                {/* Formulário para nova anotação */}
                {activeTab === "note" && (
                    <div className="p-3 rounded-lg space-y-2" style={{ background: `${colors.primary}1a`, border: `1px solid ${colors.primary}50` }}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Input
                                placeholder="Referência (ex: João 3:16)"
                                value={newNote.reference}
                                onChange={(e) => setNewNote({ ...newNote, reference: e.target.value })}
                                className="bg-white/10 text-white placeholder:text-gray-400 text-sm"
                                style={{ borderColor: `${colors.primary}50` }}
                            />
                            <Input
                                placeholder="Texto do versículo"
                                value={newNote.text}
                                onChange={(e) => setNewNote({ ...newNote, text: e.target.value })}
                                className="bg-white/10 text-white placeholder:text-gray-400 text-sm"
                                style={{ borderColor: `${colors.primary}50` }}
                            />
                        </div>
                        <Input
                            placeholder="Sua anotação..."
                            value={newNote.note_text}
                            onChange={(e) => setNewNote({ ...newNote, note_text: e.target.value })}
                            className="bg-white/10 text-white placeholder:text-gray-400 text-sm"
                            style={{ borderColor: `${colors.primary}50` }}
                        />
                        <Button
                            onClick={handleSaveNote}
                            disabled={savingNote || !newNote.reference.trim() || !newNote.text.trim()}
                            size="sm"
                            className="text-white w-full"
                            style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                        >
                            {savingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <StickyNote className="w-4 h-4" />}
                            Salvar Anotação
                        </Button>
                    </div>
                )}

                {isLoading ? (
                    <p className="text-gray-400 text-center py-6">Carregando...</p>
                ) : filtered.length === 0 ? (
                    <p className="text-gray-400 text-center py-6">
                        Nenhum {activeTabInfo.label.toLowerCase()} ainda
                    </p>
                ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                        {filtered.map((n) => (
                            <div key={n.id} className="p-3 bg-white/5 rounded-lg hover:bg-white/10 transition" style={{ border: `1px solid ${colors.primary}30` }}>
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-semibold mb-1" style={{ color: colors.primary }}>{n.reference}</p>
                                        {n.verse_text && (
                                            <p className="text-white text-sm leading-relaxed mb-1">"{n.verse_text}"</p>
                                        )}
                                        {n.note_text && (
                                            <p className="text-blue-200 text-xs italic mt-1 p-1.5 bg-blue-500/10 rounded">
                                                📝 {n.note_text}
                                            </p>
                                        )}
                                        {n.highlight_color && activeTab === "highlight" && (
                                            <div className="flex items-center gap-1 mt-1">
                                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: n.highlight_color }} />
                                                <span className="text-xs text-gray-400">{moment(n.updated_date || n.created_date).format("DD/MM/YYYY")}</span>
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex gap-1 shrink-0">
                                        <AddToServiceButton
                                            itemType="BIBLE"
                                            title={n.reference}
                                            ensureContent={async () => {
                                                const passage = await keryx.entities.BiblePassage.create({
                                                    reference: n.reference,
                                                    book: n.book,
                                                    chapter: n.chapter,
                                                    verses: String(n.verse),
                                                    text: n.verse_text || "",
                                                    slides: [{ text: `${n.verse} ${n.verse_text || ""}`, duration: 12 }],
                                                    version: "NVI",
                                                });
                                                return passage;
                                            }}
                                        />
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleProject(n)}
                                            style={{ color: colors.primary }}
                                        >
                                            <BookOpen className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => deleteMutation.mutate(n.id)}
                                            className="text-red-400 hover:bg-red-500/20"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}