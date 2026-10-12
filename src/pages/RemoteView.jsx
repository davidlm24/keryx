import React, { useCallback, useEffect, useRef, useState } from "react";
import Icon from "@/components/console/Icon";
import { useLiveState } from "@/hooks/useLiveState";
import { captionParts } from "@/lib/console/caption";
import { remoteCall, HOLD_MS } from "@/lib/console/remoteClient";
import { useChurch } from "@/hooks/useChurch";

const upperFirst = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

// Controle remoto (/Remote): a phone on the church Wi-Fi conducts the
// service. Only on the network, only while the operator turned it on, only
// with its code (electron/lan.cjs). Every button asks the console, which
// runs it as its own key would (Console.jsx) and answers; the answer shows
// at the bottom. What is on air comes from the live state, like the screens.
// Encerrar tudo must be held down (HOLD_MS): a touch by accident never ends.
export default function RemoteView() {
    const live = useLiveState();
    const church = useChurch();
    const [busy, setBusy] = useState("");
    const [note, setNote] = useState({ text: "", bad: false });
    const [state, setState] = useState(null);
    const noteTimer = useRef(null);

    const say = useCallback((text, bad = false) => {
        setNote({ text, bad });
        clearTimeout(noteTimer.current);
        noteTimer.current = setTimeout(() => setNote({ text: "", bad: false }), 4000);
    }, []);
    const send = useCallback(async (action, args) => {
        setBusy(action);
        const r = await remoteCall(action, args);
        setBusy("");
        if (r.signedOut) { window.location.href = "/lan/remote-code"; return r; }
        if (action !== "state") say(r.ok ? upperFirst(r.message.replace(/^Celular: /, "")) || "Feito." : r.message, !r.ok);
        if (navigator.vibrate) try { navigator.vibrate(r.ok ? 15 : [30, 40, 30]); } catch { /* no vibration */ }
        return r;
    }, [say]);

    // The service as the console sees it (the next item, the Setlist):
    // again whenever something new goes on air, and every few seconds.
    const airKey = `${live?.content?.startedAt || ""}|${live?.session?.itemId || ""}|${live?.screen || ""}|${live?.locked ? 1 : 0}`;
    useEffect(() => {
        let alive = true;
        const read = () => remoteCall("state").then((r) => { if (alive && r.ok) setState(r.result); if (r.signedOut) window.location.href = "/lan/remote-code"; });
        read();
        const id = setInterval(read, 10000);
        return () => { alive = false; clearInterval(id); };
    }, [airKey]);

    const { title, pos } = captionParts(live);
    const onAir = title && title !== "nada";
    const screen = live?.screen || "show";
    const next = state?.items?.find((i) => i.id === state?.nextItemId) || null;
    const locked = Boolean(live?.locked);

    return (
        <div className="net rm">
            <header className="rm-h">
                <span className="net-section">{church.name || "KERYX"} · Controle remoto</span>
                <div className={`rm-air ${onAir ? "is-air" : ""}`}>
                    <span className="rm-air-k">{screen === "black" ? "Tela preta" : screen === "logo" ? "Logo" : onAir ? "No ar" : "Nada no ar"}</span>
                    <b>{onAir ? title : "—"}</b>
                    {pos && <span className="rm-pos">{pos}</span>}
                </div>
                {locked && <div className="rm-locked"><Icon name="lock" />Telas travadas no computador: nada novo vai ao ar</div>}
            </header>

            <main className="rm-b">
                <div className="rm-nav">
                    <button type="button" className="rm-btn rm-big" disabled={Boolean(busy)} onClick={() => send("prev")} aria-label="Slide anterior"><Icon name="chevron-left" size={28} /><span>Anterior</span></button>
                    <button type="button" className="rm-btn rm-big" disabled={Boolean(busy)} onClick={() => send("next")} aria-label="Próximo slide"><span>Próximo</span><Icon name="chevron-right" size={28} /></button>
                </div>
                <button type="button" className="rm-btn rm-send" disabled={Boolean(busy) || !next || locked} onClick={() => send("sendNext")}>
                    <Icon name="arrow-right" size={20} />
                    <span className="rm-send-t"><small>Enviar o próximo da setlist</small><b>{next ? next.title : "Nada depois na setlist"}</b></span>
                </button>
                <div className="rm-grid">
                    <button type="button" className={`rm-btn ${screen === "black" ? "is-on" : ""}`} aria-pressed={screen === "black"} disabled={Boolean(busy)} onClick={() => send("black")}><Icon name="black" size={20} />Tela preta</button>
                    <button type="button" className={`rm-btn ${screen === "logo" ? "is-on" : ""}`} aria-pressed={screen === "logo"} disabled={Boolean(busy)} onClick={() => send("logo")}><Icon name="logo" size={20} />Logo</button>
                    <button type="button" className="rm-btn" disabled={Boolean(busy)} onClick={() => send("clear")}><Icon name="eraser" size={20} />Limpar</button>
                    <button type="button" className="rm-btn" disabled={Boolean(busy)} onClick={() => send("play")}><Icon name="play" size={20} />Tocar / pausar</button>
                </div>
                <HoldButton disabled={Boolean(busy)} onDone={() => send("end")} />
            </main>

            <footer className={`rm-note ${note.bad ? "is-bad" : ""}`} role="status" aria-live="polite">{note.text}</footer>
        </div>
    );
}

// Encerrar tudo: hold it down; a ring fills; letting go before stops it.
function HoldButton({ disabled, onDone }) {
    const [holding, setHolding] = useState(false);
    const timer = useRef(null);
    const start = (e) => {
        if (disabled) return;
        e.preventDefault();
        setHolding(true);
        timer.current = setTimeout(() => { setHolding(false); onDone(); }, HOLD_MS);
    };
    const stop = () => { clearTimeout(timer.current); setHolding(false); };
    useEffect(() => () => clearTimeout(timer.current), []);
    return (
        <button type="button" className={`rm-btn rm-end ${holding ? "is-holding" : ""}`} disabled={disabled} style={{ "--rm-hold": `${HOLD_MS}ms` }}
            onPointerDown={start} onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}
            aria-label="Encerrar tudo: segure por um segundo e meio">
            <i className="rm-end-fill" aria-hidden="true" />
            <Icon name="power" size={20} /><span>{holding ? "Continue segurando…" : "Segure para encerrar tudo"}</span>
        </button>
    );
}
