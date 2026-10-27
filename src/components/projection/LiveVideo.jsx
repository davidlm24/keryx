import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { playbackPlan, playbackGain } from "@shared/live-state.mjs";
import { createPool } from "@/lib/mediaPool";
import { getYouTubeId, loadYouTubeApi } from "@/utils/youtube";
import { usePrefs } from "@/hooks/useUser";

// YouTube draws the video's title and channel over the top of its player
// (at the start and on pause) and its logo at the bottom; no player option
// turns them off. Made this much taller than the screen, the video still
// fills the screen (fit to the width) and those bars sit on the black
// letterbox outside it (Configurações › Telas e saídas, on by default).
// At least 64 px, 7% of the height on a big screen (its bars grow with it).
const YT_CROP = "calc(-1 * max(64px, 7%))";
import { useDurationReport } from "@/hooks/useDurationReport";

const SYNC_MS = 2000;

// This window's <video> elements, by url (src/lib/mediaPool.js): a player
// that unmounts lets its element go and one that mounts in the same commit
// with the same file takes it, still playing. That is how "Tirar o vídeo"
// (media.toAudio) and "Mostrar o vídeo" move a video between the media
// layer and the hidden audio player (Projection.jsx) without a gap.
const videos = createPool({
    create(url) {
        const el = document.createElement("video");
        el.className = "w-full h-full object-contain bg-black";
        el.playsInline = true;
        el.preload = "auto";
        el.src = url;
        return el;
    },
    dispose(el) {
        el.pause();
        el.removeAttribute("src");
        el.load();
    },
});

// A still of the frame `el` shows now, contained on black as the element is:
// a canvas, or the item's poster when the frame cannot be drawn.
function videoStill(el, poster) {
    const cls = "w-full h-full object-contain bg-black";
    if (el.videoWidth > 0 && el.videoHeight > 0 && el.readyState >= 2) {
        try {
            const canvas = document.createElement("canvas");
            canvas.width = el.videoWidth;
            canvas.height = el.videoHeight;
            canvas.getContext("2d").drawImage(el, 0, 0, canvas.width, canvas.height);
            canvas.className = cls;
            return canvas;
        } catch { /* the poster, below */ }
    }
    if (!poster) {
        const black = document.createElement("div");
        black.className = cls;
        return black;
    }
    const img = document.createElement("img");
    img.className = cls;
    img.alt = "";
    img.src = poster;
    return img;
}

/**
 * Plays one live media item (a file or a YouTube link) in step with the live
 * state: position, pause and volume come from item.playback, so every screen
 * plays the same second and one that opens late joins where the others are.
 * Nobody controls it from here; the operator does (projection.transport).
 *
 * item: live.video, live.media or live.audio ({ kind, url, title, playback, shownAt, fullscreenAt })
 * meter: the live layer this element plays ("media" | "video" | "audio") when
 *   this window is an output: it reports the item's duration to the console's
 *   player (useDurationReport). Levels are never measured here — the console
 *   reads the system output itself, so playback cannot be disturbed.
 * fadeOut: { at, until } on the live clock — the item is on its way out
 *   (Transições: a new sound stopped it, Esc took it off): it plays on while
 *   its volume comes down to 0 by `until`. If another player of this window
 *   holds its file (the eye), it shows a still of the frame instead.
 */
