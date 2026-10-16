import React, { useEffect, useMemo, useRef, useState } from "react";
import { Panel, Row, Field, Empty, WinBar } from "../kx";
import { SECTIONS, SECTION_SCOPE, SCOPE_LABEL, sectionOf } from "@/lib/console/settings";
import { searchSettings, groupHits, countBySection } from "@/lib/console/settingsSearch";
import { searchTerms, highlightParts } from "@/lib/bibleSearch";
import { focusKind } from "@/lib/console/keys";
import { useLibrary } from "../useConsoleData";
import { CfgFlash } from "./parts";
import IgrejaSection from "./IgrejaSection";
import TelasSection from "./TelasSection";
import RedeSection from "./RedeSection";
import TemasSection from "./TemasSection";
import BibliaSection from "./BibliaSection";
import CultoSection from "./CultoSection";
import ConsoleSection from "./ConsoleSection";
import DadosSection from "./DadosSection";
import SobreSection from "./SobreSection";
import SyncSection from "./SyncSection";
import { useWinCol } from "../winLayout";

const BODIES = {
    sobre: SobreSection,
    igreja: IgrejaSection,
    rede: RedeSection,
    temas: TemasSection,
    biblia: BibliaSection,
    culto: CultoSection,
    backup: DadosSection,
    sincronizacao: SyncSection,
};
const ICON = Object.fromEntries(SECTIONS.map((s) => [s.id, s.icon]));

// A text with the searched words marked (accents and case ignored).
function Marked({ text, terms }) {
    return highlightParts(text, terms).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <React.Fragment key={i}>{p.text}</React.Fragment>));
}

// How long a row the search jumped to stays lit.
const FLASH_MS = 1600;

// Configurações: a page of THE window (Rodada C, src/lib/console/nav.js),
// with the frame bar it always had — the title, the search, the (x) —
// now drawn by WinBar; the sections on the left
// (src/lib/console/settings.js), the chosen one on the right. What is behind
// stays as it was: nothing here changes what is on air (Tela ociosa only
// changes an idle screen), and behind it only the emergency keys act
// (Console.jsx). Opening a screen or a theme from here pushes the editor
// onto the same window ("← Temas", "← Telas e saídas").
// The search in the bar (/ goes there) finds a setting by any word,
// without accents (src/lib/console/settingsSearch.js): the results replace
// the section, the left column counts them, and Enter or a click opens the
// section and lights the row up.
export default function SettingsView({ c, section, setSection, onClose, escRef, active = true, layout, setLayout, restoreLayout, onOpenScreen, onWhatsNew }) {
    // The columns a splitter resizes, kept per page on this computer (Rodada D3).
    const colNav = useWinCol("config.secoes", { def: 240, min: 180, max: 400 });
    const current = sectionOf(section);
    const [q, setQ] = useState("");
    const [activeHit, setActiveHit] = useState(0);
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
    useEffect(() => setActiveHit(0), [q]);
    useEffect(() => { document.querySelector(".cfg-results .is-selected")?.scrollIntoView({ block: "nearest" }); }, [activeHit]);

    // "/" goes to the search, as on the console (not while typing elsewhere,
    // and not while another page of the window covers this one).
    useEffect(() => {
        if (!active) return undefined;
        const onKey = (e) => {
            if (e.key !== "/" || e.ctrlKey || e.metaKey || focusKind(e.target) === "text") return;
            e.preventDefault();
            inputRef.current?.focus();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [active]);

    // After a jump: wait for the section to draw the row (some read the
    // computer first), bring it into view and light it up.
    useEffect(() => {
        if (!pending) return undefined;
        let tries = 0;
        let timer = null;
        const find = () => {
            const el = [...document.querySelectorAll(".win-dialog .cfg [data-cfg-k]")].find((n) => n.getAttribute("data-cfg-k") === pending);
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
            setActiveHit((i) => (i + (e.key === "ArrowDown" ? 1 : -1) + hits.length) % hits.length);
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (hits[activeHit]) jump(hits[activeHit]);
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
                            return (
                                <Row key={`${h.section}:${h.tab}:${h.label}:${i}`} icon={ICON[h.section]} state={i === activeHit ? "is-selected" : ""}
                                    title={<Marked text={h.label} terms={terms} />} meta={<Marked text={h.hint} terms={terms} />}
                                    onClick={() => jump(h)} />
                            );
                        })}
                    </React.Fragment>
                ))}
            </div>
        ) : <Empty icon="search" title={`Nada encontrado para “${q.trim()}”`}>Tente outra palavra: PIN, fundo, backup, transição, logo…</Empty>;
    } else if (current.id === "telas") body = <TelasSection c={c} onOpenScreen={onOpenScreen} />;
    else if (current.id === "console") body = <ConsoleSection c={c} layout={layout} setLayout={setLayout} restoreLayout={restoreLayout} />;
    else { const Body = BODIES[current.id]; body = <Body c={c} onOpenScreen={onOpenScreen} onWhatsNew={onWhatsNew} onSection={(id) => setSection(id)} />; }

    // Esc, the scrim and the (x) ask here; nothing to guard — everything
    // in Configurações saves as changed.
    if (escRef) escRef.current = (mode) => onClose(mode === "all");

    return (
        <CfgFlash.Provider value={flash}>
            <WinBar title="Configurações" tools={
                <span className="cfg-search">
                    <Field value={q} onChange={setQ} placeholder="Buscar nas configurações" inputRef={inputRef} onKeyDown={onSearchKey} kbd={q ? null : "/"} />
                </span>
            } />
            <div className="cfg-dialog-b">
                    <nav className="cfg-nav" aria-label="Seções" style={colNav.style}>
                        {SECTIONS.map(({ id, icon, name }) => (
                            <Row key={id} single icon={icon} title={name} current={!searching && id === current.id ? "page" : undefined} state={`${!searching && id === current.id ? "is-selected" : ""} ${searching && !counts[id] ? "is-dim" : ""}`}
                                onClick={() => { setQ(""); setSection(id); }}>
                                {searching && counts[id] ? <span className="cfg-hitcount">{counts[id]}</span> : null}
                            </Row>
                        ))}
                    </nav>
                    {colNav.split}
                    <div className="cfg">
                        <Panel title={searching ? `Resultados · ${hits.length}` : current.name} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
                            {!searching && SCOPE_LABEL[SECTION_SCOPE[current.id]] && <div className="listhead"><span className="kx-meta">{SCOPE_LABEL[SECTION_SCOPE[current.id]]}</span></div>}
                            {body}
                        </Panel>
                    </div>
                </div>
        </CfgFlash.Provider>
    );
}
