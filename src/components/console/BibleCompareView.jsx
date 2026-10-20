import React, { useEffect, useState } from "react";
import Icon from "./Icon";
import { Btn, Empty } from "./kx";
import { BIBLE_VERSIONS } from "@/lib/bibleBooks";
import { getChapter, installedVersions } from "@/lib/bibleText";

const KEY = "keryx.console.bible.compare";
const loadChosen = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return Array.isArray(v) && v.length ? v : null; } catch { return null; } };

// Comparar: the selected verses (or the whole chapter) in several versions
// side by side, one column each, verses aligned by number. Each column can
// go on air in its version or become the version in use. Text comes through
// src/lib/bibleText.js like everywhere else (installed, then online); a
// version that fails says why in its own column.
export default function BibleCompareView({ book, chapter, version, sel, onSelect, onSendVersion, onUseVersion }) {
    const [installed, setInstalled] = useState({});
    const [chosen, setChosen] = useState(() => loadChosen() || [version, version === "ACF" ? "NVI" : "ACF"]);
    const [cols, setCols] = useState({}); // version -> { verses } | { error } | { loading }
    useEffect(() => { installedVersions().then(setInstalled).catch(() => {}); }, []);
    useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(chosen)); } catch { /* not remembered */ } }, [chosen]);
    useEffect(() => {
        let alive = true;
        setCols(Object.fromEntries(chosen.map((v) => [v, { loading: true }])));
        for (const v of chosen) {
            getChapter(v, book, chapter)
                .then((r) => { if (alive) setCols((c) => ({ ...c, [v]: { verses: r.verses, source: r.source } })); })
                .catch((err) => { if (alive) setCols((c) => ({ ...c, [v]: { error: err?.message || "Indisponível." } })); });
        }
        return () => { alive = false; };
    }, [chosen, book, chapter]);

    const toggle = (v) => setChosen((c) => (c.includes(v) ? (c.length > 1 ? c.filter((x) => x !== v) : c) : [...c, v].slice(-4)));
    const numbers = (() => {
        if (sel.length) return [...sel].sort((a, b) => a - b);
        const first = chosen.map((v) => cols[v]?.verses).find(Boolean);
        return first ? first.map((x) => x.number) : [];
    })();
    const textOf = (v, n) => cols[v]?.verses?.find((x) => x.number === n)?.text;

    return (
        <div className="bc">
            <div className="bc-bar">
                <span className="kx-meta">Versões</span>
                {BIBLE_VERSIONS.map((v) => (
                    <button type="button" key={v.id} className={`bc-chip kx-t ${chosen.includes(v.id) ? "is-on" : ""}`} onClick={() => toggle(v.id)} title={installed[v.id] ? "Instalada neste computador" : v.online ? "Pela internet" : "Indisponível sem instalar"}>
                        {installed[v.id] && <Icon name="check" size={12} />}{v.id}
                    </button>
                ))}
                <span style={{ flex: 1 }} />
                <span className="kx-meta">{sel.length ? "os selecionados" : "o capítulo inteiro"} · até 4 versões</span>
            </div>
            <div className="bc-grid" style={{ gridTemplateColumns: `28px repeat(${chosen.length}, minmax(0, 1fr))` }}>
                <span />
                {chosen.map((v) => (
                    <div key={v} className="bc-head">
                        <span className="kx-section">{v}</span>
                        <span className="kx-meta">{cols[v]?.loading ? "carregando…" : cols[v]?.error ? "indisponível" : cols[v]?.source === "local" ? "instalada" : "internet"}</span>
                        <span style={{ flex: 1 }} />
                        {v !== version && <Btn small disabled={!cols[v]?.verses} onClick={() => onUseVersion(v)} title={`Passar a usar a ${v} na Bíblia`}>Usar</Btn>}
                        <Btn small disabled={!sel.length || !cols[v]?.verses} onClick={() => onSendVersion(v, cols[v].verses)} title={sel.length ? `Enviar os selecionados na ${v}` : "Selecione versículos para enviar"}>Enviar</Btn>
                    </div>
                ))}
                {chosen.some((v) => cols[v]?.error) && (
                    <>
                        <span />
                        {chosen.map((v) => <div key={v} className="bc-err">{cols[v]?.error ? <><Icon name="warn" size={12} /> {cols[v].error}</> : null}</div>)}
                    </>
                )}
                {numbers.map((n) => (
                    <React.Fragment key={n}>
                        <button type="button" className={`bc-n kx-t ${sel.includes(n) ? "is-prev" : ""}`} onClick={(e) => onSelect(n, e)}>{n}</button>
                        {chosen.map((v) => <button type="button" key={v} className={`bc-cell kx-t ${sel.includes(n) ? "is-prev" : ""}`} onClick={(e) => onSelect(n, e)}>{textOf(v, n) ?? <span className="kx-meta">—</span>}</button>)}
                    </React.Fragment>
                ))}
            </div>
            {!numbers.length && <Empty icon="book" title="Nada para comparar">Escolha um capítulo e, se quiser, selecione versículos.</Empty>}
        </div>
    );
}
