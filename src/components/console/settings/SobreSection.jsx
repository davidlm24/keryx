import React, { useState } from "react";
import { useUser } from "@/hooks/useUser";
import { Btn } from "../kx";
import { FormRow, useBridge, usePoll } from "./parts";
import { BIBLE_VERSIONS } from "@/lib/bibleBooks";
import { editionCredit } from "@/lib/bibleEditions";

// The font's license ships in the build (public/fonts, see src/fonts.css).
const FONT_LICENSE = "/fonts/Geist-OFL.txt";

// Sobre: what this KERYX is, which version, and the notices the app owes
// (the font's license, the Bibles that are not inside it). Reads the version
// from the same call as Backup e atualizações; updating stays there.
export default function SobreSection({ onWhatsNew, onSection }) {
    const system = useBridge("system");
    const user = useUser();
    const [info] = usePoll(() => system?.call("info"), 0);
    const [license, setLicense] = useState(null);
    // The open editions installed here owe their credit (owner 2026-10-20,
    // b3 = sobre: their licences ask for the name, the holder and the licence).
    const bible = useBridge("bible");
    const [installed] = usePoll(() => bible?.status(), 0);
    const credits = BIBLE_VERSIONS.filter((v) => v.group === "open" && installed?.[v.id] > 0).map(editionCredit);
    // window.keryxDesktop returns a fresh object on every access: read it once.
    const versions = useBridge("versions");
    const runtime = versions?.electron ? `Electron ${versions.electron} · Chromium ${versions.chrome}` : "";
    // The browser preview has a bridge too, with no real app behind it.
    const preview = !system || Boolean(window.keryxDesktop?.isPreview);

    const toggleLicense = async () => {
        if (license !== null) { setLicense(null); return; }
        try {
            const res = await fetch(FONT_LICENSE);
            if (!res.ok) throw new Error(String(res.status));
            setLicense(await res.text());
        } catch {
            setLicense("Não foi possível ler o arquivo da licença neste computador.");
        }
    };

    return (
        <>
            <div className="cfg-about">
                <span className="kx-mark" aria-hidden="true" />
                <div>
                    <b>KERYX</b>
                    <span>Projeção de letras, Bíblia e mídia para o culto · funciona sem internet</span>
                </div>
            </div>
            <div className="frm">
                <FormRow k="Versão">
                    <span className="kx-content">{preview ? "Prévia de desenvolvimento" : info?.version ? `KERYX ${info.version}` : "lendo…"}</span>
                    <Btn kind="outline" onClick={() => onWhatsNew?.()}>Ver novidades</Btn>
                    <Btn onClick={() => onSection?.("backup")}>Backup e atualizações</Btn>
                    <span className="kx-meta">as atualizações ficam em Backup e atualizações</span>
                </FormRow>
                <FormRow k="Igreja">
                    <span className="kx-content">{user?.church_name || "Sem nome ainda"}</span>
                    <Btn onClick={() => onSection?.("igreja")}>Mudar em Igreja</Btn>
                </FormRow>
                {runtime && (
                    <FormRow k="Feito com">
                        <span className="kx-content">{runtime}</span>
                    </FormRow>
                )}
                <FormRow k="Fontes">
                    <span className="kx-content">Geist · SIL Open Font License 1.1</span>
                    <Btn on={license !== null} onClick={toggleLicense}>{license !== null ? "Fechar a licença" : "Ver a licença"}</Btn>
                    <span className="kx-meta">© 2023 Vercel e basement.studio · a fonte vem dentro do KERYX</span>
                </FormRow>
                {license !== null && (
                    <FormRow k="">
                        <pre className="cfg-license">{license}</pre>
                    </FormRow>
                )}
                <FormRow k="Bíblias">
                    <span className="kx-meta">O KERYX não traz o texto das Bíblias, que têm direitos autorais. Cada igreja instala as edições que pode usar, e o texto fica só neste computador.{credits.length ? " As edições abertas instaladas aqui, com o crédito que a licença pede:" : ""}</span>
                    <Btn onClick={() => onSection?.("biblia")}>Abrir Bíblia e músicas</Btn>
                </FormRow>
                {credits.map((line) => (
                    <FormRow key={line} k="">
                        <span className="kx-content">{line}</span>
                    </FormRow>
                ))}
            </div>
        </>
    );
}
