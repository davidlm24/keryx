import React, { useState, useEffect } from "react";
import { useParams, useNavigate, Navigate } from "react-router-dom";
import { keryx } from "@/api/keryxClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, ArrowLeft, Maximize2, Calendar, Square, FileDown, Eye } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPageUrl } from "@/utils";
import { useThemeColors } from "@/hooks/useThemeColors";
import { openProjectionWindow as openSharedProjection } from "@/lib/projectionWindow";
import { projection } from "@/lib/projection";
import { useProjectionControl, isVideoUrl, songContent, passageContent } from "@/hooks/useProjectionControl";

import ServiceForm from "../components/service/ServiceForm";
import ServiceList from "../components/service/ServiceList";
import WorshipChat from "@/components/worship/WorshipChat";
import ServiceItemManager from "../components/service/ServiceItemManager";
import VideoPlayerPanel from "../components/projection/VideoPlayerPanel";
import LyricPlayerPanel from "../components/projection/LyricPlayerPanel";
import RemoteProjectionDialog from "../components/projection/RemoteProjectionDialog";
import { useIsMobileDevice } from "@/hooks/useIsMobileDevice";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import ConnectionBanner from "@/components/ConnectionBanner";
import { exportServiceToPdf } from "@/utils/servicePdfExport";
import ServiceTimer from "@/components/service/ServiceTimer";
import ObsIntegration from "@/components/projection/ObsIntegration";
import QrCodePanel from "@/components/projection/QrCodePanel";
import { useToast } from "@/components/ui/use-toast";

export default function Services() {
    // Desktop: Cultos moved into the console (the planner). The web build
    // keeps this page for now.
    const { id } = useParams();
    if (keryx.isDesktop) return <Navigate to={`/Console?planner=${id || "1"}`} replace />;
    return <LegacyServices />;
}

