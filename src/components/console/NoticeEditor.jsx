import React, { useEffect, useMemo, useRef, useState } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Panel, Btn, IconBtn, Field, Seg, Row, Empty } from "./kx";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { NOTICE_TYPES, newNotice, noticeLabel } from "@/lib/console/notice";
import { parseDuration, formatDuration } from "@/lib/songImport";
import { BACKGROUNDS, backgroundUrl } from "@/lib/backgrounds";
import { FONT_MAP } from "@/lib/deviceStyles";
import { stageFromPiece } from "@/lib/console/stage";

const SIZES = [["small", "P"], ["medium", "M"], ["large", "G"], ["xlarge", "GG"], ["xxlarge", "XG"]];
const FONTS = [["sans", "Sem serifa"], ["serif", "Serifa"], ["georgia", "Georgia"], ["times", "Times"], ["arial", "Arial"], ["verdana", "Verdana"], ["mono", "Monoespaçada"], ["cursive", "Cursiva"]];
const EFFECTS = [["shadow", "Sombra"], ["double-shadow", "Sombra dupla"], ["glow", "Brilho"], ["outline", "Contorno"], ["3d", "3D"], ["neon", "Neon"], ["none", "Nenhum"]];
const LOGO = [["none", "Sem"], ["top-left", "Alto esq."], ["top-right", "Alto dir."], ["bottom-left", "Baixo esq."], ["bottom-right", "Baixo dir."]];
const BG_IDS = BACKGROUNDS["Comunicação"].slice(0, 8);
const FIELDS = ["type", "title", "text", "subtext", "duration", "text_color", "text_color_2", "font_size", "font_family", "text_effect", "text_position_h", "text_position_v", "show_logo", "logo_position", "sound_alert", "background_image", "background_color", "background_video", "background_audio", "files"];
const pickFields = (row) => Object.fromEntries(FIELDS.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]));

