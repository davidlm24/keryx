import React, { useMemo } from "react";
import Icon from "./Icon";
import { Monitor, Btn, Row, Empty, IconBtn } from "./kx";
import Library from "./Library";
import Layers from "./Layers";
import { plannedTimes } from "./Rundown";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { applyOp, emptyState, mainLayer } from "@shared/live-state.mjs";
import { stageOp, stageAirSlide, liveStageId } from "@/lib/console/stage";

const TYPE_ICON = { SONG: "music", BIBLE: "book", VIDEO: "film", IMAGE: "image", PDF: "film", POWERPOINT: "film", ANNOUNCEMENT: "megaphone", TEXT: "text", TIMER: "clock" };
const TYPE_LABEL = { SONG: "Música", BIBLE: "Leitura", VIDEO: "Vídeo", IMAGE: "Imagem", PDF: "Apresentação", POWERPOINT: "Apresentação", ANNOUNCEMENT: "Aviso", TEXT: "Texto", TIMER: "Timer" };
const minutesOf = (hhmm) => { const [h, m] = String(hhmm).split(":").map(Number); return (h || 0) * 60 + (m || 0); };

// The Prévia as it would look on air (the same rules, on a copy). Never sent.
function previewDoc(stage, cur, now) {
    if (!stage) return null;
    if (stage.airSlide && cur?.content) { try { return applyOp(cur, "content.goTo", { index: stage.index }, now); } catch { return cur; } }
    const base = { ...emptyState(now), background: cur?.background || null, logo: cur?.logo || emptyState().logo, overlays: cur?.overlays || [] };
    try {
        if (stage.video) return applyOp(base, "content.show", { title: stage.title, slides: [{ text: "" }] }, now);
        const [op, args] = stageOp(stage);
        return applyOp(base, op, args, now);
    } catch { return base; }
}

const captionOf = (doc, word) => {
    const layer = mainLayer(doc);
    if (!doc || layer === "none") return `${word} · nada`;
    if (layer === "black") return `${word} · Tela preta`;
    if (layer === "logo") return `${word} · Logo`;
    if (layer === "content") return `${word} · ${doc.content.title || "Texto"}${doc.content.slides.length > 1 ? ` · ${doc.content.index + 1}/${doc.content.slides.length}` : ""}`;
    if (layer === "media") return `${word} · ${doc.media.title || "Mídia"}`;
    if (layer === "communication") return `${word} · ${doc.communication.item?.title || "Aviso"}`;
    return `${word} · ${{ clock: "Relógio", stopwatch: "Cronômetro", timer: "Timer", freetext: "Texto livre" }[doc.tool.mode]}`;
};

function sendNote(stage, mode) {
    if (!stage) return "";
    if (mode !== "live") return "Só no ensaio: as telas não mudam.";
    if (stage.kind === "video") return "Ao enviar: toca nas telas de vídeo; o projetor continua como está.";
    if (stage.kind === "tool") return "Ao enviar: substitui o texto principal; fundo e logo continuam.";
    if (stage.airSlide) return `Ao enviar: o slide no ar passa para o ${stage.index + 1}.`;
    return "";
}

