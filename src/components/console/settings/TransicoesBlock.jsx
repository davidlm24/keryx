import React from "react";
import { Seg } from "../kx";
import { Switch, CfgKey, FormRow } from "./parts";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { MEDIA_MODES, MEDIA_MS, CLEAR_MODES, CLEAR_MS } from "@/lib/console/transitions";

// Transições (owner 2026-10-16, Rodada F2): how one sound gives way to the
// next and how what leaves the screens goes, for every output and network
// screen (User prefs; the console adds them to the ops, transitions.js). The
// slide-to-slide transition of the text stays the theme's.
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
                <FormRow k="Entre áudios e vídeos">
                    <Seg small label="Entre áudios e vídeos" value={prefs.media_transition} options={MEDIA_MODES}
                        onChange={(v) => save({ media_transition: v }, v === "mix" ? "Áudios e vídeos tocam juntos, como antes." : v === "cut" ? "Um som novo para o que tocava na hora." : "Um som novo faz o que tocava sumir aos poucos.")} />
                    {mediaFade && <Seg small label="Duração entre áudios e vídeos" value={String(prefs.media_transition_ms)} options={msOptions(MEDIA_MS)} onChange={(v) => save({ media_transition_ms: Number(v) })} />}
                    <span className="kx-meta">Quando um começa, o que tocava para</span>
                </FormRow>
                <FormRow k="Ao tirar da tela">
                    <Seg small label="Ao tirar da tela" value={prefs.clear_transition} options={CLEAR_MODES}
                        onChange={(v) => save({ clear_transition: v }, v === "fade" ? "Esc e Limpar tiram da tela aos poucos." : "Esc e Limpar tiram da tela na hora.")} />
                    {clearFades && <Seg small label="Duração ao tirar da tela" value={String(prefs.clear_transition_ms)} options={msOptions(CLEAR_MS)} onChange={(v) => save({ clear_transition_ms: Number(v) })} />}
                    <span className="kx-meta">Esc e Limpar</span>
                </FormRow>
                <FormRow k="Tela preta e Logo">
                    <Switch on={prefs.screen_transition} disabled={!clearFades} onChange={(on) => save({ screen_transition: on }, on ? "Tela preta e Logo entram e saem aos poucos." : "Tela preta e Logo entram e saem na hora.")} label="Tela preta e Logo entram e saem com a transição" />
                    <span className="kx-meta">{clearFades ? "entram e saem com a transição de Ao tirar da tela" : "com Corte em Ao tirar da tela, entram e saem na hora"}</span>
                </FormRow>
            </div>
        </>
    );
}
