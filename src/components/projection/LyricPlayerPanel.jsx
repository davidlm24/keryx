import React, { useRef, useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, SkipBack, SkipForward, Play, Pause } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { sendToProjection } from "@/lib/projectionWindow";

export default function LyricPlayerPanel({ song, onClose, projectionWindow, stageWindow, lyricSyncId, onSlideChange }) {
    const [slideIndex, setSlideIndex] = useState(0);
    const [isAuto, setIsAuto] = useState(false);
    const autoTimerRef = useRef(null);

    // Drag state
    const dragRef = useRef(null);
    const [pos, setPos] = useState({ x: null, y: null });
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const slides = song?.slides?.length
        ? song.slides
        : [{ text: song?.lyrics || "", duration: 30 }];

    const total = slides.length;
    const current = slides[slideIndex] || {};

    // Swipe state
    const touchStartX = useRef(null);

    const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
    const onTouchEnd = (e) => {
        if (touchStartX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchStartX.current;
        if (Math.abs(dx) > 50) { dx < 0 ? goTo(slideIndex + 1) : goTo(slideIndex - 1); }
        touchStartX.current = null;
    };

    // Atalhos de teclado: setas para slides, espaço para auto
    useEffect(() => {
        const onKey = (e) => {
            if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA" || e.target.isContentEditable) return;
            if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); goTo(slideIndex + 1); }
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); goTo(slideIndex - 1); }
            if (e.key === " ") { e.preventDefault(); toggleAuto(); }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [slideIndex, total]);

    const sendSlide = (idx) => {
        // Tanto o projetor local como o tablet subscrevem ao LyricSync —
        // ambos recebem a mudança em simultâneo, sem diferença de tempo.
        if (lyricSyncId) {
            base44.entities.LyricSync.update(lyricSyncId, { slide_index: idx, timestamp: Date.now() }).catch(() => {});
        }
        // Janela única de projeção local (postMessage SLIDE_INDEX)
        sendToProjection({ type: "SLIDE_INDEX", index: idx });
        // Stage view (monitor do palco) continua via postMessage
        if (stageWindow && !stageWindow.closed) {
            stageWindow.postMessage({ type: "SLIDE_INDEX", index: idx }, "*");
        }
        if (onSlideChange) onSlideChange(idx);
    };

    const goTo = (idx) => {
        const clamped = Math.max(0, Math.min(total - 1, idx));
        setSlideIndex(clamped);
        sendSlide(clamped);
    };

    // Auto mode
    const startAuto = () => {
        setIsAuto(true);
        const tick = (currentIdx) => {
            const next = currentIdx + 1;
            if (next >= total) {
                setIsAuto(false);
                return;
            }
            goTo(next);
            const dur = (slides[next]?.duration || 5) * 1000;
            autoTimerRef.current = setTimeout(() => tick(next), dur);
        };
        const dur = (slides[slideIndex]?.duration || 5) * 1000;
        autoTimerRef.current = setTimeout(() => tick(slideIndex), dur);
    };

    const stopAuto = () => {
        setIsAuto(false);
        clearTimeout(autoTimerRef.current);
    };

    const toggleAuto = () => {
        if (isAuto) stopAuto();
        else startAuto();
    };

    // Drag
    const onMouseDown = (e) => {
        dragging.current = true;
        const rect = dragRef.current.getBoundingClientRect();
        dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        e.preventDefault();
    };

    React.useEffect(() => {
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
            clearTimeout(autoTimerRef.current);
        };
    }, []);

    const panelStyle = pos.x !== null
        ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 50 }
        : { position: "fixed", bottom: 16, left: 16, zIndex: 50 };

    return (
        <div
            ref={dragRef}
            style={panelStyle}
            className="w-80 bg-card/95 border border-white/20 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-sm select-none"
        >
            {/* Header arrastável */}
            <div
                className="flex items-center justify-between px-4 py-2 bg-black/40 cursor-grab active:cursor-grabbing"
                onMouseDown={onMouseDown}
            >
                <span className="text-white text-sm font-semibold truncate max-w-[200px]">
                    🎤 {song?.title}
                </span>
                <div onMouseDown={e => e.stopPropagation()}>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1">
                        <X className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Contador de slides */}
            <div className="flex items-center justify-end px-4 pt-2 pb-1">
                <span className="text-xs text-gray-500">{slideIndex + 1} / {total}</span>
            </div>

            {/* Prévia da letra (swipe left/right para mudar slide) */}
            <div
                className="mx-4 my-2 bg-black/30 rounded-xl px-3 py-3 min-h-[80px] max-h-[120px] overflow-y-auto"
                onTouchStart={onTouchStart}
                onTouchEnd={onTouchEnd}
            >
                <p className="text-white text-xs leading-relaxed whitespace-pre-wrap">
                    {current.text || "—"}
                </p>
            </div>

            {/* Próximo slide preview */}
            {slideIndex + 1 < total && (
                <div className="mx-4 mb-2">
                    <p className="text-gray-500 text-xs truncate">
                        ↓ {slides[slideIndex + 1]?.text?.split("\n")[0]}
                    </p>
                </div>
            )}

            {/* Controles */}
            <div className="flex items-center justify-between px-4 pb-3 gap-2">
                {/* Voltar ao início */}
                <button
                    onClick={() => goTo(0)}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                    title="Primeiro slide"
                >
                    <SkipBack className="w-4 h-4" />
                </button>

                {/* Anterior */}
                <button
                    onClick={() => goTo(slideIndex - 1)}
                    disabled={slideIndex === 0}
                    className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors p-1"
                >
                    <ChevronLeft className="w-5 h-5" />
                </button>

                {/* Play/Pause Auto */}
                <button
                    onClick={toggleAuto}
                    className="w-10 h-10 rounded-full bg-lime-500 hover:bg-lime-400 flex items-center justify-center transition-colors"
                    title={isAuto ? "Pausar automático" : "Iniciar automático"}
                >
                    {isAuto
                        ? <Pause className="w-5 h-5 text-black" />
                        : <Play className="w-5 h-5 text-black ml-0.5" />
                    }
                </button>

                {/* Próximo */}
                <button
                    onClick={() => goTo(slideIndex + 1)}
                    disabled={slideIndex === total - 1}
                    className="text-gray-400 hover:text-white disabled:opacity-30 transition-colors p-1"
                >
                    <ChevronRight className="w-5 h-5" />
                </button>

                {/* Ir ao último */}
                <button
                    onClick={() => goTo(total - 1)}
                    className="text-gray-400 hover:text-white transition-colors p-1"
                    title="Último slide"
                >
                    <SkipForward className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}