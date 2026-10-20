import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn, Field } from "../console/kx";
import { useDialogFocus } from "../console/useDialogFocus";
import { keryx } from "@/api/keryxClient";
import { cssFamily, familyFromFileName } from "@/lib/fonts";
import { fold } from "@/lib/bibleSearch";

// "Fontes do computador" (Rodada HF1, the owner's mockup H3): every family
// installed on this PC, as Holyrics lists them (owner 2026-10-20). KERYX
// reads the font folders itself (electron/systemFonts.cjs, through
// integrations.Core.SystemFonts), so there is no permission and no click
// to wait for. Each row is drawn in its own family, with a search field,
// the preview line "Grande é o Senhor" in the chosen one, Usar esta fonte
// · Cancelar in Windows order (C-74) and the licence line. Usar hands the
// chosen family's faces (Regular, Bold, Italic, Bold Italic first, at most
// four) to the picker, which copies them into the church's library. A
// face whose licence forbids embedding is listed but not copied.
//
// mode "file": the same frame for a font FILE the operator picked
// ("Arquivo de fonte…"): the family's name from the file's name, editable,
// the preview drawn with the file itself (a FontFace loaded from the blob,
// taken off on close).
export const PREVIEW_TEXT = "Grande é o Senhor";
export const LICENCE = "A fonte é copiada para a pasta de mídia da igreja, vai para os outros computadores e para as telas na rede. O KERYX nunca baixa fontes da internet. Fontes que vêm com o Windows ou foram compradas têm licença própria; as livres (OFL, como as do Google Fonts instaladas) são seguras.";
const NO_LIST = "Use \"Arquivo de fonte…\" e escolha o arquivo .ttf ou .otf da fonte (em C:\\Windows\\Fonts).";
const RESTRICTED = "a licença desta fonte não permite copiá-la";
// The faces a family brings: the ones its licence lets travel, the four a
// theme draws first (the list comes sorted so), at most four.
export const facesToCopy = (family) => (family?.faces || []).filter((f) => !f.restricted).slice(0, 4);

const PREVIEW_FAMILY = "keryx-font-file-preview";

