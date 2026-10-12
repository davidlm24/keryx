import React, { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import Icon from "../Icon";
import { Btn } from "../kx";
import { FormRow, Switch, CfgKey } from "./parts";

// How long Mostrar código keeps the code on screen.
const SHOW_MS = 30000;

// Controle remoto (Configurações › Telas na rede): a phone on the church
// Wi-Fi that conducts the service — slides, Tela preta, Logo, the Setlist,
// a Bíblia reference, Encerrar (held down). Off by default; its own code
// (never the screens' PIN); Desconectar todos signs every phone out
// (electron/network.cjs, electron/lan.cjs). The console runs what the phone
// asks as its own keys would (Console.jsx).
export default function RemoteBlock({ c, network, info, setInfo, url }) {
    const remote = info.remote || { enabled: false, hasCode: false };
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState(false);
    const [confirm, setConfirm] = useState(null);
    useEffect(() => {
        if (!code) return undefined;
        const t = setTimeout(() => setCode(""), SHOW_MS);
        return () => clearTimeout(t);
    }, [code]);
    const run = async (op, args, done) => {
        setBusy(true);
        try {
            const res = await network.call(op, args);
            if (res?.error) { c.say(res.error.message); return null; }
            if (res?.data?.port !== undefined || res?.data?.remote) setInfo(res.data);
            if (done) c.say(done);
            return res?.data ?? null;
        } catch (err) {
            c.say(err?.message || "Não foi possível mudar o controle remoto.");
            return null;
        } finally { setBusy(false); }
    };
    const reveal = async () => {
        if (code) { setCode(""); return; }
        const data = await run("revealRemoteCode");
        if (data?.code) setCode(data.code);
    };
    const twice = (key, message, go) => {
        if (confirm !== key) { setConfirm(key); c.say(message); return; }
        setConfirm(null);
        go();
    };
    const remotes = (info.clients || []).filter((cl) => cl.screen === "/Remote");
    const address = url ? `${url}/Remote` : "";

    return (
        <>
            <CfgKey k="Controle remoto" className="listhead"><span className="kx-section">Controle remoto <span className="kx-count">· um celular conduz o culto pelo Wi-Fi da igreja</span></span></CfgKey>
            <div className="frm">
                <FormRow k="Celular">
                    <Switch on={remote.enabled} disabled={busy} label="Ligar o controle remoto"
                        onChange={(on) => run("setRemote", on, on ? "Controle remoto ligado: abra o endereço no celular e digite o código." : "Controle remoto desligado.")} />
                    <span className={remote.enabled ? "kx-prev" : "kx-meta"}>
                        {remote.enabled ? `Ligado · ${remotes.length} ${remotes.length === 1 ? "celular conectado" : "celulares conectados"}` : "Desligado · nenhum celular pode mexer nas telas"}
                    </span>
                </FormRow>
                {remote.enabled && (
                    <>
                        <FormRow k="Código">
                            {code ? <span className="kx-countdown cfg-pin">{code.split("").join(" ")}</span> : <span className="kx-meta">6 números, pedidos uma vez em cada celular · diferente do PIN das telas</span>}
                            <Btn disabled={busy} on={Boolean(code)} onClick={reveal}>{code ? "Ocultar" : "Mostrar código"}</Btn>
                            <Btn kind={confirm === "code" ? "air" : ""} disabled={busy} onClick={() => twice("code", "Clique de novo em Novo código: os celulares conectados vão pedir o código novo.", async () => { await run("newRemoteCode", undefined, "Código novo. Os celulares precisam digitá-lo de novo."); setCode(""); })}>{confirm === "code" ? "Gerar mesmo" : "Novo código"}</Btn>
                        </FormRow>
                        <FormRow k="Conectados">
                            <Btn kind={confirm === "drop" ? "air" : ""} disabled={busy || !remotes.length} onClick={() => twice("drop", "Clique de novo para desconectar todos os celulares.", () => run("disconnectRemotes", undefined, "Celulares desconectados. Eles precisam digitar o código de novo."))}>
                                {confirm === "drop" ? "Desconectar mesmo" : "Desconectar todos"}
                            </Btn>
                            <span className="kx-meta">{remotes.length ? remotes.map((r) => r.ip).join(", ") : "nenhum agora"}</span>
                        </FormRow>
                    </>
                )}
            </div>
            {remote.enabled && info.running && address && (
                <div className="cfg-qr">
                    <div className="cfg-qr-box"><QRCode value={address} size={132} /></div>
                    <div className="cfg-qr-list">
                        <span className="kx-meta">No celular, conectado ao mesmo Wi-Fi, abra:</span>
                        <div className="cfg-url"><code className="is-main">{address}</code><Icon name="tablet" /></div>
                        <span className="kx-meta">O celular passa slides, liga Tela preta e Logo, envia itens da setlist e versículos, e encerra a projeção (segurando o botão). Com as telas travadas, nada novo vai ao ar. Cada comando aparece aqui no console.</span>
                    </div>
                </div>
            )}
            {remote.enabled && !info.running && <div className="listhead"><span className="kx-warn">Ligue as Telas na rede (acima) para o celular encontrar o KERYX.</span></div>}
        </>
    );
}
