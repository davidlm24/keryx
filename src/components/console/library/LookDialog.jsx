import React, { createContext, useContext } from "react";
import Icon from "../Icon";
import { Btn, IconBtn } from "../kx";
import BgChip from "./BgChip";
import { ThemeThumb } from "./BackgroundLibrary";
import { useLibraryPicker } from "./libraryContext";
import { useThemes } from "../useConsoleData";
import { usePrefs } from "@/hooks/useUser";
import { THEME_KINDS, themeForKind } from "@/lib/console/themes";
import { lookOf } from "@/lib/console/serviceLook";

// Visual do culto (owner's decision 2026-10-13): a service's own background
// and its theme per kind of content (Música, Bíblia, Texto, Timer), over the
// church's Temas padrão and Fundo padrão. One window for the service in hand
// (the Setlist's header; with no service yet it starts the day's draft, as
// adding the first item does), Planejar o culto and the service templates.
//   openLook({ kind: "service" | "template", id, title }) — Console.jsx holds it.
export const LookContext = createContext(null);
const nothing = () => {};
export const useLookEditor = () => useContext(LookContext) || nothing;

// The tiles: the background, then one small screen per kind; a kind with no
// theme of its own shows the church's, said so. onChange(look) saves.
export function LookTiles({ c, look, onChange, what = "do culto" }) {
    const themes = useThemes();
    const prefs = usePrefs();
    const pick = useLibraryPicker();
    const church = { bible: prefs.bible_theme_id, text: prefs.text_theme_id, tool: prefs.timer_theme_id };
    const own = look.kind_themes || {};
    const choose = async (kind, name) => {
        const r = await pick({ accept: "theme", title: `${name} ${what}`, value: own[kind] || null, allowNone: Boolean(own[kind]), noneLabel: "Usar o tema padrão da igreja" });
        if (!r || (!r.theme && !r.none)) return;
        const next = { ...own };
        if (r.theme) next[kind] = r.theme.id;
        else delete next[kind];
        onChange({ ...look, kind_themes: next });
    };
    return (
        <div className="look">
            <div className="look-row">
                <span className="kx-section">Fundo {what}</span>
                <BgChip value={look.background} title={`Fundo ${what}`} empty="o fundo padrão da igreja" noneLabel={look.background ? "Sem fundo próprio (usa o da igreja)" : undefined}
                    onPick={(spec) => onChange({ ...look, background: spec || null })} />
            </div>
            <div className="tmg tmg-kinds look-kinds">
                {THEME_KINDS.map(([kind, name]) => {
                    const mine = own[kind] ? themes.find((t) => t.id === own[kind]) || null : null;
                    const t = mine || themeForKind(themes, kind, church);
                    return (
                        <button type="button" key={kind} className={`kx-t fg-tile tmg-tile ${mine ? "is-on" : ""}`} onClick={() => choose(kind, name)} aria-label={`Tema de ${name} ${what}: ${t ? t.name : "estilo de fábrica"}`} title={`${name} · clique para escolher`}>
                            <span className="tmg-kind">{name}</span>
                            <span className="fg-img">{t ? <ThemeThumb theme={t} now={c.now} /> : <span className="tmg-plus">Estilo de fábrica</span>}</span>
                            <span className="fg-name">{t ? t.name : "Estilo de fábrica"}</span>
                            <span className="kx-meta tmg-meta">{mine ? `próprio ${what}` : "o padrão da igreja"}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// The window: the row's look, saved at each choice (save(look) -> Promise).
export default function LookDialog({ c, title, row, save, onClose, note, what = "do culto" }) {
    return (
        <>
            <div className="scrim is-dim look-scrim" onClick={onClose} />
            <div className="look-dialog" role="dialog" aria-label={title}>
                <div className="cfg-dialog-h">
                    <span className="kx-section">{title}</span>
                    <span className="cfg-h-gap" />
                    <IconBtn name="x" title="Fechar · Esc" onClick={onClose} />
                </div>
                <div className="look-body">
                    {note && <div className="kx-meta look-note"><Icon name="clock" size={12} />{note}</div>}
                    <LookTiles c={c} look={lookOf(row)} onChange={save} what={what} />
                    <span className="kx-meta">Os itens com tema próprio (uma música com o seu tema) continuam com ele. O que já está no ar não muda.</span>
                </div>
                <div className="lib-foot"><span style={{ flex: 1 }} /><Btn small onClick={onClose}>Fechar</Btn></div>
            </div>
        </>
    );
}
