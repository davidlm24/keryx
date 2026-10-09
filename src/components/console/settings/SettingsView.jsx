import React from "react";
import Icon from "../Icon";
import { Panel, Btn, Row } from "../kx";
import TelasSection from "./TelasSection";
import RedeSection from "./RedeSection";
import BibliasSection from "./BibliasSection";
import IgrejaSection from "./IgrejaSection";
import TemasSection from "./TemasSection";
import LetrasSection from "./LetrasSection";
import DadosSection from "./DadosSection";

export const SECTIONS = [
    ["telas", "monitor", "Telas e saídas", TelasSection],
    ["rede", "wifi", "Telas na rede", RedeSection],
    ["biblias", "book", "Bíblias instaladas", BibliasSection],
    ["igreja", "logo", "Igreja", IgrejaSection],
    ["temas", "palette", "Temas", TemasSection],
    ["letras", "music", "Letras", LetrasSection],
    ["dados", "save", "Dados e atualizações", DadosSection],
];
export const sectionIds = SECTIONS.map(([id]) => id);

// Configurações, inside the console (canvas artboard 20): the sections on the
// left, the chosen one on the right. The top bar, the emergency glyphs and
// the live keys stay as on the console; nothing here changes what is on air
// (Tela ociosa only changes an idle screen). Replaces the old Settings page,
// with its appearance options gone (the app has one look; the church logo
// stays, under Igreja).
export default function SettingsView({ c, section, setSection, onClose }) {
    const current = SECTIONS.find(([id]) => id === section) || SECTIONS[0];
    const Body = current[3];
    return (
        <>
            <div className="col" style={{ flex: "0 0 280px" }}>
                <Panel title="Configurações" actions={<Btn small onClick={onClose} title="Voltar ao console · Esc"><Icon name="arrow-left" />Voltar ao console</Btn>} bodyStyle={{ display: "flex", flexDirection: "column" }}>
                    {SECTIONS.map(([id, icon, name]) => (
                        <Row key={id} single icon={icon} title={name} state={id === current[0] ? "is-selected" : ""} onClick={() => setSection(id)} />
                    ))}
                </Panel>
            </div>
            <div className="kx-gap" />
            <div className="col center cfg">
                <Panel title={current[2]} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
                    <Body c={c} />
                </Panel>
            </div>
        </>
    );
}
