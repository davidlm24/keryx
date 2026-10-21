import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, IconBtn } from "./kx";
import Icon from "./Icon";
import { useDialogFocus } from "./useDialogFocus";
import { preparePackage, writePackage, writeLyrics, readPackage, closePackage, runImport } from "./packages";
import { exportTitle, formatBytes, countOf, importSteps, importSay, packageSource, packageChips } from "@/lib/keryxPackage";

// The KERYX package's two windows (owner 2026-10-21; the "Seleção múltipla"
// mockup's M6 = A and the Rodada O mockup's O1, O1-1 = A, O1-2 = C), on the
// Importar músicas dialog's frame (import-dialog): Esc, Cancelar and the
// scrim close them, never mid-write (the console's key order: "confirm");
// the action, then Cancelar (C-74).

// Exportar 3 músicas: "Com os arquivos" (the .keryx, recommended) or, for
// songs, "Só as letras" (the JSON of always). The size is estimated from
// the files' sizes before anything is written.
function ExportPackageDialog({ request, onClose, onBusy, say }) {
    const { kind, rows } = request;
    const [how, setHow] = useState("files");
    const [est, setEst] = useState(null);
    const [busy, setBusy] = useState(false);
    const boxRef = useRef(null);
    useDialogFocus(boxRef, true);
    useEffect(() => {
        let live = true;
        preparePackage(kind, rows).then((r) => live && setEst(r), (err) => live && setEst({ error: err?.message || "falhou" }));
        return () => { live = false; };
    }, [kind, rows]);
    const lyrics = kind === "songs" && how === "lyrics";
    const close = () => { if (!busy) onClose(); };
    const run = async () => {
        if (busy) return;
        if (lyrics) {
            writeLyrics(rows);
            say(`${countOf("songs", rows.length)} ${rows.length === 1 ? "exportada" : "exportadas"} (só as letras).`);
            onClose();
            return;
        }
        if (!est?.pkg) return;
        setBusy(true); onBusy(true);
        try {
            const out = await writePackage(kind, rows, est.pkg);
            onBusy(false); setBusy(false);
            if (!out) return; // the save dialog was closed: stay here
            const left = out.missing?.length ? ` · ${out.missing.length} ${out.missing.length === 1 ? "arquivo não estava" : "arquivos não estavam"} neste computador e ${out.missing.length === 1 ? "ficou" : "ficaram"} de fora` : "";
            say(`Pacote salvo: ${String(out.file || "").split(/[\\/]/).pop()} · ${formatBytes(out.bytes)}${left}.`);
            onClose();
        } catch (err) {
            onBusy(false); setBusy(false);
            say(err?.message || "Não foi possível exportar.");
        }
    };
    const size = est?.error ? `Não deu para preparar: ${est.error}` : est ? `Tamanho estimado: ${formatBytes(lyrics ? JSON.stringify(rows).length : est.bytes)} · Salva onde você escolher.` : "Calculando o tamanho…";
    const missing = !lyrics && est?.missing ? `${est.missing} ${est.missing === 1 ? "arquivo não está" : "arquivos não estão"} neste computador (a sincronização ainda não ${est.missing === 1 ? "o trouxe" : "os trouxe"}) e ${est.missing === 1 ? "fica" : "ficam"} de fora.` : "";
    const what = { songs: "as letras, os temas, os fundos, os áudios e as fontes que elas usam", themes: "os fundos e as fontes que eles usam", notices: "os fundos, os sons e as fontes que eles usam", media: "os arquivos", materials: "as imagens e os vídeos que eles usam" }[kind];
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={close} />
            <div ref={boxRef} className="dialog confirm-dialog import-dialog pkg-export" role="dialog" aria-modal="true" aria-label={exportTitle(kind, rows.length)} aria-busy={busy || undefined}>
                <div className="im-head">
                    <Icon name="download" />
                    <span className="im-title">{exportTitle(kind, rows.length)}</span>
                    <IconBtn name="x" small title="Fechar · Esc" onClick={close} disabled={busy} />
                </div>
                <div className="pkg-body" role="radiogroup" aria-label="O que gravar">
                    <label className={`pkg-radio ${!lyrics ? "is-on" : ""}`}>
                        <input type="radio" name="pkg-how" checked={!lyrics} disabled={busy} onChange={() => setHow("files")} />
                        <span className="pkg-radio-t">{kind === "songs" ? "Com os arquivos (recomendado)" : "Um pacote do KERYX"}</span>
                        <span className="pkg-radio-s">Um arquivo .keryx com {what}. Abre em outro KERYX com tudo no lugar.</span>
                    </label>
                    {kind === "songs" && (
                        <label className={`pkg-radio ${lyrics ? "is-on" : ""}`}>
                            <input type="radio" name="pkg-how" checked={lyrics} disabled={busy} onChange={() => setHow("lyrics")} />
                            <span className="pkg-radio-t">Só as letras</span>
                            <span className="pkg-radio-s">O JSON de sempre, pequeno. Em outro computador as músicas ficam com o tema e o fundo padrão.</span>
                        </label>
                    )}
                    <span className="pkg-note" aria-live="polite">{size}</span>
                    {missing && <span className="pkg-note is-warn">{missing}</span>}
                </div>
                <div className="im-foot">
                    <span className="im-counts" />
                    <Btn kind="brand" disabled={busy || (!lyrics && !est?.pkg)} onClick={run}>{busy ? "Exportando…" : "Exportar…"}</Btn>
                    <Btn disabled={busy} onClick={close}>Cancelar</Btn>
                </div>
            </div>
        </>
    );
}

