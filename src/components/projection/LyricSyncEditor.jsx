import React, { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Play, Pause, SkipBack, Clock, Check, ChevronLeft, ChevronRight } from "lucide-react";

/**
 * LyricSyncEditor
 * Permite ao utilizador marcar o tempo exato de cada slide da letra
 * enquanto o vídeo está a ser reproduzido.
 * 
 * Props:
 *  - videoUrl: string (URL do vídeo mp4)
 *  - slides: Array<{text, duration}> (slides já gerados)
 *  - onSyncDone: (syncedSlides) => void
 *  - onCancel: () => void
 */
export default function LyricSyncEditor({ videoUrl, slides, onSyncDone, onCancel }) {
    const videoRef = useRef(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const [currentSlideIdx, setCurrentSlideIdx] = useState(0);

    // Cada slide terá um campo `start` (tempo em segundos)
    const [syncedSlides, setSyncedSlides] = useState(
        slides.map((s, i) => ({ ...s, start: null }))
    );

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;
        const onTime = () => setCurrentTime(video.currentTime);
        const onMeta = () => setDuration(video.duration);
        video.addEventListener("timeupdate", onTime);
        video.addEventListener("loadedmetadata", onMeta);
        return () => {
            video.removeEventListener("timeupdate", onTime);
            video.removeEventListener("loadedmetadata", onMeta);
        };
    }, []);

    const togglePlay = () => {
        const video = videoRef.current;
        if (!video) return;
        if (isPlaying) { video.pause(); } else { video.play(); }
        setIsPlaying(!isPlaying);
    };

    const restart = () => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = 0;
        setCurrentTime(0);
    };

    const seekTo = (time) => {
        const video = videoRef.current;
        if (!video) return;
        video.currentTime = time;
        setCurrentTime(time);
    };

    const markCurrent = useCallback(() => {
        // Marca o tempo atual do vídeo para o slide ativo
        setSyncedSlides(prev => {
            const updated = [...prev];
            updated[currentSlideIdx] = { ...updated[currentSlideIdx], start: parseFloat(currentTime.toFixed(2)) };
            return updated;
        });
        // Avança automaticamente para o próximo slide
        if (currentSlideIdx < slides.length - 1) {
            setCurrentSlideIdx(i => i + 1);
        }
    }, [currentTime, currentSlideIdx, slides.length]);

    // Tecla espaço = marcar tempo; Enter = avançar slide; R = reiniciar
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
            if (e.code === "Space") { e.preventDefault(); markCurrent(); }
            if (e.code === "KeyR") { e.preventDefault(); restart(); }
            if (e.code === "ArrowRight") setCurrentSlideIdx(i => Math.min(i + 1, slides.length - 1));
            if (e.code === "ArrowLeft") setCurrentSlideIdx(i => Math.max(i - 1, 0));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [markCurrent, slides.length]);

    const formatTime = (t) => {
        if (!t && t !== 0) return "--:--";
        const m = Math.floor(t / 60).toString().padStart(2, "0");
        const s = Math.floor(t % 60).toString().padStart(2, "0");
        return `${m}:${s}`;
    };

    const allMarked = syncedSlides.every(s => s.start !== null);

    const buildFinalSlides = () => {
        // Calcular duração de cada slide = diferença entre starts consecutivos
        const sorted = [...syncedSlides].sort((a, b) => (a.start ?? 0) - (b.start ?? 0));
        const result = sorted.map((s, i) => {
            const nextStart = sorted[i + 1]?.start ?? duration;
            const dur = nextStart - (s.start ?? 0);
            return { text: s.text, duration: parseFloat(dur.toFixed(2)), start: s.start };
        });
        return result;
    };

    const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
    const markedCount = syncedSlides.filter(s => s.start !== null).length;

    return (
        <div className="space-y-4">
            {/* Vídeo */}
            <video
                ref={videoRef}
                src={videoUrl}
                className="w-full rounded-lg max-h-48 bg-black"
                onPlay={() => setIsPlaying(true)}
                onPause={() => setIsPlaying(false)}
                onEnded={() => setIsPlaying(false)}
            />

            {/* Barra de progresso clicável */}
            <div
                className="relative h-3 bg-white/10 rounded-full cursor-pointer overflow-hidden"
                onClick={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const ratio = (e.clientX - rect.left) / rect.width;
                    seekTo(ratio * duration);
                }}
            >
                <div className="h-full bg-gradient-to-r from-primary to-accent rounded-full transition-all"
                    style={{ width: `${progress}%` }} />
                {/* Marcadores de slides */}
                {syncedSlides.filter(s => s.start !== null && duration > 0).map((s, i) => (
                    <div key={i}
                        className="absolute top-0 h-full w-0.5 bg-yellow-400 opacity-80"
                        style={{ left: `${(s.start / duration) * 100}%` }}
                    />
                ))}
            </div>

            {/* Controles + tempo */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <Button type="button" size="icon" variant="ghost" onClick={restart}
                        className="text-white hover:bg-white/10">
                        <SkipBack className="w-4 h-4" />
                    </Button>
                    <Button type="button" size="icon" onClick={togglePlay}
                        className="text-white">
                        {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                    </Button>
                    <span className="text-white text-sm font-mono ml-1">
                        {formatTime(currentTime)} / {formatTime(duration)}
                    </span>
                </div>
                <span className="text-xs text-muted-foreground">
                    {markedCount}/{syncedSlides.length} estrofes marcadas
                </span>
            </div>

            {/* Slide atual + botão de marcação */}
            <div className="p-4 bg-primary/10 border border-primary/40 rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                    <span className="text-xs text-accent font-semibold uppercase tracking-wider">
                        Estrofe {currentSlideIdx + 1} de {syncedSlides.length}
                    </span>
                    {syncedSlides[currentSlideIdx]?.start !== null && (
                        <span className="text-xs text-green-400 flex items-center gap-1">
                            <Clock className="w-3 h-3" /> {formatTime(syncedSlides[currentSlideIdx].start)}
                        </span>
                    )}
                </div>
                <p className="text-white text-sm leading-relaxed whitespace-pre-line min-h-12 bg-black/20 rounded p-2">
                    {syncedSlides[currentSlideIdx]?.text}
                </p>
                <div className="flex gap-2">
                    <Button type="button" variant="ghost" size="sm"
                        onClick={() => setCurrentSlideIdx(i => Math.max(i - 1, 0))}
                        disabled={currentSlideIdx === 0}
                        className="text-muted-foreground hover:text-white">
                        <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button type="button"
                        onClick={markCurrent}
                        className="flex-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm">
                        <Clock className="w-4 h-4 mr-2" />
                        Marcar Tempo — {formatTime(currentTime)}
                        <span className="ml-2 text-xs opacity-70">[Espaço]</span>
                    </Button>
                    <Button type="button" variant="ghost" size="sm"
                        onClick={() => setCurrentSlideIdx(i => Math.min(i + 1, slides.length - 1))}
                        disabled={currentSlideIdx === slides.length - 1}
                        className="text-muted-foreground hover:text-white">
                        <ChevronRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Lista de slides com tempos */}
            <div className="max-h-40 overflow-y-auto space-y-1">
                {syncedSlides.map((s, i) => (
                    <button
                        key={i}
                        type="button"
                        onClick={() => { setCurrentSlideIdx(i); if (s.start !== null) seekTo(s.start); }}
                        className={`w-full text-left px-3 py-2 rounded text-xs flex items-center gap-2 transition-colors ${
                            i === currentSlideIdx
                                ? "bg-primary/30 border border-primary/50 text-white"
                                : "bg-white/5 text-gray-300 hover:bg-white/10"
                        }`}
                    >
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                            s.start !== null ? "bg-green-500 text-white" : "bg-white/20 text-gray-400"
                        }`}>
                            {s.start !== null ? <Check className="w-3 h-3" /> : i + 1}
                        </span>
                        <span className="flex-1 truncate">{s.text.split("\n")[0]}</span>
                        {s.start !== null && (
                            <span className="text-green-400 font-mono flex-shrink-0">{formatTime(s.start)}</span>
                        )}
                    </button>
                ))}
            </div>

            {/* Instruções */}
            <p className="text-xs text-muted-foreground/70 text-center">
                Toque em <kbd className="bg-white/10 px-1 rounded">Espaço</kbd> para marcar cada estrofe no momento certo
            </p>

            {/* Ações finais */}
            <div className="flex gap-3 pt-2 border-t border-border">
                <Button type="button" variant="outline" onClick={onCancel}
                    className="flex-1 border-border text-muted-foreground hover:bg-white/10">
                    Cancelar
                </Button>
                <Button type="button"
                    onClick={() => onSyncDone(buildFinalSlides())}
                    disabled={!allMarked}
                    className="flex-1 text-white font-semibold">
                    <Check className="w-4 h-4 mr-2" />
                    {allMarked ? "Guardar Sincronização" : `Faltam ${syncedSlides.length - markedCount} estrofes`}
                </Button>
            </div>
        </div>
    );
}