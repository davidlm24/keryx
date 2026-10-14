import React, { useState } from "react";
import { Btn, Empty } from "../kx";
import { BIBLE_VERSIONS } from "@/lib/bibleBooks";
import { forgetInstalledVersions } from "@/lib/bibleText";
import { useBridge, usePoll, desktopOnly, Reading } from "./parts";
import { usePrefs, updateUser } from "@/hooks/useUser";

// Bíblias instaladas: each version downloaded once (or from a file) works
// without internet; the default is what the Bible environment opens with.
// The texts are never shipped with KERYX (electron/bible.cjs).
export default function BibliasSection({ c }) {
    const bible = useBridge("bible");
    const [installed, refresh, , readError] = usePoll(() => bible?.status(), 0);
    const [busy, setBusy] = useState("");
    const def = usePrefs().bible_version;
    if (!bible) return <Empty icon="book" title="Só no aplicativo">{desktopOnly}</Empty>;
    if (!installed) return <Reading what="as Bíblias" error={readError} />;

    const run = async (version, fromFile) => {
        setBusy(version);
        try {
            const res = fromFile ? await bible.installFromFile(version) : await bible.install(version);
            if (res?.error) c.say(res.error.message);
            else if (res?.data) c.say(`${version} instalada: ${res.data.verses.toLocaleString("pt-BR")} versículos.`);
            forgetInstalledVersions();
            await refresh();
        } catch (err) {
            c.say(err?.message || `Não foi possível instalar a ${version}.`);
        } finally { setBusy(""); }
    };
    const setDefault = (v) => {
        updateUser({ bible_version: v })
            .then(() => c.say(`${v} é a versão padrão da Bíblia.`))
            .catch(() => c.say("Não foi possível salvar a versão padrão."));
    };

    return (
        <>
            {BIBLE_VERSIONS.map((v) => {
                const count = installed[v.id];
                const online = !v.install;
                return (
                    <div key={v.id} className="kx-row">
                        <div className="kx-row-main">
                            <div className="kx-row-title">{v.id} · {v.name}{def === v.id && <span className="kx-count"> · padrão</span>}</div>
                            <div className={`kx-row-meta ${!count && def === v.id ? "kx-warn" : ""}`}>
                                {count ? `Instalada neste computador · ${count.toLocaleString("pt-BR")} versículos` : online ? "Só com internet" : "Só com internet · baixe para usar sem rede"}
                            </div>
                        </div>
                        <span className="cfg-acts">
                            {def !== v.id && <Btn small onClick={() => setDefault(v.id)}>Tornar padrão</Btn>}
                            {v.install && <Btn small kind={count ? "" : "outline"} disabled={Boolean(busy)} onClick={() => run(v.id, false)}>{busy === v.id ? "Baixando…" : count ? "Reinstalar" : "Baixar · 4 MB"}</Btn>}
                            {v.install && <Btn small disabled={Boolean(busy)} onClick={() => run(v.id, true)}>Do arquivo…</Btn>}
                        </span>
                    </div>
                );
            })}
            <div className="listhead"><span className="kx-meta">A versão aparece com cada referência. Se a escolhida faltar, o KERYX avisa e mostra outra instalada; nunca troca em silêncio. Sem internet aqui, use "Do arquivo" com o JSON baixado em outro computador.</span></div>
        </>
    );
}
