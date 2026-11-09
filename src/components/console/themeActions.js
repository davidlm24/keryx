import { themeStyle, themeBackgroundArgs, themeName, themeForKind } from "@/lib/console/themes";
import { getPrefs, updateUser } from "@/hooks/useUser";
import { STYLE_KEYS, layerLocked } from "@shared/live-state.mjs";

// What clicking a theme does, shared by Camadas › Temas (ThemeStrip)
// and Camadas' Restaurar. No rendering here.

// A theme as a stage for the Prévia: example text in its look over its
// background (stage.theme: sending it applies the theme, useConsole.send).
const SAMPLE_TEXT = [{ text: "Grande é o Senhor\ne mui digno de louvor" }];
export const themeSampleStage = (theme) => ({
    kind: "text", id: `theme:${theme.id}`, title: themeName(theme, "") ? `Tema · ${themeName(theme)}` : "Tema", meta: "Exemplo do tema", slides: SAMPLE_TEXT, index: 0, theme,
    op: "content.show", args: { kind: "text", title: themeName(theme, ""), slides: SAMPLE_TEXT, style: themeStyle(theme), ...(themeBackgroundArgs(theme) ? { fundo: themeBackgroundArgs(theme) } : {}) },
});

// A click on a theme: with text on air, it dresses it at once
// (applyThemeOnAir); with nothing on air, an example goes to the Prévia so
// the look can be seen before it is used (owner's request 2026-10-13);
// Enviar ao ar then applies it.
export function pickTheme(c, theme) {
    if (!theme) return;
    if (c.cur?.content) applyThemeOnAir(c, theme);
    else { c.setThemeId(theme.id); c.setPrev(themeSampleStage(theme)); }
}

// A theme on what is on air, at once (Camadas' Restaurar, the menu's
// Aplicar no ar): its text look on the text on air (the item's title choice
// kept), its background on the Fundo — unless Camadas' padlock holds the
// Fundo. With nothing on air the theme still sets the Fundo, as in Holyrics.
// inUse: false for the Tema da Bíblia (its bar under the No ar screen),
// which dresses the passage on air but is not the songs' theme in use.
export async function applyThemeOnAir(c, theme, { inUse = true } = {}) {
    if (!theme) return;
    if (inUse) c.setThemeId(theme.id);
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

// Tema da Bíblia… (the Bíblia's line over No ar, and Música › Bíblia in the
// menu bar): the Bíblia's own theme (User.bible_theme_id), chosen in the
// background library in theme mode; "O mesmo das músicas" is the theme in
// use (c.themeId), as stamp() sends it. The passage on air takes it at once
// (its look and its Fundo, padlock respected), never as the songs' theme in
// use. `getC` returns the console as it is after the picker closes;
// `touchAir` may refuse and say why (by default: only a passage on air,
// screens unlocked).
export async function chooseBibleTheme({ getC, pick, themes, touchAir = () => bibleAirOpen(getC()) }) {
    const prefs = getPrefs();
    const current = themeForKind(themes, "bible", prefs.bible_theme_id, getC().themeId);
    const r = await pick({ accept: "theme", value: prefs.bible_theme_id || current?.id || null, title: "Tema da Bíblia", allowNone: true, noneLabel: "O mesmo das músicas", useLabel: "Usar na Bíblia" });
    const id = r?.theme ? r.theme.id : r?.none ? "" : null;
    if (id === null) return;
    const c = getC();
    updateUser({ bible_theme_id: id }).then(() => c.say(id ? `Bíblia: tema ${themeName(r.theme)}.` : "Bíblia: o mesmo tema das músicas.")).catch(() => c.say("Não foi possível salvar o tema da Bíblia."));
    const theme = r?.theme || themeForKind(themes, "bible", "", c.themeId);
    if (theme && touchAir()) applyThemeOnAir(c, theme, { inUse: false });
}

function bibleAirOpen(c) {
    if (c.cur?.content?.kind !== "bible") return false;
    if (c.locked) { c.say("Telas travadas · a passagem no ar muda quando for enviada de novo."); return false; }
    return true;
}

// The song a theme can be saved for: the one on air, else the one in the
// Prévia; null when neither is a song.
export function songInHand(c, songs) {
    const id = c.cur?.content?.ref?.songId || c.prev?.args?.ref?.songId || null;
    return id ? (songs || []).find((s) => s.id === id) || null : null;
}