export default function LocalFontsDialog({ mode = "pc", file = null, onAnswer }) {
    const [list, setList] = useState(null); // null = reading
    const [error, setError] = useState("");
    const [q, setQ] = useState("");
    const [picked, setPicked] = useState("");
    const [name, setName] = useState(() => (file ? familyFromFileName(file.name) : ""));
    const [busy, setBusy] = useState(false);
    const boxRef = useRef(null);
    const searchRef = useRef(null);
    useDialogFocus(boxRef);

    // The PC's list, read as the dialog opens (the click that opened it is
    // the user gesture the API wants).
    useEffect(() => {
        if (mode !== "pc") return undefined;
        let alive = true;
        keryx.integrations.Core.SystemFonts()
            .then((families) => {
                if (!alive) return;
                setList(Array.isArray(families) ? families : []);
                setTimeout(() => searchRef.current?.focus(), 0);
            })
            .catch((err) => { if (!alive) return; setError(`${err?.message || "Não foi possível ler as fontes do computador."} ${NO_LIST}`); setList([]); });
        return () => { alive = false; };
    }, [mode]);

    // The file's own face for the preview and the name field.
    useEffect(() => {
        if (mode !== "file" || !file || typeof FontFace !== "function") return undefined;
        let face = null;
        file.arrayBuffer().then((buf) => {
            face = new FontFace(PREVIEW_FAMILY, buf);
            return face.load().then(() => { document.fonts.add(face); });
        }).catch(() => {});
        return () => { if (face) try { document.fonts.delete(face); } catch { /* already gone */ } };
    }, [mode, file]);

    const shown = useMemo(() => {
        if (!list) return [];
        const terms = fold(q).split(/\s+/).filter(Boolean);
        return terms.length ? list.filter((g) => { const f = fold(g.family); return terms.every((t) => f.includes(t)); }) : list;
    }, [list, q]);
    const chosen = mode === "pc" ? list?.find((g) => g.family === picked) || null : null;
    const previewFamily = mode === "file" ? PREVIEW_FAMILY : picked;
    const canUse = mode === "file" ? Boolean(name.trim()) && !busy : facesToCopy(chosen).length > 0 && !busy;

    const use = async () => {
        if (!canUse) return;
        setBusy(true);
        try {
            if (mode === "file") await onAnswer({ family: name.trim(), file });
            else await onAnswer({ family: chosen.family, faces: facesToCopy(chosen) });
        } finally { setBusy(false); }
    };
    const cancel = () => onAnswer(null);

    // Esc closes this dialog first: the editor and the console route Esc to
    // the window otherwise (their listeners run after this one, which stops
    // the event; the editor's own already defers to a confirm-scrim).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== "Escape") return;
            e.preventDefault(); e.stopPropagation();
            cancel();
        };
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    });

    const root = typeof document !== "undefined" ? document.querySelector(".console") || document.body : null;
    if (!root) return null;
    const title = mode === "file" ? "Arquivo de fonte" : "Fontes do computador";
    return createPortal(
        <>
            <div className="scrim is-dim confirm-scrim" onClick={cancel} />
            <div ref={boxRef} className="dialog confirm-dialog font-dialog" role="dialog" aria-modal="true" aria-label={title}>
                <div className="kx-section" style={{ color: "var(--fg-1)" }}>{title}</div>
                {mode === "pc" ? (
                    <>
                        <Field inputRef={searchRef} value={q} onChange={setQ} placeholder="Buscar uma fonte…" />
                        <div className="fd-list" role="listbox" aria-label="Fontes instaladas neste computador">
                            {list === null && <div className="kx-meta fd-empty">Lendo as fontes do computador…</div>}
                            {list !== null && error && <div className="kx-meta fd-empty kx-warn">{error}</div>}
                            {list !== null && !error && !shown.length && <div className="kx-meta fd-empty">{q ? `Nenhuma fonte com "${q}"` : "Nenhuma fonte encontrada nas pastas de fontes do Windows."}</div>}
                            {shown.map((g) => {
                                const locked = !facesToCopy(g).length;
                                return (
                                    <div key={g.family} role="option" aria-selected={g.family === picked} aria-disabled={locked || undefined} tabIndex={0} className={`fd-row kx-t ${g.family === picked ? "is-on" : ""} ${locked ? "is-locked" : ""}`}
                                        title={locked ? `${g.family}: ${RESTRICTED}` : g.family}
                                        onClick={() => setPicked(g.family)} onDoubleClick={() => { if (locked) return; setPicked(g.family); setTimeout(use, 0); }}
                                        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(g.family); } }}>
                                        <span className="fd-name" style={{ fontFamily: cssFamily(g.family) }}>{g.family}</span>
                                        <span className="fd-faces kx-meta">{locked ? RESTRICTED : g.faces.map((f) => f.name).join(", ")}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </>
                ) : (
                    <div className="frm nv-frm" style={{ padding: 0 }}>
                        <span className="k">Nome</span>
                        <input className="pl-input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} aria-label="Nome da fonte" placeholder="Nome da fonte" autoFocus onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); use(); } }} />
                        <span className="k">Arquivo</span>
                        <span className="kx-meta" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{file?.name}</span>
                    </div>
                )}
                {mode === "pc" && list?.length > 0 && <span className="kx-meta fd-count">{shown.length === list.length ? `${list.length} fontes neste computador` : `${shown.length} de ${list.length} fontes`}</span>}
                <div className="fd-preview" style={{ fontFamily: previewFamily ? cssFamily(previewFamily) : undefined }} aria-label="Exemplo">{PREVIEW_TEXT}</div>
                <div className="acts">
                    <Btn kind="brand" disabled={!canUse} onClick={use}>{busy ? "Copiando…" : "Usar esta fonte"}</Btn>
                    <Btn onClick={cancel}>Cancelar</Btn>
                </div>
                <p className="kx-meta fd-licence">{LICENCE}</p>
            </div>
        </>,
        root,
    );
}