const GLYPH = { ok: "check", repeated: "warn", bad: "x" };
const SAID = { ok: "Novo", repeated: "Parece repetido", bad: "Não abre" };
// "nova" / "novo", as each kind is said.
const FEMININE = new Set(["songs", "fonts"]);
const WAY = { force: "Trazer mesmo assim", copy: "Trazer como cópia" };

const PackageRows = React.memo(function PackageRows({ groups, skip, forced, busy, onToggle }) {
    return groups.map((g) => (
        <div key={g.id} role="group" aria-label={`${g.name} · ${g.items.length}`} className="pkg-group">
            <div className="pkg-ilh">{g.name} · {g.items.length}</div>
            {g.items.map((it) => (
                <div key={it.key} role="listitem" className={`im-row pkg-row is-${it.status}`}>
                    <span className="im-glyph" role="img" aria-label={SAID[it.status]} title={SAID[it.status]}><Icon name={GLYPH[it.status]} /></span>
                    <span className="im-main">
                        <span className="im-name" title={it.title}>{it.title}</span>
                        {(it.meta || it.reason) && <span className="im-meta">{it.reason || it.meta}</span>}
                    </span>
                    {it.status === "repeated" && it.way
                        ? <label className="im-force"><input type="checkbox" disabled={busy || !skip} checked={!skip || forced.has(it.key)} onChange={() => onToggle(it.key)} />{WAY[it.way]}</label>
                        : <span className="im-size">{it.status === "bad" ? "fica de fora" : it.status === "repeated" ? "usa a daqui" : FEMININE.has(g.id) ? "nova" : "novo"}</span>}
                </div>
            ))}
        </div>
    ));
});

