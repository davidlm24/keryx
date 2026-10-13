import React, { useEffect, useMemo, useRef, useState } from "react";
import { Panel, Row, IconBtn, Field, Empty } from "../kx";
import { SECTIONS, TELAS_TABS, sectionOf } from "@/lib/console/settings";
import { searchSettings, groupHits, countBySection } from "@/lib/console/settingsSearch";
import { searchTerms, highlightParts } from "@/lib/bibleSearch";
import { focusKind } from "@/lib/console/keys";
import { useLibrary } from "../useConsoleData";
import { CfgFlash } from "./parts";
import IgrejaSection from "./IgrejaSection";
import TelasSection from "./TelasSection";
import RedeSection from "./RedeSection";
import AparenciaSection from "./AparenciaSection";
import TemasSection from "./TemasSection";
import BibliaSection from "./BibliaSection";
import CultoSection from "./CultoSection";
import ConsoleSection from "./ConsoleSection";
import DadosSection from "./DadosSection";

const BODIES = {
    igreja: IgrejaSection,
    rede: RedeSection,
    aparencia: AparenciaSection,
    temas: TemasSection,
    biblia: BibliaSection,
    culto: CultoSection,
    backup: DadosSection,
};
const ICON = Object.fromEntries(SECTIONS.map((s) => [s.id, s.icon]));
const TAB_NAME = Object.fromEntries(TELAS_TABS);

// A text with the searched words marked (accents and case ignored).
function Marked({ text, terms }) {
    return highlightParts(text, terms).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>));
}

// How long a row the search jumped to stays lit.
const FLASH_MS = 1600;

