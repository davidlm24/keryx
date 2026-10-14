import React from "react";
import { Btn } from "../kx";
import { FormRow, Switch } from "./parts";
import BgChip from "../library/BgChip";
import { useLibraryPicker } from "../library/libraryContext";
import { churchFundo } from "@/lib/console/defaultFundo";
import { useUser, usePrefs, updateUser } from "@/hooks/useUser";
import IdleBlock from "./IdleBlock";


// Aparência › Geral: how the screens look by default, for every service.
// The idle look of the screens and the standby wallpaper they show when
// nothing is on air and the service has none of its own, and the titles.
// On the local profile (User), but the idle look (the live state). The
// transition between slides is the theme's alone (audit 2026-10-14,
// achado nº 4): Editor de temas › Transição.
export default function AparenciaSection({ c }) {
    const user = useUser();
    const prefs = usePrefs();

    const save = async (patch, message) => {
        try {
            await updateUser(patch);
            if (message) c.say(message);
        } catch (err) { c.say(err?.message || "Não foi possível salvar."); }
    };
    // Fundo padrão (src/lib/console/defaultFundo.js): the church's; a
    // service's own (Fundo do culto: the Programa, Planejar o culto) wins
    // while it is the one in hand — and the row says so (owner's OK
    // 2026-10-14, "Fundo em três vias"): the live state's Fundo padrão
    // carries whose it is in its title.
    const pick = useLibraryPicker();
    const church = churchFundo(user);
    const cultoCobre = c.cur?.defaultBackground?.title === "Fundo do culto";

    if (!user) return null;
    return (
        <>
            <div className="frm">
                <FormRow k="Fundo padrão">
                    <BgChip title="Fundo padrão" empty="nenhum · as telas mostram o logo" value={church}
                        noneLabel={church ? "Sem fundo padrão (logo da igreja)" : undefined}
                        onPick={(spec) => save({ default_background: spec || null, standby_background: spec?.kind === "image" ? spec.value : "" }, spec ? "Fundo padrão salvo." : "Sem fundo padrão.")} />
                    <span className="kx-meta">o fundo da igreja: aparece quando nada está no ar e o culto não tem o seu</span>
                    {cultoCobre && <span className="kx-meta" style={{ color: "var(--warn-fg)" }}>Hoje o culto está com um fundo próprio (Programa › Fundo do culto); este fica guardado.</span>}
                </FormRow>
                <FormRow k="Fundos">
                    <Btn small onClick={() => pick({ title: "Fundos", manage: true })}>Abrir a biblioteca…</Btn>
                </FormRow>
                <IdleBlock c={c} />
                <FormRow k="Títulos">
                    <span className="cfg-launch"><Switch on={prefs.show_item_title} onChange={(on) => save({ show_item_title: on }, on ? "O título do item aparece nas telas." : "Sem o título do item nas telas.")} label="Mostrar o título do item nas telas" /><span className="kx-meta">Título do item nas telas</span></span>
                    <span className="cfg-launch"><Switch on={prefs.youtube_hide_title} onChange={(on) => save({ youtube_hide_title: on }, on ? "A faixa de título do YouTube fica escondida." : "O YouTube volta a mostrar o título sobre o vídeo.")} label="Esconder o título que o YouTube põe sobre o vídeo" /><span className="kx-meta">Esconder o título do YouTube</span></span>
                </FormRow>
            </div>
        </>
    );
}
