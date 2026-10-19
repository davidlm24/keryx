import React from "react";
import { retryPages, usePagesProgress } from "@/hooks/usePagesBackfill";
import { presentationMeta, isPowerPoint } from "@/lib/presentation";

// A PDF's or a PowerPoint's line in the Mídia's lists (Rodada F3): its kind,
// then the pages it has, "Preparando páginas 7/12" while the console makes
// them, or what it needs ("Salve como PDF", a PDF that could not be read),
// in the warning colour.
export default function PagesMeta({ row, kind = "" }) {
    const progress = usePagesProgress(row.id);
    const say = presentationMeta(row, progress);
    const warn = isPowerPoint(row) || Boolean(progress?.error);
    return (
        <span className={`kx-pages-meta${progress?.total ? " is-working" : ""}`}>
            {kind}
            {kind && say ? " · " : ""}
            {say && <span className={warn ? "kx-warn" : ""}>{say}</span>}
            {progress?.error?.retryable && <button type="button" className="kx-pages-retry" onClick={(event) => { event.preventDefault(); event.stopPropagation(); retryPages(row.id); }}>Tentar de novo</button>}
            {progress?.total > 0 && <i className="kx-pages-progress" aria-hidden="true"><b style={{ transform: `scaleX(${Math.max(0, Math.min(1, progress.done / progress.total))})` }} /></i>}
        </span>
    );
}
