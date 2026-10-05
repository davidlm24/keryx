import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Activity } from "lucide-react";

/**
 * Mede a latência de ida-e-volta das atualizações da LiveSession.
 * Envia um update com timestamp e mede quanto tempo demora a chegar de volta
 * via subscrição. Mostra o valor em ms.
 */
export default function LatencyIndicator({ liveSessionId }) {
    const [latency, setLatency] = useState(null);
    const [measuring, setMeasuring] = useState(false);

    useEffect(() => {
        if (!liveSessionId) return;

        const unsubscribe = base44.entities.LiveSession.subscribe((event) => {
            if (event.type === "update" && event.data?.id === liveSessionId) {
                const sentAt = event.data._latencyProbe;
                if (sentAt) {
                    const ms = Date.now() - sentAt;
                    setLatency(ms);
                    setMeasuring(false);
                }
            }
        });

        // Medir a cada 10s
        const probe = () => {
            setMeasuring(true);
            base44.entities.LiveSession.update(liveSessionId, {
                _latencyProbe: Date.now()
            }).catch(() => setMeasuring(false));
        };

        const interval = setInterval(probe, 10000);
        probe(); // medição inicial

        return () => {
            clearInterval(interval);
            unsubscribe();
        };
    }, [liveSessionId]);

    if (!liveSessionId) return null;

    const color = latency === null ? "text-gray-400" : latency < 200 ? "text-green-400" : latency < 500 ? "text-yellow-400" : "text-red-400";

    return (
        <div className="flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg bg-black/40 backdrop-blur-sm">
            <Activity className={`w-3.5 h-3.5 ${color}`} />
            <span className={color}>
                {measuring ? "..." : latency !== null ? `${latency}ms` : "—"}
            </span>
        </div>
    );
}