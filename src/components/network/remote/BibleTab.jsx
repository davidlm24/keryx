import React, { useState } from "react";
import Icon from "@/components/console/Icon";
import { Cmd } from "./parts";

// A Bíblia reference: type it (jo 3 16), Conferir shows the text the console
// found (the version chosen on the computer), then Enviar ao ar.
export default function BibleTab({ c }) {
    const [ref, setRef] = useState("");
    const [found, setFound] = useState(null);
    const finding = c.busy.has("bibleFind");
    const find = async () => {
        if (!ref.trim() || finding) return;
        const r = await c.run("bibleFind", "bibleFind", { ref: ref.trim() }, { quiet: true });
        setFound(r?.ok ? { ...r.result, ref: ref.trim() } : null);
    };
    return (
        <div className="rm-main">
            <form className="rm-refrow" onSubmit={(e) => { e.preventDefault(); find(); }}>
                <label className="rm-field">
                    <Icon name="book" size={20} />
                    <input value={ref} onChange={(e) => { setRef(e.target.value); setFound(null); }} placeholder="Referência (jo 3 16)" aria-label="Referência" autoCapitalize="none" autoCorrect="off" enterKeyHint="search" maxLength={40} />
                </label>
                <button type="submit" className={`rm-b is-sm ${finding ? "is-busy" : ""}`} disabled={!ref.trim()}>Conferir</button>
            </form>
            {found && (
                <div className="rm-card">
                    <span className="rm-k">{found.reference}{found.version ? ` · ${found.version}` : ""}</span>
                    <span className="rm-v is-prose">{found.text}</span>
                </div>
            )}
            <div className="rm-sticky">
                {found
                    ? <Cmd c={c} action="bibleSend" args={{ ref: found.ref }} className="is-go is-wide" then={() => { setFound(null); setRef(""); }}>Enviar {found.reference}{found.version ? ` · ${found.version}` : ""}</Cmd>
                    : <p className="rm-hint">Confira a referência antes de enviar.</p>}
            </div>
        </div>
    );
}
