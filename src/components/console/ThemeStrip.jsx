import React from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { Btn } from "./kx";
import { ThemeThumb } from "./library/BackgroundLibrary";
import { consoleThemes, defaultTheme, defaultChanges } from "@/lib/console/themes";
import { pickTheme, applyThemeOnAir, songInHand } from "./themeActions";
import { useContextMenu } from "./ContextMenu";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { useLibraryPicker } from "./library/libraryContext";
import { useLookEditor } from "./library/LookDialog";
import { cleanKindThemes } from "@/lib/console/serviceLook";
import { updateUser } from "@/hooks/useUser";
import { openEditor } from "@/lib/editorWindow";

// Temas as presets of the Fundo layer (owner's decisions 2026-10-13, as
// Holyrics' theme column; before, a console card of its own): the pinned
// themes (consoleThemes) as small screens inside Camadas › Fundo. A click
// dresses what is on air, a double click opens the theme in the Editor de
// temas e layouts, and the rest lives in the right-click menu; the whole
// library is one button away. "Salvar tema para a música" makes the song in
// hand always go on air with it (Song.theme_id).
export default function ThemeStrip({ c, themes, songs, service, ensureService }) {
    const shown = consoleThemes(themes);
    const def = defaultTheme(themes);
    const song = songInHand(c, songs);
    const songTheme = song?.theme_id ? themes.find((t) => t.id === song.theme_id) || null : null;
    // The one ringed: the last applied, else the song's own, else the default.
    const current = themes.find((t) => t.id === c.themeId) || songTheme || def;
    const pick = useLibraryPicker();
    const openLook = useLookEditor();
    // The hybrid (owner's decision 2026-10-13): clicking makes a theme the
    // one in use — it dresses everything sent until someone changes it —
    // without writing the service's preset; the preset only seeds it.
    const cultoLyrics = cleanKindThemes(service?.kind_themes).lyrics || "";
    const inUse = (t) => { pickTheme(c, t); c.say(`Tema ${t.name} em uso.`); };
    const saveToCulto = async (t) => {
        try {
            const sid = service?.id || await ensureService?.();
            if (!sid) return;
            await keryx.entities.Service.update(sid, { kind_themes: cleanKindThemes({ ...(service?.kind_themes || {}), lyrics: t.id }) });
            c.setThemeId(t.id);
            c.say(`${t.name} gravado no visual ${service ? "do culto" : "de hoje"}.`);
        } catch (err) { c.say(err?.message || "Não foi possível gravar no visual do culto."); }
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
        { label: "Editar tema…", icon: "edit", onSelect: () => edit(t.id) },
        ...(song ? [song.theme_id === t.id
            ? { label: "Tirar tema da música", onSelect: () => saveForSong("") }
            : { label: `Salvar para "${song.title}"`, onSelect: () => saveForSong(t.id) }] : []),
        { label: t.id === def?.id ? "É o tema padrão" : "Tornar padrão", icon: "star", disabled: t.id === def?.id, onSelect: () => run(keryx.entities.ProjectionTheme.bulkUpdate(defaultChanges(themes, t.id)), `${t.name} é o tema padrão.`) },
        { label: "Usar na Bíblia", onSelect: () => run(updateUser({ bible_theme_id: t.id }), `As passagens vão ao ar com o tema ${t.name}.`) },
        { label: service ? "Salvar no visual do culto" : "Salvar no visual de hoje", disabled: cultoLyrics === t.id, onSelect: () => saveToCulto(t) },
        { label: t.pinned ? "Tirar do console" : "Fixar no console", icon: "pin", onSelect: () => run(keryx.entities.ProjectionTheme.update(t.id, { pinned: !t.pinned }), t.pinned ? `${t.name} saiu da camada Fundo.` : `${t.name} fixado na camada Fundo.`) },
        { label: "Excluir…", icon: "trash", onSelect: () => removeTheme(t) },
    ] });
    return (
        <div className="tm" style={{ gridColumn: "1 / -1" }}>
            {!themes.length
                ? <span className="kx-meta">Nenhum tema ainda. Crie um: o texto e o fundo das letras ficam prontos num clique.</span>
                : (
                    <div className="tm-grid" role="list" aria-label="Temas">
                        {shown.map((t) => (
                            <button type="button" key={t.id} role="listitem" className={`kx-t fg-tile tm-tile ${current?.id === t.id ? "is-on" : ""}`} aria-pressed={current?.id === t.id} aria-label={t.name}
                                title={`${t.name}${t.id === def?.id ? " · tema padrão" : ""} · clique: fica em uso (veste o ar e tudo que for enviado) · duplo clique ou botão direito: editar`}
                                onClick={() => inUse(t)} onDoubleClick={() => edit(t.id)} onContextMenu={(e) => themeMenu(e, t)}>
                                <span className="fg-img"><ThemeThumb theme={t} now={c.now} /></span>
                                <span className="fg-name">{t.id === def?.id && <Icon name="star" size={12} />}{t.name}</span>
                            </button>
                        ))}
                    </div>
                )}
            {Boolean(c.themeId) && c.themeId !== cultoLyrics && (
                <div className="tm-song">
                    <span className="kx-meta">{cultoLyrics ? <>o culto gravou: <b>{themes.find((t) => t.id === cultoLyrics)?.name || "tema apagado"}</b></> : <>o culto não gravou tema</>}</span>
                    <Btn small onClick={() => c.setThemeId(cultoLyrics || null)} title="Voltar ao tema que o Visual do culto gravou">Seguir o culto</Btn>
                </div>
            )}
            <div className="tm-acts">
                <Btn small onClick={() => openLook({ kind: "service", id: service?.id || null })} title={service ? "O fundo e os temas deste culto (Música, Bíblia, Texto, Timer)" : "O fundo e os temas de hoje · cria a setlist de hoje"}>{service ? "Visual do culto…" : "Visual de hoje…"}</Btn>
                {themes.length > shown.length && <Btn small onClick={openThemeLibrary} title="Todos os temas; o clique direito fixa um na camada Fundo">Biblioteca de temas…</Btn>}
                <Btn small onClick={() => edit("new")}><Icon name="plus" />Novo tema…</Btn>
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
