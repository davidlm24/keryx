import { useEffect, useMemo, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { normalizePref } from "@/lib/outputPrefs";

// This output's settings (OutputPref, src/lib/outputPrefs.js) and the theme
// they pick, kept current: Configurações changes them while the output is on
// screen. A network screen reads them too (the database is readable there).
// No path: nothing is read (the defaults).
export function useOutputPref(path) {
    const [row, setRow] = useState(null);
    const [theme, setTheme] = useState(null);

    useEffect(() => {
        if (!path) { setRow(null); return undefined; }
        let on = true;
        const load = () => keryx.entities.OutputPref?.filter({ screen_path: path })
            .then((rows) => { if (on) setRow(rows?.[0] || null); })
            .catch(() => {});
        load();
        const off = keryx.entities.OutputPref?.subscribe?.((change) => { if (change?.data?.screen_path === path || change?.type === "delete") load(); });
        return () => { on = false; off?.(); };
    }, [path]);

    const pref = useMemo(() => normalizePref(row), [row]);
    const themeId = pref.themeId;
    useEffect(() => {
        if (!themeId) { setTheme(null); return undefined; }
        let on = true;
        const load = () => keryx.entities.ProjectionTheme.get(themeId)
            .then((t) => { if (on) setTheme(t || null); })
            .catch(() => { if (on) setTheme(null); });
        load();
        const off = keryx.entities.ProjectionTheme.subscribe?.((change) => { if (change?.data?.id === themeId) load(); });
        return () => { on = false; off?.(); };
    }, [themeId]);

    return { pref, theme };
}
