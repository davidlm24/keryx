import React from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn } from "./kx";
import { ThemeThumb } from "./library/BackgroundLibrary";
import { consoleThemes, defaultTheme, defaultChanges, themeName } from "@/lib/console/themes";
import { pickTheme, applyThemeOnAir, songInHand } from "./themeActions";
import { useContextMenu } from "./ContextMenu";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { useLibraryPicker } from "./library/libraryContext";
import { serviceTheme } from "@/lib/console/serviceLook";
import { updateUser } from "@/hooks/useUser";
import { openEditor } from "@/lib/editorWindow";

// Camadas › Temas (owner's decisions 2026-10-13/14, as Holyrics' theme
// column): the pinned themes (consoleThemes) as small screens at the top of
// Camadas. A click makes it the theme in use (it dresses what is on air and
// everything sent afterwards), a double click opens the theme in the Editor
// de temas e layouts, and the rest lives in the right-click menu; the whole
// library is one button away. "Salvar tema para a música" makes the song in
// hand always go on air with it (Song.theme_id); "Usar neste culto" makes it
// the culto's theme (Service.theme_id), which becomes the theme in use when
// the culto is chosen. An unnamed theme shows no caption (review 2026-10-14).
export default function ThemeStrip({ c, themes, songs, service, ensureService }) {
    const shown = consoleThemes(themes);
    const def = defaultTheme(themes);
    const song = songInHand(c, songs);
    const songTheme = song?.theme_id ? themes.find((t) => t.id === song.theme_id) || null : null;
    // The one ringed: the last applied, else the song's own, else the default.
    const current = themes.find((t) => t.id === c.themeId) || songTheme || def;
    const pick = useLibraryPicker();
    // Clicking makes a theme the one in use — it dresses everything sent
    // until someone changes it — without writing the culto's theme, which
    // only seeds it when the culto is chosen.
    const cultoTheme = serviceTheme(service);
    const named = (t) => (themeName(t, "") ? `Tema ${themeName(t)}` : "Tema");
    const inUse = (t) => { pickTheme(c, t); c.say(`${named(t)} em uso.`); };
    const setForCulto = async (t) => {
        try {
            const sid = service?.id || await ensureService?.();
            if (!sid) return;
            await keryx.entities.Service.update(sid, { theme_id: t.id });
            c.setThemeId(t.id);
            c.say(`${named(t)} é o tema ${service ? "do culto" : "de hoje"}.`);
        } catch (err) { c.say(err?.message || "Não foi possível gravar o tema do culto."); }
    };
    const edit = (id) => { const r = openEditor({ theme: id }); if (r?.error) c.say(r.error); };
    const openThemeLibrary = async () => {
        const r = await pick({ accept: "theme", title: "Temas", value: current?.id || null });
        if (r?.theme) pickTheme(c, r.theme);
    };
    const saveForSong = async (themeId) => {
        const t = themes.find((x) => x.id === themeId);
        try {
            await keryx.entities.Song.update(song.id, { theme_id: themeId });
            c.say(themeId ? `"${song.title}" vai ao ar sempre com ${themeName(t || current, "") ? `o tema ${themeName(t || current)}` : "este tema"}.` : `"${song.title}" volta ao tema padrão.`);
        } catch (err) { c.say(err?.message || "Não foi possível salvar o tema da música."); }
    };
    // Right click on a theme: everything that can be done with it from here.
    const menu = useContextMenu();
    const run = (p, message) => p.then(() => c.say(message)).catch((err) => c.say(err?.message || "Não foi possível."));
    const confirm = useConfirm();
    const removeTheme = async (t) => {
        if (!(await confirm(deleteQuestion("o tema", themeName(t), "Quem usa este tema volta ao padrão.")))) return;
        if (c.themeId === t.id) c.setThemeId(null);
        run(keryx.entities.ProjectionTheme.delete(t.id), "Tema excluído.");
    };
    const themeMenu = (e, t) => menu(e, { title: themeName(t), items: [
        { label: "Aplicar no ar", icon: "play", onSelect: () => applyThemeOnAir(c, t) },
        { label: "Editar tema…", icon: "edit", onSelect: () => edit(t.id) },
        ...(song ? [song.theme_id === t.id
            ? { label: "Tirar tema da música", onSelect: () => saveForSong("") }
            : { label: "Salvar tema para a música", onSelect: () => saveForSong(t.id) }] : []),
        { label: t.id === def?.id ? "É o tema padrão" : "Tornar padrão", icon: "star", disabled: t.id === def?.id, onSelect: () => run(keryx.entities.ProjectionTheme.bulkUpdate(defaultChanges(themes, t.id)), `${named(t)} é o tema padrão.`) },
        { label: "Usar na Bíblia", onSelect: () => run(updateUser({ bible_theme_id: t.id }), "As passagens vão ao ar com este tema.") },
        { label: service ? "Usar neste culto" : "Usar hoje", disabled: cultoTheme === t.id, onSelect: () => setForCulto(t) },
        { label: t.pinned ? "Tirar do console" : "Fixar no console", icon: "pin", onSelect: () => run(keryx.entities.ProjectionTheme.update(t.id, { pinned: !t.pinned }), t.pinned ? `${named(t)} saiu do console.` : `${named(t)} fixado no console.`) },
        { label: "Excluir…", icon: "trash", onSelect: () => removeTheme(t) },
    ] });
    return (
        <div className="tm" style={{ gridColumn: "1 / -1" }}>
            {!themes.length
                ? <span className="kx-meta">Nenhum tema ainda. Crie um: o texto e o fundo das letras ficam prontos num clique.</span>
                : (
                    <div className="tm-grid" role="list" aria-label="Temas">
                        {shown.map((t) => (
                            <button type="button" key={t.id} role="listitem" className={`kx-t fg-tile tm-tile ${current?.id === t.id ? "is-on" : ""}`} aria-pressed={current?.id === t.id} aria-label={themeName(t)}
                                title={`${themeName(t)}${t.id === def?.id ? " · tema padrão" : ""} · clique: fica em uso (veste o ar e o que for enviado) · duplo clique: editar`}
                                onClick={() => inUse(t)} onDoubleClick={() => edit(t.id)} onContextMenu={(e) => themeMenu(e, t)}>
                                <span className="fg-img"><ThemeThumb theme={t} now={c.now} /></span>
                                {(t.id === def?.id || themeName(t, "")) && <span className="fg-name">{t.id === def?.id && <Icon name="star" size={12} />}{themeName(t, "")}</span>}
                            </button>
                        ))}
                    </div>
                )}
            {Boolean(cultoTheme) && c.themeId !== cultoTheme && (
                <div className="tm-song">
                    <span className="kx-meta">tema do culto: <b>{themeName(themes.find((t) => t.id === cultoTheme), "tema apagado")}</b></span>
                    <Btn small onClick={() => c.setThemeId(cultoTheme)} title="Voltar ao tema que o culto usa">Seguir o culto</Btn>
                </div>
            )}
            <div className="tm-acts">
                {themes.length > shown.length && <Btn small onClick={openThemeLibrary} title="Todos os temas; o clique direito fixa um no console">Biblioteca de temas…</Btn>}
                <Btn small onClick={() => edit("new")}><Icon name="plus" />Novo tema…</Btn>
            </div>
            {song && (
                <div className="tm-song">
                    <span className="kx-meta" title={song.title}>{songTheme ? <>“{song.title}” segue o tema <b>{themeName(songTheme)}</b></> : <>“{song.title}”</>}</span>
                    {songTheme && (!current || current.id === songTheme.id)
                        ? <Btn small onClick={() => saveForSong("")} title="A música volta a ir ao ar com o tema padrão">Tirar tema da música</Btn>
                        : <Btn small disabled={!current} onClick={() => saveForSong(current.id)} title="A música vai ao ar sempre com este tema">Salvar tema para a música</Btn>}
                </div>
            )}
        </div>
    );
}
