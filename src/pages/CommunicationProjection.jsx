import React from "react";
import { keryx } from "@/api/keryxClient";
import { useLiveState, useLiveNow } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { useNoticeAdvance } from "@/hooks/useNoticeAdvance";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";

// A screen for avisos only (countdowns, announcements, image + text): the
// live state's communication layer, whatever the main projector shows,
// drawn by the same ScreenRenderer as every other output. On the network too.
export default function CommunicationProjection() {
    const communication = useLiveState((s) => s?.communication);
    const now = useLiveNow(1000);
    const logo = useChurchLogo();
    useNoticeAdvance(communication);
    return (
        <>
            <ScreenRenderer fill state={communication ? { screen: "show", communication } : null} now={now} logoUrl={logo} audio={!keryx.isNetworkScreen} />
            <AlertOverlayRenderer />
        </>
    );
}
