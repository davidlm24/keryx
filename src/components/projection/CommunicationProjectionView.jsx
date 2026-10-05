import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { base44 } from "@/api/base44Client";

/**
 * Vista de projeção de Comunicação Visual (contagens regressivas, cronómetros,
 * anúncios, imagem+texto). Props-driven — usada pela janela única /Projection.
 */
export default function CommunicationProjectionView({ video: initialVideo, playlist: initialPlaylist, isSequence }) {
    const [video, setVideo] = useState(initialVideo || null);
    const [timeRemaining, setTimeRemaining] = useState(initialVideo?.duration || 0);
    const [isRunning, setIsRunning] = useState(true);
    const [logoUrl, setLogoUrl] = useState("");
    const audioRef = useRef(null);
    const [playlist, setPlaylist] = useState(initialPlaylist || []);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isSequencePlaying, setIsSequencePlaying] = useState(!!isSequence);
    const [currentFileIndex, setCurrentFileIndex] = useState(0);
    const [filesPlaylist, setFilesPlaylist] = useState(initialVideo?.files || []);

    useEffect(() => {
        const loadLogo = async () => {
            try {
                const user = await base44.auth.me();
                setLogoUrl(user?.logo_url || "");
            } catch (error) {
                // Silenciar erro — janela de projeção pode não ter contexto de auth
            }
        };
        loadLogo();
    }, []);

    useEffect(() => {
        if (initialVideo?.sound_alert && audioRef.current) {
            audioRef.current.play().catch(() => {});
        }
    }, [initialVideo]);

    useEffect(() => {
        if (!isRunning || !video) return;

        const interval = setInterval(() => {
            setTimeRemaining((prev) => {
                if (video.type === "timer") {
                    if (prev >= video.duration && isSequencePlaying && playlist.length > 0) {
                        const nextIndex = (currentIndex + 1) % playlist.length;
                        setCurrentIndex(nextIndex);
                        setVideo(playlist[nextIndex]);
                        return 0;
                    }
                    return prev + 1;
                } else if (video.type === "countdown") {
                    if (prev <= 1) {
                        if (isSequencePlaying && playlist.length > 0) {
                            const nextIndex = (currentIndex + 1) % playlist.length;
                            setCurrentIndex(nextIndex);
                            setVideo(playlist[nextIndex]);
                            return playlist[nextIndex].duration;
                        }
                        setIsRunning(false);
                        return 0;
                    }
                    return prev - 1;
                } else {
                    if (prev >= video.duration && isSequencePlaying && playlist.length > 0) {
                        const nextIndex = (currentIndex + 1) % playlist.length;
                        setCurrentIndex(nextIndex);
                        setVideo(playlist[nextIndex]);
                        return playlist[nextIndex].duration;
                    }
                    return prev + 1;
                }
            });
        }, 1000);

        return () => clearInterval(interval);
    }, [isRunning, video, isSequencePlaying, playlist, currentIndex]);

    // Auto-advance images in files playlist
    useEffect(() => {
        if (filesPlaylist.length === 0 || !filesPlaylist[currentFileIndex]) return;

        const currentFile = filesPlaylist[currentFileIndex];
        if (currentFile.type === "image") {
            const duration = currentFile.duration || 5;
            const timer = setTimeout(() => {
                setCurrentFileIndex((currentFileIndex + 1) % filesPlaylist.length);
            }, duration * 1000);
            return () => clearTimeout(timer);
        }
    }, [currentFileIndex, filesPlaylist]);

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const fontSizeClasses = {
        small: "text-4xl md:text-5xl",
        medium: "text-5xl md:text-6xl",
        large: "text-6xl md:text-7xl",
        xlarge: "text-7xl md:text-8xl",
        xxlarge: "text-8xl md:text-9xl"
    };

    const timerSizeClasses = {
        small: "text-8xl md:text-9xl",
        medium: "text-9xl md:text-[10rem]",
        large: "text-[10rem] md:text-[12rem]",
        xlarge: "text-[12rem] md:text-[14rem]",
        xxlarge: "text-[14rem] md:text-[16rem]"
    };

    const fontFamilyMap = {
        sans: "font-sans",
        serif: "font-serif",
        mono: "font-mono",
        cursive: "font-['Brush_Script_MT',_cursive]",
        arial: "font-['Arial',_sans-serif]",
        georgia: "font-['Georgia',_serif]",
        times: "font-['Times_New_Roman',_serif]",
        verdana: "font-['Verdana',_sans-serif]"
    };

    const getTextEffectStyle = (effect) => {
        switch (effect) {
            case "shadow": return { textShadow: "4px 4px 8px rgba(0,0,0,0.8)" };
            case "double-shadow": return { textShadow: "3px 3px 6px rgba(0,0,0,0.8), -2px -2px 4px rgba(0,0,0,0.5)" };
            case "glow": return { textShadow: "0 0 20px rgba(255,255,255,0.8), 0 0 40px rgba(255,255,255,0.6)" };
            case "outline": return { textShadow: "-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000" };
            case "3d": return { textShadow: "1px 1px 0 #000, 2px 2px 0 #000, 3px 3px 0 #000, 4px 4px 0 #000, 5px 5px 10px rgba(0,0,0,0.5)" };
            case "neon": return { textShadow: "0 0 10px #fff, 0 0 20px #fff, 0 0 30px #fff, 0 0 40px #ff00ff, 0 0 70px #ff00ff" };
            default: return {};
        }
    };

    const textHPositionClasses = { left: "text-left", center: "text-center", right: "text-right" };
    const textVPositionClasses = { top: "items-start", middle: "items-center", bottom: "items-end" };

    const getTextStyle = (v) => {
        const base = { color: v.text_color, ...getTextEffectStyle(v.text_effect || "shadow") };
        if (v.text_color_2) {
            return {
                ...base,
                background: `linear-gradient(to right, ${v.text_color}, ${v.text_color_2})`,
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                textShadow: "none"
            };
        }
        return base;
    };

    if (!video) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-orange-900 to-red-900 flex items-center justify-center">
                <div className="text-center">
                    <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ duration: 0.5 }}
                    >
                        <div className="text-6xl mb-4">📢</div>
                        <h1 className="text-3xl font-bold text-white mb-2">
                            Aguardando Comunicação
                        </h1>
                        <p className="text-orange-300 text-lg">
                            Inicie uma comunicação na janela de controle
                        </p>
                    </motion.div>
                </div>
            </div>
        );
    }

    const backgroundStyle = video.background_video
        ? {}
        : video.background_image
        ? { backgroundImage: `url(${video.background_image})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: video.background_color };

    const logoPositionClasses = {
        "top-left": "top-8 left-8",
        "top-right": "top-8 right-8",
        "bottom-left": "bottom-8 left-8",
        "bottom-right": "bottom-8 right-8",
        "center": "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-12 relative overflow-hidden"
             style={backgroundStyle}>

            {filesPlaylist.length > 0 ? (
                <>
                    {filesPlaylist[currentFileIndex]?.type === "video" && (
                        <video
                            key={currentFileIndex}
                            className="absolute inset-0 w-full h-full object-cover"
                            src={filesPlaylist[currentFileIndex].url}
                            autoPlay
                            muted
                            onEnded={() => {
                                setCurrentFileIndex((currentFileIndex + 1) % filesPlaylist.length);
                            }}
                        />
                    )}
                    {filesPlaylist[currentFileIndex]?.type === "image" && (
                        <div
                            key={currentFileIndex}
                            className="absolute inset-0 w-full h-full bg-cover bg-center"
                            style={{ backgroundImage: `url(${filesPlaylist[currentFileIndex].url})` }}
                        />
                    )}
                    {filesPlaylist[currentFileIndex]?.type === "audio" && (
                        <audio
                            key={currentFileIndex}
                            autoPlay
                            onEnded={() => {
                                setCurrentFileIndex((currentFileIndex + 1) % filesPlaylist.length);
                            }}
                        >
                            <source src={filesPlaylist[currentFileIndex].url} type="audio/mpeg" />
                        </audio>
                    )}
                    <div className="absolute inset-0 bg-black/40"></div>
                </>
            ) : (
                <>
                    {video.background_video && (
                        <video
                            className="absolute inset-0 w-full h-full object-cover"
                            src={video.background_video}
                            autoPlay
                            loop
                            muted
                        />
                    )}

                    {(video.background_image || video.background_video) && (
                        <div className="absolute inset-0 bg-black/40"></div>
                    )}
                </>
            )}

            <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBTGH0fPTgjMGHm7A7+OZSA0PU6vn77FgGwY7k9jy0HotBSV6yO/glUQLFGS56OyhUhMJS6Hh8rsrJQYugNDz2IY4BxxuxO7kmEoOD1Oo5+6yYRwGPJPY8tJ6LQUlfMjv45dHChRmvOXsoVITCUui4fK6KyUGLoHO89uEOQccbsDu5JlKDQ9Tq+fvsmEcBjuU2PLQei0FJnzI7+OXRwoTZrzm7KNTEwpKouHyuiwlBi+Bz/PbhTkHG2695+SZSg4PVKvn77NgHAY7ld" />

            {video.background_audio && (
                <audio autoPlay loop>
                    <source src={video.background_audio} type="audio/mpeg" />
                </audio>
            )}

            {video.show_logo && logoUrl && (
                <motion.img
                    src={logoUrl}
                    alt="Logo"
                    className={`absolute ${logoPositionClasses[video.logo_position || "top-left"]} w-24 h-24 object-contain z-10`}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ opacity: 1, scale: 1 }}
                />
            )}

            {isSequencePlaying && playlist.length > 0 && (
                <div className="absolute top-4 right-4 bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg text-white text-sm z-10">
                    {currentIndex + 1} / {playlist.length}
                </div>
            )}

            {/* IMAGE+TEXT mode */}
            {video.type === "image_text" && (
                <div className={`absolute inset-0 z-10 flex flex-col p-12 ${textVPositionClasses[video.text_position_v || "middle"]} ${textHPositionClasses[video.text_position_h || "center"]}`}>
                    <div className={`max-w-4xl ${video.text_position_h === "right" ? "ml-auto" : video.text_position_h === "left" ? "mr-auto" : "mx-auto"}`}>
                        {video.text && (
                            <motion.h1
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className={`${fontSizeClasses[video.font_size]} font-bold leading-tight mb-4 ${fontFamilyMap[video.font_family || "sans"]} ${textHPositionClasses[video.text_position_h || "center"]}`}
                                style={getTextStyle(video)}
                            >
                                {video.text}
                            </motion.h1>
                        )}
                        {video.subtext && (
                            <motion.p
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.3 }}
                                className={`text-3xl leading-relaxed whitespace-pre-wrap ${fontFamilyMap[video.font_family || "sans"]} ${textHPositionClasses[video.text_position_h || "center"]}`}
                                style={{ color: video.text_color, ...getTextEffectStyle(video.text_effect || "shadow") }}
                            >
                                {video.subtext}
                            </motion.p>
                        )}
                    </div>
                </div>
            )}

            <div className="relative z-10 text-center">
                <AnimatePresence mode="wait">
                    {video.type === "image_text" ? null : video.type === "announcement" ? (
                        <motion.div
                            key="announcement"
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="space-y-8"
                        >
                            <motion.div
                                animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                                transition={{ duration: 2, repeat: Infinity, repeatType: "reverse" }}
                                className="text-9xl mb-8"
                            >
                                🔔
                            </motion.div>
                            {video.text && (
                                <h1 className={`${fontSizeClasses[video.font_size]} font-bold mb-6`}
                                    style={{ color: video.text_color }}>
                                    {video.text}
                                </h1>
                            )}
                            {video.subtext && (
                                <p className="text-3xl" style={{ color: video.text_color, opacity: 0.9 }}>
                                    {video.subtext}
                                </p>
                            )}
                        </motion.div>
                    ) : (
                        <motion.div
                            key="timer"
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            className="space-y-8"
                        >
                            {video.text && (
                                <h1 className={`${fontSizeClasses[video.font_size]} font-bold mb-6`}
                                    style={{ color: video.text_color }}>
                                    {video.text}
                                </h1>
                            )}

                            <motion.div
                                className={`${timerSizeClasses[video.font_size]} font-bold tabular-nums`}
                                style={{ color: video.text_color }}
                                animate={timeRemaining <= 10 && video.type === "countdown" ? {
                                    scale: [1, 1.2, 1],
                                    color: ["#ffffff", "#ff0000", "#ffffff"]
                                } : {}}
                                transition={{ duration: 1, repeat: timeRemaining <= 10 ? Infinity : 0 }}
                            >
                                {formatTime(timeRemaining)}
                            </motion.div>

                            {video.subtext && (
                                <p className="text-3xl mt-6"
                                   style={{ color: video.text_color, opacity: 0.9 }}>
                                    {video.subtext}
                                </p>
                            )}
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}