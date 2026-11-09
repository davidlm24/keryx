import React, { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { versionsBetween, parseNotes } from "@/lib/console/releaseNotes";
import { RELEASE_NOTES } from "@/lib/console/releaseNotesData";
import ShortcutList from "./ShortcutList";
import { keyHint } from "@/lib/console/keys";
import { firstSteps } from "@/lib/console/firstSteps";
import { usePrefs } from "@/hooks/useUser";
import Icon from "./Icon";
import { Btn, MenuItem, Empty, Seg } from "./kx";
import { MenuList, useFocusFirst, usePlaced } from "./Menu";
import { MODULES, DENSITIES, densityOf } from "@/lib/console/layout";
import { PANEL_TABS, TABS_MENU_TITLE, tabsMenu } from "@/lib/console/panelTabs";
import { restoreArgs } from "@/lib/projection";
import { stageFromHistory, stageFromSong, stageFromMedia, stageFromPiece, stageFromMaterial } from "@/lib/console/stage";
import { materialIcon, materialMeta } from "@/lib/console/school";
import { formatReference } from "@/lib/bibleBooks";
import { referenceFrom } from "@/lib/console/quickRef";
import { hasUpdate, canInstallNow, onAir, phaseOf } from "@/lib/console/updates";
import { byGroup, rowStatus } from "@/lib/console/outputs";
import { placementOptions, placementTarget, placementValue, placementWord } from "@/lib/console/placement";
import { PREF_OUTPUTS, ruleLabel, ruleSummary } from "@/lib/outputPrefs";
import { useOutputLooks } from "@/hooks/useOutputPref";
import { Switch } from "./settings/parts";
import { useDialogFocus } from "./useDialogFocus";
import { mediaIcon } from "@/lib/console/libraryRows";
import { stageItem } from "@/lib/console/setlist";
import { searchBible } from "@/lib/bibleText";
import { SCOPES, SCOPE_LIMIT, BIBLE_HITS, fold, ranked, markParts, paletteGroups, sectionOrder, nextScope, stepIndex, recentEntries, agoWords, nextEntries, enterWord } from "@/lib/console/paletteSearch";

const DEVICE_ICON = { projector: "projector", tv: "tv", tablet: "tablet", pc: "monitor" };

// The KERYX menu (the logo) is the app's own (Rodada M0, owner 2026-10-19/20):
// Configurações, Saídas, Sobre o KERYX and Atualizar agora when an update is
// due. The menus (Culto, Música, Mídia, Ferramentas, Ajuda) are the menu
// bar's and, where it folds away, the Menu button's (MenuBar.jsx); Ajuda keeps
// Sobre and Atualizar too, so either habit finds them. Ver is the panels
// glyph beside the bell.
export function Menu({ open, setOpen, layout, setLayout, restoreLayout, presets = [], presetId = null, presetDirty = false, onPickPreset, editing, onEditLayout, dockLocked = false, onDockLock, onSettings, update, onUpdateNow, newIn = null }) {
    if (open !== "menu" && open !== "ver") return null;
    // Every list here is the console's one menu (Menu.jsx MenuList): it takes
    // the focus, the arrows walk it, Esc and Tab close it (C-14, C-15).
    const close = () => setOpen(null);
    const go = (fn) => () => { setOpen(null); fn?.(); };
    if (open === "ver") {
        const items = [
            { head: "Ver" },
            // `newIn`: the module with something new in it (the Painel's
            // pedidos, Rodada Q S9 = B) wears the gold dot.
            ...MODULES.map(([key, name]) => ({ label: name, role: "menuitemcheckbox", checked: !layout.hidden[key], kbd: newIn === key ? <><i className="ver-new-dot" aria-hidden="true" /><span className="kx-sr">pedidos novos</span></> : undefined, onSelect: () => setLayout({ ...layout, hidden: { ...layout.hidden, [key]: !layout.hidden[key] } }) })),
            "sep",
            { head: "Densidade" },
            ...DENSITIES.map(([key, name]) => ({ label: name, role: "menuitemcheckbox", checked: densityOf(layout) === key, onSelect: () => setLayout({ ...layout, density: key }), title: key === "auto" ? "Compacta numa tela baixa (notebook), Confortável nas outras" : key === "comfortable" ? "Linhas de 32 px, títulos em até duas linhas" : "Linhas de 28 px, uma linha por item" })),
            "sep",
            // Named arrangements (dockPresets.js): Padrão and the operator's.
            { head: "Disposição" },
            ...[{ id: null, name: "Padrão" }, ...presets].map((p) => ({
                label: `${p.name}${presetId === p.id && presetDirty ? " · alterada" : ""}`, role: "menuitemcheckbox", checked: presetId === p.id, onSelect: () => onPickPreset?.(p.id),
                title: p.id ? `Trocar para a disposição “${p.name}”` : "A disposição de fábrica do console",
            })),
            "sep",
            { label: editing ? "Concluir a edição" : "Editar disposição", icon: "grip", checked: editing, onSelect: onEditLayout, title: "Mudar os módulos de lugar, salvar disposições com nome · Esc conclui" },
            // Travar fora da edição (Rodada P4-1): the environment on screen's.
            ...(onDockLock ? [{ label: "Travar fora da edição", role: "menuitemcheckbox", checked: dockLocked, onSelect: () => onDockLock(!dockLocked), title: "Os divisores só mudam em Editar disposição (vale para o ambiente na tela: o Culto ou a Bíblia)" }] : []),
            { label: "Restaurar disposição", onSelect: () => { restoreLayout(); setOpen(null); } },
        ];
        return (
            // Under the top bar's Ver button, its right edge on the button's.
            <MenuList key="ver" className="pop kx-pop" label="Ver" items={items} closeOnPick={false} onClose={close}
                style={{ right: Math.max(8, Math.round(window.innerWidth - (document.querySelector(".topbar .tb-ver")?.getBoundingClientRect().right ?? window.innerWidth - 8))), top: "var(--pop-top)", width: 220 }} />
        );
    }
    const items = [
        { head: "KERYX" },
        { label: "Configurações", icon: "sliders", onSelect: go(() => onSettings?.("telas")) },
        { label: "Saídas", icon: "monitor", onSelect: () => setOpen("outs") },
        { label: "Sobre o KERYX", icon: "info", onSelect: go(() => onSettings?.("sobre")) },
        ...(hasUpdate(update) ? ["sep", { label: update.status === "downloading" ? "Atualizando…" : "Atualizar agora", icon: "download", kbd: update.status === "downloading" ? `${update.percent}%` : update.version, onSelect: () => onUpdateNow?.() }] : []),
    ];
    return <MenuList key="menu" className="pop kx-pop" label="Menu do KERYX" items={items} closeOnPick={false} onClose={close} style={{ left: "var(--gutter)", top: "var(--pop-top)", width: 230 }} />;
}

// Ajuda › Primeiros passos (Rodada M0): the console in seven steps
// (src/lib/console/firstSteps.js), each with the button that opens what it
// names (`onGo(id)`). Its keys follow the church's Teclas de uma letra.
export function FirstSteps({ open, setOpen, onGo }) {
    const letters = usePrefs().letter_keys;
    const box = useFocusFirst(open === "passos");
    if (open !== "passos") return null;
    const steps = firstSteps((action) => keyHint(action, letters));
    return (
        <div ref={box} className="dialog fs" role="dialog" aria-label="Primeiros passos">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>Primeiros passos</div>
            <ol className="fs-list">
                {steps.map((st, i) => (
                    <li key={st.title} className="fs-step">
                        <span className="fs-n" aria-hidden="true">{i + 1}</span>
                        <div className="fs-body">
                            <div className="fs-t">{st.title}</div>
                            <p className="fs-p">{st.text}</p>
                        </div>
                        {st.go && <Btn small onClick={() => { setOpen(null); onGo?.(st.go.id); }}>{st.go.label}</Btn>}
                    </li>
                ))}
            </ol>
            <div className="acts"><Btn kind="brand" onClick={() => setOpen(null)}>Entendi</Btn></div>
        </div>
    );
}

export function Shortcuts({ open, setOpen }) {
    if (open !== "atalhos") return null;
    return (
        <div className="dialog">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>Atalhos</div>
            <ShortcutList />
            <div className="acts"><Btn onClick={() => setOpen(null)}>Fechar</Btn></div>
        </div>
    );
}

// Saídas: the windows the main process places and the screens on the
// network, grouped by what they are for (Público, Palco, Transmissão), each
// with its state, what it shows and the way to fix it
// (src/lib/console/outputs.js says which is which).
// A top-bar popover sits under the button that opened it, right edges
// aligned, and never leaves the window (a fixed offset drifted off on
// narrow windows and whenever the bar's buttons moved).
export function useAnchor(selector, width, active) {
    const [box, setBox] = useState(null);
    useLayoutEffect(() => {
        if (!active) return undefined;
        const place = () => {
            const w = Math.min(width, window.innerWidth - 12);
            const el = document.querySelector(selector);
            const r = el ? el.getBoundingClientRect() : null;
            const left = r ? r.right - w : window.innerWidth - w - 6;
            setBox({ left: Math.round(Math.min(Math.max(6, left), window.innerWidth - w - 6)), width: w });
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
    }, [selector, width, active]);
    return box;
}

const TONE_DOT = { ok: "var(--ok)", rh: "var(--rh)", warn: "var(--warn)", off: "var(--fg-3)" };
const TONE_CLS = { ok: "", rh: "is-rh", warn: "is-warn", off: "is-off" };

export function Outputs({ open, setOpen, health, locked, onLock, onOpen, onClose, onForget, removed = [], onRestore, onIdentify = null, onSettings, ruleOf = null, onRule = null, displays = [], outputs = [], onPlace = null }) {
    const look = useOutputLooks();
    const anchor = useAnchor(".topbar .kx-status", 440, open === "outs");
    const box = useFocusFirst(open === "outs");
    // The switch moves on the click; the row's state catches up when the
    // window is there (onOpen/onClose read the outputs again when done).
    const [want, setWant] = useState({});
    const flip = (key, on) => {
        setWant((w) => ({ ...w, [key]: on }));
        Promise.resolve(on ? onOpen(key) : onClose(key)).finally(() => setWant(({ [key]: _done, ...rest }) => rest));
    };
    // The same for the destination: the button shows the choice at once, the
    // main process moves the window, and the row reads it back when done.
    const [placing, setPlacing] = useState({});
    const pick = (key, value) => {
        const target = placementTarget(value, displays);
        if (!target) return;
        setPlacing((p) => ({ ...p, [key]: target }));
        Promise.resolve(onPlace(key, target)).finally(() => setPlacing(({ [key]: _done, ...rest }) => rest));
    };
    if (open !== "outs") return null;
    const rows = health.rows;
    const summary = health.total ? `${health.connected} de ${health.total} conectadas${locked ? " · travadas" : ""}` : "nenhuma aberta";
    return (
        <div ref={box} role="dialog" aria-label="Saídas" className="pop kx-pop pop-outs" style={{ left: anchor?.left ?? 6, top: "var(--pop-top)", width: anchor?.width ?? 440, maxHeight: "calc(100vh - var(--pop-top) - 16px)", overflow: "auto" }}>
            <div className="kx-menu-h"><span className="kx-section" style={{ color: "var(--fg-1)" }}>Saídas</span><span style={{ flex: 1 }} /><span className={`kx-meta ${!health.connected ? "kx-warn" : ""}`}>{summary}</span></div>
            {byGroup(rows, (r) => (r.local ? r.key : r.screen)).map((g) => (
                <React.Fragment key={g.key}>
                <div className="kx-menu-h out-group"><span className="kx-section">{g.label}</span></div>
                {g.items.map((r) => {
                const st = rowStatus(r, { locked });
                const page = r.local ? r.key : r.screen;
                const icon = r.local ? look(r.key).icon : r.screen ? look(r.screen).icon : DEVICE_ICON[r.kind] || "tv";
                return (
                    // One switch per local row: ligado = a janela existe. The
                    // name of an open output brings it forward (outputs have
                    // no taskbar button). Network rows have no switch: the
                    // console cannot reopen a tablet.
                    <div key={r.id} className={`kx-out is-tall ${r.local ? "has-sw" : ""} ${TONE_CLS[st.tone]}`}>
                        {r.local && <Switch on={r.key in want ? want[r.key] : Boolean(st.switchOn)} onChange={(on) => flip(r.key, on)} label={st.switchOn ? `Fechar ${r.name} · Ctrl+W na própria saída` : `Abrir ${r.name}`} />}
                        <span className="kx-glyph"><Icon name={icon} /></span>
                        <div style={{ minWidth: 0 }}>
                            {r.local && st.switchOn
                                ? <button type="button" className="kx-t kx-out-name kx-out-front" title={`Mostrar ${r.name} por cima das outras janelas`} onClick={() => onOpen(r.key)}>{r.name}</button>
                                : <div className="kx-out-name">{r.name}</div>}
                            <div className="kx-out-meta">{r.meta}</div>
                            {r.shows && <div className="kx-out-meta" style={{ color: "var(--fg-2)" }}>Mostra: {r.shows}</div>}
                            {st.hint && <div className="kx-out-meta">{st.hint}</div>}
                            {/* What this output receives, changed right here (owner
                                2026-10-27, S1 = A): the four shortcuts and the Editor.
                                Palco, Pastor and Transmissão draw their own thing.
                                Recebe and Destino share one line, each its glyph and
                                value, no word (owner 2026-11-08, mockup P1 = A): the
                                eye what it receives, the monitor where it opens. */}
                            {(() => {
                                const recv = ruleOf && onRule && PREF_OUTPUTS.includes(page);
                                // Where it opens (owner 2026-11-02, D1 = A): every local
                                // row but a removed one, Palco and Pastor too.
                                const out = r.local && outputs.find((o) => o.key === r.key);
                                const place = onPlace && out?.assignment;
                                if (!recv && !place) return null;
                                const moving = r.key in placing;
                                const shown = place && (moving ? { ...place, target: placing[r.key] } : place);
                                const word = place && placementWord(shown, displays, moving ? null : out.placement);
                                return (
                                    <div className="kx-out-ctl">
                                        {recv && (
                                            <button type="button" className="kx-t kx-out-recv" aria-haspopup="menu" aria-label={`Recebe: ${ruleLabel(ruleOf(page))}`} title={`O que ${r.name} recebe: ${ruleSummary(ruleOf(page))}`} onClick={(e) => onRule(e, page, r.name)}>
                                                <Icon name="eye" size={12} /><b>{ruleLabel(ruleOf(page))}</b><Icon name="chevron-down" size={12} />
                                            </button>
                                        )}
                                        {place && (
                                            <span className={`kx-out-recv kx-out-dest ${word.off ? "is-off" : ""}`} title={`Destino: em qual tela ${r.name} abre`}>
                                                <Icon name="monitor" size={12} /><b>{word.text}</b><Icon name="chevron-down" size={12} />
                                                <select value={placementValue(shown, displays)} onChange={(e) => pick(r.key, e.target.value)} aria-label={`Destino de ${r.name}: ${word.text}`}>
                                                    {placementOptions(displays, shown).map((op) => <option key={op.value} value={op.value} disabled={op.disabled}>{op.label}</option>)}
                                                </select>
                                            </span>
                                        )}
                                    </div>
                                );
                            })()}
                        </div>
                        <span className="kx-out-st" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <i className="kx-dot" style={{ background: TONE_DOT[st.tone] }} />{st.text}
                            {!r.local && r.state === "disconnected" && <Btn small onClick={() => onForget(r.id)} title="Não avisar mais sobre esta tela nesta sessão">Esquecer</Btn>}
                        </span>
                    </div>
                );
                })}
                </React.Fragment>
            ))}
            {/* Outputs the operator removed: one click brings one back, with
                the same screen and Ajustes it had (Telas e saídas keeps them). */}
            {removed.length > 0 && (
                <>
                    <div className="kx-menu-h out-group"><span className="kx-section">Adicionar saída</span><span className="kx-meta" style={{ flex: 1, minWidth: 0 }}>· volta com os mesmos ajustes</span></div>
                    {removed.map((o) => (
                        <MenuItem key={o.key} icon={look(o.key).icon} onClick={() => onRestore?.(o.key)}>{o.label}<span className="kx-kbd">Adicionar</span></MenuItem>
                    ))}
                </>
            )}
            {/* Transmissão is an OBS Browser Source: until OBS connects, say where its address is. */}
            {!rows.some((r) => r.group === "transmissao") && (
                <div className="kx-menu-h out-group" title="No OBS: Fonte de navegador com o endereço da Transmissão, 1920 × 1080">
                    <span className="kx-section">Transmissão</span><span className="kx-meta" style={{ flex: 1, minWidth: 0 }}>· legenda da transmissão ao vivo</span>
                    <Btn small onClick={() => { setOpen(null); onSettings?.("rede"); }}>Endereço</Btn>
                </div>
            )}
            {!rows.length && <Empty icon="monitor" title="Nenhuma saída">No navegador as telas abrem em abas; no computador do culto, em Telas e saídas.</Empty>}
            <div className="kx-menu-sep" />
            {/* Travar telas: rehearse with the screens frozen (shared/live-state.mjs, WHILE_LOCKED). */}
            <div className="kx-menu-h" title="Com as telas travadas o console prepara normalmente; nada novo vai ao ar. Tela preta, Logo, Limpar e Esc continuam valendo.">
                <span className="kx-section">Travar telas</span><span style={{ flex: 1 }} />
                <Seg small label="Travar telas" value={locked ? "on" : "off"} onChange={(v) => onLock?.(v === "on")} options={[["off", "Destravadas"], ["on", "Travadas"]]} />
            </div>
            <div className="kx-menu-sep" />
            <div style={{ display: "flex", gap: "var(--space-1)", padding: "0 var(--space-1) var(--space-1)" }}>
                <Btn kind="outline" onClick={() => setOpen("verificar")} title="A lista de prontidão antes do culto: saídas, mídia, fontes, Bíblia, internet">Verificar tudo</Btn>
                {/* Owner 2026-11-08 (mockup I1 = A): each open output shows, for
                    3 s, its screen's number (or "Janela") and its name. */}
                {onIdentify && <Btn kind="outline" onClick={onIdentify} title="Mostra em cada saída aberta o número da tela e o nome da saída">Identificar saídas</Btn>}
                <span style={{ flex: 1 }} />
                <Btn onClick={() => { setOpen(null); onSettings?.("telas"); }}>Telas e saídas</Btn>
            </div>
        </div>
    );
}

// The (+) at the end of a trimmable tab row (open: "tabs:panel" or
// "tabs:lib"): every tab with its check mark, as Ver lists the modules.
// A click checks or unchecks and the list stays open; the last tab checked
// cannot go. Under the (+), its right edge on the button's — its left edge
// near the window's left (the Biblioteca), above it when the window has no
// room below (the panel beside the Prévia is low): usePlaced, Menu.jsx.
// The Biblioteca's also says what the songs' second line shows (`songLine`:
// { artist, key, length }, layout.libShowArtist/Key/Length; Rodada G1).
const SONG_LINE = [["artist", "Mostrar o artista"], ["key", "Mostrar o tom"], ["length", "Mostrar a duração"]];
// `group`: the tab on screen in folders (null = it has none, the Avisos;
// Rodada R, R4a = B), the same switch as the search row's folder button.
export function TabsMenu({ open, list, onToggle, onRestore, onClose, songLine = null, onSongLine, group = null, onGroup }) {
    const row = open?.startsWith("tabs:") ? open.slice(5) : null;
    const known = Boolean(row && PANEL_TABS[row]);
    const pop = useRef(null);
    const plus = useRef(null);
    plus.current = known ? document.querySelector(`.console [data-tabs-plus="${row}"]`) : null;
    usePlaced(pop, plus, { open: known && Boolean(plus.current) });
    if (!known) return null;
    const style = plus.current ? { width: 240 } : { right: 8, top: "var(--pop-top)", width: 240 };
    return (
        <MenuList key={row} listRef={pop} className="pop kx-pop tabs-menu" style={style} label={TABS_MENU_TITLE[row]} closeOnPick={false} onClose={onClose} items={[
            { head: TABS_MENU_TITLE[row] },
            ...tabsMenu(row, list).map((t) => ({
                label: <span className="tabs-menu-t">{t.name}{t.hint && <span className="kx-meta"> {t.hint}</span>}</span>, role: "menuitemcheckbox", checked: t.checked,
                title: t.last ? "Pelo menos uma aba fica à vista" : undefined, ariaDisabled: t.last, onSelect: () => onToggle(row, t.id),
            })),
            "sep",
            ...(row === "lib" && group != null && onGroup ? [
                { label: "Agrupar em pastas", role: "menuitemcheckbox", checked: group, onSelect: () => onGroup(!group) },
                "sep",
            ] : []),
            ...(row === "lib" && songLine && onSongLine ? [
                { head: "Nas letras" },
                ...SONG_LINE.map(([k, label]) => ({ label, role: "menuitemcheckbox", checked: Boolean(songLine[k]), onSelect: () => onSongLine(k, !songLine[k]) })),
                "sep",
            ] : []),
            { label: "Restaurar abas padrão", onSelect: () => onRestore(row) },
        ]} />
    );
}

// "Esteve no ar": the live state's history, back through the Prévia.
// Above `anchor` (the Programa's pill, a DOMRect), its right edge on the
// anchor's and never past the window; under the top bar without one.
export function History({ open, setOpen, history, onPick, anchor = null }) {
    if (open !== "hist") return null;
    const style = anchor
        ? { right: Math.max(8, Math.round(window.innerWidth - anchor.right)), bottom: Math.round(window.innerHeight - anchor.top + 6), maxHeight: Math.max(160, Math.round(anchor.top - 12)), overflow: "auto", width: 300 }
        : { left: 6, top: "var(--pop-top)", width: 300 };
    return (
        <MenuList className="pop kx-pop hist-pop" style={style} label="Voltar ao anterior" closeOnPick={false} onClose={() => setOpen(null)} items={[
            { node: <div key="h" className="kx-menu-h"><span className="kx-section">Voltar ao anterior</span><span style={{ flex: 1 }} /><span className="kx-meta">escolha para pôr na prévia</span></div> },
            ...(!history.length ? [{ node: <div key="none" className="kx-menu-h"><span className="kx-meta">Nada ainda.</span></div> }] : []),
            ...history.map((h) => ({
                label: `${h.title || h.layer}${h.layer === "content" && h.data.slides?.length > 1 ? ` · slide ${h.data.index + 1}` : ""}`,
                kbd: new Date(h.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
                onSelect: () => { onPick(stageFromHistory(h, restoreArgs)); setOpen(null); },
            })),
        ]} />
    );
}

// Encerrar takes everything off the main projector: it asks first. Tela preta
// is the immediate emergency action and never asks.
export function EndDialog({ open, setOpen, onEnd }) {
    const goRef = useRef(null);
    const blackKey = keyHint("black", usePrefs().letter_keys);
    useEffect(() => { if (open === "encerrar") setTimeout(() => goRef.current?.focus(), 0); }, [open]);
    // Tab stays here; back to the pill's button after a keyboard open (C-12).
    const boxRef = useRef(null);
    useDialogFocus(boxRef, open === "encerrar");
    if (open !== "encerrar") return null;
    return (
        <div ref={boxRef} className="dialog" role="alertdialog" aria-modal="true" aria-label="Encerrar a projeção" aria-describedby="end-dialog-text">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>Encerrar a projeção?</div>
            <div id="end-dialog-text">Texto, mídia, avisos e a música do player saem agora. Fundo, logo e sobreposições ficam.</div>
            <div style={{ color: "var(--fg-2)" }}>Para esconder tudo na hora sem encerrar, use Tela preta{blackKey ? ` (${blackKey})` : ""}.</div>
            <div className="acts">
                <button ref={goRef} type="button" className="kx-btn kx-btn-air kx-t" onClick={() => { onEnd(); setOpen(null); }}>Encerrar</button>
                <Btn onClick={() => setOpen(null)}>Cancelar</Btn>
            </div>
        </div>
    );
}

// The search, the palette (`/`; owner 2026-11-09, mockup "Console · busca
// (/)": P1 = B — no preview pane —, P2 to P5 = A). Everything by name, and
// the commands: matched without case or accents and ranked
// (src/lib/console/paletteSearch.js, tested); the kinds as chips with their
// counts (Tab walks them; Backspace on an empty field goes back to Tudo);
// before typing what was on air and what comes next in the Setlist; a word
// that is not a reference shows its first verses of the Bíblia here, "Ver
// as N na Bíblia" opening its Buscar (in the Bíblia, "Buscar … na Bíblia"
// stays first). Enter puts the row in the Prévia (the row says what its
// Enter does), Ctrl+Enter sends it on air, Shift+Enter adds it to the
// Setlist (songs, references, media, Escola materials). A reference with
// verses from the console goes to the Prévia without leaving it; a chapter
// alone, or the palette opened in the Bíblia, opens it there. It opens
// centred over the console, on the dimmed scrim, as a combobox: the field
// keeps the focus, ↑/↓ walk the options (round), the mouse picks too.
// Every button inside takes no Tab (the keys do it all from the field).

export function Palette({ open, setOpen, data, items, history = [], airItemId = null, commands = [], bibleVersion = "", onPrepare, onSend, onAddStage, onAddSong, openReference, onPrepareReference, onSendReference, onAddReference, onBibleSearch, env, style }) {
    const [q, setQ] = useState("");
    const [scope, setScope] = useState("all");
    const [idx, setIdx] = useState(0);
    const [hits, setHits] = useState(null);
    const inputRef = useRef(null);
    const listRef = useRef(null);
    const boxRef = useRef(null);
    const listId = useId();
    const isOpen = open === "palette";
    useEffect(() => { if (isOpen) { setQ(""); setScope("all"); setIdx(0); setHits(null); setTimeout(() => inputRef.current?.focus(), 0); } }, [isOpen]);
    useDialogFocus(boxRef, isOpen);
    const typed = q.trim();
    // "Jo 3:16", or the quick jump's "jo 3 16".
    const ref = typed ? referenceFrom(q) : null;
    const words = Boolean(!ref && onBibleSearch && fold(typed).length >= 3);
    // The Bíblia's words, a moment after typing stops (the installed edition
    // in use; none installed or the preview: the "Buscar" row alone).
    useEffect(() => {
        if (!isOpen || !words) { setHits(null); return undefined; }
        let gone = false;
        const t = setTimeout(async () => {
            try { const r = await searchBible(typed, bibleVersion, { limit: SCOPE_LIMIT }); if (!gone) setHits(r && !r.short ? { q: typed, ...r } : null); }
            catch { if (!gone) setHits(null); }
        }, 250);
        return () => { gone = true; clearTimeout(t); };
    }, [isOpen, words, typed, bibleVersion]);
    // The option chosen stays in view.
    useEffect(() => {
        const box = listRef.current;
        const el = box?.querySelector(`[data-pal-i="${idx}"]`);
        if (!box || !el) return;
        if (el.offsetTop < box.scrollTop) box.scrollTop = el.offsetTop - 28;
        else if (el.offsetTop + el.offsetHeight > box.scrollTop + box.clientHeight) box.scrollTop = el.offsetTop + el.offsetHeight - box.clientHeight;
    }, [idx, scope, q]);
    if (!isOpen) return null;

    const inBible = env === "biblia";
    const toSetlist = (st) => (onAddStage && stageItem(st) ? () => onAddStage(st) : null);
    // Each kind's rows, whole and ranked (an empty field: in data order).
    const rank = (list, fields) => (typed ? ranked(list, q, fields) : list);
    const songs = rank(data.songs, (s) => [s.title, s.artist]).map((s) => {
        const st = () => stageFromSong(s, {}, data.themes);
        return { key: `s${s.id}`, icon: "music", title: s.title, meta: [s.artist, s.song_key].filter(Boolean).join(" · "), pick: () => onPrepare(st()), send: onSend ? () => onSend(st()) : null, add: onAddSong ? () => onAddSong(s) : null };
    });
    const media = rank(data.media, (m) => [m.title, m.category]).map((m) => {
        const st = stageFromMedia(m);
        return { key: `m${m.id}`, icon: mediaIcon(m), title: m.title, meta: MEDIA_WORD[m.type] || m.type, pick: () => onPrepare(st), send: onSend ? () => onSend(st) : null, add: toSetlist(st) };
    });
    const pieces = rank(data.pieces, (p) => [p.title || p.text, p.text]).map((p) => {
        const st = stageFromPiece(p);
        return { key: `p${p.id}`, icon: "megaphone", title: p.title || p.text, meta: "Aviso", pick: () => onPrepare(st), send: onSend ? () => onSend(st) : null };
    });
    const school = rank(data.materials || [], (m) => [m.title, m.subject, m.class_name]).map((m) => {
        const st = stageFromMaterial(m);
        return { key: `e${m.id}`, icon: materialIcon(m.type), title: m.title, meta: [m.subject, materialMeta(m)].filter(Boolean).join(" · "), pick: () => onPrepare(st), send: onSend ? () => onSend(st) : null, add: toSetlist(st) };
    });
    const setlist = rank(items, (it) => [it.title]).map((it) => {
        const i = items.indexOf(it);
        return { key: `l${it.id}`, icon: "list", title: it.title, meta: `Item ${i + 1} da setlist`, pick: () => onPrepare(it, i), send: onSend ? () => onSend(it, i) : null };
    });
    const cmds = rank(commands, (c) => [c.label, c.meta]).map((c) => ({ key: `c${c.id}`, icon: c.icon, title: c.label, meta: c.meta, kbd: c.kbd, act: "Fazer", pick: c.run }));
    // The Bíblia: a reference (here: the Prévia, on air or the Setlist; in the
    // Bíblia or a chapter alone: open it there), else the words.
    const here = Boolean(ref?.verseStart && !inBible && onPrepareReference);
    const verseRow = (r, extra) => ({
        icon: "book", ...extra,
        pick: here ? () => onPrepareReference(r) : () => openReference(r),
        act: here ? undefined : "Abrir",
        send: here && onSendReference ? () => onSendReference(r) : null,
        add: here && onAddReference ? () => onAddReference(r) : null,
    });
    let bible = [];
    let bibleTotal = 0;
    if (ref) {
        bible = here
            ? [verseRow(ref, { key: "ref", title: formatReference(ref), meta: "O capítulo vai, parado neste versículo: as setas seguem dali" }),
                { key: "open", icon: "external", title: "Abrir na Bíblia", meta: formatReference(ref), act: "Abrir", pick: () => openReference(ref) }]
            : [verseRow(ref, { key: "ref", title: formatReference(ref), meta: ref.verseStart ? "Abrir na Bíblia · pôr os versículos na prévia" : "Abrir o capítulo na Bíblia" })];
        bibleTotal = bible.length;
    } else if (words) {
        const find = { key: "find", icon: "search", title: `Buscar “${typed}” na Bíblia`, meta: hits?.q === typed ? (hits.total ? `Todos os versículos na ${hits.version}` : `Nenhum versículo na ${hits.version} · a busca da Bíblia mostra por quê`) : "Busca por palavra na Bíblia instalada", act: "Buscar", pick: () => onBibleSearch(typed) };
        const found = hits?.q === typed ? hits.verses.map((v) => {
            const r = { book: v.book, chapter: v.chapter, verseStart: v.verse, verseEnd: v.verse };
            return verseRow(r, { key: `v${v.book}${v.chapter}:${v.verse}`, title: `${v.book} ${v.chapter}:${v.verse}`, meta: v.text, metaMarks: true });
        }) : [];
        // In the Bíblia its Buscar is the full list: first. In the console
        // the verses first, the rest behind "Ver as N na Bíblia".
        // No verse has the words (searched): nothing to offer in the console.
        const none = hits?.q === typed && !hits.total;
        bible = inBible ? [find, ...found] : found.length ? found : none ? [] : [find];
        bibleTotal = bible.length + (found.length ? Math.max(0, hits.total - found.length) : 0);
    }
    const bibleSection = { id: "bible", rows: bible, total: bibleTotal, limit: inBible || !hits ? undefined : (bible.length - (hits?.verses?.length || 0)) + BIBLE_HITS, note: hits?.q === typed && hits.total ? `${hits.total} ${hits.total === 1 ? "versículo" : "versículos"} · ${hits.version}` : "" };
    const byId = { songs, media, pieces, school, setlist, commands: cmds };
    const sections = sectionOrder({ bibleFirst: inBible || here }).map((id) => (id === "bible" ? bibleSection : { id, rows: byId[id] }));

    // Before typing, in Tudo (P2): what was on air, what comes next.
    let view;
    if (!typed && scope === "all") {
        const recent = recentEntries(history).map((h) => {
            const st = stageFromHistory(h, restoreArgs);
            return { key: `h${h.at}`, icon: KIND_ICON[st.kind] || HISTORY_ICON[h.layer] || "history", title: h.title, meta: KIND_WORD[st.kind] || LAYER_WORD[h.layer] || "Esteve no ar", right: agoWords(h.at), pick: () => onPrepare(st), send: onSend ? () => onSend(st) : null };
        });
        const next = nextEntries(items, airItemId).map(({ it, i }) => ({ key: `n${it.id}`, icon: "list", title: `${i + 1} · ${it.title}`, meta: "Setlist", pick: () => onPrepare(it, i), send: onSend ? () => onSend(it, i) : null }));
        view = paletteGroups([{ id: "recent", name: "Recentes", note: "esteve no ar", rows: recent }, { id: "next", name: "Próximos na setlist", rows: next }], "all");
    } else view = paletteGroups(sections, scope);
    const { groups, flat } = view;
    const at = Math.min(idx, Math.max(0, flat.length - 1));
    const sel = flat[at] || null;

    const run = (i, mode = "pick") => {
        const r = flat[i];
        if (!r) return;
        const fn = mode === "send" ? r.send : mode === "add" ? r.add : r.pick;
        if (!fn) return;
        setOpen(null);
        fn();
    };
    const toScope = (s) => { setScope(s); setIdx(0); inputRef.current?.focus(); };
    const onKey = (e) => {
        if (e.key === "Escape") setOpen(null);
        else if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); setIdx(stepIndex(at, e.key === "ArrowDown" ? 1 : -1, flat.length)); }
        else if (e.key === "Enter") { e.preventDefault(); run(at, e.ctrlKey || e.metaKey ? "send" : e.shiftKey ? "add" : "pick"); }
        else if (e.key === "Tab") { e.preventDefault(); toScope(nextScope(scope, e.shiftKey ? -1 : 1, sectionCounts(sections), Boolean(typed))); }
        else if (e.key === "Backspace" && !q && scope !== "all") { e.preventDefault(); toScope("all"); }
        e.stopPropagation();
    };
    const chipCounts = typed ? sectionCounts(sections) : {};
    const scopeName = SCOPES.find((s) => s.id === scope)?.label;
    let n = -1;
    return (
        <div ref={boxRef} className="palette" style={style} role="dialog" aria-modal="true" aria-label="Buscar em tudo">
            <div className="kx-field kx-t pal-field">
                <Icon name="search" />
                {scope !== "all" && <span className="pal-scope">{scopeName}</span>}
                <input ref={inputRef} value={q} onChange={(e) => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey} spellCheck={false}
                    placeholder={scope === "all" ? "Músicas, versículos (Jo 3:16), mídia, avisos, Escola bíblica, setlist, comandos" : `Buscar em ${scopeName}`}
                    role="combobox" aria-label="Buscar em tudo" aria-expanded="true" aria-controls={listId} aria-autocomplete="list" aria-activedescendant={sel ? `${listId}-${at}` : undefined} />
                {ref && <span className="pal-as">= {formatReference(ref)}</span>}
                <kbd>Esc</kbd>
            </div>
            <div className="pal-chips" role="toolbar" aria-label="Tipos">
                {SCOPES.map((s) => {
                    const c = s.id === "all" ? null : chipCounts[s.id];
                    return (
                        <button key={s.id} type="button" tabIndex={-1} className={`pal-chip kx-t ${scope === s.id ? "is-on" : ""} ${typed && c === 0 ? "is-none" : ""}`} aria-pressed={scope === s.id} onClick={() => toScope(s.id)}>
                            {s.label}{c != null && typed ? <span className="pal-n">{c}</span> : null}
                        </button>
                    );
                })}
            </div>
            <div className="pal-res" ref={listRef} id={listId} role="listbox" aria-label="Resultados">
                {groups.map((g) => (
                    <div key={g.id} role="group" aria-label={g.name}>
                        <div className="kx-menu-h" aria-hidden="true"><span className="kx-section">{g.name}</span>{(g.note || (g.id === "bible" && bibleSection.note)) && <span className="kx-meta">{g.id === "bible" ? bibleSection.note : g.note}</span>}</div>
                        {g.list.map((r) => {
                            n += 1;
                            const i = n;
                            const on = i === at;
                            return (
                                <div key={r.key} id={`${listId}-${i}`} data-pal-i={i} role="option" aria-selected={on} className={`kx-row kx-t pal-opt ${on ? "is-selected" : ""}`}
                                    onMouseMove={() => { if (!on) setIdx(i); }} onClick={() => run(i)} onDoubleClick={() => run(i, "send")}>
                                    <span className="kx-glyph"><Icon name={r.icon} /></span>
                                    <div className="kx-row-main">
                                        <div className="kx-row-title">{typed ? <Marked text={r.title} q={q} /> : r.title}</div>
                                        {r.meta && <div className="kx-row-meta">{r.metaMarks ? <Marked text={r.meta} q={q} /> : r.meta}</div>}
                                    </div>
                                    {r.kbd && <kbd className="pal-key">{r.kbd}</kbd>}
                                    {r.right && <span className="pal-right">{r.right}</span>}
                                    {on && <span className="pal-hint" aria-hidden="true"><kbd>↵</kbd>{enterWord(r)}</span>}
                                    {on && (r.send || r.add) && (
                                        <span className="pal-acts">
                                            {r.send && <Btn tabIndex={-1} onClick={(e) => { e.stopPropagation(); run(i, "send"); }} title="Enviar ao ar · Ctrl+Enter" aria-label={`Enviar ao ar: ${r.title}`}><span className="kx-act-i"><Icon name="send" /></span><span className="kx-act-l">Enviar ao ar</span></Btn>}
                                            {r.add && <Btn tabIndex={-1} onClick={(e) => { e.stopPropagation(); run(i, "add"); }} title="Adicionar à setlist · Shift+Enter" aria-label={`Adicionar ${r.title} à setlist`}><span className="kx-act-i"><Icon name="plus" /></span><span className="kx-act-l">Adicionar à setlist</span></Btn>}
                                        </span>
                                    )}
                                    <span className="kx-sr">{on ? `, Enter: ${enterWord(r)}${r.send ? ", Ctrl+Enter: enviar ao ar" : ""}${r.add ? ", Shift+Enter: adicionar à setlist" : ""}` : ""}</span>
                                </div>
                            );
                        })}
                        {g.more > 0 && (g.id === "bible"
                            ? <button type="button" tabIndex={-1} className="pal-more kx-t" onClick={() => { setOpen(null); onBibleSearch(typed); }}>Ver {hits?.total > 1 ? `os ${hits.total}` : "todos"} na Bíblia</button>
                            : <button type="button" tabIndex={-1} className="pal-more kx-t" onClick={() => toScope(g.id)}>Ver mais {g.more}</button>)}
                    </div>
                ))}
                {!flat.length && <Empty title={typed ? `Nada com "${typed}"${scope !== "all" ? ` em ${scopeName}` : ""}` : "Digite para buscar"}>{typed ? (scope !== "all" ? "Tab passa para outro tipo; Backspace volta a Tudo." : "Tente um título, um trecho, uma referência como Jo 3:16 ou um comando.") : "Músicas, versículos, mídia, avisos, Escola bíblica, setlist e comandos."}</Empty>}
            </div>
            <div className="pal-foot" aria-hidden="true">
                <span><kbd>↑ ↓</kbd> escolher</span>
                {sel && <span><kbd>↵</kbd> {enterWord(sel).toLowerCase()}</span>}
                {sel?.send && <span><kbd>Ctrl ↵</kbd> enviar ao ar</span>}
                {sel?.add && <span><kbd>⇧ ↵</kbd> setlist</span>}
                <span><kbd>Tab</kbd> tipo</span>
                <span><kbd>Esc</kbd> fechar</span>
            </div>
        </div>
    );
}

const MEDIA_WORD = { video: "Vídeo", image: "Imagem", audio: "Áudio", pdf: "Apresentação (PDF)", powerpoint: "PowerPoint", youtube: "YouTube", gif: "GIF" };
const LAYER_WORD = { media: "Mídia", video: "Vídeo", audio: "Áudio", communication: "Aviso", tool: "Ferramenta" };
const KIND_WORD = { lyrics: "Letra", bible: "Bíblia", text: "Texto", presentation: "Apresentação", activity: "Escola bíblica" };
const KIND_ICON = { lyrics: "music", bible: "book", text: "text", presentation: "presentation" };
const HISTORY_ICON = { content: "text", media: "media", video: "film", audio: "volume", communication: "megaphone", tool: "clock" };
const sectionCounts = (sections) => Object.fromEntries(sections.map((s) => [s.id, s.total ?? s.rows.length]));

// A title or a verse with the words found in bold.
function Marked({ text, q }) {
    return markParts(text, q).map((p, i) => (p.hit ? <b key={i} className="pal-mark">{p.text}</b> : <React.Fragment key={i}>{p.text}</React.Fragment>));
}

// The update popup: the download's progress, live (the main process pushes
// it), then a restart to install. With nothing on air it restarts by itself
// after a short countdown the operator can cancel; with something on air it
// only installs on an explicit click. "Agora não" closes it and the download
// goes on in the background (the bell and the menu say when it is ready).
// Novidades: after an update, every version's notes since the one this
// computer had (or, from the menu, every version up to this one), newest
// first. Closing it says it was seen (no popup at the next launch).
export function WhatsNew({ open, setOpen, range, onSeen }) {
    if (open !== "novidades") return null;
    // Without the app's version (the browser preview): every note shipped.
    if (!range?.to) range = { from: null, all: true, to: versionsBetween(RELEASE_NOTES, { to: "9999", all: true })[0]?.version || "0" };
    const list = versionsBetween(RELEASE_NOTES, range);
    const close = () => { setOpen(null); onSeen?.(); };
    return (
        <div className="dialog wn" role="dialog" aria-label="Novidades do KERYX">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>{range.from ? `O KERYX foi atualizado para a versão ${range.to}` : `Novidades do KERYX`}</div>
            <div className="wn-body">
                {!list.length && <span className="kx-meta">Esta versão ({range.to}) não tem notas.</span>}
                {list.map(({ version, md }) => (
                    <section key={version} className="wn-ver">
                        {list.length > 1 && <div className="wn-v">Versão {version}</div>}
                        {parseNotes(md).map((b, i) => {
                            const text = b.parts.map((p, k) => (p.bold ? <b key={k}>{p.text}</b> : <React.Fragment key={k}>{p.text}</React.Fragment>));
                            if (b.type === "h") return <div key={i} className="wn-h">{text}</div>;
                            if (b.type === "li") return <div key={i} className="wn-li">{text}</div>;
                            return <p key={i} className="wn-p">{text}</p>;
                        })}
                    </section>
                ))}
            </div>
            <div className="acts"><Btn kind="brand" onClick={close}>Entendi</Btn></div>
        </div>
    );
}

export function UpdateDialog({ open, setOpen, update, live, call, onDismiss }) {
    const [count, setCount] = useState(null);
    const [stopped, setStopped] = useState(false);
    const [installing, setInstalling] = useState(false);
    const ready = canInstallNow({ update, live });
    const visible = open === "update" && Boolean(update);
    useEffect(() => { if (!visible) { setCount(null); setStopped(false); setInstalling(false); } }, [visible]);
    useEffect(() => {
        if (!visible || !ready || stopped || installing) { setCount(null); return undefined; }
        setCount(5);
        const id = setInterval(() => setCount((n) => (n === null ? null : n - 1)), 1000);
        return () => clearInterval(id);
    }, [visible, ready, stopped, installing]);
    // If KERYX is still here after a while, the restart did not happen: say so.
    const install = () => {
        setInstalling(true);
        call("updateInstall").catch(() => setInstalling(false));
        setTimeout(() => setInstalling(false), 20000);
    };
    useEffect(() => { if (count === 0) install(); }, [count]); // eslint-disable-line react-hooks/exhaustive-deps
    if (!visible) return null;
    const { title, line } = phaseOf(update);
    const pct = update.status === "downloaded" ? 100 : update.status === "downloading" ? update.percent || 0 : 0;
    const busy = update.status === "available" || (update.status === "downloading" && !update.total);
    const close = () => { setOpen(null); onDismiss?.(); };
    return (
        <div className="dialog upd" role="dialog" aria-label="Atualização do KERYX">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>{installing ? "Reiniciando o KERYX…" : title}</div>
            <div className={`upd-bar ${busy ? "is-busy" : ""} ${update.status === "error" ? "is-error" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
                <b style={busy ? undefined : { transform: `scaleX(${pct / 100})` }} />
            </div>
            <div className="upd-line"><span>{installing ? "As telas voltam sozinhas quando ele abrir." : line}</span>{update.status === "downloading" && <span className="kx-meta">{pct}%</span>}</div>
            {update.notes && !installing && (
                <div className="upd-notes">
                    <div className="kx-section">Novidades</div>
                    <div className="upd-notes-t">{update.notes}</div>
                </div>
            )}
            {update.status === "downloaded" && !installing && onAir(live) && (
                <div className="kx-warn">Há algo no ar. Instalar agora apaga as telas por uns 30 segundos: prefira depois do culto.</div>
            )}
            {count !== null && !installing && <div style={{ color: "var(--fg-2)" }}>Reiniciando em {count} s…</div>}
            <div className="acts">
                {!installing && <Btn onClick={close}>{update.status === "downloaded" ? "Depois" : "Agora não"}</Btn>}
                {count !== null && !installing && <Btn onClick={() => setStopped(true)}>Cancelar</Btn>}
                {update.status === "error" && <Btn kind="outline" onClick={() => call("updateDownload").catch(() => {})}>Tentar de novo</Btn>}
                {update.status === "downloaded" && !installing && count === null && (
                    <button type="button" className={`kx-btn kx-t ${onAir(live) ? "kx-btn-air" : "kx-btn-brand"}`} onClick={install}>{onAir(live) ? "Instalar mesmo assim" : "Instalar e reiniciar"}</button>
                )}
            </div>
        </div>
    );
}

const NOTE_ICON = { update: "download", warn: "warn", info: "check", pedido: "music", youtube: "youtube" };
// "settings:dados" is what older versions saved (the section is Backup now).
const ACTION_LABEL = { update: "Atualizar agora", whatsnew: "Ver novidades", "settings:backup": "Abrir Backup", "settings:dados": "Abrir Backup", "settings:sincronizacao": "Abrir Sincronização", "painel:pedidos": "Ver o pedido" };
// A YouTube download's note opens the Mídia on its file (media:<id>).
const actionLabel = (act) => ACTION_LABEL[act] || (act?.startsWith("media:") ? "Abrir na Mídia" : null);

// The bell's list: newest first, each with what can be done about it.
export function Notifications({ open, setOpen, notes, update, onAction, onDismiss, onClear }) {
    // The bell's own wrapper: since Rodada Q (S9) Ver sits in a .tb-bell too,
    // and the first .tb-bell put the popover under Ver.
    const anchor = useAnchor(".topbar .tb-notifs", 360, open === "notifs");
    const box = useFocusFirst(open === "notifs");
    if (open !== "notifs") return null;
    const when = (at) => new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return (
        <div ref={box} className="pop kx-pop notifs" style={{ left: anchor?.left ?? 6, top: "var(--pop-top)", width: anchor?.width ?? 360, maxHeight: "calc(100vh - var(--pop-top) - 16px)", overflow: "auto" }} role="dialog" aria-label="Notificações">
            <div className="kx-menu-h"><span className="kx-section">Notificações</span><span style={{ flex: 1 }} />{notes.length > 0 && <Btn small onClick={onClear}>Limpar</Btn>}</div>
            {!notes.length && <div className="kx-menu-h"><span className="kx-meta">Nada por aqui. Atualizações, pedidos da equipe, downloads e avisos de backup aparecem aqui.</span></div>}
            {notes.map((n) => {
                const act = n.action === "update" ? (hasUpdate(update) ? "update" : null) : n.action;
                return (
                    <div key={n.id} className={`note ${n.read ? "" : "is-new"} is-${n.kind}`}>
                        <Icon name={NOTE_ICON[n.kind] || "dot"} />
                        <div className="note-b">
                            <div className="note-t">{n.title}</div>
                            {n.body && <div className="note-d">{n.body}</div>}
                            <div className="note-f">
                                <span className="kx-meta">{when(n.at)}</span>
                                {actionLabel(act) && <Btn small kind="outline" onClick={() => { setOpen(null); onAction(act); }}>{actionLabel(act)}</Btn>}
                            </div>
                        </div>
                        <button type="button" className="kx-btn kx-btn-icon kx-t note-x" title="Dispensar" aria-label="Dispensar" onClick={() => onDismiss(n.id)}><Icon name="x" /></button>
                    </div>
                );
            })}
        </div>
    );
}
