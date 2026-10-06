import React, { useState, useRef, useEffect } from "react";
import { Youtube, X, Send, Play, Pause, SkipForward, SkipBack, Volume2, VolumeX, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { livePosition } from "@shared/live-state.mjs";
import { isYouTubeUrl, getYouTubeThumbnail } from "@/utils/youtube";
import LiveVideo from "@/components/projection/LiveVideo";

function formatTime(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Sends a YouTube link to the screens (the live state's video channel) and
// controls it there; the preview here is muted and follows the screens.
export default function YouTubeProjectionPanel({ onClose }) {
    const live = useLiveState((st) => st?.video);
    const video = live && live.kind === "youtube" ? live : null;
    const now = useLiveNow(500);
    const [url, setUrl] = useState("");
    const [title, setTitle] = useState("");
    const [duration, setDuration] = useState(0);
    const [seekValue, setSeekValue] = useState(null);
    const [volumeValue, setVolumeValue] = useState(null);
    const lastVolume = useRef(1);
    const dragRef = useRef(null);
    const [pos, setPos] = useState({ x: null, y: null });
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const valid = isYouTubeUrl(url);

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

    const fail = (err) => console.error("[keryx] YouTube:", err);

    const handleSend = () => {
        if (!valid) return;
        projection.showVideo({ kind: "youtube", url: url.trim(), title: title.trim() || "YouTube" }).catch(fail);
    };

    const handleStop = () => {
        projection.clearVideo().catch(fail);
        setUrl("");
        setTitle("");
        setDuration(0);
    };

    const playback = video?.playback;
    const position = playback ? livePosition(playback, now) : 0;
    const currentTime = seekValue ?? (duration ? Math.min(position, duration) : position);
    const playing = Boolean(playback && !playback.paused && (!duration || position < duration));
    const volume = volumeValue ?? playback?.volume ?? 1;
    const muted = volume === 0;

    const togglePlay = () => (playing ? projection.transport.pause() : projection.transport.play()).catch(fail);
    const seek = (t) => projection.transport.seek(Math.max(0, duration ? Math.min(duration, t) : t)).catch(fail);
    const skip = (secs) => seek(position + secs);
    const setVolume = (v) => {
        if (v > 0) lastVolume.current = v;
        projection.transport.volume(v).catch(fail);
    };
    const toggleMute = () => setVolume(muted ? lastVolume.current || 1 : 0);
    const requestFullscreen = () => projection.transport.fullscreen().catch(fail);

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

            {!video ? (
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
                    {/* Prévia (sem som) */}
                    <LiveVideo item={video} muted className="w-full aspect-video bg-black" onDuration={(d) => setDuration(Number.isFinite(d) ? d : 0)} />

                    {/* Title */}
                    <div className="px-3 py-1.5 bg-black/40">
                        <p className="text-white text-xs font-medium truncate">{video.title || "YouTube"}</p>
                    </div>

                    {/* Controls */}
                    <div className="px-4 py-3 space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-xs w-9 shrink-0">{formatTime(currentTime)}</span>
                            <Slider
                                value={[currentTime]}
                                max={duration || 1}
                                step={0.5}
                                onValueChange={(v) => setSeekValue(v[0])}
                                onValueCommit={(v) => { setSeekValue(null); seek(v[0]); }}
                                className="flex-1"
                            />
                            <span className="text-gray-400 text-xs w-9 text-right shrink-0">{formatTime(duration)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1">
                                <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-colors p-1">
                                    {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                                </button>
                                <Slider
                                    value={[volume]}
                                    max={1}
                                    step={0.05}
                                    onValueChange={(v) => setVolumeValue(v[0])}
                                    onValueCommit={(v) => { setVolumeValue(null); setVolume(v[0]); }}
                                    className="w-20"
                                />
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
                                <button onClick={requestFullscreen} className="text-gray-400 hover:text-yellow-400 transition-colors p-1" title="Tela cheia nas telas">
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
