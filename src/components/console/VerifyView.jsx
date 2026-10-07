import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn } from "./kx";
import { installedVersions, forgetInstalledVersions } from "@/lib/bibleText";
import { BIBLE_VERSIONS } from "@/lib/bibleBooks";
import { FONT_MAP } from "@/lib/deviceStyles";

// Verificar: the readiness check before the service. Every line is a real
// check, never a promise: output windows and network screens, every media
// file the rundown uses (a HEAD request to the local media server, which
// answers 404 when the file is gone), the fonts, the Bible versions installed
// for offline use, and what needs the internet. States: Pronto / Atenção / Falta.

const STATE = { ok: ["Pronto", "kx-prev"], warn: ["Atenção", "kx-warn"], miss: ["Falta", "kx-warn"], info: ["—", "kx-meta"] };
const MEDIA_TYPES = ["VIDEO", "IMAGE", "PDF", "POWERPOINT", "AUDIO"];
const isExternal = (url) => /^https?:\/\//.test(url || "") && !/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//.test(url);
const isYouTube = (url) => /youtu\.?be/.test(url || "");

async function fileState(url) {
    if (!url) return "miss";
    if (isExternal(url)) return "net";
    try {
        const res = await fetch(url, { method: "HEAD", cache: "no-store" });
        return res.ok ? "ok" : "miss";
    } catch {
        return "miss";
    }
}

