import { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";

// What an output drew before a change, kept while it fades out (Transições,
// src/lib/exitFade.js). `view` is what the component draws now and `rev` the
// live document's rev (a change); `msOf(prev, view)` says how long the
// previous view fades (0: a cut). Returns { from, ms, at, until, key } while
// it fades — `from` the previous view, at/until on the live clock (for the
// volume of what still plays) — else null.
//
// Worked out during the render (React's "state from the previous render"),
// so the old view is drawn in the same commit that takes it off: a video
// moves from the player that lets it go to the ghost's without a gap
// (src/lib/mediaPool.js).
export function useExitGhost(view, rev, msOf, enabled = true) {
    const [track, setTrack] = useState(() => ({ rev, prev: view, ghost: null }));
    let ghost = track.ghost;
    if (rev !== track.rev) {
        const ms = enabled ? msOf(track.prev, view) : 0;
        if (ms > 0) {
            const at = keryx.live.now();
            ghost = { from: track.prev, ms, at, until: at + ms, key: `${track.rev}>${rev}` };
        }
        setTrack({ rev, prev: view, ghost });
    }
    useEffect(() => {
        const g = track.ghost;
        if (!g) return undefined;
        const id = setTimeout(() => setTrack((t) => (t.ghost === g ? { ...t, ghost: null } : t)), g.ms + 50);
        return () => clearTimeout(id);
    }, [track.ghost]);
    return ghost;
}
