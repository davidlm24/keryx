import React, { useState, useEffect } from "react";
import { keryx } from "@/api/keryxClient";
import { useLiveSessionChannel } from "@/hooks/useLiveSessionChannel";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";

const FONT_SIZES = { xsmall: "1.6rem", small: "2.2rem", medium: "3rem", large: "4rem", xlarge: "5rem", xxlarge: "6.5rem" };
const FONT_FAMILIES = { sans: "Inter, sans-serif", serif: "Georgia, serif", mono: "Courier New, monospace", cursive: "'Brush Script MT', cursive", arial: "Arial, sans-serif", georgia: "Georgia, serif", times: "'Times New Roman', serif", verdana: "Verdana, sans-serif" };

export default function BibleMaterialProjection() {
    const [state, setState] = useState(null);
    const [slideIndex, setSlideIndex] = useState(0);
    const [isOnline, setIsOnline] = useState(true);
    const urlParams = new URLSearchParams(window.location.search);
    const channel = urlParams.get("channel");
    const liveChannelRef = useLiveSessionChannel();

    // Subscrição da LiveSession — limpa a tela quando a sessão termina (com filtro por canal)
    useEffect(() => {
        const unsubscribe = keryx.entities.LiveSession.subscribe((event) => {
            if (event.type === 'create' && event.data?.status === "active" && !liveChannelRef.current) {
                liveChannelRef.current = event.data.channel;
            }
            if ((event.type === 'create' || event.type === 'update') && event.data?.status === "ended") {
                if (!liveChannelRef.current || event.data.channel === liveChannelRef.current) {
                    setState(null);
                    setSlideIndex(0);
                }
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!channel) return;
        const fetchLatest = async () => {
            try {
                const records = await keryx.entities.BibleProjectionSync.filter({ channel }, "-timestamp", 1);
                if (records[0]) applyState(records[0]);
            } catch (e) { console.error(e); }
        };
        fetchLatest();
        const unsubscribe = keryx.entities.BibleProjectionSync.subscribe((event) => {
            if (event.data?.channel !== channel) return;
            fetchLatest();
        });
        const handleVisibility = () => { if (!document.hidden) fetchLatest(); };
        const handleOnline = () => fetchLatest();
        document.addEventListener("visibilitychange", handleVisibility);
        window.addEventListener("online", handleOnline);
        return () => { unsubscribe(); document.removeEventListener("visibilitychange", handleVisibility); window.removeEventListener("online", handleOnline); };
    }, [channel]);

    const applyState = (rec) => {
        if (rec.action === "stop") { setState(null); setSlideIndex(0); return; }
        if (rec.action === "slide") { setSlideIndex(rec.slide_index || 0); return; }
        setState(rec);
        setSlideIndex(rec.slide_index || 0);
    };

    useEffect(() => {
        const onKey = (e) => {
            if (!state || state.content_type !== "slides") return;
            const slides = state.slides || [];
            if (e.key === "ArrowRight" || e.key === "ArrowDown") setSlideIndex(i => Math.min(i + 1, slides.length - 1));
            if (e.key === "ArrowLeft" || e.key === "ArrowUp") setSlideIndex(i => Math.max(i - 1, 0));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [state]);

    useEffect(() => {
        const tryFs = () => { if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {}); };
        const onFirstClick = () => { tryFs(); document.removeEventListener("click", onFirstClick); };
        document.addEventListener("click", onFirstClick);
        return () => document.removeEventListener("click", onFirstClick);
    }, []);

    if (!channel) {
        return <div className="fixed inset-0 bg-black flex items-center justify-center text-white/50 text-xl">Canal de projeção não especificado</div>;
    }

    if (!state) {
        return (
            <div className="fixed inset-0 flex flex-col items-center justify-center text-white" style={{ background: "#0f172a" }}>
                <div className="text-6xl mb-4">📖</div>
                <h1 className="text-3xl font-bold mb-2">Escola Bíblica</h1>
                <p className="text-white/50">A aguardar conteúdo do operador...</p>
                <p className="text-white/30 text-xs mt-6">Canal: {channel.slice(0, 8)}...</p>
            </div>
        );
    }

    const fontSize = FONT_SIZES[state.font_size] || FONT_SIZES.large;
    const fontFamily = FONT_FAMILIES[state.font_family] || FONT_FAMILIES.sans;
    const bg = state.background_image;
    const bgColor = state.background_color || "#0f172a";
    const textColor = state.text_color || "#ffffff";

    const renderContent = () => {
        if (state.content_type === "slides" || state.content_type === "text") {
            const slides = state.slides || [];
            const current = slides[slideIndex];
            if (!current) return null;
            const hasImage = !!current.image_url;
            return (
                <div className={`w-full ${hasImage ? "px-6" : "px-12"} flex flex-col md:flex-row items-center justify-center gap-8 ${hasImage ? "md:gap-12" : ""}`}>
                    {hasImage && (
                        <img src={current.image_url} alt="" className="max-h-[80vh] max-w-full md:max-w-[45%] rounded-2xl object-contain shadow-2xl" />
                    )}
                    <div className={`${hasImage ? "text-left md:text-left flex-1" : "text-center"} px-4`} style={{ color: textColor, fontSize, fontFamily, lineHeight: 1.3, filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.8))" }}>
                        <p className="whitespace-pre-wrap max-w-5xl">{current.text}</p>
                    </div>
                    {slides.length > 1 && <p className="absolute bottom-4 right-6 text-base opacity-50" style={{ color: textColor }}>{slideIndex + 1} / {slides.length}</p>}
                </div>
            );
        }
        if (state.content_type === "quiz") {
            return (
                <div className="w-full max-w-4xl px-12 flex flex-col items-center justify-center text-center">
                    <div className="flex items-center gap-3 mb-6">
                        <span className="text-xl px-4 py-1 rounded-full" style={{ backgroundColor: "#f59e0b30", color: "#fbbf24" }}>Quiz</span>
                        {state.quiz_questions?.length > 1 && <span className="text-lg opacity-60" style={{ color: textColor }}>Pergunta {(state.quiz_index ?? 0) + 1} / {state.quiz_questions.length}</span>}
                    </div>
                    <h2 className="text-4xl font-bold mb-10" style={{ color: textColor, filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.8))" }}>{state.quiz_question}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
                        {state.quiz_options?.map((opt, i) => {
                            const isCorrect = state.quiz_reveal && i === state.quiz_correct;
                            return (
                                <div key={i} className="text-2xl font-semibold rounded-2xl px-6 py-4 border-2 flex items-center gap-3"
                                    style={{
                                        borderColor: isCorrect ? "#10b981" : "rgba(255,255,255,0.25)",
                                        backgroundColor: isCorrect ? "#10b98125" : "rgba(255,255,255,0.08)",
                                        color: isCorrect ? "#34d399" : textColor
                                    }}>
                                    <span className="w-8 h-8 rounded-full flex items-center justify-center text-sm" style={{ backgroundColor: isCorrect ? "#10b981" : "rgba(255,255,255,0.15)" }}>{String.fromCharCode(65 + i)}</span>
                                    {opt}
                                </div>
                            );
                        })}
                    </div>
                </div>
            );
        }
        if (state.content_type === "video") {
            const url = state.media_url || "";
            const isYT = url.includes("youtube") || url.includes("youtu.be");
            if (isYT) {
                const ytId = url.includes("youtu.be/") ? url.split("youtu.be/")[1].split(/[?&]/)[0] : url.split("v=")[1]?.split("&")[0];
                return <iframe className="w-full h-full" src={`https://www.youtube.com/embed/${ytId}?autoplay=1`} allow="autoplay; fullscreen" frameBorder="0" />;
            }
            return <video src={url} autoPlay controls className="max-h-full max-w-full" style={{ width: "100%", height: "100%" }} />;
        }
        if (state.content_type === "image") {
            return <img src={state.media_url} alt={state.title} className="max-h-full max-w-full object-contain" />;
        }
        return null;
    };

    return (
        <div className="fixed inset-0 flex items-center justify-center overflow-hidden" style={{ background: bg ? `url(${bg}) center/cover` : bgColor }}>
            {bg && <div className="absolute inset-0 bg-black/50" />}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                {state.title && (state.content_type === "slides" || state.content_type === "text") && (
                    <h1 className="absolute top-6 left-1/2 -translate-x-1/2 text-lg opacity-50" style={{ color: textColor }}>{state.title}</h1>
                )}
                {renderContent()}
            </div>
            <AlertOverlayRenderer />
        </div>
    );
}