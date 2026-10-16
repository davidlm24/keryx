import React, { useEffect, useMemo, useRef, useState } from "react";
import Icon from "../Icon";
import { Btn, IconBtn, Seg } from "../kx";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import GeneratorPanel, { GeneratorTiles } from "../GeneratorPanel";
import { FundoDetail, useSaveBackgroundPref } from "../settings/FundosGallery";
import { useBackgrounds, useLibrary, useThemes } from "../useConsoleData";
import { SAMPLE_SLIDES } from "../settings/sample";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { failureReason, importMediaFiles } from "@/lib/mediaImport";
import { keryx } from "@/api/keryxClient";
import { usePrefs } from "@/hooks/useUser";
import { visibleBackgrounds, categoriesOf, managedCategories, sourceOf, backgroundActions, OWN_IMAGES, OWN_VIDEOS } from "@/lib/console/backgroundPrefs";
import FundoCategories from "./FundoCategories";
import { cleanSpec, bgArgs, bgSpec, bgLabel, sameBg } from "@/lib/console/backgroundSpec";
import { themeStyle, themeBackgroundArgs, themeName, themeHasBackground } from "@/lib/console/themes";
import { GENERATORS } from "@/lib/generators";
import { ALL_KINDS } from "./libraryContext";
import { useContextMenu } from "../ContextMenu";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";
import { usePendingMedia } from "@/hooks/usePendingMedia";
import { pendingUrls, PENDING_SAY } from "@/lib/pendingMedia";

// Biblioteca de temas e fundos (owner's request 2026-10-12, as in Holyrics):
// one window for every picker of a background or a theme — Camadas, the
// song editor, the themes, the planner, the idle screen… Tabs Temas ·
// Imagens · Vídeos · Gerados · Cor, as many as the picker accepts; the
// church's categories (edited here too, "Categorias…") and favourites
// (BackgroundPref), files sent from the computer (background rows of the
// Media table, never in the Mídia), and a sample of the choice on the real
// renderer. A click chooses, a double click (or
// Usar) takes it; Esc or Cancelar closes without choosing. Gerados shows the
// background big and moving while it is edited (owner's request 2026-10-12,
// as SPresenter does). (Its "Ao vivo" mode, for the Fundo on air from
// Camadas › Fundo, left with that section: owner's review 2026-10-14.)
const TABS = [["temas", "Temas"], ["image", "Imagens"], ["video", "Vídeos"], ["generator", "Gerados"], ["color", "Cor"]];
const ALL = "__all";
const HIDDEN = "__hidden";
const COLORS = ["#000000", "#0f1a2e", "#1f1308", "#101f14", "#1b1030", "#2a0d12", "#0d2a2a", "#333333", "#5b8fc9", "#c9a25b", "#7a2e3a", "#ffffff"];
const GEN_NAMES = Object.fromEntries(GENERATORS.map((g) => [g.id, g.name]));
const SAMPLE = SAMPLE_SLIDES.slice(0, 1);

// What a picked spec looks like on air: the Fundo, then a slide over it.
function sampleDoc(now, args, style = {}) {
    try {
        let s = emptyState(now);
        if (args) s = applyOp(s, "background.set", args, now);
        return applyOp(s, "content.show", { kind: "lyrics", title: "Exemplo", slides: SAMPLE, style }, now);
    } catch { return null; }
}

