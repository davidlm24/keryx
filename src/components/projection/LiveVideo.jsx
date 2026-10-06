import React, { useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { playbackPlan } from "@shared/live-state.mjs";
import { getYouTubeId, loadYouTubeApi } from "@/utils/youtube";

const SYNC_MS = 2000;

/**
 * Plays one live media item (a file or a YouTube link) in step with the live
 * state: position, pause and volume come from item.playback, so every screen
 * plays the same second and one that opens late joins where the others are.
 * Nobody controls it from here; the operator does (projection.transport).
 *
 * item: live.video or live.media ({ kind, url, title, playback, shownAt, fullscreenAt })
 */
export default function LiveVideo({ item, loop = false, muted = false, className = "", onEnded, onDuration }) {
    const isYouTube = item?.kind === "youtube";
    const videoRef = useRef(null);
    const ytBoxRef = useRef(null);
    const ytRef = useRef(null);
    const [blocked, setBlocked] = useState(false); // the browser refused to play with sound
    const [needTap, setNeedTap] = useState(false); // fullscreen asked for, the browser wants a tap
    const callbacks = useRef({ onEnded, onDuration, loop });
    callbacks.current = { onEnded, onDuration, loop };
    const playback = item?.playback;

    // One place that compares the element with the shared playback and fixes it.
    const syncRef = useRef(() => {});
    syncRef.current = () => {
        if (!playback) return;
        const now = keryx.live.now();
        if (isYouTube) {
            const p = ytRef.current;
            if (!p || typeof p.getPlayerState !== "function") return;
            const state = p.getPlayerState();
            const YT = window.YT.PlayerState;
            const plan = playbackPlan({
                currentTime: p.getCurrentTime(),
                paused: state !== YT.PLAYING && state !== YT.BUFFERING,
                ended: state === YT.ENDED,
                duration: p.getDuration(),
            }, playback, now, { loop });
            if (plan.seek !== undefined) p.seekTo(plan.seek, true);
            if (plan.pause) p.pauseVideo();
            if (plan.play) p.playVideo();
            if (muted) p.mute();
            else { p.unMute(); p.setVolume(Math.round(plan.volume * 100)); }
            return;
        }
        const el = videoRef.current;
        if (!el || el.readyState < 1) return;
        const plan = playbackPlan(el, playback, now, { loop });
        if (plan.seek !== undefined) el.currentTime = plan.seek;
        el.volume = plan.volume;
        if (plan.pause) el.pause();
        if (plan.play) {
            el.play().then(() => setBlocked(false)).catch((err) => {
                if (err && err.name === "NotAllowedError") setBlocked(true);
            });
        }
    };

    // Follow every change of the shared playback, and correct drift now and then.
    useEffect(() => {
        syncRef.current();
        const id = setInterval(() => syncRef.current(), SYNC_MS);
        return () => clearInterval(id);
    }, [item?.url, item?.shownAt, playback?.paused, playback?.position, playback?.at, playback?.volume, muted]);

    // YouTube: one player per link.
    useEffect(() => {
        if (!isYouTube || !item?.url) return undefined;
        let cancelled = false;
        // The API replaces its element with an iframe: give it one React does not own.
        const host = document.createElement("div");
        host.style.width = "100%";
        host.style.height = "100%";
        ytBoxRef.current?.appendChild(host);
        loadYouTubeApi().then((YT) => {
            if (cancelled) return;
            ytRef.current = new YT.Player(host, {
                videoId: getYouTubeId(item.url),
                playerVars: { autoplay: 0, controls: 0, modestbranding: 1, rel: 0, playsinline: 1 },
                events: {
                    onReady: (e) => {
                        callbacks.current.onDuration?.(e.target.getDuration());
                        syncRef.current();
                    },
                    onStateChange: (e) => {
                        if (e.data === YT.PlayerState.ENDED) {
                            if (callbacks.current.loop) syncRef.current();
                            else callbacks.current.onEnded?.();
                        }
                    },
                },
            });
        }).catch(() => {});
        return () => {
            cancelled = true;
            try { ytRef.current?.destroy(); } catch { /* already gone */ }
            ytRef.current = null;
            host.remove();
        };
    }, [isYouTube, item?.url]);

    // The operator asked every screen to go fullscreen.
    const firstFullscreen = useRef(item?.fullscreenAt);
    useEffect(() => {
        if (!item?.fullscreenAt || item.fullscreenAt === firstFullscreen.current) return;
        const el = document.documentElement;
        if (document.fullscreenElement || !el.requestFullscreen) return;
        el.requestFullscreen().catch(() => setNeedTap(true));
    }, [item?.fullscreenAt]);

    if (!item?.url) return null;

    const tap = () => {
        if (needTap) document.documentElement.requestFullscreen?.().catch(() => {});
        setNeedTap(false);
        setBlocked(false);
        if (videoRef.current) videoRef.current.play().catch(() => {});
        syncRef.current();
    };

    return (
        <div className={`relative ${className}`}>
            {isYouTube ? (
                <div ref={ytBoxRef} className="w-full h-full" />
            ) : (
                <video
                    ref={videoRef}
                    key={item.url}
                    src={item.url}
                    muted={muted}
                    loop={loop}
                    playsInline
                    preload="auto"
                    className="w-full h-full object-contain bg-black"
                    onLoadedMetadata={(e) => {
                        callbacks.current.onDuration?.(e.currentTarget.duration);
                        syncRef.current();
                    }}
                    onEnded={() => callbacks.current.onEnded?.()}
                />
            )}
            {(blocked || needTap) && (
                <button
                    onClick={tap}
                    className="absolute inset-0 flex flex-col items-center justify-center bg-black/70 z-20 gap-4"
                >
                    <span className="text-7xl">{needTap ? "⛶" : "▶"}</span>
                    <span className="text-white text-2xl font-bold">
                        {needTap ? "Toque para tela cheia" : "Toque para ativar o vídeo"}
                    </span>
                </button>
            )}
        </div>
    );
}
