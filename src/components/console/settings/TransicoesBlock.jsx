import React from "react";
import { Seg } from "../kx";
import { Switch, CfgKey, FormRow } from "./parts";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { MEDIA_MODES, MEDIA_MS, CLEAR_MODES, CLEAR_MS, PAUSE_MS } from "@/lib/console/transitions";

// Transições (owner 2026-10-16, Rodada F2): how one sound gives way to the
// next and how what leaves the air goes, for every output and network screen
// (User prefs; the console adds them to the ops, transitions.js). Rodada G3
// (owner 2026-10-17): Ao pausar o som, and Ao tirar da tela renamed Ao tirar
// do ar (the player's music leaves with the picture). The slide-to-slide
// transition of the text stays the theme's.
const msOptions = (list) => list.map(([v, label]) => [String(v), label]);
export default function TransicoesBlock({ c }) {
    const prefs = usePrefs();
    const save = (patch, message) => updateUser(patch).then(() => message && c.say(message)).catch(() => c.say("Não foi possível salvar."));
    const mediaFade = prefs.media_transition === "fade";
    const clearFades = prefs.clear_transition === "fade";
    return (
        <>
            <CfgKey k="Transições" className="listhead"><span className="kx-section">Transições</span></CfgKey>
            <div className="frm">
                <FormRow k="Ao pausar o som">
                    <Seg small label="Ao pausar o som" value={String(prefs.pause_fade_ms)} options={msOptions(PAUSE_MS)}
                        onChange={(v) => save({ pause_fade_ms: Number(v) }, Number(v) ? "Pausar e Tocar passam a ser suaves." : "Pausar e Tocar cortam o som na hora.")} />
                    <span className="kx-meta">Pausar e Tocar no player</span>
                </FormRow>
                <FormRow k="Ao tirar do ar">
                    <Seg small label="Ao tirar do ar" value={prefs.clear_transition} options={CLEAR_MODES}
                        onChange={(v) => save({ clear_transition: v }, v === "fade" ? "Esc, Limpar e Parar tiram do ar aos poucos." : "Esc, Limpar e Parar tiram do ar na hora.")} />
                    {clearFades && <Seg small label="Duração ao tirar do ar" value={String(prefs.clear_transition_ms)} options={msOptions(CLEAR_MS)} onChange={(v) => save({ clear_transition_ms: Number(v) })} />}
                    <span className="kx-meta">Esc, Limpar e Parar: a imagem e o som saem juntos</span>
                </FormRow>
                <FormRow k="Entre áudios e vídeos">
                    <Seg small label="Entre áudios e vídeos" value={prefs.media_transition} options={MEDIA_MODES}
                        onChange={(v) => save({ media_transition: v }, v === "mix" ? "Áudios e vídeos tocam juntos, como antes." : v === "cut" ? "Um som novo para o que tocava na hora." : "Um som novo faz o que tocava sumir aos poucos.")} />
                    {mediaFade && <Seg small label="Duração entre áudios e vídeos" value={String(prefs.media_transition_ms)} options={msOptions(MEDIA_MS)} onChange={(v) => save({ media_transition_ms: Number(v) })} />}
                    <span className="kx-meta">Quando um começa, o que tocava para</span>
                </FormRow>
                <FormRow k="Tela preta e Logo">
                    <Switch on={prefs.screen_transition} disabled={!clearFades} onChange={(on) => save({ screen_transition: on }, on ? "Tela preta e Logo entram e saem aos poucos." : "Tela preta e Logo entram e saem na hora.")} label="Tela preta e Logo entram e saem com a transição" />
                    <span className="kx-meta">{clearFades ? "entram e saem com a transição de Ao tirar do ar" : "com Corte em Ao tirar do ar, entram e saem na hora"}</span>
                </FormRow>
            </div>
        </>
    );
}
