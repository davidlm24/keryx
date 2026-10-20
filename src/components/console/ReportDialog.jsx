import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Btn } from "./kx";
import Icon from "./Icon";
import { useDialogFocus } from "./useDialogFocus";
import { useChurch } from "@/hooks/useChurch";
import { SUPPORT_EMAIL } from "@shared/support.mjs";

// Relatar um problema (Ajuda and Configurações › Dados › Suporte; owner
// 2026-10-20, the "Relatos sem e-mail" mockup): what happened, what they were
// doing, how to reach them, and the diagnostic. Enviar relato hands it to
// main (system op `report`, electron/system.cjs), which sends it over the
// internet to support or keeps it in its queue (electron/reportQueue.cjs);
// the dialog then says which: Relato enviado with its code, Guardado para
// enviar depois (offline) or Não deu para enviar daqui (refused). The e-mail
// is the reserve (`reportMail`: the diagnostic in Downloads, the e-mail
// program, the report out of the queue); when no e-mail program opens the
// dialog shows the address and the text with Copiar. Esc closes it first (the
// console's key order: "confirm"); Windows order, the action then Cancelar
// (C-74).
export const ReportContext = createContext(null);
const nobody = () => {};
export const useReport = () => useContext(ReportContext) || nobody;

// Salvar diagnóstico… says this wherever it is (Ajuda, Configurações › Dados).
export const DIAGNOSTIC_SAVED = "Diagnóstico salvo: envie o arquivo a quem dá suporte.";

const DIAG_HINT = "versão, telas, saídas e os registros dos últimos dias; sem músicas, mídias nem senhas";

// Why the function refused (shared/support.mjs reportOutcome's reasons).
const REFUSED = {
    rate: "Muitos relatos deste computador hoje.",
    too_big: "O diagnóstico ficou grande demais.",
    invalid: "O suporte não aceitou o relato.",
};

// The e-mail reserve for a queued or refused report, from the dialog or
// Configurações. Resolves to { subject, body } when no e-mail program opened
// (show them to copy), else null.
export async function mailReport(system, id, say) {
    const res = await system.call("reportMail", { id });
    if (res?.error) { say?.(`Relatar um problema: ${res.error.message}`); return null; }
    const r = res?.data || {};
    if (r.file) say?.("Diagnóstico salvo em Downloads. Anexe-o ao e-mail.");
    return r.opened ? null : { subject: r.subject, body: r.body };
}

const onCtrlEnter = (send) => (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } };

