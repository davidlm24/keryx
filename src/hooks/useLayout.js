import { useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { designOf } from "@/lib/outputPrefs";

// The ScreenLayout rows, kept current: only for designOf's lazy migration
// (an old save whose layout_id still names a row). Nothing writes them.
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

// The drawing a screen uses (owner 2026-10-13: each screen owns its design;
// OutputPref.design, with the old layout_id read as a fallback). Null = the
// page as before.
export function useDesign(pref) {
    const rows = useLayoutRows();
    return useMemo(() => designOf(pref, rows), [pref, rows]);
}
