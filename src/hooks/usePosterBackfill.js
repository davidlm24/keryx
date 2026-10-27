import { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { needsPoster } from "@/lib/mediaPoster";
import { savePoster } from "@/lib/mediaPosterCapture";

const PAUSE_MS = 800;

// Rows this window already tried (by id and file: "Localizar…" gives a row a
// new file and a new chance), so a file that cannot be read is not retried
// over and over.
const tried = new Set();

// Gives every video of the library its still and every picture its small
// copy (Media.thumbnail_url; mediaPoster.js needsPoster), one at a time with a
// pause between them: those sent now (their row arrives through subscribe)
// and the ones from before there were stills. The console only,
// where files can be sent; never a screen on the network.
export function usePosterBackfill(rows) {
    const [tick, setTick] = useState(0);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (busy || !keryx.isDesktop || keryx.isNetworkScreen) return undefined;
        const row = rows.find((m) => needsPoster(m) && !tried.has(`${m.id}|${m.file_url}`));
        if (!row) return undefined;
        const id = setTimeout(() => {
            tried.add(`${row.id}|${row.file_url}`);
            setBusy(true);
            savePoster(row)
                .catch((err) => console.warn("[keryx] miniatura:", row.title, err?.message || err))
                .finally(() => { setBusy(false); setTick((n) => n + 1); });
        }, PAUSE_MS);
        return () => clearTimeout(id);
    }, [rows, busy, tick]);
}
