import React, { useState, useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import AnimatedBackground from "./AnimatedBackground";
import { FONT_SIZES, FONT_FAMILIES, FONT_WEIGHTS, getTextEffectStyle } from "./BannerPresets";

const getTransition = (speed) => ({
    duration: Math.max(0.2, speed),
    ease: [0.16, 1, 0.3, 1],
});

function getAnimationVariants(animationId, speed) {
    const t = getTransition(speed);
    switch (animationId) {
        case 'fade_in':
            return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: t };
        case 'fade_out':
            return { initial: { opacity: 1 }, animate: { opacity: 0.3 }, exit: { opacity: 0 }, transition: t };
        case 'zoom':
            return { initial: { opacity: 0, scale: 0.6 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 1.3 }, transition: t };
        case 'slide_up':
            return { initial: { opacity: 0, y: 80 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -80 }, transition: t };
        case 'slide_down':
            return { initial: { opacity: 0, y: -80 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: 80 }, transition: t };
        case 'slide_left':
            return { initial: { opacity: 0, x: 100 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -100 }, transition: t };
        case 'slide_right':
            return { initial: { opacity: 0, x: -100 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 100 }, transition: t };
        case 'blur_reveal':
            return {
                initial: { opacity: 0, filter: "blur(20px)" },
                animate: { opacity: 1, filter: "blur(0px)" },
                exit: { opacity: 0, filter: "blur(20px)" },
                transition: t,
            };
        case 'glow':
            return {
                initial: { opacity: 0, textShadow: "0 0 0px rgba(255,255,255,0)" },
                animate: { opacity: 1, textShadow: "0 0 30px rgba(255,255,255,0.8), 0 0 60px rgba(255,255,255,0.4)" },
                exit: { opacity: 0, textShadow: "0 0 0px rgba(255,255,255,0)" },
                transition: t,
            };
        case 'rotate':
            return { initial: { opacity: 0, rotate: -15, scale: 0.5 }, animate: { opacity: 1, rotate: 0, scale: 1 }, exit: { opacity: 0, rotate: 15, scale: 1.3 }, transition: t };
        case 'flip':
            return { initial: { opacity: 0, rotateY: 90 }, animate: { opacity: 1, rotateY: 0 }, exit: { opacity: 0, rotateY: -90 }, transition: t };
        case 'bounce':
            return { initial: { opacity: 0, y: -100 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -100 }, transition: { ...t, type: "spring", bounce: 0.6 } };
        case 'elastic':
            return { initial: { opacity: 0, scale: 0 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0 }, transition: { ...t, type: "spring", stiffness: 200, damping: 12 } };
        case 'scale_pulse':
            return { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 1, scale: [1, 1.05, 1] }, exit: { opacity: 0, scale: 0.8 }, transition: { ...t, repeat: Infinity, repeatDelay: 1 } };
        case 'shimmer':
            return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: t };
        case 'typewriter':
            return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: t };
        default:
            return { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: t };
    }
}

const ALIGN_CLASSES = {
    'left': 'items-start text-left',
    'center': 'items-center text-center',
    'right': 'items-end text-right',
};

const VALIGN_CLASSES = {
    'top': 'justify-start',
    'middle': 'justify-center',
    'bottom': 'justify-end',
};

