// The console's layout as a dock panel in a window of its own reads it
// (PanelPage.jsx, "Painéis em janela"): this computer's saved layout
// (layout.js, localStorage per operator profile), followed through the
// `storage` event as the console saves. What the panel changes — its tabs,
// the Biblioteca's folders and second line — shows here at once and goes to
// the console (layout.patch, janelaRelay.js), which keeps the one copy and
// saves it; the next `storage` event brings it back here.
import { useCallback, useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { loadLayout } from "@/lib/console/layout";
import { relaySend, LAYOUT_PATCH_KEYS } from "@/lib/janelaRelay";

const KEY_PREFIX = "keryx.console.layout.";

export function useSharedLayout(say) {
    const profile = useRef("");
    const [layout, setLayout] = useState(() => loadLayout(""));
    useEffect(() => {
        let gone = false;
        keryx.auth.me().then((u) => {
            if (gone) return;
            profile.current = u?.email || u?.full_name || "";
            setLayout(loadLayout(profile.current));
        }).catch(() => {});
        const on = (e) => {
            if (e.key !== null && e.key !== `${KEY_PREFIX}${profile.current || "default"}`) return;
            setLayout(loadLayout(profile.current));
        };
        window.addEventListener("storage", on);
        return () => { gone = true; window.removeEventListener("storage", on); };
    }, []);
    const patch = useCallback((p) => {
        const clean = Object.fromEntries(Object.entries(p || {}).filter(([k]) => LAYOUT_PATCH_KEYS.includes(k)));
        if (!Object.keys(clean).length) return;
        setLayout((cur) => ({ ...cur, ...clean }));
        if (!relaySend("janela", "layout.patch", { patch: clean })) say?.("O console não recebeu: ele está aberto?");
    }, [say]);
    return [layout, patch];
}
