import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn } from "../kx";
import Icon from "../Icon";
import { useDialogFocus } from "../useDialogFocus";
import { siglaProblem } from "@/lib/bibleEditions";
import { ownSiglaGuess, ownSizeLabel } from "@/lib/console/bibleRows";

// Instalar uma edição própria… (owner 2026-10-20, the "Bíblias" mockup,
// b4 = obrigatória): the church picks a Bible file it already has (the BKJ
// 1611 from another Bible program), KERYX reads it (electron/bibleFormats.cjs)
// and shows what it found — the format, the books and verses, the language
// and two verses to check — then installs it with the name and sigla the
// church gives, only once the church says it may use it. A file that is not
// a Bible says what to do instead; a New Testament alone installs with a
// warning. "Trocar o arquivo…" opens it with the edition's sigla fixed
// (`replace`). Esc closes it first (a capture listener: the window under it
// would close too); Windows order, Instalar then Cancelar (C-74).
export default function OwnBibleDialog({ open, replace = null, taken = [], bible, onClose, onInstalled, say }) {
    const [read, setRead] = useState(null); // the reading: { token, file, … } | { file, refused }
    const [busy, setBusy] = useState(""); // "read" | "install" | ""
    const [name, setName] = useState("");
    const [sigla, setSigla] = useState("");
    const [touched, setTouched] = useState(false);
    const [rights, setRights] = useState(false);
    const [error, setError] = useState("");
    const boxRef = useRef(null);
    useDialogFocus(boxRef, open);
    useEffect(() => {
        if (!open) return;
        setRead(null); setBusy(""); setRights(false); setTouched(false); setError("");
        setName(replace?.name || ""); setSigla(replace?.id || "");
        setTimeout(() => boxRef.current?.querySelector(".ob-file .kx-btn")?.focus(), 0);
    }, [open, replace]);
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key !== "Escape") return;
            e.preventDefault();
            e.stopImmediatePropagation();
            if (!busy) onClose();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [open, busy, onClose]);
    if (!open) return null;

    const pick = async () => {
        setBusy("read"); setError("");
        try {
            const res = await bible.readOwn();
            if (res?.error) { setError(res.error.message); return; }
            const r = res?.data;
            if (!r) return;
            setRead(r);
            if (r.refused || replace) return;
            setName((n) => n || r.title || r.file.replace(/(\.bbl)?\.[^.]+$/i, "").replace(/[_-]+/g, " "));
            setSigla((s) => s || ownSiglaGuess(r, taken));
        } catch (err) {
            setError(err?.message || "Não foi possível ler o arquivo.");
        } finally { setBusy(""); }
    };
    const problem = siglaProblem(sigla, replace ? taken.filter((t) => t !== replace.id) : taken);
    const ok = read && !read.refused;
    const canInstall = ok && name.trim() && !problem && rights && !busy;
    const install = async () => {
        if (!canInstall) return;
        setBusy("install"); setError("");
        try {
            const res = await bible.installOwn({ token: read.token, sigla, name: name.trim(), rights, replace: replace?.id || null });
            if (res?.error) { setError(res.error.message); return; }
            say?.(`${res.data.version} instalada: ${res.data.verses.toLocaleString("pt-BR")} versículos.`);
            onInstalled?.(res.data);
            onClose();
        } catch (err) {
            setError(err?.message || "Não foi possível instalar a edição.");
        } finally { setBusy(""); }
    };
    const step = !ok ? 1 : 2;
    const S = sigla.trim().toUpperCase() || "sigla";

    const dialog = (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => { if (!busy) onClose(); }} />
            <div ref={boxRef} className="dialog confirm-dialog report-dialog ob-dialog" role="dialog" aria-modal="true" aria-label={replace ? `Trocar o arquivo da ${replace.id}` : "Instalar uma edição própria"}>
                <div className="rp-head"><Icon name="book" /><span>{replace ? `Trocar o arquivo da ${replace.id}` : "Instalar uma edição própria"}</span></div>
                <div className="ob-steps" aria-hidden="true">
                    <span className={step > 1 ? "is-done" : "is-on"}>1 · Arquivo{step > 1 ? " ✓" : ""}</span>
                    <span className={step === 2 ? "is-on" : ""}>2 · Conferir</span>
                    <span>3 · Instalar</span>
                </div>
                <div className="ob-file">
                    <Icon name="folder" />
                    <span className="ob-file-t">
                        <b>{read ? read.file : "Nenhum arquivo escolhido"}</b>
                        <span className="kx-meta">{busy === "read" ? "Lendo o arquivo…" : !read ? "USFM, VPL, OSIS, Zefania, MySword (.bbl.mybible) ou JSON, solto ou em zip" : read.refused ? "não é um formato de Bíblia" : `${read.format} · ${ownSizeLabel(read.size)} · lido`}</span>
                    </span>
                    <Btn kind={read ? "" : "outline"} disabled={Boolean(busy)} onClick={pick}>{read ? "Outro arquivo…" : "Escolher o arquivo…"}</Btn>
                </div>
                {read?.refused && <p className="ob-warn" role="alert">{read.refused}</p>}
                {ok && (
                    <>
                        <div className="ob-stats">
                            <span>{read.books} {read.books === 1 ? "livro" : "livros"}</span>
                            <span>{read.verses.toLocaleString("pt-BR")} versículos</span>
                            <span>{read.language || "Idioma não informado"}</span>
                        </div>
                        {read.testament !== "all" && (
                            <p className="ob-warn" role="status">{read.testament === "nt"
                                ? "Parece só o Novo Testamento. Dá para instalar assim (a Bíblia avisa nos livros que faltam) ou escolher outro arquivo."
                                : "Parece só o Antigo Testamento. Dá para instalar assim (a Bíblia avisa nos livros que faltam) ou escolher outro arquivo."}</p>
                        )}
                        <div className="ob-samples">
                            {read.samples.map((v) => (
                                <p key={v.ref}><sup>{v.number}</sup>{v.text} <span className="kx-meta">{v.ref}</span></p>
                            ))}
                        </div>
                        <label className="rp-field">
                            <span>Nome</span>
                            <input className="kx-input" value={name} maxLength={80} onChange={(e) => { setName(e.target.value); setTouched(true); }} aria-invalid={touched && !name.trim() ? "true" : undefined} />
                        </label>
                        <label className="rp-field ob-sigla">
                            <span>Sigla</span>
                            <input className="kx-input" value={sigla} maxLength={8} readOnly={Boolean(replace)} onChange={(e) => { setSigla(e.target.value.toUpperCase()); setTouched(true); }}
                                aria-invalid={touched && problem ? "true" : undefined} aria-describedby="ob-sigla-hint" spellCheck={false} />
                            <span id="ob-sigla-hint" className={`kx-meta ${touched && problem ? "kx-warn" : ""}`}>{replace ? "A sigla não muda ao trocar o arquivo." : touched && problem ? problem : "2 a 8 letras ou números; não pode repetir outra da lista (NVI, ARA…)."}</span>
                        </label>
                        <label className="rp-check">
                            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} />
                            <span>A igreja tem o direito de usar esta edição (comprada, licenciada ou de domínio público).</span>
                        </label>
                        <p className="kx-meta ob-note">Fica só neste computador: o texto não vai pela sincronização. Os outros computadores vão dizer &ldquo;Falta a {S} aqui&rdquo; e pedir o mesmo arquivo.</p>
                    </>
                )}
                {error && <p className="ob-warn" role="alert">{error}</p>}
                <div className="acts">
                    <Btn kind="brand" disabled={!canInstall} onClick={install} title={ok && !rights ? "Marque que a igreja tem o direito de usar esta edição" : undefined}>{busy === "install" ? "Instalando…" : "Instalar"}</Btn>
                    <Btn disabled={Boolean(busy)} onClick={onClose}>Cancelar</Btn>
                </div>
            </div>
        </>
    );
    // Over the whole console, not inside the window's page (its scrim and
    // dialog styles are the console's).
    const host = document.querySelector(".console") || document.body;
    return createPortal(dialog, host);
}
