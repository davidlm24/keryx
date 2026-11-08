import React, { useEffect, useRef, useState } from "react";
import { Btn, Field } from "./kx";
import { useDialogFocus } from "./useDialogFocus";
import { getYouTubeId } from "@/utils/youtube";
import { checkWords, linkActions, TERMS_TEXT, TERMS_CHECK } from "@/lib/youtubeLinks";

// The Link do YouTube… question (owner 2026-10-27, mockup boards 1 and 2):
// the link is checked as it is pasted (electron/youtube.cjs check: may it
// play outside YouTube?) and the dialog offers what fits — Adicionar o link
// where it plays, Baixar para a Mídia… always where there is a video.
// Answers { action: "add" | "download", url, check } or null. Asked through
// PromptDialog (ask.kind "youtube"), so Esc, the scrim and the focus rules
// are the console's and /Janela's as for every question.
export function YouTubeLinkDialog({ ask, onAnswer }) {
    const [url, setUrl] = useState(ask.initial || "");
    const [check, setCheck] = useState(null);
    const [checking, setChecking] = useState(false);
    const ref = useRef(null);
    const boxRef = useRef(null);
    const bridge = useRef(window.keryxDesktop?.youtube || null);
    useDialogFocus(boxRef, true);
    useEffect(() => { setTimeout(() => ref.current?.focus(), 0); }, []);

    const id = getYouTubeId(url.trim());
    useEffect(() => {
        setCheck(null);
        if (!id) return undefined;
        // No main process (a plain browser): nothing to ask, the link goes in unchecked.
        if (!bridge.current) { setCheck({ id, state: "offline" }); return undefined; }
        let alive = true;
        setChecking(true);
        const t = setTimeout(() => {
            bridge.current.call("check", { url: url.trim() }).then((r) => {
                if (!alive) return;
                setChecking(false);
                setCheck(r?.data || { id, state: "error" });
            });
        }, 300);
        return () => { alive = false; clearTimeout(t); setChecking(false); };
    }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

    const words = checkWords(check);
    const actions = linkActions(check);
    const answer = (action) => onAnswer({ action, url: url.trim(), check });
    const primary = actions[0] || null;
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => onAnswer(null)} />
            <div ref={boxRef} className="dialog confirm-dialog yt-dialog" role="dialog" aria-modal="true" aria-label="Link do YouTube">
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>Link do YouTube</div>
                <label className="yt-field">
                    <span>Cole o link do vídeo</span>
                    <Field icon={null} inputRef={ref} value={url} onChange={setUrl} placeholder="https://youtube.com/watch?v=…"
                        onKeyDown={(e) => { if (e.key === "Enter" && primary) { e.preventDefault(); answer(primary); } }} />
                </label>
                {url.trim() && !id && <span className="kx-meta kx-warn">Isso não parece um link do YouTube.</span>}
                {id && (
                    <div className={`yt-card ${words?.tone === "warn" ? "is-warn" : ""}`} aria-live="polite">
                        <img className="yt-thumb" src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt="" onError={(e) => { e.currentTarget.style.visibility = "hidden"; }} />
                        <div className="yt-card-t">
                            <b>{check?.title || "Vídeo do YouTube"}</b>
                            {check?.author && <span className="kx-meta">{check.author}</span>}
                            <span className={`yt-state ${words?.tone === "warn" ? "is-warn" : words ? "is-ok" : ""}`}>
                                <span className="yt-dot" aria-hidden="true" />
                                {checking || !words ? "Conferindo no YouTube…" : words.text}
                            </span>
                        </div>
                    </div>
                )}
                {check?.state === "ok" && <span className="kx-meta yt-hint">Pela internet ele corta (não esmaece) e precisa de conexão no culto. Baixado, vira um vídeo do computador: toca sem internet, esmaece e mostra os quadros ao passar o mouse.</span>}
                {check?.state === "blocked" && <span className="kx-meta yt-hint">Baixe para a Mídia para usar no culto: vira um vídeo do computador e toca sem internet.</span>}
                <div className="yt-actions">
                    {actions.includes("add") && <Btn kind="brand" onClick={() => answer("add")}>Adicionar o link</Btn>}
                    {actions.includes("download") && <Btn kind={primary === "download" ? "brand" : undefined} onClick={() => answer("download")}>Baixar para a Mídia…</Btn>}
                    <Btn onClick={() => onAnswer(null)}>Cancelar</Btn>
                </div>
            </div>
        </>
    );
}

// The one question before the first download (Y5 = A): YouTube's Terms of
// Service, and the church ticking that it only downloads what it may use.
// Answers true or null.
export function YouTubeTermsDialog({ onAnswer }) {
    const [agreed, setAgreed] = useState(false);
    const boxRef = useRef(null);
    useDialogFocus(boxRef, true);
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => onAnswer(null)} />
            <div ref={boxRef} className="dialog confirm-dialog yt-dialog" role="dialog" aria-modal="true" aria-label="Baixar vídeos do YouTube">
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>Baixar vídeos do YouTube</div>
                <div className="yt-terms">
                    <p>{TERMS_TEXT}</p>
                    <label className="yt-check">
                        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
                        <span>{TERMS_CHECK}</span>
                    </label>
                </div>
                <span className="kx-meta">O KERYX pergunta só desta vez. O vídeo vira um arquivo da Mídia, como os do computador.</span>
                <div className="yt-actions">
                    <Btn kind="brand" disabled={!agreed} onClick={() => onAnswer(true)}>Baixar</Btn>
                    <Btn onClick={() => onAnswer(null)}>Cancelar</Btn>
                </div>
            </div>
        </>
    );
}
