import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Youtube, X, Send, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { base44 } from "@/api/base44Client";
import { isYouTubeUrl, getYouTubeId, getYouTubeThumbnail } from "@/utils/youtube";

function formatTime(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function YouTubeProjectionPanel({ onClose }) {
    const [url, setUrl] = useState("");
    const [title, setTitle] = useState("");
    const [sent, setSent] = useState(false);
    const [playing, setPlaying] = useState(true);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);
    const ytPlayerRef = useRef(null);
    const ytContainerRef = useRef(null);
    const dragRef = useRef(null);
    const [pos, setPos] = useState({ x: null, y: null });
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const valid = isYouTubeUrl(url);

    // Load YouTube API
    useEffect(() => {
        if (!window.YT) {
            const tag = document.createElement("script");
            tag.src = "https://www.youtube.com/iframe_api";
            document.head.appendChild(tag);
        }
    }, []);

    // Create local preview player when sent
    useEffect(() => {
        if (!sent || !valid || !window.YT || !ytContainerRef.current) return;

        const createPlayer = () => {
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.loadVideoById(getYouTubeId(url)); } catch (e) {}
                return;
            }
            ytPlayerRef.current = new window.YT.Player(ytContainerRef.current, {
                videoId: getYouTubeId(url),
                playerVars: { autoplay: 1, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
                events: {
                    onReady: (e) => {
                        e.target.playVideo();
                        setDuration(e.target.getDuration());
                    },
                    onStateChange: (e) => {
                        setPlaying(e.data === window.YT.PlayerState.PLAYING);
                    },
                },
            });
        };

        if (window.YT && window.YT.Player) {
            createPlayer();
        } else {
            const interval = setInterval(() => {
                if (window.YT && window.YT.Player) {
                    clearInterval(interval);
                    createPlayer();
                }
            }, 200);
            return () => clearInterval(interval);
        }
    }, [sent, url, valid]);

    // Time update polling
    useEffect(() => {
        if (!sent || !ytPlayerRef.current) return;
        const interval = setInterval(() => {
            try {
                if (ytPlayerRef.current?.getCurrentTime) {
                    setCurrentTime(ytPlayerRef.current.getCurrentTime());
                    setDuration(ytPlayerRef.current.getDuration());
                }
            } catch (e) {}
        }, 500);
        return () => clearInterval(interval);
    }, [sent]);

    // Cleanup
    useEffect(() => {
        return () => {
            if (ytPlayerRef.current) {
                try { ytPlayerRef.current.destroy(); } catch (e) {}
            }
        };
    }, []);

    const startDrag = (clientX, clientY) => {
        dragging.current = true;
        const el = dragRef.current;
        const rect = el.getBoundingClientRect();
        dragOffset.current = { x: clientX - rect.left, y: clientY - rect.top };
    };

    const onMouseDown = (e) => {
        startDrag(e.clientX, e.clientY);
        e.preventDefault();
    };

    const onTouchStart = (e) => {
        const t = e.touches[0];
        if (t) startDrag(t.clientX, t.clientY);
    };

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!dragging.current) return;
            setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
        };
        const onTouchMove = (e) => {
            if (!dragging.current) return;
            const t = e.touches[0];
            if (t) setPos({ x: t.clientX - dragOffset.current.x, y: t.clientY - dragOffset.current.y });
        };
        const onEnd = () => { dragging.current = false; };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onEnd);
        window.addEventListener("touchmove", onTouchMove, { passive: true });
        window.addEventListener("touchend", onEnd);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onEnd);
            window.removeEventListener("touchmove", onTouchMove);
            window.removeEventListener("touchend", onEnd);
        };
    }, []);

    const sendControl = async (payload) => {
        try {
            await base44.entities.VideoControl.create({ ...payload, timestamp: Date.now() });
        } catch (e) {
            console.error("Erro ao enviar controlo:", e);
        }
    };

    const handleSend = async () => {
        if (!valid) return;
        try {
            await base44.entities.VideoSync.create({
                video_url: url.trim(),
                title: title.trim() || "YouTube",
                timestamp: Date.now(),
                status: "active",
            });
            setSent(true);
        } catch (e) {
            console.error("Erro ao enviar vídeo:", e);
        }
    };

    const handleStop = async () => {
        try {
            await base44.entities.VideoSync.create({
                video_url: "",
                title: "",
                timestamp: Date.now(),
                status: "active",
            });
        } catch (e) {}
        if (ytPlayerRef.current) {
            try { ytPlayerRef.current.destroy(); } catch (e) {}
            ytPlayerRef.current = null;
        }
        setSent(false);
        setUrl("");
        setTitle("");
        setCurrentTime(0);
        setDuration(0);
    };

    const togglePlay = () => {
        if (!ytPlayerRef.current) return;
        if (playing) {
            ytPlayerRef.current.pauseVideo();
            setPlaying(false);
            sendControl({ action: "pause" });
        } else {
            ytPlayerRef.current.playVideo();
            setPlaying(true);
            sendControl({ action: "play" });
        }
    };

    const handleSeek = (val) => {
        if (!ytPlayerRef.current) return;
        ytPlayerRef.current.seekTo(val[0], true);
        setCurrentTime(val[0]);
        sendControl({ action: "seek", time: val[0] });
    };

    const skip = (secs) => {
        if (!ytPlayerRef.current) return;
        const newTime = Math.max(0, Math.min(duration, currentTime + secs));
        ytPlayerRef.current.seekTo(newTime, true);
        sendControl({ action: "seek", time: newTime });
    };

    const handleVolume = (val) => {
        const v = val[0];
        if (ytPlayerRef.current) ytPlayerRef.current.setVolume(Math.round(v * 100));
        setVolume(v);
        setMuted(v === 0);
        sendControl({ action: "volume", volume: v });
    };

    const toggleMute = () => {
        const newMuted = !muted;
        if (ytPlayerRef.current) ytPlayerRef.current.setVolume(newMuted ? 0 : Math.round(volume * 100));
        setMuted(newMuted);
        sendControl({ action: "volume", volume: newMuted ? 0 : volume });
    };

    const requestFullscreen = async () => {
        await sendControl({ action: "fullscreen" });
    };

    const panelStyle = pos.x !== null
        ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 50 }
        : { position: "fixed", bottom: 16, right: 16, zIndex: 50 };

    return (
        <div ref={dragRef} style={panelStyle} className="w-80 bg-card/95 border border-white/20 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm select-none">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 bg-red-600/30 cursor-grab active:cursor-grabbing touch-none" onMouseDown={onMouseDown} onTouchStart={onTouchStart}>
                <span className="text-white text-sm font-semibold flex items-center gap-2">
                    <Youtube className="w-4 h-4 text-red-500" /> YouTube
                </span>
                <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1" onMouseDown={e => e.stopPropagation()}>
                    <X className="w-4 h-4" />
                </button>
            </div>

            {!sent ? (
                <div className="p-4 space-y-3">
                    <input
                        type="text"
                        placeholder="Cole o link do YouTube aqui..."
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        className="w-full h-10 rounded-lg bg-background border border-border px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    <input
                        type="text"
                        placeholder="Título (opcional)"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="w-full h-10 rounded-lg bg-background border border-border px-3 text-sm text-white placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-red-500"
                    />
                    {url && !valid && (
                        <p className="text-xs text-red-400">Link do YouTube inválido</p>
                    )}
                    {url && valid && (
                        <div className="relative rounded-lg overflow-hidden">
                            <img src={getYouTubeThumbnail(url)} alt="Preview" className="w-full aspect-video object-cover" />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                                <Youtube className="w-10 h-10 text-white" />
                            </div>
                        </div>
                    )}
                    <Button
                        onClick={handleSend}
                        disabled={!valid}
                        className="w-full"
                        style={{ background: valid ? "linear-gradient(135deg, #dc2626, #c9a86a)" : undefined }}
                    >
                        <Send className="w-4 h-4 mr-2" />
                        Transmitir para projetor + tablet
                    </Button>
                </div>
            ) : (
                <>
                    {/* YouTube preview */}
                    <div className="relative">
                        <div ref={ytContainerRef} className="w-full aspect-video bg-black" />
                    </div>

                    {/* Title */}
                    <div className="px-3 py-1.5 bg-black/40">
                        <p className="text-white text-xs font-medium truncate">{title || "YouTube"}</p>
                    </div>

                    {/* Controls */}
                    <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs w-9 shrink-0">{formatTime(currentTime)}</span>
                            <Slider value={[currentTime]} max={duration || 1} step={0.5} onValueChange={handleSeek} className="flex-1" />
                            <span className="text-gray-400 text-xs w-9 text-right shrink-0">{formatTime(duration)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-colors p-1">
                                    {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                </button>
                                <Slider value={[muted ? 0 : volume]} max={1} step={0.05} onValueChange={handleVolume} className="w-20" />
                            </div>
                            <div className="flex items-center gap-2">
                                <button onClick={() => skip(-10)} className="text-gray-400 hover:text-white transition-colors p-1">
                                    <SkipBack className="w-5 h-5" />
                                </button>
                                <button onClick={togglePlay} className="w-10 h-10 rounded-full bg-red-600 hover:bg-red-500 flex items-center justify-center transition-colors">
                                    {playing ? <Pause className="w-5 h-5 text-white" /> : <Play className="w-5 h-5 text-white ml-0.5" />}
                                </button>
                                <button onClick={() => skip(10)} className="text-gray-400 hover:text-white transition-colors p-1">
                                    <SkipForward className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="flex items-center gap-1">
                                <button onClick={requestFullscreen} className="text-gray-400 hover:text-yellow-400 transition-colors p-1" title="Ecrã inteiro nos dispositivos">
                                    <Maximize2 className="w-4 h-4" />
                                </button>
                                <button onClick={handleStop} className="text-gray-400 hover:text-red-400 transition-colors p-1" title="Parar">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}