// A Setlist item as a stage: the row it points at, with the item's id in its
// ref (what Pôr na prévia and Enviar ao ar take). Shared by the console and a
// Setlist in a window of its own (PanelPage.jsx, "Painéis em janela").
import { useCallback } from "react";
import { keryx } from "@/api/keryxClient";
import { stageFromSong, stageFromPassage, stageFromMedia, stageFromPiece, stageFromMaterial, stageFromText, stageFromTool } from "@/lib/console/stage";

export function useBuildStage({ serviceId, themes, fitFor }) {
    return useCallback(async (item, index) => {
        const ref = { serviceItemId: item.id, serviceItemIndex: index, serviceId };
        const type = String(item.type || "").toUpperCase();
        if (type === "SECTION") throw new Error(`"${item.title}" é uma seção da setlist.`);
        if (type === "MATERIAL") { const s = stageFromMaterial(await keryx.entities.BibleMaterial.get(item.contentId)); return { ...s, args: { ...s.args, ref: { ...(s.args.ref || {}), ...ref } } }; }
        if (type === "ANNOUNCEMENT" && item.contentId) { const s = stageFromPiece(await keryx.entities.CommunicationVideo.get(item.contentId)); return { ...s, args: { ...s.args, ref } }; }
        if (type === "SONG") return stageFromSong(await keryx.entities.Song.get(item.contentId), ref, themes);
        if (type === "BIBLE") return stageFromPassage(await keryx.entities.BiblePassage.get(item.contentId), ref);
        // A PDF's presentation keeps its own ref (mediaId: the lists mark it on air).
        if (["VIDEO", "IMAGE", "PDF", "POWERPOINT", "AUDIO"].includes(type)) { const s = stageFromMedia(await keryx.entities.Media.get(item.contentId)); return { ...s, args: { ...s.args, ref: { ...(s.args.ref || {}), ...ref } } }; }
        if (type === "TIMER") { const s = stageFromTool("timer", { minutes: Math.max(1, Math.round((item.duration || 300) / 60)) }); return { ...s, args: { ...s.args, ref } }; }
        const s = stageFromText(item.title || "Texto", item.notes || item.title || "", fitFor("text"));
        return { ...s, args: { ...s.args, ref } };
    }, [serviceId, themes, fitFor]);
}
