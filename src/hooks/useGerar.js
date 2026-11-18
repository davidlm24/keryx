import { useCallback, useEffect, useRef, useState } from "react";

// The GERAR on this computer (electron/gerarLink.cjs; owner 2026-11-18):
// its status, asked once and then pushed by the main process on every
// change (keryx:gerar), and `call(op, args)` for Conectar, Desconectar,
// Receber and Buscar agora. Off in a browser without the desktop (null).
// window.keryxDesktop returns a fresh object on every access: read it once.
export function useGerar() {
    const bridge = useRef(undefined);
    if (bridge.current === undefined) bridge.current = (typeof window !== "undefined" && window.keryxDesktop?.gerar) || null;
    const [status, setStatus] = useState(null);

    useEffect(() => {
        const g = bridge.current;
        if (!g) return undefined;
        let live = true;
        g.call("status").then((res) => { if (live && res?.data) setStatus(res.data); }).catch(() => {});
        const off = g.onStatus ? g.onStatus((s) => { if (live && s) setStatus(s); }) : null;
        return () => { live = false; if (off) off(); };
    }, []);

    const call = useCallback(async (op, args) => {
        const g = bridge.current;
        if (!g) return { error: { message: "Esta parte funciona no KERYX do computador.", status: 503 } };
        const res = await g.call(op, args).catch((err) => ({ error: { message: err?.message || "Falha na conexão com o GERAR." } }));
        if (res?.data) setStatus(res.data);
        return res;
    }, []);

    return { status, call, available: Boolean(bridge.current) };
}

// Something for the GERAR's way back (src/lib/console/gerarBack.js makes the
// entry; electron/gerarOutbox.cjs keeps and sends it). Quiet: a computer not
// connected to the GERAR keeps nothing, and the console never waits.
export function pushToGerar(entry) {
    const g = typeof window !== "undefined" ? window.keryxDesktop?.gerar : null;
    if (!entry || !g) return;
    g.call("push", entry).catch(() => {});
}
