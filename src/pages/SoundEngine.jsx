import React, { useEffect, useState } from "react";
import LiveVideo from "@/components/projection/LiveVideo";
import LiveMediaView from "@/components/projection/LiveMediaView";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useExitGhost } from "@/hooks/useExitGhost";
import { usePrefs } from "@/hooks/useUser";
import { leavingAudio, screenExitMs, videoExitMs } from "@/lib/exitFade";
import { soundPlan, mediaSoundOf } from "@/lib/soundPlan";
import { ringBell } from "@/lib/bell";

/**
 * The sound engine (owner 2026-11-08: after the service of 07/11 a video's
 * sound came out once per open output). A hidden window of the KERYX
 * computer (electron/soundEngine.cjs) that plays every sound KERYX makes and
 * shows nothing; every output window is muted (outputs-manager.cjs). What it
 * plays is src/lib/soundPlan.js, in step with the live state like any output
 * (LiveVideo: the shared position, pause ramps and volume), and it reports
 * ends as the outputs do (a list moves on, a single file leaves; the live
 * state ignores a repeated report). What leaves fades out on the same curve
 * the screens draw (useExitGhost, exitFade.js). Never a network screen,
 * never in the Saídas list.
 */
export default function SoundEngine() {
    const live = useLiveState();
    const plan = soundPlan(live, keryx.live.now());
    const [, setTick] = useState(0);

    // The media layer and the video channel, and what they leave fading out.
    const ghost = useExitGhost(live, live?.rev, screenExitMs);
    const leavingMedia = ghost ? mediaSoundOf(ghost.from) : null;
    const vghost = useExitGhost(live, live?.rev, videoExitMs);
    const leavingVideo = vghost?.from?.video || null;

    // The audio channel, and what a new sound stopped on it with a fade.
    const audio = plan.audio;
    const audioIndex = audio?.playlistIndex ?? 0;
    const fading = leavingAudio(live, keryx.live.now());
    const lastUntil = Math.max(0, ...fading.map((e) => e.until));
    useEffect(() => {
        if (!lastUntil) return undefined;
        const id = setTimeout(() => setTick((t) => t + 1), Math.max(0, lastUntil - keryx.live.now()) + 50);
        return () => clearTimeout(id);
    }, [lastUntil]);

    return (
        <div className="fixed inset-0 bg-black" aria-hidden="true">
            {/* The audio channel first: on the eye (media.toAudio) its player
                takes the media layer's element in this commit before the
                fading media below looks for it (LiveVideo, mediaPool.js). */}
            {audio && (
                <LiveVideo item={audio} meter="audio" onEnded={() => { (audio.playlist ? projection.advanceAudio(audioIndex) : projection.audioEnded(audio.url)).catch(() => {}); }} />
            )}
            {fading.map((e) => <LiveVideo key={`${e.at}:${e.item.url}`} item={e.item} fadeOut={{ at: e.at, until: e.until }} />)}
            {plan.video && (
                <LiveVideo item={plan.video} meter="video" className="w-full h-full"
                    onEnded={() => { projection.clearVideo({ ended: true }).catch(() => {}); }}
                    onRefused={(code) => { projection.clearVideo({ refused: code, url: plan.video.url }).catch(() => {}); }} />
            )}
            {leavingVideo && <LiveVideo key={vghost.key} item={leavingVideo} fadeOut={{ at: vghost.at, until: vghost.until }} className="w-full h-full" />}
            {plan.media && <LiveMediaView media={plan.media} />}
            {leavingMedia && <LiveMediaView key={ghost.key} media={leavingMedia} fadeOut={{ at: ghost.at, until: ghost.until }} />}
            {plan.track && <audio key={plan.track.key} src={plan.track.src} autoPlay />}
            {plan.notice && <audio key={plan.notice.key} src={plan.notice.src} autoPlay loop />}
            {plan.chime && <Chime key={plan.chime} />}
            <ActivityBell live={live} />
        </div>
    );
}

// An Escola activity's discussion time: the clock ticks only while one is on air.
function ActivityBell({ live }) {
    const discussing = Boolean(live?.content?.revealed);
    const now = useLiveNow(1000, discussing);
    const bell = discussing ? soundPlan(live, now).bell : null;
    return bell ? <Chime key={bell} /> : null;
}

// The church's chime (on or off, its volume: Configurações).
function Chime() {
    const prefs = usePrefs();
    useEffect(() => { ringBell({ on: prefs.chime_on, volume: prefs.chime_volume }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    return null;
}
