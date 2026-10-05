import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Maximize2, Film } from "lucide-react";
import { motion } from "framer-motion";
import { createPageUrl } from "@/utils";
import { useThemeColors } from "@/hooks/useThemeColors";
import { openProjectionWindow, sendToProjection } from "@/lib/projectionWindow";

import MediaUpload from "../components/media/MediaUpload";
import MediaList from "../components/media/MediaList";
import RemoteProjectionDialog from "../components/projection/RemoteProjectionDialog";
import { useIsMobileDevice } from "@/hooks/useIsMobileDevice";

export default function Media() {
    const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
    const [remoteDialogTitle, setRemoteDialogTitle] = useState("");
    const isMobileDevice = useIsMobileDevice();
    const colors = useThemeColors();
    const queryClient = useQueryClient();

    const interceptWindowOpen = (title, action) => {
        if (isMobileDevice) {
            setRemoteDialogTitle(title);
            setRemoteDialogOpen(true);
            return null;
        }
        return action();
    };

    const { data: mediaItems, isLoading } = useQuery({
        queryKey: ["media"],
        queryFn: () => base44.entities.Media.list("-created_date"),
        initialData: [],
    });

    const createMediaMutation = useMutation({
        mutationFn: (mediaData) => base44.entities.Media.create(mediaData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["media"] });
        },
    });

    const deleteMediaMutation = useMutation({
        mutationFn: (id) => base44.entities.Media.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["media"] });
        },
    });

    const openProjection = () => interceptWindowOpen("Tela de Projeção", () => openProjectionWindow());

    const handlePlay = (media) => {
        interceptWindowOpen("Tela de Projeção", () => {
            sendToProjection({
                type: "MEDIA_PROJECTION",
                mediaType: media.type,
                title: media.title,
                fileUrl: media.file_url,
            });
        });
    };

    const handlePlaySequence = () => {
        const playlist = mediaItems.filter(m => ["video", "image", "gif", "pdf"].includes(m.type));
        if (playlist.length === 0) {
            alert("Nenhum conteúdo disponível para transmissão");
            return;
        }
        interceptWindowOpen("Tela de Projeção", () => {
            sendToProjection({ type: "MEDIA_SEQUENCE", playlist });
        });
    };

    const handleMediaUploaded = (mediaData) => {
        createMediaMutation.mutate(mediaData);
    };

    const handleDelete = (media) => {
        if (confirm(`Deseja realmente excluir "${media.title}"?`)) {
            deleteMediaMutation.mutate(media.id);
        }
    };

    return (
        <div className="min-h-screen p-6">
            <div className="max-w-7xl mx-auto">
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex justify-between items-center mb-8"
                >
                    <div>
                        <h1 className="text-4xl font-bold bg-clip-text text-transparent flex items-center gap-3"
                            style={{ backgroundImage: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}>
                            <Film className="w-10 h-10" style={{ color: colors.primary }} />
                            Biblioteca de Mídia
                        </h1>
                        <p className="mt-2" style={{ color: colors.primary }}>Vídeos, PowerPoints e Imagens</p>
                    </div>
                    <div className="flex gap-3">
                        <Button
                            onClick={handlePlaySequence}
                            disabled={mediaItems.length === 0}
                            className="text-white"
                            style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                        >
                            ▶️ Reproduzir Todos em Loop
                        </Button>
                        <Button
                            onClick={openProjection}
                            className="text-white"
                            style={{ background: `linear-gradient(to right, ${colors.primary}, ${colors.secondary})` }}
                        >
                            <Maximize2 className="w-5 h-5 mr-2" />
                            Abrir Tela de Projeção
                        </Button>
                    </div>
                </motion.div>

                <div className="mb-6">
                    <MediaUpload onMediaUploaded={handleMediaUploaded} />
                </div>

                {isLoading ? (
                    <div className="text-center py-12" style={{ color: colors.primary }}>
                        Carregando mídia...
                    </div>
                ) : mediaItems.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12"
                    >
                        <div className="text-6xl mb-4">🎬</div>
                        <h3 className="text-2xl font-semibold text-white mb-2">
                            Nenhuma mídia carregada
                        </h3>
                        <p style={{ color: colors.primary }}>
                            Faça upload de vídeos, PowerPoints ou imagens para começar
                        </p>
                    </motion.div>
                ) : (
                    <MediaList
                        mediaItems={mediaItems}
                        onPlay={handlePlay}
                        onDelete={handleDelete}
                    />
                )}
            </div>
            <RemoteProjectionDialog
                open={remoteDialogOpen}
                onClose={() => setRemoteDialogOpen(false)}
                title={remoteDialogTitle}
            />
        </div>
    );
}