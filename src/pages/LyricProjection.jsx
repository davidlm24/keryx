import React from "react";
import { motion } from "framer-motion";
import { useLiveState } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { FONT_MAP, SIZE_MAP, getTextEffect } from "@/lib/deviceStyles";
import SlideTransition from "@/components/projection/SlideTransition";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";
import LiveOverlays from "@/components/projection/LiveOverlays";

// The lyrics screen (tablets, TVs, the "Letras" output): the live content
// (shared/live-state.mjs) with its overlays; the church logo when idle.
export default function LyricProjection() {
    const live = useLiveState();
    const content = live?.content || null;
    const idleLogo = useChurchLogo();

    if (live?.screen === "black") return <div className="fixed inset-0 bg-black" />;

    // Estado de espera — mostra logo da igreja (retroprojetor de identidade)
    if (!content || live.screen === "logo") {
        return (
            <div className="min-h-screen bg-gradient-to-br from-gray-900 via-slate-900 to-black flex items-center justify-center p-8">
                <TabletVideoReceiver />
                <div className="text-center max-w-2xl">
                    {idleLogo ? (
                        <motion.img
                            src={idleLogo}
                            alt="Logo"
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 0.8, scale: 1 }}
                            transition={{ duration: 0.8 }}
                            className="max-h-48 mx-auto mb-6 object-contain"
                        />
                    ) : (
                        <div className="text-8xl mb-6">🎤</div>
                    )}
                    {!content && (
                        <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ duration: 0.5 }}
                        >
                            <div className="flex items-center justify-center gap-3 text-green-400 mb-6 text-xl">
                                <div className="w-4 h-4 bg-green-400 rounded-full animate-pulse"></div>
                                <span className="font-semibold">Conectado e Online</span>
                            </div>
                        </motion.div>
                    )}
                </div>
            </div>
        );
    }

    const style = content.style || {};
    const slides = content.slides || [];
    const slideIndex = content.index || 0;
    const currentSlide = slides[slideIndex] || slides[0] || { text: "" };
    // The song's own background, else the background layer (image, colour or a video loop).
    const layer = live.background;
    const bgImage = style.background_image || (layer && layer.kind === "image" ? layer.value : "");
    const bgColor = !style.background_image && layer?.kind === "color" ? layer.value : "";
    const bgVideo = !style.background_image && layer?.kind === "video" ? layer.value : "";

    const fontSize = SIZE_MAP[style.font_size] || SIZE_MAP.large;
    const fontFamily = FONT_MAP[style.font_family] || FONT_MAP.sans;
    const textColor = style.text_color || "#ffffff";
    const textColor2 = style.text_color_2;
    const textEffect = getTextEffect(style.text_effect, textColor);

    const gradientStyle = textColor2
        ? { backgroundImage: `linear-gradient(to bottom right, ${textColor}, ${textColor2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
        : { color: textColor };

    return (
        <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
            <TabletVideoReceiver />
            {bgImage && (
                <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url(${bgImage})` }} />
            )}
            {bgColor && <div className="absolute inset-0" style={{ background: bgColor }} />}
            {bgVideo && <video src={bgVideo} autoPlay loop muted playsInline className="absolute inset-0 w-full h-full object-cover opacity-60" />}
            <div className="relative z-10 w-full h-full flex flex-col items-center justify-center px-8 md:px-16">
                {content.title && (
                    <h2 className="text-lg md:text-xl mb-6 font-light opacity-60" style={{ color: textColor }}>
                        {content.title}
                    </h2>
                )}
                <SlideTransition slideKey={`${content.startedAt}:${slideIndex}`} type="fade">
                    <pre
                        className="whitespace-pre-wrap text-center font-bold leading-tight max-w-5xl"
                        style={{
                            fontFamily,
                            fontSize,
                            ...gradientStyle,
                            ...textEffect,
                        }}
                    >
                        {currentSlide.text || ""}
                    </pre>
                </SlideTransition>
                {slides.length > 1 && (
                    <div className="absolute bottom-6 right-6 text-sm opacity-30" style={{ color: textColor }}>
                        {slideIndex + 1} / {slides.length}
                    </div>
                )}
            </div>

            {/* Overlays (camadas sobrepostas) */}
            <LiveOverlays />

            {/* Alerta/mensagem sobreposta global */}
            <AlertOverlayRenderer />
        </div>
    );
}