export default function BackgroundLibrary({ c, request, onDone }) {
    const themeMode = request.accept === "theme";
    const kinds = themeMode ? [] : (Array.isArray(request.accept) ? request.accept : ALL_KINDS).filter((k) => ALL_KINDS.includes(k));
    // The background library is its own (owner's decision 2026-10-13): what
    // is sent here is a background (Media of category "background"), out of
    // the Biblioteca's Imagens and Vídeos; a file of the Mídia comes in only
    // when brought on purpose (Trazer da Mídia…, a copy of its row).
    const { media, backgroundMedia } = useLibrary();
    const themes = useThemes();
    const list = useBackgrounds();
    // What the main area shows for Imagens and Vídeos: the backgrounds, the
    // Mídia's files to bring in, or the categories (owner 2026-10-16: they are
    // edited here, where they are used).
    const [view, setView] = useState(() => (request.view === "categories" ? "categories" : "grid"));
    const save = useSaveBackgroundPref(c.say);
    // Right click: every background can leave the library, each as its origin
    // says (backgroundActions; owner 2026-10-16 — the factory ones too).
    const menu = useContextMenu();
    const confirm = useConfirm();
    const what = (b) => (b.kind === "video" ? "o vídeo de fundo" : "a imagem de fundo");
    const gone = (b) => { if (sel?.value === b.url) setSel(null); };
    const act = {
        exclude: async (b) => {
            if (!(await confirm({ title: `Excluir ${what(b)}?`, text: `"${b.name}" sai da biblioteca. Ele vem com o KERYX: em Excluídos, Restaurar traz de volta.` }))) return;
            await save(b, { hidden: true, favorite: false }, "Fundo excluído.");
            gone(b);
        },
        delete: async (b) => {
            if (!(await confirm(deleteQuestion(what(b), b.name)))) return;
            try {
                await keryx.entities.Media.delete(b.mediaId);
                // Its settings go with it, unless another copy of the file is
                // still a background: a Mídia picture with a BackgroundPref
                // would come back here on its own.
                if (b.pref?.id && !backgroundMedia.some((m) => m.id !== b.mediaId && m.file_url === b.url)) await keryx.entities.BackgroundPref.delete(b.pref.id);
                gone(b);
                c.say("Fundo excluído.");
            } catch (err) { c.say(err?.message || "Não foi possível excluir."); }
        },
        untrack: async (b) => {
            try { if (b.pref?.id) await keryx.entities.BackgroundPref.delete(b.pref.id); gone(b); c.say(`"${b.name}" saiu dos fundos. Continua na Mídia.`); } catch (err) { c.say(err?.message || "Não foi possível tirar dos fundos."); }
        },
        restore: (b) => save(b, { hidden: false }, `"${b.name}" voltou para a biblioteca.`),
    };
    const ACTION = {
        exclude: { label: "Excluir…", icon: "trash" },
        delete: { label: "Excluir…", icon: "trash" },
        untrack: { label: "Tirar dos fundos (fica na Mídia)", icon: "x" },
        restore: { label: "Restaurar", icon: "undo" },
    };
    const tileMenu = (e, b) => menu(e, { title: b.name, items: [
        { label: "Usar", icon: "check", onSelect: () => take({ kind: b.kind, value: b.url }) },
        ...backgroundActions(b).map((k) => ({ ...ACTION[k], onSelect: () => act[k](b) })),
    ] });
    // A file the sync between the church's computers is still bringing: its
    // tile says Baixando… and cannot be chosen yet.
    const pending = usePendingMedia();
    const withBg = useMemo(() => themes.filter((t) => { const s = bgSpec(t); return s && kinds.includes(s.kind); }), [themes, kinds.join()]); // eslint-disable-line react-hooks/exhaustive-deps
    const tabs = TABS.filter(([k]) => (k === "temas" ? themeMode || withBg.length > 0 : kinds.includes(k)));
    const start = cleanSpec(request.value);
    const [tab, setTab] = useState(() => (themeMode ? "temas" : start && kinds.includes(start.kind) ? start.kind : tabs.find(([k]) => k !== "temas")?.[0] || "temas"));
    // The choice: a background spec, or a theme row in theme mode.
    const [sel, setSel] = useState(() => (themeMode ? null : start));
    const [selTheme, setSelTheme] = useState(() => (themeMode ? themes.find((t) => t.id === request.value) || null : null));
    useEffect(() => { if (themeMode && !selTheme && request.value) setSelTheme(themes.find((t) => t.id === request.value) || null); }, [themes]); // eslint-disable-line react-hooks/exhaustive-deps
    const [filter, setFilter] = useState(ALL);
    useEffect(() => { setFilter(ALL); setView((v) => (v === "media" ? "grid" : v)); }, [tab]);

    // Files from the computer: background rows of the Media table (out of the
    // Mídia), here only; the first one sent is chosen. With a category chip
    // on, they go in that category.
    const fileRef = useRef(null);
    const [uploading, setUploading] = useState(false);
    const upload = async (files) => {
        setUploading(true);
        try {
            const { created, failed } = await importMediaFiles(files, { category: "background" });
            const into = filter !== ALL && filter !== HIDDEN && filter !== OWN_IMAGES && filter !== OWN_VIDEOS ? filter : null;
            if (into) for (const m of created) if (m.file_url) await keryx.entities.BackgroundPref.create({ source: sourceOf(m.file_url), category: into }).catch(() => {});
            const why = failureReason(failed);
            c.say(`${created.length} ${created.length === 1 ? "arquivo enviado" : "arquivos enviados"}${into ? ` para ${into}` : ""}${failed.length ? ` · não deu: ${failed.map((x) => x.name).join(", ")}` : ""}${why ? ` · ${why}` : "."}`);
            const first = created.find((m) => (m.type === "image" || m.type === "video") && kinds.includes(m.type));
            if (first) { setTab(first.type); setSel({ kind: first.type, value: first.file_url }); setView("grid"); }
        } catch (err) { c.say(err?.message || "Não foi possível enviar."); }
        setUploading(false);
    };

    // Trazer da Mídia: the Mídia's images or videos of this tab not already
    // here; a click copies the row (the same file) into the backgrounds.
    const ownUrls = new Set(list.map((b) => b.url));
    const mediaOfTab = media.filter((m) => m.type === tab && m.file_url && !m.missing && !/youtu/.test(m.file_url) && !ownUrls.has(m.file_url));
    const bring = async (m) => {
        try {
            await keryx.entities.Media.create({ title: m.title || "Fundo", type: m.type, file_url: m.file_url, category: "background", duration: m.duration || 0 });
            setView("grid");
            setSel({ kind: m.type, value: m.file_url });
            c.say(`"${m.title || "Arquivo"}" está nos fundos.`);
        } catch (err) { c.say(err?.message || "Não foi possível trazer da Mídia."); }
    };
    const done = (result) => onDone(result);
    const take = (spec = sel) => { const s = cleanSpec(spec); if (s) done({ spec: s }); };
    const takeTheme = (t = selTheme) => { if (t) done({ theme: t }); };

    // The picture or clip entries of this tab, with their settings.
    const entries = list.filter((b) => b.kind === tab);
    const storedCats = usePrefs().background_categories;
    const cats = useMemo(() => categoriesOf(entries, storedCats), [entries, storedCats]);
    const hiddenCount = entries.filter((b) => b.hidden).length;
    // A chip that went away (the last excluded one restored, a category
    // emptied or renamed) leaves its filter: back to Todos.
    useEffect(() => { if (filter !== ALL && (filter === HIDDEN ? !hiddenCount : !cats.includes(filter))) setFilter(ALL); }, [filter, hiddenCount, cats]);
    const shown = filter === HIDDEN ? entries.filter((b) => b.hidden) : visibleBackgrounds(entries, filter === ALL ? {} : { only: filter });
    const entry = sel && (sel.kind === "image" || sel.kind === "video") ? list.find((b) => b.source === sourceOf(sel.value)) || null : null;

    // The sample: the choice as it goes on air (the picture's own dim and
    // blur from its settings; a theme's text look on a theme).
    const previewArgs = themeMode ? themeBackgroundArgs(selTheme) : sel ? { ...bgArgs(sel, ""), ...(entry && sel.dim === undefined && entry.dim !== null ? { dim: entry.dim } : {}), ...(entry && sel.blur === undefined && entry.blur !== null ? { blur: entry.blur } : {}) } : null;
    const doc = useMemo(() => sampleDoc(c.now, previewArgs, themeMode && selTheme ? themeStyle(selTheme) : {}), [JSON.stringify(previewArgs), selTheme]); // eslint-disable-line react-hooks/exhaustive-deps
    // Gerados: the background alone, big and moving.
    const big = tab === "generator";
    const bigDoc = useMemo(() => {
        if (!big || !previewArgs) return null;
        try { return applyOp(emptyState(c.now), "background.set", previewArgs, c.now); } catch { return null; }
    }, [big, JSON.stringify(previewArgs)]); // eslint-disable-line react-hooks/exhaustive-deps

    const title = request.title || (themeMode ? "Escolher tema" : "Escolher fundo");
    const can = themeMode ? Boolean(selTheme) : Boolean(cleanSpec(sel));
    const label = themeMode ? (selTheme ? themeName(selTheme) : "Nenhum tema escolhido") : sel ? (entry ? entry.name : bgLabel(sel, GEN_NAMES)) : "Nenhum fundo escolhido";

    return (
        <>
            <div className="scrim is-dim lib-scrim" onClick={() => done(null)} />
            <div className="lib-dialog" role="dialog" aria-label={title}>
                <div className="win-bar">
                    <span className="kx-section win-title">{title}</span>
                    <div className="kx-tabs lib-tabs" role="tablist">
                        {tabs.map(([k, name]) => <button type="button" key={k} role="tab" aria-selected={tab === k} className={`kx-t ${tab === k ? "is-on" : ""}`} onClick={() => setTab(k)}>{name}</button>)}
                    </div>
                    <span className="win-gap" />
                    {(kinds.includes("image") || kinds.includes("video")) && <>
                        {(tab === "image" || tab === "video") && <Btn small on={view === "media"} onClick={() => setView(view === "media" ? "grid" : "media")} title="Usar como fundo uma imagem ou vídeo que já está na Mídia">Trazer da Mídia…</Btn>}
                        <Btn small disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="download" />{uploading ? "Enviando…" : "Do computador…"}</Btn>
                        <input ref={fileRef} type="file" multiple hidden accept={[kinds.includes("image") && "image/*,.gif", kinds.includes("video") && "video/mp4,video/webm"].filter(Boolean).join(",")} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; if (files.length) upload(files); }} />
                    </>}
                    <IconBtn name="x" title="Fechar · Esc" onClick={() => done(null)} />
                </div>
                <div className="lib-body">
                    <div className={`lib-main ${big ? "is-gen" : ""}`}>
                        {tab === "temas" && (
                            <div className="lib-grid lib-themes">
                                {(themeMode ? themes : withBg).map((t) => {
                                    const on = themeMode ? selTheme?.id === t.id : sameBg(sel, bgSpec(t));
                                    return (
                                        <button type="button" key={t.id} className={`kx-t fg-tile ${on ? "is-on" : ""}`} aria-pressed={on} title={`${themeName(t)}${t.pinned ? " · fixado no console" : ""}`}
                                            onClick={() => (themePending(t, pending) ? c.say(PENDING_SAY) : themeMode ? setSelTheme(t) : setSel(bgSpec(t)))}
                                            onDoubleClick={() => { if (!themePending(t, pending)) (themeMode ? takeTheme(t) : take(bgSpec(t))); }}
                                            onContextMenu={(e) => menu(e, { title: themeName(t), items: [
                                                { label: t.pinned ? "Tirar do console" : "Fixar no console", icon: "pin", onSelect: () => keryx.entities.ProjectionTheme.update(t.id, { pinned: !t.pinned }).catch(() => {}) },
                                            ] })}>
                                            <span className="fg-img"><ThemeThumb theme={t} now={c.now} />{themeMode && <NoBgMark theme={t} label />}</span>
                                            {(t.is_default || t.pinned || themeName(t, "")) && <span className="fg-name">{t.is_default && <Icon name="star" size={12} />}{t.pinned && <Icon name="pin" size={12} />}{themeName(t, "")}</span>}
                                        </button>
                                    );
                                })}
                                {!(themeMode ? themes : withBg).length && <span className="kx-meta">Nenhum tema ainda. Crie em Configurações › Temas, ou salve o que está no ar em Camadas.</span>}
                            </div>
                        )}
                        {(tab === "image" || tab === "video") && view === "categories" && <FundoCategories c={c} entries={list} onDone={() => setView("grid")} />}
                        {(tab === "image" || tab === "video") && view === "media" && (
                            <>
                                <div className="listhead"><span className="kx-section">Da Mídia <span className="kx-count">· clique para trazer para os fundos (a Mídia continua com o arquivo)</span></span></div>
                                <div className="lib-grid">
                                    {mediaOfTab.map((m) => (
                                        <button type="button" key={m.id} className="kx-t fg-tile" aria-label={m.title} title={m.title} onClick={() => bring(m)}>
                                            <span className="fg-img">{m.type === "video" ? <video src={m.file_url} preload="metadata" muted /> : <img src={m.file_url} alt="" loading="lazy" />}</span>
                                            <span className="fg-name">{m.title}</span>
                                        </button>
                                    ))}
                                    {!mediaOfTab.length && <span className="kx-meta">Nada na Mídia para trazer.</span>}
                                </div>
                            </>
                        )}
                        {(tab === "image" || tab === "video") && view === "grid" && <>
                            <div className="fg-filters">
                                <div className="fg-chips" role="radiogroup" aria-label="Categoria">
                                    {[[ALL, "Todos"], ...cats.map((k) => [k, k]), ...(hiddenCount ? [[HIDDEN, `Excluídos · ${hiddenCount}`]] : [])].map(([k, name]) => (
                                        <button type="button" key={k} role="radio" aria-checked={filter === k} className={`kx-t fg-chip ${filter === k ? "is-on" : ""}`} onClick={() => setFilter(k)}>{name}</button>
                                    ))}
                                </div>
                                <button type="button" className="kx-t fg-chip fg-chip-edit" title="Criar, renomear, ordenar e excluir as categorias" onClick={() => setView("categories")}><Icon name="edit" size={12} />Categorias…</button>
                            </div>
                            {filter === HIDDEN && <span className="kx-meta">Fora da biblioteca. Clique com o botão direito para restaurar.</span>}
                            <div className="lib-grid">
                                {shown.map((b) => {
                                    const on = sel?.kind === b.kind && sourceOf(sel.value) === b.source;
                                    const waiting = pending.has(b.url);
                                    const tip = `${b.name}${b.origin === "keryx" ? " · vem com o KERYX" : b.origin === "media" ? " · também na Mídia" : ""}${waiting ? ` · ${SYNC_WAIT_HINT}` : ""}`;
                                    return (
                                        <button type="button" key={b.source} className={`kx-t fg-tile ${on ? "is-on" : ""} ${b.hidden ? "is-hidden" : ""}`} aria-pressed={on} aria-label={b.name} title={tip}
                                            onClick={() => (waiting ? c.say(PENDING_SAY) : setSel({ kind: b.kind, value: b.url }))} onDoubleClick={() => { if (!waiting) take({ kind: b.kind, value: b.url }); }} onContextMenu={(e) => tileMenu(e, b)}>
                                            <span className="fg-img">{waiting ? <SyncWait /> : b.kind === "video" ? <video src={b.url} preload="metadata" muted /> : <img src={b.url} alt="" loading="lazy" />}{b.kind === "video" && <span className="fg-kind"><Icon name="film" size={12} /></span>}</span>
                                            <span className="fg-name">{b.favorite && <Icon name="star" size={12} />}{b.name}</span>
                                        </button>
                                    );
                                })}
                                {!shown.length && <span className="kx-meta">{tab === "video" ? "Nenhum vídeo. Envie um do computador (MP4 ou WebM); ele toca em loop, sem som." : "Nenhuma imagem nesta categoria."}</span>}
                            </div>
                        </>}
                        {tab === "generator" && (
                            <div className="lib-big">
                                <div className="ap-sample lib-big-screen">{bigDoc ? <ScreenRenderer state={bigDoc} now={c.now} preview motion /> : <span className="kx-meta">Escolha um gerador abaixo.</span>}</div>
                                <span className="lib-big-cap"><span className="kx-meta">{sel?.kind === "generator" ? bgLabel(sel, GEN_NAMES) : "Nenhum gerador escolhido"}</span></span>
                            </div>
                        )}
                        {tab === "generator" && (
                            <div className="layerprops lib-gen">
                                <span className="k">Gerador</span>
                                <GeneratorTiles current={sel?.kind === "generator" ? sel.gen : null} op={(_op, args) => setSel(cleanSpec(args))} />
                                {sel?.kind === "generator" && <>
                                    <GeneratorPanel background={bgArgs(sel, "")} op={(_op, args) => setSel(cleanSpec(args))} />
                                    <span className="k">Escurecer</span>
                                    <Seg small label="Escurecer" value={String(sel.dim ?? 0)} options={[["0", "0"], ["0.3", "30%"], ["0.45", "45%"], ["0.7", "70%"]]} onChange={(v) => setSel(cleanSpec({ ...sel, dim: Number(v) }))} />
                                </>}
                                {sel?.kind !== "generator" && <span className="kx-meta" style={{ gridColumn: "1 / -1" }}>Um fundo que as telas calculam: escolha um gerador, depois as cores e o movimento.</span>}
                            </div>
                        )}
                        {tab === "color" && (
                            <div className="lib-colors">
                                {COLORS.map((hex) => {
                                    const on = sel?.kind === "color" && sel.value === hex;
                                    return <button type="button" key={hex} className={`kx-t lib-swatch ${on ? "is-on" : ""}`} style={{ background: hex }} aria-label={hex} aria-pressed={on} title={hex} onClick={() => setSel({ kind: "color", value: hex })} onDoubleClick={() => take({ kind: "color", value: hex })} />;
                                })}
                                <label className="lib-free">Outra cor<input type="color" className="ed-color" value={sel?.kind === "color" ? sel.value : "#000000"} onChange={(e) => setSel({ kind: "color", value: e.target.value })} aria-label="Outra cor" /></label>
                            </div>
                        )}
                    </div>
                    {!big && <div className="lib-side">
                        <div className="ap-sample lib-sample">{doc && <ScreenRenderer state={doc} now={c.now} preview motion />}</div>
                        <div className="lib-label"><span className="kx-meta">Escolhido</span><span className="t">{label}</span></div>
                        {entry && <FundoDetail key={entry.source} b={entry} save={save} now={c.now} sample={false}
                            categories={managedCategories(storedCats, list)} onCategories={() => setView("categories")} onRestore={() => act.restore(entry)} />}
                    </div>}
                </div>
                <div className="lib-foot">
                    {request.allowNone && <Btn small onClick={() => done({ none: true })}>{request.noneLabel || (themeMode ? "Sem tema" : "Sem fundo")}</Btn>}
                    <span style={{ flex: 1 }} />
                    {request.manage
                        ? <Btn small onClick={() => done(null)}>Fechar</Btn>
                        : <><Btn small onClick={() => done(null)}>Cancelar</Btn>
                            <Btn small kind="brand" disabled={!can} onClick={() => (themeMode ? takeTheme() : take())}>{request.useLabel || "Usar"}</Btn></>}
                </div>
            </div>
        </>
    );
}

