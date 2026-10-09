import React, { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { Btn, MenuItem, Row, Field, Empty, Seg } from "./kx";
import { MODULES } from "@/lib/console/layout";
import { restoreArgs } from "@/lib/projection";
import { stageFromHistory, stageFromSong, stageFromMedia, stageFromPiece, stageFromMaterial } from "@/lib/console/stage";
import { materialIcon, materialMeta } from "@/lib/console/school";
import { parseReference, formatReference } from "@/lib/bibleBooks";
import { hasUpdate, canInstallNow, onAir, phaseOf } from "@/lib/console/updates";

const OUTPUT_ICON = { "/Projection": "projector", "/StageView": "monitor", "/VideoProjection": "tv", "/LyricProjection": "tv", "/PastorView": "tablet", "/BibleMaterialProjection": "monitor", "/CommunicationProjection": "tv" };
const DEVICE_ICON = { projector: "projector", tv: "tv", tablet: "tablet", pc: "monitor" };

// The KERYX menu: pages that stay outside the console, the service picker,
// Ver (modules) and the layout reset.
export function Menu({ open, setOpen, services, serviceId, setServiceId, layout, setLayout, restoreLayout, onSettings, onPlanner, onMedia, onNotices, onNewNotice, onSchool, onReports, update, onUpdateNow }) {
    if (open !== "menu" && open !== "ver" && open !== "cultos") return null;
    if (open === "ver") {
        return (
            <div className="pop kx-pop" style={{ left: "var(--gutter)", top: "var(--pop-top)", width: 220 }}>
                <div className="kx-menu-h"><span className="kx-section">Ver</span></div>
                {MODULES.map(([key, name]) => (
                    <MenuItem key={key} checked={!layout.hidden[key]} onClick={() => setLayout({ ...layout, hidden: { ...layout.hidden, [key]: !layout.hidden[key] } })}>{name}</MenuItem>
                ))}
                <div className="kx-menu-sep" />
                <MenuItem onClick={() => { restoreLayout(); setOpen(null); }}>Restaurar layout</MenuItem>
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
                <MenuItem icon="list" onClick={() => { setOpen(null); onPlanner?.(serviceId); }}>Planejar o culto…</MenuItem>
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
            <MenuItem icon="monitor" onClick={() => setOpen("outs")}>Telas e saídas</MenuItem>
            <MenuItem icon="check" onClick={() => setOpen("verificar")}>Verificar tudo</MenuItem>
            <MenuItem icon="layers" onClick={() => setOpen("ver")}>Ver<span className="kx-kbd"><Icon name="chevron-right" /></span></MenuItem>
            <MenuItem icon="keyboard" onClick={() => setOpen("atalhos")}>Atalhos<span className="kx-kbd">?</span></MenuItem>
            <MenuItem icon="sliders" onClick={() => { setOpen(null); onSettings?.("telas"); }}>Configurações</MenuItem>
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
    const keys = [
        ["Ctrl+Enter", "Enviar a Prévia ao ar (de qualquer lugar)"],
        ["Enter", "Enviar ao ar (depois de clicar numa música ou versículo)"],
        ["2 cliques", "Enviar o item ao ar na hora (biblioteca, setlist, slides, versículos)"],
        ["← →", "Slide ou versículo anterior / próximo no ar"],
        ["Espaço", "Tocar / pausar"],
        ["B", "Tela preta (na hora)"],
        ["L", "Mostrar logo"],
        ["C", "Limpar texto"],
        ["Esc", "Tirar tudo do ar na hora (Voltar ao anterior desfaz) ou fechar o que está aberto"],
        ["Letra", "Na Bíblia: digitar a referência (ex.: jo 3 16)"],
        ["/", "Buscar em tudo"],
        ["?", "Esta lista"],
    ];
    return (
        <div className="dialog">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>Atalhos</div>
            <div style={{ display: "grid", gridTemplateColumns: "96px 1fr", gap: "4px 12px" }}>
                {keys.map(([k, d]) => <React.Fragment key={k}><span className="kx-kbd" style={{ color: "var(--fg-1)" }}>{k}</span><span style={{ color: "var(--fg-2)" }}>{d}</span></React.Fragment>)}
            </div>
            <div className="acts"><Btn onClick={() => setOpen(null)}>Fechar</Btn></div>
        </div>
    );
}

const atTime = (t) => new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

// Saídas: the windows the main process places and the screens on the
// network, each with its state, what it shows and the way to fix it
// (src/lib/console/outputs.js says which is which).
export function Outputs({ open, setOpen, health, isLive, onOpen, onClose, onForget, tries, idle, onIdle, onSettings }) {
    if (open !== "outs") return null;
    const view = (r) => {
        const icon = r.local ? OUTPUT_ICON[r.key] || "monitor" : DEVICE_ICON[r.kind] || "tv";
        if (r.state === "reconnecting") return { icon, cls: "is-warn", state: `Reconectando… tentativa ${tries}`, dot: "var(--warn)" };
        if (r.state === "closed") return { icon, cls: "is-warn", state: `Fechada às ${atTime(r.droppedAt)}`, dot: "var(--warn)" };
        if (r.state === "disconnected") return { icon, cls: "is-warn", state: `Desconectada às ${atTime(r.droppedAt)}`, dot: "var(--warn)" };
        if (r.state === "unused") return { icon, cls: "is-off", state: "Fechada", dot: "var(--fg-3)" };
        return isLive ? { icon, cls: "", state: "Conectada", dot: "var(--prev)" } : { icon, cls: "is-rh", state: "Desarmada", dot: "var(--rh)" };
    };
    const rows = health.rows;
    const summary = !isLive ? "desarmadas · mantêm o que já estava no ar" : health.total ? `${health.connected} de ${health.total} conectadas` : "nenhuma aberta";
    return (
        <div className="pop kx-pop" style={{ right: 130, top: "var(--pop-top)", width: 440, maxHeight: "calc(100vh - var(--pop-top) - 16px)", overflow: "auto" }}>
            <div className="kx-menu-h"><span className="kx-section">Saídas</span><span style={{ flex: 1 }} /><span className={`kx-meta ${isLive && !health.connected ? "kx-warn" : ""}`}>{summary}</span></div>
            {rows.map((r) => {
                const v = view(r);
                return (
                    <div key={r.id} className={`kx-out is-tall ${v.cls}`}>
                        <span className="kx-glyph"><Icon name={v.icon} /></span>
                        <div style={{ minWidth: 0 }}>
                            <div className="kx-out-name">{r.name}</div>
                            <div className="kx-out-meta">{r.meta}</div>
                            {r.shows && <div className="kx-out-meta" style={{ color: "var(--fg-2)" }}>Mostra: {r.shows}</div>}
                            {r.state === "disconnected" && <div className="kx-out-meta">A tela volta sozinha quando a rede voltar.</div>}
                        </div>
                        <span className="kx-out-st" style={{ gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
                            <i className="kx-dot" style={{ background: v.dot }} />{v.state}
                            {/* Outputs have no taskbar button: "Trazer para a frente" is how to see one again. */}
                            {r.local && (r.state === "connected" || r.state === "reconnecting") && <><Btn small onClick={() => onOpen(r.key)} title="Mostrar esta saída por cima das outras janelas">Trazer para a frente</Btn><Btn small onClick={() => onClose(r.key)}>Fechar</Btn></>}
                            {r.local && r.state === "closed" && <><Btn small kind="outline" onClick={() => onOpen(r.key)}>Reabrir</Btn><Btn small onClick={() => onForget(r.id)} title="Fechada de propósito: não avisar mais">Esquecer</Btn></>}
                            {r.local && r.state === "unused" && <Btn small onClick={() => onOpen(r.key)}>Abrir</Btn>}
                            {!r.local && r.state === "disconnected" && <Btn small onClick={() => onForget(r.id)} title="Não avisar mais sobre esta tela nesta sessão">Esquecer</Btn>}
                        </span>
                    </div>
                );
            })}
            {!rows.length && <Empty icon="monitor" title="Nenhuma saída">No navegador as telas abrem em abas; no computador do culto, em Telas e saídas.</Empty>}
            <div className="kx-menu-sep" />
            <div className="kx-menu-h"><span className="kx-section">Tela ociosa</span><span style={{ flex: 1 }} /><Seg small value={idle} onChange={onIdle} options={[["logo", "Logo da igreja"], ["black", "Preto"]]} /></div>
            <div className="kx-menu-sep" />
            <div style={{ display: "flex", gap: "var(--space-1)", padding: "0 var(--space-1) var(--space-1)" }}>
                <Btn kind="outline" onClick={() => setOpen("verificar")} title="A lista de prontidão antes do culto: saídas, mídia, fontes, Bíblia, internet">Verificar tudo…</Btn>
                <Btn onClick={() => { setOpen(null); onSettings?.("telas"); }}>Telas e saídas…</Btn>
            </div>
        </div>
    );
}

// "Esteve no ar": the live state's history, back through the Prévia.
export function History({ open, setOpen, history, onPick, left }) {
    if (open !== "hist") return null;
    return (
        <div className="pop kx-pop" style={{ left, top: 72, width: 300 }}>
            <div className="kx-menu-h"><span className="kx-section">Esteve no ar</span><span style={{ flex: 1 }} /><span className="kx-meta">escolha para pôr na prévia</span></div>
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
export function EndDialog({ open, setOpen, mode, onEnd }) {
    const isLive = mode === "live";
    const goRef = useRef(null);
    useEffect(() => { if (open === "encerrar") setTimeout(() => goRef.current?.focus(), 0); }, [open]);
    if (open !== "encerrar") return null;
    return (
        <div className="dialog" role="alertdialog" aria-label="Encerrar a projeção">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>Encerrar a projeção?</div>
            <div>{isLive ? "Texto, mídia e avisos saem das telas agora. A música do player, fundo, logo e sobreposições ficam." : "Só o ensaio é encerrado; as telas não mudam."}</div>
            <div style={{ color: "var(--fg-2)" }}>Para esconder tudo na hora sem encerrar, use Tela preta (B).</div>
            <div className="acts">
                <Btn onClick={() => setOpen(null)}>Cancelar</Btn>
                <button ref={goRef} type="button" className="kx-btn kx-btn-air kx-t" onClick={() => { onEnd(); setOpen(null); }}>Encerrar</button>
            </div>
        </div>
    );
}

export function ArmDialog({ open, setOpen, live, onArm }) {
    if (open !== "arm") return null;
    const what = live?.content ? `${live.content.title}${live.content.slides.length > 1 ? `, slide ${live.content.index + 1}` : ""}` : live?.media ? live.media.title : live?.communication ? live.communication.item?.title || "um aviso" : "nada (telas livres)";
    return (
        <div className="dialog">
            <div className="kx-section" style={{ color: "var(--fg-1)" }}>Armar saídas e ir ao vivo?</div>
            <div>O que está no ar <b style={{ fontWeight: 500 }}>continua no ar</b>: {what}.</div>
            <div style={{ color: "var(--fg-2)" }}>Depois de armar, Enviar ao ar muda as telas. O que você ensaiou não é enviado.</div>
            <div className="acts"><Btn onClick={() => setOpen(null)}>Continuar em ensaio</Btn><Btn kind="rh" onClick={() => { onArm(); setOpen(null); }}>Armar saídas</Btn></div>
        </div>
    );
}

// The command palette: everything by name, a reference opens the Bible.
export function Palette({ open, setOpen, data, items, onPrepare, onAddSong, openReference, onBibleSearch, env }) {
    const [q, setQ] = useState("");
    const [idx, setIdx] = useState(0);
    const inputRef = useRef(null);
    useEffect(() => { if (open === "palette") { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 0); } }, [open]);
    if (open !== "palette") return null;
    const ql = q.trim().toLowerCase();
    const has = (...f) => f.some((x) => String(x || "").toLowerCase().includes(ql));
    const groups = [];
    const ref = ql ? parseReference(q.trim()) : null;
    const bible = ref ? [{ icon: "book", title: formatReference(ref), meta: ref.verseStart ? "Abrir na Bíblia · pôr os versículos na prévia" : "Abrir o capítulo na Bíblia", pick: () => openReference(ref) }] : [];
    // Not a reference: the words can still be searched in the Bíblia.
    if (!ref && onBibleSearch && ql.length >= 3) bible.push({ icon: "search", title: `Buscar “${q.trim()}” na Bíblia`, meta: "Busca por palavra na Bíblia instalada", pick: () => onBibleSearch(q.trim()) });
    const rund = (ql ? items.filter((it) => has(it.title)) : []).slice(0, 4).map((it) => ({ icon: "list", title: it.title, meta: "Setlist", pick: () => onPrepare(it, items.indexOf(it)) }));
    const songs = (ql ? data.songs.filter((s) => has(s.title, s.artist)) : data.songs.slice(0, 4)).slice(0, 5).map((s) => ({ icon: "music", title: s.title, meta: [s.artist, s.song_key].filter(Boolean).join(" · "), pick: () => onPrepare(stageFromSong(s)), add: onAddSong ? () => onAddSong(s) : null }));
    const media = (ql ? data.media.filter((m) => has(m.title)) : []).slice(0, 4).map((m) => ({ icon: m.type === "image" ? "image" : "film", title: m.title, meta: m.type, pick: () => onPrepare(stageFromMedia(m)) }));
    const pieces = (ql ? data.pieces.filter((p) => has(p.title, p.text)) : []).slice(0, 4).map((p) => ({ icon: "megaphone", title: p.title || p.text, meta: "Aviso", pick: () => onPrepare(stageFromPiece(p)) }));
    const mats = (ql ? (data.materials || []).filter((m) => has(m.title, m.subject, m.class_name)) : []).slice(0, 4).map((m) => ({ icon: materialIcon(m.type), title: m.title, meta: ["Escola bíblica", m.subject, materialMeta(m)].filter(Boolean).join(" · "), pick: () => onPrepare(stageFromMaterial(m)) }));
    const order = env === "biblia" ? [["Bíblia", bible], ["Músicas", songs], ["Setlist", rund], ["Mídia", media], ["Avisos", pieces], ["Escola bíblica", mats]] : [["Setlist", rund], ["Músicas", songs], ["Bíblia", bible], ["Mídia", media], ["Avisos", pieces], ["Escola bíblica", mats]];
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
        <div className="palette">
            <Field inputRef={inputRef} value={q} onChange={(v) => { setQ(v); setIdx(0); }} placeholder="Músicas, versículos (Jo 3:16), mídia, avisos, itens da setlist" onKeyDown={onKey} kbd="Esc" />
            <div className="res">
                {groups.map((g) => (
                    <React.Fragment key={g.name}>
                        <div className="kx-menu-h"><span className="kx-section">{g.name}</span></div>
                        {g.list.map((r) => { n += 1; const i = n; return (
                            <Row key={`${g.name}${i}`} icon={r.icon} title={r.title} meta={r.meta} state={i === idx ? "is-selected" : ""} onClick={() => run(i, false)} actions={<><Btn onClick={(e) => { e.stopPropagation(); run(i, false); }} title="Pôr na prévia · Enter">Pôr na prévia</Btn>{r.add && <Btn onClick={(e) => { e.stopPropagation(); run(i, true); }} title="Adicionar à setlist · Shift+Enter">Adicionar à setlist</Btn>}</>} />
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
const ACTION_LABEL = { update: "Atualizar agora", "settings:dados": "Abrir Dados" };

// The bell's list: newest first, each with what can be done about it.
export function Notifications({ open, setOpen, notes, update, onAction, onDismiss, onClear }) {
    if (open !== "notifs") return null;
    const when = (at) => new Date(at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
    return (
        <div className="pop kx-pop notifs" style={{ right: 130, top: "var(--pop-top)", width: 360, maxHeight: "calc(100vh - var(--pop-top) - 16px)", overflow: "auto" }} role="dialog" aria-label="Notificações">
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
