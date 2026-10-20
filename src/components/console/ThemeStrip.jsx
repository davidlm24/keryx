import React, { useEffect } from "react";
import { keryx } from "@/api/keryxClient";
import Icon from "./Icon";
import { ThemeThumb, NoBgMark, NO_BG_HINT, themePending, SYNC_WAIT_HINT } from "./library/BackgroundLibrary";
import { usePendingMedia } from "@/hooks/usePendingMedia";
import { PENDING_SAY } from "@/lib/pendingMedia";
import { consoleThemes, defaultTheme, defaultChanges, themeName, themeNote, themeHasBackground } from "@/lib/console/themes";
import { bgFields } from "@/lib/console/backgroundSpec";
import { pickTheme, applyThemeOnAir, songInHand } from "./themeActions";
import { useContextMenu } from "./ContextMenu";
import { useConfirm, deleteQuestion } from "./ConfirmDialog";
import { useLibraryPicker, ALL_KINDS } from "./library/libraryContext";
import { serviceTheme } from "@/lib/console/serviceLook";
import { updateUser } from "@/hooks/useUser";
import { openEditor } from "@/lib/editorWindow";
import { menuItem } from "@/lib/console/menuLabels";

// Temas (owner's decisions 2026-10-13/14, as Holyrics' theme column; its
// own module under Camadas since the 2026-10-14 review): the pinned themes
// (consoleThemes) as small screens. A click makes it the theme in use (it dresses what is on air and
// everything sent afterwards), a double click opens the theme in the Editor
// de temas e layouts, and the rest lives in the right-click menu; the whole
// library is one button away. "Salvar tema para a música" makes the song in
// hand always go on air with it (Song.theme_id); "Usar neste culto" makes it
// the culto's theme (Service.theme_id), which becomes the theme in use when
// the culto is chosen. An unnamed theme shows no caption (review 2026-10-14).
// A new theme in the Editor de temas: the Temas panel's + (Console.jsx); it
// is saved only with a background from the library (owner 2026-10-14). A
// theme saved before without one keeps working as it did and wears a mark
// (NoBgMark), with "Escolher fundo…" in its menu.
export function newTheme(c) {
    const r = openEditor({ theme: "new" });
    if (r?.error) c.say(r.error);
}

// The panel's slots: 9 pinned themes (3 × 3), the rest empty with a + (owner
// 2026-10-14; the body shows only thumbnails, the header's + is the menu).
export const TEMAS_SLOTS = 9;

