import React, { useEffect, useRef, useState } from "react";
import { Btn, Field } from "./kx";
import { useDialogFocus } from "./useDialogFocus";
import { YouTubeLinkDialog, YouTubeTermsDialog } from "./YouTubeDialog";

// One question with a text field, asked by the panels' + menus (a section's
// name, a free text, an aviso rápido; Console.jsx askText). Enter answers
// (Ctrl+Enter in a multiline one), Cancelar, the scrim or Esc (the console's
// key order: it closes before anything else) answer null. Windows order:
// the action, then Cancelar (audit C-74, as ConfirmDialog).
// The YouTube questions ride the same slot (ask.kind): their Esc, scrim and
// focus are this dialog's in the console and in /Janela (YouTubeDialog.jsx).
export default function PromptDialog({ ask, onAnswer }) {
    if (ask?.kind === "youtube") return <YouTubeLinkDialog ask={ask} onAnswer={onAnswer} />;
    if (ask?.kind === "youtube-terms") return <YouTubeTermsDialog onAnswer={onAnswer} />;
    return <TextPrompt ask={ask} onAnswer={onAnswer} />;
}

function TextPrompt({ ask, onAnswer }) {
    const [value, setValue] = useState("");
    const ref = useRef(null);
    // Tab stays here; the focus goes back to the opener after a keyboard open (C-12).
    const boxRef = useRef(null);
    useDialogFocus(boxRef, Boolean(ask));
    useEffect(() => {
        setValue(ask?.initial || "");
        if (ask) setTimeout(() => ref.current?.focus(), 0);
    }, [ask]);
    if (!ask) return null;
    const submit = () => { const t = value.trim(); if (t) onAnswer(t); };
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => onAnswer(null)} />
            <div ref={boxRef} className="dialog confirm-dialog" role="dialog" aria-modal="true" aria-label={ask.title}>
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>{ask.title}</div>
                {ask.multiline
                    ? <textarea ref={ref} className="ed-text" rows={4} value={value} onChange={(e) => setValue(e.target.value)} placeholder={ask.placeholder} aria-label={ask.placeholder}
                        onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }} />
                    : <Field icon={null} inputRef={ref} value={value} onChange={setValue} placeholder={ask.placeholder} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); submit(); } }} />}
                {ask.hint && <span className="kx-meta">{ask.hint}</span>}
                <div style={{ display: "flex", gap: "var(--space-2)", justifyContent: "flex-end" }}>
                    <Btn kind="brand" disabled={!value.trim()} onClick={submit}>{ask.ok || "OK"}</Btn>
                    <Btn onClick={() => onAnswer(null)}>Cancelar</Btn>
                </div>
            </div>
        </>
    );
}
