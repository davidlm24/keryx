import React from "react";
import { updateUser } from "@/hooks/useUser";

// "Temas das músicas" (owner 2026-10-30, S2 = A): the church's switch
// (User.song_themes, synced). On, a song goes out with its own theme; off,
// every song with the theme in use in the Temas panel (content.js). In the
// Temas panel's header — the small switch of the Autoplay — and its + menu.
export const SONG_THEMES_SAY = {
    on: "Temas das músicas ligados: cada música vai ao ar com o seu tema.",
    off: "Temas das músicas desligados: toda música vai ao ar com o tema em uso.",
};

export async function setSongThemesPref(on, say) {
    try {
        await updateUser({ song_themes: on ? null : false });
        say?.(on ? SONG_THEMES_SAY.on : SONG_THEMES_SAY.off);
    } catch (err) { say?.(err?.message || "Não foi possível mudar os temas das músicas."); }
}

export default function SongThemesSwitch({ on, say }) {
    const tip = on ? "Temas das músicas ligados: cada música vai ao ar com o seu tema · clique para usar só o tema em uso" : "Temas das músicas desligados: toda música vai ao ar com o tema em uso · clique para usar o tema de cada música";
    return (
        <button type="button" className="rund-auto tm-songs" role="switch" aria-checked={Boolean(on)} aria-label="Temas das músicas" title={tip} onClick={() => setSongThemesPref(!on, say)}>
            <span className={`sw2 kx-switch kx-switch-sm ${on ? "is-on" : ""}`} aria-hidden="true" /><span className="rund-auto-l">Das músicas</span>
        </button>
    );
}
