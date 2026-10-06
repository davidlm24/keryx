import React from "react";
import { motion } from "framer-motion";
import { useLiveState } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { FONT_MAP, SIZE_MAP, getTextEffect } from "@/lib/deviceStyles";
import SlideTransition from "@/components/projection/SlideTransition";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";

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
    const bgColor = style.background_image;

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
            {bgColor && (
                <div className="absolute inset-0 bg-cover bg-center opacity-40" style={{ backgroundImage: `url(${bgColor})` }} />
            )}
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
            {(live.overlays || []).filter(o => o.enabled !== false).map((overlay) => {
                const oStyle = {
                    position: "absolute",
                    left: `${overlay.x ?? 0}%`,
                    top: `${overlay.y ?? 0}%`,
                    width: `${overlay.width ?? 20}%`,
                    opacity: overlay.opacity ?? 1,
                    zIndex: overlay.z_index ?? 10,
                };

                if (overlay.type === "logo" || overlay.type === "image") {
                    return (
                        <div key={overlay.id} style={oStyle}>
                            <img src={overlay.content} alt="" className="w-full h-auto object-contain" />
                        </div>
                    );
                }

                if (overlay.type === "announcement" || overlay.type === "text") {
                    return (
                        <div key={overlay.id} style={{
                            ...oStyle,
                            padding: "16px 24px",
                            background: "rgba(0,0,0,0.6)",
                            borderRadius: "12px",
                            backdropFilter: "blur(8px)",
                        }}>
                            <p className="text-center font-semibold" style={{ color: "#ffffff", fontSize: "1.5rem", lineHeight: 1.3 }}>
                                {overlay.content}
                            </p>
                        </div>
                    );
                }

                return null;
            })}

            {/* Alerta/mensagem sobreposta global */}
            <AlertOverlayRenderer />
        </div>
    );
}