export default function ThemeStrip({ c, themes, songs, service, ensureService, menuRef, view = {}, setView, onSettings }) {
    const shown = consoleThemes(themes, TEMAS_SLOTS);
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
    // A theme whose background the sync has not brought yet waits for it:
    // applied now, the screens would show a broken picture.
    const pending = usePendingMedia();
    const inUse = (t) => {
        if (themePending(t, pending)) { c.say(PENDING_SAY); return; }
        pickTheme(c, t);
        c.say(`${named(t)} em uso.`);
    };
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
    const chooseBg = async (t) => {
        const r = await pick({ accept: ALL_KINDS, title: "Fundo do tema" });
        if (r?.spec) run(keryx.entities.ProjectionTheme.update(t.id, bgFields(r.spec)), "Fundo do tema salvo.");
    };
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
        { label: "Aplicar no ar", icon: "play", onSelect: () => (themePending(t, pending) ? c.say(PENDING_SAY) : applyThemeOnAir(c, t)) },
        { label: "Editar tema…", icon: "edit", onSelect: () => edit(t.id) },
        ...(themeHasBackground(t) ? [] : [{ label: "Escolher fundo…", icon: "image", onSelect: () => chooseBg(t) }]),
        ...(song ? [song.theme_id === t.id
            ? { label: "Tirar tema da música", onSelect: () => saveForSong("") }
            : { label: "Salvar tema para a música", onSelect: () => saveForSong(t.id) }] : []),
        { label: t.id === def?.id ? "É o tema padrão" : "Tornar padrão", icon: "star", disabled: t.id === def?.id, onSelect: () => run(keryx.entities.ProjectionTheme.bulkUpdate(defaultChanges(themes, t.id)), `${named(t)} é o tema padrão.`) },
        { label: "Usar na Bíblia", onSelect: () => run(updateUser({ bible_theme_id: t.id }), `Bíblia: tema ${themeName(t)}.`) },
        { label: service ? "Usar neste culto" : "Usar hoje", disabled: cultoTheme === t.id, onSelect: () => setForCulto(t) },
        { label: t.pinned ? "Tirar do console" : "Fixar no console", icon: "pin", onSelect: () => run(keryx.entities.ProjectionTheme.update(t.id, { pinned: !t.pinned }), t.pinned ? `${named(t)} saiu do console.` : `${named(t)} fixado no console.`) },
        menuItem("excluir", { onSelect: () => removeTheme(t) }),
    ] });
    const thumb = view.thumb === "large" ? "large" : "small";
    const names = view.names !== false;
    // The header's + (Console.jsx): what can be done with the theme in use
    // and the song in hand, and how the panel shows itself. The library
    // button beside it is where the 9 are pinned.
    const plusMenu = (e) => menu(e, { title: "Temas", items: [
        { label: "Novo tema…", icon: "plus", onSelect: () => newTheme(c) },
        ...(onSettings ? [{ label: "Configurações › Temas e fundos…", icon: "sliders", onSelect: () => onSettings("temas") }] : []),
        ...(song ? [songTheme && (!current || current.id === songTheme.id)
            ? { label: "Tirar tema da música", onSelect: () => saveForSong("") }
            : { label: "Salvar tema para a música", disabled: !current, onSelect: () => saveForSong(current.id) }] : []),
        "sep",
        { label: service ? "Usar neste culto" : "Usar hoje", disabled: !current || cultoTheme === current?.id, onSelect: () => setForCulto(current) },
        ...(cultoTheme && c.themeId !== cultoTheme ? [{ label: "Seguir o culto", icon: "undo", onSelect: () => c.setThemeId(cultoTheme) }] : []),
        { label: current && current.id === def?.id ? "É o tema padrão" : "Tornar padrão", icon: "star", disabled: !current || current.id === def?.id, onSelect: () => run(keryx.entities.ProjectionTheme.bulkUpdate(defaultChanges(themes, current.id)), `${named(current)} é o tema padrão.`) },
        "sep",
        { label: "Miniaturas pequenas", icon: thumb === "small" ? "check" : undefined, onSelect: () => setView?.({ temasThumb: "small" }) },
        { label: "Miniaturas grandes", icon: thumb === "large" ? "check" : undefined, onSelect: () => setView?.({ temasThumb: "large" }) },
        { label: "Mostrar nomes", icon: names ? "check" : undefined, onSelect: () => setView?.({ temasNames: !names }) },
    ] });
    useEffect(() => {
        if (!menuRef) return undefined;
        menuRef.current = { menu: plusMenu, library: openThemeLibrary };
        return () => { if (menuRef.current?.menu === plusMenu) menuRef.current = null; };
    });
    const slots = Array.from({ length: TEMAS_SLOTS }, (_, k) => shown[k] || null);
    return (
        <div className="tm" style={{ gridColumn: "1 / -1" }}>
            <div className={`tm-grid is-${thumb}`} role="list" aria-label="Temas">
                {slots.map((t, k) => <span key={t ? t.id : `empty-${k}`} role="listitem" className="tm-slot">{t ? (
                    <button type="button" className={`kx-t fg-tile tm-tile ${current?.id === t.id ? "is-on" : ""}`} aria-pressed={current?.id === t.id} aria-label={themeName(t)}
                        title={`${themeName(t)}${t.id === def?.id ? " · tema padrão" : ""}${themeHasBackground(t) ? "" : ` · ${NO_BG_HINT}`}${themePending(t, pending) ? ` · fundo ${SYNC_WAIT_HINT}` : ""}${themeNote(t) ? `
${themeNote(t)}
` : " · "}clique: fica em uso (veste o ar e o que for enviado) · duplo clique: editar`}
                        onClick={() => inUse(t)} onDoubleClick={() => edit(t.id)} onContextMenu={(e) => themeMenu(e, t)}>
                        <span className="fg-img"><ThemeThumb theme={t} /><NoBgMark theme={t} /></span>
                        {names && (t.id === def?.id || themeName(t, "")) && <span className="fg-name">{t.id === def?.id && <Icon name="star" size={12} />}{themeName(t, "")}</span>}
                    </button>
                ) : (
                    <button type="button" className="kx-t tm-empty" onClick={() => newTheme(c)} title="Novo tema · na biblioteca, o clique direito fixa um tema aqui" aria-label="Novo tema"><Icon name="plus" /></button>
                )}</span>)}
            </div>
        </div>
    );
}
