import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

// Small pieces shared by the Configurações sections (console design system).

// window.keryxDesktop.* is a fresh object on every access (contextBridge):
// read it once per component.
export function useBridge(name) {
    const ref = useRef(undefined);
    if (ref.current === undefined) ref.current = window.keryxDesktop?.[name] || null;
    return ref.current;
}

// Polls a desktop call ({ data } | { error }) every `ms`; returns [data, refresh].
export function usePoll(fn, ms) {
    const [data, setData] = useState(null);
    const fnRef = useRef(fn);
    fnRef.current = fn;
    const refresh = useCallback(async () => {
        try {
            const res = await fnRef.current();
            if (res && !res.error) setData(res.data);
        } catch { /* the next poll tries again */ }
    }, []);
    useEffect(() => {
        refresh();
        if (!ms) return undefined;
        const id = setInterval(refresh, ms);
        return () => clearInterval(id);
    }, [refresh, ms]);
    return [data, refresh, setData];
}

// An on/off switch (design: .sw2), a real button.
export function Switch({ on, onChange, label, disabled }) {
    return <button type="button" className={`sw2 kx-t ${on ? "is-on" : ""}`} role="switch" aria-checked={Boolean(on)} aria-label={label} title={label} disabled={disabled} onClick={() => onChange(!on)} />;
}

// The row the search just jumped to (its label), lit for a moment
// (SettingsView). Rows find themselves by their label: data-cfg-k.
export const CfgFlash = createContext(null);
export function useFlash(k) {
    const flash = useContext(CfgFlash);
    return k && flash === k ? "is-flash" : "";
}

// One "label · control" line of a section form (design: .frm).
export function FormRow({ k, children }) {
    const flash = useFlash(k);
    return (
        <>
            <span className={`k ${flash}`} data-cfg-k={k || undefined}>{k}</span>
            <div className={`frm-v ${flash}`}>{children}</div>
        </>
    );
}

// Any other element the search can jump to (a list's heading, a button).
export function CfgKey({ k, as: Tag = "div", className = "", children, ...rest }) {
    const flash = useFlash(k);
    return <Tag className={`${className} ${flash}`} data-cfg-k={k} {...rest}>{children}</Tag>;
}

export const formatBytes = (n) => {
    if (!n && n !== 0) return "";
    if (n >= 1024 ** 3) return `${(n / 1024 ** 3).toFixed(1)} GB`;
    if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return `${Math.max(1, Math.round(n / 1024))} KB`;
};
export const formatWhen = (iso) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

export const desktopOnly = "Esta parte funciona no KERYX do computador.";