// A theme saved without a background (from before the rule, owner
// 2026-10-14, themeHasBackground): a dot on the Temas panel's small thumbs,
// a "sem fundo" label where the thumbs are big. Inside the .fg-img.
export const NO_BG_HINT = "Sem fundo: ao aplicar, o Fundo no ar fica";
export function NoBgMark({ theme, label = false }) {
    if (themeHasBackground(theme)) return null;
    return label
        ? <span className="nobg-label" title={NO_BG_HINT}>sem fundo</span>
        : <span className="nobg-mark" title={NO_BG_HINT}><Icon name="warn" size={10} /></span>;
}

// A file the sync between the church's computers has not brought yet
// (usePendingMedia): said in place of its picture, inside the .fg-img.
export const SYNC_WAIT_HINT = "baixando da sincronização";
export function SyncWait() {
    return <span className="sync-wait" title={`Arquivo ${SYNC_WAIT_HINT}`}><Icon name="download" size={14} />Baixando…</span>;
}

// Whether a theme's background is a file still coming (Temas does not apply
// it until it arrives).
export const themePending = (theme, pending) => pendingUrls(themeBackgroundArgs(theme), pending).length > 0;

// A theme as a small screen: its text look over its background (the
// library's Temas tab and the console's Temas card).
export function ThemeThumb({ theme, now }) {
    const waiting = themePending(theme, usePendingMedia());
    const doc = useMemo(() => (waiting ? null : sampleDoc(now, themeBackgroundArgs(theme), themeStyle(theme))), [theme, waiting]); // eslint-disable-line react-hooks/exhaustive-deps
    if (waiting) return <span className="lib-thumb is-wait"><SyncWait /></span>;
    return doc ? <span className="lib-thumb"><ScreenRenderer state={doc} now={now} preview /></span> : null;
}
