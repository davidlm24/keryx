import React, { useEffect, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn, Field, Row, Empty, Seg } from "./kx";
import { songFromText } from "@/lib/songImport";
import { usePrefs, getPrefs, updateUser } from "@/hooks/useUser";

// "+ › Na internet…" for songs, like the Holyrics search: one field, the
// results of several sources in one list, the lyrics beside it, Importar.
// LRCLIB (no key) brings the lyrics; letras.mus.br results
// open in the browser and the lyrics are pasted (the site refuses automated
// reading). The search runs in the main process (electron/lyrics.cjs).
export default function LyricsSearch({ c, onClose, onImported }) {
    const bridge = useRef(window.keryxDesktop?.lyrics || null);
    const [q, setQ] = useState("");
    const [busy, setBusy] = useState(false);
    const [results, setResults] = useState(null);
    const [errors, setErrors] = useState([]);
    const [pick, setPick] = useState(0);
    const [preview, setPreview] = useState({ loading: false, lyrics: "", error: "" });
    const [pasted, setPasted] = useState("");
    const inputRef = useRef(null);
    const call = async (op, args) => {
        if (!bridge.current) throw new Error("A busca na internet funciona no KERYX do computador.");
        const res = await bridge.current.call(op, args);
        if (res?.error) throw new Error(res.error.message);
        return res.data;
    };

    useEffect(() => {
        setTimeout(() => inputRef.current?.focus(), 0);
    }, []);

    const search = async () => {
        if (q.trim().length < 2) return;
        setBusy(true);
        setResults(null);
        setErrors([]);
        try {
            const r = await call("search", q.trim());
            setResults(r.results);
            setErrors(r.errors || []);
            setPick(0);
        } catch (err) {
            setResults([]);
            setErrors([err.message]);
        }
        setBusy(false);
    };

    const hit = results?.[pick] || null;
    useEffect(() => {
        setPasted("");
        if (!hit) { setPreview({ loading: false, lyrics: "", error: "" }); return undefined; }
        if (!hit.hasLyrics) { setPreview({ loading: false, lyrics: "", error: "" }); return undefined; }
        let alive = true;
        setPreview({ loading: true, lyrics: "", error: "" });
        call("get", hit.id)
            .then((s) => { if (alive) setPreview({ loading: false, lyrics: s.lyrics, error: "" }); })
            .catch((err) => { if (alive) setPreview({ loading: false, lyrics: "", error: err.message }); });
        return () => { alive = false; };
    }, [hit?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const lyrics = hit?.hasLyrics ? preview.lyrics : pasted;
    // How the imported lyric is cut into slides (the preference also in Configurações › Bíblia e músicas).
    const cut = String(usePrefs().import_lines);
    const pickCut = (v) => { updateUser({ import_lines: Number(v) }).catch(() => c.say("Não foi possível salvar.")); };
    const importSong = async () => {
        if (!hit || !lyrics.trim()) return;
        try {
            const song = songFromText(lyrics, { title: hit.title, artist: hit.artist, lines: getPrefs().import_lines });
            const row = await keryx.entities.Song.create(song);
            c.say(`${song.title} importada para as Letras.`);
            onImported?.(row);
            onClose();
        } catch (err) {
            c.say(err?.message || "Não foi possível importar.");
        }
    };

    return (
        <div className="lyr" role="dialog" aria-label="Procurar letra na internet">
            <div className="lyr-h">
                <Icon name="search" />
                <span className="kx-section" style={{ color: "var(--fg-1)" }}>Procurar letra na internet</span>
                <span style={{ flex: 1 }} />
                <Btn small onClick={onClose}>Fechar</Btn>
            </div>
            <div className="lyr-q">
                <Field inputRef={inputRef} value={q} onChange={setQ} placeholder="Título ou artista (ex.: algo novo)" onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); search(); } }} kbd="Enter" />
                <Btn kind="outline" onClick={search} disabled={busy || q.trim().length < 2}>{busy ? "Procurando…" : "Procurar"}</Btn>
            </div>
            <div className="lyr-b">
                <div className="lyr-list">
                    {results === null && !busy && <Empty icon="music" title="Digite e tecle Enter">Resultados do LRCLIB e do letras.mus.br numa lista só.</Empty>}
                    {busy && <Empty title="Procurando…" />}
                    {results && !results.length && !busy && <Empty icon="music" title={`Nada para "${q}"`}>Tente o título exato ou o nome do artista.</Empty>}
                    {(results || []).map((r, i) => (
                        <Row key={r.id} icon="music" title={r.title} meta={[r.artist, r.extra, r.sourceLabel].filter(Boolean).join(" · ")} state={i === pick ? "is-selected" : ""} onClick={() => setPick(i)} onDoubleClick={importSong} />
                    ))}
                </div>
                <div className="lyr-prev">
                    {!hit && <Empty title="Nenhuma música escolhida" />}
                    {hit && (
                        <>
                            <div className="lyr-t"><b>{hit.title}</b>{hit.artist && <span> · {hit.artist}</span>}<span className="kx-meta"> · {hit.sourceLabel}</span></div>
                            {hit.hasLyrics && preview.loading && <Empty title="Buscando a letra…" />}
                            {hit.hasLyrics && preview.error && <div className="warnline"><Icon name="warn" /><span>{preview.error}</span></div>}
                            {hit.hasLyrics && preview.lyrics && <pre className="lyr-text">{preview.lyrics}</pre>}
                            {!hit.hasLyrics && (
                                <div className="lyr-paste">
                                    <span className="kx-meta">O letras.mus.br não deixa programas lerem a letra. Abra a página, copie a letra e cole abaixo.</span>
                                    <Btn kind="outline" onClick={() => window.open(hit.pageUrl, "_blank")}><Icon name="external" />Abrir no letras.mus.br</Btn>
                                    <textarea value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder="Cole a letra aqui" spellCheck={false} />
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>
            <div className="lyr-f">
                {errors.length > 0 && <span className="kx-warn">{errors.join(" · ")}</span>}
                <span style={{ flex: 1 }} />
                <span className="kx-meta lyr-legal">Letras têm direitos autorais. Use conforme a licença da sua igreja (ex.: CCLI).</span>
                <span className="kx-meta">Dividir em</span>
                <Seg small value={cut} onChange={pickCut} options={[["0", "Estrofe"], ["2", "2 linhas"], ["4", "4 linhas"]]} />
                <Btn kind="brand" onClick={importSong} disabled={!hit || !lyrics.trim()}>Importar</Btn>
            </div>
        </div>
    );
}
