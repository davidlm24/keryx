import React, { useEffect, useMemo, useRef, useState } from "react";
import { usePrefs } from "@/hooks/useUser";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty, WinBar, useUnloadGuard } from "./kx";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { NOTICE_TYPES, newNotice, noticeLabel } from "@/lib/console/notice";
import { parseDuration, formatDuration } from "@/lib/songImport";
import BgChip from "./library/BgChip";
import { FONT_MAP } from "@/lib/deviceStyles";
import { stageFromPiece } from "@/lib/console/stage";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { useWinCol } from "./winLayout";

const SIZES = [["small", "P"], ["medium", "M"], ["large", "G"], ["xlarge", "GG"], ["xxlarge", "XG"]];
const FONTS = [["sans", "Sem serifa"], ["serif", "Serifa"], ["georgia", "Georgia"], ["times", "Times"], ["arial", "Arial"], ["verdana", "Verdana"], ["mono", "Monoespaçada"], ["cursive", "Cursiva"]];
const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["outline", "Contorno"], ["3d", "3D"], ["neon", "Neon"], ["none", "Nenhum"]];
const LOGO = [["none", "Sem"], ["top-left", "Alto esq."], ["top-right", "Alto dir."], ["bottom-left", "Baixo esq."], ["bottom-right", "Baixo dir."]];
const FIELDS = ["type", "title", "text", "subtext", "duration", "text_color", "text_color_2", "font_size", "font_family", "text_effect", "text_position_h", "text_position_v", "show_logo", "logo_position", "sound_alert", "background_image", "background_color", "background_video", "background_audio", "files"];
const pickFields = (row) => Object.fromEntries(FIELDS.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));

