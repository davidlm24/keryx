import React from "react";
import { useConnection } from "@/hooks/useConnection";
import { useLiveState } from "@/hooks/useLiveState";
import { useChurchLogo } from "@/hooks/useChurchLogo";
import { connectionText } from "@/lib/network/connection";
import "./net.css";

// The link of a screen on the network to the KERYX computer, said once for
// every page (App.jsx): a full screen while it has never connected and has
// nothing to show, then only an amber chip while it reconnects, over the last
// image (the screen keeps showing what it had: never a blank wall mid-service).
export default function NetStatus() {
    const conn = useConnection();
    const live = useLiveState();
    const logo = useChurchLogo();
    const text = connectionText(conn);
    if (!text) return null;

    if (!live) {
        return (
            <div className="net-connecting" role="status" aria-live="polite">
                <div>
                    {logo && <img src={logo} alt="" />}
                    <b>{text.title}</b>
                    {text.hint && <small>{text.hint}</small>}
                    <span className="net-dots" aria-hidden="true"><i /><i /><i /></span>
                </div>
            </div>
        );
    }
    // Connected once and has a picture: say it quietly, at the top.
    if (conn.phase === "connecting" && conn.attempt < 2) return null;
    return (
        <div className="net-reconnect" role="status" aria-live="polite">
            <i aria-hidden="true" />{text.title}{text.hint && <small>· {text.hint}</small>}
        </div>
    );
}
