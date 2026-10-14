import React, { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keryx } from "@/api/keryxClient";
import Icon from "../Icon";
import { Btn, Empty } from "../kx";
import { CfgKey } from "./parts";
import { ThemeThumb, NoBgMark } from "../library/BackgroundLibrary";
import { useContextMenu } from "../ContextMenu";
import { useConfirm, deleteQuestion } from "../ConfirmDialog";
import { THEME_FONTS, TEXT_SIZES, defaultTheme, defaultChanges, themeForKind, THEME_KINDS, KIND_FIELD, themeName, themeHasBackground } from "@/lib/console/themes";
import { bgFields } from "@/lib/console/backgroundSpec";
import { useLibraryPicker, ALL_KINDS } from "../library/libraryContext";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { openEditor } from "@/lib/editorWindow";

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
            .then(() => c.say(r.theme ? `${name}: tema ${themeName(r.theme)}.` : `${name}: o mesmo tema das músicas.`))
            .catch(() => c.say("Não foi possível salvar o tema."));
    };
    return (
        <>
            <CfgKey k="Temas padrão" className="listhead"><span className="kx-section">Temas padrão <span className="kx-count">· um por tipo de conteúdo</span></span></CfgKey>
            <div className="tmg tmg-kinds">
                {THEME_KINDS.map(([kind, name]) => {
                    const field = KIND_FIELD[kind];
                    const t = themeForKind(themes, kind, ids);
                    const same = field && !ids[kind];
                    const what = t ? themeName(t) : "Estilo de fábrica";
                    return (
                        <button type="button" key={kind} className="kx-t fg-tile tmg-tile" onClick={() => choose(kind, name)} aria-label={`Tema padrão de ${name}: ${what}`} title={`${name} · clique para escolher o tema`}>
                            <span className="tmg-kind">{name}</span>
                            <span className="fg-img">{t ? <ThemeThumb theme={t} now={c.now} /> : <span className="tmg-plus" />}</span>
                            <span className="fg-name">{what}</span>
                            <span className="kx-meta tmg-meta">{same ? "o mesmo das músicas" : kind === "lyrics" ? "" : "próprio"}</span>
                        </button>
                    );
                })}
            </div>
        </>
    );
}

// Configurações › Temas: the LIST of the projection presets — the default
// one per kind (KindThemes), the themes as small screens, Tornar padrão and
// Excluir. Editing happens in ONE place, the Editor de temas e layouts (its
// own window, src/pages/Editor.jsx): a click on a theme, the context menu's
// Editar and "Novo tema…" open it. Camadas adjusts what is on air and
// captures a theme with "Salvar como novo"; the console's Temas card
// applies them.
export default function TemasSection({ c }) {
    const client = useQueryClient();
    const themes = useQuery({ queryKey: ["settings", "themes"], queryFn: () => keryx.entities.ProjectionTheme.list("name") }).data || [];
    useEffect(() => keryx.entities.ProjectionTheme.subscribe(() => client.invalidateQueries({ queryKey: ["settings", "themes"] })), [client]);
    const reload = () => client.invalidateQueries({ queryKey: ["settings", "themes"] });
    const run = async (p, message) => {
        try { await p; if (message) c.say(message); } catch (err) { c.say(err?.message || "Não foi possível."); }
        reload();
    };
    const edit = (id) => { const r = openEditor({ theme: id || "new" }); if (r?.error) c.say(r.error); };
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

    return (
        <>
            <KindThemes c={c} themes={themes} setDefault={setDefault} />
            <CfgKey k="Todos os temas" className="listhead"><span className="kx-section">Todos os temas</span><span style={{ flex: 1 }} /><Btn small kind="brand" onClick={() => edit("new")}>Novo tema…</Btn></CfgKey>
            {/* The themes as small screens, as in the library (owner's request
                2026-10-13); a click edits in the Editor de temas e layouts. */}
            <div className="tmg" role="list" aria-label="Temas">
                {themes.map((t) => (
                    <button type="button" key={t.id} role="listitem" className="kx-t fg-tile tmg-tile" aria-label={themeName(t)}
                        title={`${themeName(t)} · clique para editar · botão direito: mais opções`} onClick={() => edit(t.id)} onContextMenu={(e) => themeMenu(e, t)}>
                        <span className="fg-img"><ThemeThumb theme={t} now={c.now} /><NoBgMark theme={t} label /></span>
                        {(t.is_default || themeName(t, "")) && <span className="fg-name">{t.is_default && <Icon name="star" size={12} />}{themeName(t, "")}</span>}
                        <span className="kx-meta tmg-meta">{[FONT[t.font_family] || t.font_family || "Sem serifa", SIZE[t.font_size] || "G"].filter(Boolean).join(" · ")}</span>
                    </button>
                ))}
            </div>
            {!themes.length && <Empty icon="palette" title="Nenhum tema ainda">Use "Novo tema…", ou ajuste o texto em Camadas e salve como novo.</Empty>}
        </>
    );
}
