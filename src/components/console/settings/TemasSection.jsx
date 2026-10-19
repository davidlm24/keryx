import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, Empty } from "../kx";
import { CfgKey, CfgGroup } from "./parts";
import { ThemeThumb, FactoryThumb, NoBgMark } from "../library/BackgroundLibrary";
import { useContextMenu } from "../ContextMenu";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";
import { sizeLabel } from "@/lib/textSize";
import { THEME_FONTS, defaultTheme, defaultChanges, themeForKind, THEME_KINDS, KIND_FIELD, themeName, themeHasBackground } from "@/lib/console/themes";
import { bgFields } from "@/lib/console/backgroundSpec";
import { useLibraryPicker, ALL_KINDS } from "../library/libraryContext";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { openEditor } from "@/lib/editorWindow";
import { categoryList } from "@/lib/console/backgroundPrefs";
import { fontStack, themesUsingFont } from "@/lib/fonts";
import { useChurchFonts } from "../useConsoleData";
import { useChurch } from "@/hooks/useChurch";
import ScreenRenderer from "@/components/screen/ScreenRenderer";
import { IDLE_SCREEN } from "@/components/editor/ScreensMenu";
import { emptyState } from "@shared/live-state.mjs";
import { themesSummary, fundosSummary, idleSummary, fontsSummary } from "@/lib/console/cfgSummaries";

const FONT = Object.fromEntries(THEME_FONTS);

// Temas padrão (owner's decision 2026-10-13, as in SPresenter): one theme per
// kind of content — Música (the theme marked padrão), Bíblia, Texto and
// Timer (on the profile; empty = the same as Música) — each a small screen;
// a click chooses it in the library, in theme mode. What is on air does not
// change: the theme dresses what is sent from then on.
function KindThemes({ c, themes, setDefault }) {
    const prefs = usePrefs();
    const pick = useLibraryPicker();
    const ids = { bible: prefs.bible_theme_id, text: prefs.text_theme_id, tool: prefs.timer_theme_id };
    const def = defaultTheme(themes);
    const choose = async (kind, name) => {
        const field = KIND_FIELD[kind];
        const own = field ? ids[kind] : def?.id || "";
        const r = await pick({ accept: "theme", title: `Tema padrão · ${name}`, value: own && own !== "none" ? own : null, allowNone: true, noneLabel: field ? "O mesmo das músicas" : "Estilo de fábrica (sem tema)" });
        if (!r || (!r.theme && !r.none)) return;
        if (!field) { setDefault(r.theme ? r.theme.id : null); return; }
        updateUser({ [field]: r.theme ? r.theme.id : "" })
            .then(() => c.say(r.theme ? `${name}: tema ${themeName(r.theme)}.` : `${name}: o mesmo tema das músicas.`))
            .catch(() => c.say("Não foi possível salvar o tema."));
    };
    return (
        <CfgGroup id="temas.padrao" k="Temas padrão" fold={false}>
            <div className="tmg tmg-kinds">
                {THEME_KINDS.map(([kind, name]) => {
                    const field = KIND_FIELD[kind];
                    const t = themeForKind(themes, kind, ids);
                    const same = field && !ids[kind];
                    const what = t ? themeName(t) : "Estilo de fábrica";
                    return (
                        <button type="button" key={kind} className="kx-t fg-tile tmg-tile" onClick={() => choose(kind, name)} aria-label={`Tema padrão de ${name}: ${what}`} title={`${name} · clique para escolher o tema`}>
                            <span className="tmg-kind">{name}</span>
                            <span className="fg-img">{t ? <ThemeThumb theme={t} /> : <FactoryThumb />}</span>
                            <span className="fg-name">{what}</span>
                            <span className="kx-meta tmg-meta">{same ? "o mesmo das músicas" : kind === "lyrics" ? "" : "próprio"}</span>
                        </button>
                    );
                })}
            </div>
        </CfgGroup>
    );
}

