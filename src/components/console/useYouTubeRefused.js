import { useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { downloadToMedia, markYouTubeState } from "@/hooks/useYouTubeJobs";
import { refusedWords, stateOfCode } from "@/lib/youtubeLinks";

// An output took a YouTube link off the screens because the player refused
// it (live.refused, owner 2026-10-27, Y4 = A): the console says why, with
// "Baixar para a Mídia" when the link is a Mídia row, and marks that row so
// the Mídia and the Setlist show it before the next service. A plain toast
// held longer, not an important one (those are the Pedidos' and the Chat's:
// owner's S11). Console only, never /Janela.
export function useYouTubeRefused({ c, media, askText }) {
    const refused = c.cur?.refused || null;
    // A refusal from before the console opened (a reload, KERYX reopened) is
    // old news: only the ones after it count. The live state may arrive
    // after the first render, so the mark is the clock, not the first value.
    const seen = useRef(keryx.live.now());
    const mediaRef = useRef(media);
    mediaRef.current = media;
    useEffect(() => {
        if (!refused || !(refused.at > seen.current)) return;
        seen.current = refused.at;
        const row = (mediaRef.current || []).find((m) => m.file_url === refused.url) || null;
        markYouTubeState(row, stateOfCode(refused.code));
        const canDownload = row && stateOfCode(refused.code) !== "missing";
        c.say(refusedWords(refused), canDownload ? { label: "Baixar para a Mídia", run: () => downloadToMedia(row, { askText, say: c.say }) } : null, { ms: 12000 });
    }, [refused?.at]); // eslint-disable-line react-hooks/exhaustive-deps
}
