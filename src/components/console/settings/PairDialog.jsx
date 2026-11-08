import React, { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import QRCode from "react-qr-code";
import { Btn } from "../kx";
import Icon from "../Icon";
import { useDialogFocus } from "../useDialogFocus";
import { countdown } from "@/lib/console/phoneDevices";

// Conectar um aparelho… (owner 2026-11-08, mockup board 2, marks M1–M5 = A):
// a QR that pairs one phone, for 5 minutes. Main makes the ticket
// (network op pairStart, electron/phoneDevices.cjs); the address in front is
// the section's (info.urls, never window.location). Asked every second what
// became of it: waiting, done ("Celular do João conectado"), expired. Closing
// while it waits cancels it. Esc closes it first (a capture listener: the
// window under it would close too); Windows order, the action then Fechar.
const DOOR_NAME = { control: "Controle", team: "Equipe" };

export default function PairDialog({ role, url, network, onClose, onPaired, say }) {
    const [ticket, setTicket] = useState(null); // { ticket, path, expires }
    const [status, setStatus] = useState({ state: "starting" });
    const [now, setNow] = useState(Date.now());
    const boxRef = useRef(null);
    useDialogFocus(boxRef, true);

    // The parent redraws every few seconds (the section polls info()): its
    // callbacks ride in a ref, so a redraw never makes a new QR.
    const cb = useRef({ onClose, onPaired, say });
    cb.current = { onClose, onPaired, say };
    const start = useCallback(async () => {
        setStatus({ state: "starting" });
        try {
            const res = await network.call("pairStart", { role });
            if (res?.error) { cb.current.say?.(res.error.message); cb.current.onClose(); return; }
            setTicket(res.data);
            setNow(Date.now());
            setStatus({ state: "waiting" });
        } catch (err) { cb.current.say?.(err?.message || "Não foi possível gerar o QR."); cb.current.onClose(); }
    }, [network, role]);
    // Once, when the dialog opens (Gerar outro / Conectar outro call start again).
    const started = useRef(false);
    useEffect(() => { if (started.current) return; started.current = true; start(); }, [start]);

    // What became of the QR, every second, while it waits.
    const waiting = status.state === "waiting" && ticket;
    useEffect(() => {
        if (!waiting) return undefined;
        let alive = true;
        const tick = async () => {
            setNow(Date.now());
            try {
                const res = await network.call("pairStatus", { ticket: ticket.ticket });
                const s = res?.data;
                if (!alive || !s || s.state === "waiting") return;
                setStatus(s);
                if (s.state === "done") cb.current.onPaired?.(s.device);
            } catch { /* the next tick asks again */ }
        };
        const t = setInterval(tick, 1000);
        return () => { alive = false; clearInterval(t); };
    }, [waiting, ticket, network]);

    const close = useCallback(() => {
        if (status.state === "waiting" && ticket) network.call("pairCancel", { ticket: ticket.ticket }).catch(() => {});
        cb.current.onClose();
    }, [status.state, ticket, network]);
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [close]);
    useEffect(() => { setTimeout(() => boxRef.current?.querySelector(".pair-acts .kx-btn")?.focus(), 0); }, [status.state]);

    const door = DOOR_NAME[role] || "Controle";
    const link = ticket && url ? `${url}${ticket.path}` : "";
    const expired = status.state === "expired";
    const done = status.state === "done";
    const dialog = (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={close} />
            <div ref={boxRef} className="dialog confirm-dialog pair-dialog" role="dialog" aria-modal="true" aria-label={`Conectar um aparelho · ${door}`}>
                <div className="rp-head"><Icon name="qr" /><span>Conectar um aparelho · {door}</span></div>
                {done ? (
                    <div className="pair-done" role="status">
                        <span className="pair-ok"><Icon name="check" /></span>
                        <b>{status.device?.name || "Aparelho"} conectado</b>
                        <span className="kx-meta">{door} · aparece em Aparelhos</span>
                    </div>
                ) : (
                    <div className="pair-body">
                        <div className={`pair-qr ${expired ? "is-expired" : ""}`} aria-hidden={expired ? "true" : undefined}>
                            {link ? <QRCode value={link} size={196} /> : <span className="pair-qr-wait" />}
                        </div>
                        {expired ? (
                            <>
                                <b>O QR expirou</b>
                                <span className="kx-warn">Gere outro para conectar</span>
                            </>
                        ) : (
                            <>
                                <b>Escaneie com a câmera do celular</b>
                                <span className="kx-meta pair-count" aria-live="off">{ticket ? `Aguardando o celular… ${countdown(ticket.expires, now)} · vale uma vez` : "Gerando o QR…"}</span>
                            </>
                        )}
                    </div>
                )}
                <div className="acts pair-acts">
                    {done ? <Btn kind="outline" onClick={start}>Conectar outro</Btn> : <Btn kind="outline" disabled={status.state === "starting"} onClick={start}>Gerar outro</Btn>}
                    <Btn onClick={close}>{status.state === "waiting" ? "Cancelar" : "Fechar"}</Btn>
                </div>
            </div>
        </>
    );
    // Over the whole console (its scrim and dialog styles are the console's).
    return createPortal(dialog, document.querySelector(".console") || document.body);
}
