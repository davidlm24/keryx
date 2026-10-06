import React from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { useLiveState } from "@/hooks/useLiveState";
import CommunicationProjectionView from "@/components/projection/CommunicationProjectionView";
import AlertOverlayRenderer from "@/components/projection/AlertOverlayRenderer";

// A screen for Comunicação Visual only (countdowns, announcements, image +
// text): the live state's communication layer, whatever the main projector
// shows. On the network too.
export default function CommunicationProjection() {
    const communication = useLiveState((s) => s?.communication);
    const advance = (fromIndex) => {
        if (!keryx.isDesktop) return;
        projection.advanceCommunication(fromIndex).catch((err) => console.error("[keryx] comunicação:", err));
    };

    return (
        <>
            {communication
                ? <CommunicationProjectionView key={communication.startedAt} live={communication} onItemEnd={advance} />
                : <CommunicationProjectionView />}
            <AlertOverlayRenderer />
        </>
    );
}
