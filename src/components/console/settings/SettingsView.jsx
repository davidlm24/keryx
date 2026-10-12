import React from "react";
import { Panel, Row, IconBtn, Seg } from "../kx";
import { SECTIONS, APPEARANCE_TABS, sectionOf } from "@/lib/console/settings";
import { useLibrary } from "../useConsoleData";
import { useUser, updateUser } from "@/hooks/useUser";
import IgrejaSection from "./IgrejaSection";
import TelasSection from "./TelasSection";
import RedeSection from "./RedeSection";
import AparenciaSection from "./AparenciaSection";
import TemasSection from "./TemasSection";
import FundosGallery from "./FundosGallery";
import BibliaSection from "./BibliaSection";
import CultoSection from "./CultoSection";
import ConsoleSection from "./ConsoleSection";
import DadosSection from "./DadosSection";

// Aparência › Fundos: the backgrounds library every gallery reads.
function FundosTab({ c }) {
    const { media } = useLibrary();
    const standby = useUser((u) => u?.standby_background || null);
    const onStandby = (url) => updateUser({ standby_background: url }).then(() => c.say("Fundo de espera padrão salvo.")).catch(() => c.say("Não foi possível salvar."));
    return <FundosGallery c={c} media={media} standby={standby} onStandby={onStandby} />;
}

// Aparência: three tabs, Geral (transition, idle look, standby wallpaper),
// Temas (the presets) and Fundos (the library).
function AparenciaView({ c, tab, setTab }) {
    const Body = tab === "temas" ? TemasSection : tab === "fundos" ? FundosTab : AparenciaSection;
    return (
        <>
            <div className="cfg-tabs"><Seg small value={tab} onChange={setTab} options={APPEARANCE_TABS} /></div>
            <Body c={c} />
        </>
    );
}

const BODIES = {
    igreja: IgrejaSection,
    telas: TelasSection,
    rede: RedeSection,
    biblia: BibliaSection,
    culto: CultoSection,
    backup: DadosSection,
};

// Configurações: a window over the console (or the view behind it), closed
// with its X, Esc or a click outside; the sections on the left
// (src/lib/console/settings.js), the chosen one on the right. What is behind
// stays as it was: nothing here changes what is on air (Tela ociosa only
// changes an idle screen), and behind it only the emergency keys act
// (Console.jsx).
export default function SettingsView({ c, section, tab, setSection, onClose, layout, setLayout, restoreLayout }) {
    const current = sectionOf(section);
    let body;
    if (current.id === "aparencia") body = <AparenciaView c={c} tab={tab || "geral"} setTab={(t) => setSection("aparencia", t)} />;
    else if (current.id === "console") body = <ConsoleSection layout={layout} setLayout={setLayout} restoreLayout={restoreLayout} />;
    else { const Body = BODIES[current.id]; body = <Body c={c} />; }
    return (
        <div className="cfg-dialog" role="dialog" aria-modal="true" aria-label="Configurações">
            <div className="cfg-dialog-h">
                <span className="kx-section">Configurações</span>
                <IconBtn name="x" title="Fechar · Esc" onClick={onClose} />
            </div>
            <div className="cfg-dialog-b">
                <nav className="cfg-nav" aria-label="Seções">
                    {SECTIONS.map(({ id, icon, name }) => (
                        <Row key={id} single icon={icon} title={name} state={id === current.id ? "is-selected" : ""} onClick={() => setSection(id)} />
                    ))}
                </nav>
                <div className="cfg">
                    <Panel title={current.name} bodyStyle={{ display: "flex", flexDirection: "column", overflow: "auto" }}>
                        {body}
                    </Panel>
                </div>
            </div>
        </div>
    );
}
