import React, { useRef, useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX, SkipBack, SkipForward, X, Maximize2, Maximize } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { livePosition } from "@shared/live-state.mjs";
import LiveVideo from "@/components/projection/LiveVideo";

function formatTime(s) {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
}

// Floating control for the video on the screens (live.video: a song's clip).
// Play, pause, seek and volume change the shared playback, so every screen
// follows; the preview here is muted and follows too.
export default function VideoPlayerPanel({ song, onClose, onSendToProjection }) {
    const video = useLiveState((st) => st?.video);
    const now = useLiveNow(500);
    const [duration, setDuration] = useState(0);
    const [seekValue, setSeekValue] = useState(null); // while dragging the slider
    const [volumeValue, setVolumeValue] = useState(null);
    const lastVolume = useRef(1);

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

    const fail = (err) => console.error("[keryx] vídeo:", err);
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
    const requestRemoteFullscreen = () => projection.transport.fullscreen().catch(fail);

    if (!video) return null;

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
                <span className="text-white text-sm font-semibold truncate max-w-[180px]">🎵 {video.title || song?.title}</span>
                <div className="flex items-center gap-1" onMouseDown={e => e.stopPropagation()}>
                    <button
                        onClick={requestRemoteFullscreen}
                        className="text-gray-400 hover:text-yellow-400 transition-colors p-1"
                        title="Tela cheia nas telas"
                    >
                        <Maximize className="w-4 h-4" />
                    </button>
                    {onSendToProjection && song && (
                        <button
                            onClick={() => onSendToProjection(song)}
                            className="text-gray-400 hover:text-lime-400 transition-colors p-1"
                            title="Enviar a letra para a projeção"
                        >
                            <Maximize2 className="w-4 h-4" />
                        </button>
                    )}
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Prévia (sem som: o som sai das telas) */}
            <LiveVideo item={video} muted className="w-full aspect-video bg-black" onDuration={(d) => setDuration(Number.isFinite(d) ? d : 0)} />

            {/* Controls */}
            <div className="px-4 py-3 space-y-2">
                {/* Progress */}
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

                {/* Buttons */}
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
