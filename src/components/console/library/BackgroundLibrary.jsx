import React, { useEffect, useMemo, useRef, useState } from "react";
import { tileUrl } from "@/lib/mediaPoster";
import Icon from "../Icon";
import { Btn, IconBtn, Seg, WinTabs, SelectManyBtn, SelBar, RowMark } from "../kx";
import { useMultiSelect } from "../useMultiSelect";
import { pickedOf } from "@/lib/console/multiSelect";
import { backgroundQuestion, backgroundSay, backgroundAction, backgroundRemoval, prefsAfterDelete } from "@/lib/console/bulkDelete";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import VideoStill from "@/components/screen/VideoStill";
import CodecMark from "@/components/console/CodecMark";
import { codecHint, codecOfRow } from "@/lib/videoCodec";
import { codecOf } from "@/lib/videoFiles";
import GeneratorPanel, { GeneratorTiles } from "../GeneratorPanel";
import { FundoDetail, useSaveBackgroundPref } from "../settings/FundosGallery";
import { useBackgrounds, useLibrary, useThemes } from "../useConsoleData";
import { SAMPLE_SLIDES } from "../settings/sample";
import { applyOp, emptyState } from "@shared/live-state.mjs";
import { failureReason, importMediaFiles, refusedSummary } from "@/lib/mediaImport";
import { keryx } from "@/api/keryxClient";
import { usePrefs } from "@/hooks/useUser";
import { visibleBackgrounds, categoriesOf, managedCategories, sourceOf, backgroundActions, OWN_IMAGES, OWN_VIDEOS } from "@/lib/console/backgroundPrefs";
import FundoCategories from "./FundoCategories";
import FilterChips from "./FilterChips";
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
const COLORS = ["#000000", "#0f1a2e", "#1f1308", "#101f14", "#1b1030", "#2a0d12", "#0d2a2a", "#333333", "#5b8fc9", "#c9a25b", "#7a2e3a", "#ffffff"];
const GEN_NAMES = Object.fromEntries(GENERATORS.map((g) => [g.id, g.name]));
const SAMPLE = SAMPLE_SLIDES.slice(0, 1);
const HOVER_MS = 200;
const calmComputer = () => typeof window !== "undefined" && Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

// Which tile is "hot": set HOVER_MS after the pointer/focus arrives, cleared on
// leave/blur. One key at a time, so at most one decoder runs in the library.
// Never the media pool (that is for the live LiveVideo).
function useHoverPlay() {
    const [hot, setHot] = useState(null);
    const timer = useRef(0);
    useEffect(() => () => clearTimeout(timer.current), []);
    const off = () => { clearTimeout(timer.current); setHot(null); };
    const on = (key) => { clearTimeout(timer.current); if (calmComputer()) return; timer.current = setTimeout(() => setHot(key), HOVER_MS); };
    const props = (key) => ({ onMouseEnter: () => on(key), onFocus: () => on(key), onMouseLeave: off, onBlur: off });
    return { hot, props };
}

// A clip's thumbnail: the still, or the clip itself when its tile is hot.
function ClipThumb({ src, hot }) {
    return hot ? <video src={src} autoPlay loop muted playsInline /> : <VideoStill src={src} className="" />;
}

// What a picked spec looks like on air: the Fundo, then a slide over it.
function sampleDoc(now, args, style = {}) {
    try {
        let s = emptyState(now);
        if (args) s = applyOp(s, "background.set", args, now);
        return applyOp(s, "content.show", { kind: "lyrics", title: "Exemplo", slides: SAMPLE, style }, now);
    } catch { return null; }
}

