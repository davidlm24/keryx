import React from "react";
import { keryx } from "@/api/keryxClient";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useScreenKeys } from "@/hooks/useScreenKeys";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { useNoticeAdvance } from "@/hooks/useNoticeAdvance";
import OutputScreen from "@/components/screen/OutputScreen";

// A screen for avisos only (countdowns, announcements, image + text): the
// live state's communication layer, whatever the main projector shows,
// drawn by the same ScreenRenderer as every other output, with this output's
// settings (OutputScreen) — the Aviso rápido too, in this screen's look
// (Rodada E3). On the network too.
export default function CommunicationProjection() {
    const live = useLiveState();
    const communication = live?.communication;
    const now = useLiveNow(1000);
    const logo = useChurchLogo();
    useScreenKeys(live);
    useNoticeAdvance(communication);
    return <OutputScreen page="/CommunicationProjection" live={live} now={now} logoUrl={logo} audio={!keryx.isNetworkScreen} />;
}
