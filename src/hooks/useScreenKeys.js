import { useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { usePrefs } from "@/hooks/useUser";
import { screenKeyOp } from "@/lib/screenKeys";

// The console's screen keys on an output window of this computer (every
// output page calls it): the operator who clicked the projector, the Palco
// or any other output keeps ← / →, B, L, C and Esc there (screenKeys.js).
// Never on a screen on the network (a TV, a tablet): those only show.
export function useScreenKeys(live) {
    const prefs = usePrefs();
    const state = useRef({ live, prefs });
    state.current = { live, prefs };
    useEffect(() => {
        if (!keryx.isDesktop || keryx.isNetworkScreen) return undefined;
        const onKey = (e) => {
            if (e.defaultPrevented || (e.repeat && !/^(Arrow|Page)/.test(e.key))) return; // a held B never flickers
            const call = screenKeyOp(e, state.current.live, state.current.prefs);
            if (!call) return;
            e.preventDefault();
            keryx.live.call(...call).catch((err) => console.error("[keryx] screen key:", err));
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);
}