// The aviso editor (canvas artboard "Editor de aviso"), a view inside the
// console: the kind, the texts and length, the look (size, font, colour,
// effect, position), the logo corner, the alert chime, the background
// (a bundled photo, a colour, an image, a video, audio, or a loop of files)
// and a live 16:9 preview drawn by ScreenRenderer, so it is the screen.
// Saving changes the library only; "Pôr na prévia do console" prepares it.
export default function NoticeEditor({ c, noticeId, logoUrl, media, onClose, onSaved, escRef, active = true }) {
    // The columns a splitter resizes, kept per page on this computer (Rodada D3).
    const colAviso = useWinCol("notice.ajustes", { name: "Ajustes", def: 420, min: 340, max: 720 });
    const chimeOn = usePrefs().chime_on;
    const isNew = noticeId === "new";
    const [draft, setDraft] = useState(() => (isNew ? newNotice("countdown") : null));
    const [saved, setSaved] = useState(() => (isNew ? null : undefined));
    const [error, setError] = useState("");
    const [durText, setDurText] = useState(isNew ? formatDuration(300) : "");
    const [startedAt, setStartedAt] = useState(() => keryx.live.now());
    const [pick, setPick] = useState(null); // "video" | "audio" | "files"
    const ask = useConfirm();
    const [busy, setBusy] = useState(false);
    const fileRef = useRef(null);
    const fileKind = useRef(null);

    useEffect(() => {
        if (isNew) return undefined;
        let alive = true;
        keryx.entities.CommunicationVideo.get(noticeId)
            .then((row) => { if (!alive) return; const d = { ...newNotice(row.type || "announcement"), ...pickFields(row), files: row.files || [] }; setDraft(d); setSaved(row); setDurText(formatDuration(d.duration) || "0:00"); })
            .catch((err) => { if (alive) setError(err?.message || "Aviso não encontrado."); });
        return () => { alive = false; };
    }, [noticeId, isNew]);

    const dirty = useMemo(() => draft && JSON.stringify(pickFields(draft)) !== JSON.stringify(saved ? { ...pickFields({ ...newNotice(saved.type), ...pickFields(saved), files: saved.files || [] }) } : pickFields(newNotice("countdown"))), [draft, saved]);
    // Detached (/Janela), unsaved changes hold the window: closing it asks.
    useUnloadGuard(dirty);
    const set = (patch) => setDraft((d) => ({ ...d, ...patch }));
    // The preview restarts when the timing changes (kind, length, files).
    useEffect(() => { setStartedAt(keryx.live.now()); }, [draft?.type, draft?.duration, draft?.files?.length]);

    const chooseType = (type) => {
        const fresh = newNotice(type);
        const untouched = !draft.text || NOTICE_TYPES.some(([t]) => newNotice(t).text === draft.text);
        set({ type, ...(untouched ? { text: fresh.text, title: fresh.text, subtext: fresh.subtext, duration: fresh.duration } : {}), ...(type === "attention" ? { sound_alert: true } : {}) });
        if (untouched) setDurText(formatDuration(fresh.duration) || "0:00");
    };
    const payload = () => {
        const d = pickFields(draft);
        const title = (d.text || "").trim() || (d.subtext || "").trim().slice(0, 60) || noticeLabel(d.type);
        return { ...d, title, duration: Math.max(0, Number(d.duration) || 0) };
    };
    const save = async () => {
        setBusy(true);
        try {
            const row = isNew ? await keryx.entities.CommunicationVideo.create(payload()) : await keryx.entities.CommunicationVideo.update(noticeId, payload());
            setSaved(row);
            setDraft((d) => ({ ...d, title: row.title }));
            c.say("Aviso salvo na Biblioteca · Avisos.");
            onSaved?.(row);
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
        setBusy(false);
    };
    const remove = async () => {
        if (!(await ask(deleteQuestion("o aviso", draft.title)))) return;
        try { await keryx.entities.CommunicationVideo.delete(noticeId); c.say("Aviso excluído."); onClose(); } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
    };
    // Leaving with changes asks (Rodada C: the one guard, through the
    // Excluir question's own dialog; Esc answers "continuar").
    const leave = async (all = false) => {
        if (dirty && !(await ask({ title: "Descartar as mudanças?", text: `O aviso "${(draft.text || "").trim() || "Novo aviso"}" tem mudanças não salvas.`, ok: "Descartar" }))) return;
        onClose(all);
    };
    const toPrev = () => { c.setPrev(stageFromPiece({ ...(saved || {}), ...payload(), id: saved?.id || "rascunho" })); c.say("Aviso na Prévia do console. Nada mudou nas telas."); };

    const upload = async (file, apply) => {
        if (!file) return;
        try { const { file_url } = await keryx.integrations.Core.UploadFile({ file }); apply(file_url); } catch (err) { c.say(err?.message || "Não foi possível copiar o arquivo."); }
    };
    const fromComputer = (kind) => {
        fileKind.current = kind;
        if (!fileRef.current) return;
        fileRef.current.accept = kind === "audio" ? "audio/*" : kind === "video" ? "video/*" : "image/*,video/*";
        fileRef.current.click();
    };
    const fileChosen = (file) => {
        const kind = fileKind.current;
        upload(file, (url) => {
            if (kind === "video") set({ background_video: url, files: [] });
            else if (kind === "audio") set({ background_audio: url });
            else set({ files: [...(draft.files || []), { url, type: file.type.startsWith("video/") ? "video" : "image", duration: 5 }] });
            setPick(null);
        });
    };

    // Esc comes routed from the console (keys.js ESC_ORDER "window", so
    // whatever is open over the editor closes first, and a field's Esc
    // already blurred): close a picker, then leave (asking if there are
    // changes); the (x) leaves the whole window the same way. Ctrl+S saves
    // — the editor's own key; it defers to a dialog over the editor (its
    // own scrim does not count) and sleeps while another page covers this.
    if (escRef) escRef.current = (mode) => { if (mode === "esc" && pick) setPick(null); else leave(mode === "all"); };
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (!((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") || !active) return;
        if (document.querySelector(".console .scrim:not(.win-scrim)")) return;
        e.preventDefault(); e.stopPropagation();
        if (draft) save();
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    if (error) return <><WinBar title="Aviso" /><div className="win-body"><div className="col center"><Panel noHead><Empty icon="warn" title="Não foi possível abrir">{error}</Empty><div className="pl-pad"><Btn onClick={() => onClose()}>Fechar</Btn></div></Panel></div></div></>;
    if (!draft) return <><WinBar title="Aviso" /><div className="win-body"><div className="col center"><Panel noHead><Empty title="Abrindo…" /></Panel></div></div></>;

    const timed = draft.type === "countdown" || draft.type === "timer";
    const videos = media.filter((m) => m.type === "video" && !/youtu/.test(m.file_url || "") && !m.missing);
    const audios = media.filter((m) => m.type === "audio" && !m.missing);
    const pictures = media.filter((m) => (m.type === "image" || m.type === "gif" || (m.type === "video" && !/youtu/.test(m.file_url || ""))) && !m.missing);
    const nameOf = (url) => media.find((m) => m.file_url === url)?.title || decodeURIComponent(String(url).split("/").pop() || "arquivo");
    const pickList = pick === "video" ? videos : pick === "audio" ? audios : pick === "files" ? pictures : [];
    const choose = (m) => {
        if (pick === "video") set({ background_video: m.file_url, files: [] });
        else if (pick === "audio") set({ background_audio: m.file_url });
        else set({ files: [...(draft.files || []), { url: m.file_url, type: m.type === "video" ? "video" : "image", duration: m.type === "video" ? (m.duration || 15) : 5 }] });
        setPick(null);
    };
    const preview = { screen: "show", communication: { item: draft, playlist: null, playlistIndex: 0, startedAt } };

    return (
        <>
            <WinBar title="Aviso" sub={`${isNew ? "Novo aviso" : draft.title}${dirty ? " · não salvo" : ""}`} actions={<>
                {!isNew && <Btn small onClick={remove}>Excluir…</Btn>}
                <Btn small onClick={() => leave()}>Cancelar</Btn>
                <Btn small kind="brand" disabled={busy} onClick={save} title="Ctrl+S">Salvar aviso</Btn>
            </>} />
            <div className="win-body">
            <div className="col nv-l" style={colAviso.style}>
                <Panel noHead bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <input ref={fileRef} type="file" hidden onChange={(e) => { fileChosen(e.target.files?.[0]); e.target.value = ""; }} />
                    <div className="nv-scroll">
                        <div className="listhead"><span className="kx-section">Tipo</span></div>
                        {NOTICE_TYPES.map(([t, icon, label]) => <Row key={t} single icon={icon} title={label} className={draft.type === t ? "is-selected" : ""} onClick={() => chooseType(t)} />)}
                        <div className="frm nv-frm">
                            <span className="k">Título</span><Field label="Título" icon={null} value={draft.text || ""} onChange={(v) => set({ text: v })} placeholder={timed ? "Ex.: O culto começa em" : "Ex.: Bem-vindos"} />
                            <span className="k">Texto</span><textarea className="ed-text nv-sub" rows={2} value={draft.subtext || ""} onChange={(e) => set({ subtext: e.target.value })} placeholder="Linha de apoio (opcional)" aria-label="Texto" />
                            <span className="k">Duração</span>
                            <span className="nv-inline">
                                <input className="pl-input pl-dur" value={durText} aria-label="Duração" placeholder="m:ss" onChange={(e) => { setDurText(e.target.value); const s = parseDuration(e.target.value); if (s !== null) set({ duration: s }); }} onBlur={() => setDurText(formatDuration(draft.duration) || "0:00")} />
                                <span className="kx-meta">{draft.type === "countdown" ? "conta até zero" : draft.type === "timer" ? "0:00 = sem limite" : "tempo na tela em Tocar todos"}</span>
                            </span>
                            <span className="k">Canto do logo</span>
                            <Seg small label="Canto do logo" value={draft.show_logo === false ? "none" : draft.logo_position || "top-left"} onChange={(v) => set(v === "none" ? { show_logo: false } : { show_logo: true, logo_position: v })} options={LOGO} />
                            <span className="k">Som de alerta</span>
                            <span className="nv-inline">
                                <button type="button" role="switch" aria-checked={Boolean(draft.sound_alert)} aria-label="Som de alerta" className={`sw2 kx-t ${draft.sound_alert ? "is-on" : ""}`} onClick={() => set({ sound_alert: !draft.sound_alert })} />
                                <span className={draft.sound_alert && !chimeOn ? "kx-warn" : "kx-meta"}>{draft.sound_alert ? (chimeOn ? "Toca um sino curto quando o aviso entra" : "O sino está desligado em Configurações › Telas e saídas") : "Sem som"}</span>
                            </span>
                        </div>

                        <div className="listhead"><span className="kx-section">Texto na tela</span></div>
                        <div className="frm nv-frm">
                            <span className="k">Tamanho</span><Seg small label="Tamanho" value={draft.font_size || "large"} onChange={(v) => set({ font_size: v })} options={SIZES} />
                            <span className="k">Fonte</span>
                            <select className="pl-input" value={draft.font_family || "sans"} onChange={(e) => set({ font_family: e.target.value })} aria-label="Fonte">
                                {FONTS.map(([k, label]) => <option key={k} value={k} style={{ fontFamily: FONT_MAP[k] }}>{label}</option>)}
                            </select>
                            <span className="k">Cor</span>
                            <span className="nv-inline">
                                <input type="color" className="ed-color" value={draft.text_color || "#ffffff"} onChange={(e) => set({ text_color: e.target.value })} aria-label="Cor do texto" />
                                {draft.text_color_2
                                    ? <><input type="color" className="ed-color" value={draft.text_color_2} onChange={(e) => set({ text_color_2: e.target.value })} aria-label="Segunda cor" /><Btn small onClick={() => set({ text_color_2: "" })}>Sem degradê</Btn></>
                                    : <Btn small onClick={() => set({ text_color_2: "#f5b83d" })}>Degradê</Btn>}
                            </span>
                            <span className="k">Efeito</span>
                            <select className="pl-input" value={draft.text_effect || "shadow"} onChange={(e) => set({ text_effect: e.target.value })} aria-label="Efeito do texto">
                                {EFFECTS.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
                            </select>
                            <span className="k">Alinhar</span><Seg small label="Alinhar" value={draft.text_position_h || "center"} onChange={(v) => set({ text_position_h: v })} options={[["left", "Esq."], ["center", "Centro"], ["right", "Dir."]]} />
                            <span className="k">Posição</span><Seg small label="Posição" value={draft.text_position_v || "middle"} onChange={(v) => set({ text_position_v: v })} options={[["top", "Topo"], ["middle", "Meio"], ["bottom", "Base"]]} />
                        </div>

                        <div className="listhead"><span className="kx-section">Fundo</span></div>
                        <div className="nv-pad">
                            {/* A picture or a colour from the library (its Comunicação
                                category among the others); the clip, the audio and
                                the sequence have their own pickers below. */}
                            <div className="nv-inline">
                                <BgChip accept={["image", "color"]} title="Fundo do aviso" empty="nenhum"
                                    value={draft.background_image ? { kind: "image", value: draft.background_image } : /^#[0-9a-f]{6}$/i.test(draft.background_color || "") ? { kind: "color", value: draft.background_color } : null}
                                    noneLabel={draft.background_image || draft.background_color ? "Sem fundo" : undefined}
                                    onPick={(spec) => set(spec?.kind === "image" ? { background_image: spec.value, background_color: "" } : spec?.kind === "color" ? { background_color: spec.value, background_image: "" } : { background_image: "", background_color: "" })} />
                            </div>
                            <div className="nv-media">
                                <Btn small on={pick === "video"} onClick={() => setPick(pick === "video" ? null : "video")}><Icon name="film" />Vídeo de fundo</Btn>
                                <Btn small on={pick === "audio"} onClick={() => setPick(pick === "audio" ? null : "audio")}><Icon name="volume" />Áudio de fundo</Btn>
                                <Btn small on={pick === "files"} onClick={() => setPick(pick === "files" ? null : "files")}><Icon name="layers" />Sequência</Btn>
                            </div>
                            {draft.background_video && <div className="nv-chip"><Icon name="film" /><span>{nameOf(draft.background_video)}</span><IconBtn name="x" small title="Tirar o vídeo" onClick={() => set({ background_video: "" })} /></div>}
                            {draft.background_audio && <div className="nv-chip"><Icon name="volume" /><span>{nameOf(draft.background_audio)}</span><IconBtn name="x" small title="Tirar o áudio" onClick={() => set({ background_audio: "" })} /></div>}
                            {(draft.files || []).map((f, i) => (
                                <div key={`${f.url}${i}`} className="nv-chip">
                                    <Icon name={f.type === "video" ? "film" : "image"} /><span>{i + 1}. {nameOf(f.url)}</span>
                                    {f.type !== "video" && <input className="pl-input nv-secs" value={f.duration || 5} aria-label="Segundos" title="Segundos na tela" onChange={(e) => set({ files: draft.files.map((x, k) => (k === i ? { ...x, duration: Math.max(1, Number(e.target.value) || 5) } : x)) })} />}
                                    <IconBtn name="x" small title="Tirar da sequência" onClick={() => set({ files: draft.files.filter((_, k) => k !== i) })} />
                                </div>
                            ))}
                            {pick && (
                                <div className="nv-pick">
                                    <div className="listhead"><span className="kx-section">{pick === "video" ? "Vídeo de fundo" : pick === "audio" ? "Áudio de fundo" : "Adicionar à sequência"}</span><span style={{ flex: 1 }} /><Btn small onClick={() => fromComputer(pick)}><Icon name="folder" />Do computador…</Btn></div>
                                    {!pickList.length && <div className="listhead"><span className="kx-meta">Nada na Mídia ainda · use Do computador…</span></div>}
                                    {pickList.slice(0, 40).map((m) => <Row key={m.id} single icon={m.type === "audio" ? "volume" : m.type === "video" ? "film" : "image"} title={m.title} onClick={() => choose(m)} />)}
                                </div>
                            )}
                        </div>
                    </div>
                </Panel>
            </div>
            {colAviso.split}
            <div className="col center">
                <Panel title={<>Prévia do aviso <span className="kx-count">· ao vivo · 16:9</span></>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <div className="nv-stage">
                        <div className="nv-screen"><ScreenRenderer state={preview} now={c.now} logoUrl={logoUrl} preview motion audio={false} /></div>
                    </div>
                    <div className="listhead nv-note">
                        <span className="kx-meta">Salvar não muda as telas: o aviso entra na Biblioteca e vai ao ar pelo console.</span>
                        <span style={{ flex: 1 }} />
                        <Btn kind="outline" onClick={toPrev}>Pôr na prévia do console</Btn>
                    </div>
                </Panel>
            </div>
            </div>
        </>
    );
}
