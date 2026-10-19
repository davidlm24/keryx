import React, { useState } from "react";
import { Btn, Empty } from "../kx";
import { BIBLE_VERSIONS } from "@/lib/bibleBooks";
import { forgetInstalledVersions } from "@/lib/bibleText";
import { useBridge, usePoll, desktopOnly, Reading } from "./parts";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { biblesMissingHere } from "@/lib/console/syncView";

// Bíblias instaladas: each version downloaded once (or from a file) works
// without internet; the one in use (User.bible_version, also set by the Livros selector) is
// what the whole app reads.
// The texts are never shipped with KERYX (electron/bible.cjs), nor taken by
// the sync between the church's computers: a computer that syncs says which
// editions the others have and this one lacks, with Instalar aqui (Rodada G7,
// biblesMissingHere; each computer's list rides its computer.json).
export default function BibliasSection({ c }) {
    const bible = useBridge("bible");
    const [installed, refresh, , readError] = usePoll(() => bible?.status(), 0);
    const [busy, setBusy] = useState("");
    const def = usePrefs().bible_version;
    const sync = useSyncStatus();
    const elsewhere = biblesMissingHere(sync, Object.keys(installed || {}).filter((v) => installed[v] > 0));
    if (!bible) return <Empty icon="book" title="Só no aplicativo">{desktopOnly}</Empty>;
    if (!installed) return <Reading what="as Bíblias" error={readError} />;

    const install = async (version, fromFile) => {
        try {
            const res = fromFile ? await bible.installFromFile(version) : await bible.install(version);
            if (res?.error) c.say(res.error.message);
            else if (res?.data) c.say(`${version} instalada: ${res.data.verses.toLocaleString("pt-BR")} versículos.`);
        } catch (err) {
            c.say(err?.message || `Não foi possível instalar a ${version}.`);
        }
    };
    const run = async (version, fromFile) => {
        setBusy(version);
        try {
            await install(version, fromFile);
            forgetInstalledVersions();
            await refresh();
        } finally { setBusy(""); }
    };
    // Instalar aqui: the editions the other computers have, one after the
    // other, downloaded as Baixar does (the text never comes by the folder).
    const installMissing = async () => {
        try {
            for (const v of elsewhere.missing) {
                setBusy(v);
                await install(v, false);
            }
            forgetInstalledVersions();
            await refresh();
        } finally { setBusy(""); }
    };
    const canInstall = elsewhere && elsewhere.missing.every((v) => BIBLE_VERSIONS.some((x) => x.id === v && x.install));
    const setDefault = (v) => {
        updateUser({ bible_version: v })
            .then(() => c.say(`${v} é a versão em uso na Bíblia.`))
            .catch(() => c.say("Não foi possível salvar a versão em uso."));
    };

    return (
        <>
            {elsewhere && (
                <div className="cfg-note" role="status">
                    <span>{elsewhere.line}</span>
                    {canInstall && <Btn small kind="outline" disabled={Boolean(busy)} onClick={installMissing}>{busy ? "Baixando…" : "Instalar aqui"}</Btn>}
                </div>
            )}
            {BIBLE_VERSIONS.map((v) => {
                const count = installed[v.id];
                const online = !v.install;
                return (
                    <div key={v.id} className="kx-row">
                        <div className="kx-row-main">
                            <div className="kx-row-title">{v.id} · {v.name}{def === v.id && <span className="kx-count"> · em uso</span>}</div>
                            <div className={`kx-row-meta ${!count && def === v.id ? "kx-warn" : ""}`}>
                                {count ? `Instalada neste computador · ${count.toLocaleString("pt-BR")} versículos` : online ? "Só com internet" : "Só com internet · baixe para usar sem rede"}
                            </div>
                        </div>
                        <span className="cfg-acts">
                            {def !== v.id && <Btn small onClick={() => setDefault(v.id)}>Usar esta</Btn>}
                            {v.install && <Btn small kind={count ? "" : "outline"} disabled={Boolean(busy)} onClick={() => run(v.id, false)}>{busy === v.id ? "Baixando…" : count ? "Reinstalar" : "Baixar · 4 MB"}</Btn>}
                            {v.install && <Btn small disabled={Boolean(busy)} onClick={() => run(v.id, true)}>Do arquivo…</Btn>}
                        </span>
                    </div>
                );
            })}
            <div className="listhead"><span className="kx-meta">A versão em uso vale em todo o KERYX, na Bíblia e nas referências; trocá-la aqui ou no seletor de Livros é a mesma coisa. Se a escolhida faltar, o KERYX avisa e mostra outra instalada; nunca troca em silêncio. Sem internet aqui, use "Do arquivo" com o JSON baixado em outro computador.</span></div>
        </>
    );
}
