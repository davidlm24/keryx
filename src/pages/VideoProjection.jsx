import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { keryx } from "@/api/keryxClient";
import { useLiveSessionChannel } from "@/hooks/useLiveSessionChannel";
import { useProjectionReconnect } from "@/hooks/useProjectionReconnect";
import { isYouTubeUrl, getYouTubeId } from "@/utils/youtube";

export default function VideoProjection() {
    const [videoUrl, setVideoUrl] = useState("");
    const [title, setTitle] = useState("");
    const [fullscreenRequested, setFullscreenRequested] = useState(false);
    const videoRef = useRef(null);
    const ytPlayerRef = useRef(null);
    const ytContainerRef = useRef(null);
    const lastControlId = useRef(null);
    const channelRef = useLiveSessionChannel();

    const isYouTube = isYouTubeUrl(videoUrl);

    // Reconexão automática
    useProjectionReconnect((rec) => {
        if (rec && rec.status === "active") {
            setVideoUrl(rec.video_url);
            setTitle(rec.title || "");
        }
    }, "VideoSync");

    // Load YouTube IFrame API once
    useEffect(() => {
        if (!window.YT) {
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(tag);
        }
    }, []);

    // Initialize YouTube player when a YouTube URL arrives
    useEffect(() => {
        if (!isYouTube || !videoUrl || !window.YT || !ytContainerRef.current) return;

        const createPlayer = () => {
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.loadVideoById(getYouTubeId(videoUrl)); } catch (e) {}
                return;
            }
            ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
                videoId: getYouTubeId(videoUrl),
                playerVars: { autoplay: 1, controls: 1, modestbranding: 1, rel: 0, playsinline: 1 },
                events: {
                    onReady: (e) => { e.target.playVideo(); },
                },
            });
        };

        if (window.YT && window.YT.Player) {
            createPlayer();
        } else {
            // Wait for API to load
            const checkInterval = setInterval(() => {
                if (window.YT && window.YT.Player) {
                    clearInterval(checkInterval);
                    createPlayer();
                }
            }, 200);
            return () => clearInterval(checkInterval);
        }
    }, [isYouTube, videoUrl]);

    // Cleanup YouTube player when URL clears
    useEffect(() => {
        if (!videoUrl && ytPlayerRef.current) {
            try { ytPlayerRef.current.destroy(); } catch (e) {}
            ytPlayerRef.current = null;
        }
    }, [videoUrl]);

    useEffect(() => {
        const initLastId = async () => {
            try {
                const existing = await keryx.entities.VideoControl.list('-timestamp', 1);
                if (existing.length > 0) lastControlId.current = existing[0].id;
            } catch (e) {}
        };
        initLastId();

        const unsubVideo = keryx.entities.VideoSync.subscribe((event) => {
            if (event.type === 'create' || event.type === 'update') {
                const v = event.data;
                if (v.status === "active") {
                    setVideoUrl(v.video_url);
                    setTitle(v.title || "");
                    keryx.entities.VideoSync.update(v.id, { status: "played" }).catch(() => {});
                }
            }
        });

        const unsubControl = keryx.entities.VideoControl.subscribe((event) => {
            if (event.type !== 'create') return;
            const cmd = event.data;
            if (cmd.id === lastControlId.current) return;
            lastControlId.current = cmd.id;

            // YouTube controls
            if (isYouTube && ytPlayerRef.current) {
                try {
                    if (cmd.action === "play") ytPlayerRef.current.playVideo();
                    if (cmd.action === "pause") ytPlayerRef.current.pauseVideo();
                    if (cmd.action === "seek" && cmd.time !== undefined) ytPlayerRef.current.seekTo(cmd.time, true);
                    if (cmd.action === "volume" && cmd.volume !== undefined) ytPlayerRef.current.setVolume(Math.round(cmd.volume * 100));
                    if (cmd.action === "fullscreen") {
                        const el = document.documentElement;
                        if (el.requestFullscreen) el.requestFullscreen().catch(() => setFullscreenRequested(true));
                        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                        else setFullscreenRequested(true);
                    }
                    return;
                } catch (e) {}
            }

            // HTML5 video controls
            const vid = videoRef.current;
            if (cmd.action === "play" && vid) vid.play().catch(() => {});
            if (cmd.action === "pause" && vid) vid.pause();
            if (cmd.action === "seek" && vid && cmd.time !== undefined) vid.currentTime = cmd.time;
            if (cmd.action === "volume" && vid && cmd.volume !== undefined) vid.volume = cmd.volume;
            if (cmd.action === "fullscreen") {
                const el = document.documentElement;
                if (el.requestFullscreen) el.requestFullscreen().catch(() => setFullscreenRequested(true));
                else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                else setFullscreenRequested(true);
            }
        });

        const unsubLive = keryx.entities.LiveSession.subscribe((event) => {
            if (event.type === 'create' && event.data?.status === "active" && !channelRef.current) {
                channelRef.current = event.data.channel;
            }
            if ((event.type === 'create' || event.type === 'update') && event.data?.status === "ended") {
                if (!channelRef.current || event.data.channel === channelRef.current) {
                    setVideoUrl("");
                    setTitle("");
                }
            }
        });

        const fetchInitial = async () => {
            try {
                const [videos, controls] = await Promise.all([
                    keryx.entities.VideoSync.list('-timestamp', 1),
                    keryx.entities.VideoControl.list('-timestamp', 1)
                ]);
                if (videos.length > 0 && videos[0].status === "active") {
                    setVideoUrl(videos[0].video_url);
                    setTitle(videos[0].title || "");
                    keryx.entities.VideoSync.update(videos[0].id, { status: "played" }).catch(() => {});
                }
                if (controls.length > 0) lastControlId.current = controls[0].id;
            } catch (e) {}
        };
        fetchInitial();

        const handleMessage = (event) => {
            if (event.data.type === "VIDEO_DATA") {
                setVideoUrl(event.data.videoUrl);
                setTitle(event.data.title || "");
            }
            if (event.data.type === "VIDEO_STOP") {
                setVideoUrl("");
                setTitle("");
            }
            if (event.data.type === "VIDEO_CONTROL") {
                if (isYouTube && ytPlayerRef.current) {
                    try {
                        const { action, time, volume } = event.data;
                        if (action === "play") ytPlayerRef.current.playVideo();
                        if (action === "pause") ytPlayerRef.current.pauseVideo();
                        if (action === "seek" && time !== undefined) ytPlayerRef.current.seekTo(time, true);
                        if (action === "volume" && volume !== undefined) ytPlayerRef.current.setVolume(Math.round(volume * 100));
                        return;
                    } catch (e) {}
                }
                const vid = videoRef.current;
                if (!vid) return;
                const { action, time, volume } = event.data;
                if (action === "play") vid.play();
                if (action === "pause") vid.pause();
                if (action === "seek" && time !== undefined) vid.currentTime = time;
                if (action === "volume" && volume !== undefined) vid.volume = volume;
                if (action === "fullscreen") {
                    const el = document.documentElement;
                    if (el.requestFullscreen) el.requestFullscreen().catch(() => setFullscreenRequested(true));
                    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                }
            }
        };
        window.addEventListener("message", handleMessage);

        return () => {
            unsubVideo();
            unsubControl();
            unsubLive();
            window.removeEventListener("message", handleMessage);
        };
    }, [isYouTube]);

    if (!videoUrl) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-background via-card to-background flex items-center justify-center p-8">
                <div className="text-center max-w-2xl">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }}>
                        <div className="text-8xl mb-6">🎥</div>
                        <h1 className="text-4xl font-bold text-white mb-4">Dispositivo de Vídeo</h1>
                        <div className="flex items-center justify-center gap-3 text-green-400 mb-6 text-xl">
                            <div className="w-4 h-4 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="font-semibold">Conectado e Online</span>
                        </div>
                        <div className="space-y-4 text-left bg-white/5 p-6 rounded-lg backdrop-blur-sm border border-border">
                            <p className="text-foreground text-lg">✓ Este dispositivo está pronto para receber vídeos</p>
                            <p className="text-muted-foreground">📱 Mantenha esta janela aberta</p>
                            <p className="text-muted-foreground">🎬 Suporta MP4 e links do YouTube</p>
                            <p className="text-muted-foreground">🎵 O vídeo aparecerá automaticamente aqui</p>
                        </div>
                        <p className="text-muted-foreground text-sm mt-6">A letra da música continuará no projetor principal</p>
                    </motion.div>
                </div>
            </div>
        );
    }

    const enterFullscreen = () => {
        if (isYouTube) {
            const el = document.documentElement;
            if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
            setFullscreenRequested(false);
            return;
        }
        const vid = videoRef.current;
        if (!vid) return;
        if (vid.requestFullscreen) vid.requestFullscreen().catch(() => {});
        else if (vid.webkitRequestFullscreen) vid.webkitRequestFullscreen();
        setFullscreenRequested(false);
    };

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center relative">
            {title && (
                <div className="absolute top-8 left-0 right-0 text-center z-10">
                    <h2 className="text-2xl font-semibold text-white bg-black/50 inline-block px-6 py-3 rounded-lg">
                        {title}
                    </h2>
                </div>
            )}
            {isYouTube ? (
                <div className="w-full h-full flex items-center justify-center">
                    <div ref={ytContainerRef} className="w-full h-full" style={{ minHeight: "100vh" }} />
                </div>
            ) : (
                <video
                    ref={videoRef}
                    src={videoUrl}
                    controls
                    autoPlay
                    playsInline
                    muted={false}
                    preload="auto"
                    className="w-full h-full object-contain"
                    key={videoUrl}
                    onPlay={() => {
                        if (!document.fullscreenElement) {
                            const el = document.documentElement;
                            if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
                            else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
                        }
                    }}
                />
            )}
            {fullscreenRequested && (
                <button
                    onClick={enterFullscreen}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20 gap-4"
                >
                    <span className="text-7xl">⛶</span>
                    <span className="text-white text-2xl font-bold">Toque para Ecrã Inteiro</span>
                </button>
            )}
        </div>
    );
}