import React, { useEffect, useRef, useState } from "react";
import { Btn } from "../kx";
import { useConfirm } from "../ConfirmDialog";
import { useLiveNow } from "@/hooks/useLiveState";
import { useGerar } from "@/hooks/useGerar";
import { gerarPage, gerarWho, gerarBadge, gerarProgress, needsWords, linkErrorTone, gerarSummary, gerarLibraryLine } from "@/lib/console/gerarView";
import { FormRow, CfgGroup, Switch, desktopOnly } from "./parts";

const DOT = { ok: "is-ok", wait: "is-wait", need: "is-need", off: "is-off" };

// Configurações › Conexões (owner 2026-11-18, mockup "KERYX · GERAR na mesa",
// D1 = A): a section of its own, the GERAR its first group. This computer
// is a device of the church's GERAR (electron/gerarLink.cjs): an
// administrator there makes a one-time code and names the computer, typed
// here once; only outgoing requests, nothing listens. "Precisa de você"
// (the GERAR refused the session or this device) is said here, in the bell
// once and by a red dot in Ferramentas › Conexões (D4 = A), and never
// retried by itself: only a new code connects again.
export default function ConexoesSection({ c }) {
    const { status: st, call, available } = useGerar();
    const confirm = useConfirm();
    const now = useLiveNow(10000);
    const [code, setCode] = useState("");
    const [busy, setBusy] = useState("");
    const [error, setError] = useState(null);
    const field = useRef(null);
    const page = gerarPage(st);

    // A new state clears the line of the last Conectar.
    useEffect(() => { if (page === "on") setError(null); }, [page]);

    if (!available) return <p className="kx-meta cfg-gerar-note">{desktopOnly}</p>;
    if (!st) return <p className="kx-meta cfg-gerar-note">lendo…</p>;

    const run = async (op, args, label) => {
        setBusy(op);
        try {
            const res = await call(op, args);
            if (res?.error) {
                if (op === "link") setError({ text: res.error.message, tone: linkErrorTone(res.error.code) });
                else c.say(res.error.message || `${label}: falhou.`);
                return null;
            }
            return res.data;
        } finally {
            setBusy("");
        }
    };
    const connect = async (e) => {
        e?.preventDefault?.();
        setError(null);
        const done = await run("link", { code }, "Conectar");
        if (done) {
            setCode("");
            c.say(done.device?.name ? `Conectado ao GERAR como “${done.device.name}”.` : "Conectado ao GERAR.");
        }
    };
    const forget = async (needsNow) => {
        const ok = await confirm(needsNow
            ? { title: "Esquecer a conexão com o GERAR?", text: "A sessão guardada neste computador sai. Para conectar de novo, um administrador do GERAR gera um código novo.", ok: "Esquecer", danger: true }
            : { title: "Desconectar este computador do GERAR?", text: "Ele para de receber os pedidos e o chat do GERAR. Para conectar de novo, um administrador do GERAR gera um código novo. Para cortar o acesso de vez, desconecte este computador também no GERAR.", ok: "Desconectar", danger: true });
        if (!ok) return;
        if (await run("forget", undefined, "Desconectar")) c.say("Este computador saiu do GERAR.");
    };

    const badge = gerarBadge(page);
    const linked = page === "on" || page === "offline";

    const codeRow = (
        <FormRow k="Código do GERAR">
            <form className="cfg-gerar-form" onSubmit={connect}>
                <input ref={field} className="kx-input cfg-gerar-code" value={code} onChange={(e) => { setCode(e.target.value); setError(null); }}
                    placeholder="ABC-123" maxLength={8} spellCheck={false} autoComplete="off" aria-label="Código do GERAR" disabled={busy === "link"}
                    aria-invalid={error?.tone === "need" || undefined} />
                <Btn kind="brand" type="submit" disabled={busy === "link" || !code.trim()}>{busy === "link" ? "Conectando…" : "Conectar"}</Btn>
            </form>
            {error
                ? <span className={`cfg-sync-full ${error.tone === "need" ? "cfg-gerar-err" : "kx-warn"}`} role="alert">{error.text}</span>
                : <span className="kx-meta cfg-sync-full">No GERAR, um administrador gera um código para este computador e escolhe o nome dele. O código vale 10 minutos e serve uma vez.</span>}
        </FormRow>
    );

    return (
        <>
            <CfgGroup id="conexoes.gerar" k="GERAR" fold={false}>
                {page === "unconfigured" && (
                    <div className="cfg-sync-box" role="status">
                        <span className="cfg-sync-box-t">Este KERYX não foi preparado para o GERAR</span>
                        <span>Esta versão não sabe o endereço do GERAR da igreja. Ela chega com uma atualização do KERYX.</span>
                    </div>
                )}
                {page === "needs" && (
                    <div className="cfg-sync-box is-need" role="alert">
                        <span className="cfg-sync-box-t">O GERAR desconectou este computador</span>
                        <span>{needsWords(st)}</span>
                        {st.pending > 0 && <span>{st.pending === 1 ? "1 resposta do operador não subiu e fica guardada" : `${st.pending} respostas do operador não subiram e ficam guardadas`} até conectar de novo.</span>}
                        <div className="cfg-gerar-acts">
                            <Btn kind="air" onClick={() => field.current?.focus()}>Conectar de novo…</Btn>
                            <Btn kind="outline" disabled={Boolean(busy)} onClick={() => forget(true)}>Esquecer a conexão…</Btn>
                        </div>
                    </div>
                )}
                {page !== "unconfigured" && (
                    <div className="frm">
                        <FormRow k="GERAR">
                            <i className={`cfg-sync-dot ${DOT[badge.dot]}`} aria-hidden="true" />
                            <span className={page === "needs" ? "cfg-gerar-err" : page === "offline" ? "kx-warn" : page === "on" ? "kx-content" : "kx-meta"}>{badge.words}</span>
                            {st.device && <span className="kx-meta">· {gerarWho(st, now)}</span>}
                            {linked && <Btn kind="outline" className="cfg-sync-end" disabled={Boolean(busy)} onClick={() => forget(false)}>Desconectar…</Btn>}
                        </FormRow>
                        {(page === "off" || page === "connecting" || page === "needs") && codeRow}
                        {linked && (
                            <FormRow k="Receber os pedidos">
                                <Switch on={st.receive} label="Receber os pedidos do GERAR neste computador" disabled={Boolean(busy)} onChange={(on) => run("setReceive", { on }, "Receber os pedidos")} />
                                <span className="kx-meta">do GERAR neste computador · os outros computadores da igreja recebem pela Sincronização</span>
                            </FormRow>
                        )}
                        {linked && (() => {
                            const prog = gerarProgress(st, now);
                            return (
                                <FormRow k="Andamento">
                                    <i className={`cfg-sync-dot ${DOT[prog.tone]}`} aria-hidden="true" />
                                    <span className={prog.tone === "ok" ? "kx-content" : "kx-warn"}>{prog.line}</span>
                                    <Btn kind="outline" className="cfg-sync-end" disabled={Boolean(busy)} onClick={() => run("check", undefined, "Buscar agora")}>{busy === "check" ? "Buscando…" : "Buscar agora"}</Btn>
                                    {gerarLibraryLine(st, now) && <span className="kx-meta cfg-sync-full">{gerarLibraryLine(st, now)}</span>}
                                </FormRow>
                            );
                        })()}
                    </div>
                )}
            </CfgGroup>
            {page !== "unconfigured" && (
                <CfgGroup id="conexoes.gerar.como" k="Como funciona" defaultOpen={false} summary={`${gerarSummary(st)} · só conexões de saída`}>
                    <ul className="cfg-gerar-how">
                        <li>Os pedidos e o chat dos cultos do GERAR chegam ao Painel, nas abas Pedidos e Chat, com o selo GERAR, junto dos que vêm pelo celular.</li>
                        <li>O KERYX só busca no GERAR: nada no GERAR entra neste computador por conta própria, e o que já chegou continua aqui sem internet.</li>
                        <li>Cada computador da igreja entra com o próprio código. O GERAR não deixa dois computadores trazerem o mesmo pedido.</li>
                        <li>Desconectar aqui esquece a conexão neste computador. Para cortar o acesso de vez, um administrador desconecta este computador no GERAR.</li>
                    </ul>
                </CfgGroup>
            )}
        </>
    );
}
