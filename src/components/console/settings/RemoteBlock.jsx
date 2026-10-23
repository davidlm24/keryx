import React, { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import Icon from "../Icon";
import { Btn } from "../kx";
import { remoteSummary } from "@/lib/console/cfgSummaries";
import { FormRow, Switch, CfgGroup } from "./parts";

// How long Mostrar código keeps the code on screen.
const SHOW_MS = 30000;

// The two codes a phone signs in with (electron/network.cjs, lan.cjs): the
// same address, and the code decides the role (Rodada Q, the mockup's
// "ConfigEquipe"). Each has its own switch, code and key: changing one
// signs out only the phones that used it.
const ROLES = {
    // Controle remoto: a phone on the church Wi-Fi that conducts the
    // service — slides, Tela preta, Logo, the Setlist, a Bíblia reference,
    // Encerrar (held down). The console runs what it asks as its own keys
    // would (useRemote.js).
    control: {
        key: "remote",
        ops: { set: "setRemote", reveal: "revealRemoteCode", code: "newRemoteCode", drop: "disconnectRemotes" },
        switchLabel: "Ligar o controle remoto",
        on: "Controle remoto ligado: abra o endereço no celular e digite o código.", off: "Controle remoto desligado.",
        none: "Desligado · nenhum celular pode mexer nas telas",
        codeHint: "6 números, pedidos uma vez em cada celular · diferente do PIN das telas",
        what: "Para o operador: o celular passa slides, liga Tela preta e Logo, envia itens da setlist e versículos, e encerra a projeção (segurando o botão). Com as telas travadas, nada novo vai ao ar. Cada comando aparece aqui no console.",
    },
    // A Equipe: the worship team's phones — song requests, messages to the
    // operator, the lyrics, the Bíblia and the Setlist to read. Never the
    // air nor the setlist (lan.cjs refuses it, not only the phone).
    team: {
        key: "team",
        ops: { set: "setTeam", reveal: "revealTeamCode", code: "newTeamCode", drop: "disconnectTeam" },
        switchLabel: "Ligar a equipe",
        on: "Equipe ligada: abra o endereço no celular e digite o código da equipe.", off: "Equipe desligada.",
        none: "Desligado · nenhum celular da equipe entra",
        codeHint: "6 números, diferentes do código do controle remoto",
        what: "Para a equipe de louvor: pedidos, mensagens, letras, Bíblia e a setlist. Nunca mexe no ar.",
    },
};

export default function RemoteBlock({ c, network, info, setInfo, url, role = "control" }) {
    const r = ROLES[role] || ROLES.control;
    const state = info[r.key] || { enabled: false, hasCode: false };
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
            c.say(err?.message || "Não foi possível mudar o celular.");
            return null;
        } finally { setBusy(false); }
    };
    const reveal = async () => {
        if (code) { setCode(""); return; }
        const data = await run(r.ops.reveal);
        if (data?.code) setCode(data.code);
    };
    const twice = (key, message, go) => {
        if (confirm !== key) { setConfirm(key); c.say(message); return; }
        setConfirm(null);
        go();
    };
    const phones = (info.clients || []).filter((cl) => cl.screen === "/Remote" && (cl.role || "control") === role);
    const address = url ? `${url}/Remote` : "";

    const body = (
        <>
            <div className="frm">
                <FormRow k="Celular">
                    <Switch on={state.enabled} disabled={busy} label={r.switchLabel} onChange={(on) => run(r.ops.set, on, on ? r.on : r.off)} />
                    <span className={state.enabled ? "kx-prev" : "kx-meta"}>
                        {state.enabled ? `Ligado · ${phones.length} ${phones.length === 1 ? "celular conectado" : "celulares conectados"}` : r.none}
                    </span>
                </FormRow>
                {state.enabled && (
                    <>
                        <FormRow k="Código">
                            {code ? <span className="kx-countdown cfg-pin">{code.split("").join(" ")}</span> : <span className="kx-meta">{r.codeHint}</span>}
                            <Btn disabled={busy} on={Boolean(code)} onClick={reveal}>{code ? "Ocultar" : "Mostrar código"}</Btn>
                            <Btn kind={confirm === "code" ? "air" : ""} disabled={busy} onClick={() => twice("code", "Clique de novo em Trocar o código: os celulares que usavam este código vão pedir o novo.", async () => { await run(r.ops.code, undefined, "Código novo. Esses celulares precisam digitá-lo de novo."); setCode(""); })}>{confirm === "code" ? "Trocar mesmo" : "Trocar o código"}</Btn>
                        </FormRow>
                        <FormRow k="Conectados">
                            <Btn kind={confirm === "drop" ? "air" : ""} disabled={busy || !phones.length} onClick={() => twice("drop", "Clique de novo para desconectar estes celulares.", () => run(r.ops.drop, undefined, "Celulares desconectados. Eles precisam digitar o código de novo."))}>
                                {confirm === "drop" ? "Desconectar mesmo" : "Desconectar todos"}
                            </Btn>
                            <span className="kx-meta">{phones.length ? phones.map((p) => p.ip).join(", ") : "nenhum agora"}</span>
                        </FormRow>
                    </>
                )}
            </div>
            {state.enabled && info.running && address && (
                <div className="cfg-qr">
                    <div className="cfg-qr-box"><QRCode value={address} size={132} /></div>
                    <div className="cfg-qr-list">
                        <span className="kx-meta">No celular, abra:</span>
                        <div className="cfg-url"><code className="is-main">{address}</code><Icon name="tablet" /></div>
                        <span className="kx-meta">{r.what}</span>
                        {role === "team" && <span className="kx-meta">O mesmo endereço do controle remoto: o código decide o ambiente. Trocar um código desconecta só quem usava aquele.</span>}
                    </div>
                </div>
            )}
            {state.enabled && !info.running && <div className="listhead"><span className="kx-warn">Ligue as telas na rede (acima) para o celular encontrar o KERYX.</span></div>}
        </>
    );
    // Each group's k written out: the settings search finds them by it (settingsSearch.js).
    const summary = remoteSummary(state, phones.length);
    return role === "team"
        ? <CfgGroup id="rede.equipe" k="Equipe" summary={summary}>{body}</CfgGroup>
        : <CfgGroup id="rede.remoto" k="Controle remoto" summary={summary}>{body}</CfgGroup>;
}
