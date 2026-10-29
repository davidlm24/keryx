import { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { needsPoster } from "@/lib/mediaPoster";
import { savePoster, stillIsDark } from "@/lib/mediaPosterCapture";

const PAUSE_MS = 800;

// Rows this window already tried (by id and file: "Localizar…" gives a row a
// new file and a new chance), so a file that cannot be read is not retried
// over and over.
const tried = new Set();

// Stills already checked for being a black tile, kept on this computer so the
// check is made once per file (owner 2026-10-29: some videos were black until
// the pointer was over them). A truly black clip is made anew once, never again.
const CHECKED_KEY = "keryx.stillsChecked";
const checked = (() => { try { return new Set(JSON.parse(localStorage.getItem(CHECKED_KEY) || "[]")); } catch { return new Set(); } })();
const markChecked = (key) => { checked.add(key); try { localStorage.setItem(CHECKED_KEY, JSON.stringify([...checked].slice(-2000))); } catch { /* no storage: checked again next time */ } };
const stillKey = (m) => `${m.id}|${m.thumbnail_url}`;
const needsCheck = (m) => m?.type === "video" && !m.missing && m.thumbnail_url && String(m.file_url || "").startsWith("http") && !/youtu.?be/.test(m.file_url) && !checked.has(stillKey(m));

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
        // Nothing missing: look for a black still left from before.
        const old = row ? null : rows.find((m) => needsCheck(m));
        if (!row && !old) return undefined;
        const id = setTimeout(() => {
            setBusy(true);
            if (old) {
                markChecked(stillKey(old));
                stillIsDark(old.thumbnail_url)
                    .then((dark) => (dark ? savePoster(old, { again: true }).then((made) => { if (made?.thumbnail_url) markChecked(stillKey(made)); }) : null))
                    .catch((err) => console.warn("[keryx] miniatura:", old.title, err?.message || err))
                    .finally(() => { setBusy(false); setTick((n) => n + 1); });
                return;
            }
            tried.add(`${row.id}|${row.file_url}`);
            savePoster(row)
                .catch((err) => console.warn("[keryx] miniatura:", row.title, err?.message || err))
                .finally(() => { setBusy(false); setTick((n) => n + 1); });
        }, PAUSE_MS);
        return () => clearTimeout(id);
    }, [rows, busy, tick]);
}
