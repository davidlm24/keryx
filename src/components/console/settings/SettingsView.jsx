import React from "react";
import { Panel, Row, IconBtn } from "../kx";
import TelasSection from "./TelasSection";
import RedeSection from "./RedeSection";
import BibliasSection from "./BibliasSection";
import IgrejaSection from "./IgrejaSection";
import TemasSection from "./TemasSection";
import AparenciaSection from "./AparenciaSection";
import LetrasSection from "./LetrasSection";
import DadosSection from "./DadosSection";

export const SECTIONS = [
    ["telas", "monitor", "Telas e saídas", TelasSection],
    ["rede", "wifi", "Telas na rede", RedeSection],
    ["biblias", "book", "Bíblias instaladas", BibliasSection],
    ["igreja", "logo", "Igreja", IgrejaSection],
    ["temas", "palette", "Temas", TemasSection],
    ["aparencia", "image", "Aparência", AparenciaSection],
    ["letras", "music", "Letras", LetrasSection],
    ["dados", "save", "Dados e atualizações", DadosSection],
];
export const sectionIds = SECTIONS.map(([id]) => id);

// Configurações: a window over the console (or the view behind it), closed
// with its X, Esc or a click outside; the sections on the left, the chosen
// one on the right. What is behind stays as it was: nothing here changes what
// is on air (Tela ociosa only changes an idle screen), and behind it only the
// emergency keys act (Console.jsx). The old Settings page's appearance
// options are gone (the app has one look; the church logo is under Igreja).
export default function SettingsView({ c, section, setSection, onClose }) {
    const current = SECTIONS.find(([id]) => id === section) || SECTIONS[0];
    const Body = current[3];
    return (
        <div className="cfg-dialog" role="dialog" aria-modal="true" aria-label="Configurações">
            <div className="cfg-dialog-h">
                <span className="kx-section">Configurações</span>
                <IconBtn name="x" title="Fechar · Esc" onClick={onClose} />
            </div>
            <div className="cfg-dialog-b">
                <nav className="cfg-nav" aria-label="Seções">
                    {SECTIONS.map(([id, icon, name]) => (
                        <Row key={id} single icon={icon} title={name} state={id === current[0] ? "is-selected" : ""} onClick={() => setSection(id)} />
                    ))}
                </nav>
                <div className="cfg">
                    <Panel title={current[2]} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
                        <Body c={c} />
                    </Panel>
                </div>
            </div>
        </div>
    );
}
