import React, { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { keryx } from "@/api/keryxClient";
import { useLiveSessionChannel } from "@/hooks/useLiveSessionChannel";
import { useProjectionReconnect } from "@/hooks/useProjectionReconnect";
import { FONT_MAP, SIZE_MAP, getTextEffect } from "@/lib/deviceStyles";
import SlideTransition from "@/components/projection/SlideTransition";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";

export default function LyricProjection() {
    const [lyricData, setLyricData] = useState(null);
    const [slideIndex, setSlideIndex] = useState(0);
    const activeIdRef = useRef(null);
    // Driven by the local operator window via postMessage; the DB fallback
    // poll must not override it.
    const localModeRef = useRef(false);
    const lastTsRef = useRef(0);
    const channelRef = useLiveSessionChannel();

    // Reconexão automática — re-busca estado ao voltar online
    useProjectionReconnect((rec) => {
        if (rec && rec.status === "active") {
            activeIdRef.current = rec.id;
            setLyricData(rec);
            setSlideIndex(rec.slide_index || 0);
        } else if (rec && rec.status === "stopped") {
            activeIdRef.current = null;
            setLyricData(null);
            setSlideIndex(0);
        }
    }, "LyricSync");

    useEffect(() => {
        // Buscar o registro ativo mais recente ao carregar
        const checkDatabase = async () => {
            try {
                if (localModeRef.current) return;
                const records = await keryx.entities.LyricSync.list('-timestamp', 1);
                if (records.length > 0 && records[0].status === "active" && (records[0].timestamp || 0) > lastTsRef.current) {
                    lastTsRef.current = records[0].timestamp || 0;
                    activeIdRef.current = records[0].id;
                    setLyricData(records[0]);
                    setSlideIndex(records[0].slide_index || 0);
                }
            } catch (e) {}
        };
        checkDatabase();

        // Subscrição em tempo real — para o tablet remoto
        const unsubscribe = keryx.entities.LyricSync.subscribe((event) => {
            if (event.type === 'create' || event.type === 'update') {
                const rec = event.data;
                if (rec.timestamp) lastTsRef.current = Math.max(lastTsRef.current, rec.timestamp);
                if (rec.status === "active") {
                    activeIdRef.current = rec.id;
                    setLyricData(rec);
                    setSlideIndex(rec.slide_index || 0);
                } else if (rec.status === "stopped" && rec.id === activeIdRef.current) {
                    activeIdRef.current = null;
                    setLyricData(null);
                    setSlideIndex(0);
                }
            }
            if (event.type === 'delete' && event.data?.id === activeIdRef.current) {
                activeIdRef.current = null;
                setLyricData(null);
                setSlideIndex(0);
            }
        });

        // Subscrição da LiveSession — limpa a projeção quando a sessão termina (com filtro por canal)
        const unsubscribeLive = keryx.entities.LiveSession.subscribe((event) => {
            if (event.type === 'create' && event.data?.status === "active" && !channelRef.current) {
                channelRef.current = event.data.channel;
            }
            if ((event.type === 'create' || event.type === 'update') && event.data?.status === "ended") {
                if (!channelRef.current || event.data.channel === channelRef.current) {
                    activeIdRef.current = null;
                    setLyricData(null);
                    setSlideIndex(0);
                }
            }
        });

        // postMessage — para o projetor local (resposta instantânea aos botões)
        const handleMessage = (event) => {
            const msg = event.data;
            if (!msg || !msg.type) return;

            if (msg.type === "PROJECTION_READY") return;

            if (msg.type === "PROJECTION_DATA") {
                localModeRef.current = true;
                setLyricData({
                    song_title: msg.title,
                    artist: msg.artist || "",
                    slides: msg.slides || [],
                    slide_index: 0,
                    text_color: msg.text_color || "#ffffff",
                    text_color_2: msg.text_color_2 || "",
                    background_image: msg.background_image || "",
                    font_size: msg.font_size || "large",
                    font_family: msg.font_family || "sans",
                    text_effect: msg.text_effect || "shadow",
                    status: "active"
                });
                setSlideIndex(0);
            }

            if (msg.type === "SLIDE_INDEX") {
                setSlideIndex(msg.index || 0);
            }

            if (msg.type === "STOP_PROJECTION") {
                localModeRef.current = false;
                setLyricData(null);
                setSlideIndex(0);
            }
        };

        window.addEventListener("message", handleMessage);

        // Sinalizar que está pronto
        window.opener?.postMessage({ type: "PROJECTION_READY" }, "*");

        // Rede de segurança caso o realtime perca um evento. Só aplica registros
        // mais recentes do que o último visto, para não reverter slides.
        const interval = setInterval(checkDatabase, 15000);

        return () => {
            unsubscribe();
            unsubscribeLive();
            clearInterval(interval);
            window.removeEventListener("message", handleMessage);
        };
    }, []);

    // Logo da igreja para tela idle (retroprojetor de identidade)
    const [idleLogo, setIdleLogo] = useState(() => localStorage.getItem("idleLogoUrl") || "");

    useEffect(() => {
        keryx.auth.me().then(u => {
            if (u?.logo_url) {
                setIdleLogo(u.logo_url);
                localStorage.setItem("idleLogoUrl", u.logo_url);
            }
        }).catch(() => {});
    }, []);

    // Estado de espera — mostra logo da igreja (retroprojetor de identidade)
    if (!lyricData || lyricData.status !== "active") {
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
                </div>
            </div>
        );
    }

    const slides = lyricData.slides || [];
    const currentSlide = slides[slideIndex] || slides[0] || { text: "" };
    const bgColor = lyricData.background_image;

    const fontSize = SIZE_MAP[lyricData.font_size] || SIZE_MAP.large;
    const fontFamily = FONT_MAP[lyricData.font_family] || FONT_MAP.sans;
    const textColor = lyricData.text_color || "#ffffff";
    const textColor2 = lyricData.text_color_2;
    const textEffect = getTextEffect(lyricData.text_effect, textColor);

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
                {lyricData.song_title && (
                    <h2 className="text-lg md:text-xl mb-6 font-light opacity-60" style={{ color: textColor }}>
                        {lyricData.song_title}
                    </h2>
                )}
                <SlideTransition slideKey={slideIndex} type="fade">
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
            {(lyricData.overlays || []).filter(o => o.enabled !== false).map((overlay) => {
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