import React from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn } from "./kx";
import { ThemeThumb } from "./library/BackgroundLibrary";
import { themeStyle, themeBackgroundArgs, defaultTheme, defaultChanges } from "@/lib/console/themes";
import { useContextMenu } from "./ContextMenu";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { updateUser } from "@/hooks/useUser";
import { STYLE_KEYS, layerLocked } from "@shared/live-state.mjs";

// A theme as a stage for the Prévia: example text in its look over its
// background (stage.theme: sending it applies the theme, useConsole.send).
const SAMPLE_TEXT = [{ text: "Grande é o Senhor\ne mui digno de louvor" }];
export const themeSampleStage = (theme) => ({
    kind: "text", id: `theme:${theme.id}`, title: `Tema · ${theme.name}`, meta: "Exemplo do tema", slides: SAMPLE_TEXT, index: 0, theme,
    op: "content.show", args: { kind: "text", title: theme.name, slides: SAMPLE_TEXT, style: themeStyle(theme), ...(themeBackgroundArgs(theme) ? { fundo: themeBackgroundArgs(theme) } : {}) },
});

// A click on a theme (the Temas card): with text on air, it dresses it at
// once (applyThemeOnAir); with nothing on air, an example goes to the
// Prévia so the look can be seen before it is used (owner's request
// 2026-10-13); Enviar ao ar then applies it.
export function pickTheme(c, theme) {
    if (!theme) return;
    if (c.cur?.content) applyThemeOnAir(c, theme);
    else { c.setThemeId(theme.id); c.setPrev(themeSampleStage(theme)); }
}

// A theme on what is on air, at once (Camadas' Restaurar, the menu's
// Aplicar no ar): its text look on the text on air (the item's title choice
// kept), its background on the Fundo — unless Camadas' padlock holds the
// Fundo. With nothing on air the theme still sets the Fundo, as in Holyrics.
export async function applyThemeOnAir(c, theme) {
    if (!theme) return;
    c.setThemeId(theme.id);
    const content = c.cur?.content;
    try {
        if (content) {
            const style = { ...(content.style || {}), ...themeStyle(theme) };
            await c.callOp("content.update", { style: Object.fromEntries(Object.entries(style).filter(([k]) => STYLE_KEYS.includes(k))) });
        }
        const bg = themeBackgroundArgs(theme);
        if (bg && !layerLocked(c.cur, "background")) await c.callOp("background.set", bg);
    } catch { /* callOp said why (the screens locked, say) */ }
}

// The song a theme can be saved for: the one on air, else the one in the
// Prévia; null when neither is a song.
export function songInHand(c, songs) {
    const id = c.cur?.content?.ref?.songId || c.prev?.args?.ref?.songId || null;
    return id ? (songs || []).find((s) => s.id === id) || null : null;
}

// Temas (owner's request 2026-10-12, as in Holyrics): the church's themes as
// small screens beside the console. A click dresses what is on air, a double
// click opens the theme in Configurações; "Salvar tema para a música" makes
// the song in hand always go on air with it (Song.theme_id).
export default function ThemesCard({ c, themes, songs, onEdit, onNew }) {
    const def = defaultTheme(themes);
    const song = songInHand(c, songs);
    const songTheme = song?.theme_id ? themes.find((t) => t.id === song.theme_id) || null : null;
    // The one ringed: the last applied, else the song's own, else the default.
    const current = themes.find((t) => t.id === c.themeId) || songTheme || def;
    const saveForSong = async (themeId) => {
        const t = themes.find((x) => x.id === themeId);
        try {
            await keryx.entities.Song.update(song.id, { theme_id: themeId });
            c.say(themeId ? `"${song.title}" vai ao ar sempre com o tema ${t?.name || current?.name}.` : `"${song.title}" volta ao tema padrão.`);
        } catch (err) { c.say(err?.message || "Não foi possível salvar o tema da música."); }
    };
    // Right click on a theme: everything that can be done with it from here.
    const menu = useContextMenu();
    const run = (p, message) => p.then(() => c.say(message)).catch((err) => c.say(err?.message || "Não foi possível."));
    const confirm = useConfirm();
    const removeTheme = async (t) => {
        if (!(await confirm(deleteQuestion("o tema", t.name, "Músicas e saídas que usam este tema voltam ao padrão.")))) return;
        if (c.themeId === t.id) c.setThemeId(null);
        run(keryx.entities.ProjectionTheme.delete(t.id), "Tema excluído.");
    };
    const themeMenu = (e, t) => menu(e, { title: t.name, items: [
        { label: "Aplicar no ar", icon: "play", onSelect: () => applyThemeOnAir(c, t) },
        { label: "Editar tema…", icon: "edit", onSelect: () => onEdit(t.id) },
        ...(song ? [song.theme_id === t.id
            ? { label: "Tirar tema da música", onSelect: () => saveForSong("") }
            : { label: `Salvar para "${song.title}"`, onSelect: () => saveForSong(t.id) }] : []),
        { label: t.id === def?.id ? "É o tema padrão" : "Tornar padrão", icon: "star", disabled: t.id === def?.id, onSelect: () => run(keryx.entities.ProjectionTheme.bulkUpdate(defaultChanges(themes, t.id)), `${t.name} é o tema padrão.`) },
        { label: "Usar na Bíblia", onSelect: () => run(updateUser({ bible_theme_id: t.id }), `As passagens vão ao ar com o tema ${t.name}.`) },
        { label: "Excluir…", icon: "trash", onSelect: () => removeTheme(t) },
    ] });
    if (!themes.length) {
        return (
            <div className="tm-empty">
                <span className="kx-meta">Nenhum tema ainda. Ajuste o texto e o fundo em Camadas e use "Salvar como novo", ou crie um tema.</span>
                <Btn small onClick={onNew}><Icon name="plus" />Novo tema…</Btn>
            </div>
        );
    }
    return (
        <div className="tm">
            <div className="tm-grid" role="list" aria-label="Temas">
                {themes.map((t) => (
                    <button type="button" key={t.id} role="listitem" className={`kx-t fg-tile tm-tile ${current?.id === t.id ? "is-on" : ""}`} aria-pressed={current?.id === t.id} aria-label={t.name}
                        title={`${t.name}${t.id === def?.id ? " · tema padrão" : ""} · clique: aplica no texto no ar (sem nada no ar, mostra um exemplo na Prévia) · duplo clique ou botão direito: editar`}
                        onClick={() => pickTheme(c, t)} onDoubleClick={() => onEdit(t.id)} onContextMenu={(e) => themeMenu(e, t)}>
                        <span className="fg-img"><ThemeThumb theme={t} now={c.now} /></span>
                        <span className="fg-name">{t.id === def?.id && <Icon name="star" size={12} />}{t.name}</span>
                    </button>
                ))}
            </div>
            {song && (
                <div className="tm-song">
                    <span className="kx-meta" title={song.title}>{songTheme ? <>“{song.title}” segue o tema <b>{songTheme.name}</b></> : <>“{song.title}”</>}</span>
                    {songTheme && (!current || current.id === songTheme.id)
                        ? <Btn small onClick={() => saveForSong("")} title="A música volta a ir ao ar com o tema padrão">Tirar tema da música</Btn>
                        : <Btn small disabled={!current} onClick={() => saveForSong(current.id)} title="A música vai ao ar sempre com este tema">Salvar tema para a música</Btn>}
                </div>
            )}
        </div>
    );
}
