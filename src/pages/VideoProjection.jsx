import React from "react";
import { motion } from "framer-motion";
import { useLiveState } from "@/hooks/useLiveState";
import LiveVideo from "@/components/projection/LiveVideo";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";

// The video screen (a TV or tablet for clips and YouTube): the live state's
// video channel, in step with every other screen. A screen that opens late
// or reloads joins the video where it is.
export default function VideoProjection() {
    const video = useLiveState((s) => s?.video);

    if (!video) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-background via-card to-background flex items-center justify-center p-8">
                <div className="text-center max-w-2xl">
                    <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ duration: 0.5 }}>
                        <div className="text-8xl mb-6">🎥</div>
                        <h1 className="text-4xl font-bold text-white mb-4">Dispositivo de Vídeo</h1>
                        <div className="flex items-center justify-center gap-3 text-green-400 mb-6 text-xl">
                            <div className="w-4 h-4 bg-green-400 rounded-full animate-pulse"></div>
                            <span className="font-semibold">Conectado e Online</span>
                        </div>
                        <div className="space-y-4 text-left bg-white/5 p-6 rounded-lg backdrop-blur-sm border border-border">
                            <p className="text-foreground text-lg">✓ Este dispositivo está pronto para receber vídeos</p>
                            <p className="text-muted-foreground">📱 Mantenha esta janela aberta</p>
                            <p className="text-muted-foreground">🎬 Suporta MP4 e links do YouTube</p>
                            <p className="text-muted-foreground">🎵 O vídeo aparecerá automaticamente aqui</p>
                        </div>
                        <p className="text-muted-foreground text-sm mt-6">A letra da música continuará no projetor principal</p>
                    </motion.div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center relative">
            {video.title && (
                <div className="absolute top-8 left-0 right-0 text-center z-10 pointer-events-none">
                    <h2 className="text-2xl font-semibold text-white bg-black/50 inline-block px-6 py-3 rounded-lg">
                        {video.title}
                    </h2>
                </div>
            )}
            <LiveVideo item={video} className="w-full h-screen" />
            <AlertOverlayRenderer />
        </div>
    );
}
