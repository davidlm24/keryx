import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { versionsBetween, parseNotes } from "@/lib/console/releaseNotes";
import { RELEASE_NOTES } from "@/lib/console/releaseNotesData";
import ShortcutList from "./ShortcutList";
import Icon from "./Icon";
import { Btn, MenuItem, Row, Field, Empty, Seg } from "./kx";
import { MODULES, DENSITIES, densityOf } from "@/lib/console/layout";
import { PANEL_TABS, TABS_MENU_TITLE, tabsMenu } from "@/lib/console/panelTabs";
import { restoreArgs } from "@/lib/projection";
import { stageFromHistory, stageFromSong, stageFromMedia, stageFromPiece, stageFromMaterial } from "@/lib/console/stage";
import { materialIcon, materialMeta } from "@/lib/console/school";
import { parseReference, formatReference } from "@/lib/bibleBooks";
import { readQuickRef } from "@/lib/console/quickRef";
import { hasUpdate, canInstallNow, onAir, phaseOf } from "@/lib/console/updates";
import { byGroup, rowStatus } from "@/lib/console/outputs";
import { useOutputLooks } from "@/hooks/useOutputPref";
import { Switch } from "./settings/parts";

const DEVICE_ICON = { projector: "projector", tv: "tv", tablet: "tablet", pc: "monitor" };

