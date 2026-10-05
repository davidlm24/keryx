import React, { useRef, useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, X, Maximize2, Maximize } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { base44 } from "@/api/base44Client";

function formatTime(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function VideoPlayerPanel({ song, onClose, onSendToProjection, videoWindow }) {
    const videoRef = useRef(null);
    const [playing, setPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [volume, setVolume] = useState(1);
    const [muted, setMuted] = useState(false);

    // Drag state
    const dragRef = useRef(null);
    const [pos, setPos] = useState({ x: null, y: null }); // null = use CSS default (bottom-right)
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const onMouseDown = (e) => {
        dragging.current = true;
        const el = dragRef.current;
        const rect = el.getBoundingClientRect();
        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        e.preventDefault();
    };

    useEffect(() => {
        const onMouseMove = (e) => {
            if (!dragging.current) return;
            setPos({ x: e.clientX - dragOffset.current.x, y: e.clientY - dragOffset.current.y });
        };
        const onMouseUp = () => { dragging.current = false; };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
    }, []);

    const sendControl = async (payload) => {
        // Enviar para janela local (mesma máquina)
        if (videoWindow && !videoWindow.closed) {
            videoWindow.postMessage({ type: "VIDEO_CONTROL", ...payload }, "*");
        }
        // Enviar para dispositivos remotos via DB (QR code / cross-device)
        try {
            await base44.entities.VideoControl.create({
                ...payload,
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Erro ao enviar controlo:", e);
        }
    };

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        video.load();
        video.play().catch(() => {});
        setPlaying(true);
        sendControl({ action: "play" });
    }, [song?.audio_url]);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            video.play();
            setPlaying(true);
            sendControl({ action: "play" });
        } else {
            video.pause();
            setPlaying(false);
            sendControl({ action: "pause" });
        }
    };

    const handleTimeUpdate = () => {
        setCurrentTime(videoRef.current?.currentTime || 0);
    };

    const handleLoadedMetadata = () => {
        setDuration(videoRef.current?.duration || 0);
    };

    const handleSeek = (val) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = val[0];
        setCurrentTime(val[0]);
        sendControl({ action: "seek", time: val[0] });
    };

    const handleVolume = (val) => {
        const video = videoRef.current;
        if (!video) return;
        const v = val[0];
        video.volume = v;
        setVolume(v);
        setMuted(v === 0);
        sendControl({ action: "volume", volume: v });
    };

    const toggleMute = () => {
        const video = videoRef.current;
        if (!video) return;
        const newMuted = !muted;
        video.muted = newMuted;
        setMuted(newMuted);
        sendControl({ action: "volume", volume: newMuted ? 0 : volume });
    };

    const skip = (secs) => {
        const video = videoRef.current;
        if (!video) return;
        const newTime = Math.max(0, Math.min(duration, video.currentTime + secs));
        video.currentTime = newTime;
        sendControl({ action: "seek", time: newTime });
    };

    const requestRemoteFullscreen = async () => {
        // Envia comando fullscreen apenas para dispositivos QR (DB), não para janela local
        try {
            await base44.entities.VideoControl.create({
                action: "fullscreen",
                timestamp: Date.now()
            });
        } catch (e) {
            console.error("Erro ao enviar fullscreen:", e);
        }
    };

    if (!song?.audio_url) return null;

    const panelStyle = pos.x !== null
        ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 50 }
        : { position: "fixed", bottom: 16, right: 16, zIndex: 50 };

    return (
        <div ref={dragRef} style={panelStyle} className="w-80 bg-card/95 border border-white/20 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm select-none">
            {/* Header — arrastável */}
            <div
                className="flex items-center justify-between px-4 py-2 bg-black/40 cursor-grab active:cursor-grabbing"
                onMouseDown={onMouseDown}
            >
                <span className="text-white text-sm font-semibold truncate max-w-[180px]">🎵 {song.title}</span>
                <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()}>
                    <button
                        onClick={requestRemoteFullscreen}
                        className="text-gray-400 hover:text-yellow-400 transition-colors p-1"
                        title="Ecrã inteiro nos dispositivos QR"
                    >
                        <Maximize className="w-4 h-4" />
                    </button>
                    {onSendToProjection && (
                        <button
                            onClick={() => onSendToProjection(song)}
                            className="text-gray-400 hover:text-lime-400 transition-colors p-1"
                            title="Enviar para projeção"
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Video */}
            <video
                ref={videoRef}
                src={song.audio_url}
                className="w-full aspect-video bg-black"
                onTimeUpdate={handleTimeUpdate}
                onLoadedMetadata={handleLoadedMetadata}
                onEnded={() => setPlaying(false)}
                playsInline
            />

            {/* Controls */}
            <div className="px-4 py-3 space-y-2">
                {/* Progress */}
                <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-xs w-9 shrink-0">{formatTime(currentTime)}</span>
                    <Slider
                        value={[currentTime]}
                        max={duration || 1}
                        step={0.5}
                        onValueChange={handleSeek}
                        className="flex-1"
                    />
                    <span className="text-gray-400 text-xs w-9 text-right shrink-0">{formatTime(duration)}</span>
                </div>

                {/* Buttons */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                        <button onClick={toggleMute} className="text-gray-400 hover:text-white transition-colors p-1">
                            {muted || volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                        </button>
                        <Slider
                            value={[muted ? 0 : volume]}
                            max={1}
                            step={0.05}
                            onValueChange={handleVolume}
                            className="w-20"
                        />
                    </div>

                    <div className="flex items-center gap-2">
                        <button onClick={() => skip(-10)} className="text-gray-400 hover:text-white transition-colors p-1">
                            <SkipBack className="w-5 h-5" />
                        </button>
                        <button
                            onClick={togglePlay}
                            className="w-10 h-10 rounded-full bg-lime-500 hover:bg-lime-400 flex items-center justify-center transition-colors"
                        >
                            {playing ? <Pause className="w-5 h-5 text-black" /> : <Play className="w-5 h-5 text-black ml-0.5" />}
                        </button>
                        <button onClick={() => skip(10)} className="text-gray-400 hover:text-white transition-colors p-1">
                            <SkipForward className="w-5 h-5" />
                        </button>
                    </div>

                    <div className="w-20" /> {/* spacer */}
                </div>
            </div>
        </div>
    );
}