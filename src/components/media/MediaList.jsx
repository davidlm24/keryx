import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Play, Trash2, Film, Image, FileText, FileImage, FileType } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { useThemeColors } from "@/hooks/useThemeColors";

export default function MediaList({ mediaItems, onPlay, onDelete }) {
    const colors = useThemeColors();
    const getIcon = (type) => {
        switch (type) {
            case "video":
                return <Film className="w-6 h-6 text-blue-300" />;
            case "image":
                return <Image className="w-6 h-6 text-blue-300" />;
            case "gif":
                return <FileImage className="w-6 h-6 text-emerald-300" />;
            case "powerpoint":
                return <FileText className="w-6 h-6 text-blue-300" />;
            case "pdf":
                return <FileType className="w-6 h-6 text-red-300" />;
            default:
                return <Film className="w-6 h-6 text-blue-300" />;
        }
    };

    const getTypeLabel = (type) => {
        switch (type) {
            case "video":
                return "Vídeo";
            case "image":
                return "Imagem";
            case "gif":
                return "GIF";
            case "powerpoint":
                return "PowerPoint";
            case "pdf":
                return "PDF";
            default:
                return "Mídia";
        }
    };

    const categoryColors = {
        sermon: "bg-accent/20 text-accent-foreground",
        worship: "bg-pink-100 text-pink-800",
        announcement: "bg-yellow-100 text-yellow-800",
        testimony: "bg-green-100 text-green-800",
        other: "bg-gray-100 text-gray-800"
    };

    return (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {mediaItems.map((media, index) => (
                <motion.div
                    key={media.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                >
                    <Card className="border transition-all h-full" style={{ background: `linear-gradient(to bottom right, ${colors.primary}30, ${colors.secondary}30)`, borderColor: `${colors.primary}50` }}>
                        <CardContent className="p-6">
                            <div className="flex flex-col gap-4">
                                <div className="flex items-start gap-3">
                                    <div className="p-3 rounded-lg" style={{ background: `${colors.primary}40` }}>
                                        {getIcon(media.type)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <h3 className="text-lg font-semibold text-white truncate">
                                            {media.title}
                                        </h3>
                                        {media.description && (
                                            <p className="text-sm line-clamp-2 mt-1" style={{ color: colors.primary }}>
                                                {media.description}
                                            </p>
                                        )}
                                        <div className="flex gap-2 mt-2 flex-wrap">
                                            <Badge style={{ background: `${colors.primary}30`, color: colors.primary }}>
                                                {getTypeLabel(media.type)}
                                            </Badge>
                                            <Badge className={categoryColors[media.category]}>
                                                {media.category}
                                            </Badge>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    <Button
                                        onClick={() => onPlay(media)}
                                        className="flex-1 text-white"
                                        style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                                    >
                                        <Play className="w-4 h-4 mr-2" />
                                        Projetar
                                    </Button>
                                    <Button
                                        onClick={() => onDelete(media)}
                                        variant="outline"
                                        className="border-red-500/30 hover:bg-red-500/10 text-red-400"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </motion.div>
            ))}
        </div>
    );
}