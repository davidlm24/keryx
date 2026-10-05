import React, { useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import {
    Search, Music, Book, Film, Image as ImageIcon, FileText, Monitor,
    Megaphone, Type, BarChart, HelpCircle, Timer, Plus
} from "lucide-react";

const TYPES = [
    { value: "SONG", label: "Música", icon: Music, hasEntity: true },
    { value: "BIBLE", label: "Bíblia", icon: Book, hasEntity: true },
    { value: "VIDEO", label: "Vídeo", icon: Film, hasEntity: true },
    { value: "IMAGE", label: "Imagem", icon: ImageIcon, hasEntity: true },
    { value: "PDF", label: "PDF", icon: FileText, hasEntity: true },
    { value: "POWERPOINT", label: "PPT", icon: Monitor, hasEntity: true },
    { value: "BANNER", label: "Banner", icon: Megaphone, hasEntity: true },
    { value: "POLL", label: "Enquete", icon: BarChart, hasEntity: true },
    { value: "QUIZ", label: "Quiz", icon: HelpCircle, hasEntity: true },
    { value: "ANNOUNCEMENT", label: "Anúncio", icon: Megaphone, hasEntity: false },
    { value: "TEXT", label: "Texto", icon: Type, hasEntity: false },
    { value: "TIMER", label: "Timer", icon: Timer, hasEntity: false },
    { value: "FREE_CONTENT", label: "Livre", icon: Plus, hasEntity: false },
];

export default function ServiceItemPicker({ open, onClose, onAdd }) {
    const [selectedType, setSelectedType] = useState("SONG");
    const [search, setSearch] = useState("");
    const [customTitle, setCustomTitle] = useState("");

    const typeConfig = TYPES.find(t => t.value === selectedType);

    const { data: songs } = useQuery({
        queryKey: ["songs"],
        queryFn: () => base44.entities.Song.list("-title"),
        initialData: [],
        enabled: selectedType === "SONG",
    });
    const { data: passages } = useQuery({
        queryKey: ["biblePassages"],
        queryFn: () => base44.entities.BiblePassage.list("-created_date"),
        initialData: [],
        enabled: selectedType === "BIBLE",
    });
    const { data: media } = useQuery({
        queryKey: ["media"],
        queryFn: () => base44.entities.Media.list("-created_date"),
        initialData: [],
        enabled: ["VIDEO", "IMAGE", "PDF", "POWERPOINT"].includes(selectedType),
    });
    const { data: banners } = useQuery({
        queryKey: ["bannerTemplates"],
        queryFn: () => base44.entities.BannerTemplate.list("-created_date"),
        initialData: [],
        enabled: selectedType === "BANNER",
    });
    const { data: polls } = useQuery({
        queryKey: ["polls"],
        queryFn: () => base44.entities.Poll.list("-created_date"),
        initialData: [],
        enabled: selectedType === "POLL",
    });
    const { data: quizzes } = useQuery({
        queryKey: ["quizzes"],
        queryFn: () => base44.entities.Quiz.list("-created_date"),
        initialData: [],
        enabled: selectedType === "QUIZ",
    });

    const getItems = () => {
        switch (selectedType) {
            case "SONG": return songs.map(s => ({ id: s.id, title: s.title, subtitle: s.artist }));
            case "BIBLE": return passages.map(p => ({ id: p.id, title: p.reference, subtitle: p.text?.slice(0, 60) }));
            case "VIDEO": return media.filter(m => m.type === "video").map(m => ({ id: m.id, title: m.title, subtitle: m.category }));
            case "IMAGE": return media.filter(m => m.type === "image").map(m => ({ id: m.id, title: m.title, subtitle: m.category }));
            case "PDF": return media.filter(m => m.type === "pdf").map(m => ({ id: m.id, title: m.title, subtitle: m.category }));
            case "POWERPOINT": return media.filter(m => m.type === "powerpoint").map(m => ({ id: m.id, title: m.title, subtitle: m.category }));
            case "BANNER": return banners.map(b => ({ id: b.id, title: b.name, subtitle: b.category }));
            case "POLL": return polls.map(p => ({ id: p.id, title: p.question, subtitle: `${p.options?.length || 0} opções` }));
            case "QUIZ": return quizzes.map(q => ({ id: q.id, title: q.question, subtitle: q.category }));
            default: return [];
        }
    };

    const items = getItems();
    const filtered = search ? items.filter(i => i.title?.toLowerCase().includes(search.toLowerCase())) : items;

    const handleAddWithContent = (item) => {
        onAdd({ type: selectedType, title: item.title, contentId: item.id });
        setSearch("");
    };

    const handleAddCustom = () => {
        if (!customTitle.trim()) return;
        onAdd({ type: selectedType, title: customTitle, contentId: "" });
        setCustomTitle("");
    };

    return (
        <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
            <SheetContent side="bottom" className="bg-slate-900 border-white/15 text-white overflow-y-auto max-h-[85vh] rounded-t-2xl">
                <SheetHeader>
                    <SheetTitle className="text-white">Adicionar Item ao Culto</SheetTitle>
                </SheetHeader>
                <div className="px-1 pb-8 space-y-4">
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {TYPES.map(t => {
                            const Icon = t.icon;
                            return (
                                <button
                                    key={t.value}
                                    onClick={() => { setSelectedType(t.value); setSearch(""); setCustomTitle(""); }}
                                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                                        selectedType === t.value
                                            ? "bg-primary text-primary-foreground"
                                            : "bg-white/5 text-gray-400 hover:bg-white/10"
                                    }`}
                                >
                                    <Icon className="w-3.5 h-3.5" />
                                    {t.label}
                                </button>
                            );
                        })}
                    </div>

                    {typeConfig?.hasEntity ? (
                        <>
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                                <Input
                                    placeholder="Buscar..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="bg-white/10 border-white/15 text-white pl-10"
                                />
                            </div>
                            <div className="space-y-1 max-h-[50vh] overflow-y-auto no-scrollbar">
                                {filtered.length === 0 ? (
                                    <p className="text-center text-gray-500 text-sm py-4">Nenhum item encontrado</p>
                                ) : (
                                    filtered.map(item => (
                                        <button
                                            key={item.id}
                                            onClick={() => handleAddWithContent(item)}
                                            className="w-full text-left p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                                        >
                                            <div className="text-white text-sm font-medium truncate">{item.title}</div>
                                            {item.subtitle && <div className="text-gray-500 text-xs truncate">{item.subtitle}</div>}
                                        </button>
                                    ))
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="space-y-3">
                            <Input
                                placeholder="Título do item..."
                                value={customTitle}
                                onChange={(e) => setCustomTitle(e.target.value)}
                                className="bg-white/10 border-white/15 text-white"
                            />
                            <Button
                                onClick={handleAddCustom}
                                disabled={!customTitle.trim()}
                                className="w-full bg-primary hover:bg-primary/90 text-primary-foreground"
                            >
                                <Plus className="w-4 h-4 mr-2" />
                                Adicionar
                            </Button>
                        </div>
                    )}
                </div>
            </SheetContent>
        </Sheet>
    );
}