// Abrir pacote do KERYX: what the package holds, against the library here,
// before anything is written. Pular os repetidos is on: a repeated song,
// aviso or material stays out, a theme of the same name and the same file
// here are reused by what comes in.
function OpenPackageDialog({ request, onClose, onBusy, say }) {
    const [data, setData] = useState(null);
    const [skip, setSkip] = useState(true);
    const [forced, setForced] = useState(() => new Set());
    const [progress, setProgress] = useState(null);
    const boxRef = useRef(null);
    const pkgRef = useRef(null);
    useDialogFocus(boxRef, Boolean(data));
    useEffect(() => {
        let live = true;
        readPackage(request.file).then((r) => {
            if (!r) { if (live) onClose(true); return; }
            pkgRef.current = r.pkg;
            if (live) setData(r); else closePackage(r.pkg);
        }, (err) => live && setData({ error: err?.message || "Não deu para abrir o pacote." }));
        return () => { live = false; closePackage(pkgRef.current); pkgRef.current = null; };
    }, [request.file]); // eslint-disable-line react-hooks/exhaustive-deps
    const steps = useMemo(() => (data?.plan ? importSteps(data.plan, { skip, forced, items: data.pkg.items }) : null), [data, skip, forced]);
    const toggle = useCallback((key) => setForced((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }), []);

    const busy = Boolean(progress);
    const close = () => { if (!busy) onClose(); };
    const run = async () => {
        if (busy || !steps?.total) return;
        onBusy(true);
        setProgress({ done: 0, total: steps.takes.length + steps.total });
        const out = await runImport({ pkg: data.pkg, plan: data.plan, themesHere: data.themes, skip, forced, onProgress: setProgress });
        onBusy(false);
        say(importSay(out));
        onClose();
    };
    // Still reading: nothing on screen but the scrim's wait (the chooser
    // may be open over it).
    if (!data) return <div className="scrim is-dim confirm-scrim" aria-busy="true" />;
    const n = steps?.total || 0;
    const counts = data.plan?.counts;
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={close} />
            <div ref={boxRef} className="dialog confirm-dialog import-dialog pkg-open" role="dialog" aria-modal="true" aria-label="Abrir pacote do KERYX" aria-busy={busy || undefined}>
                <div className="im-head pkg-head">
                    <Icon name="download" />
                    <span className="im-title">
                        <span>Abrir pacote do KERYX</span>
                        {data.pkg && <span className="pkg-sub">{packageSource({ name: data.pkg.name, manifest: data.pkg.manifest, bytes: data.pkg.bytes })}</span>}
                    </span>
                    <IconBtn name="x" small title="Fechar · Esc" onClick={close} disabled={busy} />
                </div>
                {data.pkg && (
                    <div className="pkg-chips">
                        {packageChips(data.pkg.manifest?.counts || {}).map((ch) => <span key={ch.kind} className="pkg-chip"><b>{ch.n}</b> {ch.word}</span>)}
                    </div>
                )}
                <div className="im-list" role="list" aria-label="O que o pacote traz">
                    {data.error && <div className="kx-meta im-empty">{data.error}</div>}
                    {data.plan && !data.plan.items.length && <div className="kx-meta im-empty">O pacote está vazio.</div>}
                    {data.plan && <PackageRows groups={data.plan.groups} skip={skip} forced={forced} busy={busy} onToggle={toggle} />}
                </div>
                <div className="im-foot">
                    <label className="im-skip"><input type="checkbox" checked={skip} disabled={busy || !counts?.repeated} onChange={(e) => { setSkip(e.target.checked); setForced(new Set()); }} />Pular os repetidos</label>
                    <span className="im-counts" aria-live="polite">{busy ? `Importando ${progress.done} de ${progress.total}…` : ""}</span>
                    <Btn kind="brand" disabled={busy || !n} onClick={run}>{busy ? "Importando…" : n ? `Importar ${n}` : "Nada para importar"}</Btn>
                    <Btn disabled={busy} onClick={close}>Cancelar</Btn>
                </div>
            </div>
        </>
    );
}

// The console's (and a detached /Janela's) host: the door for the context
// (PackageContext in packages.js), whether one is open (the key order's
// "confirm") and how Esc closes it.
//   const pkg = usePackageHost(say);
//   <PackageContext.Provider value={pkg.value}> … {pkg.element}
export function usePackageHost(say) {
    const [req, setReq] = useState(null);
    const busy = useRef(false);
    const value = useMemo(() => ({
        exportItems: (kind, rows) => { if (rows?.length) setReq({ mode: "export", kind, rows: [...rows], at: Date.now() }); },
        openPackage: (file) => setReq({ mode: "open", file: file || null, at: Date.now() }),
    }), []);
    const close = useCallback(() => { if (!busy.current) setReq(null); }, []);
    const onBusy = useCallback((b) => { busy.current = b; }, []);
    const element = !req ? null : req.mode === "export"
        ? <ExportPackageDialog key={req.at} request={req} onClose={close} onBusy={onBusy} say={say} />
        : <OpenPackageDialog key={req.at} request={req} onClose={close} onBusy={onBusy} say={say} />;
    return { value, open: Boolean(req), close, element };
}
