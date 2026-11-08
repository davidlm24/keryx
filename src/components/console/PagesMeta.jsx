import React from "react";
import { retryPages, usePagesProgress } from "@/hooks/usePagesBackfill";
import { presentationMeta, isPowerPoint } from "@/lib/presentation";

// A PDF's or a PowerPoint's line in the Mídia's lists (Rodada F3): its kind,
// then the pages it has, "Preparando páginas 7/12" while the console makes
// them, or what it needs ("Salve como PDF", a PDF that could not be read),
// in the warning colour. The bar is the row's (PagesBar), not the line's.
export default function PagesMeta({ row, kind = "" }) {
    const progress = usePagesProgress(row.id);
    const say = presentationMeta(row, progress);
    const warn = isPowerPoint(row) || Boolean(progress?.error);
    return (
        <span className="kx-pages-meta">
            {kind}
            {kind && say ? " · " : ""}
            {say && <span className={warn ? "kx-warn" : ""}>{say}</span>}
            {progress?.error?.retryable && <button type="button" className="kx-pages-retry" onClick={(event) => { event.preventDefault(); event.stopPropagation(); retryPages(row.id); }}>Tentar de novo</button>}
        </span>
    );
}

// A thin bar along the bottom edge of a row, or of a thumbnail (Rodada H,
// HB: across the whole row, not under the words). value 0..1; null for work
// whose length is unknown (a file being copied): the whole bar breathes.
// The parent is positioned (.kx-row, .mv-th) and the bar takes its corners.
export function RowBar({ value = null }) {
    const busy = value == null;
    return (
        <i className={`kx-row-progress${busy ? " is-busy" : ""}`} aria-hidden="true">
            <b style={busy ? undefined : { transform: `scaleX(${Math.max(0, Math.min(1, value))})` }} />
        </i>
    );
}

// The bar of a PDF whose pages are being made (usePagesBackfill).
export function PagesBar({ id }) {
    const progress = usePagesProgress(id);
    return progress?.total > 0 ? <RowBar value={progress.done / progress.total} /> : null;
}
