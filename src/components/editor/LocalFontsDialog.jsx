import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Btn, Field } from "../console/kx";
import { useDialogFocus } from "../console/useDialogFocus";
import { cssFamily, wantedFace, WANTED_FACES, familyFromFileName } from "@/lib/fonts";
import { fold } from "@/lib/bibleSearch";

// "Fontes do computador" (Rodada HF1, the owner's mockup H3): the families
// installed on this PC (Local Font Access, window.queryLocalFonts — only
// the console and a detached page may call it, electron/main.cjs; it needs
// a click, so the list is read when the dialog opens from the picker's
// menu), each row drawn in its own family, a search field, the preview
// line "Grande é o Senhor" in the chosen one, Usar esta fonte · Cancelar
// in Windows order (C-74) and the licence line. Usar hands the chosen
// family's faces (Regular, Bold, Italic, Bold Italic, at most four) to the
// picker, which copies them into the church's library.
//
// mode "file": the same frame for a font FILE the operator picked
// ("Arquivo de fonte…"): the family's name from the file's name, editable,
// the preview drawn with the file itself (a FontFace loaded from the blob,
// taken off on close).
export const PREVIEW_TEXT = "Grande é o Senhor";
export const LICENCE = "A fonte é copiada para a pasta de mídia da igreja, vai para os outros computadores e para as telas na rede. O KERYX nunca baixa fontes da internet. Fontes que vêm com o Windows ou foram compradas têm licença própria; as livres (OFL, como as do Google Fonts instaladas) são seguras.";
const NO_API = "Este computador não oferece a lista de fontes instaladas. Use \"Arquivo de fonte…\" e escolha o arquivo .ttf ou .otf da fonte (em C:\\Windows\\Fonts).";
const DENIED = "O KERYX não recebeu permissão para ler as fontes do computador. Use \"Arquivo de fonte…\".";

// The PC's families with the faces a theme draws, from the API's list.
export function groupLocalFonts(list = []) {
    const map = new Map();
    for (const f of list) {
        const family = String(f?.family || "").trim();
        if (!family) continue;
        if (!map.has(family)) map.set(family, { family, faces: new Map(), count: 0 });
        const g = map.get(family);
        g.count += 1;
        const face = wantedFace(f.style);
        if (face && !g.faces.has(face)) g.faces.set(face, f);
    }
    return [...map.values()]
        .map((g) => ({ family: g.family, count: g.count, faces: WANTED_FACES.filter((n) => g.faces.has(n)).map((n) => ({ name: n, data: g.faces.get(n) })) }))
        .filter((g) => g.faces.length)
        .sort((a, b) => a.family.localeCompare(b.family, "pt-BR"));
}

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
        if (typeof window.queryLocalFonts !== "function") { setError(NO_API); setList([]); return undefined; }
        window.queryLocalFonts()
            .then(async (fonts) => {
                if (!alive) return;
                const grouped = groupLocalFonts(fonts);
                // Denied, Chromium answers an empty list rather than refusing.
                if (!grouped.length) {
                    const state = await navigator.permissions?.query?.({ name: "local-fonts" }).then((p) => p.state).catch(() => "");
                    if (state === "denied") setError(DENIED);
                }
                if (!alive) return;
                setList(grouped);
                setTimeout(() => searchRef.current?.focus(), 0);
            })
            .catch((err) => { if (!alive) return; setError(err?.name === "NotAllowedError" || err?.name === "SecurityError" ? DENIED : `Não foi possível ler as fontes: ${err?.message || err}`); setList([]); });
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
    const canUse = mode === "file" ? Boolean(name.trim()) && !busy : Boolean(chosen) && !busy;

    const use = async () => {
        if (!canUse) return;
        setBusy(true);
        try {
            if (mode === "file") await onAnswer({ family: name.trim(), file });
            else await onAnswer({ family: chosen.family, faces: chosen.faces });
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
                            {list !== null && !error && !shown.length && <div className="kx-meta fd-empty">{q ? `Nenhuma fonte com "${q}"` : "Nenhuma fonte com Regular, Bold ou Italic foi encontrada."}</div>}
                            {shown.map((g) => (
                                <div key={g.family} role="option" aria-selected={g.family === picked} tabIndex={0} className={`fd-row kx-t ${g.family === picked ? "is-on" : ""}`}
                                    onClick={() => setPicked(g.family)} onDoubleClick={() => { setPicked(g.family); setTimeout(use, 0); }}
                                    onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setPicked(g.family); } }}>
                                    <span className="fd-name" style={{ fontFamily: cssFamily(g.family) }}>{g.family}</span>
                                    <span className="fd-faces kx-meta">{g.faces.map((f) => f.name).join(", ")}</span>
                                </div>
                            ))}
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
