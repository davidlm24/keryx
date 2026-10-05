import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Music, Book, Film, Image as ImageIcon, FileText, Monitor, Megaphone,
    Type, BarChart, HelpCircle, Timer, Plus, GripVertical, ChevronUp,
    ChevronDown, Play, Trash2, Copy, Settings, EyeOff, Eye
} from "lucide-react";

export const TYPE_ICONS = {
    SONG: Music, BIBLE: Book, VIDEO: Film, IMAGE: ImageIcon,
    PDF: FileText, POWERPOINT: Monitor, BANNER: Megaphone,
    ANNOUNCEMENT: Megaphone, TEXT: Type, POLL: BarChart,
    QUIZ: HelpCircle, TIMER: Timer, FREE_CONTENT: Plus,
};

export const TYPE_LABELS = {
    SONG: "Música", BIBLE: "Bíblia", VIDEO: "Vídeo", IMAGE: "Imagem",
    PDF: "PDF", POWERPOINT: "PPT", BANNER: "Banner",
    ANNOUNCEMENT: "Anúncio", TEXT: "Texto", POLL: "Enquete",
    QUIZ: "Quiz", TIMER: "Timer", FREE_CONTENT: "Livre",
};

export const TYPE_COLORS = {
    SONG: "bg-accent/20 text-accent border-accent/30",
    BIBLE: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    VIDEO: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    IMAGE: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
    PDF: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    POWERPOINT: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    BANNER: "bg-primary/20 text-primary border-primary/30",
    ANNOUNCEMENT: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    TEXT: "bg-gray-500/20 text-gray-300 border-gray-500/30",
    POLL: "bg-teal-500/20 text-teal-300 border-teal-500/30",
    QUIZ: "bg-rose-500/20 text-rose-300 border-rose-500/30",
    TIMER: "bg-amber-500/20 text-amber-300 border-amber-500/30",
    FREE_CONTENT: "bg-slate-500/20 text-slate-300 border-slate-500/30",
};

export default function ServiceItemCard({ item, index, dragHandleProps, isDragging, onPlay, onDelete, onDuplicate, onToggleEnabled, onConfig, onMove, totalCount }) {
    const Icon = TYPE_ICONS[item.type] || Type;

    return (
        <div
            className={`flex items-center gap-2 bg-white/5 p-2.5 rounded-lg border border-border transition-all ${
                isDragging ? "shadow-lg ring-2 ring-primary bg-primary/20" : ""
            } ${!item.enabled ? "opacity-40" : ""}`}
        >
            <span {...dragHandleProps} className="cursor-grab active:cursor-grabbing shrink-0">
                <GripVertical className="w-4 h-4 text-primary" />
            </span>
            <span className="text-xs text-muted-foreground font-mono w-5 text-center shrink-0">{index + 1}</span>
            <Badge className={`${TYPE_COLORS[item.type] || TYPE_COLORS.TEXT} shrink-0`}>
                <Icon className="w-3 h-3 mr-1" />
                {TYPE_LABELS[item.type] || item.type}
            </Badge>
            <span className="flex-1 text-white truncate text-sm min-w-0">{item.title}</span>
            {item.duration > 0 && <span className="text-xs text-gray-500 shrink-0">{item.duration}s</span>}
            {item.autoAdvance && <span className="text-xs text-primary shrink-0 hidden sm:inline">auto</span>}
            <div className="flex items-center gap-0.5 shrink-0">
                <Button onClick={() => onMove(index, -1)} size="sm" variant="ghost" disabled={index === 0} className="text-primary hover:bg-primary/10 h-7 w-7 p-0">
                    <ChevronUp className="w-3.5 h-3.5" />
                </Button>
                <Button onClick={() => onMove(index, 1)} size="sm" variant="ghost" disabled={index === (totalCount || 0) - 1} className="text-primary hover:bg-primary/10 h-7 w-7 p-0">
                    <ChevronDown className="w-3.5 h-3.5" />
                </Button>
                <Button onClick={() => onToggleEnabled(item)} size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:bg-white/10">
                    {item.enabled ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </Button>
                <Button onClick={() => onConfig(item)} size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:bg-white/10">
                    <Settings className="w-3.5 h-3.5" />
                </Button>
                <Button onClick={() => onDuplicate(item)} size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:bg-white/10">
                    <Copy className="w-3.5 h-3.5" />
                </Button>
                <Button onClick={() => onPlay(item)} size="sm" variant="outline" className="border-primary/30 hover:bg-primary/10 h-7 px-2">
                    <Play className="w-3.5 h-3.5" />
                </Button>
                <Button onClick={() => onDelete(item)} size="sm" variant="ghost" className="text-red-400 hover:bg-red-500/10 h-7 w-7 p-0">
                    <Trash2 className="w-3.5 h-3.5" />
                </Button>
            </div>
        </div>
    );
}