// The aviso editor (canvas artboard "Editor de aviso"), a view inside the
// console: the kind, the texts and length, the look (size, font, colour,
// effect, position), the logo corner, the alert chime, the background
// (a bundled photo, a colour, an image, a video, audio, or a loop of files)
// and a live 16:9 preview drawn by ScreenRenderer, so it is the screen.
// Saving changes the library only; "Pôr na prévia do console" prepares it.
export default function NoticeEditor({ c, noticeId, logoUrl, media, onClose, onSaved }) {
    const isNew = noticeId === "new";
    const [draft, setDraft] = useState(() => (isNew ? newNotice("countdown") : null));
    const [saved, setSaved] = useState(() => (isNew ? null : undefined));
    const [error, setError] = useState("");
    const [durText, setDurText] = useState(isNew ? formatDuration(300) : "");
    const [startedAt, setStartedAt] = useState(() => keryx.live.now());
    const [pick, setPick] = useState(null); // "video" | "audio" | "files"
    const [confirm, setConfirm] = useState(null); // "delete" | "discard"
    const [busy, setBusy] = useState(false);
    const imgRef = useRef(null);
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
    const set = (patch) => { setConfirm(null); setDraft((d) => ({ ...d, ...patch })); };
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
        if (confirm !== "delete") { setConfirm("delete"); c.say(`Clique de novo para excluir "${draft.title}".`); return; }
        try { await keryx.entities.CommunicationVideo.delete(noticeId); c.say("Aviso excluído."); onClose(); } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
    };
    const leave = () => {
        if (dirty && confirm !== "discard") { setConfirm("discard"); c.say("Há mudanças não salvas · clique de novo (ou Esc) para descartar."); return; }
        onClose();
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

    // Esc: leaves a field, closes a picker, then leaves the editor (asking
    // once if there are changes); Ctrl+S saves.
    const keysRef = useRef(null);
    keysRef.current = (e) => {
        if (document.querySelector(".console .scrim")) return;
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); e.stopPropagation(); if (draft) save(); return; }
        if (e.key !== "Escape") return;
        e.preventDefault(); e.stopPropagation();
        if (["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName)) { e.target.blur(); return; }
        if (pick) { setPick(null); return; }
        leave();
    };
    useEffect(() => {
        const onKey = (e) => keysRef.current(e);
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, []);

    if (error) return <div className="col center"><Panel title="Editor de aviso"><Empty icon="warn" title="Não foi possível abrir">{error}</Empty><div className="pl-pad"><Btn onClick={onClose}>Voltar ao console</Btn></div></Panel></div>;
    if (!draft) return <div className="col center"><Panel title="Editor de aviso"><Empty title="Abrindo…" /></Panel></div>;

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
            <div className="col nv-l" style={{ flex: "0 1 420px", minWidth: 340 }}>
                <Panel title={<>Aviso <span className="kx-count">· {isNew ? "Novo aviso" : draft.title}{dirty ? " · não salvo" : ""}</span></>} actions={<>
                    {!isNew && <Btn small kind={confirm === "delete" ? "air" : ""} onClick={remove}>{confirm === "delete" ? "Excluir mesmo" : "Excluir"}</Btn>}
                    <Btn small onClick={leave} title="Voltar ao console · Esc"><Icon name="arrow-left" />Console</Btn>
                </>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    <input ref={imgRef} type="file" hidden accept="image/*" onChange={(e) => { upload(e.target.files?.[0], (url) => set({ background_image: url, background_color: "" })); e.target.value = ""; }} />
                    <input ref={fileRef} type="file" hidden onChange={(e) => { fileChosen(e.target.files?.[0]); e.target.value = ""; }} />
                    <div className="nv-scroll">
                        <div className="listhead"><span className="kx-section">Tipo</span></div>
                        {NOTICE_TYPES.map(([t, icon, label]) => <Row key={t} single icon={icon} title={label} className={draft.type === t ? "is-selected" : ""} onClick={() => chooseType(t)} />)}
                        <div className="frm nv-frm">
                            <span className="k">Título</span><Field icon={null} value={draft.text || ""} onChange={(v) => set({ text: v })} placeholder={timed ? "Ex.: O culto começa em" : "Ex.: Bem-vindos"} />
                            <span className="k">Texto</span><textarea className="ed-text nv-sub" rows={2} value={draft.subtext || ""} onChange={(e) => set({ subtext: e.target.value })} placeholder="Linha de apoio (opcional)" aria-label="Texto" />
                            <span className="k">Duração</span>
                            <span className="nv-inline">
                                <input className="pl-input pl-dur" value={durText} aria-label="Duração" placeholder="m:ss" onChange={(e) => { setDurText(e.target.value); const s = parseDuration(e.target.value); if (s !== null) set({ duration: s }); }} onBlur={() => setDurText(formatDuration(draft.duration) || "0:00")} />
                                <span className="kx-meta">{draft.type === "countdown" ? "conta até zero" : draft.type === "timer" ? "0:00 = sem limite" : "tempo na tela em Tocar todos"}</span>
                            </span>
                            <span className="k">Canto do logo</span>
                            <Seg small value={draft.show_logo === false ? "none" : draft.logo_position || "top-left"} onChange={(v) => set(v === "none" ? { show_logo: false } : { show_logo: true, logo_position: v })} options={LOGO} />
                            <span className="k">Som de alerta</span>
                            <span className="nv-inline">
                                <button type="button" role="switch" aria-checked={Boolean(draft.sound_alert)} aria-label="Som de alerta" className={`sw2 kx-t ${draft.sound_alert ? "is-on" : ""}`} onClick={() => set({ sound_alert: !draft.sound_alert })} />
                                <span className="kx-meta">{draft.sound_alert ? "Toca um sino curto quando o aviso entra" : "Sem som"}</span>
                            </span>
                        </div>

                        <div className="listhead"><span className="kx-section">Texto na tela</span></div>
                        <div className="frm nv-frm">
                            <span className="k">Tamanho</span><Seg small value={draft.font_size || "large"} onChange={(v) => set({ font_size: v })} options={SIZES} />
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
                            <span className="k">Alinhar</span><Seg small value={draft.text_position_h || "center"} onChange={(v) => set({ text_position_h: v })} options={[["left", "Esq."], ["center", "Centro"], ["right", "Dir."]]} />
                            <span className="k">Posição</span><Seg small value={draft.text_position_v || "middle"} onChange={(v) => set({ text_position_v: v })} options={[["top", "Topo"], ["middle", "Meio"], ["bottom", "Base"]]} />
                        </div>

                        <div className="listhead"><span className="kx-section">Fundo</span></div>
                        <div className="nv-pad">
                            <div className="bgpick">
                                {BG_IDS.map((id) => { const url = backgroundUrl(id); return <button type="button" key={id} className={`kx-t ${draft.background_image === url ? "is-on" : ""}`} aria-label="Fundo da galeria" onClick={() => set({ background_image: url, background_color: "" })}><img src={url} alt="" loading="lazy" /></button>; })}
                            </div>
                            <div className="nv-inline">
                                <Btn small onClick={() => imgRef.current?.click()}><Icon name="image" />Imagem…</Btn>
                                <label className="nv-color">Cor<input type="color" className="ed-color" value={/^#[0-9a-f]{6}$/i.test(draft.background_color || "") ? draft.background_color : "#101014"} onChange={(e) => set({ background_color: e.target.value, background_image: "" })} aria-label="Cor de fundo" title="Cor de fundo" /></label>
                                {(draft.background_image || draft.background_color) && <Btn small onClick={() => set({ background_image: "", background_color: "" })}>Sem imagem</Btn>}
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
                    <div className="nv-foot">
                        <Btn onClick={leave}>{confirm === "discard" ? "Descartar mudanças" : "Cancelar"}</Btn>
                        <Btn kind="outline" disabled={busy} onClick={save} title="Ctrl+S">Salvar aviso</Btn>
                    </div>
                </Panel>
            </div>
            <div className="kx-split" />
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
        </>
    );
}