export default function ReportDialog({ open, onClose, say, mail = null }) {
    const church = useChurch();
    const [text, setText] = useState("");
    const [doing, setDoing] = useState("");
    const [contact, setContact] = useState("");
    const [include, setInclude] = useState(true);
    const [busy, setBusy] = useState(false);
    // After Enviar: { status: sent | queued | refused, id, code, reason }.
    const [result, setResult] = useState(null);
    // { subject, body } once the e-mail could not open: the address and the text.
    const [fallback, setFallback] = useState(null);
    const textRef = useRef(null);
    const boxRef = useRef(null);
    const system = window.keryxDesktop?.system || null;
    useDialogFocus(boxRef, open);
    useEffect(() => {
        if (!open) return;
        setText(""); setDoing(""); setContact(""); setInclude(true); setBusy(false); setResult(null);
        // Opened from Configurações' queue with the e-mail already tried.
        setFallback(mail);
        if (!mail) setTimeout(() => textRef.current?.focus(), 0);
    }, [open, mail]);
    // Enviar leaves with the form: the focus goes to the answer's first button.
    useEffect(() => {
        if (result || fallback) boxRef.current?.querySelector(".acts .kx-btn")?.focus();
    }, [result, fallback]);
    if (!open) return null;

    const send = async () => {
        const what = text.trim();
        if (!what || busy || !system) return;
        setBusy(true);
        try {
            const res = await system.call("report", { text: what, doing, contact, include, church: church.name });
            if (res?.error) { say?.(`Relatar um problema: ${res.error.message}`); return; }
            setResult(res?.data || null);
        } catch (err) {
            say?.(`Relatar um problema: ${err?.message || "não foi possível."}`);
        } finally {
            setBusy(false);
        }
    };
    const byMail = async () => {
        if (!result?.id || busy) return;
        setBusy(true);
        try {
            const shown = await mailReport(system, result.id, say);
            if (shown) setFallback(shown);
            else onClose();
        } finally {
            setBusy(false);
        }
    };
    // Inside the click, so the clipboard accepts it.
    const copy = (value, done) => {
        const fail = () => say?.("Selecione o texto e copie com Ctrl+C.");
        try { navigator.clipboard.writeText(value).then(() => say?.(done), fail); } catch { fail(); }
    };

    let body;
    if (fallback) {
        body = (
            <>
                <p className="rp-say">Nenhum programa de e-mail abriu. Mande o texto abaixo para o suporte, pelo Gmail ou pelo WhatsApp.</p>
                <div className="rp-line">
                    <span className="kx-meta">Para</span>
                    <b className="rp-addr">{SUPPORT_EMAIL}</b>
                    <Btn small onClick={() => copy(SUPPORT_EMAIL, "Endereço copiado.")}><Icon name="copy" />Copiar</Btn>
                </div>
                <div className="rp-line">
                    <span className="kx-meta">Assunto</span>
                    <b>{fallback.subject}</b>
                </div>
                <textarea className="ed-text rp-body" readOnly rows={7} value={fallback.body} aria-label="O texto do e-mail" onFocus={(e) => e.target.select()} />
                <div className="acts">
                    <Btn kind="brand" onClick={() => copy(`${fallback.subject}\n\n${fallback.body}`, "Texto copiado.")}><Icon name="copy" />Copiar o texto</Btn>
                    <Btn onClick={onClose}>Fechar</Btn>
                </div>
            </>
        );
    } else if (result?.status === "sent") {
        body = (
            <>
                <div className="rp-res is-ok" role="status">
                    <Icon name="check" />
                    <div><b>Relato enviado</b><span>O suporte recebeu o relato <span className="rp-code">{result.code}</span>{include ? " com o diagnóstico" : ""}.{contact.trim() ? " Se precisar, entramos em contato pelo que você deixou." : ""}</span></div>
                </div>
                <div className="acts"><Btn kind="brand" onClick={onClose}>Fechar</Btn></div>
            </>
        );
    } else if (result?.status === "queued") {
        body = (
            <>
                <div className="rp-res is-warn" role="status">
                    <Icon name="warn" />
                    <div><b>Guardado para enviar depois</b><span>Este computador está sem internet. O relato ficou salvo aqui e vai sozinho quando a conexão voltar, mesmo que o KERYX seja fechado e aberto de novo.</span></div>
                </div>
                <div className="acts">
                    <Btn kind="brand" onClick={onClose}>Fechar</Btn>
                    <Btn disabled={busy} onClick={byMail}>Mandar por e-mail…</Btn>
                </div>
            </>
        );
    } else if (result?.status === "refused") {
        body = (
            <>
                <div className="rp-res is-warn" role="status">
                    <Icon name="warn" />
                    <div><b>Não deu para enviar daqui</b><span>{REFUSED[result.reason] || REFUSED.invalid} Mande por e-mail.</span></div>
                </div>
                <div className="acts">
                    <Btn kind="brand" disabled={busy} onClick={byMail}>Mandar por e-mail…</Btn>
                    <Btn onClick={onClose}>Fechar</Btn>
                </div>
            </>
        );
    } else {
        body = (
            <>
                <label className="rp-field">
                    <span>O que aconteceu?</span>
                    <textarea ref={textRef} className="ed-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} disabled={busy}
                        placeholder="A música foi ao ar sem o fundo do tema…" onKeyDown={onCtrlEnter(send)} />
                </label>
                <label className="rp-field">
                    <span>O que você estava fazendo? <em>(opcional)</em></span>
                    <textarea className="ed-text" rows={2} value={doing} onChange={(e) => setDoing(e.target.value)} maxLength={4000} disabled={busy}
                        placeholder="Mandei a música da Setlist e depois apertei Esc." onKeyDown={onCtrlEnter(send)} />
                </label>
                <label className="rp-field">
                    <span>Como falamos com você? <em>(opcional: nome, WhatsApp ou e-mail)</em></span>
                    <input className="ed-text" value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200} disabled={busy}
                        placeholder="Pr. Marcos · (11) 98765-4321" onKeyDown={onCtrlEnter(send)} />
                </label>
                <label className="rp-check">
                    <input type="checkbox" checked={include} disabled={busy} onChange={(e) => setInclude(e.target.checked)} />
                    <span>Incluir o diagnóstico <span className="kx-meta">({DIAG_HINT})</span></span>
                </label>
                <span className="kx-meta">Vai pela internet direto para o suporte do KERYX.</span>
                <div className="acts">
                    <Btn kind="brand" disabled={!text.trim() || busy || !system} onClick={send}>{busy ? "Enviando…" : "Enviar relato"}</Btn>
                    <Btn onClick={onClose}>Cancelar</Btn>
                </div>
            </>
        );
    }

    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={onClose} />
            <div ref={boxRef} className="dialog confirm-dialog report-dialog" role="dialog" aria-modal="true" aria-label="Relatar um problema" aria-busy={busy || undefined}>
                <div className="rp-head"><Icon name="help" /><span>Relatar um problema</span></div>
                {body}
            </div>
        </>
    );
}
