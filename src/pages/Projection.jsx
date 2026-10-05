import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import CommunicationProjectionView from "@/components/projection/CommunicationProjectionView";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";

export default function Projection() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [slides, setSlides] = useState([]);
    const [isPlaying, setIsPlaying] = useState(false);
    const [songTitle, setSongTitle] = useState("");
    const [mediaMode, setMediaMode] = useState(null);
    const [mediaUrl, setMediaUrl] = useState("");
    const [audioUrl, setAudioUrl] = useState(null);
    const [audioRef, setAudioRef] = useState(null);
    const [backgroundImage, setBackgroundImage] = useState(null);
    const [manualControl, setManualControl] = useState(false);
    const [fontSize, setFontSize] = useState("large");
    const [fontFamily, setFontFamily] = useState("sans");
    const [textEffect, setTextEffect] = useState("shadow");
    const [playlist, setPlaylist] = useState([]);
    const [currentMediaIndex, setCurrentMediaIndex] = useState(0);
    const [isSequencePlaying, setIsSequencePlaying] = useState(false);

    // Modos de ferramentas: relógio, cronómetro, temporizador, tela preta, texto livre
    const [toolMode, setToolMode] = useState(null); // "clock" | "stopwatch" | "timer" | "black" | "freetext" | null
    const [toolData, setToolData] = useState({}); // { text, endTime, startTime, text_color, font_size }
    const [toolTick, setToolTick] = useState(0); // força re-render a cada segundo

    // Comunicação Visual (contagens regressivas, anúncios) — janela unificada
    const [commPayload, setCommPayload] = useState(null);
    const [commKey, setCommKey] = useState(0);

    const goFullscreen = () => {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) {
            el.requestFullscreen().catch(() => {});
        }
    };

    // Tentar ecrã inteiro ao carregar (silencioso se o navegador exigir gesto)
    useEffect(() => { goFullscreen(); }, []);

    // Tick para relógio/cronómetro/temporizador
    useEffect(() => {
        if (!toolMode || toolMode === "black" || toolMode === "freetext") return;
        const interval = setInterval(() => setToolTick(t => t + 1), 1000);
        return () => clearInterval(interval);
    }, [toolMode]);

    // Auto-advance images in sequence mode
    useEffect(() => {
        if (!isSequencePlaying || playlist.length === 0) return;
        const currentMedia = playlist[currentMediaIndex];
        if (currentMedia?.type !== "image" && currentMedia?.type !== "gif") return;
        const timer = setTimeout(() => {
            setCurrentMediaIndex((prev) => (prev + 1) % playlist.length);
        }, 5000);
        return () => clearTimeout(timer);
    }, [currentMediaIndex, isSequencePlaying, playlist]);

    useEffect(() => {
        // Notify parent window that projection is ready
        if (window.opener) {
            window.opener.postMessage({ type: "PROJECTION_READY" }, "*");
        }

        // Listen for messages from the control window
        const handleMessage = (event) => {
            console.log("Projection received message:", event.data);
            
            if (event.data.type === "PROJECTION_DATA") {
                setCommPayload(null);
                setIsSequencePlaying(false);
                setPlaylist([]);
                setMediaMode(null);
                const slidesWithStyle = (event.data.slides || []).map(slide => ({
                    ...slide,
                    text_color: event.data.text_color,
                    text_color_2: event.data.text_color_2,
                    text_effect: event.data.text_effect,
                    is_bible: event.data.is_bible || false,
                    bible_reference: event.data.bible_reference || null,
                }));
                setSlides(slidesWithStyle);
                setSongTitle(event.data.title || "");
                setAudioUrl(event.data.audio_url || null);
                setBackgroundImage(event.data.background_image || null);
                setFontSize(event.data.font_size || "large");
                setFontFamily(event.data.font_family || "sans");
                setTextEffect(event.data.text_effect || "shadow");
                setCurrentSlide(0);
                setIsPlaying(true);
            } else if (event.data.type === "MEDIA_PROJECTION") {
                setCommPayload(null);
                setIsSequencePlaying(false);
                setPlaylist([]);
                setSlides([]);
                setIsPlaying(false);
                setMediaMode(event.data.mediaType);
                setMediaUrl(event.data.fileUrl);
                setSongTitle(event.data.title || "");
            } else if (event.data.type === "MEDIA_SEQUENCE") {
                setCommPayload(null);
                setSlides([]);
                setIsPlaying(false);
                setPlaylist(event.data.playlist);
                setCurrentMediaIndex(0);
                setIsSequencePlaying(true);
            } else if (event.data.type === "STOP_PROJECTION") {
                setCommPayload(null);
                setIsPlaying(false);
                setMediaMode(null);
                setIsSequencePlaying(false);
                setPlaylist([]);
            } else if (event.data.type === "COMMUNICATION_DATA") {
                setSlides([]);
                setIsPlaying(false);
                setMediaMode(null);
                setIsSequencePlaying(false);
                setPlaylist([]);
                setToolMode(null);
                setCommPayload({ video: event.data.video });
                setCommKey((k) => k + 1);
            } else if (event.data.type === "COMMUNICATION_SEQUENCE") {
                setSlides([]);
                setIsPlaying(false);
                setMediaMode(null);
                setToolMode(null);
                setCommPayload({ playlist: event.data.playlist, isSequence: true });
                setCommKey((k) => k + 1);
            } else if (event.data.type === "SLIDE_INDEX") {
                setCurrentSlide(event.data.index);
                setManualControl(true);
            } else if (event.data.type === "PROJECTION_TOOL") {
                // Ferramentas: clock, stopwatch, timer, black, freetext
                setCommPayload(null);
                if (event.data.mode === "stop") {
                    setToolMode(null);
                    setToolData({});
                } else {
                    setToolMode(event.data.mode);
                    setToolData(event.data.payload || {});
                    // Limpa modo de slides quando ativa uma ferramenta
                    setSlides([]);
                    setIsPlaying(false);
                    setMediaMode(null);
                    setIsSequencePlaying(false);
                    setPlaylist([]);
                }
            }
        };

        window.addEventListener("message", handleMessage);
        return () => window.removeEventListener("message", handleMessage);
    }, []);

    useEffect(() => {
        if (!isPlaying || slides.length === 0 || manualControl) return;

        const currentSlideDuration = slides[currentSlide]?.duration || 10;
        const timer = setTimeout(() => {
            if (currentSlide < slides.length - 1) {
                setCurrentSlide(currentSlide + 1);
            } else {
                setIsPlaying(false);
                if (audioRef) {
                    audioRef.pause();
                }
            }
        }, currentSlideDuration * 1000);

        return () => clearTimeout(timer);
    }, [currentSlide, isPlaying, slides, audioRef, manualControl]);

    useEffect(() => {
        if (audioUrl && isPlaying && audioRef) {
            audioRef.play();
        }
    }, [audioUrl, isPlaying, audioRef]);

    useEffect(() => {
        const handleKeyPress = (e) => {
            if (slides.length === 0) return;

            if (e.key === "ArrowRight" || e.key === " ") {
                e.preventDefault();
                if (currentSlide < slides.length - 1) {
                    setCurrentSlide(currentSlide + 1);
                    setManualControl(true);
                }
            } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                if (currentSlide > 0) {
                    setCurrentSlide(currentSlide - 1);
                    setManualControl(true);
                }
            } else if (e.key === "a" || e.key === "A") {
                setManualControl(!manualControl);
            }
        };

        const handleClick = (e) => {
            if (slides.length === 0) return;

            const clickX = e.clientX;
            const screenWidth = window.innerWidth;

            if (clickX > screenWidth / 2) {
                // Clique na metade direita - avançar
                if (currentSlide < slides.length - 1) {
                    setCurrentSlide(currentSlide + 1);
                    setManualControl(true);
                }
            } else {
                // Clique na metade esquerda - voltar
                if (currentSlide > 0) {
                    setCurrentSlide(currentSlide - 1);
                    setManualControl(true);
                }
            }
        };

        window.addEventListener("keydown", handleKeyPress);
        window.addEventListener("click", handleClick);

        return () => {
            window.removeEventListener("keydown", handleKeyPress);
            window.removeEventListener("click", handleClick);
        };
    }, [currentSlide, slides, manualControl]);

    // === Modos de Ferramentas ===
    if (toolMode === "black") {
        return <div className="min-h-screen bg-black" />;
    }

    if (toolMode === "clock") {
        const now = new Date();
        const timeStr = now.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        const dateStr = now.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
        const fontSizeMap = { small: "text-5xl", medium: "text-7xl", large: "text-8xl", xlarge: "text-9xl" };
        const fs = fontSizeMap[toolData.font_size] || "text-8xl";
        const bg = toolData.background_image;
        const isImg = bg && (bg.startsWith("http") || bg.startsWith("data:"));
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-black relative overflow-hidden"
                style={isImg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}>
                {isImg && <div className="absolute inset-0 bg-black/50" />}
                <div className="relative z-10 text-center">
                    <p className={`${fs} font-bold font-mono`}
                        style={{ color: toolData.text_color || "#ffffff", textShadow: "4px 4px 12px rgba(0,0,0,0.8)" }}>
                        {timeStr}
                    </p>
                    <p className="text-2xl md:text-3xl mt-4 font-medium capitalize"
                        style={{ color: toolData.text_color || "#ffffff", textShadow: "2px 2px 8px rgba(0,0,0,0.8)" }}>
                        {dateStr}
                    </p>
                </div>
            </div>
        );
    }

    if (toolMode === "stopwatch") {
        const elapsed = toolData.startTime ? Math.floor((Date.now() - toolData.startTime) / 1000) : 0;
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;
        const timeStr = `${hours > 0 ? String(hours).padStart(2, "0") + ":" : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        const fontSizeMap = { small: "text-5xl", medium: "text-7xl", large: "text-8xl", xlarge: "text-9xl" };
        const fs = fontSizeMap[toolData.font_size] || "text-8xl";
        const bg = toolData.background_image;
        const isImg = bg && (bg.startsWith("http") || bg.startsWith("data:"));
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-black relative overflow-hidden"
                style={isImg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}>
                {isImg && <div className="absolute inset-0 bg-black/50" />}
                <div className="relative z-10 text-center">
                    <p className="text-xl md:text-2xl text-white/50 mb-4 uppercase tracking-widest">Cronómetro</p>
                    <p className={`${fs} font-bold font-mono`}
                        style={{ color: toolData.text_color || "#ffffff", textShadow: "4px 4px 12px rgba(0,0,0,0.8)" }}>
                        {timeStr}
                    </p>
                </div>
            </div>
        );
    }

    if (toolMode === "timer") {
        const remaining = toolData.endTime ? Math.max(0, Math.ceil((toolData.endTime - Date.now()) / 1000)) : 0;
        const hours = Math.floor(remaining / 3600);
        const minutes = Math.floor((remaining % 3600) / 60);
        const seconds = remaining % 60;
        const timeStr = `${hours > 0 ? String(hours).padStart(2, "0") + ":" : ""}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
        const fontSizeMap = { small: "text-5xl", medium: "text-7xl", large: "text-8xl", xlarge: "text-9xl" };
        const fs = fontSizeMap[toolData.font_size] || "text-8xl";
        const bg = toolData.background_image;
        const isImg = bg && (bg.startsWith("http") || bg.startsWith("data:"));
        const isFinished = remaining === 0 && toolData.endTime;
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-black relative overflow-hidden"
                style={isImg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" } : {}}>
                {isImg && <div className="absolute inset-0 bg-black/50" />}
                <div className="relative z-10 text-center">
                    <p className="text-xl md:text-2xl text-white/50 mb-4 uppercase tracking-widest">Temporizador</p>
                    <p className={`${fs} font-bold font-mono`}
                        style={{
                            color: isFinished ? "#ef4444" : (toolData.text_color || "#ffffff"),
                            textShadow: isFinished ? "0 0 30px rgba(239,68,68,0.8)" : "4px 4px 12px rgba(0,0,0,0.8)",
                        }}>
                        {timeStr}
                    </p>
                </div>
            </div>
        );
    }

    if (toolMode === "freetext") {
        const fontSizeMap = { small: "text-3xl", medium: "text-5xl", large: "text-6xl", xlarge: "text-7xl", xxlarge: "text-8xl" };
        const fs = fontSizeMap[toolData.font_size] || "text-6xl";
        const bg = toolData.background_image;
        const isImg = bg && (bg.startsWith("http") || bg.startsWith("data:"));
        const isGradient = bg && bg.includes("gradient");
        return (
            <div className="min-h-screen flex flex-col items-center justify-center p-12 relative overflow-hidden"
                style={isImg ? { backgroundImage: `url(${bg})`, backgroundSize: "cover", backgroundPosition: "center" } : isGradient ? { background: bg } : {}}>
                {isImg && <div className="absolute inset-0 bg-black/50" />}
                {!bg && <div className="absolute inset-0 bg-gradient-to-br from-background via-accent/20 to-primary/20" />}
                <div className="relative z-10 w-full max-w-6xl text-center">
                    <p className={`${fs} font-bold leading-relaxed whitespace-pre-wrap`}
                        style={{ color: toolData.text_color || "#ffffff", textShadow: "4px 4px 12px rgba(0,0,0,0.8)" }}>
                        {toolData.text || ""}
                    </p>
                </div>
            </div>
        );
    }

    // Comunicação Visual (contagens regressivas, anúncios)
    if (commPayload) {
        return <CommunicationProjectionView key={commKey} {...commPayload} />;
    }

    // Sequence/Playlist mode
    if (isSequencePlaying && playlist.length > 0) {
        const currentMedia = playlist[currentMediaIndex];
        
        const handleMediaEnded = () => {
            setCurrentMediaIndex((prev) => (prev + 1) % playlist.length);
        };

        if (currentMedia.type === "video") {
            return (
                <div className="min-h-screen bg-black flex flex-col items-center justify-center">
                    <div className="absolute top-4 right-4 text-white bg-black/50 px-4 py-2 rounded">
                        {currentMediaIndex + 1} / {playlist.length}
                    </div>
                    <video
                        key={currentMedia.id}
                        src={currentMedia.file_url}
                        autoPlay
                        onEnded={handleMediaEnded}
                        className="w-full h-full object-contain"
                    />
                </div>
            );
        } else if (currentMedia.type === "image" || currentMedia.type === "gif") {
            return (
                <div className="min-h-screen bg-black flex flex-col items-center justify-center">
                    <div className="absolute top-4 right-4 text-white bg-black/50 px-4 py-2 rounded">
                        {currentMediaIndex + 1} / {playlist.length}
                    </div>
                    <img
                        key={currentMedia.id}
                        src={currentMedia.file_url}
                        alt={currentMedia.title}
                        className="max-w-full max-h-screen object-contain"
                    />
                </div>
            );
        } else if (currentMedia.type === "pdf") {
            return (
                <div className="min-h-screen bg-black flex flex-col">
                    <div className="absolute top-4 right-4 text-white bg-black/50 px-4 py-2 rounded z-10">
                        {currentMediaIndex + 1} / {playlist.length}
                    </div>
                    <iframe
                        key={currentMedia.id}
                        src={currentMedia.file_url}
                        title={currentMedia.title}
                        className="w-full h-screen border-0"
                    />
                </div>
            );
        }
    }

    // Media projection mode
    if (mediaMode === "video") {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <video
                    src={mediaUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-contain"
                />
            </div>
        );
    }

    if (mediaMode === "image") {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8">
                <h2 className="text-3xl font-semibold text-white mb-4">{songTitle}</h2>
                <img
                    src={mediaUrl}
                    alt={songTitle}
                    className="max-w-full max-h-[85vh] object-contain"
                />
            </div>
        );
    }

    if (mediaMode === "gif") {
        return (
            <div className="min-h-screen bg-black flex flex-col items-center justify-center">
                <img
                    src={mediaUrl}
                    alt={songTitle}
                    className="max-w-full max-h-screen object-contain"
                />
            </div>
        );
    }

    if (mediaMode === "pdf") {
        return (
            <div className="min-h-screen bg-black flex items-center justify-center">
                <iframe
                    src={mediaUrl}
                    title={songTitle}
                    className="w-full h-screen border-0"
                />
            </div>
        );
    }

    if (mediaMode === "powerpoint") {
        return (
            <div className="min-h-screen bg-gradient-to-br from-background via-primary/20 to-accent/20 flex flex-col items-center justify-center p-8">
                <h2 className="text-3xl font-semibold text-white mb-4">{songTitle}</h2>
                <div className="bg-white/10 p-8 rounded-lg backdrop-blur-sm">
                    <p className="text-2xl text-blue-300 mb-4">
                        PowerPoint carregado
                    </p>
                    <a
                        href={mediaUrl}
                        download
                        className="text-blue-400 hover:text-blue-300 underline"
                    >
                        Baixar apresentação
                    </a>
                </div>
            </div>
        );
    }

    if (slides.length === 0) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-teal-900 to-lime-900 flex items-center justify-center">
                <TabletVideoReceiver />
                <div className="text-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="text-6xl mb-4">🎵</div>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            Aguardando Projeção
                        </h1>
                        <p className="text-lime-300 text-lg">
                            Inicie uma música na janela de controle
                        </p>
                        <button
                            onClick={goFullscreen}
                            className="mt-6 px-6 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm border border-white/20 transition"
                        >
                            Ativar Tela Cheia
                        </button>
                    </motion.div>
                </div>
            </div>
        );
    }

    const fontSizeClasses = {
        xsmall: "text-xl md:text-2xl lg:text-3xl",
        small: "text-2xl md:text-3xl lg:text-4xl",
        medium: "text-3xl md:text-4xl lg:text-5xl",
        large: "text-4xl md:text-5xl lg:text-6xl",
        xlarge: "text-5xl md:text-6xl lg:text-7xl",
        xxlarge: "text-6xl md:text-7xl lg:text-8xl",
        xxxlarge: "text-7xl md:text-8xl lg:text-9xl"
    };

    const fontFamilyClasses = {
        sans: "font-sans",
        serif: "font-serif",
        mono: "font-mono",
        cursive: "font-['Brush_Script_MT',_cursive]",
        arial: "font-['Arial',_sans-serif]",
        georgia: "font-['Georgia',_serif]",
        times: "font-['Times_New_Roman',_serif]",
        verdana: "font-['Verdana',_sans-serif]",
        trebuchet: "font-['Trebuchet_MS',_sans-serif]",
        impact: "font-['Impact',_sans-serif]",
        palatino: "font-['Palatino_Linotype',_serif]",
        garamond: "font-['Garamond',_serif]",
        helvetica: "font-['Helvetica',_sans-serif]",
        courier_new: "font-['Courier_New',_monospace]"
    };

    const getTextEffectStyle = (effect) => {
        switch(effect) {
            case "shadow":
                return { textShadow: "4px 4px 8px rgba(0,0,0,0.8)" };
            case "double-shadow":
                return { textShadow: "3px 3px 6px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.5)" };
            case "glow":
                return { textShadow: "0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.6)" };
            case "outline":
                return { textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 2px 2px 4px rgba(0,0,0,0.5)" };
            case "3d":
                return { textShadow: "1px 1px 0 #000, 2px 2px 0 #000, 3px 3px 0 #000, 4px 4px 0 #000, 5px 5px 10px rgba(0,0,0,0.5)" };
            case "neon":
                return { textShadow: "0 0 10px #fff, 0 0 20px #fff, 0 0 30px #fff, 0 0 40px #ff00ff, 0 0 70px #ff00ff" };
            default:
                return {};
        }
    };

    // Versão com drop-shadow (filter) para texto com gradiente — evita o retângulo branco
    const getEffectFilter = (effect) => {
        switch(effect) {
            case "shadow":
                return { filter: "drop-shadow(4px 4px 8px rgba(0,0,0,0.85))" };
            case "double-shadow":
                return { filter: "drop-shadow(3px 3px 6px rgba(0,0,0,0.8)) drop-shadow(-2px -2px 4px rgba(0,0,0,0.5))" };
            case "glow":
                return { filter: "drop-shadow(0 0 20px rgba(255,255,255,0.8)) drop-shadow(0 0 40px rgba(255,255,255,0.5))" };
            case "outline":
                return { filter: "drop-shadow(1px 0 0 #000) drop-shadow(-1px 0 0 #000) drop-shadow(0 1px 0 #000) drop-shadow(0 -1px 0 #000)" };
            case "3d":
                return { filter: "drop-shadow(2px 2px 0 #000) drop-shadow(4px 4px 8px rgba(0,0,0,0.5))" };
            case "neon":
                return { filter: "drop-shadow(0 0 10px #fff) drop-shadow(0 0 20px #ff00ff) drop-shadow(0 0 40px #ff00ff)" };
            default:
                return {};
        }
    };

    const getGradientTextStyle = (slide) => {
        const hasGradient = slide?.text_color_2;
        const effect = slide?.text_effect || textEffect;
        if (hasGradient) {
            return {
                background: `linear-gradient(to right, ${slide.text_color || "#ffffff"}, ${slide.text_color_2})`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: 'none',
                ...getEffectFilter(effect),
            };
        }
        return {
            color: slide?.text_color || "#ffffff",
            ...getTextEffectStyle(effect),
        };
    };

    const isGradient = backgroundImage && backgroundImage.includes('gradient');
    const isImageUrl = backgroundImage && (backgroundImage.startsWith('http') || backgroundImage.startsWith('data:'));
    const isSolidColor = backgroundImage && !isGradient && !isImageUrl;

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-12 relative overflow-hidden"
             style={isImageUrl ? {
                 backgroundImage: `url(${backgroundImage})`,
                 backgroundSize: 'cover',
                 backgroundPosition: 'center'
             } : isGradient ? {
                 background: backgroundImage
             } : isSolidColor ? {
                 backgroundColor: backgroundImage
             } : {}}>
            <TabletVideoReceiver />
            {/* Overlay escuro sobre imagem de fundo */}
            {isImageUrl && (
                <div className="absolute inset-0 bg-black/50"></div>
            )}

            {/* Background padrão com gradiente */}
            {!backgroundImage && (
                <div className="absolute inset-0 bg-gradient-to-br from-background via-accent/20 to-primary/20"></div>
            )}

            {/* Audio player (hidden) */}
            {audioUrl && (
                <audio
                    ref={setAudioRef}
                    src={audioUrl}
                    className="hidden"
                />
            )}

            {/* Background effects (só se não tiver fundo personalizado) */}
            {!backgroundImage && (
                <div className="absolute inset-0 opacity-20">
                    <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-lime-500 rounded-full blur-3xl animate-pulse"></div>
                    <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-emerald-500 rounded-full blur-3xl animate-pulse" style={{ animationDelay: "1s" }}></div>
                </div>
            )}
            
            {/* Overlay para gradientes (melhor legibilidade) */}
            {isGradient && (
                <div className="absolute inset-0 bg-black/30"></div>
            )}

            {/* Song title */}
            {songTitle && (
                <motion.div
                    initial={{ opacity: 0, y: -20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute top-8 left-0 right-0 text-center"
                >
                    <h2 className={`text-2xl font-semibold ${fontFamilyClasses[fontFamily]}`}
                        style={{
                            color: slides[currentSlide]?.text_color || "#ffffff",
                            ...getTextEffectStyle(slides[currentSlide]?.text_effect || textEffect)
                        }}>
                        {songTitle}
                    </h2>
                </motion.div>
            )}

            {/* Indicador Modo Manual/Automático — discreto em baixo */}
            <div className="absolute bottom-4 left-0 right-0 flex justify-center pointer-events-none">
                <span className="text-xs px-3 py-1 rounded-full bg-black/40 text-white/40 tracking-widest uppercase">
                    {manualControl ? "● Manual" : "▶ Automático"}
                </span>
            </div>

            {/* Main slide content */}
            <div className="relative z-10 w-full max-w-6xl px-12">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={currentSlide}
                        initial={{ opacity: 0, y: 30 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -30 }}
                        transition={{ duration: 0.5, ease: "easeInOut" }}
                        className="text-center flex flex-col items-center gap-8"
                    >
                        {slides[currentSlide]?.is_bible ? (
                            <>
                                {/* Bible reference badge — professional glass style */}
                                <div className="flex flex-col items-center gap-5">
                                    <motion.div
                                        initial={{ opacity: 0, scale: 0.92 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        transition={{ duration: 0.4 }}
                                        className="flex items-center gap-3 px-8 py-3.5 rounded-2xl backdrop-blur-md"
                                        style={{
                                            background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                                            border: "1px solid rgba(255,255,255,0.18)",
                                            boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
                                        }}
                                    >
                                        <svg className="w-5 h-5 shrink-0" style={{ color: "rgba(255,255,255,0.7)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.063.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.063.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                                        </svg>
                                        <span className={`font-bold tracking-[0.15em] uppercase text-xl ${fontFamilyClasses[fontFamily]}`}
                                            style={{
                                                color: "rgba(255,255,255,0.92)",
                                                textShadow: "0 2px 12px rgba(0,0,0,0.9)",
                                            }}>
                                            {slides[currentSlide]?.bible_reference}
                                        </span>
                                    </motion.div>
                                    {/* Elegant divider */}
                                    <div className="flex items-center gap-3 w-48">
                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
                                        <div className="w-1.5 h-1.5 rounded-full bg-white/30"></div>
                                        <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
                                    </div>
                                </div>

                                {/* Bible verse text with verse number badges */}
                                <div className={`${fontSizeClasses[fontSize]} ${fontFamilyClasses[fontFamily]} font-semibold leading-loose text-center max-h-[58vh] overflow-y-auto`}
                                    style={{
                                        color: slides[currentSlide]?.text_color || "#ffffff",
                                        ...getTextEffectStyle(slides[currentSlide]?.text_effect || textEffect)
                                    }}>
                                    {(() => {
                                        const text = slides[currentSlide]?.text || "";
                                        const verseRegex = /(\d+)\s+([\s\S]*?)(?=\s+\d+\s|$)/g;
                                        const verses = [];
                                        let m;
                                        while ((m = verseRegex.exec(text)) !== null) {
                                            verses.push({ number: m[1], text: m[2].trim() });
                                        }
                                        if (verses.length === 0 && text.trim()) {
                                            return <div className="mb-4">{text}</div>;
                                        }
                                        return verses.map((v, i) => (
                                            <div key={i} className="flex items-start justify-center gap-3 mb-5">
                                                <span className="font-bold shrink-0 rounded-md"
                                                    style={{
                                                        fontSize: "0.38em",
                                                        color: "rgba(255,255,255,0.5)",
                                                        background: "rgba(255,255,255,0.06)",
                                                        border: "1px solid rgba(255,255,255,0.12)",
                                                        lineHeight: 1.3,
                                                        padding: "0.1em 0.5em",
                                                        marginTop: "0.2em",
                                                    }}>
                                                    {v.number}
                                                </span>
                                                <span style={getGradientTextStyle(slides[currentSlide])} className="text-left flex-1">
                                                    {v.text}
                                                </span>
                                            </div>
                                        ));
                                    })()}
                                </div>

                                {/* Bottom reference */}
                                <div className="flex items-center gap-4 mt-4">
                                    <div className="h-px w-16 bg-gradient-to-r from-transparent to-white/20"></div>
                                    <span className={`text-sm font-medium tracking-[0.2em] uppercase ${fontFamilyClasses[fontFamily]}`}
                                        style={{ color: "rgba(255,255,255,0.45)", textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
                                        {slides[currentSlide]?.bible_reference}
                                    </span>
                                    <div className="h-px w-16 bg-gradient-to-l from-transparent to-white/20"></div>
                                </div>
                            </>
                        ) : (
                            <div className="flex flex-col items-center gap-4">
                                {slides[currentSlide]?.is_chorus && (
                                    <div className="px-5 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40">
                                        <span className="text-amber-300 text-sm font-bold uppercase tracking-[0.2em]"
                                            style={{ textShadow: "0 2px 8px rgba(0,0,0,0.8)" }}>
                                            ♪ Refrão
                                        </span>
                                    </div>
                                )}
                                <p 
                                    className={`${fontSizeClasses[fontSize]} ${fontFamilyClasses[fontFamily]} font-bold leading-relaxed whitespace-pre-wrap ${slides[currentSlide]?.is_chorus ? "italic" : ""}`}
                                    style={{
                                        opacity: slides[currentSlide]?.is_chorus ? 0.95 : 1,
                                        ...getGradientTextStyle(slides[currentSlide])
                                    }}
                                >
                                    {slides[currentSlide]?.text}
                                </p>
                            </div>
                        )}
                    </motion.div>
                </AnimatePresence>
            </div>


        </div>
    );
}