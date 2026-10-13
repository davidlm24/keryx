import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, Empty } from "../kx";
import { CfgKey } from "./parts";
import { ThemeThumb } from "../library/BackgroundLibrary";
import { useContextMenu } from "../ContextMenu";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";
import { THEME_FONTS, TEXT_SIZES, defaultTheme, defaultChanges, themeForKind, THEME_KINDS, KIND_FIELD } from "@/lib/console/themes";
import { useThemeEditor } from "../themes/ThemeStudio";
import { useLibraryPicker } from "../library/libraryContext";
import { usePrefs, updateUser } from "@/hooks/useUser";

const SIZE = Object.fromEntries(TEXT_SIZES);
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
            .then(() => c.say(r.theme ? `${name}: tema ${r.theme.name}.` : `${name}: o mesmo tema das músicas.`))
            .catch(() => c.say("Não foi possível salvar o tema."));
    };
    return (
        <>
            <CfgKey k="Temas padrão" className="listhead"><span className="kx-section">Temas padrão <span className="kx-count">· o tema com que cada tipo de conteúdo sem estilo próprio vai ao ar · o que já está no ar não muda</span></span></CfgKey>
            <div className="tmg tmg-kinds">
                {THEME_KINDS.map(([kind, name]) => {
                    const field = KIND_FIELD[kind];
                    const t = themeForKind(themes, kind, ids);
                    const same = field && !ids[kind];
                    const what = t ? t.name : "Estilo de fábrica";
                    return (
                        <button type="button" key={kind} className="kx-t fg-tile tmg-tile" onClick={() => choose(kind, name)} aria-label={`Tema padrão de ${name}: ${what}`} title={`${name} · clique para escolher o tema`}>
                            <span className="tmg-kind">{name}</span>
                            <span className="fg-img">{t ? <ThemeThumb theme={t} now={c.now} /> : <span className="tmg-plus">Estilo de fábrica</span>}</span>
                            <span className="fg-name">{what}</span>
                            <span className="kx-meta tmg-meta">{same ? "o mesmo das músicas" : kind === "lyrics" ? "o tema padrão" : "próprio"}</span>
                        </button>
                    );
                })}
            </div>
        </>
    );
}

// Temas: the projection presets as small screens — each one text +
// background. A click (or Novo tema) opens the theme editor, a window of its
// own (themes/ThemeStudio.jsx; owner's request 2026-10-13). Camadas' "Salvar
// como novo" still works. The backgrounds are managed in the library.
export default function TemasSection({ c }) {
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["settings", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    useEffect(() => keryx.entities.ProjectionTheme.subscribe(() => client.invalidateQueries({ queryKey: ["settings", "themes"] })), [client]);
    const openTheme = useThemeEditor();
    const reload = () => client.invalidateQueries({ queryKey: ["settings", "themes"] });
    const run = async (p, message) => {
        try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível."); }
        reload();
    };
    // One transaction: never two defaults, never none in between.
    const setDefault = (id) => {
        const rows = defaultChanges(themes, id);
        if (!rows.length) return;
        const t = themes.find((x) => x.id === id);
        run(keryx.entities.ProjectionTheme.bulkUpdate(rows), t ? `${t.name} é o tema padrão: músicas e passagens sem estilo próprio vão ao ar com ele.` : "Sem tema padrão: vale o estilo de fábrica.");
    };
    const makeDefault = (t) => setDefault(t.id);
    // Excluir asks first (ConfirmDialog.jsx), as in the console's menus.
    const confirm = useConfirm();
    const remove = async (t) => {
        if (!(await confirm(deleteQuestion("o tema", t.name, "Músicas e saídas que usam este tema voltam ao padrão.")))) return;
        run(keryx.entities.ProjectionTheme.delete(t.id), "Tema excluído.");
    };
    const menu = useContextMenu();
    const themeMenu = (e, t) => menu(e, { title: t.name, items: [
        { label: "Editar", icon: "edit", onSelect: () => openTheme(t.id) },
        { label: t.is_default ? "É o tema padrão" : "Tornar padrão", icon: "star", disabled: Boolean(t.is_default), onSelect: () => makeDefault(t) },
        { label: "Excluir…", icon: "trash", onSelect: () => remove(t) },
    ] });

    return (
        <>
            <KindThemes c={c} themes={themes} setDefault={setDefault} />
            <CfgKey k="Temas" className="listhead"><span className="kx-section">Temas <span className="kx-count">· clique para editar · botão direito: mais opções</span></span><span style={{ flex: 1 }} /><Btn small kind="brand" onClick={() => openTheme("new")}>Novo tema…</Btn></CfgKey>
            {/* The themes as small screens, as in the library; a click opens the editor. */}
            <div className="tmg" role="list" aria-label="Temas">
                {themes.map((t) => (
                    <button type="button" key={t.id} role="listitem" className="kx-t fg-tile tmg-tile" aria-label={t.name}
                        title={`${t.name} · clique para editar · botão direito: mais opções`} onClick={() => openTheme(t.id)} onContextMenu={(e) => themeMenu(e, t)}>
                        <span className="fg-img"><ThemeThumb theme={t} now={c.now} /></span>
                        <span className="fg-name">{t.is_default && <Icon name="star" size={12} />}{t.name}</span>
                        <span className="kx-meta tmg-meta">{[FONT[t.font_family] || t.font_family || "Sem serifa", SIZE[t.font_size] || "G", t.is_default ? "padrão" : ""].filter(Boolean).join(" · ")}</span>
                    </button>
                ))}
                <button type="button" className="kx-t fg-tile tmg-tile tmg-new" onClick={() => openTheme("new")} aria-label="Novo tema">
                    <span className="fg-img"><span className="tmg-plus"><Icon name="plus" />Novo tema</span></span>
                </button>
            </div>
            {!themes.length && <Empty icon="palette" title="Nenhum tema ainda">Crie um em "Novo tema…", ou ajuste o texto em Camadas e use "Salvar como novo".</Empty>}
        </>
    );
}
