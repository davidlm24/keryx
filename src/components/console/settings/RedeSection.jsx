import React, { useState } from "react";
import QRCode from "react-qr-code";
import Icon from "../Icon";
import { Btn, Field, Empty } from "../kx";
import { useBridge, usePoll, Switch, desktopOnly } from "./parts";

const newPin = () => String(Math.floor(1000 + Math.random() * 9000));

// Telas na rede: tablets, TVs and the stage monitor on the church Wi-Fi open
// the screen pages in a browser (electron/lan.cjs). On/off, the address and
// its QR code, the PIN and who is connected now.
export default function RedeSection({ c }) {
    const network = useBridge("network");
    const [info, , setInfo] = usePoll(() => network?.call("info"), 3000);
    const [pin, setPin] = useState("");
    const [shownPin, setShownPin] = useState("");
    const [busy, setBusy] = useState(false);
    if (!network) return <Empty icon="wifi" title="Telas na rede">{desktopOnly}</Empty>;
    if (!info) return <Empty title="Lendo a rede…" />;

    const run = async (op, args, done) => {
        setBusy(true);
        try {
            const res = await network.call(op, args);
            if (res?.error) c.say(res.error.message);
            else { setInfo(res.data); if (done) c.say(done); }
        } finally { setBusy(false); }
    };
    const savePin = async (value) => {
        await run("setPin", value, value ? "PIN salvo. Os aparelhos conectados vão pedir o PIN novo." : "PIN removido.");
        setShownPin(value);
        setPin("");
    };
    const copy = (url) => { navigator.clipboard?.writeText(url).then(() => c.say("Endereço copiado."), () => {}); };
    const main = info.urls?.[0];
    const clients = info.clients || [];

    return (
        <>
            <div className="frm">
                <span className="k">Telas na rede</span>
                <div className="frm-v">
                    <Switch on={info.enabled} disabled={busy} onChange={(on) => run("setEnabled", on)} label="Ligar telas na rede" />
                    <span className={info.running ? "kx-prev" : info.enabled ? "kx-warn" : "kx-meta"}>
                        {info.running ? `Ligado · ${clients.length} ${clients.length === 1 ? "tela conectada" : "telas conectadas"}` : info.enabled ? "Ligado, mas não está funcionando" : "Desligado"}
                    </span>
                    {info.error && <span className="kx-warn">{info.error}</span>}
                </div>
                <span className="k">PIN</span>
                <div className="frm-v">
                    {shownPin ? <span className="kx-countdown cfg-pin">{shownPin.split("").join(" ")}</span> : <span className="kx-meta">{info.hasPin ? "Ativo · cada aparelho pede uma vez" : "Sem PIN · qualquer aparelho na rede pode ver as telas"}</span>}
                    <Btn disabled={busy} onClick={() => savePin(newPin())}>Gerar novo</Btn>
                    {info.hasPin && <Btn disabled={busy} onClick={() => savePin("")}>Remover</Btn>}
                </div>
                <span className="k" />
                <div className="frm-v">
                    <Field icon={null} value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))} placeholder="Ou digite um PIN (4 a 8 números)" onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) savePin(pin); }} style={{ maxWidth: 280 }} />
                    <Btn disabled={busy || pin.length < 4} onClick={() => savePin(pin)}>Salvar PIN</Btn>
                </div>
            </div>
            {info.running && (
                <div className="cfg-qr">
                    {main && <div className="cfg-qr-box"><QRCode value={main.url} size={132} /></div>}
                    <div className="cfg-qr-list">
                        <span className="kx-meta">No navegador do tablet ou da TV, abra:</span>
                        {(info.urls || []).length === 0 && <span className="kx-warn">Este computador não está ligado a nenhuma rede local.</span>}
                        {(info.urls || []).map((u, i) => (
                            <div key={u.url} className="cfg-url">
                                <code className={i === 0 ? "is-main" : ""}>{u.url}</code>
                                <button type="button" className="kx-btn kx-btn-icon kx-t" onClick={() => copy(u.url)} aria-label={`Copiar ${u.url}`} title="Copiar"><Icon name="external" /></button>
                                {i > 0 && <span className="kx-meta">{u.name}</span>}
                            </div>
                        ))}
                        <span className="kx-meta">Telas disponíveis: {(info.screens || []).map((s) => s.label).join(", ")}.</span>
                    </div>
                </div>
            )}
            <div className="listhead"><span className="kx-section">Telas conectadas pela rede</span></div>
            {!clients.length && <div className="listhead"><span className="kx-meta">{info.running ? "Nenhuma agora." : "Ligue as telas na rede para os aparelhos se conectarem."}</span></div>}
            {clients.map((cl) => (
                <div key={`${cl.ip}-${cl.since}`} className="kx-row">
                    <span className="kx-glyph"><Icon name="tv" /></span>
                    <div className="kx-row-main"><div className="kx-row-title">{cl.ip}</div><div className="kx-row-meta">conectada desde {new Date(cl.since).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div></div>
                    <span className="kx-prev" style={{ fontSize: 11 }}>Conectada</span>
                </div>
            ))}
            <div className="listhead"><span className="kx-meta">Na primeira vez o Windows pergunta se o KERYX pode usar a rede: permita em redes privadas. Os aparelhos precisam estar no mesmo Wi-Fi.</span></div>
        </>
    );
}
