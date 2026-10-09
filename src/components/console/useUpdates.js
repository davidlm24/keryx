import { useCallback, useEffect, useRef, useState } from "react";

// The updater's state and the bell's notifications, pushed by the main
// process (electron/updater.cjs, electron/notifications.cjs). A plain
// browser (the preview, a network screen) has neither and gets empty values.
export function useUpdates() {
    // window.keryxDesktop returns a fresh object on every access: read it once.
    const bridge = useRef(typeof window !== "undefined" ? window.keryxDesktop?.system : null);
    const [update, setUpdate] = useState(null);
    const [notes, setNotes] = useState([]);

    useEffect(() => {
        const sys = bridge.current;
        if (!sys?.onUpdate) return undefined;
        let alive = true;
        sys.call("updateState").then((r) => { if (alive && r?.data) setUpdate(r.data); }).catch(() => {});
        sys.call("notifications").then((r) => { if (alive && Array.isArray(r?.data)) setNotes(r.data); }).catch(() => {});
        const offUpdate = sys.onUpdate((state) => setUpdate(state));
        const offNotes = sys.onNotifications((list) => setNotes(Array.isArray(list) ? list : []));
        return () => { alive = false; offUpdate(); offNotes(); };
    }, []);

    const call = useCallback(async (op, args) => {
        const res = await bridge.current?.call(op, args);
        if (res?.error) throw new Error(res.error.message);
        if (op.startsWith("notification") && Array.isArray(res?.data)) setNotes(res.data);
        return res?.data;
    }, []);

    return { update, notes, unread: notes.filter((n) => !n.read).length, call };
}
