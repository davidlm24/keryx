import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Icon from "./Icon";
import { Btn, MenuItem, Row, Field, Empty, Seg } from "./kx";
import { MODULES } from "@/lib/console/layout";
import { restoreArgs } from "@/lib/projection";
import { stageFromHistory, stageFromSong, stageFromMedia, stageFromPiece } from "@/lib/console/stage";
import { parseReference, formatReference } from "@/lib/bibleBooks";

const OUTPUT_ICON = { "/Projection": "projector", "/StageView": "monitor", "/VideoProjection": "tv", "/LyricProjection": "tv", "/PastorView": "tablet", "/BibleMaterialProjection": "monitor", "/CommunicationProjection": "tv" };
const DEVICE_ICON = { projector: "projector", tv: "tv", tablet: "tablet", pc: "monitor" };

// The KERYX menu: pages that stay outside the console, the service picker,
// Ver (modules) and the layout reset.
export function Menu({ open, setOpen, services, serviceId, setServiceId, layout, setLayout, restoreLayout, onSettings }) {
    const navigate = useNavigate();
    if (open !== "menu" && open !== "ver" && open !== "cultos") return null;
    const go = (path) => { setOpen(null); navigate(path); };
    if (open === "ver") {
        return (
            <div className="pop kx-pop" style={{ left: 6, top: 40, width: 220 }}>
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
            <div className="pop kx-pop" style={{ left: 6, top: 40, width: 300, maxHeight: 420, overflow: "auto" }}>
                <div className="kx-menu-h"><span className="kx-section">Culto</span></div>
                {!services.length && <div className="kx-menu-h"><span className="kx-meta">Nenhum culto. Crie um em Cultos.</span></div>}
                {services.slice(0, 20).map((s) => (
                    <MenuItem key={s.id} checked={s.id === serviceId} onClick={() => { setServiceId(s.id); setOpen(null); }}>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                        <span className="kx-kbd">{s.date ? s.date.split("-").reverse().slice(0, 2).join("/") : ""}</span>
                    </MenuItem>
                ))}
                <div className="kx-menu-sep" />
                <MenuItem icon="list" onClick={() => go("/Services")}>Cultos…</MenuItem>
            </div>
        );
    }
    return (
        <div className="pop kx-pop" style={{ left: 6, top: 40, width: 230 }}>
            <MenuItem icon="list" onClick={() => setOpen("cultos")}>Culto<span className="kx-kbd"><Icon name="chevron-right" /></span></MenuItem>
            <MenuItem icon="music" onClick={() => go("/Home")}>Músicas</MenuItem>
            <MenuItem icon="film" onClick={() => go("/Media")}>Mídia</MenuItem>
            <MenuItem icon="megaphone" onClick={() => go("/Communication")}>Comunicação</MenuItem>
            <div className="kx-menu-sep" />
            <MenuItem icon="monitor" onClick={() => setOpen("outs")}>Telas e saídas</MenuItem>
            <MenuItem icon="check" onClick={() => setOpen("verificar")}>Verificar tudo</MenuItem>
            <MenuItem icon="layers" onClick={() => setOpen("ver")}>Ver<span className="kx-kbd"><Icon name="chevron-right" /></span></MenuItem>
            <MenuItem icon="keyboard" onClick={() => setOpen("atalhos")}>Atalhos<span className="kx-kbd">?</span></MenuItem>
            <MenuItem icon="sliders" onClick={() => { setOpen(null); onSettings?.("telas"); }}>Configurações</MenuItem>
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

// Saídas: the windows the main process places and the screens on the network.
export function Outputs({ open, setOpen, outputs, network, isLive, onOpen, onClose, tries, idle, onIdle, onSettings }) {
    if (open !== "outs") return null;
    const local = outputs.map((o) => {
        const bad = o.placement.missing;
        const st = !isLive ? ["is-rh", "Desarmada", "var(--rh)"] : bad ? ["is-warn", `Reconectando… tentativa ${tries}`, "var(--warn)"] : o.open ? ["", "Conectada", "var(--prev)"] : ["is-off", "Fechada", "var(--fg-3)"];
        const meta = bad ? "O monitor escolhido não está ligado · mostrando numa janela" : o.placement.mode === "fullscreen" ? `Tela ${o.placement.displayId ?? ""}`.trim() : "Janela";
        return { key: o.key, name: o.label, icon: OUTPUT_ICON[o.key] || "monitor", meta, cls: st[0], state: st[1], dot: st[2], open: o.open };
    });
    const remote = network.map((d) => ({ key: d.id, name: d.name, icon: DEVICE_ICON[d.kind] || "tv", meta: `Rede · ${d.role}`, cls: d.online ? "" : "is-off", state: d.online ? "Conectada" : "Desconectada", dot: d.online ? "var(--prev)" : "var(--fg-3)", remote: true }));
    const all = [...local, ...remote];
    const okCount = all.filter((o) => o.state === "Conectada").length;
    return (
        <div className="pop kx-pop" style={{ right: 130, top: 40, width: 420, maxHeight: "calc(100vh - 60px)", overflow: "auto" }}>
            <div className="kx-menu-h"><span className="kx-section">Saídas</span><span style={{ flex: 1 }} /><span className="kx-meta">{isLive ? `${okCount} de ${all.length} conectadas` : "desarmadas · mantêm o que já estava no ar"}</span></div>
            {all.map((o) => (
                <div key={o.key} className={`kx-out ${o.cls}`}>
                    <span className="kx-glyph"><Icon name={o.icon} /></span>
                    <div><div className="kx-out-name">{o.name}</div><div className="kx-out-meta">{o.meta}</div></div>
                    <span className="kx-out-st" style={{ gap: 8 }}>
                        <i className="kx-dot" style={{ background: o.dot }} />{o.state}
                        {!o.remote && (o.open ? <Btn small onClick={() => onClose(o.key)}>Fechar</Btn> : <Btn small onClick={() => onOpen(o.key)}>Abrir</Btn>)}
                    </span>
                </div>
            ))}
            {!all.length && <Empty icon="monitor" title="Nenhuma saída">No navegador as telas abrem em abas; no computador do culto, em Telas e saídas.</Empty>}
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
export function Palette({ open, setOpen, data, items, onPrepare, onAddSong, openReference, env }) {
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
    const rund = (ql ? items.filter((it) => has(it.title)) : []).slice(0, 4).map((it) => ({ icon: "list", title: it.title, meta: "Setlist", pick: () => onPrepare(it, items.indexOf(it)) }));
    const songs = (ql ? data.songs.filter((s) => has(s.title, s.artist)) : data.songs.slice(0, 4)).slice(0, 5).map((s) => ({ icon: "music", title: s.title, meta: [s.artist, s.song_key].filter(Boolean).join(" · "), pick: () => onPrepare(stageFromSong(s)), add: onAddSong ? () => onAddSong(s) : null }));
    const media = (ql ? data.media.filter((m) => has(m.title)) : []).slice(0, 4).map((m) => ({ icon: m.type === "image" ? "image" : "film", title: m.title, meta: m.type, pick: () => onPrepare(stageFromMedia(m)) }));
    const pieces = (ql ? data.pieces.filter((p) => has(p.title, p.text)) : []).slice(0, 4).map((p) => ({ icon: "megaphone", title: p.title || p.text, meta: "Aviso", pick: () => onPrepare(stageFromPiece(p)) }));
    const order = env === "biblia" ? [["Bíblia", bible], ["Músicas", songs], ["Setlist", rund], ["Mídia", media], ["Avisos", pieces]] : [["Setlist", rund], ["Músicas", songs], ["Bíblia", bible], ["Mídia", media], ["Avisos", pieces]];
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