function LegacyServices() {
    const [showForm, setShowForm] = useState(false);
    const [editingService, setEditingService] = useState(null);
    const { id: serviceId } = useParams();
    const navigate = useNavigate();
    const colors = useThemeColors();
    const [activeVideoSong, setActiveVideoSong] = useState(null);
    const [lyricPanelOpen, setLyricPanelOpen] = useState(false);
    // Modo Ensaio: slides stepped through in the panel only, not projected
    const [rehearsal, setRehearsal] = useState(null);
    const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
    const [remoteDialogTitle, setRemoteDialogTitle] = useState("");
    const isMobileDevice = useIsMobileDevice();
    const isOnline = useOnlineStatus();
    const [operatorName, setOperatorName] = useState("");
    const [currentItemOrder, setCurrentItemOrder] = useState(null);
    const [ensaioMode, setEnsaioMode] = useState(false);
    const [preloadedNext, setPreloadedNext] = useState(null);
    const [showObs, setShowObs] = useState(false);
    const queryClient = useQueryClient();
    const { toast } = useToast();
    const { live, isLive, playSong, playPassage, stop } = useProjectionControl({ serviceId, onEscape: () => stopProjection() });

    // Colaboração em tempo real — subscreve a atualizações do Service por outros operadores
    useEffect(() => {
        if (!serviceId) return;
        const unsubscribe = keryx.entities.Service.subscribe((event) => {
            if ((event.type === 'update' || event.type === 'delete') && event.data?.id === serviceId) {
                queryClient.invalidateQueries({ queryKey: ["services"] });
            }
        });
        const unsubscribeItems = keryx.entities.ServiceItem.subscribe((event) => {
            if (event.data?.serviceId === serviceId) {
                queryClient.invalidateQueries({ queryKey: ["serviceItems", serviceId] });
            }
        });
        return () => { unsubscribe(); unsubscribeItems(); };
    }, [serviceId, queryClient]);

    const interceptWindowOpen = (title, action) => {
        if (isMobileDevice) {
            setRemoteDialogTitle(title);
            setRemoteDialogOpen(true);
            return null;
        }
        return action();
    };

    const { data: services, isLoading, isFetching } = useQuery({
        queryKey: ["services"],
        queryFn: () => keryx.entities.Service.list("-date"),
        initialData: [],
    });

    const createServiceMutation = useMutation({
        mutationFn: (serviceData) => keryx.entities.Service.create(serviceData),
        onMutate: async (serviceData) => {
            await queryClient.cancelQueries({ queryKey: ["services"] });
            const previous = queryClient.getQueryData(["services"]);
            queryClient.setQueryData(["services"], (old) => [...old, { ...serviceData, id: `temp-${Date.now()}`, items: serviceData.items || [] }]);
            return { previous };
        },
        onSuccess: (createdService) => {
            // Substituir item temporário pelo culto real criado (garante visibilidade imediata)
            queryClient.setQueryData(["services"], (old) => {
                const withoutTemp = (old || []).filter(s => !String(s.id).startsWith("temp-"));
                return [...withoutTemp, createdService];
            });
            setShowForm(false);
            setEditingService(null);
            toast({ title: "Culto criado com sucesso!" });
        },
        onError: (err, _vars, ctx) => {
            ctx?.previous && queryClient.setQueryData(["services"], ctx.previous);
            toast({
                title: "Erro ao criar culto",
                description: err?.message || "Verifique os dados e tente novamente.",
                variant: "destructive",
            });
        },
        // Não invalidar imediatamente — o onSuccess já colocou o culto real no cache.
        // O refetch automático pode voltar vazio por consistência eventual da BD, apagando o culto criado.
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["services"], refetchType: "none" }),
    });

    const updateServiceMutation = useMutation({
        mutationFn: ({ id, serviceData }) => keryx.entities.Service.update(id, serviceData),
        onMutate: async ({ id, serviceData }) => {
            await queryClient.cancelQueries({ queryKey: ["services"] });
            const previous = queryClient.getQueryData(["services"]);
            queryClient.setQueryData(["services"], (old) =>
                old.map((s) => (s.id === id ? { ...s, ...serviceData } : s))
            );
            return { previous };
        },
        onSuccess: () => {
            setShowForm(false);
            setEditingService(null);
            toast({ title: "Culto atualizado com sucesso!" });
        },
        onError: (err, _vars, ctx) => {
            ctx?.previous && queryClient.setQueryData(["services"], ctx.previous);
            toast({
                title: "Erro ao atualizar culto",
                description: err?.message || "Verifique os dados e tente novamente.",
                variant: "destructive",
            });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["services"], refetchType: "none" }),
    });

    const deleteServiceMutation = useMutation({
        mutationFn: (id) => keryx.entities.Service.delete(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ["services"] });
            const previous = queryClient.getQueryData(["services"]);
            queryClient.setQueryData(["services"], (old) => old.filter((s) => s.id !== id));
            return { previous };
        },
        onSuccess: () => toast({ title: "Culto excluído com sucesso!" }),
        onError: (err, _vars, ctx) => {
            ctx?.previous && queryClient.setQueryData(["services"], ctx.previous);
            toast({
                title: "Erro ao excluir culto",
                description: err?.message || "Tente novamente.",
                variant: "destructive",
            });
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["services"], refetchType: "none" }),
    });

    const selectedService = serviceId ? services.find(s => s.id === serviceId) : null;

    const { data: serviceItems } = useQuery({
        queryKey: ["serviceItems", serviceId],
        queryFn: () => keryx.entities.ServiceItem.filter({ serviceId }, "order"),
        enabled: !!serviceId,
        initialData: [],
    });

    // Obter nome do operador para o histórico
    useEffect(() => {
        keryx.auth.me().then(u => setOperatorName(u?.full_name || u?.email || "")).catch(() => {});
    }, []);

    const handleRefreshServices = async () => {
        await queryClient.invalidateQueries({ queryKey: ["services"] });
    };

    const openProjectionWindow = () => {
        return interceptWindowOpen("Abrir Projeção", () => openSharedProjection());
    };

    const openVideoWindow = () => {
        return interceptWindowOpen("Tela de Vídeo", () => {
            const videoUrl = createPageUrl("VideoProjection");
            return window.open(
                videoUrl,
                "videoProjection",
                "width=1920,height=1080,menubar=no,toolbar=no,location=no"
            );
        });
    };

    const handlePlayItem = async (item) => {
        // Normalizar formato (suporta ServiceItem com type maiúsculo/contentId e formato legado)
        const contentId = item.contentId || item.item_id;
        const rawType = (item.type || "").toLowerCase();
        const projType = rawType === "song" ? "song" : rawType === "bible" ? "bible" : "media";

        let fullItem;
        try {
            if (projType === "song") {
                fullItem = await keryx.entities.Song.get(contentId);
            } else if (projType === "bible") {
                fullItem = await keryx.entities.BiblePassage.get(contentId);
            } else if (projType === "media") {
                fullItem = await keryx.entities.Media.get(contentId);
            }
        } catch (e) {
            console.error("Erro ao buscar item:", e);
            return;
        }

        if (!fullItem) return;

        // Modo ensaio: preview local sem enviar para projeção
        if (ensaioMode) {
            if (projType === "song" || projType === "bible") {
                setRehearsal(projType === "song" ? songContent(fullItem) : passageContent(fullItem));
                setLyricPanelOpen(true);
            }
            return;
        }

        // Registar no histórico
        if (projType === "song") {
            keryx.entities.SongHistory.create({
                song_id: contentId,
                song_title: fullItem.title,
                song_artist: fullItem.artist || "",
                played_at: new Date().toISOString(),
                service_id: serviceId,
                service_title: selectedService?.title || "",
                operator_name: operatorName,
            }).catch(() => {});
            keryx.entities.Song.update(contentId, {
                play_count: (fullItem.play_count || 0) + 1,
                last_played_at: new Date().toISOString()
            }).catch(() => {});
        }

        setCurrentItemOrder(item.order ?? 0);

        // Pré-carregar conteúdo do próximo item (transição instantânea)
        const nextItem = serviceItems
            .filter(i => i.enabled !== false)
            .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
            .find(i => (i.order ?? 0) > (item.order ?? 0));
        if (nextItem?.contentId) {
            const nextType = (nextItem.type || "").toLowerCase();
            const preloadMap = { song: "Song", bible: "BiblePassage", media: "Media" };
            const entityName = preloadMap[nextType];
            if (entityName) {
                keryx.entities[entityName].get(nextItem.contentId)
                    .then(data => setPreloadedNext(data))
                    .catch(() => {});
            }
        }

        // Música com vídeo MP4: tela de vídeo e player flutuante
        if (projType === "song" && isVideoUrl(fullItem.audio_url)) {
            projection.showVideo({ kind: "video", url: fullItem.audio_url, title: fullItem.title || "" }).catch(() => {});
            setActiveVideoSong(fullItem);
        }

        // Letra e bíblia: todas as telas seguem o estado ao vivo
        const ref = { serviceItemId: item.id };
        if (projType === "song" || projType === "bible") {
            setRehearsal(null);
            setLyricPanelOpen(true);
            if (projType === "song") playSong(fullItem, ref);
            else playPassage(fullItem, ref);
        } else {
            // Mídia: a camada de mídia do projetor principal
            openSharedProjection();
            const showMedia = () => projection.showMedia({ kind: fullItem.type, url: fullItem.file_url, title: fullItem.title || "", id: fullItem.id });
            (live?.session ? showMedia() : projection.startSession(serviceId).then(showMedia))
                .catch((err) => toast({ title: "Não foi possível projetar", description: err?.message, variant: "destructive" }));
        }
    };

    const stopProjection = () => {
        // Letra, bíblia, vídeo e mídia: o estado ao vivo
        stop();
        // Limpar todos os dispositivos remotos (projetor, TV, tablet, PC)
        try {
            keryx.entities.ProjectionDevice.list().then(devices => {
                for (const device of devices) {
                    keryx.entities.ProjectionDevice.update(device.id, {
                        current_output: { content_type: "blank", title: "", slides: [], slide_index: 0 }
                    }).catch(() => {});
                }
            });
        } catch {}
        setLyricPanelOpen(false);
        setRehearsal(null);
        setActiveVideoSong(null);
    };

    const handleSubmit = (serviceData) => {
        if (editingService) {
            updateServiceMutation.mutate({ id: editingService.id, serviceData });
        } else {
            createServiceMutation.mutate(serviceData);
        }
    };

    const handleUpdate = (updatedService) => {
        if (!selectedService) return;
        updateServiceMutation.mutate({ id: selectedService.id, serviceData: updatedService });
    };

    const handleEdit = (service) => {
        setEditingService(service);
        setShowForm(true);
    };

    const handleDelete = (service) => {
        if (confirm(`Deseja realmente excluir "${service.title}"?`)) {
            deleteServiceMutation.mutate(service.id);
        }
    };

    if (serviceId) {
        if (isFetching && !selectedService) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="text-white">Carregando culto...</div>
                </div>
            );
        }
        if (!selectedService) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-background">
                    <div className="text-center">
                        <p className="text-white mb-4">Culto não encontrado</p>
                        <Button onClick={() => navigate('/Services')} variant="outline" className="border-white/15 bg-white/5 text-white hover:bg-white/10">Voltar</Button>
                    </div>
                </div>
            );
        }
        return (
            <>
                <div className="min-h-screen p-4 md:p-6 bg-background">
                    <ConnectionBanner isOnline={isOnline} />
                    <div className="max-w-7xl mx-auto">
                        <motion.div
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="flex flex-wrap justify-between items-center mb-8 gap-4"
                        >
                            <div>
                                <Button
                                    onClick={() => navigate('/Services')}
                                    variant="ghost"
                                    className="mb-3"
                                    style={{ color: colors.primary }}
                                >
                                    <ArrowLeft className="w-4 h-4 mr-2" />
                                    Voltar
                                </Button>
                                <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                                    {selectedService.title}
                                    {isLive && (
                                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-red-600 text-white animate-pulse">
                                            ● LIVE
                                        </span>
                                    )}
                                    {ensaioMode && (
                                        <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-blue-600 text-white">
                                            ENSAIO
                                        </span>
                                    )}
                                    <ServiceTimer active={isLive} startTime={live?.session?.startedAt ?? null} />
                                </h1>
                                <p className="mt-1 text-sm text-gray-500">
                                    {selectedService.date} {selectedService.time && `às ${selectedService.time}`}
                                </p>
                            </div>
                            <div className="flex gap-2 flex-wrap">
                                <Button
                                    onClick={() => setEnsaioMode(!ensaioMode)}
                                    variant="outline"
                                    className={ensaioMode ? "border-blue-500 bg-blue-600/20 text-blue-300" : "border-white/15 bg-white/5 text-white hover:bg-white/10"}
                                >
                                    <Eye className="w-4 h-4 mr-2" />
                                    {ensaioMode ? "Ensaiar" : "Modo Ensaio"}
                                </Button>
                                <Button
                                    onClick={() => exportServiceToPdf(selectedService, serviceItems)}
                                    variant="outline"
                                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                    <FileDown className="w-4 h-4 mr-2" />
                                    PDF
                                </Button>
                                <Button
                                    onClick={openProjectionWindow}
                                    className="text-white"
                                    style={{ background: colors.primary }}
                                >
                                    <Maximize2 className="w-4 h-4 mr-2" />
                                    Abrir Projeção
                                </Button>
                                <Button
                                    onClick={openVideoWindow}
                                    variant="outline"
                                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                    🎥 Tela de Vídeo
                                </Button>
                                <Button
                                    onClick={() => setShowObs(!showObs)}
                                    variant="outline"
                                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                    📡 OBS
                                </Button>
                                <QrCodePanel songTitle={live?.content?.title} />
                                <Button
                                    onClick={stopProjection}
                                    variant="destructive"
                                    className="bg-red-600 hover:bg-red-700 text-white"
                                >
                                    <Square className="w-4 h-4 mr-2" />
                                    Parar Projeção
                                </Button>
                            </div>
                        </motion.div>

                        {showObs && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: "auto" }}
                                exit={{ opacity: 0, height: 0 }}
                                className="mb-6"
                            >
                                <ObsIntegration />
                            </motion.div>
                        )}

                        <ServiceItemManager
                            service={selectedService}
                            onPlayItem={handlePlayItem}
                        />

                        {currentItemOrder !== null && (() => {
                            const nextItem = serviceItems
                                .filter(i => i.enabled !== false)
                                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                                .find(i => (i.order ?? 0) > currentItemOrder);
                            if (!nextItem) return null;
                            return (
                                <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 px-4 py-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/20 text-white text-sm flex items-center gap-2 shadow-lg">
                                    <span className="text-gray-400">Próximo:</span>
                                    <span className="font-medium truncate max-w-[200px]">{nextItem.title}</span>
                                </div>
                            );
                        })()}
                    </div>
                </div>

                {activeVideoSong && (
                    <VideoPlayerPanel
                        song={activeVideoSong}
                        onClose={() => setActiveVideoSong(null)}
                        onSendToProjection={(song) => playSong(song)}
                    />
                )}
                {lyricPanelOpen && (
                    <LyricPlayerPanel rehearsal={rehearsal} onClose={() => { setLyricPanelOpen(false); setRehearsal(null); }} />
                )}
                <RemoteProjectionDialog
                    open={remoteDialogOpen}
                    onClose={() => setRemoteDialogOpen(false)}
                    title={remoteDialogTitle}
                />
            </>
        );
    }

    return (
    <div className="min-h-screen p-4 md:p-6 bg-background">
        <ConnectionBanner isOnline={isOnline} />
        <div className="max-w-7xl mx-auto">
            <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-wrap justify-between items-center mb-8 gap-4"
        >
            <div>
                <h1 className="text-2xl md:text-3xl font-bold text-white flex items-center gap-3">
                    <Calendar className="w-7 h-7" style={{ color: colors.primary }} />
                        Cultos da Semana
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">Organize e prepare seus cultos</p>
                </div>
                <Button
                    onClick={() => {
                        setEditingService(null);
                        setShowForm(true);
                    }}
                    className="text-white"
                    style={{ background: colors.primary }}
                >
                    <Plus className="w-4 h-4 mr-2" />
                    Novo Culto
                </Button>
            </motion.div>

                <AnimatePresence>
                    {showForm && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="mb-6"
                        >
                            <ServiceForm
                                key={editingService?.id || "new"}
                                service={editingService}
                                onSubmit={handleSubmit}
                                onCancel={() => {
                                    setShowForm(false);
                                    setEditingService(null);
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {isLoading ? (
                    <div className="text-center py-12" style={{ color: colors.primary }}>
                        Carregando cultos...
                    </div>
                ) : services.length === 0 ? (
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-center py-12"
                    >
                        <div className="text-6xl mb-4">📅</div>
                        <h3 className="text-2xl font-semibold text-white mb-2">
                            Nenhum culto planejado
                        </h3>
                        <p style={{ color: colors.primary }}>
                            Crie um novo culto para começar a organizar
                        </p>
                    </motion.div>
                ) : (
                    <ServiceList
                        services={services}
                        onView={(service) => navigate(`/Services/${service.id}`)}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onRefresh={handleRefreshServices}
                    />
                )}
            </div>
            <RemoteProjectionDialog
                open={remoteDialogOpen}
                onClose={() => setRemoteDialogOpen(false)}
                title={remoteDialogTitle}
            />
            <WorshipChat />
        </div>
    );
}