// Apresentar: the screen used during the service. Programa large, the Prévia
// beside it with the one send button, the slides of what is on air as a
// strip, a short rundown, and everything else behind "Mais".
export default function PresentView({ c, logoUrl, service, items, log, airItemId, prevItemId, onPrepareItem, onGoItem, onSend, onOpenRoteiro, onOpenHistory, mais, setMais, maisTab, setMaisTab, data, onAddSong }) {
    const { live, cur, prev, now, mode } = c;
    const isLive = mode === "live";
    const pdoc = useMemo(() => previewDoc(prev, cur, now), [prev, cur, now]);
    const airId = liveStageId(cur);
    const content = cur?.content || null;
    const note = sendNote(prev, mode);

    // Slides of what is on air, as small screens: a click prepares that slide.
    const thumbs = content ? content.slides.map((_, i) => {
        const doc = { ...cur, screen: "show", alert: null, tool: null, communication: null, media: null, content: { ...content, index: i, style: { ...content.style, transition: "cut" } } };
        const prevMark = prev && (prev.airSlide || prev.id === airId) && prev.index === i && i !== content.index;
        const cls = i === content.index ? "is-air" : prevMark ? "is-prev" : i === content.index + 1 ? "is-next" : "";
        return { i, doc, cls };
    }) : [];

    // On air, prepared, then the next two.
    const times = plannedTimes(service, items);
    const airIdx = items.findIndex((i) => i.id === airItemId);
    const pIdx = items.findIndex((i) => i.id === prevItemId);
    const pick = [];
    if (airIdx >= 0) pick.push(airIdx);
    if (pIdx >= 0 && !pick.includes(pIdx)) pick.push(pIdx);
    for (let k = Math.max(airIdx, pIdx) + 1; k < items.length && pick.length < 4; k++) if (!pick.includes(k)) pick.push(k);
    if (airIdx < 0 && pIdx < 0) for (let k = 0; k < items.length && pick.length < 4; k++) pick.push(k);
    const shortList = pick.sort((a, b) => a - b).map((i) => ({ it: items[i], i }));

    const airStart = airItemId ? log[airItemId]?.start : null;
    let lateText = "";
    let late = 0;
    if (airStart && airIdx >= 0) {
        const d = new Date(now); d.setHours(0, 0, 0, 0);
        late = Math.round((airStart - (d.getTime() + minutesOf(times[airIdx]) * 60000)) / 60000);
        lateText = late > 0 ? `+${late} min atrasado` : late < 0 ? `−${-late} min adiantado` : "no horário";
    }

    return (
        <div className="apres">
            <div className="kx-panel apres-l">
                <Monitor className="apres-prog" state={isLive ? "air" : "rh"} caption={captionOf(cur, isLive ? "Programa" : "Programa · Ensaio")} live={cur} now={now} logoUrl={logoUrl}
                    right={<Btn small onClick={onOpenHistory} title="O que esteve no ar há pouco"><Icon name="undo" />Voltar ao anterior</Btn>}>
                    {!isLive && (
                        <div className="pipwrap">
                            <span className="kx-pip-cap">NO AR AGORA</span>
                            <ScreenRenderer state={live} now={now} logoUrl={logoUrl} preview />
                        </div>
                    )}
                </Monitor>
                <div className="strip" aria-label="Slides no ar">
                    {!thumbs.length && <span className="kx-meta" style={{ padding: "0 var(--space-1)" }}>{cur && mainLayer(cur) !== "none" ? "O que está no ar não tem slides." : "Nada no ar."}</span>}
                    {thumbs.map((t) => (
                        <button type="button" key={t.i} className={`thumb kx-t ${t.cls}`} title={t.cls === "is-air" ? `Slide ${t.i + 1} · no ar` : `Pôr o slide ${t.i + 1} na prévia`}
                            onClick={() => { if (t.i !== content.index) c.setPrev(stageAirSlide(content, t.i, airId)); }}>
                            <ScreenRenderer state={t.doc} now={now} logoUrl={logoUrl} preview />
                            <span className="n">{t.i + 1}</span>
                        </button>
                    ))}
                </div>
                <div className="apres-nav">
                    <Btn kind="outline" onClick={() => c.moveSlide(-1)} title="Slide anterior no ar · ←"><Icon name="skip-back" />Anterior</Btn>
                    <Btn kind="outline" onClick={() => c.moveSlide(1)} title="Próximo slide no ar · →">Próximo<Icon name="skip-fwd" /></Btn>
                    {content && <span className="kx-meta">{isLive ? "no ar" : "ensaio"} {content.index + 1}/{content.slides.length}</span>}
                    <span style={{ flex: 1 }} />
                    {lateText && <span className={late > 0 ? "kx-warn" : "kx-meta"}>{lateText}</span>}
                </div>
            </div>
            <div className="kx-panel apres-r">
                <Monitor state={prev ? "prev" : ""} caption={prev ? `Prévia · ${prev.title}${prev.slides.length > 1 ? ` · ${prev.index + 1}/${prev.slides.length}` : ""}` : "Prévia"} live={pdoc} now={now} logoUrl={logoUrl}>
                    {!prev && <div className="kx-screen-empty">Nada na prévia</div>}
                    {prev?.missing && <div className="kx-screen-hatch"><div>Arquivo não encontrado<small>{prev.title}</small></div></div>}
                </Monitor>
                {note && <div className="apres-note">{note}</div>}
                <div className="apres-send" data-live-keys="" tabIndex={-1}>
                    <Btn kind={isLive ? "prev" : "rh"} className="kx-btn-send" onClick={() => onSend()} disabled={!prev} title={`${isLive ? "Enviar ao ar" : "Mostrar no ensaio"} · Ctrl+Enter`}>{isLive ? "Enviar ao ar" : "Mostrar no ensaio"}</Btn>
                    <span className="kx-meta">Ctrl+Enter</span>
                </div>
                {prev?.notes && (
                    <div className="apres-tnotes"><span className="kx-section">Notas <span className="kx-count">· só no retorno e no tablet</span></span><p>{prev.notes}</p></div>
                )}
                <div className="apres-rund">
                    <div className="listhead" style={{ paddingRight: 0 }}>
                        <span className="kx-section" style={{ flex: 1 }}>Roteiro{service ? <span className="kx-count"> · {service.title}</span> : null}</span>
                        <Btn small onClick={onOpenRoteiro}>Roteiro completo</Btn>
                    </div>
                    {!items.length && <Empty icon="list" title={service ? "Roteiro vazio" : "Nenhum culto escolhido"}>{service ? "Monte o roteiro em Preparar." : "Escolha um culto no menu KERYX."}</Empty>}
                    {shortList.map(({ it, i }) => (
                        <Row key={it.id} icon={TYPE_ICON[it.type] || "list"} title={it.title || TYPE_LABEL[it.type] || it.type}
                            meta={[it.id === airItemId ? (isLive ? "no ar" : "ensaio") : it.id === prevItemId ? "na prévia" : i === airIdx + 1 ? "próximo" : "", TYPE_LABEL[it.type]].filter(Boolean).join(" · ")}
                            time={times[i]}
                            state={it.id === airItemId ? (isLive ? "is-air" : "is-rh") : it.id === prevItemId ? "is-prev" : ""}
                            onClick={() => onPrepareItem(it, i)}
                            actions={<Btn onClick={(e) => { e.stopPropagation(); onGoItem(it, i); }} title="Ir para o item: prepara e envia">Ir</Btn>} />
                    ))}
                </div>
            </div>
            {mais && (
                <div className="mais">
                    <div className="kx-panel">
                        <div className="kx-panel-h">
                            <span className="kx-section">Mais</span>
                            <IconBtn name="x" title="Fechar" small onClick={() => setMais(false)} />
                        </div>
                        <div className="kx-tabs">
                            {[["camadas", "Camadas"], ["letras", "Letras"], ["midia", "Mídia"], ["avisos", "Avisos"]].map(([k, l]) => (
                                <button type="button" key={k} className={`kx-t ${maisTab === k ? "is-on" : ""}`} onClick={() => setMaisTab(k)}>{l}</button>
                            ))}
                        </div>
                        <div className="kx-panel-b" style={{ display: "flex", flexDirection: "column", overflow: "hidden" }}>
                            {maisTab === "camadas" ? <div style={{ overflow: "auto" }}><Layers c={c} themes={data.themes} /></div>
                                : <Library c={c} data={data} tab={maisTab} setTab={setMaisTab} hideTabs onPrepare={(s) => c.setPrev(s)} onAddSong={onAddSong} />}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
