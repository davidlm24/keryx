import React, { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import Icon from "../Icon";
import { Btn, Field, Empty } from "../kx";
import { useBridge, usePoll, Switch, desktopOnly, CfgKey, Reading } from "./parts";
import { byGroup } from "@/lib/console/outputs";
import { useOutputLooks, useOutputPrefRows } from "@/hooks/useOutputPref";
import { OutputPreview } from "./OutputPrefCard";
import { openEditor } from "@/lib/editorWindow";
import { normalizePref, designOf } from "@/lib/outputPrefs";
import { useLayoutRows } from "@/hooks/useLayout";
import { useChurch } from "@/hooks/useChurch";
import { useThemes } from "../useConsoleData";
import RemoteBlock from "./RemoteBlock";

// How long Mostrar PIN keeps it on screen.
const SHOW_PIN_MS = 30000;

// Four digits from the system's random source (not Math.random).
const newPin = () => {
    const n = new Uint32Array(1);
    crypto.getRandomValues(n);
    return String(1000 + (n[0] % 9000));
};

// Telas na rede: tablets, TVs and the stage monitor on the church Wi-Fi open
// the screen pages in a browser (electron/lan.cjs). On/off, the address and
// its QR code, the PIN and who is connected now.
export default function RedeSection({ c }) {
    const look = useOutputLooks();
    const prefRows = useOutputPrefRows();
    const layoutRows = useLayoutRows();
    const church = useChurch();
    const themes = useThemes();
    const network = useBridge("network");
    const [info, , setInfo, readError] = usePoll(() => network?.call("info"), 3000);
    const [pin, setPin] = useState("");
    const [shownPin, setShownPin] = useState("");
    const [busy, setBusy] = useState(false);
    // Gerar novo (with a PIN set) and Remover disconnect every device: a
    // second click confirms.
    const [confirm, setConfirm] = useState(null);
    // Mostrar PIN: read on demand, shown for a while, gone when the section closes.
    useEffect(() => {
        if (!shownPin) return undefined;
        const t = setTimeout(() => setShownPin(""), SHOW_PIN_MS);
        return () => clearTimeout(t);
    }, [shownPin]);
    if (!network) return <Empty icon="wifi" title="Telas na rede">{desktopOnly}</Empty>;
    if (!info) return <Reading what="a rede" error={readError} />;

    // -> true when the change was saved.
    const run = async (op, args, done) => {
        setBusy(true);
        try {
            const res = await network.call(op, args);
            if (res?.error) { c.say(res.error.message); return false; }
            setInfo(res.data);
            if (done) c.say(done);
            return true;
        } catch (err) {
            c.say(err?.message || "Não foi possível mudar as telas na rede.");
            return false;
        } finally { setBusy(false); }
    };
    // The PIN shows only once it is saved.
    const savePin = async (value) => {
        setConfirm(null);
        const ok = await run("setPin", value, value ? "PIN salvo. Os aparelhos conectados vão pedir o PIN novo." : "PIN removido.");
        if (!ok) return;
        setShownPin(value);
        setPin("");
    };
    const confirmFirst = (what, go) => {
        if (!info.hasPin || confirm === what) { go(); return; }
        setConfirm(what);
        c.say(what === "remove" ? "Clique de novo em Remover: qualquer aparelho na rede vai poder ver as telas." : "Clique de novo em Gerar novo: os aparelhos conectados vão pedir o PIN novo.");
    };
    const revealPin = async () => {
        if (shownPin) { setShownPin(""); return; }
        try {
            const res = await network.call("revealPin");
            if (res?.error) c.say(res.error.message);
            else if (res?.data?.pin) setShownPin(res.data.pin);
        } catch { c.say("Não foi possível ler o PIN."); }
    };
    const copy = (url) => {
        const fail = () => c.say(`Não foi possível copiar. O endereço é ${url}`);
        try { navigator.clipboard.writeText(url).then(() => c.say("Endereço copiado."), fail); } catch { fail(); }
    };
    const main = info.urls?.[0];
    const clients = info.clients || [];

    return (
        <>
            <div className="frm">
                <CfgKey as="span" k="Ligar telas na rede" className="k">Ligado</CfgKey>
                <div className="frm-v">
                    <Switch on={info.enabled} disabled={busy} onChange={(on) => run("setEnabled", on)} label="Ligar telas na rede" />
                    <span className={info.running ? "kx-prev" : info.enabled ? "kx-warn" : "kx-meta"}>
                        {info.running ? `Ligado · ${clients.length} ${clients.length === 1 ? "tela conectada" : "telas conectadas"}` : info.enabled ? "Ligado, mas não está funcionando" : "Desligado"}
                    </span>
                    {info.error && <span className="kx-warn">{info.error}</span>}
                </div>
                <CfgKey as="span" k="PIN" className="k">PIN</CfgKey>
                <div className="frm-v">
                    {shownPin ? <span className="kx-countdown cfg-pin">{shownPin.split("").join(" ")}</span> : <span className="kx-meta">{info.hasPin ? "Ativo · cada aparelho pede uma vez" : "Sem PIN · qualquer aparelho na rede pode ver as telas"}</span>}
                    {info.hasPin && <Btn disabled={busy} on={Boolean(shownPin)} onClick={revealPin}>{shownPin ? "Ocultar" : "Mostrar PIN"}</Btn>}
                    <Btn kind={confirm === "new" ? "air" : ""} disabled={busy} onClick={() => confirmFirst("new", () => savePin(newPin()))}>{confirm === "new" ? "Gerar mesmo" : "Gerar novo"}</Btn>
                    {info.hasPin && <Btn kind={confirm === "remove" ? "air" : ""} disabled={busy} onClick={() => confirmFirst("remove", () => savePin(""))}>{confirm === "remove" ? "Remover mesmo" : "Remover"}</Btn>}
                </div>
                <span className="k" />
                <div className="frm-v">
                    <Field icon={null} value={pin} onChange={(v) => setPin(v.replace(/\D/g, "").slice(0, 8))} placeholder="Ou digite um PIN (4 a 8 números)" onKeyDown={(e) => { if (e.key === "Enter" && pin.length >= 4) savePin(pin); }} style={{ maxWidth: 280 }} />
                    <Btn kind="brand" disabled={busy || pin.length < 4} onClick={() => savePin(pin)}>Salvar PIN</Btn>
                </div>
            </div>
            {info.running && (
                <div className="cfg-qr">
                    {main && <div className="cfg-qr-box"><QRCode value={main.url} size={132} /></div>}
                    <div className="cfg-qr-list">
                        <span className="kx-meta">No navegador do tablet ou da TV (mesmo Wi-Fi), abra:</span>
                        {(info.urls || []).length === 0 && <span className="kx-warn">Este computador não está ligado a nenhuma rede local.</span>}
                        {(info.urls || []).map((u, i) => (
                            <div key={u.url} className="cfg-url">
                                <code className={i === 0 ? "is-main" : ""}>{u.url}</code>
                                <button type="button" className="kx-btn kx-btn-icon kx-t" onClick={() => copy(u.url)} aria-label={`Copiar ${u.url}`} title="Copiar"><Icon name="copy" /></button>
                                {i > 0 && <span className="kx-meta">{u.name}</span>}
                            </div>
                        ))}
                    </div>
                </div>
            )}
            {/* Each screen by what it is for, with its own address: a device can
                open it straight away, and OBS needs the Transmissão one. */}
            {info.running && main && byGroup(info.screens || [], (s) => s.path).map((g) => (
                <React.Fragment key={g.key}>
                    <div className="listhead"><span className="kx-section">{g.label}</span></div>
                    {g.items.map((s) => (
                        <React.Fragment key={s.path}>
                        <div className="kx-row cfg-screen">
                            <span className="kx-glyph"><Icon name={look(s.path).icon} /></span>
                            <div className="kx-row-main"><div className="kx-row-title">{s.label}</div><div className="kx-row-meta">{s.hint}</div></div>
                            <code className="cfg-screen-url">{`${main.url}${s.path}`}</code>
                            <button type="button" className="kx-btn kx-btn-icon kx-t" onClick={() => copy(`${main.url}${s.path}`)} aria-label={`Copiar o endereço de ${s.label}`} title="Copiar o endereço"><Icon name="copy" /></button>
                            {s.path === "/StreamView" && <Btn onClick={() => { const r = openEditor({ screen: s.path, from: "Telas na rede" }); if (r?.error) c.say(r.error); }} title="Cor, tamanho e posição da faixa da legenda, no Editor"><Icon name="sliders" />Ajustes</Btn>}
                        </div>
                        </React.Fragment>
                    ))}
                </React.Fragment>
            ))}
            <RemoteBlock c={c} network={network} info={info} setInfo={setInfo} url={main?.url || ""} />
            <CfgKey k="Telas conectadas pela rede" className="listhead"><span className="kx-section">Telas conectadas pela rede</span></CfgKey>
            {!clients.length && <div className="listhead"><span className="kx-meta">{info.running ? "Nenhuma agora." : "Ligue as telas na rede para os aparelhos se conectarem."}</span></div>}
            {clients.map((cl) => {
                const path = cl.screen && cl.screen !== "/Remote" ? cl.screen : "";
                const pref = path ? normalizePref(prefRows.find((r) => r.screen_path === path) || null) : null;
                return (
                    <div key={`${cl.ip}-${cl.since}`} className="kx-row cfg-net-row">
                        {/* A still of what this screen draws right now: the same
                            page, the same settings, the same live state. */}
                        {pref
                            ? <span className="cfg-net-thumb"><OutputPreview path={path} pref={pref} design={designOf(pref, layoutRows)} themes={themes} live={c.live} church={church} /></span>
                            : <span className="kx-glyph"><Icon name={cl.screen === "/Remote" ? "tablet" : "tv"} /></span>}
                        <div className="kx-row-main"><div className="kx-row-title">{cl.label || "Página inicial"}</div><div className="kx-row-meta">{cl.ip} · conectada desde {new Date(cl.since).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</div></div>
                    </div>
                );
            })}
            <div className="listhead"><span className="kx-meta">Na primeira vez o Windows pergunta se o KERYX pode usar a rede: permita em redes privadas.</span></div>
        </>
    );
}
