import React, { useState, useEffect, useRef } from "react";
import { Music2, Clock, Guitar, Activity, ChevronRight, StickyNote, Timer, Plus, Minus } from "lucide-react";
import { transposeChords, semitoneLabel } from "@/utils/chordTranspose";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";
import { keryx } from "@/api/keryxClient";
import { useLiveSessionChannel } from "@/hooks/useLiveSessionChannel";
import { useProjectionReconnect } from "@/hooks/useProjectionReconnect";

export default function StageView() {
    const [songData, setSongData] = useState(null);
    const [slideIndex, setSlideIndex] = useState(0);
    const [now, setNow] = useState(new Date());
    const [elapsed, setElapsed] = useState(0);
    const [transpose, setTranspose] = useState(0);
    const readySent = useRef(false);
    const channelRef = useLiveSessionChannel();
    const songStartRef = useRef(null);

    // Reconexão automática — re-busca letra ao voltar online
    useProjectionReconnect((rec) => {
        if (rec && rec.status === "active") {
            setSongData({
                title: rec.song_title,
                artist: rec.artist || "",
                slides: rec.slides || [],
                text_color: rec.text_color,
                background_image: rec.background_image,
            });
            setSlideIndex(rec.slide_index || 0);
            songStartRef.current = Date.now();
        } else if (rec && rec.status === "stopped") {
            setSongData(null);
            setSlideIndex(0);
            songStartRef.current = null;
        }
    }, "LyricSync");

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Elapsed timer (counts up while a song is active)
    useEffect(() => {
        if (!songData) {
            setElapsed(0);
            songStartRef.current = null;
            return;
        }
        if (!songStartRef.current) songStartRef.current = Date.now();
        const interval = setInterval(() => {
            if (songStartRef.current) {
                setElapsed(Math.floor((Date.now() - songStartRef.current) / 1000));
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [songData]);

    // Subscrição da LiveSession — limpa o palco quando a sessão termina (com filtro por canal)
    useEffect(() => {
        const unsubscribe = keryx.entities.LiveSession.subscribe((event) => {
            if (event.type === 'create' && event.data?.status === "active" && !channelRef.current) {
                channelRef.current = event.data.channel;
            }
            if ((event.type === 'create' || event.type === 'update') && event.data?.status === "ended") {
                if (!channelRef.current || event.data.channel === channelRef.current) {
                    setSongData(null);
                    setSlideIndex(0);
                    setElapsed(0);
                    songStartRef.current = null;
                }
            }
        });
        return () => unsubscribe();
    }, []);

    // Listen for messages from opener
    useEffect(() => {
        const handleMessage = (event) => {
            const msg = event.data;

            if (msg.type === "PROJECTION_DATA") {
                setSongData(msg);
                setSlideIndex(0);
                songStartRef.current = Date.now();
                setElapsed(0);
            }

            if (msg.type === "SLIDE_INDEX") {
                setSlideIndex(msg.index);
            }

            if (msg.type === "PROJECTION_STOP") {
                setSongData(null);
                setSlideIndex(0);
                setElapsed(0);
                songStartRef.current = null;
            }
        };

        window.addEventListener("message", handleMessage);

        if (window.opener && !readySent.current) {
            readySent.current = true;
            window.opener.postMessage({ type: "STAGE_READY" }, "*");
        }

        const tryFullscreen = () => {
            if (document.documentElement.requestFullscreen) {
                document.documentElement.requestFullscreen().catch(() => {});
            }
        };
        document.addEventListener("click", tryFullscreen, { once: true });

        return () => window.removeEventListener("message", handleMessage);
    }, []);

    const slides = songData?.slides?.length
        ? songData.slides
        : [{ text: songData?.lyrics || "", duration: 30 }];

    const current = slides[slideIndex] || {};
    const next = slides[slideIndex + 1];

    const formatTime = (d) => {
        const h = String(d.getHours()).padStart(2, "0");
        const m = String(d.getMinutes()).padStart(2, "0");
        return `${h}:${m}`;
    };

    const formatElapsed = (s) => {
        const m = String(Math.floor(s / 60)).padStart(2, "0");
        const sec = String(s % 60).padStart(2, "0");
        return `${m}:${sec}`;
    };

    const bgStyle = songData?.background_image
        ? (songData.background_image.startsWith("http") || songData.background_image.startsWith("data:"))
            ? { backgroundImage: `url(${songData.background_image})`, backgroundSize: "cover", backgroundPosition: "center" }
            : { background: songData.background_image }
        : { background: "linear-gradient(to bottom, #1a1714, #252220)" };

    // Idle state
    if (!songData) {
        return (
            <div className="fixed inset-0 bg-black flex flex-col items-center justify-center text-white">
                <div className="text-center">
                    <Music2 className="w-24 h-24 mx-auto mb-6 opacity-30" />
                    <h1 className="text-5xl font-bold mb-4">Stage View</h1>
                    <p className="text-2xl text-gray-500">Aguardando projeção...</p>
                    <div className="mt-12 text-7xl font-mono tracking-wider text-gray-400">
                        {formatTime(now)}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 flex flex-col text-white overflow-hidden" style={bgStyle}>
            <div className="absolute inset-0 bg-black/55" />

            <div className="relative z-10 flex flex-col h-full p-6">
                {/* Header: Title + Key + BPM + Clock + Timer */}
                <div className="flex items-start justify-between mb-4 flex-shrink-0">
                    <div className="flex-1 min-w-0">
                        <h1 className="text-3xl font-bold truncate drop-shadow-lg">
                            {songData.title || "Música"}
                        </h1>
                        {songData.artist && (
                            <p className="text-xl text-gray-300 mt-1 truncate">{songData.artist}</p>
                        )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                        {songData.song_key && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 backdrop-blur-sm">
                                <Guitar className="w-5 h-5 text-lime-400" />
                                <div>
                                    <div className="text-xs text-gray-400">Tom</div>
                                    <div className="text-xl font-bold">{songData.song_key}</div>
                                </div>
                            </div>
                        )}

                        {songData.bpm && (
                            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 backdrop-blur-sm">
                                <Activity className="w-5 h-5 text-cyan-400" />
                                <div>
                                    <div className="text-xs text-gray-400">BPM</div>
                                    <div className="text-xl font-bold">{songData.bpm}</div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 backdrop-blur-sm">
                            <Timer className="w-5 h-5 text-rose-400" />
                            <div className="text-xl font-mono font-bold">{formatElapsed(elapsed)}</div>
                        </div>

                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-black/40 backdrop-blur-sm">
                            <Clock className="w-5 h-5 text-amber-400" />
                            <div className="text-2xl font-mono font-bold">{formatTime(now)}</div>
                        </div>
                    </div>
                </div>

                {/* Musician notes banner */}
                {songData.musician_notes && (
                    <div className="mb-4 px-4 py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-start gap-2 flex-shrink-0">
                        <StickyNote className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-amber-100 text-base leading-snug">{songData.musician_notes}</p>
                    </div>
                )}

                {/* Main area: Current slide + chords */}
                <div className="flex-1 flex gap-6 min-h-0">
                    {/* Current slide - large text */}
                    <div className="flex-1 flex items-center justify-center min-w-0">
                        <p
                            className="text-center font-bold leading-tight whitespace-pre-wrap"
                            style={{
                                fontSize: "clamp(1.8rem, 5.5vw, 4.5rem)",
                                textShadow: "2px 2px 8px rgba(0,0,0,0.9)",
                            }}
                        >
                            {current.text || ""}
                        </p>
                    </div>

                    {/* Chords panel */}
                    {songData.chords && (
                        <div className="w-72 flex-shrink-0 rounded-xl bg-black/50 backdrop-blur-sm border border-white/15 p-4 overflow-auto">
                            <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2 text-lime-400 text-sm font-semibold">
                                    <Guitar className="w-4 h-4" />
                                    Cifra
                                </div>
                                <div className="flex items-center gap-1">
                                    <button
                                        onClick={() => setTranspose(t => t - 1)}
                                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                                    >
                                        <Minus className="w-3.5 h-3.5" />
                                    </button>
                                    <span className="text-xs font-mono text-gray-300 w-12 text-center">{semitoneLabel(transpose)}</span>
                                    <button
                                        onClick={() => setTranspose(t => t + 1)}
                                        className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <pre className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap font-mono">
                                {transposeChords(songData.chords, transpose)}
                            </pre>
                        </div>
                    )}
                </div>

                {/* Next slide preview */}
                {next && (
                    <div className="mt-3 px-5 py-3 rounded-xl bg-black/40 border border-white/10 flex-shrink-0">
                        <div className="flex items-center gap-2 text-gray-400 text-sm mb-1">
                            <ChevronRight className="w-4 h-4" />
                            Próximo
                        </div>
                        <p className="text-gray-300 text-lg leading-snug whitespace-pre-wrap line-clamp-3">
                            {next.text || ""}
                        </p>
                    </div>
                )}

                {/* Slide indicator */}
                <div className="flex items-center justify-center gap-2 mt-3 flex-shrink-0">
                    {slides.map((_, i) => (
                        <div
                            key={i}
                            className={`h-2 rounded-full transition-all ${
                                i === slideIndex ? "w-10 bg-lime-400" : "w-2 bg-white/25"
                            }`}
                        />
                    ))}
                </div>
            </div>
            <AlertOverlayRenderer />
        </div>
    );
}