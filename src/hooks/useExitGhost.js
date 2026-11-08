import { useEffect, useState } from "react";
import { keryx } from "@/api/keryxClient";
import { ghostStart, ghostTrack } from "@/lib/exitFade";

// What an output drew before a change, kept while it fades out (Transições,
// src/lib/exitFade.js). `view` is what the component draws now and `rev` the
// live document's rev (a change); `msOf(prev, view)` says how long the
// previous view fades (0: a cut). Returns { from, ms, at, until, key } while
// it fades — `from` the previous view, at/until on the live clock (for the
// volume of what still plays) — else null. Changes that arrive together
// (the Fundo, then the text) fade once, from the screen before the first
// (ghostTrack, Rodada G5).
//
// Worked out during the render (React's "state from the previous render"),
// so the old view is drawn in the same commit that takes it off: a video
// moves from the player that lets it go to the ghost's without a gap
// (src/lib/mediaPool.js).
export function useExitGhost(view, rev, msOf, enabled = true) {
    const [track, setTrack] = useState(() => ghostStart(view, rev));
    let cur = track;
    if (rev !== track.rev) {
        cur = ghostTrack(track, view, rev, msOf, keryx.live.now(), enabled);
        setTrack(cur);
    }
    useEffect(() => {
        const g = track.ghost;
        if (!g) return undefined;
        const id = setTimeout(() => setTrack((t) => (t.ghost === g ? { ...t, ghost: null } : t)), Math.max(0, g.until - keryx.live.now()) + 50);
        return () => clearTimeout(id);
    }, [track.ghost]);
    return cur.ghost;
}
