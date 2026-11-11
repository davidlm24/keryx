import React, { useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { Btn } from "./kx";
import { usePlaced } from "./Menu";
import { slideToEdit, editSlide, REFUSED_WORDS } from "@/lib/console/slideEdit";

// "Editar este slide…" (owner 2026-11-12, mockup "Editar o slide e só o som
// com marcas", E1–E5): a small box anchored to a song's slide in the Slides
// column or No ar, with that slide's own lines (chords inline). Ctrl+Enter
// saves, Esc cancels; saving writes the song (slideEdit.js: the lyrics, the
// slides as the editor rebuilds them, the other slides' marks kept) and runs
// the console's songSaved, which refreshes the Prévia and the song on air
// (locked screens: it says so). "Abrir no editor" for the rest.
// `edit`: { songId, index, anchor } — anchor is the card's element.

// Which song a column's slides belong to: a song's stage (song:<id>) or the
// song on air (content.ref.songId). null for anything else (a passage, a
// text, an Escola material, a presentation).
export function songOfStage(stage) {
    if (!stage || stage.kind !== "lyrics" || typeof stage.id !== "string" || !stage.id.startsWith("song:")) return null;
    return stage.id.slice(5) || null;
}
export const songOnAir = (content) => (content?.kind === "lyrics" && content.ref?.songId) || null;

export default function SlideEditPop({ c, edit, onClose, onSongSaved, onOpenSong }) {
    const { songId, index } = edit;
    const pop = useRef(null);
    const anchorRef = useRef(edit.anchor);
    anchorRef.current = edit.anchor;
    const [song, setSong] = useState(null);
    const [open, setOpen] = useState(null); // slideToEdit's answer
    const [text, setText] = useState("");
    const [busy, setBusy] = useState(false);
    usePlaced(pop, anchorRef, { open: true, align: "start" });

    useEffect(() => {
        let alive = true;
        keryx.entities.Song.get(songId).then((row) => {
            if (!alive) return;
            const o = slideToEdit(row, index);
            setSong(row); setOpen(o); setText(o.text || "");
        }).catch(() => { if (alive) setOpen({ refused: "mismatch" }); });
        return () => { alive = false; };
    }, [songId, index]);

    // A press outside closes it (a press on another slide opens that one).
    useEffect(() => {
        const out = (e) => { if (e.target instanceof Node && !pop.current?.contains(e.target)) onClose(); };
        document.addEventListener("pointerdown", out, true);
        return () => document.removeEventListener("pointerdown", out, true);
    }, [onClose]);

    const empty = !text.trim();
    const save = async () => {
        if (!song || !open || open.refused || empty || busy) return;
        if (text === open.text) { onClose(); return; }
        const res = editSlide(song, index, text);
        if (res.refused) { setOpen({ ...open, error: REFUSED_WORDS[res.refused] }); return; }
        setBusy(true);
        try {
            const row = await keryx.entities.Song.update(songId, res.patch);
            c.say("Slide salvo na letra da música.");
            onSongSaved?.(row);
            onClose();
        } catch (err) {
            c.say(err?.message || "Não foi possível salvar.");
            setBusy(false);
        }
    };
    const toEditor = () => { onClose(); onOpenSong?.(songId); };

    const onAirNow = songOnAir(c.cur?.content) === songId;
    const refused = open?.refused;
    const heading = `${open?.label ? `${open.label} · ` : ""}slide ${index + 1}`;
    return (
        <div className="kx-pop pl-pop is-placed sedit" ref={pop} role="dialog" aria-label={`Editar ${heading}`}
            onKeyDown={(e) => {
                if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
                else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); e.stopPropagation(); save(); }
            }}>
            <div className="sedit-h"><span className="sedit-t">{heading.charAt(0).toUpperCase() + heading.slice(1)}</span><span className="sedit-s">{song?.title || ""}</span></div>
            {!open && <p className="sedit-note">Abrindo…</p>}
            {refused && <p className="sedit-err" role="alert">{REFUSED_WORDS[refused]}</p>}
            {open && !refused && <>
                <textarea className="kx-input sedit-ta" value={text} rows={Math.min(10, Math.max(2, text.split("\n").length + 1))} autoFocus spellCheck={false}
                    aria-label="As linhas deste slide" onChange={(e) => setText(e.target.value)} />
                {open.error && <p className="sedit-err" role="alert">{open.error}</p>}
                {empty && <p className="sedit-err">{REFUSED_WORDS.empty}</p>}
                {onAirNow && !empty && (c.locked
                    ? <p className="sedit-note"><span className="sedit-dot is-locked" aria-hidden="true" />Telas travadas · a letra é salva e a tela muda quando a música for enviada de novo.</p>
                    : <p className="sedit-note"><span className="sedit-dot" aria-hidden="true" />A música está no ar · muda nas telas ao salvar</p>)}
            </>}
            <div className="sedit-f">
                {refused
                    ? <><span className="sedit-sp" /><Btn small kind="brand" onClick={toEditor}>Abrir no editor</Btn></>
                    : <><button type="button" className="sedit-link" onClick={toEditor}>Abrir no editor</button><Btn small kind="brand" disabled={!open || empty || busy} onClick={save} title="Ctrl+Enter">Salvar</Btn></>}
                <Btn small onClick={onClose} title="Esc">Cancelar</Btn>
            </div>
        </div>
    );
}
