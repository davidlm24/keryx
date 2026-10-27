import { useCallback, useEffect, useRef, useState } from "react";
import { forgetInstalledVersions } from "@/lib/bibleText";
import { finishedWords } from "@/lib/console/bibleSetup";

// Bíblias neste computador (owner 2026-10-27): the state of the first
// opening's question and of the downloads it started, pushed by the main
// process (electron/bibleSetup.cjs over bible.onSetup; the browser preview
// runs the same rules in the page). `say` (the console only): the toast when
// the downloads this window saw under way end. A plain browser has no
// bridge and gets null.
export function useBibleSetup({ say = null } = {}) {
    // window.keryxDesktop returns a fresh object on every access: read it once.
    const bridge = useRef(typeof window !== "undefined" ? window.keryxDesktop?.bible || null : null);
    const [state, setState] = useState(null);
    const sawRef = useRef(false);
    const sayRef = useRef(say);
    sayRef.current = say;

    const take = useCallback((s) => {
        if (!s || typeof s !== "object") return;
        if (s.installing || s.pending?.length) sawRef.current = true;
        else if (s.finished && sawRef.current) {
            sawRef.current = false;
            forgetInstalledVersions();
            const words = finishedWords(s);
            if (words) sayRef.current?.(words);
        }
        setState(s);
    }, []);

    useEffect(() => {
        const b = bridge.current;
        if (!b?.setup) return undefined;
        let alive = true;
        b.setup().then((r) => { if (alive && r?.data) take(r.data); }).catch(() => {});
        const off = b.onSetup?.((s) => { if (alive) take(s); });
        // The internet back: the editions waiting go now, not in 10 min.
        const online = () => { b.setupRetry?.().catch(() => {}); };
        window.addEventListener("online", online);
        return () => { alive = false; off?.(); window.removeEventListener("online", online); };
    }, [take]);

    const call = useCallback(async (op, arg) => {
        const b = bridge.current;
        if (!b?.[op]) throw new Error("Disponível no aplicativo do computador.");
        const res = await b[op](arg);
        if (res?.error) throw new Error(res.error.message);
        if (res?.data) take(res.data);
        return res?.data || null;
    }, [take]);

    return {
        state,
        available: Boolean(bridge.current?.setup),
        choose: useCallback((versions) => call("setupChoose", versions), [call]),
        dismiss: useCallback(() => call("setupDismiss"), [call]),
        retry: useCallback(() => call("setupRetry"), [call]),
    };
}
