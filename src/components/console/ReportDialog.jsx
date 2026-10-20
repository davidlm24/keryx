import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { Btn } from "./kx";
import Icon from "./Icon";
import { useDialogFocus } from "./useDialogFocus";
import { useChurch } from "@/hooks/useChurch";
import { SUPPORT_EMAIL, reportMail } from "@shared/support.mjs";

// Relatar um problema (Rodada N3, owner 2026-10-20; Ajuda and Configurações ›
// Dados › Suporte): what happened, what they were doing, and the diagnostic.
// On the desktop main saves the zip in Downloads (relato.txt inside), opens
// the folder and the e-mail program addressed to support (system op
// `report`, electron/system.cjs) — the page never opens a mailto itself.
// When no e-mail program opens, and in the browser preview, the dialog shows
// the address and the text with Copiar. Esc closes it first (the console's
// key order: "confirm"); Windows order, the action then Cancelar (C-74).
export const ReportContext = createContext(null);
const nobody = () => {};
export const useReport = () => useContext(ReportContext) || nobody;

// Salvar diagnóstico… says this wherever it is (Ajuda, Configurações › Dados).
export const DIAGNOSTIC_SAVED = "Diagnóstico salvo: envie o arquivo a quem dá suporte.";

const DIAG_HINT = "versão, telas, saídas e os registros dos últimos dias; sem músicas, mídias nem senhas";

export default function ReportDialog({ open, onClose, say }) {
    const church = useChurch();
    const [text, setText] = useState("");
    const [doing, setDoing] = useState("");
    const [include, setInclude] = useState(true);
    const [busy, setBusy] = useState(false);
    // { subject, body, preview } once the e-mail could not open: the fallback.
    const [fallback, setFallback] = useState(null);
    const textRef = useRef(null);
    const boxRef = useRef(null);
    // The desktop bridge, read where it is used (the preview has none for this).
    const system = window.keryxDesktop?.isPreview ? null : window.keryxDesktop?.system || null;
    useDialogFocus(boxRef, open);
    useEffect(() => {
        if (!open) return;
        setText(""); setDoing(""); setInclude(true); setBusy(false); setFallback(null);
        setTimeout(() => textRef.current?.focus(), 0);
    }, [open]);
    if (!open) return null;

    const send = async () => {
        const what = text.trim();
        if (!what || busy) return;
        if (!system) {
            // The preview: no e-mail, no diagnostic; the address and the text.
            const m = reportMail({ text: what, doing, church: church.name, version: "prévia" });
            setFallback({ ...m, preview: true });
            return;
        }
        setBusy(true);
        try {
            const res = await system.call("report", { text: what, doing, include, church: church.name });
            if (res?.error) { say?.(`Relatar um problema: ${res.error.message}`); return; }
            const r = res?.data || {};
            if (r.file) say?.("Diagnóstico salvo em Downloads. Anexe-o ao e-mail.");
            if (r.opened) onClose();
            else setFallback({ subject: r.subject, body: r.body });
        } catch (err) {
            say?.(`Relatar um problema: ${err?.message || "não foi possível."}`);
        } finally {
            setBusy(false);
        }
    };
    // Inside the click, so the clipboard accepts it.
    const copy = (value, done) => {
        const fail = () => say?.("Selecione o texto e copie com Ctrl+C.");
        try { navigator.clipboard.writeText(value).then(() => say?.(done), fail); } catch { fail(); }
    };

    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={onClose} />
            <div ref={boxRef} className="dialog confirm-dialog report-dialog" role="dialog" aria-modal="true" aria-label="Relatar um problema">
                <div className="rp-head"><Icon name="help" /><span>Relatar um problema</span></div>
                {!fallback ? (
                    <>
                        <label className="rp-field">
                            <span>O que aconteceu?</span>
                            <textarea ref={textRef} className="ed-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={4000}
                                placeholder="A música foi ao ar sem o fundo do tema…"
                                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
                        </label>
                        <label className="rp-field">
                            <span>O que você estava fazendo? <em>(opcional)</em></span>
                            <textarea className="ed-text" rows={2} value={doing} onChange={(e) => setDoing(e.target.value)} maxLength={4000}
                                placeholder="Mandei a música da Setlist e depois apertei Esc."
                                onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(); } }} />
                        </label>
                        {system && (
                            <label className="rp-check">
                                <input type="checkbox" checked={include} onChange={(e) => setInclude(e.target.checked)} />
                                <span>Incluir o diagnóstico <span className="kx-meta">({DIAG_HINT})</span></span>
                            </label>
                        )}
                        <div className="acts">
                            <Btn kind="brand" disabled={!text.trim() || busy} onClick={send}>{busy ? "Preparando…" : "Enviar por e-mail"}</Btn>
                            <Btn onClick={onClose}>Cancelar</Btn>
                        </div>
                    </>
                ) : (
                    <>
                        <p className="rp-say">{fallback.preview
                            ? "Na prévia o e-mail não abre. Mande o texto abaixo para o suporte, pelo Gmail ou pelo WhatsApp."
                            : "Nenhum programa de e-mail abriu. Mande o texto abaixo para o suporte, pelo Gmail ou pelo WhatsApp."}</p>
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
                )}
            </div>
        </>
    );
}
