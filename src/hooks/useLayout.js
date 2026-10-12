import { useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { findLayout } from "@/lib/layouts";

// The operator's layouts (ScreenLayout rows, src/lib/layouts.js), kept
// current: list + subscribe. A network screen reads them too.
export function useLayoutRows() {
    const [rows, setRows] = useState([]);
    useEffect(() => {
        let on = true;
        const load = () => keryx.entities.ScreenLayout?.list()
            .then((r) => { if (on) setRows(r || []); })
            .catch(() => {});
        load();
        const off = keryx.entities.ScreenLayout?.subscribe?.(() => load());
        return () => { on = false; off?.(); };
    }, []);
    return rows;
}

// The layout an id names (a factory one, or a row), normalized and kept
// current; null for "" or an id that names nothing (the page then draws its
// own screen).
export function useLayout(id) {
    const rows = useLayoutRows();
    return useMemo(() => findLayout(id, rows), [id, rows]);
}

// A network screen may ask for a layout of its own (?layout=<id>), over the
// page's OutputPref: two tablets on the same page with different layouts.
export function urlLayoutId() {
    try { return new URLSearchParams(window.location.search).get("layout") || ""; } catch { return ""; }
}