// escRef: the host's Esc asks here first (true = it cleared the marks, the
// library stays open).
export default function BackgroundLibrary({ c, request, onDone, escRef = null }) {
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
    // The one tile playing under the pointer (Rodada Q, Q3): a clip's tile
    // is a still until the pointer or the focus rests on it for a moment.
    const hover = useHoverPlay();
    // Right click: every background can leave the library, each as its origin
    // says (backgroundActions; owner 2026-10-16 — the factory ones too, for
    // good since 2026-10-23: there is no Excluídos to bring one back).
    const menu = useContextMenu();
    const confirm = useConfirm();
    const what = (b) => (b.kind === "video" ? "o vídeo de fundo" : "a imagem de fundo");
    const gone = (b) => { if (sel?.value === b.url) setSel(null); };
    const act = {
        exclude: async (b) => {
            if (!(await confirm({ title: `Excluir ${what(b)}?`, text: `"${b.name}" vem com o KERYX e sai da biblioteca de vez. Para usar de novo, traga a imagem do computador.`, ok: "Excluir", danger: true }))) return;
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
    };
    const ACTION = {
        exclude: { label: "Excluir…", icon: "trash" },
        delete: { label: "Excluir…", icon: "trash" },
        untrack: { label: "Tirar dos fundos (fica na Mídia)", icon: "x" },
    };
    // A right click on a marked tile, with others marked, acts on them all.
    const tileMenu = (e, b) => {
        if (selectable && ms.has(b.source) && picked.length > 1) {
            menu(e, { title: `${picked.length} fundos`, items: [{ label: pickedAction.label, icon: pickedAction.icon, onSelect: () => removeMany() }] });
            return;
        }
        menu(e, { title: b.name, items: [
            { label: "Usar", icon: "check", onSelect: () => take({ kind: b.kind, value: b.url }) },
            ...backgroundActions(b).map((k) => ({ ...ACTION[k], onSelect: () => act[k](b) })),
        ] });
    };
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
            const { created, failed, refused } = await importMediaFiles(files, { category: "background" });
            const into = filter !== ALL && filter !== OWN_IMAGES && filter !== OWN_VIDEOS ? filter : null;
            if (into) for (const m of created) if (m.file_url) await keryx.entities.BackgroundPref.create({ source: sourceOf(m.file_url), category: into }).catch(() => {});
            const why = failureReason(failed);
            // The files refused (a video in HEVC…, Rodada O) first, in one
            // sentence: a toast is one line. Alone when nothing came in.
            const no = refusedSummary(refused);
            const sent = `${created.length} ${created.length === 1 ? "arquivo enviado" : "arquivos enviados"}${into ? ` para ${into}` : ""}${failed.length ? ` · não deu: ${failed.map((x) => x.name).join(", ")}` : ""}${why ? ` · ${why}` : ""}`;
            c.say(no ? (created.length || failed.length ? `${no} · ${sent}` : no) : `${sent}.`);
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
        // A video that may freeze stays out of the backgrounds (Rodada O, O11 = B).
        const bad = m.type === "video" && codecHint(codecOfRow(m));
        if (bad) { c.say(bad); return; }
        try {
            await keryx.entities.Media.create({ title: m.title || "Fundo", type: m.type, file_url: m.file_url, category: "background", duration: m.duration || 0 });
            setView("grid");
            setSel({ kind: m.type, value: m.file_url });
            c.say(`"${m.title || "Arquivo"}" está nos fundos.`);
        } catch (err) { c.say(err?.message || "Não foi possível trazer da Mídia."); }
    };
    const done = (result) => onDone(result);
    // A video that may freeze on the screens is not picked for anything new
    // (a theme, the Fundo, a song): it says why and how to convert it.
    const take = (spec = sel) => {
        const s = cleanSpec(spec);
        if (!s) return;
        // The background the request came with may be confirmed as it is.
        const bad = s.kind === "video" && !(start && sameBg(start, s)) && codecHint(codecOf(s.value));
        if (bad) { c.say(bad); return; }
        done({ spec: s });
    };
    const takeTheme = (t = selTheme) => { if (t) done({ theme: t }); };

    // The picture or clip entries of this tab, with their settings.
    const entries = list.filter((b) => b.kind === tab);
    const storedCats = usePrefs().background_categories;
    const cats = useMemo(() => categoriesOf(entries, storedCats), [entries, storedCats]);
    // A chip that went away (a category emptied or renamed) leaves its
    // filter: back to Todos.
    useEffect(() => { if (filter !== ALL && !cats.includes(filter)) setFilter(ALL); }, [filter, cats]);
    const shown = visibleBackgrounds(entries, filter === ALL ? {} : { only: filter });

    // Selecting several (multiSelect.js, owner 2026-10-21, M3 = A): only when
    // the library is opened to manage, never as a picker with Usar, and only
    // on Imagens and Vídeos (Gerados and Cor have nothing to take out). A
    // plain click still chooses the one shown in the side panel ("air" mode:
    // it clears the marks); Ctrl/Shift + click and Selecionar vários mark.
    const selectable = Boolean(request.manage) && (tab === "image" || tab === "video") && view === "grid";
    const shownKeys = useMemo(() => shown.map((b) => b.source), [shown]);
    const allKeys = useMemo(() => list.map((b) => b.source), [list]);
    const ms = useMultiSelect({ order: shownKeys, existing: allKeys, mode: "air", register: false });
    const clearMarks = ms.clear;
    useEffect(() => { clearMarks(); }, [tab, filter, view, clearMarks]);
    const picked = selectable ? pickedOf(ms.sel, shown, (b) => b.source) : [];
    // What the marked ones get (owner 2026-10-22/23): Excluir… with the trash
    // when a factory photo or a file sent here is among them (they go for
    // good), else Tirar dos fundos… with the x — the same ONE question either way.
    const pickedAction = backgroundAction(backgroundRemoval(picked));
    // Every one marked: ONE question that splits the origins (backgroundRemoval;
    // factory photos out for good, files sent here deleted, Mídia pictures only
    // out of the backgrounds). Each row counts by its own result: a file whose
    // delete failed keeps its settings (prefsAfterDelete), and a Mídia picture
    // whose settings could not go is not said to have left.
    const removeMany = async (rows = picked) => {
        const plan = backgroundRemoval(rows);
        const question = backgroundQuestion(plan);
        if (!question) return;
        if (!(await confirm(question))) return;
        const done = { exclude: 0, delete: 0, untrack: 0, failed: 0 };
        const left = [];
        const each = async (kind, list, fn) => {
            for (const b of list) {
                let ok = false;
                try { ok = (await fn(b)) !== false; } catch { ok = false; }
                if (ok) { done[kind]++; left.push(b); } else done.failed++;
            }
        };
        // Through the library's own save (useSaveBackgroundPref): a single
        // action racing this one never makes a second BackgroundPref row.
        await each("exclude", plan.exclude, (b) => save(b, { hidden: true, favorite: false }));
        const deleted = [];
        await each("delete", plan.delete, async (b) => { await keryx.entities.Media.delete(b.mediaId); deleted.push(b); });
        for (const id of prefsAfterDelete(deleted, backgroundMedia)) await keryx.entities.BackgroundPref.delete(id).catch(() => {});
        await each("untrack", plan.untrack, (b) => (b.pref?.id ? keryx.entities.BackgroundPref.delete(b.pref.id) : true));
        if (sel && left.some((b) => b.url === sel.value)) setSel(null);
        ms.clear();
        c.say(backgroundSay(done));
    };
    if (escRef) escRef.current = () => { if (ms.count || ms.picking) { ms.clear(); return true; } return false; };

    const entry = sel && (sel.kind === "image" || sel.kind === "video") ? list.find((b) => b.source === sourceOf(sel.value)) || null : null;

    // The sample: the choice as it goes on air (the picture's own dim and
    // blur from its settings; a theme's text look on a theme).
    const previewArgs = themeMode ? themeBackgroundArgs(selTheme) : sel ? { ...bgArgs(sel, ""), ...(entry && sel.dim === undefined && entry.dim !== null ? { dim: entry.dim } : {}), ...(entry && sel.blur === undefined && entry.blur !== null ? { blur: entry.blur } : {}) } : null;
    const doc = useMemo(() => sampleDoc(keryx.live.now(), previewArgs, themeMode && selTheme ? themeStyle(selTheme) : {}), [JSON.stringify(previewArgs), selTheme]); // eslint-disable-line react-hooks/exhaustive-deps
    // Gerados: the background alone, big and moving.
    const big = tab === "generator";
    // Imagens and Vídeos keep their chips on screen and scroll only the grid
    // (Rodada Q, Q2; as the Mídia's .mv-body).
    const fixedChips = (tab === "image" || tab === "video") && view === "grid";
    const bigDoc = useMemo(() => {
        if (!big || !previewArgs) return null;
        const t = keryx.live.now();
        try { return applyOp(emptyState(t), "background.set", previewArgs, t); } catch { return null; }
    }, [big, JSON.stringify(previewArgs)]); // eslint-disable-line react-hooks/exhaustive-deps

    const title = request.title || (themeMode ? "Escolher tema" : "Escolher fundo");
    const can = themeMode ? Boolean(selTheme) : Boolean(cleanSpec(sel));
    const label = themeMode ? (selTheme ? themeName(selTheme) : "Nenhum tema escolhido") : sel ? (entry ? entry.name : bgLabel(sel, GEN_NAMES)) : "Nenhum fundo escolhido";

    return (
        <>
            <div className="scrim is-dim lib-scrim" onClick={() => done(null)} />
            <div className="lib-dialog" role="dialog" aria-label={title}>
                <div className="win-bar kx-win-bar">
                    <span className="kx-section win-title kx-win-title">{title}</span>
                    <WinTabs label="Biblioteca de fundos" options={tabs} value={tab} onChange={setTab} />
                    <span className="win-gap kx-win-gap" />
                    {(kinds.includes("image") || kinds.includes("video")) && <>
                        {(tab === "image" || tab === "video") && <Btn small on={view === "media"} onClick={() => setView(view === "media" ? "grid" : "media")} title="Usar como fundo uma imagem ou vídeo que já está na Mídia">Trazer da Mídia…</Btn>}
                        <Btn small disabled={uploading} onClick={() => fileRef.current?.click()}><Icon name="download" />{uploading ? "Enviando…" : "Do computador…"}</Btn>
                        <input ref={fileRef} type="file" multiple hidden accept={[kinds.includes("image") && "image/*,.gif", kinds.includes("video") && "video/mp4,video/webm"].filter(Boolean).join(",")} onChange={(e) => { const files = Array.from(e.target.files || []); e.target.value = ""; if (files.length) upload(files); }} />
                    </>}
                    <IconBtn name="x" title="Fechar · Esc" onClick={() => done(null)} />
                </div>
                <div className="lib-body">
                    <div className={`lib-main ${big ? "is-gen" : ""} ${fixedChips ? "is-fixed" : ""}`}>
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
                                            <span className="fg-img"><ThemeThumb theme={t} />{themeMode && <NoBgMark theme={t} label />}</span>
                                            {(t.is_default || t.pinned || themeName(t, "")) && <span className="fg-name">{t.is_default && <Icon name="star" size={12} />}{t.pinned && <Icon name="pin" size={12} />}{themeName(t, "")}</span>}
                                        </button>
                                    );
                                })}
                                {!(themeMode ? themes : withBg).length && <span className="kx-meta">Nenhum tema ainda. Crie um em Configurações › Temas e fundos › Novo tema…</span>}
                            </div>
                        )}
                        {(tab === "image" || tab === "video") && view === "categories" && <FundoCategories c={c} entries={list} onDone={() => setView("grid")} />}
                        {(tab === "image" || tab === "video") && view === "media" && (
                            <>
                                <div className="listhead"><span className="kx-section">Da Mídia <span className="kx-count">· clique para trazer para os fundos (a Mídia continua com o arquivo)</span></span></div>
                                <div className="lib-grid">
                                    {mediaOfTab.map((m) => (
                                        <button type="button" key={m.id} className="kx-t fg-tile" aria-label={m.title} title={m.title} onClick={() => bring(m)} {...(m.type === "video" ? hover.props(m.id) : {})}>
                                            <span className="fg-img">{m.type === "video" ? <ClipThumb src={m.file_url} hot={hover.hot === m.id} /> : <img src={tileUrl(m)} alt="" loading="lazy" decoding="async" />}</span>
                                            <span className="fg-name">{m.title}</span>
                                            {m.type === "video" && <CodecMark row={m} />}
                                        </button>
                                    ))}
                                    {!mediaOfTab.length && <span className="kx-meta">Nada na Mídia para trazer.</span>}
                                </div>
                            </>
                        )}
                        {(tab === "image" || tab === "video") && view === "grid" && <>
                            <FilterChips options={[[ALL, "Todos"], ...cats.map((k) => [k, k])]} value={filter} onChange={setFilter} onEdit={() => setView("categories")}>
                                {selectable && <SelectManyBtn on={ms.picking} onToggle={ms.setPicking} />}
                            </FilterChips>
                            {selectable && <SelBar count={picked.length} total={shownKeys.length} onAll={ms.all} onClear={ms.clear}>
                                <Btn small onClick={() => removeMany()} title="Os de fábrica e os enviados do computador saem de vez · os da Mídia só saem dos fundos · Delete"><Icon name={pickedAction.icon} />{pickedAction.label}</Btn>
                            </SelBar>}
                            <div className="lib-scroll"><div className={`lib-grid ${selectable && ms.picking ? "is-picking" : ""}`} onKeyDown={selectable ? (e) => ms.keyDown(e, { onDelete: removeMany }) : undefined}>
                                {shown.map((b) => {
                                    const on = sel?.kind === b.kind && sourceOf(sel.value) === b.source;
                                    const waiting = pending.has(b.url);
                                    const tip = `${b.name}${b.origin === "keryx" ? " · vem com o KERYX" : b.origin === "media" ? " · também na Mídia" : ""}${waiting ? ` · ${SYNC_WAIT_HINT}` : ""}`;
                                    return (
                                        <button type="button" key={b.source} className={`kx-t fg-tile ${on ? "is-on" : ""} ${selectable && ms.has(b.source) ? "is-marked" : ""}`} aria-pressed={on} aria-label={`${b.name}${selectable && ms.has(b.source) ? ", selecionado" : ""}`} title={tip}
                                            onClick={(e) => { if (selectable && ms.click(b.source, e)) return; if (waiting) c.say(PENDING_SAY); else setSel({ kind: b.kind, value: b.url }); }}
                                            onDoubleClick={() => { if (!waiting && !ms.picking) take({ kind: b.kind, value: b.url }); }} onContextMenu={(e) => tileMenu(e, b)} {...(b.kind === "video" && !waiting ? hover.props(b.source) : {})}>
                                            <span className="fg-img">{waiting ? <SyncWait /> : b.kind === "video" ? <ClipThumb src={b.url} hot={hover.hot === b.source} /> : <img src={b.thumb} alt="" loading="lazy" decoding="async" />}{b.kind === "video" && <span className="fg-kind"><Icon name="film" size={12} /></span>}{selectable && ms.picking && <RowMark />}</span>
                                            <span className="fg-name">{b.favorite && <Icon name="star" size={12} />}{b.name}</span>
                                            {b.kind === "video" && <CodecMark src={b.url} />}
                                        </button>
                                    );
                                })}
                                {!shown.length && <span className="kx-meta">{tab === "video" ? "Nenhum vídeo. Envie um do computador (MP4 ou WebM); ele toca em loop, sem som." : "Nenhuma imagem nesta categoria."}</span>}
                            </div></div>
                        </>}
                        {tab === "generator" && (
                            <div className="lib-big">
                                <div className="ap-sample lib-big-screen">{bigDoc ? <ScreenRenderer state={bigDoc} preview motion /> : <span className="kx-meta">Escolha um gerador abaixo.</span>}</div>
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
                        {/* A generator and the chosen video move here (muted, in loop; Rodada Q, Q3). */}
                        <div className="ap-sample lib-sample">{doc && <ScreenRenderer state={doc} preview motion />}</div>
                        <div className="lib-label"><span className="kx-meta">Escolhido</span><span className="t">{label}</span></div>
                        {entry && <FundoDetail key={entry.source} b={entry} save={save} sample={false}
                            categories={managedCategories(storedCats, list)} onCategories={() => setView("categories")} />}
                    </div>}
                </div>
                <div className="lib-foot">
                    {request.allowNone && <Btn small onClick={() => done({ none: true })}>{request.noneLabel || (themeMode ? "Sem tema" : "Sem fundo")}</Btn>}
                    <span style={{ flex: 1 }} />
                    {request.manage
                        ? <Btn small onClick={() => done(null)}>Fechar</Btn>
                        : <><Btn small kind="brand" disabled={!can} onClick={() => (themeMode ? takeTheme() : take())}>{request.useLabel || "Usar"}</Btn>
                            <Btn small onClick={() => done(null)}>Cancelar</Btn></>}
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
// The factory look (no theme): the example text as the renderer draws it
// with nothing chosen, for the Temas padrão boxes (audit C-43).
export function FactoryThumb() {
    const doc = useMemo(() => sampleDoc(keryx.live.now()), []);
    return doc ? <span className="lib-thumb"><ScreenRenderer state={doc} preview /></span> : null;
}

export function ThemeThumb({ theme }) {
    const waiting = themePending(theme, usePendingMedia());
    const doc = useMemo(() => (waiting ? null : sampleDoc(keryx.live.now(), themeBackgroundArgs(theme), themeStyle(theme))), [theme, waiting]);
    if (waiting) return <span className="lib-thumb is-wait"><SyncWait /></span>;
    return doc ? <span className="lib-thumb"><ScreenRenderer state={doc} preview /></span> : null;
}
