import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, Timer, Bell, Play, Edit, Trash2, Image } from "lucide-react";
import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";

export default function CommunicationVideoList({ videos, onPlay, onEdit, onDelete }) {
    const typeIcons = {
        countdown: Clock,
        timer: Timer,
        announcement: Bell,
        image_text: Image
    };

    const typeLabels = {
        countdown: "Contagem Regressiva",
        timer: "Cronómetro",
        announcement: "Anúncio",
        image_text: "Imagem + Texto"
    };

    const typeColors = {
        countdown: "from-blue-900/30 to-cyan-900/30 border-blue-500/30",
        timer: "from-green-900/30 to-emerald-900/30 border-green-500/30",
        announcement: "from-orange-900/30 to-red-900/30 border-orange-500/30",
        image_text: "from-accent/20 to-primary/20 border-accent/30"
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {videos.map((video, index) => {
                const Icon = typeIcons[video.type] || Bell;
                return (
                    <motion.div
                        key={video.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                    >
                        <Card className={`bg-gradient-to-br ${typeColors[video.type]} hover:scale-105 transition-all`}>
                            <CardContent className="p-6">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="bg-white/10 p-3 rounded-lg">
                                        <Icon className="w-6 h-6 text-orange-300" />
                                    </div>
                                    <div className="flex gap-2">
                                        <Button
                                            onClick={() => onEdit(video)}
                                            variant="ghost"
                                            size="icon"
                                            className="hover:bg-white/10"
                                        >
                                            <Edit className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            onClick={() => onDelete(video)}
                                            variant="ghost"
                                            size="icon"
                                            className="text-red-400 hover:bg-red-500/10"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </div>

                                <h3 className="text-lg font-semibold text-white mb-2">
                                    {video.title}
                                </h3>

                                <div className="flex gap-2 mb-4">
                                    <Badge variant="outline" className="text-orange-300 border-orange-500/30">
                                        {typeLabels[video.type]}
                                    </Badge>
                                    <Badge variant="outline" className="text-orange-300 border-orange-500/30">
                                        {video.duration}s
                                    </Badge>
                                </div>

                                {video.text && (
                                    <p className="text-sm text-gray-300 mb-4 line-clamp-2">
                                        {video.text}
                                    </p>
                                )}

                                <Button
                                    onClick={() => onPlay(video)}
                                    className="w-full bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-700 hover:to-red-700"
                                >
                                    <Play className="w-4 h-4 mr-2" />
                                    Projetar
                                </Button>
                            </CardContent>
                        </Card>
                    </motion.div>
                );
            })}
        </div>
    );
}