import { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";

const REFRESH_MS = 10000;

// The address other devices (tablets, TVs, OBS) use to open KERYX pages.
//   desktop:   the network-screen URL while "Telas na rede" is on, else null,
//              so the caller can say how to turn it on (127.0.0.1 is useless
//              to another device)
//   elsewhere: the page's own origin
// { baseUrl, ready }
export function useLanBaseUrl() {
    const [state, setState] = useState(() => (keryx.isDesktop
        ? { baseUrl: null, ready: false }
        : { baseUrl: window.location.origin, ready: true }));

    useEffect(() => {
        if (!keryx.isDesktop) return undefined;
        const bridge = window.keryxDesktop.network;
        let alive = true;
        const load = () => bridge.call("info").then((res) => {
            if (!alive) return;
            const url = !res.error && res.data.running && res.data.urls[0] ? res.data.urls[0].url : null;
            setState({ baseUrl: url, ready: true });
        }).catch(() => {});
        load();
        const interval = setInterval(load, REFRESH_MS);
        return () => {
            alive = false;
            clearInterval(interval);
        };
    }, []);

    return state;
}

export const LAN_OFF_HINT = "Para abrir em tablets e TVs, ligue “Telas na rede” em Configurações.";
