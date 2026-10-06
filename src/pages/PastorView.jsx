import React from "react";
import { Clock, Bell, Eye, MessageSquare } from "lucide-react";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";

// The pastor's screen: what the congregation sees now (the live content),
// the clock and the service time.
export default function PastorView() {
    const live = useLiveState();
    const content = live?.content || null;
    const nowMs = useLiveNow(1000);
    const clock = new Date(nowMs);
    const startedAt = live?.session?.startedAt;
    const elapsed = startedAt ? Math.max(0, Math.floor((nowMs - startedAt) / 1000)) : 0;
    const pastorNotes = "Bem-vindo à casa do Senhor! 🙏";
    const nextItem = "—";

    const slides = (content?.slides || []).map((slide) => ({
        ...slide,
        is_bible: content.kind === "bible",
        bible_reference: content.ref?.reference || content.title,
    }));
    const currentSlide = content?.index || 0;
    const songTitle = content?.title || "";

    const formatTime = (d) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const formatDate = (d) => d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
    const formatElapsed = (s) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return `${h > 0 ? String(h).padStart(2, "0") + ":" : ""}${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`; };

    const currentContent = slides[currentSlide];

    return (
        <div className="min-h-screen bg-gradient-to-br from-background via-card to-background text-foreground p-8 flex flex-col">
            {/* Top bar */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Bell className="w-6 h-6 text-accent" />
                    <span className="text-sm text-accent uppercase tracking-widest font-semibold">Tela do Pastor</span>
                </div>
                <div className="flex items-center gap-6">
                    <div className="text-right">
                        <p className="text-3xl font-mono font-bold">{formatTime(clock)}</p>
                        <p className="text-xs text-white/50 capitalize">{formatDate(clock)}</p>
                    </div>
                    <div className="flex items-center gap-2 text-accent">
                        <Clock className="w-5 h-5" />
                        <span className="text-xl font-mono">{formatElapsed(elapsed)}</span>
                    </div>
                </div>
            </div>

            {/* Main content area */}
            <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Current projection content */}
                <div className="lg:col-span-2 flex flex-col">
                    <div className="flex items-center gap-2 mb-3">
                        <Eye className="w-5 h-5 text-accent" />
                        <h2 className="text-sm uppercase tracking-widest text-accent">Projetando agora</h2>
                    </div>
                    <div className="flex-1 bg-black/30 rounded-2xl border border-white/10 p-8 flex items-center justify-center">
                        {currentContent ? (
                            <div className="text-center w-full">
                                {currentContent.is_bible && currentContent.bible_reference && (
                                    <p className="text-2xl font-semibold text-accent mb-4">{currentContent.bible_reference}</p>
                                )}
                                <p className="text-4xl md:text-5xl font-bold leading-relaxed whitespace-pre-wrap">
                                    {currentContent.text}
                                </p>
                            </div>
                        ) : songTitle ? (
                            <p className="text-3xl text-white/60">{songTitle}</p>
                        ) : (
                            <p className="text-2xl text-white/40">Aguardando projeção...</p>
                        )}
                    </div>
                </div>

                {/* Pastor notes & next */}
                <div className="flex flex-col gap-4">
                    {/* Notes */}
                    <div className="flex-1">
                        <div className="flex items-center gap-2 mb-3">
                            <MessageSquare className="w-5 h-5 text-amber-400" />
                            <h2 className="text-sm uppercase tracking-widest text-amber-300">Notas do Pastor</h2>
                        </div>
                        <div className="bg-amber-500/5 rounded-2xl border border-amber-500/20 p-6 h-full min-h-32">
                            <p className="text-2xl leading-relaxed whitespace-pre-wrap">{pastorNotes}</p>
                        </div>
                    </div>

                    {/* Next item */}
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <Bell className="w-4 h-4 text-green-400" />
                            <h2 className="text-xs uppercase tracking-widest text-green-300">Próximo</h2>
                        </div>
                        <div className="bg-green-500/5 rounded-xl border border-green-500/20 p-4">
                            <p className="text-xl text-green-200">{nextItem}</p>
                        </div>
                    </div>

                    {/* Slide progress */}
                    {slides.length > 1 && (
                        <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                            <p className="text-xs text-white/50 mb-2">Slide {currentSlide + 1} de {slides.length}</p>
                            <div className="flex gap-1">
                                {slides.map((_, i) => (
                                    <div key={i} className={`flex-1 h-1.5 rounded-full ${i === currentSlide ? "bg-primary" : i < currentSlide ? "bg-primary/40" : "bg-white/10"}`} />
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}