// Configurações › Temas: the LIST of the projection presets — the default
// one per kind (KindThemes), the themes as small screens, Tornar padrão and
// Excluir. Editing happens in ONE place, the Editor de temas (a page of the
// window, pushed over this one): a click on a theme, the context menu's
// Editar and "Novo tema…" open it. Camadas adjusts what is on air and
// captures a theme with "Salvar como novo"; the console's Temas card
// applies them.
export default function TemasSection({ c, onOpenScreen }) {
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["settings", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    useEffect(() => keryx.entities.ProjectionTheme.subscribe(() => client.invalidateQueries({ queryKey: ["settings", "themes"] })), [client]);
    const reload = () => client.invalidateQueries({ queryKey: ["settings", "themes"] });
    const storedCats = usePrefs().background_categories;
    const run = async (p, message) => {
        try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível."); }
        reload();
    };
    // Opens in the same window, one level in: "← Temas" (Rodada C).
    const edit = (id) => { const r = openEditor({ theme: id || "new", from: "Temas" }); if (r?.error) c.say(r.error); };
    // One transaction: never two defaults, never none in between.
    const setDefault = (id) => {
        const rows = defaultChanges(themes, id);
        if (!rows.length) return;
        const t = themes.find((x) => x.id === id);
        run(keryx.entities.ProjectionTheme.bulkUpdate(rows), t ? `${themeName(t)} é o tema padrão.` : "Sem tema padrão: vale o estilo de fábrica.");
    };
    const makeDefault = (t) => setDefault(t.id);
    // Excluir asks first (ConfirmDialog.jsx), as in the console's menus.
    const confirm = useConfirm();
    const remove = async (t) => {
        if (!(await confirm(deleteQuestion("o tema", themeName(t), "Quem usa este tema volta ao padrão.")))) return;
        run(keryx.entities.ProjectionTheme.delete(t.id), "Tema excluído.");
    };
    // A theme saved before backgrounds were required (owner 2026-10-14): its
    // background from the library, without opening the Editor.
    const pick = useLibraryPicker();
    const chooseBg = async (t) => {
        const r = await pick({ accept: ALL_KINDS, title: "Fundo do tema" });
        if (r?.spec) run(keryx.entities.ProjectionTheme.update(t.id, bgFields(r.spec)), "Fundo do tema salvo.");
    };
    const menu = useContextMenu();
    const themeMenu = (e, t) => menu(e, { title: themeName(t), items: [
        { label: "Editar", icon: "edit", onSelect: () => edit(t.id) },
        ...(themeHasBackground(t) ? [] : [{ label: "Escolher fundo…", icon: "image", onSelect: () => chooseBg(t) }]),
        { label: t.is_default ? "É o tema padrão" : "Tornar padrão", icon: "star", disabled: Boolean(t.is_default), onSelect: () => makeDefault(t) },
        { label: t.pinned ? "Tirar do console" : "Fixar no console", icon: "pin", onSelect: () => run(keryx.entities.ProjectionTheme.update(t.id, { pinned: !t.pinned }), t.pinned ? `${themeName(t)} saiu do console.` : `${themeName(t)} fixado no console.`) },
        { label: "Excluir…", icon: "trash", onSelect: () => remove(t) },
    ] });

    const catList = categoryList(storedCats);
    return (
        <>
            <KindThemes c={c} themes={themes} setDefault={setDefault} />
            <CfgGroup id="temas.todos" k="Todos os temas" summary={themesSummary(themes)} actions={<Btn small kind="brand" onClick={() => edit("new")}>Novo tema…</Btn>}>
                {/* The themes as small screens, as in the library (owner's request
                    2026-10-13); a click edits in the Editor de temas e layouts. */}
                <div className="tmg" role="list" aria-label="Temas">
                    {themes.map((t) => (
                        <button type="button" key={t.id} role="listitem" className="kx-t fg-tile tmg-tile" aria-label={themeName(t)}
                            title={`${themeName(t)} · clique para editar · botão direito: mais opções`} onClick={() => edit(t.id)} onContextMenu={(e) => themeMenu(e, t)}>
                            <span className="fg-img"><ThemeThumb theme={t} /><NoBgMark theme={t} label /></span>
                            {(t.is_default || themeName(t, "")) && <span className="fg-name">{t.is_default && <Icon name="star" size={12} />}{themeName(t, "")}</span>}
                            <span className="kx-meta tmg-meta">{[FONT[t.font_family] || t.font_family || "Sem serifa", sizeLabel(t.font_size)].filter(Boolean).join(" · ")}</span>
                        </button>
                    ))}
                </div>
                {!themes.length && <Empty icon="palette" title="Nenhum tema ainda">Use "Novo tema…": o tema se monta no Editor de temas.</Empty>}
            </CfgGroup>
            {/* The backgrounds live in the library (BackgroundLibrary, manage
                mode); this is its door in Configurações — it was Aparência's
                until the section dissolved (Rodada B 2026-10-14). The
                categories are edited in the library too (owner 2026-10-16):
                the row opens it on them. */}
            <CfgGroup id="temas.fundos" k="Fundos" summary={fundosSummary(catList)} actions={<Btn small onClick={() => pick({ title: "Fundos", manage: true })}>Abrir a biblioteca de fundos</Btn>}>
                <CfgKey k="Categorias de fundos" className="kx-row">
                    <span className="kx-glyph"><Icon name="image" /></span>
                    <span className="kx-row-main"><span className="kx-row-title">Categorias de fundos</span><span className="kx-row-meta">{catList.join(" · ")}</span></span>
                    <Btn small onClick={() => pick({ title: "Fundos", manage: true, view: "categories" })}>Editar…</Btn>
                </CfgKey>
            </CfgGroup>
            <IdleScreen c={c} onOpenScreen={onOpenScreen} />
            <ChurchFonts c={c} themes={themes} />
        </>
    );
}

// Tela ociosa (owner 2026-10-19; moved here from Telas e saídas in Rodada H1,
// "Tela ociosa mova para Temas e fundos"): what every screen shows with
// nothing on air and no papel de parede — the whole app's, a card like the
// outputs' whose click opens it in the Editor de telas. The still shows what
// the screens show then. Culto › Fora do ar points to it.
function IdleScreen({ c, onOpenScreen }) {
    const church = useChurch();
    const summary = idleSummary(c.live?.idle, Boolean(c.live?.idleLook));
    return (
        <CfgGroup id="temas.ociosa" k="Tela ociosa" summary={summary}>
            <div className="cfg-grid" role="list" aria-label="Tela ociosa">
                <div role="listitem" className="cfg-card">
                    <button type="button" className="kx-t cfg-card-thumb" onClick={() => onOpenScreen?.(IDLE_SCREEN)} title="Editar a tela ociosa no Editor">
                        <div className="cfg-prev"><div className="cfg-prev-fill"><ScreenRenderer fill state={{ ...emptyState(0), idle: c.live?.idle === "black" ? "black" : "logo", idleLook: c.live?.idleLook ?? null }} logoUrl={church.logo} preview audio={false} /></div></div>
                    </button>
                    <div className="cfg-card-h">
                        <Icon name="monitor" />
                        <span className="cfg-card-t">Tela ociosa</span>
                    </div>
                    <span className="kx-meta cfg-card-m">{summary}</span>
                </div>
            </div>
        </CfgGroup>
    );
}

// Fontes da igreja (Rodada HF1): the families copied into the library from
// the PC or a font file (Media rows of category font, one per face; the
// Editor de temas' Fonte picker brings them in), each with its faces and
// size. Excluir asks first and is refused while a theme names the family
// (the themes are listed), so no theme is left pointing at nothing.
const bytesOf = (n) => (n >= 1e6 ? `${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB` : n > 0 ? `${Math.max(1, Math.round(n / 1e3))} KB` : "");
function ChurchFonts({ c, themes }) {
    const { families } = useChurchFonts();
    const confirm = useConfirm();
    const remove = async (f) => {
        const used = themesUsingFont(themes, f.family);
        if (used.length) { c.say(`A fonte ${f.family} está em uso: ${used.map((t) => themeName(t)).join(", ")}. Troque a fonte desses temas antes de excluí-la.`); return; }
        if (!(await confirm(deleteQuestion("a fonte", f.family, "Os arquivos dela saem da pasta de mídia desta igreja, em todos os computadores.")))) return;
        try {
            for (const m of f.rows) await keryx.entities.Media.delete(m.id);
            c.say(`Fonte ${f.family} excluída.`);
        } catch (err) { c.say(err?.message || "Não foi possível excluir a fonte."); }
    };
    return (
        <CfgGroup id="temas.fontes" k="Fontes da igreja" summary={fontsSummary(families.length)} actions={<Btn small onClick={() => openEditor({ theme: "new", from: "Temas" })}>Trazer no Editor de temas…</Btn>}>
            {families.map((f) => (
                <div key={f.family} className="kx-row" role="listitem">
                    <span className="kx-glyph"><Icon name="text" /></span>
                    <span className="kx-row-main">
                        <span className="kx-row-title" style={{ fontFamily: fontStack(f.family) }}>{f.family}</span>
                        <span className={`kx-row-meta ${f.missing || f.syncing ? "kx-warn" : ""}`}>{[f.faces.join(", "), bytesOf(f.bytes), f.syncing ? "Baixando…" : f.missing ? "arquivo não encontrado" : ""].filter(Boolean).join(" · ")}</span>
                    </span>
                    <Btn small onClick={() => remove(f)}>Excluir…</Btn>
                </div>
            ))}
            {!families.length && <div className="kx-row"><span className="kx-row-main"><span className="kx-row-meta">Nenhuma ainda. No Editor de temas, em Fonte › Trazer, escolha uma fonte do computador ou um arquivo .ttf/.otf: ela é copiada para a igreja, em todas as telas.</span></span></div>}
        </CfgGroup>
    );
}
