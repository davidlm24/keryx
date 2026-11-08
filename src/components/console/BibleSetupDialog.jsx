import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn, IconBtn } from "./kx";
import Icon from "./Icon";
import { useDialogFocus } from "./useDialogFocus";
import { useBibleEditions } from "./useBibleEditions";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { editionCredit } from "@/lib/bibleEditions";
import { setupRows, chosenWords, defaultAfterSetup } from "@/lib/console/bibleSetup";

// Bíblias neste computador (owner 2026-10-27, "as mais usadas, instaladas
// sozinhas"; the owner's pick C): the first time KERYX opens on a computer
// with no edition installed, this asks which editions to download — the
// most used ones (NVI, ARA, ARC, NTLH) already ticked — and "Baixar" starts
// them in the background (electron/bibleSetup.cjs; the toast and the bell
// say when they came). "Agora não" records the answer; Esc and the scrim
// only close it this time, so a reflex Esc never loses the question (it
// asks again at the next opening). From Configurações › Bíblia e músicas
// › Escolher as Bíblias… it opens again any time (`first` false: Cancelar).
// The church still chooses, with one click: the publishers' editions come
// from public repositories and the licence is the church's, as the rows'
// chips say. Esc closes it first (a capture listener, as OwnBibleDialog);
// Windows order, Baixar then Agora não (C-74).
export default function BibleSetupDialog({ open, first = false, setup, say, onClose }) {
    const editions = useBibleEditions();
    const prefs = usePrefs();
    const [ticked, setTicked] = useState(() => new Set());
    const [busy, setBusy] = useState(false);
    const boxRef = useRef(null);
    useDialogFocus(boxRef, open);
    const rows = useMemo(() => setupRows(editions, setup?.state), [editions, setup?.state]);
    // The ticks start as the rows say each time it opens.
    useEffect(() => {
        if (!open) return;
        setTicked(new Set(rows.filter((r) => r.ticked).map((r) => r.id)));
        setBusy(false);
        setTimeout(() => boxRef.current?.querySelector(".bs-row input:not(:disabled)")?.focus(), 0);
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
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

    const toggle = (id) => setTicked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    // What Baixar downloads: ticked and not here yet.
    const toGet = rows.filter((r) => ticked.has(r.id) && !r.installed).map((r) => r.id);
    const n = toGet.length;
    const download = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const chosen = rows.filter((r) => ticked.has(r.id)).map((r) => r.id);
            const st = await setup.choose(chosen);
            // The version in use follows the answer when the church left it out.
            const def = defaultAfterSetup(prefs.bible_version, chosen, st?.installed || {});
            if (def) updateUser({ bible_version: def }).catch(() => {});
            say?.(chosenWords(n, typeof navigator === "undefined" || navigator.onLine !== false));
            onClose();
        } catch (err) {
            say?.(err?.message || "Não foi possível guardar a escolha.");
        } finally { setBusy(false); }
    };
    const later = async () => {
        if (busy) return;
        setBusy(true);
        try { await setup.dismiss(); } catch { /* asks again next time */ } finally { setBusy(false); }
        onClose();
    };

    const dialog = (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={() => { if (!busy) onClose(); }} />
            <div ref={boxRef} className="dialog confirm-dialog import-dialog bs-dialog" role="dialog" aria-modal="true" aria-label="Bíblias neste computador" aria-busy={busy || undefined}>
                <div className="im-head">
                    <Icon name="book" />
                    <span className="im-title">Bíblias neste computador</span>
                    <IconBtn name="x" small title="Fechar · Esc" onClick={onClose} disabled={busy} />
                </div>
                <p className="bs-lead">Cada edição marcada baixa uma vez (2 a 5 MB) e funciona sem internet. As mais usadas já estão marcadas; mude como quiser — depois, em Configurações › Bíblia e músicas.</p>
                <div className="im-list bs-list" role="list" aria-label="Edições">
                    {rows.map((r) => (
                        <label key={r.id} role="listitem" className={`bs-row ${r.installed ? "is-here" : ""}`} title={editionCredit(editions.find((v) => v.id === r.id)) || undefined}>
                            <input type="checkbox" checked={ticked.has(r.id)} disabled={busy || Boolean(r.installed)} onChange={() => toggle(r.id)} />
                            <span className="bs-main">
                                <span className="bs-name">{r.title}{r.nt && <span className="bib-nt">só o Novo Testamento</span>}</span>
                                {r.installed > 0 && <span className="bs-meta">instalada · {r.installed.toLocaleString("pt-BR")} versículos</span>}
                                {!r.installed && r.pending && <span className="bs-meta">esperando para baixar</span>}
                            </span>
                            {r.chip && <span className={`bib-lic is-${r.chip.tone}`}>{r.chip.text}</span>}
                        </label>
                    ))}
                </div>
                <p className="bs-note kx-meta">Com direitos da editora: baixadas de repositórios públicos; a licença de uso é da igreja. Abertas: podem ser copiadas, com o crédito (eBible.org).</p>
                <div className="im-foot">
                    <span className="im-counts" aria-live="polite">{n ? `${n} para baixar` : "Nada para baixar"}</span>
                    <Btn kind="brand" disabled={busy || !n} onClick={download}>{busy ? "Guardando…" : n ? `Baixar ${n} ${n === 1 ? "Bíblia" : "Bíblias"}` : "Baixar"}</Btn>
                    <Btn disabled={busy} onClick={first ? later : onClose}>{first ? "Agora não" : "Cancelar"}</Btn>
                </div>
            </div>
        </>
    );
    // Over the whole console, not inside the window's page (its scrim and
    // dialog styles are the console's).
    const host = document.querySelector(".console") || document.body;
    return createPortal(dialog, host);
}
