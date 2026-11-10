import { useEffect, useRef } from "react";
import { keryx } from "@/api/keryxClient";
import { downloadToMedia, markYouTubeState } from "@/hooks/useYouTubeJobs";
import { refusedWords, stateOfCode } from "@/lib/youtubeLinks";
import { mediaFromYouTube } from "@/lib/mediaImport";

// An output took a YouTube link off the screens because the player refused
// it (live.refused, owner 2026-10-27, Y4 = A): the console says why, with
// "Baixar para a Mídia", and marks the link's Mídia row so the Mídia, the
// Setlist and a pedido show it before the next service. A link that is no
// Mídia row yet (a pedido's, the search's) is saved there on that click
// first, then downloaded into that row (owner 2026-11-10): nothing enters
// the Mídia by itself. A plain toast
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
        const state = stateOfCode(refused.code);
        const row = (mediaRef.current || []).find((m) => m.file_url === refused.url) || null;
        markYouTubeState(row, state);
        const download = async () => {
            try {
                const target = row || await mediaFromYouTube(refused.url, { title: refused.title || "Vídeo do YouTube", state });
                await downloadToMedia(target, { askText, say: c.say });
            } catch (err) { c.say(err?.message || "Não foi possível baixar."); }
        };
        const canDownload = Boolean(refused.url) && state !== "missing";
        c.say(refusedWords(refused), canDownload ? { label: "Baixar para a Mídia", run: download } : null, { ms: 12000 });
    }, [refused?.at]); // eslint-disable-line react-hooks/exhaustive-deps
}
