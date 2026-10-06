import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { keryx } from "@/api/keryxClient";
import { FONT_MAP, SIZE_MAP, getTextEffect } from "@/lib/deviceStyles";

/**
 * Carousel de anúncios — projeta uma sequência de banners em loop automático.
 * Mostra cada anúncio por N segundos antes de avançar.
 */
export default function AnnouncementCarousel({ intervalSec = 8 }) {
    const [banners, setBanners] = useState([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                const items = await keryx.entities.BannerTemplate.filter({ category: "announcement" }, "-updated_date", 50);
                setBanners(items.filter(b => b.title || b.subtitle || b.phrases?.length));
            } catch (e) {
                // fallback: carregar todos
                const items = await keryx.entities.BannerTemplate.list("-updated_date", 50);
                setBanners(items.filter(b => b.title || b.subtitle || b.phrases?.length));
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    useEffect(() => {
        if (banners.length <= 1) return;
        const timer = setInterval(() => {
            setCurrentIndex((i) => (i + 1) % banners.length);
        }, intervalSec * 1000);
        return () => clearInterval(timer);
    }, [banners.length, intervalSec]);

    if (loading) {
        return (
            <div className="fixed inset-0 bg-black flex items-center justify-center">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (banners.length === 0) {
        return (
            <div className="fixed inset-0 bg-gradient-to-br from-gray-900 via-slate-900 to-black flex items-center justify-center">
                <p className="text-gray-500 text-2xl">Nenhum anúncio disponível</p>
            </div>
        );
    }

    const banner = banners[currentIndex];

    const fontSize = SIZE_MAP[banner.font_size] || SIZE_MAP.xlarge;
    const fontFamily = FONT_MAP[banner.font_family] || FONT_MAP.sans;
    const textColor = banner.text_color || "#ffffff";
    const textColor2 = banner.text_color_2;
    const textEffect = getTextEffect(banner.text_effect, textColor);

    const gradientStyle = textColor2
        ? { backgroundImage: `linear-gradient(to bottom right, ${textColor}, ${textColor2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
        : { color: textColor };

    const bgStyle = banner.custom_image
        ? { backgroundImage: `url(${banner.custom_image})`, backgroundSize: "cover", backgroundPosition: "center" }
        : { background: "linear-gradient(to bottom, #0a0a0a, #1a1a2e)" };

    const displayText = banner.phrases?.length
        ? banner.phrases[0]
        : banner.title || "";

    return (
        <div className="fixed inset-0 overflow-hidden" style={bgStyle}>
            {banner.custom_image && <div className="absolute inset-0 bg-black/40" />}

            {/* Indicador de progresso */}
            <div className="absolute top-0 left-0 right-0 h-1 z-20 bg-white/10">
                <motion.div
                    key={currentIndex}
                    initial={{ width: "0%" }}
                    animate={{ width: "100%" }}
                    transition={{ duration: intervalSec, ease: "linear" }}
                    className="h-full bg-primary"
                />
            </div>

            {/* Indicador de slides */}
            {banners.length > 1 && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-20">
                    {banners.map((_, i) => (
                        <div
                            key={i}
                            className={`h-2 rounded-full transition-all ${i === currentIndex ? "w-8 bg-white" : "w-2 bg-white/30"}`}
                        />
                    ))}
                </div>
            )}

            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.6 }}
                    className="relative z-10 h-full flex flex-col items-center justify-center px-12"
                >
                    {banner.subtitle && (
                        <p className="text-lg md:text-2xl mb-4 opacity-70 font-light" style={{ color: textColor }}>
                            {banner.subtitle}
                        </p>
                    )}
                    <h1
                        className="text-center font-bold leading-tight max-w-5xl whitespace-pre-wrap"
                        style={{
                            fontFamily,
                            fontSize,
                            ...gradientStyle,
                            ...textEffect,
                        }}
                    >
                        {displayText}
                    </h1>
                    {(banner.event_date || banner.event_time || banner.location) && (
                        <div className="mt-8 flex flex-wrap gap-6 justify-center text-lg md:text-xl opacity-80" style={{ color: textColor }}>
                            {banner.event_date && <span>📅 {banner.event_date}</span>}
                            {banner.event_time && <span>🕐 {banner.event_time}</span>}
                            {banner.location && <span>📍 {banner.location}</span>}
                        </div>
                    )}
                </motion.div>
            </AnimatePresence>
        </div>
    );
}