export default function LiveVideo({ item, loop = false, muted = false, className = "", onEnded, onDuration, meter = null, fadeOut = null }) {
    const isYouTube = item?.kind === "youtube";
    const hideYtTitle = usePrefs().youtube_hide_title;
    const videoRef = useRef(null);
    const hostRef = useRef(null);
    const ytBoxRef = useRef(null);
    const ytRef = useRef(null);
    const [blocked, setBlocked] = useState(false); // the browser refused to play with sound
    const [needTap, setNeedTap] = useState(false); // fullscreen asked for, the browser wants a tap
    const callbacks = useRef({ onEnded, onDuration, loop, muted, poster: item?.poster });
    callbacks.current = { onEnded, onDuration, loop, muted, poster: item?.poster };
    const playback = item?.playback;
    const playbackRef = useRef(playback);
    playbackRef.current = playback;
    // How much of the volume is left on the way out (1: not leaving).
    const fadeRef = useRef(fadeOut);
    fadeRef.current = fadeOut;
    const left = () => {
        const f = fadeRef.current;
        if (!f) return 1;
        const span = f.until - f.at;
        return span > 0 ? Math.max(0, Math.min(1, (f.until - keryx.live.now()) / span)) : 0;
    };
    const metered = Boolean(meter) && Boolean(window.keryxDesktop);
    useDurationReport(videoRef, { layer: meter, url: item?.url || "", enabled: metered && !isYouTube });

    // YouTube plays in an iframe: ask the player for its duration instead.
    useEffect(() => {
        const bridge = window.keryxDesktop;
        if (!metered || !isYouTube || !bridge?.meters) return undefined;
        const meters = bridge.meters;
        const url = item?.url || "";
        const id = setInterval(() => {
            const d = ytRef.current?.getDuration?.();
            if (Number.isFinite(d) && d > 0) meters.report({ layer: meter, url, duration: d });
        }, 1000);
        return () => clearInterval(id);
    }, [metered, isYouTube, meter, item?.url]);

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
            else { p.unMute(); p.setVolume(Math.round(plan.volume * left() * 100)); }
            return;
        }
        const el = videoRef.current;
        if (!el || el.readyState < 1) return;
        const plan = playbackPlan(el, playback, now, { loop });
        if (plan.seek !== undefined) el.currentTime = plan.seek;
        el.volume = plan.volume * left();
        if (plan.pause) el.pause();
        if (plan.play) {
            el.play().then(() => setBlocked(false)).catch((err) => {
                if (err && err.name === "NotAllowedError") setBlocked(true);
            });
        }
    };

    // A file plays in an element from the pool, put into this player's box.
    // A layout effect, so the element changes hands inside the commit.
    const fileUrl = isYouTube ? "" : item?.url || "";
    useLayoutEffect(() => {
        const host = hostRef.current;
        if (!fileUrl || !host) return undefined;
        // On its way out while another player of this window holds the file
        // (the eye, media.toAudio: the projector's hidden audio player took
        // the element in this commit, mounted before the screen): the ghost
        // fades out a still of its frame and never claims a second element,
        // which would load the file again and echo the sound. Where nobody
        // else holds it (a TV, the Programa monitor) it takes the element.
        const holder = fadeRef.current ? videos.held(fileUrl) : null;
        if (holder) {
            const still = videoStill(holder, callbacks.current.poster);
            host.appendChild(still);
            return () => still.remove();
        }
        const el = videos.claim(fileUrl);
        el.muted = callbacks.current.muted;
        el.loop = callbacks.current.loop;
        const onMeta = () => {
            callbacks.current.onDuration?.(el.duration);
            syncRef.current();
        };
        const onEnd = () => callbacks.current.onEnded?.();
        el.addEventListener("loadedmetadata", onMeta);
        el.addEventListener("ended", onEnd);
        host.appendChild(el);
        videoRef.current = el;
        // Taken from another player: already loaded, no loadedmetadata to wait for.
        if (el.readyState >= 1) onMeta();
        return () => {
            el.removeEventListener("loadedmetadata", onMeta);
            el.removeEventListener("ended", onEnd);
            if (videoRef.current === el) videoRef.current = null;
            videos.release(el);
        };
    }, [fileUrl]);

    useLayoutEffect(() => {
        const el = videoRef.current;
        if (!el) return;
        el.muted = muted;
        el.loop = loop;
    }, [muted, loop, fileUrl]);

    // Follow every change of the shared playback, and correct drift now and then.
    useEffect(() => {
        syncRef.current();
        const id = setInterval(() => syncRef.current(), SYNC_MS);
        return () => clearInterval(id);
    }, [item?.url, item?.shownAt, playback?.paused, playback?.position, playback?.at, playback?.volume, playback?.ramp?.at, muted]);

    // On the way out (fadeOut) and while the volume ramps (pausing or playing
    // again with a fade, a Desfazer fading in: playback.ramp), the volume
    // moves in small steps, without a gap; at the end one sync, so a pause
    // that waited for its fade (playbackPlan) happens.
    const fadeAt = fadeOut?.at;
    const fadeUntil = fadeOut?.until;
    const rampAt = playback?.ramp?.at;
    const rampMs = playback?.ramp?.ms;
    useEffect(() => {
        const now = keryx.live.now();
        const ends = [fadeUntil, rampAt === undefined ? undefined : rampAt + rampMs].filter((t) => t !== undefined && t > now);
        if (!ends.length) return undefined;
        const end = Math.max(...ends);
        // Muted (the Programa monitor, the Multiview): no volume to step, but
        // the pause still waits for the ramp, so sync once when it ends —
        // without this it waited for the 2 s drift check.
        if (callbacks.current.muted) {
            const id = setTimeout(() => syncRef.current(), end - now + 5);
            return () => clearTimeout(id);
        }
        const spans = [fadeUntil === undefined ? 0 : fadeUntil - fadeAt, rampMs || 0].filter((ms) => ms > 0);
        const every = Math.max(10, Math.min(40, Math.min(...spans) / 10));
        const step = () => {
            const at = keryx.live.now();
            const v = (playbackRef.current?.volume ?? 1) * playbackGain(playbackRef.current, at) * left();
            const p = ytRef.current;
            if (isYouTube) { if (typeof p?.setVolume === "function") p.setVolume(Math.round(v * 100)); }
            else if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, v));
            return at < end;
        };
        if (!step()) { syncRef.current(); return undefined; }
        const id = setInterval(() => {
            if (step()) return;
            clearInterval(id);
            syncRef.current();
        }, every);
        return () => clearInterval(id);
    }, [fadeAt, fadeUntil, rampAt, rampMs, isYouTube]);

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
                width: "100%",
                height: "100%",
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
                <div className="w-full h-full" style={{ position: "relative", overflow: "hidden" }}>
                    <div ref={ytBoxRef} style={hideYtTitle ? { position: "absolute", left: 0, right: 0, top: YT_CROP, bottom: YT_CROP } : { width: "100%", height: "100%" }} />
                </div>
            ) : (
                <div ref={hostRef} className="w-full h-full" />
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