// Configurações: a window over the console (or the view behind it), closed
// with its X, Esc or a click outside; the sections on the left
// (src/lib/console/settings.js), the chosen one on the right. What is behind
// stays as it was: nothing here changes what is on air (Tela ociosa only
// changes an idle screen), and behind it only the emergency keys act
// (Console.jsx).
// The search beside the title (/ goes there) finds a setting by any word,
// without accents (src/lib/console/settingsSearch.js): the results replace
// the section, the left column counts them, and Enter or a click opens the
// section and lights the row up.
export default function SettingsView({ c, section, tab, setSection, onClose, layout, setLayout, restoreLayout, onOpenScreen }) {
    const current = sectionOf(section);
    const [q, setQ] = useState("");
    const [active, setActive] = useState(0);
    const [pending, setPending] = useState(null);
    const [flash, setFlash] = useState(null);
    const inputRef = useRef(null);
    const { themes } = useLibrary();
    // The church's themes are found by name too.
    const extra = useMemo(() => (themes || []).filter((t) => t?.name).map((t) => ({ section: "temas", tab: null, label: t.name, hint: "Tema", keywords: [], target: "Temas" })), [themes]);
    const hits = useMemo(() => searchSettings(q, extra), [q, extra]);
    const terms = useMemo(() => searchTerms(q), [q]);
    const searching = terms.length > 0;
    const counts = countBySection(hits);
    useEffect(() => setActive(0), [q]);
    useEffect(() => { document.querySelector(".cfg-results .is-selected")?.scrollIntoView({ block: "nearest" }); }, [active]);

    // "/" goes to the search, as on the console (not while typing elsewhere).
    useEffect(() => {
        const onKey = (e) => {
            if (e.key !== "/" || e.ctrlKey || e.metaKey || focusKind(e.target) === "text") return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, []);

    // After a jump: wait for the section to draw the row (some read the
    // computer first), bring it into view and light it up.
    useEffect(() => {
        if (!pending) return undefined;
        let tries = 0;
        let timer = null;
        const find = () => {
            const el = [...document.querySelectorAll(".cfg-dialog .cfg [data-cfg-k]")].find((n) => n.getAttribute("data-cfg-k") === pending);
            if (el) { el.scrollIntoView({ block: "center" }); setFlash(pending); setPending(null); return; }
            tries += 1;
            if (tries < 60) timer = setTimeout(find, 50);
            else setPending(null);
        };
        timer = setTimeout(find, 0);
        return () => clearTimeout(timer);
    }, [pending]);
    useEffect(() => {
        if (!flash) return undefined;
        const t = setTimeout(() => setFlash(null), FLASH_MS);
        return () => clearTimeout(t);
    }, [flash]);

    const jump = (hit) => {
        setQ("");
        setFlash(null);
        setSection(hit.section, hit.tab);
        setPending(hit.target);
        inputRef.current?.blur();
    };
    const onSearchKey = (e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
            if (!hits.length) return;
            e.preventDefault();
            setActive((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (hits[active]) jump(hits[active]);
        } else if (e.key === "Escape") {
            // A search to clear first; then Esc closes the window, as anywhere.
            e.preventDefault();
            e.stopPropagation();
            if (q) setQ("");
            else onClose();
        }
    };

    let body;
    if (searching) {
        body = hits.length ? (
            <div className="cfg-results" role="listbox" aria-label="Resultados da busca">
                {groupHits(hits).map((g) => (
                    <React.Fragment key={g.section}>
                        <div className="kx-menu-h"><span className="kx-section">{g.name}</span></div>
                        {g.hits.map((h) => {
                            const i = hits.indexOf(h);
                            const where = h.tab && TAB_NAME[h.tab] ? `${TAB_NAME[h.tab]} · ` : "";
                            return (
                                <Row key={`${h.section}:${h.tab}:${h.label}:${i}`} icon={ICON[h.section]} state={i === active ? "is-selected" : ""}
                                    title={<Marked text={h.label} terms={terms} />} meta={<>{where}<Marked text={h.hint} terms={terms} /></>}
                                    onClick={() => jump(h)} />
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        ) : <Empty icon="search" title={`Nada encontrado para “${q.trim()}”`}>Tente outra palavra: PIN, fundo, backup, transição, logo…</Empty>;
    } else if (current.id === "telas") body = <TelasSection c={c} tab={tab} setTab={(t) => setSection("telas", t)} onOpenScreen={onOpenScreen} />;
    else if (current.id === "console") body = <ConsoleSection c={c} layout={layout} setLayout={setLayout} restoreLayout={restoreLayout} />;
    else { const Body = BODIES[current.id]; body = <Body c={c} onOpenScreen={onOpenScreen} />; }

    return (
        <CfgFlash.Provider value={flash}>
            <div className="cfg-dialog" role="dialog" aria-modal="true" aria-label="Configurações">
                <div className="cfg-dialog-h">
                    <span className="kx-section">Configurações</span>
                    <span className="cfg-search">
                        <Field value={q} onChange={setQ} placeholder="Buscar nas configurações" inputRef={inputRef} onKeyDown={onSearchKey} kbd={q ? null : "/"} />
                    </span>
                    <span className="cfg-h-gap" />
                    <IconBtn name="x" title="Fechar · Esc" onClick={onClose} />
                </div>
                <div className="cfg-dialog-b">
                    <nav className="cfg-nav" aria-label="Seções">
                        {SECTIONS.map(({ id, icon, name }) => (
                            <Row key={id} single icon={icon} title={name} current={!searching && id === current.id ? "page" : undefined} state={`${!searching && id === current.id ? "is-selected" : ""} ${searching && !counts[id] ? "is-dim" : ""}`}
                                onClick={() => { setQ(""); setSection(id); }}>
                                {searching && counts[id] ? <span className="cfg-hitcount">{counts[id]}</span> : null}
                            </Row>
                        ))}
                    </nav>
                    <div className="cfg">
                        <Panel title={searching ? `Resultados · ${hits.length}` : current.name} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
                            {body}
                        </Panel>
                    </div>
                </div>
            </div>
        </CfgFlash.Provider>
    );
}
