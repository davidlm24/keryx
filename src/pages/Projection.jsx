import React, { useEffect, useState } from "react";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";
import LiveVideo from "@/components/projection/LiveVideo";
import OutputScreen from "@/components/screen/OutputScreen";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { useNoticeAdvance } from "@/hooks/useNoticeAdvance";
import { useScreenKeys } from "@/hooks/useScreenKeys";
import { leavingAudio } from "@/lib/exitFade";

// The main projector: the live state (shared/live-state.mjs) rendered full
// screen by ScreenRenderer, the same component the console's monitors use,
// with this output's settings (OutputScreen).
export default function Projection() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const logo = useChurchLogo();

    // A network screen (tablet, TV) fills itself. On the desktop the main
    // process decides: full screen on an external monitor, a window on a
    // single-monitor PC; asking here would cover the console.
    useEffect(() => {
        if (keryx.isDesktop) return;
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen().catch(() => {});
    }, []);

    // If the operator clicked the projector window, the console's screen
    // keys still work there (useScreenKeys: ← → and the clicker move the
    // slide, B, L, C, Esc — with the church's Transições). A click moves
    // nothing (owner 2026-10-16: a stray click changed the slide on air).
    useScreenKeys(live);

    // Avisos in a sequence ("Tocar todos"): at the end of each piece the
    // projector moves the live state on (communication.advance ignores the
    // same report from another screen).
    useNoticeAdvance(live?.communication);

    // The audio channel plays here, on the KERYX computer only (a TV on the
    // network showing this page stays silent), in whatever the screen shows.
    const audio = live?.audio || null;
    const audioIndex = audio?.playlistIndex ?? 0;
    const playsAudio = keryx.isDesktop && !keryx.isNetworkScreen;
    const audioPlayer = audio && playsAudio ? (
        <div className="hidden" aria-hidden="true">
            <LiveVideo item={audio} meter="audio" onEnded={() => { if (audio.playlist) projection.advanceAudio(audioIndex).catch(() => {}); }} />
        </div>
    ) : null;
    // One sound at a time (Transições): what a new sound stopped on the audio
    // channel with a fade plays on here until it is silent, then goes.
    const fading = playsAudio ? leavingAudio(live, keryx.live.now()) : [];
    const [, setTick] = useState(0);
    const lastUntil = Math.max(0, ...fading.map((e) => e.until));
    useEffect(() => {
        if (!lastUntil) return undefined;
        const id = setTimeout(() => setTick((t) => t + 1), Math.max(0, lastUntil - keryx.live.now()) + 50);
        return () => clearTimeout(id);
    }, [lastUntil]);

    return (
        <>
            {audioPlayer}
            {fading.map((e) => (
                <div key={`${e.at}:${e.item.url}`} className="hidden" aria-hidden="true">
                    <LiveVideo item={e.item} fadeOut={{ at: e.at, until: e.until }} />
                </div>
            ))}
            <TabletVideoReceiver />
            <OutputScreen page="/Projection" live={live} now={now} logoUrl={logo} audio={!keryx.isNetworkScreen} />
        </>
    );
}