export default function VerifyView({ c, items, data, outputs, network, onIdentify, onOpenOutput, onGoPresent }) {
    const navigate = useNavigate();
    const [groups, setGroups] = useState(null);
    const [running, setRunning] = useState(false);
    const [confirm, setConfirm] = useState(false);
    const [installing, setInstalling] = useState(null);

    const run = useCallback(async () => {
        setRunning(true);
        const out = [];
        const line = (title, meta, state, action = null, icon = "check") => ({ title, meta, state, action, icon });

        // Saídas: the windows the main process places, then the network screens.
        const outs = outputs.map((o) => {
            if (o.placement.missing) return line(o.label, "O monitor escolhido não está ligado · mostrando numa janela", "warn", { label: "Telas e saídas", run: () => navigate("/Settings") }, "monitor");
            if (!o.open) return line(o.label, "Fechada", o.key === "/Projection" ? "warn" : "info", { label: "Abrir", run: () => onOpenOutput(o.key) }, "monitor");
            return line(o.label, o.placement.mode === "fullscreen" ? `Tela cheia · tela ${o.placement.displayId ?? ""}`.trim() : "Numa janela", "ok", { label: "Identificar", run: onIdentify }, "monitor");
        });
        const nets = network.map((d) => line(d.name, d.online ? "Na rede · respondendo" : `Na rede · sem resposta${d.lastSeen ? ` desde ${new Date(d.lastSeen).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}`, d.online ? "ok" : "warn", null, "tv"));
        if (!outs.length && !nets.length) outs.push(line("Saídas", keryx.isDesktop ? "Nenhuma saída configurada" : "No navegador, as telas abrem em abas", "info", null, "monitor"));
        out.push({ name: "Saídas", lines: [...outs, ...nets] });

        // Mídia do roteiro: files of media items, songs' playback and backgrounds.
        const files = [];
        for (const it of items) {
            const type = String(it.type || "").toUpperCase();
            if (MEDIA_TYPES.includes(type)) {
                const m = data.media.find((x) => x.id === it.contentId);
                files.push({ title: it.title || m?.title || "Mídia", what: m ? "Arquivo" : "Item sem mídia na biblioteca", url: m?.file_url || "" });
            } else if (type === "SONG") {
                const s = data.songs.find((x) => x.id === it.contentId);
                if (s?.audio_url) files.push({ title: s.title, what: "Playback", url: s.audio_url });
                if (s?.background_image && !s.background_image.includes("gradient")) files.push({ title: s.title, what: "Fundo", url: s.background_image });
            }
        }
        const media = [];
        const net = [];
        await Promise.all(files.map(async (f) => {
            const st = await fileState(f.url);
            if (st === "net") net.push(line(f.title, `${f.what} · ${isYouTube(f.url) ? "YouTube" : "na internet"} · precisa de internet durante o culto`, navigator.onLine ? "ok" : "warn", null, "external"));
            else media.push(line(f.title, st === "ok" ? `${f.what} · encontrado` : `${f.what} · Arquivo não encontrado`, st === "ok" ? "ok" : "miss", st === "ok" ? null : { label: "Abrir Mídia", run: () => navigate("/Media") }, "film"));
        }));
        out.push({ name: "Mídia do roteiro", lines: media.length ? media : [line("Nenhum arquivo no roteiro", "Músicas, leituras e avisos não dependem de arquivos", "info", null, "film")] });

        // Fontes: the console's own, and the ones themes ask for.
        const fonts = [];
        await document.fonts.ready.catch(() => {});
        const geist = document.fonts.check("12px Geist");
        fonts.push(line("Geist", geist ? "Fonte do console · carregada" : "Fonte do console · não carregou, usando a do sistema", geist ? "ok" : "warn", null, "text"));
        const families = Array.from(new Set(data.themes.map((t) => t.font_family).filter(Boolean)));
        for (const f of families) {
            const css = FONT_MAP[f];
            const ok = css ? document.fonts.check(`16px ${css}`) : false;
            fonts.push(line(f, css ? (ok ? "Usada por um tema · disponível" : "Usada por um tema · não instalada, usando a padrão") : "Fonte desconhecida · usando a padrão", ok ? "ok" : "warn", null, "text"));
        }
        out.push({ name: "Fontes", lines: fonts });

        // Bíblia: the versions the rundown and the console use, installed for offline use?
        const bible = [];
        if (keryx.isDesktop) {
            forgetInstalledVersions();
            const installed = await installedVersions({ refresh: true }).catch(() => ({}));
            const used = new Set();
            let chosen = "NVI";
            try { chosen = JSON.parse(localStorage.getItem("keryx.console.bible") || "{}").version || "NVI"; } catch { /* default */ }
            used.add(chosen);
            // The version each reading was saved with (BiblePassage.version).
            const passages = await Promise.all(items.filter((it) => String(it.type).toUpperCase() === "BIBLE" && it.contentId)
                .map((it) => keryx.entities.BiblePassage.get(it.contentId).catch(() => null)));
            for (const p of passages) if (p?.version) used.add(p.version);
            for (const v of used) {
                const info = BIBLE_VERSIONS.find((b) => b.id === v);
                const count = installed[v];
                if (count) bible.push(line(v, `Instalada para uso sem internet · ${count.toLocaleString("pt-BR")} versículos`, "ok", null, "book"));
                else if (info?.install) bible.push(line(v, "Não instalada · sem internet, não aparece", "warn", { label: installing === v ? "Instalando…" : "Instalar", run: () => installBible(v) }, "book"));
                else bible.push(line(v, "Só disponível com internet", navigator.onLine ? "warn" : "miss", null, "book"));
            }
        } else {
            bible.push(line("Bíblia", "No navegador, os textos vêm da internet", "info", null, "book"));
        }
        out.push({ name: "Bíblia", lines: bible });

        // Internet: what depends on it, and whether it is there now.
        const online = navigator.onLine;
        out.push({ name: "Internet", lines: [line(online ? "Conectado" : "Sem internet", net.length ? `${net.length} ${net.length === 1 ? "item precisa" : "itens precisam"} de internet` : "Nenhum item do roteiro depende da internet", online || !net.length ? "ok" : "miss", null, online ? "wifi" : "wifi-off"), ...net] });

        setGroups(out);
        setRunning(false);
    }, [items, data, outputs, network, navigate, onIdentify, onOpenOutput, installing]); // eslint-disable-line react-hooks/exhaustive-deps

    const installBible = async (v) => {
        setInstalling(v);
        try {
            const res = await window.keryxDesktop.bible.install(v);
            if (res?.error) throw new Error(res.error.message);
            c.say(`${v} instalada para uso sem internet.`);
        } catch (err) {
            c.say(err?.message || `Não foi possível instalar a ${v}.`);
        }
        setInstalling(null);
    };

    useEffect(() => { run(); }, [items.length, outputs.length, network.length, installing]); // eslint-disable-line react-hooks/exhaustive-deps

    const flat = (groups || []).flatMap((g) => g.lines);
    const bad = flat.filter((l) => l.state === "warn" || l.state === "miss");
    const summary = !groups ? "Verificando…" : bad.length ? `${bad.length} ${bad.length === 1 ? "item precisa" : "itens precisam"} de atenção` : "Tudo pronto";

    return (
        <div className="col center">
            <div className="kx-panel verif">
                <div className="verif-sum">
                    <span className={bad.length ? "kx-warn" : "kx-prev"}><Icon name={bad.length ? "warn" : "check"} /></span>
                    <span className="t">{summary}</span>
                    <span className="kx-meta">{running ? "verificando…" : `${flat.filter((l) => l.state === "ok").length} prontos`}</span>
                    <span style={{ flex: 1 }} />
                    <Btn onClick={run} disabled={running}><Icon name="refresh" />Verificar de novo</Btn>
                    <Btn kind="prev" className="kx-btn-live" onClick={() => (bad.length ? setConfirm(true) : onGoPresent())}>Ir para Apresentar</Btn>
                </div>
                <div className="kx-panel-b">
                    {(groups || []).map((g) => (
                        <React.Fragment key={g.name}>
                            <div className="listhead"><span className="kx-section">{g.name}</span></div>
                            {g.lines.map((l, i) => (
                                <div key={`${g.name}${i}`} className={`kx-row ${l.state === "warn" || l.state === "miss" ? "is-warn" : ""}`}>
                                    <span className="kx-glyph"><Icon name={l.icon} /></span>
                                    <div className="kx-row-main"><div className="kx-row-title">{l.title}</div><div className="kx-row-meta">{l.meta}</div></div>
                                    <span className={`st ${STATE[l.state][1]}`}>{STATE[l.state][0]}</span>
                                    <span className="kx-row-acts" style={{ display: "inline-flex", minWidth: 96, justifyContent: "flex-end" }}>
                                        {l.action && <Btn kind="outline" small onClick={l.action.run} disabled={l.action.label === "Instalando…"}>{l.action.label}</Btn>}
                                    </span>
                                </div>
                            ))}
                        </React.Fragment>
                    ))}
                </div>
            </div>
            {confirm && (
                <>
                    <div className="scrim is-dim" onClick={() => setConfirm(false)} />
                    <div className="dialog" role="alertdialog" aria-label="Ir para Apresentar com avisos">
                        <div className="kx-section" style={{ color: "var(--fg-1)" }}>Ir para Apresentar com avisos?</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            {bad.map((l, i) => <span key={i} className="kx-warn">{l.title} · {l.meta}</span>)}
                        </div>
                        <div style={{ color: "var(--fg-2)" }}>Você pode resolver depois; o culto não depende de todos os itens.</div>
                        <div className="acts"><Btn onClick={() => setConfirm(false)}>Voltar e resolver</Btn><Btn kind="prev" onClick={() => { setConfirm(false); onGoPresent(); }}>Ir para Apresentar</Btn></div>
                    </div>
                </>
            )}
        </div>
    );
}
