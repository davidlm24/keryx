import React, { useState } from "react";
import { Btn, Empty } from "../kx";
import Icon from "../Icon";
import { editionCredit } from "@/lib/bibleBooks";
import { forgetInstalledVersions } from "@/lib/bibleText";
import { useBridge, usePoll, desktopOnly, Reading, CfgGroup } from "./parts";
import { usePrefs, updateUser } from "@/hooks/useUser";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { biblesMissingHere } from "@/lib/console/syncView";
import { biblesSummary } from "@/lib/console/cfgSummaries";
import { bibleGroups } from "@/lib/console/bibleRows";
import { useBibleEditions } from "../useBibleEditions";
import { useConfirm } from "../ConfirmDialog";
import OwnBibleDialog from "./OwnBibleDialog";

// Bíblias instaladas: each version downloaded once (or from a file) works
// without internet; the one in use (User.bible_version, also set by the Livros selector) is
// what the whole app reads. In three groups (owner 2026-10-20, the
// "Bíblias" mockup): the church's own editions (installed from its file,
// Trocar o arquivo… / Excluir…), the open ones of eBible.org (with their
// licence) and the publishers' (the holder's name), each row its chip.
// The texts are never shipped with KERYX (electron/bible.cjs), nor taken by
// the sync between the church's computers: a computer that syncs says which
// editions the others have and this one lacks, with Instalar aqui (Rodada G7,
// biblesMissingHere; each computer's list rides its computer.json) — an
// edition of the church's own asks for its file instead.
export default function BibliasSection({ c }) {
    const bible = useBridge("bible");
    const [installed, refresh, , readError] = usePoll(() => bible?.status(), 0);
    const [busy, setBusy] = useState("");
    // The own-edition dialog: false, true (a new one) or the edition whose file is swapped.
    const [ownOpen, setOwnOpen] = useState(false);
    const def = usePrefs().bible_version;
    const sync = useSyncStatus();
    const editions = useBibleEditions();
    const confirm = useConfirm();
    const elsewhere = biblesMissingHere(sync, Object.keys(installed || {}).filter((v) => installed[v] > 0));
    // The group is the section's third area (Rodada H1); the summary says the
    // edition in use and how many are installed here.
    const group = (body) => <CfgGroup id="biblia.instaladas" k="Bíblias instaladas" summary={biblesSummary(def, installed ? Object.values(installed).filter((n) => n > 0).length : 0)}>{body}</CfgGroup>;
    if (!bible) return group(<Empty icon="book" title="Só no aplicativo">{desktopOnly}</Empty>);
    if (!installed) return group(<Reading what="as Bíblias" error={readError} />);

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
    // Instalar aqui: the editions of the list the other computers have, one
    // after the other, downloaded as Baixar does (the text never comes by the
    // folder); the church's own ones need their file (the dialog).
    const fromList = elsewhere ? elsewhere.missing.filter((v) => !elsewhere.own.includes(v)) : [];
    const installMissing = async () => {
        try {
            for (const v of fromList) {
                setBusy(v);
                await install(v, false);
            }
            forgetInstalledVersions();
            await refresh();
        } finally { setBusy(""); }
    };
    const setDefault = (v) => {
        updateUser({ bible_version: v })
            .then(() => c.say(`${v} é a versão em uso na Bíblia.`))
            .catch(() => c.say("Não foi possível salvar a versão em uso."));
    };
    const removeOwn = async (v) => {
        const yes = await confirm({ title: `Excluir a ${v.id}?`, text: `${v.name} sai deste computador (${installed[v.id]?.toLocaleString("pt-BR") || 0} versículos). O arquivo da igreja continua onde está; para voltar, instale-o de novo.`, ok: "Excluir" });
        if (!yes) return;
        setBusy(v.id);
        try {
            const res = await bible.removeOwn(v.id);
            if (res?.error) c.say(res.error.message);
            else c.say(`${v.id} excluída deste computador.`);
            forgetInstalledVersions();
            await refresh();
        } finally { setBusy(""); }
    };
    const afterOwn = async () => { forgetInstalledVersions(); await refresh(); };
    const groups = bibleGroups(editions, installed);

    return group(
        <>
            {elsewhere && (
                <div className="cfg-note" role="status">
                    <span>{elsewhere.line}</span>
                    {fromList.length > 0 && <Btn small kind="outline" disabled={Boolean(busy)} onClick={installMissing}>{busy ? "Baixando…" : "Instalar aqui"}</Btn>}
                    {elsewhere.own.length > 0 && <Btn small kind="outline" disabled={Boolean(busy)} onClick={() => setOwnOpen(true)}>Escolher o arquivo…</Btn>}
                </div>
            )}
            {groups.map((g) => (
                <React.Fragment key={g.id}>
                    <div className="listhead bib-grp"><span className="kx-section">{g.title}<span className="kx-count"> · {g.hint}</span></span></div>
                    {g.rows.map(({ edition: v, title, chip, nt, meta, verses }) => (
                        <div key={v.id} className="kx-row" title={editionCredit(v) || undefined}>
                            <div className="kx-row-main">
                                <div className="kx-row-title">
                                    {title}
                                    {chip && <span className={`bib-lic is-${chip.tone}`}>{chip.text}</span>}
                                    {nt && <span className="bib-nt">só o Novo Testamento</span>}
                                    {def === v.id && <span className="kx-count"> · em uso</span>}
                                </div>
                                <div className={`kx-row-meta ${!verses && def === v.id ? "kx-warn" : ""}`}>{meta}</div>
                            </div>
                            <span className="cfg-acts">
                                {def !== v.id && (verses || v.group === "publisher") && <Btn small onClick={() => setDefault(v.id)}>Usar esta</Btn>}
                                {v.install && <Btn small kind={verses ? "" : "outline"} disabled={Boolean(busy)} onClick={() => run(v.id, false)}>{busy === v.id ? "Baixando…" : verses ? "Reinstalar" : "Baixar"}</Btn>}
                                {v.install && <Btn small disabled={Boolean(busy)} onClick={() => run(v.id, true)}>Do arquivo…</Btn>}
                                {v.own && <Btn small disabled={Boolean(busy)} onClick={() => setOwnOpen(v)}>Trocar o arquivo…</Btn>}
                                {v.own && <Btn small disabled={Boolean(busy)} onClick={() => removeOwn(v)}><Icon name="trash" />Excluir…</Btn>}
                            </span>
                        </div>
                    ))}
                </React.Fragment>
            ))}
            <div className="bib-own"><Btn kind="outline" disabled={Boolean(busy)} onClick={() => setOwnOpen(true)}><Icon name="plus" />Instalar uma edição própria…</Btn></div>
            <div className="listhead"><span className="kx-meta">A versão em uso vale em todo o KERYX, na Bíblia e nas referências; trocá-la aqui ou no seletor de Livros é a mesma coisa. Se a escolhida faltar, o KERYX avisa e mostra outra instalada; nunca troca em silêncio. Sem internet aqui, use "Do arquivo" com o arquivo baixado em outro computador (JSON, zip, USFM, VPL, OSIS, Zefania ou MySword).</span></div>
            <OwnBibleDialog
                open={Boolean(ownOpen)}
                replace={ownOpen && ownOpen !== true ? ownOpen : null}
                taken={editions.map((v) => v.id)}
                bible={bible}
                say={c.say}
                onInstalled={afterOwn}
                onClose={() => setOwnOpen(false)}
            />
        </>
    );
}
