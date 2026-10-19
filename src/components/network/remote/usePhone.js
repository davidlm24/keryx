import { useCallback, useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { remoteCall } from "@/lib/console/remoteClient";
import { STALE_MS, STATE_EVERY_MS, UNDO_MS, sayOf } from "@/lib/network/remoteView";

const signIn = () => { window.location.href = "/lan/remote-code"; };

// What only the console knows (the Setlist, the next item, the timers, the
// Bíblia's edition…): `state`, asked on mount, when the phone comes back on
// screen or online, when what is on air changes, and every 20 s while it is
// on screen — never pushed (shared/remoteProtocol.json, notes.split).
// gate: "off" (the remote was turned off) | "closed" (no console) | null.
export function usePhoneState(live) {
    const [state, setState] = useState(null);
    const [gate, setGate] = useState(null);
    const app = useRef(null);
    const read = useCallback(async () => {
        const r = await remoteCall("state");
        if (r.signedOut) return signIn();
        if (r.off) return setGate("off");
        if (r.closed) return setGate("closed");
        if (!r.ok || !r.result) return;
        setGate(null);
        // A new KERYX on the computer: this page may be old.
        if (app.current && r.result.app && r.result.app !== app.current) return window.location.reload();
        app.current = r.result.app || app.current;
        setState((prev) => (prev && r.result.rev != null && prev.rev === r.result.rev ? prev : r.result));
    }, []);
    const airKey = `${live?.session?.itemId || ""}|${live?.screen || ""}|${live?.locked ? 1 : 0}|${live?.content?.startedAt || ""}`;
    useEffect(() => { read(); }, [airKey, read]);
    useEffect(() => {
        const visible = () => document.visibilityState === "visible";
        const wake = () => { if (visible()) read(); };
        const id = setInterval(wake, STATE_EVERY_MS);
        document.addEventListener("visibilitychange", wake);
        window.addEventListener("pageshow", wake);
        window.addEventListener("online", wake);
        return () => {
            clearInterval(id);
            document.removeEventListener("visibilitychange", wake);
            window.removeEventListener("pageshow", wake);
            window.removeEventListener("online", wake);
        };
    }, [read]);
    return { state, gate, setGate, refresh: read };
}

// No frame from the computer for 25 s (live changes and the hb every 10 s):
// the link is dead even when the socket says otherwise.
export function useStale() {
    const [stale, setStale] = useState(false);
    useEffect(() => {
        const check = () => {
            const at = keryx.connection.lastEventAt();
            setStale(at > 0 && Date.now() - at > STALE_MS);
        };
        const id = setInterval(check, 2000);
        return () => clearInterval(id);
    }, []);
    return stale;
}

// One command at a time per control: the control pressed is busy (and a
// second tap on it is ignored) until its answer; every other control stays
// as it was. Answers show in a toast; nothing is ever sent again by itself.
export function useCommands({ setGate }) {
    const inflight = useRef(new Set());
    const [busy, setBusy] = useState(() => new Set());
    const [toast, setToast] = useState(null);
    const [unknown, setUnknown] = useState(false);
    const timer = useRef(null);
    const say = useCallback((text, { bad = false, undo = false } = {}) => {
        clearTimeout(timer.current);
        setToast({ id: Date.now(), text, bad, undo });
        timer.current = setTimeout(() => setToast(null), undo ? UNDO_MS : bad ? 4500 : 3200);
    }, []);
    useEffect(() => () => clearTimeout(timer.current), []);
    const run = useCallback(async (key, action, args = {}, { quiet = false } = {}) => {
        if (inflight.current.has(key)) return null;
        inflight.current.add(key);
        setBusy(new Set(inflight.current));
        let r;
        try {
            r = await remoteCall(action, args);
        } finally {
            inflight.current.delete(key);
            setBusy(new Set(inflight.current));
        }
        if (r.signedOut) { signIn(); return r; }
        if (r.off) { setGate("off"); return r; }
        if (r.closed) { setGate("closed"); return r; }
        setUnknown(Boolean(r.unknown));
        // Only after a real tap: before one, Chrome blocks the call and logs it.
        if (navigator.vibrate && navigator.userActivation?.hasBeenActive !== false) try { navigator.vibrate(r.ok ? 15 : [30, 40, 30]); } catch { /* no vibration */ }
        // An unknown outcome is the banner's ("Não sei se foi"), not a toast too.
        if (!r.ok) { if (!r.unknown) say(r.message, { bad: true }); else setToast(null); }
        else if (action === "end") say("Projeção encerrada.", { undo: Boolean(r.result?.undo) });
        else if (!quiet) say(sayOf(r));
        return r;
    }, [say, setGate]);
    return { busy, run, toast, closeToast: () => setToast(null), unknown, clearUnknown: () => setUnknown(false) };
}

// "Manter a tela ligada" (owner's pick: opt-in). The Wake Lock API needs
// HTTPS and the page is http://192.168…, so a tiny silent video loops in
// the page instead (started by the tap that turns it on, as phones ask);
// where the API exists (a secure origin) it is used.
export function useKeepAwake() {
    const [on, setOn] = useState(false);
    const video = useRef(null);
    const lock = useRef(null);
    const stop = useCallback(() => {
        setOn(false);
        try { lock.current?.release(); } catch { /* already released */ }
        lock.current = null;
        if (video.current) { video.current.pause(); video.current.remove(); video.current = null; }
    }, []);
    const start = useCallback(() => {
        setOn(true);
        if (window.isSecureContext && navigator.wakeLock?.request) {
            navigator.wakeLock.request("screen").then((l) => { lock.current = l; }).catch(() => {});
            return;
        }
        const v = document.createElement("video");
        v.className = "rm-awake";
        v.muted = true;
        v.loop = true;
        v.playsInline = true;
        v.setAttribute("playsinline", "");
        v.setAttribute("aria-hidden", "true");
        v.src = "/nosleep.mp4";
        document.body.appendChild(v);
        video.current = v;
        v.play().catch(() => {});
    }, []);
    // The API's lock ends when the page hides; it is asked again on return.
    useEffect(() => {
        if (!on) return undefined;
        const back = () => {
            if (document.visibilityState !== "visible") return;
            if (!(window.isSecureContext && navigator.wakeLock?.request)) { video.current?.play().catch(() => {}); return; }
            if (!lock.current || lock.current.released) navigator.wakeLock.request("screen").then((l) => { lock.current = l; }).catch(() => {});
        };
        document.addEventListener("visibilitychange", back);
        return () => document.removeEventListener("visibilitychange", back);
    }, [on]);
    useEffect(() => stop, [stop]);
    return { on, start, stop };
}
