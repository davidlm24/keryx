import React, { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import Icon from "../Icon";
import { Btn } from "../kx";
import { phonesSummary } from "@/lib/console/cfgSummaries";
import { FormRow, Switch, CfgGroup, CfgKey } from "./parts";

// How long Mostrar código keeps the code on screen.
const SHOW_MS = 30000;

// The two doors a phone enters by (electron/network.cjs, lan.cjs): the same
// address, the phone picks Controle or Equipe and types that side's code,
// and the server checks it against that side alone. Each has its own switch,
// code and key: changing one signs out only the phones that used it.
const DOORS = {
    // Controle: a phone on the church Wi-Fi that conducts the service —
    // slides, Tela preta, Logo, the Setlist, a Bíblia reference, Encerrar
    // (held down). The console runs what it asks as its own keys would
    // (useRemote.js).
    control: {
        key: "remote", k: "Controle", icon: "monitor",
        ops: { set: "setRemote", reveal: "revealRemoteCode", code: "newRemoteCode", drop: "disconnectRemotes" },
        switchLabel: "Ligar o Controle",
        on: "Controle ligado: no celular, escolha Controle e digite o código.", off: "Controle desligado.",
        none: "Desligado · nenhum celular pode mexer nas telas",
        what: "Muda o que está no ar: slides, Tela preta, Logo, a setlist, versículos e Encerrar (segurando o botão). Com as telas travadas, nada novo vai ao ar. Cada comando aparece aqui no console.",
    },
    // The Equipe: the worship team's phones — song requests, messages to the
    // operator, the lyrics, the Bíblia and the Setlist to read. Never the
    // air nor the setlist (lan.cjs refuses it, not only the phone).
    team: {
        key: "team", k: "Equipe", icon: "user",
        ops: { set: "setTeam", reveal: "revealTeamCode", code: "newTeamCode", drop: "disconnectTeam" },
        switchLabel: "Ligar a Equipe",
        on: "Equipe ligada: no celular, escolha Equipe e digite o código da equipe.", off: "Equipe desligada.",
        none: "Desligada · nenhum celular da equipe entra",
        what: "Para a equipe de louvor: pedidos, chat, letras, Bíblia e a setlist. Só lê: nunca mexe no ar.",
    },
};

const phonesOf = (info, role) => (info.clients || []).filter((cl) => cl.screen === "/Remote" && (!role || (cl.role || "control") === role));

// One network call: the toast says the outcome, the info that comes back
// redraws the section.
function useRun(c, network, setInfo) {
    const [busy, setBusy] = useState(false);
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
    return [run, busy];
}

// One door's card: its switch, its code (shown on demand, renewed) and the
// phones that entered by it.
function Door({ c, network, info, setInfo, role }) {
    const d = DOORS[role];
    const state = info[d.key] || { enabled: false, hasCode: false };
    const [run, busy] = useRun(c, network, setInfo);
    const [code, setCode] = useState("");
    const [confirm, setConfirm] = useState(null);
    useEffect(() => {
        if (!code) return undefined;
        const t = setTimeout(() => setCode(""), SHOW_MS);
        return () => clearTimeout(t);
    }, [code]);
    const reveal = async () => {
        if (code) { setCode(""); return; }
        const data = await run(d.ops.reveal);
        if (data?.code) setCode(data.code);
    };
    const twice = (key, message, go) => {
        if (confirm !== key) { setConfirm(key); c.say(message); return; }
        setConfirm(null);
        go();
    };
    const phones = phonesOf(info, role);
    const head = (
        <>
            <Icon name={d.icon} />
            <span className="cfg-door-t">{d.k}</span>
            <Switch on={state.enabled} small disabled={busy} label={d.switchLabel} onChange={(on) => run(d.ops.set, on, on ? d.on : d.off)} />
        </>
    );
    return (
        <section className="cfg-door" aria-label={d.k}>
            {/* Each k written out: the settings search finds them by it (settingsSearch.js). */}
            {role === "team" ? <CfgKey k="Equipe" className="cfg-door-h">{head}</CfgKey> : <CfgKey k="Controle" className="cfg-door-h">{head}</CfgKey>}
            <span className="kx-meta">{state.enabled ? d.what : d.none}</span>
            {state.enabled && (
                <div className="frm">
                    <FormRow k="Código">
                        {code ? <span className="kx-countdown cfg-pin">{code.split("").join(" ")}</span> : <span className="kx-meta cfg-pin" aria-hidden="true">••••••</span>}
                        <Btn disabled={busy} on={Boolean(code)} onClick={reveal}>{code ? "Ocultar" : "Mostrar código"}</Btn>
                        <Btn kind={confirm === "code" ? "air" : ""} disabled={busy} onClick={() => twice("code", "Clique de novo em Trocar o código: os celulares que usavam este código vão pedir o novo.", async () => { await run(d.ops.code, undefined, "Código novo. Esses celulares precisam digitá-lo de novo."); setCode(""); })}>{confirm === "code" ? "Trocar mesmo" : "Trocar o código"}</Btn>
                    </FormRow>
                    <FormRow k="Conectados">
                        <Btn kind={confirm === "drop" ? "air" : ""} disabled={busy || !phones.length} onClick={() => twice("drop", "Clique de novo para desconectar estes celulares.", () => run(d.ops.drop, undefined, "Celulares desconectados. Eles precisam digitar o código de novo."))}>
                            {confirm === "drop" ? "Desconectar mesmo" : "Desconectar todos"}
                        </Btn>
                        <span className="kx-meta">{phones.length ? `${phones.length} · ${phones.map((p) => p.ip).join(", ")}` : "nenhum agora"}</span>
                    </FormRow>
                </div>
            )}
        </section>
    );
}

// KERYX no celular (owner 2026-10-27, one group for the Controle and the
// Equipe): the main switch, the one address and its QR code, then the two
// doors side by side, either of which can stay off.
export default function PhonesBlock({ c, network, info, setInfo, url }) {
    const [run, busy] = useRun(c, network, setInfo);
    const on = Boolean(info.phones?.enabled);
    const phones = phonesOf(info);
    const address = url ? `${url}/Remote` : "";
    return (
        <CfgGroup id="rede.celular" k="KERYX no celular" summary={phonesSummary(info, phones.length)}>
            <div className="frm">
                <FormRow k="Celulares">
                    <Switch on={on} disabled={busy} label="Ligar o KERYX no celular" onChange={(next) => run("setPhones", next, next ? "KERYX no celular ligado: abra o endereço no celular, escolha Controle ou Equipe e digite o código." : "KERYX no celular desligado. Os celulares conectados saíram.")} />
                    <span className={on ? "kx-prev" : "kx-meta"}>
                        {on ? `Ligado · ${phones.length} ${phones.length === 1 ? "celular conectado" : "celulares conectados"}` : "Desligado · nenhum celular entra"}
                    </span>
                </FormRow>
            </div>
            {on && info.running && address && (
                <div className="cfg-qr">
                    <div className="cfg-qr-box"><QRCode value={address} size={132} /></div>
                    <div className="cfg-qr-list">
                        <span className="kx-meta">No celular, abra:</span>
                        <div className="cfg-url"><code className="is-main">{address}</code><Icon name="tablet" /></div>
                        <span className="kx-meta">Um endereço só: no celular a pessoa escolhe Controle ou Equipe e digita o código daquele.</span>
                    </div>
                </div>
            )}
            {on && !info.running && <div className="listhead"><span className="kx-warn">Ligue as telas na rede (acima) para o celular encontrar o KERYX.</span></div>}
            {on && (
                <>
                    <div className="cfg-doors">
                        <Door c={c} network={network} info={info} setInfo={setInfo} role="control" />
                        <Door c={c} network={network} info={info} setInfo={setInfo} role="team" />
                    </div>
                    <div className="listhead"><span className="kx-meta">Cada código tem 6 números, pedidos uma vez em cada celular. Os dois nunca são iguais e não são o PIN das telas. Trocar um código desconecta só quem usava aquele.</span></div>
                </>
            )}
        </CfgGroup>
    );
}
