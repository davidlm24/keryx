import React, { useState } from "react";
import { Btn } from "./kx";
import { useFocusFirst } from "./Menu";
import { useAnchor } from "./Popovers";
import { useBridge } from "./settings/parts";
import { useSyncStatus, setSyncStatus } from "@/hooks/useSyncStatus";
import { useLiveNow } from "@/hooks/useLiveState";
import { signInWithGoogle } from "@/hooks/useGoogleSync";
import { cloudView, arrivingPct } from "@/lib/console/syncView";

// The cloud's summary (Google Drive direto, PR 3; board 6 of the mockup,
// G5 = A): under the top bar's cloud, the console's popover (open "sync":
// Esc and a click outside close it, escapeTarget's "popover"). The state
// and how long ago, then Conta, Internet, Esperando, Chegando (a bar while a
// file comes down) and Computadores; Sincronizar agora and "Ver tudo em
// Configurações". Sem internet, Entre de novo, Sem conta (and a computer
// still on the folder) say why in a line and offer Tentar agora or Entrar
// com Google instead.
export default function SyncPop({ open, setOpen, onSettings, say, songsHere = 0 }) {
    const active = open === "sync";
    const st = useSyncStatus();
    useLiveNow(1000, active);
    const anchor = useAnchor(".topbar .tb-sync", 340, active);
    const box = useFocusFirst(active);
    const sync = useBridge("sync");
    const [busy, setBusy] = useState(false);
    if (!active) return null;
    const view = cloudView(st);
    const pct = arrivingPct(st);
    const all = () => { setOpen(null); onSettings("sincronizacao"); };
    const now = async () => {
        if (!sync) return;
        setBusy(true);
        try {
            const res = await sync.call("now");
            if (res?.error) say(`Sincronizar agora: ${res.error.message}`);
            else if (res?.data) setSyncStatus(res.data);
        } finally {
            setBusy(false);
        }
    };
    // Entering shows "Termine a entrada no navegador" on the page.
    const enter = () => {
        all();
        signInWithGoogle({ say, songsHere, status: st });
    };
    const mainAct = view.act === "signin"
        ? <Btn kind="brand" onClick={enter}>Entrar com Google</Btn>
        : view.act ? <Btn kind="outline" disabled={busy} onClick={now}>{busy ? "Sincronizando…" : view.act === "retry" ? "Tentar agora" : "Sincronizar agora"}</Btn> : null;
    return (
        <div ref={box} role="dialog" aria-label="Sincronização" className="pop kx-pop sync-pop" style={{ left: anchor?.left ?? 6, top: "var(--pop-top)", width: anchor?.width ?? 340 }}>
            <div className="sync-pop-h">
                <i className={`sync-pop-dot is-${view.tone}`} aria-hidden="true" />
                <span className="sync-pop-t">{view.label}</span>
                {view.when && <span className="kx-meta">· {view.when}</span>}
            </div>
            {view.text && <p className="sync-pop-text">{view.text}</p>}
            {view.rows.length > 0 && (
                <dl className="sync-pop-rows">
                    {view.rows.map(([k, v]) => (
                        <React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>
                    ))}
                </dl>
            )}
            {pct != null && view.rows.length > 0 && (
                <span className="sync-pop-bar" role="progressbar" aria-label="Arquivo chegando" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${pct}%` }} /></span>
            )}
            <div className="sync-pop-f">
                {mainAct}
                <span style={{ flex: 1 }} />
                <Btn kind={view.act === "now" ? "brand" : ""} onClick={all}>{view.act === "now" ? "Ver tudo em Configurações" : "Ver tudo"}</Btn>
            </div>
        </div>
    );
}