export default function BannerPreview({ banner, isPlaying = true, onProject }) {
    const [currentPhraseIndex, setCurrentPhraseIndex] = useState(0);
    const [countdown, setCountdown] = useState(banner?.countdown_duration || 60);
    const [typewriterText, setTypewriterText] = useState('');
    const audioRef = useRef(null);
    const phraseTimerRef = useRef(null);

    const phrases = banner?.phrases?.filter(p => p?.trim()) || (banner?.title ? [banner.title] : []);
    const animationSpeed = banner?.animation_speed || 1;
    const anim = getAnimationVariants(banner?.animation, animationSpeed);
    const fontClass = FONT_SIZES[banner?.font_size] || FONT_SIZES.xlarge;
    const fontFamily = FONT_FAMILIES[banner?.font_family] || FONT_FAMILIES.sans;
    const fontWeight = FONT_WEIGHTS[banner?.text_weight] || 700;
    const textColor = banner?.text_color || '#ffffff';
    const textColor2 = banner?.text_color_2;
    const alignH = banner?.text_align_h || 'center';
    const alignV = banner?.text_align_v || 'middle';
    const letterSpacing = banner?.text_letter_spacing || 0;
    const lineHeight = banner?.text_line_height || 1.2;
    const textTransform = banner?.text_transform || 'none';
    const textEffect = banner?.text_effect || 'shadow';
    const textEffectColor = banner?.text_effect_color || '#000000';
    const textPadding = banner?.text_padding ?? 8;
    const bgSpeed = banner?.background_speed || 1;
    const bgIntensity = banner?.background_intensity ?? 0.5;
    const bgOverlay = banner?.background_overlay ?? 0.3;

    useEffect(() => {
        if (!isPlaying || phrases.length <= 1) return;
        if (banner?.category === 'countdown') return;
        phraseTimerRef.current = setInterval(() => {
            setCurrentPhraseIndex(prev => (prev + 1) % phrases.length);
        }, (banner?.phrase_duration || 3) * 1000);
        return () => clearInterval(phraseTimerRef.current);
    }, [isPlaying, phrases.length, banner?.phrase_duration, banner?.category]);

    useEffect(() => {
        if (banner?.category !== 'countdown' || !isPlaying) return;
        setCountdown(banner.countdown_duration);
        const timer = setInterval(() => {
            setCountdown(prev => prev <= 1 ? banner.countdown_duration : prev - 1);
        }, 1000);
        return () => clearInterval(timer);
    }, [banner?.category, banner?.countdown_duration, isPlaying]);

    useEffect(() => {
        if (banner?.animation !== 'typewriter' || !isPlaying) {
            setTypewriterText('');
            return;
        }
        const fullText = phrases[currentPhraseIndex] || '';
        setTypewriterText('');
        let i = 0;
        const interval = setInterval(() => {
            if (i < fullText.length) {
                setTypewriterText(fullText.slice(0, i + 1));
                i++;
            } else {
                clearInterval(interval);
            }
        }, Math.max(30, animationSpeed * 50));
        return () => clearInterval(interval);
    }, [currentPhraseIndex, banner?.animation, isPlaying, animationSpeed, phrases]);

    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !banner?.audio_url) return;
        audio.volume = banner.audio_volume ?? 0.7;
        audio.loop = banner.audio_loop ?? true;

        if (isPlaying) {
            if (banner.audio_fade_in) {
                audio.volume = 0;
                audio.play().catch(() => {});
                const fadeInterval = setInterval(() => {
                    if (audio.volume < (banner.audio_volume ?? 0.7) - 0.05) {
                        audio.volume = Math.min(audio.volume + 0.05, banner.audio_volume ?? 0.7);
                    } else {
                        audio.volume = banner.audio_volume ?? 0.7;
                        clearInterval(fadeInterval);
                    }
                }, 100);
            } else {
                audio.volume = banner.audio_volume ?? 0.7;
                audio.play().catch(() => {});
            }
        } else {
            if (banner.audio_fade_out) {
                const fadeInterval = setInterval(() => {
                    if (audio.volume > 0.05) {
                        audio.volume = Math.max(audio.volume - 0.05, 0);
                    } else {
                        audio.volume = 0;
                        audio.pause();
                        clearInterval(fadeInterval);
                    }
                }, 100);
            } else {
                audio.pause();
            }
        }
    }, [isPlaying, banner?.audio_url, banner?.audio_volume, banner?.audio_fade_in, banner?.audio_fade_out, banner?.audio_loop]);

    useEffect(() => {
        setCurrentPhraseIndex(0);
    }, [banner?.id]);

    if (!banner) {
        return (
            <div className="w-full aspect-video bg-slate-900 rounded-xl flex items-center justify-center text-slate-500">
                Selecione um template para pré-visualizar
            </div>
        );
    }

    const effectStyle = getTextEffectStyle(textEffect, textEffectColor);
    const textStyle = {
        color: textColor,
        fontFamily,
        fontWeight,
        letterSpacing: `${letterSpacing}px`,
        lineHeight,
        textTransform,
        backgroundImage: textColor2 ? `linear-gradient(135deg, ${textColor}, ${textColor2})` : undefined,
        WebkitBackgroundClip: textColor2 ? 'text' : undefined,
        WebkitTextFillColor: textColor2 ? 'transparent' : undefined,
        backgroundClip: textColor2 ? 'text' : undefined,
        ...effectStyle,
    };

    const formatTime = (seconds) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    };

    const isTypewriter = banner.animation === 'typewriter';
    const displayText = isTypewriter ? typewriterText : (phrases[currentPhraseIndex] || '');

    return (
        <div className="w-full aspect-video bg-black rounded-xl overflow-hidden relative shadow-2xl">
            <AnimatedBackground
                backgroundId={banner.background_id}
                customImage={banner.custom_image}
                speed={bgSpeed}
                intensity={bgIntensity}
                overlay={bgOverlay}
            />

            {banner.audio_url && (
                <audio ref={audioRef} src={banner.audio_url} preload="auto" />
            )}

            <div className={`absolute inset-0 flex flex-col ${VALIGN_CLASSES[alignV]}`} style={{ padding: `${textPadding * 4}px` }}>
                <div className={`flex flex-col ${ALIGN_CLASSES[alignH]} w-full max-w-4xl mx-auto`}>
                    {banner.category === 'countdown' ? (
                        <motion.div
                            key="countdown"
                            initial={anim.initial}
                            animate={anim.animate}
                            transition={anim.transition}
                            className="flex flex-col items-center gap-6"
                        >
                            {banner.title && (
                                <p className={`${FONT_SIZES.large} font-semibold`} style={textStyle}>
                                    {banner.title}
                                </p>
                            )}
                            <p className={`${FONT_SIZES.xxxlarge} font-bold tabular-nums`} style={textStyle}>
                                {formatTime(countdown)}
                            </p>
                            {banner.subtitle && (
                                <p className={`${FONT_SIZES.medium} font-light opacity-80`} style={textStyle}>
                                    {banner.subtitle}
                                </p>
                            )}
                        </motion.div>
                    ) : banner.category === 'announcement' ? (
                        <motion.div
                            key="announcement"
                            initial={anim.initial}
                            animate={anim.animate}
                            transition={anim.transition}
                            className="flex flex-col gap-4 w-full"
                        >
                            {banner.title && (
                                <h1 className={`${fontClass} leading-tight`} style={textStyle}>
                                    {banner.title}
                                </h1>
                            )}
                            {banner.subtitle && (
                                <p className={`${FONT_SIZES.medium} font-light opacity-90`} style={textStyle}>
                                    {banner.subtitle}
                                </p>
                            )}
                            <div className="flex flex-wrap items-center justify-center gap-6 mt-4">
                                {banner.event_date && (
                                    <div className={`${FONT_SIZES.small} font-semibold`} style={textStyle}>
                                        📅 {banner.event_date}
                                    </div>
                                )}
                                {banner.event_time && (
                                    <div className={`${FONT_SIZES.small} font-semibold`} style={textStyle}>
                                        🕐 {banner.event_time}
                                    </div>
                                )}
                                {banner.location && (
                                    <div className={`${FONT_SIZES.small} font-semibold`} style={textStyle}>
                                        📍 {banner.location}
                                    </div>
                                )}
                            </div>
                            {banner.description && (
                                <p className={`${FONT_SIZES.small} opacity-75 max-w-2xl mt-4`} style={textStyle}>
                                    {banner.description}
                                </p>
                            )}
                        </motion.div>
                    ) : (
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={currentPhraseIndex}
                                initial={anim.initial}
                                animate={anim.animate}
                                exit={anim.exit}
                                transition={anim.transition}
                                className="flex flex-col w-full"
                            >
                                <p className={`${fontClass} leading-tight`} style={textStyle}>
                                    {displayText}{isTypewriter && isPlaying && <span className="animate-pulse">|</span>}
                                </p>
                            </motion.div>
                        </AnimatePresence>
                    )}
                </div>
            </div>

            {onProject && (
                <button
                    onClick={onProject}
                    className="absolute bottom-3 right-3 z-20 bg-black/60 backdrop-blur-sm text-white px-3 py-1.5 rounded-lg text-xs hover:bg-black/80 transition flex items-center gap-1.5"
                >
                    <span>⛶</span> Projetar
                </button>
            )}
        </div>
    );
}