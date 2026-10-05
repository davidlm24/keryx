import React, { useState, useEffect, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Plus, Maximize2, Search, Heart, Monitor, Square, Video, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { createPageUrl } from "@/utils";
import { openProjectionWindow as openSharedProjection, sendToProjection as sendToSharedProjection } from "@/lib/projectionWindow";

import SongList from "../components/projection/SongList";
import SongForm from "../components/projection/SongForm";
import SongDatabase from "../components/projection/SongDatabase";
import PreviewPanel from "../components/projection/PreviewPanel";
import OverlayManager from "../components/projection/OverlayManager";
import UnifiedSearch from "../components/projection/UnifiedSearch";

import VideoPlayerPanel from "../components/projection/VideoPlayerPanel";
import YouTubeProjectionPanel from "../components/projection/YouTubeProjectionPanel";
import LyricPlayerPanel from "../components/projection/LyricPlayerPanel";
import { Youtube } from "lucide-react";
import ProjectionTools from "../components/projection/ProjectionTools";
import RemoteProjectionDialog from "../components/projection/RemoteProjectionDialog";
import { useThemeColors } from "@/hooks/useThemeColors";
import { useIsMobileDevice } from "@/hooks/useIsMobileDevice";
import { useOnlineStatus } from "@/hooks/useOnlineStatus";
import ConnectionBanner from "@/components/ConnectionBanner";
import { cleanupOrphanSessions } from "@/utils/sessionCleanup";
import { cacheItem, uncacheItem } from "@/hooks/useOfflineCache";
import { generateSlides as generateSectionSlides } from "@/utils/songSections";

export default function Home() {
    const [showForm, setShowForm] = useState(false);
    const [editingSong, setEditingSong] = useState(null);
    const [videoWindow, setVideoWindow] = useState(null);
    const [selectedArtist, setSelectedArtist] = useState("all");
    const [selectedLetter, setSelectedLetter] = useState(null);
    const [searchText, setSearchText] = useState("");
    const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
    const [remoteDialogOpen, setRemoteDialogOpen] = useState(false);
    const [remoteDialogTitle, setRemoteDialogTitle] = useState("");
    const isMobileDevice = useIsMobileDevice();
    const isOnline = useOnlineStatus();
    const colors = useThemeColors();
    const queryClient = useQueryClient();
    const [operatorName, setOperatorName] = useState("");
    const [visibleCount, setVisibleCount] = useState(30);

    const interceptWindowOpen = (title, action) => {
        if (isMobileDevice) {
            setRemoteDialogTitle(title);
            setRemoteDialogOpen(true);
            return null;
        }
        return action();
    };

    const { data: songs, isLoading } = useQuery({
        queryKey: ["songs"],
        queryFn: () => base44.entities.Song.list("title"),
        initialData: () => {
            try { return JSON.parse(localStorage.getItem("oc_songs") || "[]"); } catch { return []; }
        },
    });

    // Persistir músicas no cache offline quando carregadas do servidor
    useEffect(() => {
        if (songs?.length && isOnline) {
            localStorage.setItem("oc_songs", JSON.stringify(songs));
        }
    }, [songs, isOnline]);

    const filteredSongs = useMemo(() => {
        let result = [...songs];
        if (selectedArtist !== "all") result = result.filter(s => s.artist === selectedArtist);
        else if (selectedLetter) result = result.filter(s => {
            const a = s.artist || "";
            const l = (a[0] || "#").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return (/[A-Z]/.test(l) ? l : "#") === selectedLetter;
        });
        if (showFavoritesOnly) result = result.filter(s => s.is_favorite);
        if (searchText.trim()) {
            const q = searchText.toLowerCase();
            result = result.filter(s =>
                s.title?.toLowerCase().includes(q) ||
                s.artist?.toLowerCase().includes(q) ||
                s.lyrics?.toLowerCase().includes(q)
            );
        }
        return result.sort((a, b) => (a.title || "").localeCompare(b.title || "", "pt", { sensitivity: "base" }));
    }, [songs, selectedArtist, selectedLetter, searchText, showFavoritesOnly]);

    const toggleFavoriteMutation = useMutation({
        mutationFn: ({ id, isFav }) => base44.entities.Song.update(id, { is_favorite: isFav }),
        onMutate: async ({ id, isFav }) => {
            await queryClient.cancelQueries({ queryKey: ["songs"] });
            const previous = queryClient.getQueryData(["songs"]);
            queryClient.setQueryData(["songs"], (old) =>
                old.map((s) => (s.id === id ? { ...s, is_favorite: isFav } : s))
            );
            return { previous };
        },
        onError: (_err, _vars, ctx) => ctx?.previous && queryClient.setQueryData(["songs"], ctx.previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["songs"] }),
    });

    const handleToggleFavorite = (song) => {
        toggleFavoriteMutation.mutate({ id: song.id, isFav: !song.is_favorite });
    };

    const createSongMutation = useMutation({
        mutationFn: (songData) => base44.entities.Song.create(songData),
        onMutate: async (songData) => {
            await queryClient.cancelQueries({ queryKey: ["songs"] });
            const previous = queryClient.getQueryData(["songs"]);
            const tempId = `temp-${Date.now()}`;
            queryClient.setQueryData(["songs"], (old) => [...old, { ...songData, id: tempId, slides: songData.slides || [], is_favorite: false, play_count: 0 }]);
            setShowForm(false);
            setEditingSong(null);
            return { previous, tempId };
        },
        onError: (error, _vars, ctx) => {
            ctx?.previous && queryClient.setQueryData(["songs"], ctx.previous);
            setShowForm(true);
            alert("Erro ao criar música: " + error.message);
        },
        onSettled: (data) => {
            if (data) cacheItem("songs", data);
            queryClient.invalidateQueries({ queryKey: ["songs"] });
        },
    });

    const updateSongMutation = useMutation({
        mutationFn: ({ id, songData }) => base44.entities.Song.update(id, songData),
        onMutate: async ({ id, songData }) => {
            await queryClient.cancelQueries({ queryKey: ["songs"] });
            const previous = queryClient.getQueryData(["songs"]);
            queryClient.setQueryData(["songs"], (old) =>
                old.map((s) => (s.id === id ? { ...s, ...songData } : s))
            );
            setShowForm(false);
            setEditingSong(null);
            return { previous };
        },
        onError: (error, _vars, ctx) => {
            ctx?.previous && queryClient.setQueryData(["songs"], ctx.previous);
            setShowForm(true);
            alert("Erro ao atualizar música: " + error.message);
        },
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["songs"] }),
    });

    const deleteSongMutation = useMutation({
        mutationFn: (id) => base44.entities.Song.delete(id),
        onMutate: async (id) => {
            await queryClient.cancelQueries({ queryKey: ["songs"] });
            const previous = queryClient.getQueryData(["songs"]);
            queryClient.setQueryData(["songs"], (old) => old.filter((s) => s.id !== id));
            return { previous };
        },
        onError: (_err, _vars, ctx) => ctx?.previous && queryClient.setQueryData(["songs"], ctx.previous),
        onSettled: (_data, id) => {
            uncacheItem("songs", id);
            queryClient.invalidateQueries({ queryKey: ["songs"] });
        },
    });

    const deleteAllSongsMutation = useMutation({
        mutationFn: async (songsList) => {
            for (const song of songsList) {
                await base44.entities.Song.delete(song.id);
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        },
        onMutate: async (songsList) => {
            await queryClient.cancelQueries({ queryKey: ["songs"] });
            const previous = queryClient.getQueryData(["songs"]);
            queryClient.setQueryData(["songs"], []);
            return { previous };
        },
        onError: (_err, _vars, ctx) => ctx?.previous && queryClient.setQueryData(["songs"], ctx.previous),
        onSettled: () => queryClient.invalidateQueries({ queryKey: ["songs"] }),
    });

    const handleRefreshSongs = async () => {
        await queryClient.invalidateQueries({ queryKey: ["songs"] });
    };

    const handleSubmit = (songData) => {
        console.log("Submetendo música:", songData);
        
        if (!songData.title || !songData.lyrics) {
            alert("Preencha o título e a letra da música");
            return;
        }
        
        if (editingSong) {
            updateSongMutation.mutate({ id: editingSong.id, songData });
        } else {
            createSongMutation.mutate(songData);
        }
    };



    const [activeVideoSong, setActiveVideoSong] = useState(null);
    const [activeYouTube, setActiveYouTube] = useState(false);
    const [activeLyricSong, setActiveLyricSong] = useState(null);
    const [activeLyricSyncId, setActiveLyricSyncId] = useState(null);
    const [liveSessionId, setLiveSessionId] = useState(null);
    const [stageWindow, setStageWindow] = useState(null);
    const [previewContent, setPreviewContent] = useState(null);
    const [overlays, setOverlays] = useState([]);
    const { data: projectionDevices } = useQuery({ queryKey: ["projectionDevices"], queryFn: () => base44.entities.ProjectionDevice.list(), initialData: [] });

    // Obter nome do operador + limpar sessões órfãs no arranque
    useEffect(() => {
        base44.auth.me().then(u => setOperatorName(u?.full_name || u?.email || "")).catch(() => {});
        cleanupOrphanSessions();
    }, []);

    // Reset paginação quando filtros mudam
    useEffect(() => { setVisibleCount(30); }, [searchText, selectedArtist, selectedLetter, showFavoritesOnly]);

    // Avisar ao fechar com sessão ativa
    useEffect(() => {
        if (!liveSessionId) return;
        const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
        window.addEventListener("beforeunload", handler);
        return () => window.removeEventListener("beforeunload", handler);
    }, [liveSessionId]);

    // Atalho: Esc para parar projeção
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === "Escape" && liveSessionId) { e.preventDefault(); stopProjection(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [liveSessionId]);

    // Atualizar overlays na projeção ativa em tempo real
    useEffect(() => {
        if (activeLyricSyncId && overlays) {
            base44.entities.LyricSync.update(activeLyricSyncId, { overlays }).catch(() => {});
        }
    }, [overlays, activeLyricSyncId]);

    const openProjectionWindow = () => {
        return interceptWindowOpen("Letra para Tablet", () => openSharedProjection());
    };

    const openVideoWindow = () => {
        return interceptWindowOpen("Tela de Vídeo", () => {
            const videoUrl = createPageUrl("VideoProjection");
            const newWindow = window.open(
                videoUrl,
                "videoProjection",
                "width=1920,height=1080,menubar=no,toolbar=no,location=no"
            );
            setVideoWindow(newWindow);
            return newWindow;
        });
    };

    const openStageWindow = () => {
        return interceptWindowOpen("Palco", () => {
            const stageUrl = createPageUrl("StageView");
            const newWindow = window.open(
                stageUrl,
                "stageView",
                "width=1280,height=720,menubar=no,toolbar=no,location=no"
            );
            setStageWindow(newWindow);
            return newWindow;
        });
    };

    const handlePlay = async (song) => {
        // Enviar letra para o projetor (janela única partilhada)
        sendToProjection(song);

        // Registar no histórico
        try {
            await base44.entities.SongHistory.create({
                song_id: song.id,
                song_title: song.title,
                song_artist: song.artist || "",
                played_at: new Date().toISOString(),
                operator_name: operatorName,
            });
            await base44.entities.Song.update(song.id, {
                play_count: (song.play_count || 0) + 1,
                last_played_at: new Date().toISOString()
            });
            queryClient.invalidateQueries({ queryKey: ["songs"] });
        } catch (e) {
            console.error("Erro ao registar histórico:", e);
        }

        // Mostrar player de letra sempre
        setActiveLyricSong(song);

        // Atualizar pré-visualização
        setPreviewContent({
            type: "lyrics",
            title: song.title,
            slides: song.slides?.length ? song.slides : generateSectionSlides(song.lyrics),
            slide_index: 0,
            text_color: song.text_color || "#ffffff",
            text_color_2: song.text_color_2 || "",
            background_image: song.background_image || "",
            font_size: song.font_size || "large",
            font_family: song.font_family || "sans",
            text_effect: song.text_effect || "shadow",
        });

        // Enviar letra para tablet remoto via LyricSync (como o VideoSync faz para vídeos)
        try {
            const lyricRecord = await base44.entities.LyricSync.create({
                song_title: song.title,
                artist: song.artist || "",
                slides: song.slides?.length ? song.slides : generateSectionSlides(song.lyrics),
                slide_index: 0,
                text_color: song.text_color || "#ffffff",
                text_color_2: song.text_color_2 || "",
                background_image: song.background_image || "",
                font_size: song.font_size || "large",
                font_family: song.font_family || "sans",
                text_effect: song.text_effect || "shadow",
                overlays,
                status: "active",
                timestamp: Date.now()
            });
            setActiveLyricSyncId(lyricRecord.id);
            // Limpar registos antigos em segundo plano
            base44.entities.LyricSync.list().then(oldRecords => {
                for (const old of oldRecords) {
                    if (old.id !== lyricRecord.id && Date.now() - old.timestamp > 10000) {
                        base44.entities.LyricSync.delete(old.id).catch(() => {});
                    }
                }
            }).catch(() => {});
        } catch (error) {
            console.error("Erro ao sincronizar letra para tablet:", error);
        }

        // Atualizar LiveSession
        try {
            if (!liveSessionId) {
                const session = await base44.entities.LiveSession.create({
                    status: "active",
                    currentItemId: song.id,
                    currentSlideIndex: 0,
                    startedAt: Date.now(),
                    channel: crypto?.randomUUID?.() || `ch-${Date.now()}`
                });
                setLiveSessionId(session.id);
            } else {
                await base44.entities.LiveSession.update(liveSessionId, {
                    currentItemId: song.id,
                    currentSlideIndex: 0
                });
            }
        } catch (e) {
            console.error("Erro ao atualizar LiveSession:", e);
        }

        // Mostrar player interno se tiver vídeo MP4
        if (song.audio_url && (song.audio_url.includes('.mp4') || song.audio_url.includes('video') || song.audio_url.startsWith('data:video'))) {
            setActiveVideoSong(song);
        }

        // Enviar vídeo para dispositivo remoto (se tiver audio_url que seja vídeo)
        if (song.audio_url && (song.audio_url.includes('.mp4') || song.audio_url.includes('video') || song.audio_url.startsWith('data:video'))) {
            console.log("Enviando vídeo para dispositivo:", song.audio_url);

            try {
                // Criar novo registro PRIMEIRO para a tablet receber instantaneamente
                await base44.entities.VideoSync.create({
                    video_url: song.audio_url,
                    title: song.title,
                    timestamp: Date.now(),
                    status: "active"
                });
                // Limpar vídeos antigos em segundo plano (não bloqueia a notificação)
                base44.entities.VideoSync.list().then(oldVideos => {
                    for (const old of oldVideos) {
                        if (Date.now() - old.timestamp > 10000) {
                            base44.entities.VideoSync.delete(old.id).catch(() => {});
                        }
                    }
                }).catch(() => {});
            } catch (error) {
                console.error("Erro ao sincronizar vídeo:", error);
            }

            // Também enviar para janela local se existir
            if (videoWindow && !videoWindow.closed) {
                videoWindow.postMessage({
                    type: "VIDEO_DATA",
                    videoUrl: song.audio_url,
                    title: song.title
                }, "*");
                videoWindow.focus();
            }
        }
    };

    const sendToProjection = (song) => {
        console.log("Sending to projection:", song);

        // Se o audio_url for vídeo, não enviar para a projeção de letra
        const isVideo = song.audio_url && (song.audio_url.includes('.mp4') || song.audio_url.includes('video') || song.audio_url.startsWith('data:video'));

        const payload = {
            type: "PROJECTION_DATA",
            title: song.title,
            artist: song.artist || "",
            slides: song.slides?.length ? song.slides : generateSectionSlides(song.lyrics),
            audio_url: isVideo ? null : (song.audio_url || null),
            background_image: song.background_image || null,
            font_size: song.font_size || "large",
            font_family: song.font_family || "sans",
            text_effect: song.text_effect || "shadow",
            text_color: song.text_color || "#ffffff",
            text_color_2: song.text_color_2 || "",
            song_key: song.song_key || "",
            bpm: song.bpm || null,
            chords: song.chords || "",
            musician_notes: song.musician_notes || "",
        };

        // Janela única de projeção (abre-a se ainda não existir)
        sendToSharedProjection(payload);

        // Enviar também para o Stage View (monitor do palco)
        if (stageWindow && !stageWindow.closed) {
            stageWindow.postMessage(payload, "*");
        }

        // Sincronizar com dispositivo projetor do ProjectionManager (para TVs/tablets remotas)
        const projectorDevice = projectionDevices?.[0];
        if (projectorDevice) {
            const slides = song.slides?.length ? song.slides : generateSectionSlides(song.lyrics);
            base44.entities.ProjectionDevice.update(projectorDevice.id, {
                current_output: { content_type: "lyrics", title: song.title, slides, slide_index: 0, background_image: song.background_image || "" }
            }).catch(() => {});
        }
    };

    const stopProjection = () => {
        // Parar projeção de letras/bíblia (janela única partilhada)
        sendToSharedProjection({ type: "STOP_PROJECTION" });
        sendToSharedProjection({ type: "PROJECTION_TOOL", mode: "stop" });
        // Parar stage view
        if (stageWindow && !stageWindow.closed) {
            stageWindow.postMessage({ type: "STOP_PROJECTION" }, "*");
        }
        // Parar vídeo local
        if (videoWindow && !videoWindow.closed) {
            videoWindow.postMessage({ type: "VIDEO_STOP" }, "*");
        }
        // Parar vídeos remotos (marcar como played e enviar stop)
        try {
            base44.entities.VideoSync.list().then(videos => {
                for (const v of videos) {
                    if (v.status === "active") base44.entities.VideoSync.update(v.id, { status: "played" }).catch(() => {});
                }
            });
        } catch {}
        // Limpar todos os dispositivos remotos (projetor, TV, tablet, PC)
        if (projectionDevices && projectionDevices.length > 0) {
            for (const device of projectionDevices) {
                base44.entities.ProjectionDevice.update(device.id, {
                    current_output: { content_type: "blank", title: "", slides: [], slide_index: 0 }
                }).catch(() => {});
            }
        }
        // Parar projeção de letra no tablet remoto
        try {
            base44.entities.LyricSync.list().then(records => {
                for (const r of records) {
                    if (r.status === "active") base44.entities.LyricSync.update(r.id, { status: "stopped" }).catch(() => {});
                }
            });
        } catch {}
        // Encerrar LiveSession
        if (liveSessionId) {
            base44.entities.LiveSession.update(liveSessionId, {
                status: "ended",
                endedAt: Date.now()
            }).then(() => setLiveSessionId(null)).catch(() => {});
        }
        // Limpar players internos
        setActiveLyricSong(null);
        setActiveVideoSong(null);
        setActiveLyricSyncId(null);
    };

    const handleSlideChange = (idx) => {
        if (liveSessionId) {
            base44.entities.LiveSession.update(liveSessionId, { currentSlideIndex: idx }).catch(() => {});
        }
    };

    const handleEdit = (song) => {
        setEditingSong(song);
        setShowForm(true);
    };

    const handleDelete = (song) => {
        if (confirm(`Deseja realmente excluir "${song.title}"?`)) {
            deleteSongMutation.mutate(song.id);
        }
    };

    const handleDeleteAll = () => {
        if (confirm(`Deseja realmente apagar TODAS as ${songs.length} músicas? Esta ação não pode ser desfeita!`)) {
            deleteAllSongsMutation.mutate(songs);
        }
    };

    const handlePrint = (song) => {
        const win = window.open("", "_blank", "width=800,height=900");
        if (!win) return;
        const slides = song.slides?.length ? song.slides : generateSectionSlides(song.lyrics);
        win.document.write(`
            <html><head><title>${song.title} - ${song.artist || ""}</title>
            <style>
                body { font-family: Georgia, serif; max-width: 700px; margin: 40px auto; padding: 20px; color: #1a1a1a; line-height: 1.8; }
                h1 { font-size: 28px; margin-bottom: 4px; color: #7d8470; }
                .artist { font-size: 16px; color: #6b7280; margin-bottom: 24px; }
                .meta { font-size: 13px; color: #9ca3af; margin-bottom: 20px; }
                .slide { margin-bottom: 24px; page-break-inside: avoid; }
                .slide p { font-size: 18px; white-space: pre-wrap; }
                .chorus-label { font-size: 12px; font-weight: bold; color: #d97706; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 4px; }
                .chorus p { font-style: italic; }
                .footer { margin-top: 40px; border-top: 1px solid #e5e7eb; padding-top: 12px; font-size: 12px; color: #9ca3af; text-align: center; }
            </style></head><body>
            <h1>${song.title}</h1>
            <div class="artist">${song.artist || "Artista desconhecido"}</div>
            <div class="meta">
                ${song.song_key ? `Tom: ${song.song_key} | ` : ""}
                ${song.bpm ? `BPM: ${song.bpm} | ` : ""}
                ${song.category ? `Categoria: ${song.category} | ` : ""}
                ${slides.length} slide(s)
            </div>
            ${slides.map(s => `
                <div class="slide ${s.is_chorus ? "chorus" : ""}">
                    ${s.is_chorus ? '<div class="chorus-label">♪ Refrão</div>' : ""}
                    <p>${(s.text || "").replace(/</g, "&lt;")}</p>
                </div>
            `).join("")}
            <div class="footer">KERYX — ${new Date().toLocaleDateString("pt-PT")}</div>
            </body></html>
        `);
        win.document.close();
        setTimeout(() => win.print(), 300);
    };

    return (
        <div className="mc-page p-3 md:p-6 min-h-screen bg-background">
            <ConnectionBanner isOnline={isOnline} />
            <div className="mc-panel max-w-7xl mx-auto">
                <aside className="mc-side">
                    <div className="mc-side-sticky">
                        <div className="mc-brand">
                            <strong>KERYX</strong>
                            {liveSessionId && <span className="mc-live">LIVE</span>}
                        </div>
                        <button className="mc-control" onClick={() => window.location.href = createPageUrl("GlobalSearch")}>
                            <Search />
                            Busca Global
                        </button>
                        <SongDatabase songs={songs} />
                        <button className="mc-control mc-primary" onClick={openProjectionWindow}>
                            <Maximize2 />
                            Letra para Tablet
                        </button>
                        <button className="mc-control" onClick={openVideoWindow}>
                            <Video />
                            Tela de Vídeo
                        </button>
                        <button className="mc-control" onClick={() => setActiveYouTube(true)}>
                            <Youtube />
                            YouTube
                        </button>
                        <button className="mc-control" onClick={openStageWindow}>
                            <Monitor />
                            Palco
                        </button>
                        <button className="mc-control mc-danger" onClick={stopProjection}>
                            <Square />
                            Parar Projeção
                        </button>
                        <button className="mc-control mc-accent" onClick={() => { setEditingSong(null); setShowForm(true); }}>
                            <Plus />
                            Nova Música
                        </button>
                        {songs.length > 0 && (
                            <button className="mc-control mc-danger" onClick={handleDeleteAll} disabled={deleteAllSongsMutation.isPending}>
                                <Trash2 />
                                Apagar Todas
                            </button>
                        )}
                    </div>
                </aside>
                <div className="mc-main">
                    <div className="mc-topline">
                        <span className="mc-title">Músicas</span>
                    </div>
                    <label className="mc-searchbox">
                        <Search />
                        <input
                            aria-label="Pesquisar por título ou artista..."
                            placeholder="Pesquisar por título ou artista..."
                            value={searchText}
                            onChange={(e) => setSearchText(e.target.value)}
                        />
                    </label>
                    <div className="mc-filters">
                        <button
                            className={`mc-chip ${selectedArtist === "all" && !selectedLetter ? "mc-active" : ""}`}
                            onClick={() => { setSelectedArtist("all"); setSelectedLetter(null); }}
                        >
                            Todos
                        </button>
                        <button
                            className={`mc-chip mc-fav ${showFavoritesOnly ? "mc-active" : ""}`}
                            onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                        >
                            <Heart />
                            Favoritos
                        </button>
                    </div>
                    <div className="mc-divider"></div>
                    <div>
                <div className="space-y-4 mb-6">
                    <UnifiedSearch
                        songs={songs}
                        onSelectSong={handlePlay}
                        onSelectVerse={(verseData) => setPreviewContent({ type: "bible", ...verseData })}
                    />
                    {previewContent && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Pré-visualização</span>
                                {previewContent.type === "lyrics" && (
                                    <Button
                                        onClick={() => {
                                            const song = songs.find(s => s.title === previewContent.title);
                                            if (song) handlePlay(song);
                                        }}
                                        size="sm"
                                        className="text-white"
                                        style={{ background: colors.primary }}
                                    >
                                        <Maximize2 className="w-3.5 h-3.5 mr-1.5" />
                                        Projetar
                                    </Button>
                                )}
                            </div>
                            <PreviewPanel content={previewContent} overlays={overlays} />
                            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
                                <OverlayManager overlays={overlays} onChange={setOverlays} />
                            </div>
                        </div>
                    )}
                    <ProjectionTools />
                </div>

                <AnimatePresence>
                    {showForm && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="mb-6"
                        >
                            <SongForm
                                song={editingSong}
                                onSubmit={handleSubmit}
                                onCancel={() => {
                                    setShowForm(false);
                                    setEditingSong(null);
                                }}
                            />
                        </motion.div>
                    )}
                </AnimatePresence>

                {isLoading ? (
                    <div className="text-center py-12" style={{ color: colors.primary }}>
                        Carregando músicas...
                    </div>
                ) : songs.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                        <div className="text-6xl mb-4">🎵</div>
                        <h3 className="text-2xl font-semibold text-white mb-2">Nenhuma música cadastrada</h3>
                        <p style={{ color: colors.primary }}>Adicione músicas ou busque online para começar</p>
                    </motion.div>
                ) : filteredSongs.length === 0 ? (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-12">
                        <div className="text-4xl mb-4">🔍</div>
                        <p className="text-gray-400">Nenhuma música encontrada para "{searchText}"</p>
                        <button onClick={() => setSearchText("")} className="mt-2 text-sm underline" style={{ color: colors.primary }}>Limpar pesquisa</button>
                    </motion.div>
                ) : (
                    <>
                        <SongList
                            songs={filteredSongs.slice(0, visibleCount)}
                            onPlay={handlePlay}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onToggleFavorite={handleToggleFavorite}
                            onPrint={handlePrint}
                            onRefresh={handleRefreshSongs}
                        />
                        {filteredSongs.length > visibleCount && (
                            <div className="text-center mt-4">
                                <Button
                                    onClick={() => setVisibleCount(visibleCount + 30)}
                                    variant="outline"
                                    className="border-white/15 bg-white/5 text-white hover:bg-white/10"
                                >
                                    Carregar mais ({filteredSongs.length - visibleCount} restantes)
                                </Button>
                            </div>
                        )}
                    </>
                )}
                    </div>
                </div>
                <nav className="mc-alphabet">
                    <div className="mc-alphabet-sticky">
                        {(() => {
                            const allArtists = [...new Set(songs.map(s => s.artist).filter(Boolean))];
                            const lettersWithArtists = new Set(allArtists.map(a => {
                                const l = (a[0] || "#").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                                return /[A-Z]/.test(l) ? l : "#";
                            }));
                            return ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","#"]
                                .filter(l => lettersWithArtists.has(l))
                                .map(letter => (
                                    <button
                                        key={letter}
                                        className={`mc-letter ${selectedLetter === letter ? "mc-selected" : ""}`}
                                        onClick={() => { setSelectedLetter(selectedLetter === letter ? null : letter); setSelectedArtist("all"); }}
                                    >
                                        {letter}
                                    </button>
                                ));
                        })()}
                    </div>
                </nav>
            </div>
            {activeVideoSong && (
                <VideoPlayerPanel
                    song={activeVideoSong}
                    videoWindow={videoWindow}
                    onClose={() => setActiveVideoSong(null)}
                    onSendToProjection={(s) => {
                        sendToProjection(s);
                    }}
                />
            )}
            {activeYouTube && (
                <YouTubeProjectionPanel onClose={() => setActiveYouTube(false)} />
            )}
            {activeLyricSong && (
                <LyricPlayerPanel
                    song={activeLyricSong}
                    stageWindow={stageWindow}
                    lyricSyncId={activeLyricSyncId}
                    onSlideChange={handleSlideChange}
                    onClose={() => setActiveLyricSong(null)}
                />
            )}
            <RemoteProjectionDialog
                open={remoteDialogOpen}
                onClose={() => setRemoteDialogOpen(false)}
                title={remoteDialogTitle}
            />
        </div>
    );
}