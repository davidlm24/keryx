import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Btn, IconBtn } from "./kx";
import Icon from "./Icon";
import { useDialogFocus } from "./useDialogFocus";
import { readImport, createSongs, pickedFolder, SONG_FILE, SONG_ACCEPT } from "./importSongs";
import { usePackages } from "./packages";
import { PACKAGE_FILE } from "@/lib/keryxPackage";
import { importedItems, importRowMeta, importRowSize, importSource, importCounts, importSummary } from "@/lib/songImport";

// Importar músicas (owner's marks 2026-10-20 on the mockup, all as
// recommended): Do computador… / Uma pasta inteira… pick the files, then this
// dialog lists what each one gives before anything is written — ✓ ready, ⚠
// parece repetida (skipped unless "Importar mesmo assim" or "Pular as
// repetidas" off), ✗ não deu with the reason. Importar writes them 100 at a
// time (createSongs; the footer counts), closes and the toast says the result
// (importSummary). Esc, Cancelar and the scrim close it, never mid-import
// (Console.jsx's key order: "confirm"). Windows order, the action then
// Cancelar (C-74).
const GLYPH = { ok: "check", repeated: "warn", bad: "x" };
const SAID = { ok: "Pronta", repeated: "Parece repetida", bad: "Não deu" };

// The rows, apart from the counter: a library of 2,000 songs must not redraw
// every row at each song written.
const ImportRows = React.memo(function ImportRows({ items, skip, forced, busy, onToggle }) {
    return items.map((it) => (
        <div key={it.key} role="listitem" className={`im-row is-${it.status}`}>
            <span className="im-glyph" role="img" aria-label={SAID[it.status]} title={SAID[it.status]}><Icon name={GLYPH[it.status]} /></span>
            <span className="im-main">
                <span className="im-name" title={it.title}>{it.title}</span>
                <span className="im-meta">{importRowMeta(it)}</span>
            </span>
            {it.status === "repeated"
                ? <label className="im-force"><input type="checkbox" disabled={busy || !skip} checked={!skip || forced.has(it.key)} onChange={() => onToggle(it.key)} />Importar mesmo assim</label>
                : <span className="im-size">{it.status === "ok" ? importRowSize(it.row) : ""}</span>}
            <span className="im-format">{it.format || "—"}</span>
        </div>
    ));
});

export default function ImportSongsDialog({ request, onClose, onBusy, say }) {
    const [data, setData] = useState(null);
    const [skip, setSkip] = useState(true);
    const [forced, setForced] = useState(() => new Set());
    const [progress, setProgress] = useState(null);
    const boxRef = useRef(null);
    const pickRef = useRef(null);
    const folderRef = useRef(null);
    const readId = useRef(0);
    const open = Boolean(request);
    const { openPackage } = usePackages();
    useDialogFocus(boxRef, open);

    // A new pick (from the console, or the dialog's own buttons) is read anew.
    const read = (files) => {
        setData(null); setSkip(true); setForced(new Set()); setProgress(null);
        const folder = pickedFolder(files);
        const id = ++readId.current;
        const done = (d) => { if (id === readId.current) setData(d); };
        readImport(files).then((r) => done({ ...r, folder }), (err) => done({ files: [], plan: { items: [], counts: { ok: 0, repeated: 0, bad: 0 } }, folder, error: err?.message || "falhou" }));
    };
    useEffect(() => { if (request?.files) read(request.files); }, [request?.files]); // eslint-disable-line react-hooks/exhaustive-deps

    const chosen = useMemo(() => (data ? importedItems(data.plan.items, { skip, forced }) : []), [data, skip, forced]);
    const toggle = useCallback((key) => setForced((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; }), []);
    if (!open) return null;

    const busy = Boolean(progress);
    const close = () => { if (!busy) onClose(); };
    const repick = (e) => {
        const picked = [...(e.target.files || [])];
        e.target.value = "";
        // A KERYX package opens in its own dialog.
        const box = picked.find((f) => PACKAGE_FILE.test(f.name));
        if (box) { onClose(); openPackage(box); return; }
        const files = picked.filter((f) => SONG_FILE.test(f.name));
        if (files.length) read(files);
    };
    const run = async () => {
        if (busy || !chosen.length) return;
        onBusy?.(true);
        setProgress({ done: 0, total: chosen.length });
        const { made, failed } = await createSongs(chosen.map((it) => it.row), (done) => setProgress({ done, total: chosen.length }));
        const items = data.plan.items;
        const left = items.filter((it) => it.status === "repeated").length - chosen.filter((it) => it.status === "repeated").length;
        const bad = [...items.filter((it) => it.status === "bad").map((it) => `${it.title} (${it.reason})`), ...failed];
        onBusy?.(false);
        say(importSummary({ made, repeated: left, bad }));
        onClose();
    };

    const n = chosen.length;
    const counts = data?.plan.counts;
    return (
        <>
            <div className="scrim is-dim confirm-scrim" onClick={close} />
            <div ref={boxRef} className="dialog confirm-dialog import-dialog" role="dialog" aria-modal="true" aria-label="Importar músicas" aria-busy={busy || !data || undefined}>
                <div className="im-head">
                    <Icon name="music" />
                    <span className="im-title">Importar músicas</span>
                    <IconBtn name="x" small title="Fechar · Esc" onClick={close} disabled={busy} />
                </div>
                <div className="im-band">
                    <span className="im-source">{data ? importSource(data.files, data.folder) : "Lendo os arquivos…"}</span>
                    <Btn small disabled={busy} onClick={() => pickRef.current?.click()}>Do computador…</Btn>
                    <Btn small disabled={busy} onClick={() => folderRef.current?.click()}>Uma pasta inteira…</Btn>
                    <input ref={pickRef} type="file" multiple hidden accept={SONG_ACCEPT} onChange={repick} />
                    <input ref={folderRef} type="file" multiple hidden webkitdirectory="" accept={SONG_ACCEPT} onChange={repick} />
                </div>
                <div className="im-list" role="list" aria-label="Músicas">
                    {!data && <div className="kx-meta im-empty">Lendo os arquivos…</div>}
                    {data?.error && <div className="kx-meta im-empty">{data.error}</div>}
                    {data && !data.error && !data.plan.items.length && <div className="kx-meta im-empty">Nenhum arquivo de letra.</div>}
                    {data && <ImportRows items={data.plan.items} skip={skip} forced={forced} busy={busy} onToggle={toggle} />}
                </div>
                <div className="im-foot">
                    <label className="im-skip"><input type="checkbox" checked={skip} disabled={busy || !counts?.repeated} onChange={(e) => { setSkip(e.target.checked); setForced(new Set()); }} />Pular as repetidas</label>
                    <span className="im-counts" aria-live="polite">{busy ? `Importando ${progress.done} de ${progress.total}…` : counts ? importCounts(counts) : ""}</span>
                    <Btn kind="brand" disabled={busy || !n} onClick={run}>{busy ? "Importando…" : n ? `Importar ${n} ${n === 1 ? "música" : "músicas"}` : "Nada para importar"}</Btn>
                    <Btn disabled={busy} onClick={close}>Cancelar</Btn>
                </div>
            </div>
        </>
    );
}
