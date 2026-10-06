import React, { useState, useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { Clock, Bell, Eye, MessageSquare } from "lucide-react";

export default function PastorView() {
    const [currentSlide, setCurrentSlide] = useState(0);
    const [slides, setSlides] = useState([]);
    const [songTitle, setSongTitle] = useState("");
    const [clock, setClock] = useState(new Date());
    const [elapsed, setElapsed] = useState(0);
    const [pastorNotes, setPastorNotes] = useState("Bem-vindo à casa do Senhor! 🙏");
    const [nextItem, setNextItem] = useState("—");
    const startTimeRef = useRef(Date.now());

    useEffect(() => {
        const timer = setInterval(() => { setClock(new Date()); setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000)); }, 1000);
        return () => clearInterval(timer);
    }, []);

    useEffect(() => {
        const unsub = keryx.entities.ProjectionState.subscribe((event) => {
            if (event.type === "create" || event.type === "update") {
                const s = event.data;
                setSlides(s.bible_text ? [{ text: s.bible_text, is_bible: true, bible_reference: s.bible_reference }] : []);
                setSongTitle(s.bible_reference || s.song_id || "");
            }
        });

        // Load initial state
        const loadInitial = async () => {
            try {
                const states = await keryx.entities.ProjectionState.list("-updated_at", 1);
                if (states.length > 0) {
                    const s = states[0];
                    if (s.bible_text) {
                        setSlides([{ text: s.bible_text, is_bible: true, bible_reference: s.bible_reference }]);
                        setSongTitle(s.bible_reference || "");
                    }
                }
            } catch (e) {}
        };
        loadInitial();

        // Listen for direct messages from control window
        const handleMessage = (event) => {
            if (event.data.type === "PROJECTION_DATA") {
                const slidesData = (event.data.slides || []).map(s => ({ ...s, is_bible: event.data.is_bible, bible_reference: event.data.bible_reference }));
                setSlides(slidesData);
                setSongTitle(event.data.title || event.data.bible_reference || "");
                setCurrentSlide(0);
            }
            if (event.data.type === "SLIDE_INDEX") setCurrentSlide(event.data.index);
            if (event.data.type === "PASTOR_NOTE") setPastorNotes(event.data.text || pastorNotes);
            if (event.data.type === "PASTOR_NEXT") setNextItem(event.data.text || "—");
        };
        window.addEventListener("message", handleMessage);

        return () => { unsub(); window.removeEventListener("message", handleMessage); };
    }, []);

    const formatTime = (d) => d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const formatDate = (d) => d.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
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
                        <h2 className="text-sm uppercase tracking-widest text-accent">A projetar agora</h2>
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