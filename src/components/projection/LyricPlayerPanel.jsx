import React, { useRef, useState, useEffect } from "react";
import { X, ChevronLeft, ChevronRight, SkipBack, SkipForward, Play, Pause } from "lucide-react";
import { projection } from "@/lib/projection";
import { useLiveState } from "@/hooks/useLiveState";

// Floating slide control for what is live: every screen follows the live
// state, so moving here moves them all. With `rehearsal` (Modo Ensaio:
// { title, slides }) it only steps through the slides locally.
export default function LyricPlayerPanel({ onClose, rehearsal = null }) {
    const live = useLiveState((s) => s?.content);
    const [localIndex, setLocalIndex] = useState(0);
    const [isAuto, setIsAuto] = useState(false);
    const autoTimerRef = useRef(null);

    // Drag state
    const dragRef = useRef(null);
    const [pos, setPos] = useState({ x: null, y: null });
    const dragging = useRef(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    const content = rehearsal || live;
    const slides = content?.slides?.length ? content.slides : [{ text: "" }];
    const slideIndex = rehearsal ? localIndex : (live?.index ?? 0);
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

    const goTo = (idx) => {
        const clamped = Math.max(0, Math.min(total - 1, idx));
        if (rehearsal) setLocalIndex(clamped);
        else projection.goTo(clamped).catch((err) => console.error("[keryx] slide:", err));
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
    });

    // Auto mode: this panel advances the live slide for every screen, each
    // slide for its own duration (5 s when it has none).
    useEffect(() => {
        if (!isAuto) return undefined;
        if (slideIndex >= total - 1) {
            setIsAuto(false);
            return undefined;
        }
        autoTimerRef.current = setTimeout(() => goTo(slideIndex + 1), (slides[slideIndex]?.duration || 5) * 1000);
        return () => clearTimeout(autoTimerRef.current);
    }, [isAuto, slideIndex, total]);

    // A new song starts with auto off, and in rehearsal at its first slide.
    const songKey = content?.startedAt ?? content?.title;
    useEffect(() => {
        setIsAuto(false);
        setLocalIndex(0);
    }, [songKey]);

    const toggleAuto = () => setIsAuto((on) => !on);

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
        };
    }, []);

    const panelStyle = pos.x !== null
        ? { position: "fixed", left: pos.x, top: pos.y, zIndex: 50 }
        : { position: "fixed", bottom: 16, left: 16, zIndex: 50 };

    // Nothing live (stopped here or elsewhere): no panel.
    if (!content) return null;

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
                    {rehearsal ? "👁 " : "🎤 "}{content?.title}
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