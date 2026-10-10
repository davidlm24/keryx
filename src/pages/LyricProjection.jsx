import React from "react";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import TabletVideoReceiver from "@/components/projection/TabletVideoReceiver";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { lyricView } from "@/lib/network/views";

// The lyrics screen (tablets, TVs, the "Letras" output): the same renderer as
// the projector and the console's monitors, showing only the song's layers
// (src/lib/network/views.js): its slides, background, logo, overlays and
// alerts; with nothing on air, the live idle look. A clip on the video
// channel covers it while it plays.
export default function LyricProjection() {
    const live = useLiveState();
    const now = useLiveNow(1000);
    const logo = useChurchLogo();
    return (
        <>
            <TabletVideoReceiver />
            <ScreenRenderer fill state={lyricView(live)} now={now} logoUrl={logo} audio={false} />
        </>
    );
}
