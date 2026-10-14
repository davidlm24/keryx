import React from "react";
import { Btn } from "../kx";
import { ThemeThumb } from "./BackgroundLibrary";
import { useLibraryPicker } from "./libraryContext";
import { useThemes } from "../useConsoleData";
import { themeName } from "@/lib/console/themes";

// A culto's (or a template's) theme as a chip, beside its Fundo do culto
// (BgChip): what is chosen and a button that opens the library on Temas
// (owner's review 2026-10-14: one theme per culto, picked from the library;
// it becomes the theme in use when the culto is chosen). onPick(id): "" is
// "no theme of its own".
export default function ThemeChip({ value, onPick, title = "Tema do culto", empty = "o tema em uso", now }) {
    const pick = useLibraryPicker();
    const themes = useThemes();
    const t = value ? themes.find((x) => x.id === value) || null : null;
    const open = async () => {
        const r = await pick({ accept: "theme", title, value: t?.id || null, allowNone: Boolean(value), noneLabel: "Sem tema próprio" });
        if (r?.none) onPick("");
        else if (r?.theme) onPick(r.theme.id);
    };
    return (
        <span className="bgchip">
            {t ? <span className="bgchip-t is-theme"><ThemeThumb theme={t} now={now ?? 0} /></span> : <span className="bgchip-t is-none" />}
            <span className="bgchip-l">{t ? themeName(t) : value ? "tema apagado" : empty}</span>
            <Btn small onClick={open}>{t ? "Trocar…" : "Escolher…"}</Btn>
        </span>
    );
}
