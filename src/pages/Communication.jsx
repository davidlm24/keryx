import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Maximize2, Play } from "lucide-react";
import PagePanel from "@/components/layout/PagePanel";
import { openProjectionWindow, sendToProjection } from "@/lib/projectionWindow";
import { AnimatePresence, motion } from "framer-motion";
import { createPageUrl } from "@/utils";
import { useThemeColors } from "@/hooks/useThemeColors";

import CommunicationVideoForm from "../components/communication/CommunicationVideoForm";
import CommunicationVideoList from "../components/communication/CommunicationVideoList";

export default function Communication() {
    const [showForm, setShowForm] = useState(false);
    const [editingVideo, setEditingVideo] = useState(null);
    const colors = useThemeColors();
    const queryClient = useQueryClient();

    const { data: videos, isLoading } = useQuery({
        queryKey: ["communicationVideos"],
        queryFn: () => base44.entities.CommunicationVideo.list("-created_date"),
        initialData: [],
    });

    const createVideoMutation = useMutation({
        mutationFn: (videoData) => base44.entities.CommunicationVideo.create(videoData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["communicationVideos"] });
            setShowForm(false);
            setEditingVideo(null);
        },
    });

    const updateVideoMutation = useMutation({
        mutationFn: ({ id, videoData }) => base44.entities.CommunicationVideo.update(id, videoData),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["communicationVideos"] });
            setShowForm(false);
            setEditingVideo(null);
        },
    });

    const deleteVideoMutation = useMutation({
        mutationFn: (id) => base44.entities.CommunicationVideo.delete(id),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ["communicationVideos"] });
        },
    });

    const handleSubmit = (videoData) => {
        if (editingVideo) {
            updateVideoMutation.mutate({ id: editingVideo.id, videoData });
        } else {
            createVideoMutation.mutate(videoData);
        }
    };

    const handlePlay = (video) => {
        sendToProjection({ type: "COMMUNICATION_DATA", video });
    };

    const handlePlaySequence = () => {
        if (videos.length === 0) {
            alert("Nenhum conteúdo disponível para transmissão");
            return;
        }
        sendToProjection({ type: "COMMUNICATION_SEQUENCE", playlist: videos });
    };

    const handleEdit = (video) => {
        setEditingVideo(video);
        setShowForm(true);
    };

    const handleDelete = (video) => {
        if (confirm(`Deseja realmente excluir "${video.title}"?`)) {
            deleteVideoMutation.mutate(video.id);
        }
    };

    return (
        <PagePanel
            title="Comunicação Visual"
            actions={
                <>
                    <button
                        type="button"
                        className="mc-control mc-primary"
                        onClick={handlePlaySequence}
                        disabled={videos.length === 0}
                    >
                        <Play />
                        Reproduzir Todas em Loop
                    </button>
                    <button
                        type="button"
                        className="mc-control"
                        onClick={() => openProjectionWindow()}
                    >
                        <Maximize2 />
                        Abrir Projeção
                    </button>
                    <button
                        type="button"
                        className="mc-control mc-accent"
                        onClick={() => {
                            setEditingVideo(null);
                            setShowForm(true);
                        }}
                    >
                        <Plus />
                        Nova Comunicação
                    </button>
                </>
            }
        >

                <AnimatePresence>
                    {showForm && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                        >
                            <CommunicationVideoForm
                                video={editingVideo}
                                onSubmit={handleSubmit}
                                onCancel={() => {
                                    setShowForm(false);
                                    setEditingVideo(null);
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {isLoading ? (
                    <div className="text-center py-12" style={{ color: colors.primary }}>
                        Carregando comunicações...
                    </div>
                ) : videos.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12"
                    >
                        <div className="text-6xl mb-4">📢</div>
                        <h3 className="text-2xl font-semibold text-white mb-2">
                            Nenhuma comunicação criada
                        </h3>
                        <p style={{ color: colors.primary }}>
                            Crie contagens regressivas, cronómetros ou anúncios
                        </p>
                    </motion.div>
                ) : (
                    <CommunicationVideoList
                        videos={videos}
                        onPlay={handlePlay}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                    />
                )}
        </PagePanel>
    );
}