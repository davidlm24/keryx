import { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { codecFields, needsCodec, rangeReader, readVideoCodec } from "@/lib/videoCodec";

const PAUSE_MS = 600;

// Rows this window already tried (by id and file), so a file that cannot be
// read is not read over and over.
const tried = new Set();

// Reads the codec of every video of the library that has none yet
// (Media.video_codec, src/lib/videoCodec.js): the ones from before it was
// read on import, and those that came from another computer. A few range
// reads per file (the box headers, then the moov), one file at a time with a
// pause between them. The console only; never a screen on the network.
export function useCodecBackfill(rows) {
    const [tick, setTick] = useState(0);
    const [busy, setBusy] = useState(false);
    useEffect(() => {
        if (busy || !keryx.isDesktop || keryx.isNetworkScreen) return undefined;
        const row = rows.find((m) => needsCodec(m) && !tried.has(`${m.id}|${m.file_url}`));
        if (!row) return undefined;
        const id = setTimeout(() => {
            tried.add(`${row.id}|${row.file_url}`);
            setBusy(true);
            readVideoCodec(rangeReader(row.file_url))
                .then((found) => found && keryx.entities.Media.update(row.id, codecFields(found)))
                .catch((err) => console.warn("[keryx] codec do vídeo:", row.title, err?.message || err))
                .finally(() => { setBusy(false); setTick((n) => n + 1); });
        }, PAUSE_MS);
        return () => clearTimeout(id);
    }, [rows, busy, tick]);
}
