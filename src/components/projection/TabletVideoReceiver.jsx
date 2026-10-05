import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { isYouTubeUrl, getYouTubeId } from "@/utils/youtube";

/**
 * Receptor de vídeo para a tablet / página de projeção de letras.
 * Subscreve a VideoSync (YouTube ou MP4) e a VideoControl (play/pause/seek/volume/fullscreen).
 * Renderiza o vídeo em ecrã inteiro quando ativo; devolve null quando inativo,
 * para não afetar a projeção de letras normal.
 */
export default function TabletVideoReceiver() {
    const [videoUrl, setVideoUrl] = useState("");
    const [title, setTitle] = useState("");
    const [fullscreenRequested, setFullscreenRequested] = useState(false);
    const videoRef = useRef(null);
    const ytPlayerRef = useRef(null);
    const ytContainerRef = useRef(null);
    const lastControlId = useRef(null);

    const isYouTube = isYouTubeUrl(videoUrl);

    const requestFullscreen = () => {
        const el = document.documentElement;
        if (el.requestFullscreen) el.requestFullscreen().catch(() => setFullscreenRequested(true));
        else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        else setFullscreenRequested(true);
    };

    // Carregar a YouTube IFrame API uma vez
    useEffect(() => {
        if (!window.YT) {
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(tag);
        }
    }, []);

    // Inicializar o player do YouTube quando chega um link do YouTube
    useEffect(() => {
        if (!isYouTube || !videoUrl) return;

        const createPlayer = () => {
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.loadVideoById(getYouTubeId(videoUrl)); } catch (e) {}
                return;
            }
            ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
                videoId: getYouTubeId(videoUrl),
                playerVars: { autoplay: 1, controls: 1, modestbranding: 1, rel: 0, playsinline: 1 },
                events: { onReady: (e) => { e.target.playVideo(); } },
            });
        };

        if (window.YT && window.YT.Player) {
            createPlayer();
        } else {
            const iv = setInterval(() => {
                if (window.YT && window.YT.Player) { clearInterval(iv); createPlayer(); }
            }, 200);
            return () => clearInterval(iv);
        }
    }, [isYouTube, videoUrl]);

    // Limpar o player do YouTube quando o URL é removido
    useEffect(() => {
        if (!videoUrl && ytPlayerRef.current) {
            try { ytPlayerRef.current.destroy(); } catch (e) {}
            ytPlayerRef.current = null;
        }
    }, [videoUrl]);

    // Subscrições a VideoSync + VideoControl
    useEffect(() => {
        const initLast = async () => {
            try {
                const existing = await base44.entities.VideoControl.list('-timestamp', 1);
                if (existing.length > 0) lastControlId.current = existing[0].id;
            } catch (e) {}
        };
        initLast();

        const unsubVideo = base44.entities.VideoSync.subscribe((event) => {
            if (event.type === 'create' || event.type === 'update') {
                const v = event.data;
                if (v.status === "active") {
                    setVideoUrl(v.video_url || "");
                    setTitle(v.title || "");
                    if (v.video_url) base44.entities.VideoSync.update(v.id, { status: "played" }).catch(() => {});
                }
            }
        });

        const unsubControl = base44.entities.VideoControl.subscribe((event) => {
            if (event.type !== 'create') return;
            const cmd = event.data;
            if (cmd.id === lastControlId.current) return;
            lastControlId.current = cmd.id;

            if (isYouTubeUrl(videoUrl) && ytPlayerRef.current) {
                try {
                    if (cmd.action === "play") ytPlayerRef.current.playVideo();
                    if (cmd.action === "pause") ytPlayerRef.current.pauseVideo();
                    if (cmd.action === "seek" && cmd.time !== undefined) ytPlayerRef.current.seekTo(cmd.time, true);
                    if (cmd.action === "volume" && cmd.volume !== undefined) ytPlayerRef.current.setVolume(Math.round(cmd.volume * 100));
                    if (cmd.action === "fullscreen") requestFullscreen();
                    return;
                } catch (e) {}
            }

            const vid = videoRef.current;
            if (cmd.action === "play" && vid) vid.play().catch(() => {});
            if (cmd.action === "pause" && vid) vid.pause();
            if (cmd.action === "seek" && vid && cmd.time !== undefined) vid.currentTime = cmd.time;
            if (cmd.action === "volume" && vid && cmd.volume !== undefined) vid.volume = cmd.volume;
            if (cmd.action === "fullscreen") requestFullscreen();
        });

        const fetchInitial = async () => {
            try {
                const videos = await base44.entities.VideoSync.list('-timestamp', 1);
                if (videos.length > 0 && videos[0].status === "active" && videos[0].video_url) {
                    setVideoUrl(videos[0].video_url);
                    setTitle(videos[0].title || "");
                    base44.entities.VideoSync.update(videos[0].id, { status: "played" }).catch(() => {});
                }
            } catch (e) {}
        };
        fetchInitial();

        return () => { unsubVideo(); unsubControl(); };
    }, [videoUrl]);

    if (!videoUrl) return null;

    return (
        <div className="fixed inset-0 bg-black z-50 flex flex-col items-center justify-center">
            {title && (
                <div className="absolute top-6 left-0 right-0 text-center z-10">
                    <h2 className="text-xl md:text-2xl font-semibold text-white bg-black/50 inline-block px-6 py-2 rounded-lg">
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
                    autoPlay
                    playsInline
                    controls
                    className="w-full h-full object-contain"
                    key={videoUrl}
                />
            )}
            {fullscreenRequested && (
                <button
                    onClick={() => { requestFullscreen(); setFullscreenRequested(false); }}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20 gap-4"
                >
                    <span className="text-7xl">⛶</span>
                    <span className="text-white text-2xl font-bold">Toque para Ecrã Inteiro</span>
                </button>
            )}
        </div>
    );
}