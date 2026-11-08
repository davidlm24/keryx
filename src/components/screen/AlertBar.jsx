import React from "react";
import "./screen.css";
import { ALERT_DEFAULTS } from "@/lib/outputPrefs";

// The Aviso rápido (alert.show) as every screen draws it (Rodada E3: one
// look, each output's choice): a band across the top or bottom (Faixa) or a
// pill in the middle (Pílula), in the colours, size and entrance the output
// chose (alertOptions, carried as alert.look by prefState / alertOf); no
// look = the amber band across the top, as the Projeção always drew it. Sized
// in container units: it sits in a screen's own box (.ks, .kl, .net). A new
// aviso, or another entrance, position or style, plays the entrance again
// (the key); a type "alert" keeps its red.
export default function AlertBar({ alert }) {
    if (!alert?.message) return null;
    const o = { ...ALERT_DEFAULTS, ...(alert.look || {}) };
    return (
        <div key={`${alert.since}:${o.entrance}:${o.position}:${o.style}`}
            className={`ks-alert ks-alert-${alert.type || "message"} is-${o.position} is-${o.style} is-size-${o.size} is-in-${o.entrance}`}
            style={{ "--ka-bg": o.bg, "--ka-fg": o.fg }}>
            {alert.message}
        </div>
    );
}

// Over a page that draws something else full screen (the Vídeo's clip): a
// window-sized box for the bar, clicks passing through.
export function AlertLayer({ alert }) {
    if (!alert?.message) return null;
    return <div className="ks-alert-layer"><AlertBar alert={alert} /></div>;
}
