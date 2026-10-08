import { useEffect } from "react";
import { keryx } from "@/api/keryxClient";
import { projection } from "@/lib/projection";
import { noticeLeft } from "@/lib/console/notice";

// Avisos in a sequence ("Tocar todos"): at the end of each piece an output
// moves the live state on. Several outputs may do it; communication.advance
// ignores a report for a piece that is no longer current.
export function useNoticeAdvance(comm) {
    useEffect(() => {
        if (!keryx.isDesktop || !comm?.playlist) return undefined;
        const left = noticeLeft(comm.item, Math.max(0, keryx.live.now() - comm.startedAt));
        if (left === null) return undefined;
        const index = comm.playlistIndex;
        const id = setTimeout(() => projection.advanceCommunication(index).catch(() => {}), left + 250);
        return () => clearTimeout(id);
    }, [comm?.startedAt, comm?.playlistIndex]); // eslint-disable-line react-hooks/exhaustive-deps
}
