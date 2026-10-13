import { themeStyle, themeBackgroundArgs } from "@/lib/console/themes";
import { STYLE_KEYS, layerLocked } from "@shared/live-state.mjs";

// What clicking a theme does, shared by the Fundo layer's theme strip
// (ThemeStrip) and Camadas' Restaurar. No rendering here.

// A theme as a stage for the Prévia: example text in its look over its
// background (stage.theme: sending it applies the theme, useConsole.send).
const SAMPLE_TEXT = [{ text: "Grande é o Senhor\ne mui digno de louvor" }];
export const themeSampleStage = (theme) => ({
    kind: "text", id: `theme:${theme.id}`, title: `Tema · ${theme.name}`, meta: "Exemplo do tema", slides: SAMPLE_TEXT, index: 0, theme,
    op: "content.show", args: { kind: "text", title: theme.name, slides: SAMPLE_TEXT, style: themeStyle(theme), ...(themeBackgroundArgs(theme) ? { fundo: themeBackgroundArgs(theme) } : {}) },
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