// The KERYX menu (the logo): every page and the service picker in one list
// (what the menu bar has, for a narrow window where the bar folds away), and
// Ajuda — Atalhos, Novidades, Sobre, Atualizar (O topo, 2026-10-15). Ver is
// the eye beside the bell.
export function Menu({ open, setOpen, services, serviceId, setServiceId, layout, setLayout, restoreLayout, presets = [], presetId = null, presetDirty = false, onPickPreset, editing, onEditLayout, onSettings, onPlanner, onMedia, onNotices, onNewNotice, onSchool, onReports, update, onUpdateNow, onWhatsNew }) {
    if (open !== "menu" && open !== "ver" && open !== "cultos") return null;
    if (open === "ver") {
        return (
            // Under the top bar's Ver button, its right edge on the button's.
            <div className="pop kx-pop" style={{ right: Math.max(8, Math.round(window.innerWidth - (document.querySelector(".topbar .tb-ver")?.getBoundingClientRect().right ?? window.innerWidth - 8))), top: "var(--pop-top)", width: 220 }}>
                <div className="kx-menu-h"><span className="kx-section">Ver</span></div>
                {MODULES.map(([key, name]) => (
                    <MenuItem key={key} checked={!layout.hidden[key]} onClick={() => setLayout({ ...layout, hidden: { ...layout.hidden, [key]: !layout.hidden[key] } })}>{name}</MenuItem>
                ))}
                <div className="kx-menu-sep" />
                <div className="kx-menu-h"><span className="kx-section">Densidade</span></div>
                {DENSITIES.map(([key, name]) => (
                    <MenuItem key={key} checked={densityOf(layout) === key} onClick={() => setLayout({ ...layout, density: key })} title={key === "auto" ? "Compacta numa tela baixa (notebook), Confortável nas outras" : key === "comfortable" ? "Linhas de 32 px, títulos em até duas linhas" : "Linhas de 28 px, uma linha por item"}>{name}</MenuItem>
                ))}
                <div className="kx-menu-sep" />
                {/* Named arrangements (dockPresets.js): Padrão and the operator's. */}
                <div className="kx-menu-h"><span className="kx-section">Disposição</span></div>
                {[{ id: null, name: "Padrão" }, ...presets].map((p) => (
                    <MenuItem key={p.id || "padrao"} checked={presetId === p.id} onClick={() => onPickPreset?.(p.id)}
                        title={p.id ? `Trocar para a disposição “${p.name}”` : "A disposição de fábrica do console"}>
                        {p.name}{presetId === p.id && presetDirty ? " · alterada" : ""}
                    </MenuItem>
                ))}
                <div className="kx-menu-sep" />
                <MenuItem icon="grip" checked={editing} onClick={onEditLayout} title="Mudar os módulos de lugar, salvar disposições com nome · Esc conclui">{editing ? "Concluir a edição" : "Editar disposição"}</MenuItem>
                <MenuItem onClick={() => { restoreLayout(); setOpen(null); }}>Restaurar disposição</MenuItem>
                <MenuItem icon="keyboard" kbd="?" onClick={() => setOpen("atalhos")}>Atalhos do teclado</MenuItem>
            </div>
        );
    }
    if (open === "cultos") {
        return (
            <div className="pop kx-pop" style={{ left: "var(--gutter)", top: "var(--pop-top)", width: 300, maxHeight: 420, overflow: "auto" }}>
                <div className="kx-menu-h"><span className="kx-section">Culto</span></div>
                {!services.length && <div className="kx-menu-h"><span className="kx-meta">Nenhum culto ainda.</span></div>}
                {services.slice(0, 20).map((s) => (
                    <MenuItem key={s.id} checked={s.id === serviceId} onClick={() => { setServiceId(s.id); setOpen(null); }}>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                        <span className="kx-kbd">{s.date ? s.date.split("-").reverse().slice(0, 2).join("/") : ""}</span>
                    </MenuItem>
                ))}
                <div className="kx-menu-sep" />
                <MenuItem icon="list" onClick={() => { setOpen(null); onPlanner?.(serviceId); }}>Planejar o culto</MenuItem>
                <MenuItem icon="plus" onClick={() => { setOpen(null); onPlanner?.("new"); }}>Novo culto</MenuItem>
            </div>
        );
    }
    return (
        <div className="pop kx-pop" style={{ left: "var(--gutter)", top: "var(--pop-top)", width: 230 }}>
            <MenuItem icon="list" onClick={() => setOpen("cultos")}>Culto<span className="kx-kbd"><Icon name="chevron-right" /></span></MenuItem>
            <MenuItem icon="list" onClick={() => { setOpen(null); onPlanner?.(serviceId); }}>Planejar o culto</MenuItem>
            <MenuItem icon="film" onClick={() => { setOpen(null); onMedia?.(); }}>Biblioteca de mídia</MenuItem>
            <MenuItem icon="megaphone" onClick={() => { setOpen(null); onNotices?.(); }}>Avisos</MenuItem>
            <MenuItem icon="plus" onClick={() => { setOpen(null); onNewNotice?.(); }}>Novo aviso</MenuItem>
            <MenuItem icon="book" onClick={() => { setOpen(null); onSchool?.(); }}>Escola bíblica</MenuItem>
            <MenuItem icon="history" onClick={() => { setOpen(null); onReports?.(); }}>Relatórios</MenuItem>
            <div className="kx-menu-sep" />
            <MenuItem icon="monitor" onClick={() => setOpen("outs")}>Saídas</MenuItem>
            <MenuItem icon="check" onClick={() => setOpen("verificar")}>Verificar tudo</MenuItem>
            <MenuItem icon="keyboard" onClick={() => setOpen("atalhos")}>Atalhos<span className="kx-kbd">?</span></MenuItem>
            <MenuItem icon="star" onClick={() => onWhatsNew?.()}>Novidades</MenuItem>
            <MenuItem icon="sliders" onClick={() => { setOpen(null); onSettings?.("telas"); }}>Configurações</MenuItem>
            <MenuItem icon="info" onClick={() => { setOpen(null); onSettings?.("sobre"); }}>Sobre o KERYX…</MenuItem>
            {hasUpdate(update) && (
                <MenuItem icon="download" onClick={() => onUpdateNow?.()}>
                    <span style={{ flex: 1 }}>{update.status === "downloading" ? "Atualizando…" : "Atualizar agora"}</span>
                    <span className="kx-kbd">{update.status === "downloading" ? `${update.percent}%` : update.version}</span>
                </MenuItem>
            )}
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
function useAnchor(selector, width, active) {
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

const TONE_DOT = { ok: "var(--prev)", rh: "var(--rh)", warn: "var(--warn)", off: "var(--fg-3)" };
const TONE_CLS = { ok: "", rh: "is-rh", warn: "is-warn", off: "is-off" };

export function Outputs({ open, setOpen, health, locked, onLock, onOpen, onClose, onForget, removed = [], onRestore, idle, onIdle, onSettings }) {
    const look = useOutputLooks();
    const anchor = useAnchor(".topbar .kx-status", 440, open === "outs");
    if (open !== "outs") return null;
    const rows = health.rows;
    const summary = health.total ? `${health.connected} de ${health.total} conectadas${locked ? " · travadas" : ""}` : "nenhuma aberta";
    return (
        <div className="pop kx-pop pop-outs" style={{ left: anchor?.left ?? 6, top: "var(--pop-top)", width: anchor?.width ?? 440, maxHeight: "calc(100vh - var(--pop-top) - 16px)", overflow: "auto" }}>
            <div className="kx-menu-h"><span className="kx-section" style={{ color: "var(--fg-1)" }}>Saídas</span><span style={{ flex: 1 }} /><span className={`kx-meta ${!health.connected ? "kx-warn" : ""}`}>{summary}</span></div>
            {byGroup(rows, (r) => (r.local ? r.key : r.screen)).map((g) => (
                <React.Fragment key={g.key}>
                <div className="kx-menu-h out-group"><span className="kx-section">{g.label}</span></div>
                {g.items.map((r) => {
                const st = rowStatus(r, { locked });
                const icon = r.local ? look(r.key).icon : r.screen ? look(r.screen).icon : DEVICE_ICON[r.kind] || "tv";
                return (
                    // One switch per local row: ligado = a janela existe. The
                    // name of an open output brings it forward (outputs have
                    // no taskbar button). Network rows have no switch: the
                    // console cannot reopen a tablet.
                    <div key={r.id} className={`kx-out is-tall ${r.local ? "has-sw" : ""} ${TONE_CLS[st.tone]}`}>
                        {r.local && <Switch on={Boolean(st.switchOn)} onChange={(on) => (on ? onOpen(r.key) : onClose(r.key))} label={`${st.switchOn ? "Fechar" : "Abrir"} ${r.name}`} />}
                        <span className="kx-glyph"><Icon name={icon} /></span>
                        <div style={{ minWidth: 0 }}>
                            {r.local && st.switchOn
                                ? <button type="button" className="kx-t kx-out-name kx-out-front" title={`Mostrar ${r.name} por cima das outras janelas`} onClick={() => onOpen(r.key)}>{r.name}</button>
                                : <div className="kx-out-name">{r.name}</div>}
                            <div className="kx-out-meta">{r.meta}</div>
                            {r.shows && <div className="kx-out-meta" style={{ color: "var(--fg-2)" }}>Mostra: {r.shows}</div>}
                            {st.hint && <div className="kx-out-meta">{st.hint}</div>}
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
                    <span className="kx-section">Transmissão</span><span className="kx-meta" style={{ flex: 1, minWidth: 0 }}>· legenda para a live no OBS</span>
                    <Btn small onClick={() => { setOpen(null); onSettings?.("rede"); }}>Endereço…</Btn>
                </div>
            )}
            {!rows.length && <Empty icon="monitor" title="Nenhuma saída">No navegador as telas abrem em abas; no computador do culto, em Telas e saídas.</Empty>}
            <div className="kx-menu-sep" />
            {/* Travar telas: rehearse with the screens frozen (shared/live-state.mjs, WHILE_LOCKED). */}
            <div className="kx-menu-h" title="Com as telas travadas o console prepara normalmente; nada novo vai ao ar. Tela preta, Logo, Limpar e Esc continuam valendo.">
                <span className="kx-section">Travar telas</span><span style={{ flex: 1 }} />
                <Seg small label="Travar telas" value={locked ? "on" : "off"} onChange={(v) => onLock?.(v === "on")} options={[["off", "Destravadas"], ["on", "Travadas"]]} />
            </div>
            <div className="kx-menu-h"><span className="kx-section">Tela ociosa</span><span style={{ flex: 1 }} />
                {/* Logo or Preto when nothing is on air and there is no Fundo; a
                    picture for those moments is the papel de parede. */}
                <Seg small label="Tela ociosa" value={idle === "black" ? "black" : "logo"} onChange={(m) => onIdle(m)}
                    options={[["logo", "Logo da igreja"], ["black", "Preto"]]} />
            </div>
            <div className="kx-menu-sep" />
            <div style={{ display: "flex", gap: "var(--space-1)", padding: "0 var(--space-1) var(--space-1)" }}>
                <Btn kind="outline" onClick={() => setOpen("verificar")} title="A lista de prontidão antes do culto: saídas, mídia, fontes, Bíblia, internet">Verificar tudo…</Btn>
                <Btn onClick={() => { setOpen(null); onSettings?.("telas"); }}>Telas e saídas…</Btn>
            </div>
        </div>
    );
}

// The (+) at the end of a trimmable tab row (open: "tabs:panel" or
// "tabs:lib"): every tab with its check mark, as Ver lists the modules.
// A click checks or unchecks and the list stays open; the last tab checked
// cannot go. Under the (+), its right edge on the button's — above it when
// the window has no room below (the panel beside the Prévia is low).
export function TabsMenu({ open, list, onToggle, onRestore }) {
    const row = open?.startsWith("tabs:") ? open.slice(5) : null;
    if (!row || !PANEL_TABS[row]) return null;
    const plus = document.querySelector(`.console [data-tabs-plus="${row}"]`)?.getBoundingClientRect();
    const tall = (PANEL_TABS[row].length + 2) * 32 + 24;
    const below = !plus || plus.bottom + 4 + tall <= window.innerHeight - 8;
    const style = !plus ? { right: 8, top: "var(--pop-top)", width: 240 }
        : below ? { right: Math.max(8, Math.round(window.innerWidth - plus.right)), top: Math.round(plus.bottom + 4), width: 240 }
            : { right: Math.max(8, Math.round(window.innerWidth - plus.right)), bottom: Math.round(window.innerHeight - plus.top + 4), width: 240 };
    return (
        <div className="pop kx-pop tabs-menu" style={style} role="menu" aria-label={TABS_MENU_TITLE[row]}>
            <div className="kx-menu-h"><span className="kx-section">{TABS_MENU_TITLE[row]}</span></div>
            {tabsMenu(row, list).map((t) => (
                <MenuItem key={t.id} role="menuitemcheckbox" aria-checked={t.checked} checked={t.checked} onClick={() => onToggle(row, t.id)}
                    title={t.last ? "Pelo menos uma aba fica à vista" : undefined} aria-disabled={t.last || undefined}>
                    <span className="tabs-menu-t">{t.name}{t.hint && <span className="kx-meta"> {t.hint}</span>}</span>
                </MenuItem>
            ))}
            <div className="kx-menu-sep" />
            <MenuItem onClick={() => onRestore(row)}>Restaurar abas padrão</MenuItem>
        </div>
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
        <div className="pop kx-pop hist-pop" style={style}>
            <div className="kx-menu-h"><span className="kx-section">Voltar ao anterior</span><span style={{ flex: 1 }} /><span className="kx-meta">escolha para pôr na prévia</span></div>
            {!history.length && <div className="kx-menu-h"><span className="kx-meta">Nada ainda.</span></div>}
            {history.map((h) => (
                <MenuItem key={h.at} onClick={() => { onPick(stageFromHistory(h, restoreArgs)); setOpen(null); }}>
                    <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.title || h.layer}{h.layer === "content" && h.data.slides?.length > 1 ? ` · slide ${h.data.index + 1}` : ""}</span>
                    <span className="kx-kbd">{new Date(h.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </MenuItem>
            ))}
        </div>
    );
}

// Encerrar takes everything off the main projector: it asks first. Tela preta
// is the immediate emergency action and never asks.
export function EndDialog({ open, setOpen, onEnd }) {
    const goRef = useRef(null);
    useEffect(() => { if (open === "encerrar") setTimeout(() => goRef.current?.focus(), 0); }, [open]);
    if (open !== "encerrar") return null;
    return (
        <div className="dialog" role="alertdialog" aria-label="Encerrar a projeção">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>Encerrar a projeção?</div>
            <div>Texto, mídia e avisos saem das telas agora. A música do player, fundo, logo e sobreposições ficam.</div>
            <div style={{ color: "var(--fg-2)" }}>Para esconder tudo na hora sem encerrar, use Tela preta (B).</div>
            <div className="acts">
                <Btn onClick={() => setOpen(null)}>Cancelar</Btn>
                <button ref={goRef} type="button" className="kx-btn kx-btn-air kx-t" onClick={() => { onEnd(); setOpen(null); }}>Encerrar</button>
            </div>
        </div>
    );
}

const quickReference = (text) => {
    const r = readQuickRef(text);
    return r.valid && r.book && r.chapter ? { book: r.book.name, chapter: r.chapter, verseStart: r.verseStart, verseEnd: r.verseEnd ?? r.verseStart } : null;
};

// The command palette: everything by name. Opened from the KERYX
// environment, a reference with verses goes to the Prévia right here (one
// verse: its chapter from there) and Shift+Enter adds it to the Setlist;
// "Abrir na Bíblia" is the row below it. A chapter alone, or the palette
// opened in the Bíblia, opens the reference there. It opens centred over the
// console, on the dimmed scrim (owner decision 2026-10-11).
export function Palette({ open, setOpen, data, items, onPrepare, onAddSong, openReference, onPrepareReference, onAddReference, onBibleSearch, env, style }) {
    const [q, setQ] = useState("");
    const [idx, setIdx] = useState(0);
    const inputRef = useRef(null);
    useEffect(() => { if (open === "palette") { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
    if (open !== "palette") return null;
    const ql = q.trim().toLowerCase();
    const has = (...f) => f.some((x) => String(x || "").toLowerCase().includes(ql));
    const groups = [];
    // "Jo 3:16", or the quick jump's "jo 3 16".
    const ref = ql ? parseReference(q.trim()) || quickReference(q) : null;
    const here = Boolean(ref?.verseStart && env !== "biblia" && onPrepareReference);
    const bible = !ref ? []
        : here ? [
            { icon: "book", title: formatReference(ref), meta: "Na prévia, sem sair do console · Shift+Enter adiciona à setlist", pick: () => onPrepareReference(ref), add: onAddReference ? () => onAddReference(ref) : null },
            { icon: "external", title: "Abrir na Bíblia", meta: formatReference(ref), act: "Abrir", pick: () => openReference(ref) },
        ]
        : [{ icon: "book", title: formatReference(ref), meta: ref.verseStart ? "Abrir na Bíblia · pôr os versículos na prévia" : "Abrir o capítulo na Bíblia", act: "Abrir", pick: () => openReference(ref) }];
    // Not a reference: the words can still be searched in the Bíblia.
    if (!ref && onBibleSearch && ql.length >= 3) bible.push({ icon: "search", title: `Buscar “${q.trim()}” na Bíblia`, meta: "Busca por palavra na Bíblia instalada", act: "Buscar", pick: () => onBibleSearch(q.trim()) });
    const rund = (ql ? items.filter((it) => has(it.title)) : []).slice(0, 4).map((it) => ({ icon: "list", title: it.title, meta: "Setlist", pick: () => onPrepare(it, items.indexOf(it)) }));
    const songs = (ql ? data.songs.filter((s) => has(s.title, s.artist)) : data.songs.slice(0, 4)).slice(0, 5).map((s) => ({ icon: "music", title: s.title, meta: [s.artist, s.song_key].filter(Boolean).join(" · "), pick: () => onPrepare(stageFromSong(s, {}, data.themes)), add: onAddSong ? () => onAddSong(s) : null }));
    const media = (ql ? data.media.filter((m) => has(m.title)) : []).slice(0, 4).map((m) => ({ icon: m.type === "image" ? "image" : "film", title: m.title, meta: m.type, pick: () => onPrepare(stageFromMedia(m)) }));
    const pieces = (ql ? data.pieces.filter((p) => has(p.title, p.text)) : []).slice(0, 4).map((p) => ({ icon: "megaphone", title: p.title || p.text, meta: "Aviso", pick: () => onPrepare(stageFromPiece(p)) }));
    const mats = (ql ? (data.materials || []).filter((m) => has(m.title, m.subject, m.class_name)) : []).slice(0, 4).map((m) => ({ icon: materialIcon(m.type), title: m.title, meta: ["Escola bíblica", m.subject, materialMeta(m)].filter(Boolean).join(" · "), pick: () => onPrepare(stageFromMaterial(m)) }));
    // A reference typed in the KERYX environment is what the operator wants: first.
    const order = env === "biblia" || here ? [["Bíblia", bible], ["Músicas", songs], ["Setlist", rund], ["Mídia", media], ["Avisos", pieces], ["Escola bíblica", mats]] : [["Setlist", rund], ["Músicas", songs], ["Bíblia", bible], ["Mídia", media], ["Avisos", pieces], ["Escola bíblica", mats]];
    for (const [name, list] of order) if (list.length) groups.push({ name, list });
    const flat = groups.flatMap((g) => g.list);
    const run = (i, add) => { const r = flat[i]; if (!r) return; setOpen(null); if (add && r.add) r.add(); else r.pick(); };
    const onKey = (e) => {
        if (e.key === "Escape") { setOpen(null); }
        else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(flat.length - 1, i + 1)); }
        else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
        else if (e.key === "Enter") { e.preventDefault(); run(idx, e.shiftKey); }
        e.stopPropagation();
    };
    let n = -1;
    return (
        <div className="palette" style={style}>
            <Field inputRef={inputRef} value={q} onChange={(v) => { setQ(v); setIdx(0); }} placeholder="Músicas, versículos (Jo 3:16), mídia, avisos, itens da setlist" onKeyDown={onKey} kbd="Esc" />
            <div className="res">
                {groups.map((g) => (
                    <React.Fragment key={g.name}>
                        <div className="kx-menu-h"><span className="kx-section">{g.name}</span></div>
                        {g.list.map((r) => { n += 1; const i = n; return (
                            <Row key={`${g.name}${i}`} icon={r.icon} title={r.title} meta={r.meta} state={i === idx ? "is-selected" : ""} onClick={() => run(i, false)} actions={<><Btn onClick={(e) => { e.stopPropagation(); run(i, false); }} title={`${r.act || "Pôr na prévia"} · Enter`} aria-label={`${r.act || "Pôr na prévia"}: ${r.title}`}>{r.act || "Pôr na prévia"}</Btn>{r.add && <Btn onClick={(e) => { e.stopPropagation(); run(i, true); }} title="Adicionar à setlist · Shift+Enter" aria-label={`Adicionar ${r.title} à setlist`}>Adicionar à setlist</Btn>}</>} />
                        ); })}
                    </React.Fragment>
                ))}
                {!flat.length && <Empty title={ql ? `Nada com "${q}"` : "Digite para buscar"}>{ql ? "Tente um título, um trecho ou uma referência como Jo 3:16." : "Músicas, versículos, mídia, avisos e itens da setlist."}</Empty>}
            </div>
        </div>
    );
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

const NOTE_ICON = { update: "download", warn: "warn", info: "check" };
// "settings:dados" is what older versions saved (the section is Backup now).
const ACTION_LABEL = { update: "Atualizar agora", whatsnew: "Ver novidades", "settings:backup": "Abrir Backup", "settings:dados": "Abrir Backup", "settings:sincronizacao": "Abrir Sincronização" };

// The bell's list: newest first, each with what can be done about it.
export function Notifications({ open, setOpen, notes, update, onAction, onDismiss, onClear }) {
    const anchor = useAnchor(".topbar .tb-bell", 360, open === "notifs");
    if (open !== "notifs") return null;
    const when = (at) => new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return (
        <div className="pop kx-pop notifs" style={{ left: anchor?.left ?? 6, top: "var(--pop-top)", width: anchor?.width ?? 360, maxHeight: "calc(100vh - var(--pop-top) - 16px)", overflow: "auto" }} role="dialog" aria-label="Notificações">
            <div className="kx-menu-h"><span className="kx-section">Notificações</span><span style={{ flex: 1 }} />{notes.length > 0 && <Btn small onClick={onClear}>Limpar</Btn>}</div>
            {!notes.length && <div className="kx-menu-h"><span className="kx-meta">Nada por aqui. Atualizações e avisos de backup aparecem aqui.</span></div>}
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
                                {act && ACTION_LABEL[act] && <Btn small kind="outline" onClick={() => { setOpen(null); onAction(act); }}>{ACTION_LABEL[act]}</Btn>}
                            </div>
                        </div>
                        <button type="button" className="kx-btn kx-btn-icon kx-t note-x" title="Dispensar" aria-label="Dispensar" onClick={() => onDismiss(n.id)}><Icon name="x" /></button>
                    </div>
                );
            })}
        </div>
    );
}
