import React, { useRef, useEffect, useState } from "react";
import { FONT_MAP, SIZE_MAP, getTextEffect } from "@/lib/deviceStyles";

// Dimensões de projeção reais (16:9) — o conteúdo é renderizado a este tamanho
// e depois escalado via CSS transform para caber no preview. Garante WYSIWYG.
const PROJ_WIDTH = 1280;
const PROJ_HEIGHT = 720;

/**
 * Renderiza o conteúdo exatamente como aparece na projeção, num painel 16:9 escalado.
 * Usa o mesmo renderizador (FONT_MAP, SIZE_MAP, getTextEffect) que LyricProjection.
 *
 * Props:
 *  - content: { type, title, slides, slide_index, text_color, text_color_2,
 *              background_image, background_color, font_size, font_family, text_effect, media_url }
 *  - overlays: [{ type, content, x, y, width, opacity, z_index, enabled }]
 *  - className: classes extra no container
 *  - showOverlays: se true, renderiza overlays
 */
export default function PreviewPanel({ content, overlays = [], className = "", showOverlays = true }) {
    const containerRef = useRef(null);
    const [scale, setScale] = useState(0.3);

    useEffect(() => {
        const updateScale = () => {
            if (containerRef.current) {
                const w = containerRef.current.clientWidth;
                setScale(w / PROJ_WIDTH);
            }
        };
        updateScale();
        const ro = new ResizeObserver(updateScale);
        if (containerRef.current) ro.observe(containerRef.current);
        window.addEventListener("resize", updateScale);
        return () => {
            ro.disconnect();
            window.removeEventListener("resize", updateScale);
        };
    }, []);

    const type = content?.type || "blank";
    const slides = content?.slides || [];
    const slideIndex = content?.slide_index || 0;
    const currentSlide = slides[slideIndex] || slides[0] || { text: "" };

    const fontSize = SIZE_MAP[content?.font_size] || SIZE_MAP.large;
    const fontFamily = FONT_MAP[content?.font_family] || FONT_MAP.sans;
    const textColor = content?.text_color || "#ffffff";
    const textColor2 = content?.text_color_2;
    const textEffect = getTextEffect(content?.text_effect, textColor);
    const bgImage = content?.background_image;
    const bgColor = content?.background_color || "#0a0a0f";

    const gradientStyle = textColor2
        ? { backgroundImage: `linear-gradient(to bottom right, ${textColor}, ${textColor2})`, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }
        : { color: textColor };

    const activeOverlays = showOverlays ? (overlays || []).filter(o => o.enabled !== false) : [];

    return (
        <div
            ref={containerRef}
            className={`relative w-full aspect-video overflow-hidden rounded-xl bg-black ${className}`}
        >
            {/* Conteúdo renderizado a tamanho real e escalado */}
            <div
                style={{
                    width: PROJ_WIDTH,
                    height: PROJ_HEIGHT,
                    transform: `scale(${scale})`,
                    transformOrigin: "top left",
                    position: "absolute",
                    top: 0,
                    left: 0,
                }}
            >
                {/* Fundo */}
                <div className="absolute inset-0" style={{ backgroundColor: bgColor }}>
                    {bgImage && (
                        <div
                            className="absolute inset-0 bg-cover bg-center opacity-40"
                            style={{ backgroundImage: `url(${bgImage})` }}
                        />
                    )}
                </div>

                {/* Conteúdo principal */}
                {type === "video" && content?.media_url ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <video
                            src={content.media_url}
                            className="w-full h-full object-contain"
                            muted
                            playsInline
                        />
                    </div>
                ) : type === "image" && content?.media_url ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <img src={content.media_url} className="w-full h-full object-contain" alt="" />
                    </div>
                ) : type === "bible" ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-16">
                        {/* Reference badge */}
                        <div className="flex flex-col items-center gap-3 mb-6">
                            <div className="flex items-center gap-2.5 px-6 py-2.5 rounded-xl backdrop-blur-md"
                                style={{
                                    background: "linear-gradient(135deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
                                    border: "1px solid rgba(255,255,255,0.18)",
                                    boxShadow: "0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.1)",
                                }}>
                                <svg className="w-4 h-4 shrink-0" style={{ color: "rgba(255,255,255,0.7)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 0 0 6 3.75c-1.052 0-2.063.18-3 .512v14.25A8.987 8.987 0 0 1 6 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 0 1 6-2.292c1.052 0 2.063.18 3 .512v14.25A8.987 8.987 0 0 0 18 18a8.967 8.967 0 0 0-6 2.292m0-14.25v14.25" />
                                </svg>
                                <span className="font-bold tracking-[0.15em] uppercase text-base"
                                    style={{ color: "rgba(255,255,255,0.92)", textShadow: "0 2px 8px rgba(0,0,0,0.9)", fontFamily }}>
                                    {content.title}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 w-32">
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
                                <div className="w-1 h-1 rounded-full bg-white/30"></div>
                                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent"></div>
                            </div>
                        </div>
                        {/* Verse text */}
                        <div className="text-center font-semibold leading-loose max-h-[55%] overflow-y-auto" style={{ fontFamily, fontSize, ...gradientStyle, ...textEffect, maxWidth: "80%" }}>
                            {(() => {
                                const text = currentSlide.text || "";
                                const verseRegex = /(\d+)\s+([\s\S]*?)(?=\s+\d+\s|$)/g;
                                const verses = [];
                                let m;
                                while ((m = verseRegex.exec(text)) !== null) {
                                    verses.push({ number: m[1], text: m[2].trim() });
                                }
                                if (verses.length === 0 && text.trim()) return <div>{text}</div>;
                                return verses.map((v, i) => (
                                    <div key={i} className="flex items-start justify-center gap-2 mb-3">
                                        <span className="font-bold shrink-0 rounded-md"
                                            style={{
                                                fontSize: "0.38em",
                                                color: "rgba(255,255,255,0.5)",
                                                background: "rgba(255,255,255,0.06)",
                                                border: "1px solid rgba(255,255,255,0.12)",
                                                padding: "0.1em 0.5em",
                                                lineHeight: 1.3,
                                            }}>
                                            {v.number}
                                        </span>
                                        <span className="text-left flex-1">{v.text}</span>
                                    </div>
                                ));
                            })()}
                        </div>
                        {/* Bottom reference */}
                        <div className="flex items-center gap-3 mt-4">
                            <div className="h-px w-10 bg-gradient-to-r from-transparent to-white/20"></div>
                            <span className="text-xs font-medium tracking-[0.2em] uppercase" style={{ color: "rgba(255,255,255,0.45)", fontFamily }}>
                                {content.title}
                            </span>
                            <div className="h-px w-10 bg-gradient-to-l from-transparent to-white/20"></div>
                        </div>
                    </div>
                ) : type === "blank" || !currentSlide.text ? (
                    <div className="absolute inset-0" />
                ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center px-16">
                        {content?.title && (
                            <h2
                                className="text-xl mb-6 font-light opacity-60"
                                style={{ color: textColor }}
                            >
                                {content.title}
                            </h2>
                        )}
                        <pre
                            className="whitespace-pre-wrap text-center font-bold leading-tight"
                            style={{
                                fontFamily,
                                fontSize,
                                ...gradientStyle,
                                ...textEffect,
                                maxWidth: "85%",
                            }}
                        >
                            {currentSlide.text || ""}
                        </pre>
                    </div>
                )}

                {/* Overlays (camadas) */}
                {activeOverlays.map((overlay) => {
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
                                <img
                                    src={overlay.content}
                                    alt=""
                                    className="w-full h-auto object-contain"
                                />
                            </div>
                        );
                    }

                    if (overlay.type === "announcement" || overlay.type === "text") {
                        return (
                            <div
                                key={overlay.id}
                                style={{
                                    ...oStyle,
                                    padding: "16px 24px",
                                    background: "rgba(0,0,0,0.6)",
                                    borderRadius: "12px",
                                    backdropFilter: "blur(8px)",
                                }}
                            >
                                <p
                                    className="text-center font-semibold"
                                    style={{ color: "#ffffff", fontSize: "1.5rem", lineHeight: 1.3 }}
                                >
                                    {overlay.content}
                                </p>
                            </div>
                        );
                    }

                    return null;
                })}
            </div>
        </div>
    );
}